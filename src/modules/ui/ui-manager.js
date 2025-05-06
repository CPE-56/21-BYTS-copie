/**
 * Gère l'événement de mise à jour des métadonnées
 *
 * @param {Object} data - Données des métadonnées
 * @returns {void}
 * @private
 */
function handleMetadataUpdated(data) {
  try {
    const { id, metadata } = data;
    if (!id || !state.downloadItems.has(id) || !metadata) return;

    // Mettre à jour l'état local
    const downloadItem = state.downloadItems.get(id);
    if (downloadItem) {
      downloadItem.metadata = metadata;
      state.downloadItems.set(id, downloadItem);
    }

    // Mettre à jour l'élément UI
    const element = document.getElementById(id);
    if (!element) return;

    // Mettre à jour les informations affichées
    const titleElement = element.querySelector('.download-title');
    if (titleElement && metadata.title) {
      titleElement.textContent = metadata.title;
    }

    const artistElement = element.querySelector('.download-artist');
    if (artistElement && metadata.artist) {
      artistElement.textContent = metadata.artist;
      artistElement.classList.remove('error-text');
    }

    const albumElement = element.querySelector('.download-album');
    if (albumElement && metadata.album) {
      albumElement.textContent = metadata.album;
      albumElement.classList.remove('error-text');
    }

    // Si une image est disponible, mettre à jour la miniature
    if (metadata.thumbnailUrl) {
      const thumbnail = element.querySelector('.download-thumbnail');
      if (thumbnail) {
        // Supprimer l'icône existante
        const existingIcon = thumbnail.querySelector('.platform-icon');
        if (existingIcon) {
          existingIcon.remove();
        }

        // Créer et ajouter l'image
        const img = document.createElement('img');
        img.src = metadata.thumbnailUrl;
        img.alt = metadata.title || 'Miniature';
        img.className = 'thumbnail-image';
        thumbnail.appendChild(img);
      }
    }

    console.log(`UI Manager: Métadonnées mises à jour pour ${id}`);
  } catch (error) {
    handleUIError('Mise à jour des métadonnées', error);
  }
}

/**
 * Gère l'événement de changement de statut d'authentification
 *
 * @param {Object} data - Données de statut d'authentification
 * @returns {void}
 * @private
 */
function handleAuthStatusChanged(data) {
  try {
    const { service, status, username } = data;

    console.log(`UI Manager: Statut d'authentification ${service} changé: ${status}`);

    // Afficher une notification appropriée
    if (status === 'authenticated') {
      showNotification(
        `Connecté à ${service}${username ? ` en tant que ${username}` : ''}`,
        'success'
      );
    } else if (status === 'authentication_required') {
      showNotification(`Authentification requise pour ${service}`, 'warning');
    } else if (status === 'authentication_failed') {
      showNotification(`Échec de l'authentification à ${service}`, 'error');
    }
  } catch (error) {
    handleUIError("Gestion du changement de statut d'authentification", error);
  }
}

/**
 * Gère l'événement de mise à jour de la configuration
 *
 * @param {Object} config - Nouvelle configuration
 * @returns {void}
 * @private
 */
function handleConfigUpdated(config) {
  try {
    if (!config) return;

    // Mettre à jour le thème si nécessaire
    if (config.theme && config.theme !== state.theme) {
      state.theme = config.theme;
      applyTheme(state.theme);
    }

    // Mettre à jour le format par défaut si nécessaire
    if (config.defaultFormat && config.defaultFormat !== state.selectedFormat) {
      state.selectedFormat = config.defaultFormat;
    }

    // Autres mises à jour de configuration...

    console.log('UI Manager: Configuration mise à jour');
  } catch (error) {
    handleUIError('Mise à jour de la configuration', error);
  }
}

/**
 * Gère l'événement d'erreur système
 *
 * @param {Object} data - Données d'erreur
 * @returns {void}
 * @private
 */
function handleSystemError(data) {
  try {
    const { source, error, level = 'error' } = data;

    // Journaliser l'erreur
    console.error(`UI Manager: Erreur système depuis ${source}:`, error);

    // Afficher une notification si l'erreur est critique
    if (level === 'critical' || level === 'error') {
      showNotification(`Erreur système: ${error.message || 'Erreur inconnue'}`, 'error');
    }
  } catch (error) {
    handleUIError("Gestion d'erreur système", error);
  }
}

/**
 * Gère l'événement de détection de playlist
 *
 * @param {Object} data - Données de la playlist
 * @returns {void}
 * @private
 */
