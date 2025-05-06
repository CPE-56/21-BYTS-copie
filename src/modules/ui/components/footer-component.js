/**
 * @fileoverview Composant de pied de page (footer) pour l'application 21 BYTS
 *
 * Ce module gère le bandeau inférieur de l'application qui contient:
 * - Bouton Réglages (accès aux paramètres de l'application)
 * - Bouton Effacer terminés (supprime les téléchargements réussis de la liste)
 * - Bouton Ajouter à la bibliothèque (import vers l'application musicale de l'OS)
 * - Bouton Aide (documentation intégrée et FAQ)
 *
 * @module modules/ui/components/footer-component
 *
 * @events
 * ÉCOUTÉS:
 * - EVENT_APP_INITIALIZED: Initialise le composant au démarrage de l'application
 * - EVENT_CONFIG_UPDATED: Met à jour l'affichage si la configuration change
 * - EVENT_THEME_CHANGED: Met à jour l'apparence selon le thème choisi
 * - EVENT_DOWNLOADS_UPDATED: Met à jour l'état des boutons selon l'état des téléchargements
 *
 * ÉMIS:
 * - EVENT_SETTINGS_REQUESTED: Demande l'ouverture du panneau de paramètres
 * - EVENT_CLEAR_COMPLETED_DOWNLOADS: Demande la suppression des téléchargements terminés
 * - EVENT_ADD_TO_LIBRARY_REQUESTED: Demande l'ajout des fichiers à la bibliothèque
 * - EVENT_HELP_REQUESTED: Demande l'affichage de l'aide/documentation
 * - EVENT_UI_ERROR: Signale une erreur dans le composant footer
 */

// Utilisation stricte du JavaScript pour éviter les erreurs courantes
'use strict';

/**
 * Initialise le composant de pied de page
 * Cette fonction est appelée quand le bus d'événements est disponible
 *
 * @param {Object} eventBus - Le bus d'événements de l'application
 */
