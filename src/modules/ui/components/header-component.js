/**
 * @fileoverview Composant d'en-tête pour le téléchargeur audio 21 BYTS
 *
 * Ce module gère l'affichage et le comportement de la barre supérieure de l'application,
 * incluant le logo, la zone de saisie d'URL et les boutons d'action principaux.
 * Il fonctionne de manière autonome en utilisant uniquement l'architecture événementielle.
 *
 * @module ui/components/header-component
 *
 * @events écoutés:
 *   - APP:INITIALIZED - Déclenché lorsque l'application est prête
 *   - UI:READY - Déclenché lorsque l'interface est chargée
 *   - UI:THEME_CHANGED - Déclenché lorsque le thème est modifié
 *   - DOWNLOAD:STATE_CHANGED - Déclenché lorsque l'état des téléchargements change
 *   - DOWNLOAD:ALL_COMPLETED - Déclenché lorsque tous les téléchargements sont terminés
 *
 * @events émis:
 *   - URL:ADDED - Émis lorsqu'une nouvelle URL est ajoutée
 *   - URL:PASTE_REQUESTED - Émis lorsque l'utilisateur clique sur le bouton "Coller URL"
 *   - DOWNLOAD:START_ALL - Émis lorsque l'utilisateur clique sur "Télécharger tout"
 *   - UI:HEADER_LOADED - Émis lorsque le composant d'en-tête est chargé
 *   - ERROR:UI_HEADER - Émis en cas d'erreur dans le composant d'en-tête
 */