function handlePlaylistDetected(data) {
  try {
    const { url, trackCount, playlistName, id } = data;

    // Vérifier si le nombre de titres dépasse la limite
    const maxTracks = 200;
    const limitExceeded = trackCount > maxTracks;

    // Créer la boîte de dialogue de confirmation
    const dialog = document.createElement('div');
    dialog.className = 'playlist-dialog';

    const header = document.createElement('h3');
    header.textContent = 'Playlist détectée';
    dialog.appendChild(header);

    const content = document.createElement('p');
    content.textContent = `"${playlistName || 'Playlist sans nom'}" contient ${trackCount} titres.`;
    dialog.appendChild(content);

    // Avertissement si le nombre de titres dépasse la limite
    if (limitExceeded) {
      const warning = document.createElement('p');
      warning.className = 'playlist-warning';
      warning.textContent = `Seuls les ${maxTracks} premiers titres seront téléchargés.`;
      dialog.appendChild(warning);
    }

    // Options
    const options = document.createElement('div');
    options.className = 'dialog-options';

    // Bouton pour télécharger la playlist complète
    const downloadAllButton = document.createElement('button');
    downloadAllButton.className = 'dialog-button primary';
    downloadAllButton.textContent = 'Télécharger la playlist';
    downloadAllButton.addEventListener('click', () => {
      closeDialog();
      handlePlaylistDecision(id, url, 'all', limitExceeded ? maxTracks : trackCount);
    });
    options.appendChild(downloadAllButton);

    // Bouton pour télécharger uniquement le titre actuel
    const downloadCurrentButton = document.createElement('button');
    downloadCurrentButton.className = 'dialog-button secondary';
    downloadCurrentButton.textContent = 'Télécharger uniquement ce titre';
    downloadCurrentButton.addEventListener('click', () => {
      closeDialog();
      handlePlaylistDecision(id, url, 'single', 1);
    });
    options.appendChild(downloadCurrentButton);

    // Bouton pour annuler
    const cancelButton = document.createElement('button');
    cancelButton.className = 'dialog-button tertiary';
    cancelButton.textContent = 'Annuler';
    cancelButton.addEventListener('click', () => {
      closeDialog();
      handlePlaylistDecision(id, url, 'cancel', 0);
    });
    options.appendChild(cancelButton);

    dialog.appendChild(options);

    // Fonction pour fermer la boîte de dialogue
    function closeDialog() {
      document.body.removeChild(dialog);
      document.body.removeChild(overlay);
    }

    // Créer un overlay pour flouter l'arrière-plan
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';

    // Ajouter au DOM
    document.body.appendChild(overlay);
    document.body.appendChild(dialog);

    console.log(`UI Manager: Playlist détectée avec ${trackCount} titres`);
  } catch (error) {
    handleUIError('Gestion de détection de playlist', error);
  }
}

/**
 * Gère la décision de l'utilisateur concernant une playlist
 *
 * @param {string} id - ID du téléchargement associé
 * @param {string} url - URL de la playlist
 * @param {string} decision - Décision ('all', 'single', 'cancel')
 * @param {number} trackCount - Nombre de titres à télécharger
 * @returns {void}
 * @private
 */
function handlePlaylistDecision(id, url, decision, trackCount) {
  try {
    // Publier l'événement de décision
    state.eventBus.publish('UI:PLAYLIST_DECISION', {
      id,
      url,
      decision,
      trackCount,
      timestamp: Date.now()
    });

    // Mettre à jour l'interface selon la décision
    switch (decision) {
      case 'all':
        // Notifier l'utilisateur
        showNotification(`Téléchargement de ${trackCount} titres démarré`, 'info');
        break;
      case 'single':
        // Continuer normalement, un seul titre
        showNotification('Téléchargement du titre démarré', 'info');
        break;
      case 'cancel':
        // Supprimer l'élément de téléchargement
        removeDownloadItem(id);
        break;
    }

    console.log(`UI Manager: Décision playlist pour ${id}: ${decision} (${trackCount} titres)`);
  } catch (error) {
    handleUIError('Gestion de décision playlist', error);
  }
}

/**
 * Supprime un élément de téléchargement de l'interface et de l'état
 *
 * @param {string} id - ID du téléchargement à supprimer
 * @returns {void}
 * @private
 */
function removeDownloadItem(id) {
  try {
    // Supprimer de l'UI
    const element = document.getElementById(id);
    if (element) {
      element.remove();
    }

    // Supprimer de l'état
    state.downloadItems.delete(id);

    // Afficher le message "vide" si aucun téléchargement restant
    if (state.downloadItems.size === 0) {
      const emptyMessage = document.getElementById('empty-message');
      if (emptyMessage) {
        emptyMessage.style.display = 'block';
      }
    }

    console.log(`UI Manager: Élément de téléchargement ${id} supprimé`);
  } catch (error) {
    handleUIError("Suppression d'élément de téléchargement", error);
  }
}

/**
 * Applique un thème à l'interface utilisateur
 *
 * @param {string} theme - Nom du thème ('dark', 'light', etc.)
 * @returns {void}
 * @private
 */
function applyTheme(theme) {
  try {
    // Mettre à jour la classe du body
    document.body.className = `theme-${theme}`;

    // Mettre à jour l'état
    state.theme = theme;

    // Publier l'événement de changement de thème
    state.eventBus.publish('UI:THEME_CHANGED', {
      theme,
      timestamp: Date.now()
    });

    console.log(`UI Manager: Thème ${theme} appliqué`);
  } catch (error) {
    handleUIError('Application du thème', error);
  }
}

/**
 * Affiche une notification à l'utilisateur
 *
 * @param {string} message - Message à afficher
 * @param {string} type - Type de notification ('info', 'success', 'warning', 'error')
 * @param {number} [duration=3000] - Durée d'affichage en ms
 * @returns {void}
 * @private
 */