function initFooterComponent(eventBus) {
  // Validation du paramètre pour éviter les erreurs
  if (!eventBus) {
    console.error("FooterComponent: Le bus d'événements est requis");
    return;
  }

  // Référence aux types d'événements (normalement importés via constants)
  // Utilisation de constantes locales pour respecter l'indépendance du module
  const EVENT_TYPES = {
    // Événements écoutés
    APP_INITIALIZED: 'app:initialized',
    CONFIG_UPDATED: 'config:updated',
    THEME_CHANGED: 'ui:theme:changed',
    DOWNLOADS_UPDATED: 'downloads:status:updated',

    // Événements émis
    SETTINGS_REQUESTED: 'settings:panel:requested',
    CLEAR_COMPLETED_DOWNLOADS: 'downloads:clear:completed',
    ADD_TO_LIBRARY_REQUESTED: 'library:add:requested',
    HELP_REQUESTED: 'help:documentation:requested',
    UI_ERROR: 'ui:error'
  };

  // État local du composant
  let state = {
    theme: 'dark', // Thème par défaut
    hasCompletedDownloads: false, // Si des téléchargements sont terminés
    hasDownloadedFiles: false, // Si des fichiers ont été téléchargés
    footerElement: null, // Référence à l'élément DOM du footer
    buttons: {
      settings: null,
      clearCompleted: null,
      addToLibrary: null,
      help: null
    }
  };

  /**
   * Crée et rend le composant de pied de page dans le DOM
   * @private
   */
  function renderFooter() {
    try {
      // Création de l'élément footer s'il n'existe pas déjà
      if (!state.footerElement) {
        state.footerElement = document.createElement('div');
        state.footerElement.id = 'app-footer';
        state.footerElement.className = `footer-container theme-${state.theme}`;

        // Ajout du footer au conteneur principal (via événement)
        eventBus.publish(EVENT_TYPES.UI_COMPONENT_READY, {
          componentId: 'footer',
          element: state.footerElement
        });
      }

      // Vider le contenu existant pour éviter les doublons
      state.footerElement.innerHTML = '';

      // Création des boutons du footer
      createFooterButtons();

      // Mettre à jour l'état des boutons
      updateButtonStates();
    } catch (error) {
      handleError('Erreur lors du rendu du footer', error);
    }
  }

  /**
   * Crée les quatre boutons du pied de page
   * @private
   */
  function createFooterButtons() {
    try {
      // Bouton Réglages
      state.buttons.settings = createButton('settings-button', 'Réglages', handleSettingsClick);

      // Bouton Effacer terminés
      state.buttons.clearCompleted = createButton(
        'clear-completed-button',
        'Effacer terminés',
        handleClearCompletedClick
      );

      // Bouton Ajouter à la bibliothèque
      state.buttons.addToLibrary = createButton(
        'add-to-library-button',
        'Ajouter à la bibliothèque',
        handleAddToLibraryClick
      );

      // Bouton Aide
      state.buttons.help = createButton('help-button', 'Aide', handleHelpClick);

      // Ajouter tous les boutons au footer
      Object.values(state.buttons).forEach((button) => {
        state.footerElement.appendChild(button);
      });
    } catch (error) {
      handleError('Erreur lors de la création des boutons du footer', error);
    }
  }

  /**
   * Utilitaire pour créer un bouton avec un style et un gestionnaire d'événements
   * @private
   * @param {string} id - Identifiant unique du bouton
   * @param {string} text - Texte à afficher sur le bouton
   * @param {Function} clickHandler - Fonction à exécuter au clic
   * @returns {HTMLElement} Le bouton créé
   */
  function createButton(id, text, clickHandler) {
    const button = document.createElement('button');
    button.id = id;
    button.className = 'footer-button';
    button.textContent = text;
    button.addEventListener('click', clickHandler);
    return button;
  }

  /**
   * Met à jour l'état d'activation des boutons selon l'état de l'application
   * @private
   */
  function updateButtonStates() {
    try {
      // Activer/désactiver le bouton "Effacer terminés"
      state.buttons.clearCompleted.disabled = !state.hasCompletedDownloads;

      // Activer/désactiver le bouton "Ajouter à la bibliothèque"
      state.buttons.addToLibrary.disabled = !state.hasDownloadedFiles;

      // Mettre à jour les classes pour le style
      Object.values(state.buttons).forEach((button) => {
        if (button.disabled) {
          button.classList.add('button-disabled');
          button.classList.remove('button-enabled');
        } else {
          button.classList.add('button-enabled');
          button.classList.remove('button-disabled');
        }
      });
    } catch (error) {
      handleError('Erreur lors de la mise à jour des états des boutons', error);
    }
  }

  /**
   * Gestionnaire pour le clic sur le bouton Réglages
   * @private
   * @param {Event} event - L'événement de clic
   */
  function handleSettingsClick(event) {
    event.preventDefault();
    try {
      eventBus.publish(EVENT_TYPES.SETTINGS_REQUESTED, {
        source: 'footer'
      });
    } catch (error) {
      handleError("Erreur lors de l'ouverture des réglages", error);
    }
  }

  /**
   * Gestionnaire pour le clic sur le bouton Effacer terminés
   * @private
   * @param {Event} event - L'événement de clic
   */
  function handleClearCompletedClick(event) {
    event.preventDefault();
    try {
      if (state.hasCompletedDownloads) {
        eventBus.publish(EVENT_TYPES.CLEAR_COMPLETED_DOWNLOADS, {
          source: 'footer'
        });
      }
    } catch (error) {
      handleError('Erreur lors de la suppression des téléchargements terminés', error);
    }
  }

  /**
   * Gestionnaire pour le clic sur le bouton Ajouter à la bibliothèque
   * @private
   * @param {Event} event - L'événement de clic
   */
  function handleAddToLibraryClick(event) {
    event.preventDefault();
    try {
      if (state.hasDownloadedFiles) {
        eventBus.publish(EVENT_TYPES.ADD_TO_LIBRARY_REQUESTED, {
          source: 'footer'
        });
      }
    } catch (error) {
      handleError("Erreur lors de l'ajout à la bibliothèque", error);
    }
  }

  /**
   * Gestionnaire pour le clic sur le bouton Aide
   * @private
   * @param {Event} event - L'événement de clic
   */
  function handleHelpClick(event) {
    event.preventDefault();
    try {
      eventBus.publish(EVENT_TYPES.HELP_REQUESTED, {
        source: 'footer'
      });
    } catch (error) {
      handleError("Erreur lors de l'affichage de l'aide", error);
    }
  }

  /**
   * Gestionnaire pour les mises à jour de configuration
   * @private
   * @param {Object} configData - Les données de configuration mises à jour
   */
  function handleConfigUpdate(configData) {
    try {
      // Mise à jour du thème si nécessaire
      if (configData && configData.ui && configData.ui.theme) {
        updateTheme(configData.ui.theme);
      }
    } catch (error) {
      handleError('Erreur lors de la mise à jour de la configuration', error);
    }
  }

  /**
   * Met à jour le thème du footer
   * @private
   * @param {string} newTheme - Le nouveau thème à appliquer
   */
  function updateTheme(newTheme) {
    try {
      if (newTheme && newTheme !== state.theme) {
        state.theme = newTheme;

        // Mettre à jour la classe du footer
        if (state.footerElement) {
          state.footerElement.className = `footer-container theme-${state.theme}`;
        }
      }
    } catch (error) {
      handleError('Erreur lors de la mise à jour du thème', error);
    }
  }

  /**
   * Met à jour l'état des téléchargements pour activer/désactiver les boutons
   * @private
   * @param {Object} downloadStatus - Statut actuel des téléchargements
   */
  function updateDownloadStatus(downloadStatus) {
    try {
      if (downloadStatus) {
        // Mettre à jour les indicateurs d'état
        state.hasCompletedDownloads = !!downloadStatus.completedCount;
        state.hasDownloadedFiles = !!downloadStatus.successfulCount;

        // Mettre à jour l'interface
        updateButtonStates();
      }
    } catch (error) {
      handleError('Erreur lors de la mise à jour du statut des téléchargements', error);
    }
  }

  /**
   * Gère les erreurs du composant et les publie sur le bus d'événements
   * @private
   * @param {string} message - Message d'erreur
   * @param {Error} [error] - Objet d'erreur facultatif
   */
  function handleError(message, error) {
    console.error(`FooterComponent: ${message}`, error);

    // Publier l'erreur sur le bus d'événements
    try {
      eventBus.publish(EVENT_TYPES.UI_ERROR, {
        source: 'footer-component',
        message: message,
        details: error ? error.toString() : undefined,
        timestamp: new Date().toISOString()
      });
    } catch (e) {
      // Éviter les boucles infinies si l'événement échoue
      console.error("FooterComponent: Impossible de publier l'erreur sur le bus d'événements", e);
    }
  }

  // S'abonner aux événements
  function subscribeToEvents() {
    try {
      eventBus.subscribe(EVENT_TYPES.APP_INITIALIZED, () => {
        renderFooter();
      });

      eventBus.subscribe(EVENT_TYPES.CONFIG_UPDATED, (configData) => {
        handleConfigUpdate(configData);
      });

      eventBus.subscribe(EVENT_TYPES.THEME_CHANGED, (themeData) => {
        updateTheme(themeData.theme);
      });

      eventBus.subscribe(EVENT_TYPES.DOWNLOADS_UPDATED, (downloadStatus) => {
        updateDownloadStatus(downloadStatus);
      });
    } catch (error) {
      handleError("Erreur lors de l'abonnement aux événements", error);
    }
  }

  // Initialisation: s'abonner aux événements
  subscribeToEvents();

  // API publique du module (interface exposée)
  return {
    // Aucune méthode n'est exposée directement
    // Toutes les interactions se font via le bus d'événements
  };
}

// Exporte seulement la fonction d'initialisation
// Le composant sera initialisé lorsque le bus d'événements sera disponible
module.exports = initFooterComponent;

/**
 * Exemple d'utilisation:
 *
 * Dans main.js ou un autre point d'initialisation:
 *
 * ```javascript
 * // Importer le bus d'événements
 * const eventBus = require('./core/event-bus');
 *
 * // Importer le composant footer
 * const initFooterComponent = require('./modules/ui/components/footer-component');
 *
 * // Initialiser le composant en lui passant le bus d'événements
 * initFooterComponent(eventBus);
 *
 * // Le composant s'inscrira aux événements et réagira en conséquence
 * // Aucune référence directe au composant n'est nécessaire après initialisation
 * ```
 */ // Composant de pied de page
// Créé automatiquement le 2025-05-02