(function () {
  'use strict';

  // Références locales aux éléments DOM
  let headerElement;
  let pasteButton;
  let startAllButton;
  let urlInput;
  let logoElement;

  // Configuration par défaut
  const DEFAULT_CONFIG = {
    maxPlaylistSize: 200,
    urlInputPlaceholder: 'Collez une URL audio ou vidéo ici...',
    buttonTooltips: {
      paste: 'Coller depuis le presse-papiers',
      startAll: 'Télécharger tous les éléments'
    }
  };

  // Configuration locale
  let config = { ...DEFAULT_CONFIG };

  /**
   * Initialise le composant d'en-tête et s'abonne aux événements nécessaires
   * @param {Object} eventBus - Instance du bus d'événements central
   */
  function initialize(eventBus) {
    if (!eventBus) {
      console.error("HeaderComponent: Bus d'événements non fourni");
      return;
    }

    // S'abonner aux événements
    eventBus.subscribe('APP:INITIALIZED', handleAppInitialized);
    eventBus.subscribe('UI:READY', handleUIReady);
    eventBus.subscribe('UI:THEME_CHANGED', handleThemeChanged);
    eventBus.subscribe('DOWNLOAD:STATE_CHANGED', updateDownloadButtonState);
    eventBus.subscribe('DOWNLOAD:ALL_COMPLETED', resetHeaderState);

    // Émettre un événement pour demander la configuration
    eventBus.publish('CONFIG:REQUEST', {
      module: 'header-component',
      keys: ['maxPlaylistSize', 'headerStrings']
    });

    // S'abonner à la réponse de configuration
    eventBus.subscribe('CONFIG:RESPONSE', handleConfigResponse);

    // Exposer l'API publique
    return {
      // Aucune méthode publique nécessaire puisque toute interaction
      // se fait via le bus d'événements
    };
  }

  /**
   * Gère la notification d'initialisation de l'application
   * @param {Object} data - Données de l'événement
   * @param {Object} eventBus - Instance du bus d'événements central
   */
  function handleAppInitialized(data, eventBus) {
    try {
      createHeaderElements(eventBus);
      eventBus.publish('UI:HEADER_LOADED', { success: true });
    } catch (error) {
      eventBus.publish('ERROR:UI_HEADER', {
        message: "Échec de l'initialisation du composant d'en-tête",
        details: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Gère l'événement UI prêt
   * @param {Object} data - Données de l'événement
   * @param {Object} eventBus - Instance du bus d'événements central
   */
  function handleUIReady(data, eventBus) {
    try {
      // Récupérer les éléments du DOM
      headerElement = document.getElementById('app-header');

      if (!headerElement) {
        throw new Error("Élément d'en-tête introuvable dans le DOM");
      }

      // Rendre le composant dans le conteneur approprié
      renderHeader(headerElement, eventBus);
    } catch (error) {
      eventBus.publish('ERROR:UI_HEADER', {
        message: "Échec du rendu du composant d'en-tête",
        details: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Gère la réponse de configuration
   * @param {Object} data - Données de configuration
   */
  function handleConfigResponse(data) {
    // Mettre à jour la configuration locale avec les valeurs reçues
    if (data && data.module === 'header-component') {
      if (data.config && data.config.maxPlaylistSize) {
        config.maxPlaylistSize = data.config.maxPlaylistSize;
      }

      if (data.config && data.config.headerStrings) {
        if (data.config.headerStrings.urlInputPlaceholder) {
          config.urlInputPlaceholder = data.config.headerStrings.urlInputPlaceholder;
        }

        if (data.config.headerStrings.buttonTooltips) {
          config.buttonTooltips = {
            ...config.buttonTooltips,
            ...data.config.headerStrings.buttonTooltips
          };
        }
      }

      // Mettre à jour l'interface avec la nouvelle configuration
      updateUIWithConfig();
    }
  }

  /**
   * Met à jour l'interface avec la configuration
   */
  function updateUIWithConfig() {
    if (urlInput) {
      urlInput.placeholder = config.urlInputPlaceholder;
    }

    if (pasteButton) {
      pasteButton.title = config.buttonTooltips.paste;
    }

    if (startAllButton) {
      startAllButton.title = config.buttonTooltips.startAll;
    }
  }

  /**
   * Gère le changement de thème
   * @param {Object} data - Données du thème
   */
  function handleThemeChanged(data) {
    if (!headerElement) return;

    // Appliquer le thème à l'en-tête
    if (data && data.theme) {
      // Supprimer les classes de thèmes précédentes
      headerElement.classList.remove('theme-light', 'theme-dark', 'theme-custom');

      // Ajouter la nouvelle classe de thème
      headerElement.classList.add(`theme-${data.theme}`);

      // Appliquer des couleurs personnalisées si fournies
      if (data.colors && data.colors.header) {
        headerElement.style.backgroundColor = data.colors.header.background || '';
        headerElement.style.color = data.colors.header.text || '';
      }
    }
  }

  /**
   * Crée les éléments d'en-tête
   * @param {Object} eventBus - Instance du bus d'événements central
   */
  function createHeaderElements(eventBus) {
    // Cette fonction serait appelée lors de l'initialisation
    // du composant, avant que l'élément parent soit disponible.
    // Elle peut être utilisée pour préparer les éléments.
  }

  /**
   * Rend l'en-tête dans le conteneur fourni
   * @param {HTMLElement} container - Élément conteneur
   * @param {Object} eventBus - Instance du bus d'événements central
   */
  function renderHeader(container, eventBus) {
    // Créer le contenu HTML pour l'en-tête
    container.innerHTML = `
            <div class="header-left">
                <div id="app-logo" class="app-logo">
                    <span class="logo-text">21 BYTS</span>
                </div>
            </div>
            <div class="header-center">
                <div class="url-input-container">
                    <input type="text" id="url-input" placeholder="${config.urlInputPlaceholder}" />
                </div>
            </div>
            <div class="header-right">
                <button id="paste-url-btn" title="${config.buttonTooltips.paste}" class="header-button">
                    <i class="icon-paste"></i>
                    <span>Coller URL</span>
                </button>
                <button id="start-all-btn" title="${config.buttonTooltips.startAll}" class="header-button">
                    <i class="icon-download-all"></i>
                    <span>Tout télécharger</span>
                </button>
            </div>
        `;

    // Récupérer les références aux éléments créés
    logoElement = container.querySelector('#app-logo');
    urlInput = container.querySelector('#url-input');
    pasteButton = container.querySelector('#paste-url-btn');
    startAllButton = container.querySelector('#start-all-btn');

    // Attacher les gestionnaires d'événements
    attachEventListeners(eventBus);
  }

  /**
   * Attache les écouteurs d'événements aux éléments de l'en-tête
   * @param {Object} eventBus - Instance du bus d'événements central
   */
  function attachEventListeners(eventBus) {
    // Écouteur pour le bouton Coller URL
    pasteButton.addEventListener('click', () => {
      try {
        eventBus.publish('URL:PASTE_REQUESTED', {});
        // La logique de collage réelle sera gérée par un autre module
        // qui réagira à cet événement
      } catch (error) {
        eventBus.publish('ERROR:UI_HEADER', {
          message: "Erreur lors de la demande de collage d'URL",
          details: error.message,
          stack: error.stack
        });
      }
    });

    // Écouteur pour le bouton Télécharger tout
    startAllButton.addEventListener('click', () => {
      try {
        eventBus.publish('DOWNLOAD:START_ALL', {});
      } catch (error) {
        eventBus.publish('ERROR:UI_HEADER', {
          message: 'Erreur lors du démarrage de tous les téléchargements',
          details: error.message,
          stack: error.stack
        });
      }
    });

    // Écouteur pour la saisie d'URL (sur la touche Entrée)
    urlInput.addEventListener('keypress', (event) => {
      if (event.key === 'Enter' && urlInput.value.trim()) {
        try {
          const url = urlInput.value.trim();
          processNewUrl(url, eventBus);
          urlInput.value = ''; // Réinitialiser le champ après soumission
        } catch (error) {
          eventBus.publish('ERROR:UI_HEADER', {
            message: "Erreur lors du traitement de l'URL",
            details: error.message,
            stack: error.stack
          });
        }
      }
    });

    // Écouteur pour le clic sur le logo (peut être utilisé pour afficher À propos)
    logoElement.addEventListener('click', () => {
      eventBus.publish('UI:ABOUT_REQUESTED', {});
    });
  }

  /**
   * Traite une nouvelle URL saisie
   * @param {string} url - L'URL à traiter
   * @param {Object} eventBus - Instance du bus d'événements central
   */
  function processNewUrl(url, eventBus) {
    if (!url) return;

    // Publier l'événement d'ajout d'URL
    eventBus.publish('URL:ADDED', {
      url: url,
      timestamp: Date.now(),
      maxPlaylistSize: config.maxPlaylistSize
    });
  }

  /**
   * Met à jour l'état du bouton de téléchargement en fonction de l'état global
   * @param {Object} data - Données d'état des téléchargements
   */
  function updateDownloadButtonState(data) {
    if (!startAllButton) return;

    // Activer/désactiver le bouton en fonction de l'état
    if (data && typeof data.hasActiveDownloads === 'boolean') {
      startAllButton.disabled = data.hasActiveDownloads;
      startAllButton.classList.toggle('active', !data.hasActiveDownloads);

      // Mettre à jour éventuellement le texte/icône du bouton
      const buttonText = startAllButton.querySelector('span');
      if (buttonText) {
        buttonText.textContent = data.hasActiveDownloads ? 'En cours...' : 'Tout télécharger';
      }
    }
  }

  /**
   * Réinitialise l'état de l'en-tête après la fin de tous les téléchargements
   */
  function resetHeaderState() {
    if (startAllButton) {
      startAllButton.disabled = false;
      startAllButton.classList.remove('active');

      const buttonText = startAllButton.querySelector('span');
      if (buttonText) {
        buttonText.textContent = 'Tout télécharger';
      }
    }

    if (urlInput) {
      urlInput.focus(); // Repositionne le focus sur le champ URL
    }
  }

  // Exposer l'initialisation comme seul point d'entrée public
  window.HeaderComponent = {
    initialize: initialize
  };
})();

/**
 * Exemples d'utilisation:
 *
 * // Initialisation du composant
 * const headerComponent = window.HeaderComponent.initialize(eventBus);
 *
 * // Interaction typique:
 * // 1. L'application démarre et émet APP:INITIALIZED
 * // 2. L'interface utilisateur charge et émet UI:READY
 * // 3. Le composant d'en-tête se rend et émet UI:HEADER_LOADED
 * // 4. L'utilisateur saisit une URL et appuie sur Entrée
 * // 5. Le composant émet URL:ADDED avec l'URL
 * // 6. L'utilisateur clique sur "Tout télécharger"
 * // 7. Le composant émet DOWNLOAD:START_ALL
 * // 8. D'autres modules traitent ces événements
 */ // Composant d'en-tête
// Créé automatiquement le 2025-05-02