function showNotification(message, type = 'info', duration = 3000) {
  try {
    // Créer l'élément de notification
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    // Ajouter au conteneur de notifications (le créer s'il n'existe pas)
    let container = document.getElementById('notification-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'notification-container';
      container.className = 'notification-container';
      document.body.appendChild(container);
    }

    // Ajouter la notification
    container.appendChild(notification);

    // Animation d'entrée
    setTimeout(() => {
      notification.classList.add('show');
    }, 10);

    // Programmer la suppression
    setTimeout(() => {
      // Animation de sortie
      notification.classList.remove('show');
      notification.classList.add('hide');

      // Supprimer après l'animation
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, duration);
  } catch (error) {
    console.error("UI Manager: Erreur lors de l'affichage de la notification:", error);
  }
}

/**
 * Gère les erreurs de l'interface utilisateur
 *
 * @param {string} context - Contexte de l'erreur
 * @param {Error} error - Objet d'erreur
 * @returns {void}
 * @private
 */
function handleUIError(context, error) {
  // Journaliser l'erreur
  console.error(`UI Manager - Erreur dans ${context}:`, error);

  // Publier l'événement d'erreur
  if (state.eventBus) {
    state.eventBus.publish('ERROR:UI', {
      context,
      message: error.message,
      stack: error.stack,
      timestamp: Date.now()
    });
  }

  // Afficher une notification si l'interface est initialisée
  if (state.isInitialized) {
    showNotification(`Erreur: ${error.message}`, 'error');
  }
}

// Exporter uniquement la fonction d'initialisation
module.exports = { initialize }; /**
 * @fileoverview UI Manager - Gestionnaire principal pour l'interface utilisateur
 *
 * Ce module gère l'affichage et les interactions de l'interface utilisateur de l'application 21 BYTS.
 * Il coordonne tous les composants UI sans dépendances directes grâce à une architecture événementielle.
 * Ce fichier respecte le principe d'indépendance totale - aucune importation statique de modules internes.
 * Toute communication se fait exclusivement via le bus d'événements.
 *
 * @module ui-manager
 * @requires electron
 * @requires node:path
 * @requires node:fs
 *
 * @events écoutés:
 *  - APP:INITIALIZED - Déclenché quand l'application est prête
 *  - CONFIG:UPDATED - Déclenché quand la configuration est mise à jour
 *  - DOWNLOAD:STARTED - Déclenché quand un téléchargement démarre
 *  - DOWNLOAD:PROGRESS - Déclenché quand un téléchargement progresse
 *  - DOWNLOAD:COMPLETED - Déclenché quand un téléchargement est terminé
 *  - DOWNLOAD:ERROR - Déclenché quand une erreur survient pendant un téléchargement
 *  - METADATA:UPDATED - Déclenché quand les métadonnées sont mises à jour
 *  - AUTH:STATUS_CHANGED - Déclenché quand le statut d'authentification change
 *  - ERROR:OCCURRED - Déclenché quand une erreur survient dans le système
 *  - PLAYLIST:DETECTED - Déclenché quand une playlist est détectée
 *
 * @events émis:
 *  - UI:READY - Émis quand l'interface utilisateur est prête
 *  - UI:URL_ADDED - Émis quand une URL est ajoutée par l'utilisateur
 *  - UI:DOWNLOAD_REQUESTED - Émis quand l'utilisateur demande un téléchargement
 *  - UI:CANCEL_REQUESTED - Émis quand l'utilisateur demande l'annulation d'un téléchargement
 *  - UI:CLEAR_COMPLETED - Émis quand l'utilisateur demande l'effacement des téléchargements terminés
 *  - UI:ADD_TO_LIBRARY - Émis quand l'utilisateur demande d'ajouter à la bibliothèque
 *  - UI:SETTINGS_REQUESTED - Émis quand l'utilisateur demande à ouvrir les paramètres
 *  - UI:FORMAT_CHANGED - Émis quand l'utilisateur change le format de sortie audio
 *  - UI:HELP_REQUESTED - Émis quand l'utilisateur demande l'aide
 *  - UI:THEME_CHANGED - Émis quand l'utilisateur change le thème
 *  - UI:PLAYLIST_DECISION - Émis quand l'utilisateur décide comment gérer une playlist
 *  - ERROR:UI - Émis quand une erreur se produit dans l'interface utilisateur
 */

// Utilisation des modules Electron et Node.js standards (pas de dépendances internes)
const { ipcRenderer } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

// État local du gestionnaire UI
const state = {
  isInitialized: false,
  theme: 'dark',
  downloadItems: new Map(), // Map des éléments de téléchargement (id -> détails)
  activeViews: new Set(), // Composants UI actifs actuellement
  selectedFormat: 'mp3', // Format audio par défaut
  dragCounter: 0 // Compteur pour la gestion du drag & drop
};

/**
 * Initialise le gestionnaire UI et s'abonne aux événements appropriés
 *
 * @param {Object} eventBus - Bus d'événements de l'application
 * @returns {void}
 *
 * @example
 * // Cette fonction est appelée par le conteneur d'application
 * // via un événement APP:COMPONENT_INIT
 * initialize(eventBus);
 */
function initialize(eventBus) {
  if (!eventBus) {
    console.error("UI Manager: EventBus non fourni à l'initialisation");
    return;
  }

  // S'abonner aux événements du système
  eventBus.subscribe('APP:INITIALIZED', handleAppInitialized);
  eventBus.subscribe('CONFIG:UPDATED', handleConfigUpdated);
  eventBus.subscribe('DOWNLOAD:STARTED', handleDownloadStarted);
  eventBus.subscribe('DOWNLOAD:PROGRESS', handleDownloadProgress);
  eventBus.subscribe('DOWNLOAD:COMPLETED', handleDownloadCompleted);
  eventBus.subscribe('DOWNLOAD:ERROR', handleDownloadError);
  eventBus.subscribe('METADATA:UPDATED', handleMetadataUpdated);
  eventBus.subscribe('AUTH:STATUS_CHANGED', handleAuthStatusChanged);
  eventBus.subscribe('ERROR:OCCURRED', handleSystemError);

  // Initialiser la référence au bus d'événements pour une utilisation ultérieure
  state.eventBus = eventBus;

  // Signaler que le UI Manager est initialisé
  console.log('UI Manager: Initialisé et abonné aux événements');
}

/**
 * Initialise l'interface utilisateur après le démarrage de l'application
 *
 * @param {Object} appData - Données de l'application au démarrage
 * @returns {void}
 * @private
 */
function handleAppInitialized(appData) {
  try {
    console.log("UI Manager: Initialisation de l'interface utilisateur...");

    // Récupérer l'élément conteneur principal
    const container = document.getElementById('app-container');
    if (!container) {
      throw new Error('Élément conteneur principal non trouvé');
    }

    // Initialiser l'interface utilisateur de base
    setupUI(container, appData);

    // Configuration des écouteurs d'événements de l'interface
    setupEventListeners();

    // Initialiser la gestion du drag & drop
    setupDragAndDrop();

    // Marquer l'initialisation comme terminée
    state.isInitialized = true;

    // Émettre un événement indiquant que l'UI est prête
    state.eventBus.publish('UI:READY', {
      timestamp: Date.now(),
      theme: state.theme
    });

    console.log('UI Manager: Interface utilisateur initialisée avec succès');
  } catch (error) {
    handleUIError("Initialisation de l'interface utilisateur", error);
  }
}

/**
 * Configure l'interface utilisateur de base
 *
 * @param {HTMLElement} container - Élément conteneur de l'application
 * @param {Object} appData - Données de l'application
 * @returns {void}
 * @private
 */
function setupUI(container, appData) {
  try {
    // Créer et initialiser les sections principales
    createHeaderSection(container);
    createMainSection(container);
    createFooterSection(container);

    // Appliquer le thème initial
    applyTheme(state.theme);

    // Annoncer les sections UI créées pour permettre aux autres composants de s'attacher
    state.eventBus.publish('UI:SECTIONS_CREATED', {
      sections: ['header', 'main', 'footer'],
      timestamp: Date.now()
    });
  } catch (error) {
    handleUIError("Configuration de l'interface utilisateur", error);
  }
}

/**
 * Crée la section d'en-tête de l'interface
 *
 * @param {HTMLElement} container - Élément conteneur de l'application
 * @returns {void}
 * @private
 */
function createHeaderSection(container) {
  const header = document.createElement('div');
  header.id = 'app-header';
  header.className = 'app-header';

  // Logo 21 BYTS
  const logoContainer = document.createElement('div');
  logoContainer.className = 'logo-container';

  const logo = document.createElement('div');
  logo.className = 'app-logo';
  logo.textContent = '21 BYTS';

  logoContainer.appendChild(logo);

  // Zone d'URL
  const urlInput = document.createElement('input');
  urlInput.id = 'url-input';
  urlInput.className = 'url-input';
  urlInput.type = 'text';
  urlInput.placeholder = 'Collez une URL audio (YouTube, Bandcamp, SoundCloud, Spotify, Tidal...)';

  // Bouton d'ajout d'URL
  const addButton = document.createElement('button');
  addButton.id = 'add-url-button';
  addButton.className = 'action-button add-button';
  addButton.title = 'Ajouter URL';
  addButton.innerHTML = '<span>+</span>';

  // Bouton de téléchargement global
  const downloadAllButton = document.createElement('button');
  downloadAllButton.id = 'download-all-button';
  downloadAllButton.className = 'action-button download-all-button';
  downloadAllButton.title = 'Tout télécharger';
  downloadAllButton.innerHTML = '<span>↓</span>';

  // Assemblage du header
  header.appendChild(logoContainer);
  header.appendChild(urlInput);
  header.appendChild(addButton);
  header.appendChild(downloadAllButton);

  container.appendChild(header);
}

/**
 * Crée la section principale de l'interface
 *
 * @param {HTMLElement} container - Élément conteneur de l'application
 * @returns {void}
 * @private
 */
function createMainSection(container) {
  const main = document.createElement('div');
  main.id = 'app-main';
  main.className = 'app-main';

  // Zone de téléchargements
  const downloadList = document.createElement('div');
  downloadList.id = 'download-list';
  downloadList.className = 'download-list';

  // Message initial
  const emptyMessage = document.createElement('div');
  emptyMessage.id = 'empty-message';
  emptyMessage.className = 'empty-message';
  emptyMessage.textContent = 'Collez une URL audio pour commencer...';

  downloadList.appendChild(emptyMessage);
  main.appendChild(downloadList);

  container.appendChild(main);
}

/**
 * Crée la section de pied de page de l'interface
 *
 * @param {HTMLElement} container - Élément conteneur de l'application
 * @returns {void}
 * @private
 */
function createFooterSection(container) {
  const footer = document.createElement('div');
  footer.id = 'app-footer';
  footer.className = 'app-footer';

  // Bouton Paramètres
  const settingsButton = document.createElement('button');
  settingsButton.id = 'settings-button';
  settingsButton.className = 'footer-button';
  settingsButton.textContent = 'Réglages';

  // Bouton Effacer Terminés
  const clearButton = document.createElement('button');
  clearButton.id = 'clear-completed-button';
  clearButton.className = 'footer-button';
  clearButton.textContent = 'Effacer terminés';

  // Bouton Ajouter à la bibliothèque
  const addToLibraryButton = document.createElement('button');
  addToLibraryButton.id = 'add-to-library-button';
  addToLibraryButton.className = 'footer-button';
  addToLibraryButton.textContent = 'Ajouter à la bibliothèque';

  // Bouton Aide
  const helpButton = document.createElement('button');
  helpButton.id = 'help-button';
  helpButton.className = 'footer-button';
  helpButton.textContent = 'Aide';

  // Assemblage du footer
  footer.appendChild(settingsButton);
  footer.appendChild(clearButton);
  footer.appendChild(addToLibraryButton);
  footer.appendChild(helpButton);

  container.appendChild(footer);
}

/**
 * Configure les écouteurs d'événements de l'interface utilisateur
 *
 * @returns {void}
 * @private
 */
function setupEventListeners() {
  try {
    // Écouteur pour le bouton d'ajout d'URL
    const addButton = document.getElementById('add-url-button');
    if (addButton) {
      addButton.addEventListener('click', handleAddUrl);
    }

    // Écouteur pour le champ d'URL (activation par entrée)
    const urlInput = document.getElementById('url-input');
    if (urlInput) {
      urlInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          handleAddUrl();
        }
      });

      // Focus automatique sur le champ URL
      setTimeout(() => urlInput.focus(), 100);
    }

    // Écouteur pour le bouton "tout télécharger"
    const downloadAllButton = document.getElementById('download-all-button');
    if (downloadAllButton) {
      downloadAllButton.addEventListener('click', handleDownloadAll);
    }

    // Écouteurs pour les boutons du footer
    const settingsButton = document.getElementById('settings-button');
    if (settingsButton) {
      settingsButton.addEventListener('click', handleOpenSettings);
    }

    const clearButton = document.getElementById('clear-completed-button');
    if (clearButton) {
      clearButton.addEventListener('click', handleClearCompleted);
    }

    const addToLibraryButton = document.getElementById('add-to-library-button');
    if (addToLibraryButton) {
      addToLibraryButton.addEventListener('click', handleAddToLibrary);
    }

    const helpButton = document.getElementById('help-button');
    if (helpButton) {
      helpButton.addEventListener('click', handleOpenHelp);
    }

    // Écouteur pour le collage direct (Ctrl+V dans la fenêtre)
    document.addEventListener('paste', handlePaste);

    console.log("UI Manager: Écouteurs d'événements configurés");
  } catch (error) {
    handleUIError("Configuration des écouteurs d'événements", error);
  }
}

/**
 * Configure le support du drag & drop pour les URL
 *
 * @returns {void}
 * @private
 */
function setupDragAndDrop() {
  try {
    const mainArea = document.getElementById('app-main');
    if (!mainArea) return;

    // Prévenir le comportement par défaut pour permettre le drop
    document.addEventListener('dragover', (event) => {
      event.preventDefault();
    });

    document.addEventListener('dragenter', (event) => {
      event.preventDefault();
      state.dragCounter++;

      if (state.dragCounter === 1) {
        // Première entrée de l'élément de glisser
        mainArea.classList.add('drag-highlight');
      }
    });

    document.addEventListener('dragleave', (event) => {
      event.preventDefault();
      state.dragCounter--;

      if (state.dragCounter === 0) {
        // Dernière sortie de l'élément de glisser
        mainArea.classList.remove('drag-highlight');
      }
    });

    document.addEventListener('drop', (event) => {
      event.preventDefault();
      state.dragCounter = 0;
      mainArea.classList.remove('drag-highlight');

      // Traiter les données déposées (URL ou fichiers)
      const text = event.dataTransfer.getData('text/plain');
      if (text && isValidAudioUrl(text)) {
        addDownloadUrl(text);
        return;
      }

      // Vérifier s'il y a des fichiers déposés
      if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
        // Pour le moment, nous ne traitons que les URL, pas les fichiers
        showNotification(
          "Le glisser-déposer de fichiers n'est pas encore supporté. Veuillez coller une URL audio.",
          'warning'
        );
      }
    });

    console.log('UI Manager: Drag & Drop configuré');
  } catch (error) {
    handleUIError('Configuration drag & drop', error);
  }
}

/**
 * Gère le clic sur le bouton d'ajout d'URL
 *
 * @returns {void}
 * @private
 */
function handleAddUrl() {
  try {
    const urlInput = document.getElementById('url-input');
    if (!urlInput) return;

    const url = urlInput.value.trim();
    if (!url) {
      // Si le champ est vide, essayer de coller depuis le presse-papiers
      navigator.clipboard
        .readText()
        .then((text) => {
          if (text && isValidAudioUrl(text)) {
            urlInput.value = text;
            addDownloadUrl(text);
          } else {
            showNotification('Veuillez entrer une URL audio valide', 'warning');
          }
        })
        .catch(() => {
          showNotification('Veuillez entrer une URL audio valide', 'warning');
        });
      return;
    }

    addDownloadUrl(url);
  } catch (error) {
    handleUIError("Ajout d'URL", error);
  }
}

/**
 * Vérifie si une URL semble être une URL audio valide
 *
 * @param {string} url - URL à vérifier
 * @returns {boolean} - True si l'URL semble valide
 * @private
 */
function isValidAudioUrl(url) {
  try {
    // Vérification basique que c'est une URL
    new URL(url);

    // Vérifier si l'URL provient d'une plateforme supportée
    const supportedPatterns = [
      /youtube\.com\/watch/i,
      /youtu\.be\//i,
      /soundcloud\.com\//i,
      /bandcamp\.com\//i,
      /open\.spotify\.com\//i,
      /spotify:track:/i,
      /tidal\.com\//i,
      /music\.apple\.com\//i,
      /deezer\.com\//i
    ];

    return supportedPatterns.some((pattern) => pattern.test(url));
  } catch (e) {
    return false;
  }
}

/**
 * Ajoute une URL de téléchargement à l'interface et émet un événement
 *
 * @param {string} url - URL à ajouter
 * @returns {void}
 * @private
 */
function addDownloadUrl(url) {
  try {
    if (!isValidAudioUrl(url)) {
      showNotification('URL non valide ou plateforme non supportée', 'error');
      return;
    }

    // Effacer l'input
    const urlInput = document.getElementById('url-input');
    if (urlInput) {
      urlInput.value = '';
      urlInput.focus();
    }

    // Générer un ID unique pour ce téléchargement
    const downloadId = `download-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Créer un objet de téléchargement initial
    const downloadItem = {
      id: downloadId,
      url: url,
      status: 'pending',
      progress: 0,
      platform: detectPlatform(url),
      format: state.selectedFormat,
      addedAt: Date.now(),
      metadata: null
    };

    // Ajouter à l'état local
    state.downloadItems.set(downloadId, downloadItem);

    // Créer l'élément UI pour ce téléchargement
    createDownloadElement(downloadItem);

    // Masquer le message "vide" si présent
    const emptyMessage = document.getElementById('empty-message');
    if (emptyMessage) {
      emptyMessage.style.display = 'none';
    }

    // Notifier via le bus d'événements
    state.eventBus.publish('UI:URL_ADDED', {
      id: downloadId,
      url: url,
      format: state.selectedFormat,
      timestamp: Date.now()
    });

    console.log(`UI Manager: URL ajoutée - ID: ${downloadId}`);
  } catch (error) {
    handleUIError("Ajout de l'URL", error);
  }
}

/**
 * Détecte la plateforme à partir de l'URL
 *
 * @param {string} url - URL à analyser
 * @returns {string} - Nom de la plateforme
 * @private
 */
function detectPlatform(url) {
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/soundcloud\.com/i.test(url)) return 'soundcloud';
  if (/bandcamp\.com/i.test(url)) return 'bandcamp';
  if (/spotify/i.test(url)) return 'spotify';
  if (/tidal\.com/i.test(url)) return 'tidal';
  if (/music\.apple\.com/i.test(url)) return 'apple';
  if (/deezer\.com/i.test(url)) return 'deezer';
  return 'unknown';
}

/**
 * Crée un élément d'interface pour un téléchargement
 *
 * @param {Object} item - Objet décrivant le téléchargement
 * @returns {void}
 * @private
 */
function createDownloadElement(item) {
  try {
    const downloadList = document.getElementById('download-list');
    if (!downloadList) return;

    // Créer l'élément de téléchargement
    const downloadElement = document.createElement('div');
    downloadElement.id = item.id;
    downloadElement.className = `download-item platform-${item.platform}`;
    downloadElement.dataset.status = item.status;

    // Créer la miniature (pour l'instant, une image générique basée sur la plateforme)
    const thumbnail = document.createElement('div');
    thumbnail.className = 'download-thumbnail';

    // Définir l'icône basée sur la plateforme
    const iconSpan = document.createElement('span');
    iconSpan.className = `platform-icon ${item.platform}`;
    thumbnail.appendChild(iconSpan);

    // Créer la zone d'information
    const infoContainer = document.createElement('div');
    infoContainer.className = 'download-info';

    // Titre (initialement URL, sera mis à jour avec métadonnées)
    const titleElement = document.createElement('div');
    titleElement.className = 'download-title';
    titleElement.textContent = new URL(item.url).hostname;

    // Artiste (sera mis à jour avec métadonnées)
    const artistElement = document.createElement('div');
    artistElement.className = 'download-artist';
    artistElement.textContent = 'En attente...';

    // Album (sera mis à jour avec métadonnées)
    const albumElement = document.createElement('div');
    albumElement.className = 'download-album';
    albumElement.textContent = '';

    infoContainer.appendChild(titleElement);
    infoContainer.appendChild(artistElement);
    infoContainer.appendChild(albumElement);

    // Barre de progression
    const progressContainer = document.createElement('div');
    progressContainer.className = 'progress-container';

    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    progressBar.style.width = '0%';

    progressContainer.appendChild(progressBar);

    // Sélecteur de format
    const formatSelector = document.createElement('select');
    formatSelector.className = 'format-selector';
    formatSelector.title = 'Format de sortie';

    const formats = [
      { value: 'mp3', label: 'MP3' },
      { value: 'flac', label: 'FLAC' },
      { value: 'wav', label: 'WAV' },
      { value: 'aiff', label: 'AIFF' }
    ];

    formats.forEach((format) => {
      const option = document.createElement('option');
      option.value = format.value;
      option.textContent = format.label;
      option.selected = format.value === item.format;
      formatSelector.appendChild(option);
    });

    formatSelector.addEventListener('change', (event) => {
      handleFormatChange(item.id, event.target.value);
    });

    // Bouton de téléchargement individuel
    const downloadButton = document.createElement('button');
    downloadButton.className = 'item-download-button';
    downloadButton.title = 'Télécharger';
    downloadButton.innerHTML = '<span>↓</span>';
    downloadButton.addEventListener('click', () => handleSingleDownload(item.id));

    // Assembler l'élément complet
    downloadElement.appendChild(thumbnail);
    downloadElement.appendChild(infoContainer);
    downloadElement.appendChild(progressContainer);
    downloadElement.appendChild(formatSelector);
    downloadElement.appendChild(downloadButton);

    // Ajouter au début de la liste
    downloadList.insertBefore(downloadElement, downloadList.firstChild);
  } catch (error) {
    handleUIError("Création d'élément de téléchargement", error);
  }
}

/**
 * Gère le changement de format pour un téléchargement
 *
 * @param {string} downloadId - ID du téléchargement
 * @param {string} newFormat - Nouveau format sélectionné
 * @returns {void}
 * @private
 */
function handleFormatChange(downloadId, newFormat) {
  try {
    // Mettre à jour l'état local
    const downloadItem = state.downloadItems.get(downloadId);
    if (!downloadItem) return;

    downloadItem.format = newFormat;
    state.downloadItems.set(downloadId, downloadItem);

    // Publier l'événement de changement de format
    state.eventBus.publish('UI:FORMAT_CHANGED', {
      id: downloadId,
      format: newFormat,
      timestamp: Date.now()
    });

    console.log(`UI Manager: Format changé pour ${downloadId} vers ${newFormat}`);
  } catch (error) {
    handleUIError('Changement de format', error);
  }
}

/**
 * Gère le clic sur le bouton de téléchargement individuel
 *
 * @param {string} downloadId - ID du téléchargement
 * @returns {void}
 * @private
 */
function handleSingleDownload(downloadId) {
  try {
    const downloadItem = state.downloadItems.get(downloadId);
    if (!downloadItem) return;

    // Ne rien faire si déjà en cours de téléchargement
    if (downloadItem.status === 'downloading') return;

    // Mettre à jour l'état et l'UI
    updateDownloadStatus(downloadId, 'queued');

    // Publier l'événement de demande de téléchargement
    state.eventBus.publish('UI:DOWNLOAD_REQUESTED', {
      id: downloadId,
      url: downloadItem.url,
      format: downloadItem.format,
      timestamp: Date.now()
    });

    console.log(`UI Manager: Téléchargement demandé pour ${downloadId}`);
  } catch (error) {
    handleUIError('Téléchargement individuel', error);
  }
}

/**
 * Gère le clic sur le bouton "Tout télécharger"
 *
 * @returns {void}
 * @private
 */
function handleDownloadAll() {
  try {
    let pendingCount = 0;

    // Parcourir tous les téléchargements en attente
    state.downloadItems.forEach((item, id) => {
      if (item.status === 'pending') {
        // Mettre à jour l'état et l'UI
        updateDownloadStatus(id, 'queued');

        // Publier l'événement de demande de téléchargement
        state.eventBus.publish('UI:DOWNLOAD_REQUESTED', {
          id: id,
          url: item.url,
          format: item.format,
          timestamp: Date.now()
        });

        pendingCount++;
      }
    });

    if (pendingCount === 0) {
      showNotification('Aucun téléchargement en attente', 'info');
    } else {
      showNotification(`${pendingCount} téléchargements lancés`, 'success');
    }

    console.log(`UI Manager: ${pendingCount} téléchargements lancés via "Tout télécharger"`);
  } catch (error) {
    handleUIError('Téléchargement global', error);
  }
}

/**
 * Met à jour le statut d'un téléchargement dans l'interface
 *
 * @param {string} downloadId - ID du téléchargement
 * @param {string} status - Nouveau statut
 * @returns {void}
 * @private
 */
function updateDownloadStatus(downloadId, status) {
  try {
    // Mettre à jour l'état local
    const downloadItem = state.downloadItems.get(downloadId);
    if (!downloadItem) return;

    downloadItem.status = status;
    state.downloadItems.set(downloadId, downloadItem);

    // Mettre à jour l'élément UI
    const element = document.getElementById(downloadId);
    if (!element) return;

    element.dataset.status = status;

    // Mise à jour visuelle selon le statut
    switch (status) {
      case 'queued':
        element.classList.add('queued');
        break;
      case 'downloading':
        element.classList.add('downloading');
        element.classList.remove('queued');
        break;
      case 'completed':
        element.classList.add('completed');
        element.classList.remove('downloading', 'queued');
        break;
      case 'error':
        element.classList.add('error');
        element.classList.remove('downloading', 'queued');
        break;
      default:
        break;
    }
  } catch (error) {
    handleUIError('Mise à jour du statut de téléchargement', error);
  }
}

/**
 * Met à jour la progression d'un téléchargement dans l'interface
 *
 * @param {string} downloadId - ID du téléchargement
 * @param {number} progress - Progression (0-100)
 * @returns {void}
 * @private
 */
function updateDownloadProgress(downloadId, progress) {
  try {
    // Mettre à jour l'état local
    const downloadItem = state.downloadItems.get(downloadId);
    if (!downloadItem) return;

    downloadItem.progress = progress;
    state.downloadItems.set(downloadId, downloadItem);

    // Mettre à jour l'élément UI
    const element = document.getElementById(downloadId);
    if (!element) return;

    const progressBar = element.querySelector('.progress-bar');
    if (progressBar) {
      progressBar.style.width = `${progress}%`;
    }
  } catch (error) {
    handleUIError('Mise à jour de la progression', error);
  }
}

/**
 * Gère le clic sur le bouton Paramètres
 *
 * @returns {void}
 * @private
 */
function handleOpenSettings() {
  try {
    // Publier l'événement de demande d'ouverture des paramètres
    state.eventBus.publish('UI:SETTINGS_REQUESTED', {
      currentSettings: {
        format: state.selectedFormat,
        theme: state.theme
      },
      timestamp: Date.now()
    });

    console.log('UI Manager: Ouverture des paramètres demandée');
  } catch (error) {
    handleUIError('Ouverture des paramètres', error);
  }
}

/**
 * Gère le clic sur le bouton Effacer Terminés
 *
 * @returns {void}
 * @private
 */
function handleClearCompleted() {
  try {
    let clearedCount = 0;
    const completedIds = [];

    // Identifier les téléchargements terminés
    state.downloadItems.forEach((item, id) => {
      if (item.status === 'completed') {
        completedIds.push(id);
        clearedCount++;
      }
    });

    // Supprimer de l'UI et de l'état local
    completedIds.forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        element.remove();
      }
      state.downloadItems.delete(id);
    });

    // Afficher le message "vide" si aucun téléchargement restant
    if (state.downloadItems.size === 0) {
      const emptyMessage = document.getElementById('empty-message');
      if (emptyMessage) {
        emptyMessage.style.display = 'block';
      }
    }

    // Publier l'événement
    state.eventBus.publish('UI:CLEAR_COMPLETED', {
      clearedIds: completedIds,
      count: clearedCount,
      timestamp: Date.now()
    });

    // Notifier l'utilisateur
    if (clearedCount > 0) {
      showNotification(`${clearedCount} téléchargements effacés`, 'info');
    } else {
      showNotification('Aucun téléchargement terminé à effacer', 'info');
    }

    console.log(`UI Manager: ${clearedCount} téléchargements terminés effacés`);
  } catch (error) {
    handleUIError('Effacement des téléchargements terminés', error);
  }
}

/**
 * Gère le clic sur le bouton Ajouter à la bibliothèque
 *
 * @returns {void}
 * @private
 */
function handleAddToLibrary() {
  try {
    const completedIds = [];

    // Identifier les téléchargements terminés
    state.downloadItems.forEach((item, id) => {
      if (item.status === 'completed') {
        completedIds.push(id);
      }
    });

    if (completedIds.length === 0) {
      showNotification('Aucun téléchargement terminé à ajouter', 'info');
      return;
    }

    // Publier l'événement
    state.eventBus.publish('UI:ADD_TO_LIBRARY', {
      ids: completedIds,
      count: completedIds.length,
      timestamp: Date.now()
    });

    showNotification(`${completedIds.length} fichiers ajoutés à la bibliothèque`, 'success');
    console.log(`UI Manager: ${completedIds.length} fichiers ajoutés à la bibliothèque`);
  } catch (error) {
    handleUIError('Ajout à la bibliothèque', error);
  }
}

/**
 * Gère le clic sur le bouton Aide
 *
 * @returns {void}
 * @private
 */
function handleOpenHelp() {
  try {
    // Publier l'événement
    state.eventBus.publish('UI:HELP_REQUESTED', {
      timestamp: Date.now()
    });

    console.log('UI Manager: Aide demandée');
  } catch (error) {
    handleUIError("Ouverture de l'aide", error);
  }
}

/**
 * Gère les événements de collage (Ctrl+V)
 *
 * @param {ClipboardEvent} event - Événement de collage
 * @returns {void}
 * @private
 */
function handlePaste(event) {
  try {
    // Vérifier si on est déjà dans un champ de texte
    if (
      document.activeElement &&
      (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')
    ) {
      return; // Laisser le comportement par défaut
    }

    // Empêcher le comportement par défaut
    event.preventDefault();

    // Récupérer le texte du presse-papiers
    const text = event.clipboardData.getData('text/plain');
    if (!text) return;

    // Vérifier si c'est une URL valide
    if (isValidAudioUrl(text)) {
      // Mettre automatiquement dans le champ URL
      const urlInput = document.getElementById('url-input');
      if (urlInput) {
        urlInput.value = text;
        urlInput.focus();
      }

      // Option: Ajouter automatiquement l'URL
      addDownloadUrl(text);
    }
  } catch (error) {
    handleUIError('Gestion du collage', error);
  }
}

/**
 * Gère l'événement de démarrage d'un téléchargement
 *
 * @param {Object} data - Données du téléchargement
 * @returns {void}
 * @private
 */
function handleDownloadStarted(data) {
  try {
    const { id } = data;
    if (!id || !state.downloadItems.has(id)) return;

    // Mettre à jour l'état et l'UI
    updateDownloadStatus(id, 'downloading');

    console.log(`UI Manager: Téléchargement démarré pour ${id}`);
  } catch (error) {
    handleUIError('Gestion du démarrage de téléchargement', error);
  }
}

/**
 * Gère l'événement de progression d'un téléchargement
 *
 * @param {Object} data - Données de progression
 * @returns {void}
 * @private
 */
function handleDownloadProgress(data) {
  try {
    const { id, progress } = data;
    if (!id || !state.downloadItems.has(id)) return;

    // Mettre à jour la progression
    updateDownloadProgress(id, progress);
  } catch (error) {
    handleUIError('Gestion de la progression', error);
  }
}

/**
 * Gère l'événement de fin d'un téléchargement
 *
 * @param {Object} data - Données de fin de téléchargement
 * @returns {void}
 * @private
 */
function handleDownloadCompleted(data) {
  try {
    const { id, filePath } = data;
    if (!id || !state.downloadItems.has(id)) return;

    // Mettre à jour l'état et l'UI
    updateDownloadStatus(id, 'completed');
    updateDownloadProgress(id, 100);

    // Stocker le chemin du fichier dans l'état local
    const downloadItem = state.downloadItems.get(id);
    if (downloadItem) {
      downloadItem.filePath = filePath;
      state.downloadItems.set(id, downloadItem);
    }

    console.log(`UI Manager: Téléchargement terminé pour ${id}`);

    // Notifier l'utilisateur
    const element = document.getElementById(id);
    const title = element?.querySelector('.download-title')?.textContent || 'Fichier';
    showNotification(`"${title}" téléchargé avec succès`, 'success');
  } catch (error) {
    handleUIError('Gestion de fin de téléchargement', error);
  }
}

/**
 * Gère l'événement d'erreur de téléchargement
 *
 * @param {Object} data - Données d'erreur
 * @returns {void}
 * @private
 */
function handleDownloadError(data) {
  try {
    const { id, error } = data;
    if (!id || !state.downloadItems.has(id)) return;

    // Mettre à jour l'état et l'UI
    updateDownloadStatus(id, 'error');

    // Afficher l'erreur dans l'élément
    const element = document.getElementById(id);
    if (element) {
      const artistElement = element.querySelector('.download-artist');
      if (artistElement) {
        artistElement.textContent = 'Erreur';
        artistElement.classList.add('error-text');
      }

      const albumElement = element.querySelector('.download-album');
      if (albumElement) {
        albumElement.textContent = error.message || 'Erreur de téléchargement';
        albumElement.classList.add('error-text');
      }
    }

    console.error(`UI Manager: Erreur de téléchargement pour ${id}:`, error);

    // Notifier l'utilisateur
    const title = element?.querySelector('.download-title')?.textContent || 'Fichier';
    showNotification(`Erreur lors du téléchargement de "${title}"`, 'error');
  } catch (error) {
    handleUIError("Gestion d'erreur de téléchargement", error);
  }
}
