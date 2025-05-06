/**
 * @fileoverview Composant DownloadItem - Gère l'affichage et les interactions pour un élément
 * de téléchargement individuel dans l'interface utilisateur.
 *
 * Ce module est conçu selon l'architecture "Single File Component", fonctionnant de manière
 * autonome sans dépendances directes sur d'autres modules du projet. Toute la communication
 * se fait exclusivement via le bus d'événements.
 *
 * @module ui/components/download-item
 * @requires electron
 * @requires node:path
 */

// Imports des API standards de Node.js et Electron (aucune dépendance sur des modules internes)
const { shell }

/**
 * Publie un événement sur le bus d'événements
 * @param {string} eventType - Type d'événement standardisé
 * @param {Object} data - Données associées à l'événement
 */
function publishEvent(eventType, data) {
  if (!eventBus) {
    console.error('Event bus not initialized');
    return;
  }

  eventBus.emit(eventType, {
    ...data,
    timestamp: Date.now()
  });
}

/**
 * Publie une erreur sur le bus d'événements
 * @param {string} errorCode - Code d'erreur standardisé
 * @param {string} message - Message d'erreur descriptif
 * @param {Object} [additionalData] - Données supplémentaires
 */
function publishError(errorCode, message, additionalData = {}) {
  publishEvent('ERROR', {
    code: errorCode,
    message,
    source: 'download-item',
    downloadId: downloadData ? downloadData.id : null,
    ...additionalData
  });
}

// Expose uniquement la fonction d'initialisation (point d'entrée public)
module.exports = {
  initialize
};

/**
 * Exemples d'utilisation:
 *
 * 1. Initialisation du composant:
 * ```javascript
 * // Dans le module parent (par ex. ui-manager.js)
 * const DownloadItem = require('./components/download-item');
 *
 * // Lors de la création d'un nouvel élément de téléchargement
 * eventBus.on('DOWNLOAD_ITEM_CREATED', (data) => {
 *   const container = document.getElementById('downloads-container');
 *
 *   DownloadItem.initialize({
 *     eventBus,
 *     container,
 *     data: {
 *       id: data.downloadId,
 *       title: data.title || 'Téléchargement',
 *       artist: data.artist || '',
 *       album: data.album || '',
 *       thumbnailPath: data.thumbnailPath,
 *       status: 'pending',
 *       progress: 0,
 *       source: data.source,
 *       format: data.format || 'mp3'
 *     }
 *   });
 * });
 * ```
 *
 * 2. Interaction avec le composant via des événements:
 * ```javascript
 * // Mise à jour de la progression
 * eventBus.emit('DOWNLOAD_PROGRESS_UPDATED', {
 *   downloadId: '12345',
 *   progress: 45 // pourcentage
 * });
 *
 * // Changement de statut
 * eventBus.emit('DOWNLOAD_STATUS_CHANGED', {
 *   downloadId: '12345',
 *   status: 'downloading'
 * });
 *
 * // Mise à jour des métadonnées
 * eventBus.emit('DOWNLOAD_METADATA_UPDATED', {
 *   downloadId: '12345',
 *   title: 'Nouveau titre',
 *   artist: 'Nouvel artiste'
 * });
 * ```
 */ = require('electron');
const path = require('node:path');

/**
 * @typedef {Object} DownloadItemData
 * @property {string} id - Identifiant unique du téléchargement
 * @property {string} title - Titre de la piste audio
 * @property {string} artist - Nom de l'artiste
 * @property {string} album - Nom de l'album
 * @property {string} [genre] - Genre musical (optionnel)
 * @property {string} [thumbnailPath] - Chemin vers l'image miniature
 * @property {string} status - État du téléchargement ('pending', 'downloading', 'paused', 'completed', 'error')
 * @property {number} progress - Progression du téléchargement (0-100)
 * @property {string} source - Source du téléchargement ('youtube', 'spotify', 'bandcamp', 'soundcloud', 'tidal')
 * @property {string} format - Format de sortie ('mp3', 'flac', 'wav', 'aiff')
 * @property {string} [outputPath] - Chemin du fichier téléchargé
 * @property {string} [errorMessage] - Message d'erreur en cas d'échec
 */

// Élément HTML principal pour ce composant
let containerEl = null;

// Stockage des références aux éléments DOM spécifiques à cet élément
let uiElements = {};

// Stockage des données du téléchargement courant
let downloadData = null;

// Référence au bus d'événements (injecté lors de l'initialisation)
let eventBus = null;

// Couleurs pour chaque plateforme
const platformColors = {
  youtube: '#ee0000',     // rouge
  bandcamp: '#1DA0C3',    // bleu
  spotify: '#1DB954',     // vert
  soundcloud: '#FF7700',  // orange
  tidal: '#000000'        // noir
};

/**
 * Initialise le composant DownloadItem
 *
 * @param {Object} options - Options d'initialisation
 * @param {Object} options.eventBus - Instance du bus d'événements
 * @param {HTMLElement} options.container - Élément DOM conteneur parent
 * @param {DownloadItemData} options.data - Données initiales du téléchargement
 * @returns {Object} Interface publique du composant
 */
function initialize(options) {
  if (!options || !options.eventBus || !options.container || !options.data) {
    publishError('DOWNLOAD_ITEM_INIT_ERROR', 'Initialization options missing required parameters');
    return null;
  }

  // Sauvegarde des références
  eventBus = options.eventBus;
  containerEl = options.container;
  downloadData = options.data;

  // Création du composant dans le DOM
  render();

  // Abonnement aux événements pertinents
  subscribeToEvents();

  // Interface publique du composant (exportée)
  // Note: Aucune méthode directe n'est exposée, toute interaction passe par les événements
  return {
    // Le composant n'expose aucune méthode, il communique exclusivement via des événements
    // Cette interface vide est présente à des fins de compatibilité avec le système de composants
  };
}

/**
 * S'abonne aux événements du bus d'événements pertinents pour ce téléchargement
 */
function subscribeToEvents() {
  // Écoute les mises à jour de progression pour cet élément spécifique
  eventBus.on('DOWNLOAD_PROGRESS_UPDATED', handleProgressUpdate);

  // Écoute les changements de statut pour cet élément
  eventBus.on('DOWNLOAD_STATUS_CHANGED', handleStatusChange);

  // Écoute les mises à jour des métadonnées
  eventBus.on('DOWNLOAD_METADATA_UPDATED', handleMetadataUpdate);

  // Écoute la demande de suppression de l'élément
  eventBus.on('DOWNLOAD_ITEM_REMOVE_REQUESTED', handleRemoveRequest);

  // Écoute les changements de format audio
  eventBus.on('DOWNLOAD_FORMAT_CHANGED', handleFormatChange);

  // Écoute les erreurs spécifiques à cet élément
  eventBus.on('DOWNLOAD_ERROR', handleError);

  // Écoute les demandes d'actualisation de l'interface
  eventBus.on('UI_REFRESH_REQUESTED', handleRefreshRequest);
}

/**
 * Crée et rend l'élément HTML du téléchargement dans le conteneur
 */
function render() {
  // Création de l'élément principal
  const itemEl = document.createElement('div');
  itemEl.className = 'download-item';
  itemEl.dataset.id = downloadData.id;

  // Définition du HTML interne (template)
  itemEl.innerHTML = `
    <div class="download-item__container" style="position: relative; overflow: hidden; border-radius: 12px;">
      <!-- Barre de progression en arrière-plan, avec la couleur correspondant à la plateforme -->
      <div class="download-item__progress-bar" style="
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        width: ${downloadData.progress}%;
        background-color: ${platformColors[downloadData.source] || '#888888'};
        opacity: 0.15;
        transition: width 0.3s ease-out;
        z-index: 1;
      "></div>

      <div class="download-item__content" style="position: relative; display: flex; padding: 15px; z-index: 2;">
        <!-- Miniature -->
        <div class="download-item__thumbnail">
          <img
            src="${downloadData.thumbnailPath || getDefaultThumbnailForSource(downloadData.source)}"
            alt="${downloadData.title}"
            style="width: 70px; height: 70px; border-radius: 10px; object-fit: cover;"
            onerror="this.src='${getDefaultThumbnailForSource(downloadData.source)}'"
          />
        </div>

        <!-- Métadonnées -->
        <div class="download-item__metadata" style="margin-left: 15px; flex-grow: 1;">
          <h3 class="download-item__title" style="margin: 0 0 5px 0; font-size: 18px; color: #ffffff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${downloadData.title || 'Sans titre'}</h3>
          <p class="download-item__artist" style="margin: 0 0 3px 0; font-size: 14px; color: rgba(255,255,255,0.8); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${downloadData.artist || 'Artiste inconnu'}</p>
          <p class="download-item__album" style="margin: 0; font-size: 12px; color: rgba(255,255,255,0.6); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${downloadData.album || ''}</p>

          <!-- Statut (visible uniquement pour certains états) -->
          <div class="download-item__status" style="
            margin-top: 5px;
            font-size: 12px;
            display: ${['error', 'paused'].includes(downloadData.status) ? 'block' : 'none'};
            color: ${downloadData.status === 'error' ? '#ff6b6b' : '#f0f0f0'};
          ">
            ${downloadData.status === 'error' ? (downloadData.errorMessage || 'Erreur de téléchargement') : 'En pause'}
          </div>
        </div>

        <!-- Format et contrôles -->
        <div class="download-item__controls" style="display: flex; flex-direction: column; justify-content: center; margin-left: 10px;">
          <!-- Sélecteur de format -->
          <div class="download-item__format-selector" style="
            background-color: rgba(255,255,255,0.15);
            border-radius: 15px;
            padding: 5px 15px;
            margin-bottom: 10px;
            cursor: pointer;
            text-align: center;
          ">
            <span>${downloadData.format.toUpperCase()}</span>
            <span style="margin-left: 5px;">▼</span>
          </div>

          <!-- Bouton d'action (télécharger, pause, reprendre, ouvrir) -->
          <button class="download-item__action-button" style="
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background-color: rgba(255,255,255,0.15);
            border: 1px solid rgba(255,255,255,0.3);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            margin: 0 auto;
          ">
            ${getButtonIconForStatus(downloadData.status)}
          </button>
        </div>
      </div>
    </div>
  `;

  // Ajout au conteneur parent
  containerEl.appendChild(itemEl);

  // Sauvegarde des références aux éléments pour manipulation ultérieure
  uiElements = {
    item: itemEl,
    progressBar: itemEl.querySelector('.download-item__progress-bar'),
    title: itemEl.querySelector('.download-item__title'),
    artist: itemEl.querySelector('.download-item__artist'),
    album: itemEl.querySelector('.download-item__album'),
    thumbnail: itemEl.querySelector('.download-item__thumbnail img'),
    status: itemEl.querySelector('.download-item__status'),
    formatSelector: itemEl.querySelector('.download-item__format-selector'),
    actionButton: itemEl.querySelector('.download-item__action-button')
  };

  // Ajout des écouteurs d'événements pour les interactions utilisateur
  attachEventListeners();
}

/**
 * Attache les écouteurs d'événements aux éléments du DOM
 */
function attachEventListeners() {
  // Bouton d'action principal (télécharger/pause/reprendre/ouvrir)
  uiElements.actionButton.addEventListener('click', handleActionButtonClick);

  // Sélecteur de format audio
  uiElements.formatSelector.addEventListener('click', handleFormatSelectorClick);

  // Clic sur la miniature (peut ouvrir une prévisualisation)
  uiElements.thumbnail.addEventListener('click', handleThumbnailClick);

  // Clic droit sur l'élément complet (menu contextuel)
  uiElements.item.addEventListener('contextmenu', handleContextMenu);
}

/**
 * Gère le clic sur le bouton d'action principal
 * @param {Event} event - Événement DOM
 */
function handleActionButtonClick(event) {
  event.stopPropagation();

  // Différentes actions selon l'état actuel
  switch (downloadData.status) {
    case 'pending':
      // Déclencher le téléchargement
      publishEvent('DOWNLOAD_START_REQUESTED', {
        downloadId: downloadData.id
      });
      break;

    case 'downloading':
      // Mettre en pause
      publishEvent('DOWNLOAD_PAUSE_REQUESTED', {
        downloadId: downloadData.id
      });
      break;

    case 'paused':
      // Reprendre
      publishEvent('DOWNLOAD_RESUME_REQUESTED', {
        downloadId: downloadData.id
      });
      break;

    case 'completed':
      // Ouvrir le fichier téléchargé
      if (downloadData.outputPath) {
        shell.showItemInFolder(downloadData.outputPath);
      }
      break;

    case 'error':
      // Réessayer
      publishEvent('DOWNLOAD_RETRY_REQUESTED', {
        downloadId: downloadData.id
      });
      break;
  }
}

/**
 * Gère le clic sur le sélecteur de format audio
 * @param {Event} event - Événement DOM
 */
function handleFormatSelectorClick(event) {
  event.stopPropagation();

  // Publier un événement pour ouvrir le menu de sélection de format
  publishEvent('FORMAT_SELECTION_REQUESTED', {
    downloadId: downloadData.id,
    currentFormat: downloadData.format,
    position: {
      x: event.clientX,
      y: event.clientY
    }
  });
}

/**
 * Gère le clic sur la miniature
 * @param {Event} event - Événement DOM
 */
function handleThumbnailClick(event) {
  event.stopPropagation();

  // Publier un événement pour ouvrir une prévisualisation
  publishEvent('THUMBNAIL_PREVIEW_REQUESTED', {
    downloadId: downloadData.id,
    title: downloadData.title,
    thumbnailPath: downloadData.thumbnailPath
  });
}

/**
 * Gère le clic droit pour afficher un menu contextuel
 * @param {Event} event - Événement DOM
 */
function handleContextMenu(event) {
  event.preventDefault();

  // Publier un événement pour ouvrir le menu contextuel
  publishEvent('CONTEXT_MENU_REQUESTED', {
    downloadId: downloadData.id,
    status: downloadData.status,
    position: {
      x: event.clientX,
      y: event.clientY
    }
  });
}

/**
 * Gestionnaire pour les mises à jour de progression
 * @param {Object} data - Données de l'événement
 */
function handleProgressUpdate(data) {
  // Vérifier que l'événement concerne cet élément
  if (data.downloadId !== downloadData.id) return;

  // Mettre à jour les données locales
  downloadData.progress = data.progress;

  // Mettre à jour l'interface
  if (uiElements.progressBar) {
    uiElements.progressBar.style.width = `${data.progress}%`;
  }
}

/**
 * Gestionnaire pour les changements de statut
 * @param {Object} data - Données de l'événement
 */
function handleStatusChange(data) {
  // Vérifier que l'événement concerne cet élément
  if (data.downloadId !== downloadData.id) return;

  // Mettre à jour les données locales
  const previousStatus = downloadData.status;
  downloadData.status = data.status;

  // Mettre à jour l'interface
  updateStatusIndicator();

  // Actualiser l'icône du bouton
  if (uiElements.actionButton) {
    uiElements.actionButton.innerHTML = getButtonIconForStatus(data.status);
  }

  // Afficher/masquer l'indicateur de statut selon le besoin
  if (uiElements.status) {
    uiElements.status.style.display = ['error', 'paused'].includes(data.status) ? 'block' : 'none';

    if (data.status === 'error' && data.errorMessage) {
      uiElements.status.textContent = data.errorMessage;
    }
  }

  // Actions spécifiques lors de certaines transitions d'état
  if (previousStatus !== data.status && data.status === 'completed') {
    // Animation subtile pour indiquer l'achèvement
    if (uiElements.item) {
      uiElements.item.classList.add('download-completed-animation');
      setTimeout(() => {
        uiElements.item.classList.remove('download-completed-animation');
      }, 1500);
    }

    // Notifier l'achèvement pour des actions potentielles au niveau de l'application
    publishEvent('DOWNLOAD_COMPLETED_NOTIFICATION', {
      downloadId: downloadData.id,
      title: downloadData.title,
      outputPath: downloadData.outputPath
    });
  }
}

/**
 * Gestionnaire pour les mises à jour de métadonnées
 * @param {Object} data - Données de l'événement
 */
function handleMetadataUpdate(data) {
  // Vérifier que l'événement concerne cet élément
  if (data.downloadId !== downloadData.id) return;

  // Mettre à jour les données locales avec les nouvelles métadonnées
  if (data.title) downloadData.title = data.title;
  if (data.artist) downloadData.artist = data.artist;
  if (data.album) downloadData.album = data.album;
  if (data.genre) downloadData.genre = data.genre;
  if (data.thumbnailPath) downloadData.thumbnailPath = data.thumbnailPath;
  if (data.outputPath) downloadData.outputPath = data.outputPath;

  // Mettre à jour l'interface
  updateMetadataDisplay();
}

/**
 * Gestionnaire pour les demandes de suppression
 * @param {Object} data - Données de l'événement
 */
function handleRemoveRequest(data) {
  // Vérifier que l'événement concerne cet élément
  if (data.downloadId !== downloadData.id) return;

  // Animation de sortie
  if (uiElements.item) {
    uiElements.item.classList.add('download-remove-animation');

    // Supprimer l'élément du DOM après l'animation
    setTimeout(() => {
      if (containerEl.contains(uiElements.item)) {
        containerEl.removeChild(uiElements.item);
      }

      // Désabonner des événements
      unsubscribeFromEvents();

      // Informer que la suppression est terminée
      publishEvent('DOWNLOAD_ITEM_REMOVED', {
        downloadId: downloadData.id
      });
    }, 300);
  }
}

/**
 * Gestionnaire pour les changements de format audio
 * @param {Object} data - Données de l'événement
 */
function handleFormatChange(data) {
  // Vérifier que l'événement concerne cet élément
  if (data.downloadId !== downloadData.id) return;

  // Mettre à jour les données locales
  downloadData.format = data.format;

  // Mettre à jour l'interface
  if (uiElements.formatSelector) {
    uiElements.formatSelector.querySelector('span').textContent = data.format.toUpperCase();
  }
}

/**
 * Gestionnaire pour les erreurs spécifiques à ce téléchargement
 * @param {Object} data - Données de l'événement
 */
function handleError(data) {
  // Vérifier que l'événement concerne cet élément
  if (data.downloadId !== downloadData.id) return;

  // Mettre à jour les données locales
  downloadData.status = 'error';
  downloadData.errorMessage = data.message || 'Erreur inconnue';

  // Mettre à jour l'interface
  updateStatusIndicator();

  if (uiElements.status) {
    uiElements.status.textContent = downloadData.errorMessage;
    uiElements.status.style.display = 'block';
    uiElements.status.style.color = '#ff6b6b';
  }

  if (uiElements.actionButton) {
    uiElements.actionButton.innerHTML = getButtonIconForStatus('error');
  }
}

/**
 * Gestionnaire pour les demandes d'actualisation de l'interface
 * @param {Object} data - Données de l'événement
 */
function handleRefreshRequest(data) {
  // Si la demande est globale ou spécifique à cet élément
  if (!data.downloadId || data.downloadId === downloadData.id) {
    updateMetadataDisplay();
    updateStatusIndicator();
  }
}

/**
 * Se désabonne de tous les événements
 */
function unsubscribeFromEvents() {
  if (!eventBus) return;

  eventBus.off('DOWNLOAD_PROGRESS_UPDATED', handleProgressUpdate);
  eventBus.off('DOWNLOAD_STATUS_CHANGED', handleStatusChange);
  eventBus.off('DOWNLOAD_METADATA_UPDATED', handleMetadataUpdate);
  eventBus.off('DOWNLOAD_ITEM_REMOVE_REQUESTED', handleRemoveRequest);
  eventBus.off('DOWNLOAD_FORMAT_CHANGED', handleFormatChange);
  eventBus.off('DOWNLOAD_ERROR', handleError);
  eventBus.off('UI_REFRESH_REQUESTED', handleRefreshRequest);
}

/**
 * Met à jour l'affichage des métadonnées dans l'interface
 */
function updateMetadataDisplay() {
  if (!uiElements) return;

  if (uiElements.title) {
    uiElements.title.textContent = downloadData.title || 'Sans titre';
  }

  if (uiElements.artist) {
    uiElements.artist.textContent = downloadData.artist || 'Artiste inconnu';
  }

  if (uiElements.album) {
    uiElements.album.textContent = downloadData.album || '';
  }

  if (uiElements.thumbnail) {
    uiElements.thumbnail.src = downloadData.thumbnailPath || getDefaultThumbnailForSource(downloadData.source);
  }
}

/**
 * Met à jour l'indicateur de statut dans l'interface
 */
function updateStatusIndicator() {
  if (!uiElements) return;

  const isErrorOrPaused = ['error', 'paused'].includes(downloadData.status);

  if (uiElements.status) {
    uiElements.status.style.display = isErrorOrPaused ? 'block' : 'none';

    if (downloadData.status === 'error') {
      uiElements.status.textContent = downloadData.errorMessage || 'Erreur de téléchargement';
      uiElements.status.style.color = '#ff6b6b';
    } else if (downloadData.status === 'paused') {
      uiElements.status.textContent = 'En pause';
      uiElements.status.style.color = '#f0f0f0';
    }
  }
}

/**
 * Récupère l'icône HTML appropriée pour le bouton d'action selon le statut
 * @param {string} status - Statut du téléchargement
 * @returns {string} HTML de l'icône
 */
function getButtonIconForStatus(status) {
  switch (status) {
    case 'pending':
      // Icône de téléchargement
      return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 2V10M7 10L4 7M7 10L10 7" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 12H11" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>';

    case 'downloading':
      // Icône de pause
      return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="3" width="3" height="10" rx="1" fill="white"/><rect x="9" y="3" width="3" height="10" rx="1" fill="white"/></svg>';

    case 'paused':
      // Icône de reprise
      return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 3L12 8L5 13V3Z" fill="white"/></svg>';

    case 'completed':
      // Icône de dossier ouvert
      return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 12V4C2 3.44772 2.44772 3 3 3H6.5L8 4.5H13C13.5523 4.5 14 4.94772 14 5.5V12C14 12.5523 13.5523 13 13 13H3C2.44772 13 2 12.5523 2 12Z" stroke="white" stroke-width="1.5"/></svg>';

    case 'error':
      // Icône de réessai
      return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 8C3 5.23858 5.23858 3 8 3C10.7614 3 13 5.23858 13 8C13 10.7614 10.7614 13 8 13" stroke="white" stroke-width="1.5" stroke-linecap="round"/><path d="M8 1V5M12 8H8" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg>';

    default:
      // Icône par défaut (téléchargement)
      return '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 2V10M7 10L4 7M7 10L10 7" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 12H11" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>';
  }
}

/**
 * Récupère l'URL d'une miniature par défaut selon la source
 * @param {string} source - Source du téléchargement
 * @returns {string} URL de l'image par défaut
 */
function getDefaultThumbnailForSource(source) {
  // Utilise des SVG intégrés pour éviter toute dépendance sur des fichiers externes
  switch (source) {
    case 'youtube':
      return 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI3MCIgaGVpZ2h0PSI3MCIgdmlld0JveD0iMCAwIDcwIDcwIj48cmVjdCB3aWR0aD0iNzAiIGhlaWdodD0iNzAiIGZpbGw9IiMxZGEwYzMiLz48Y2lyY2xlIGN4PSIzNSIgY3k9IjM1IiByPSIyNSIgZmlsbD0iI2ZmZiIvPjxjaXJjbGUgY3g9IjM1IiBjeT0iMzUiIHI9IjE1IiBmaWxsPSIjMWRhMGMzIi8+PC9zdmc+';

    case 'soundcloud':
      return 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI3MCIgaGVpZ2h0PSI3MCIgdmlld0JveD0iMCAwIDcwIDcwIj48cmVjdCB3aWR0aD0iNzAiIGhlaWdodD0iNzAiIGZpbGw9IiNGRjc3MDAiLz48cGF0aCBkPSJNMTUgNDAgQzE1IDQwIDIwIDM1IDI1IDQwIEMyNSA0MCAzMCAzNSAzNSA0MCBDMzUgNDAgNDAgMzUgNDUgNDAgQzQ1IDQwIDUwIDM1IDU1IDQwIEw1NSA1MCBMMTU1MCIgZmlsbD0iI2ZmZiIvPjwvc3ZnPg==';

    case 'tidal':
      return 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI3MCIgaGVpZ2h0PSI3MCIgdmlld0JveD0iMCAwIDcwIDcwIj48cmVjdCB3aWR0aD0iNzAiIGhlaWdodD0iNzAiIGZpbGw9IiMwMDAiLz48cGF0aCBkPSJNMzUgMTUgTDI1IDI1IEwxNSAzNSBMMjUgNDUgTDM1IDM1IEw0NSA0NSBMNTUgMzUgTDQ1IDI1IFoiIGZpbGw9IiNmZmYiLz48L3N2Zz4=';

    default:
      // Image par défaut générique
      return 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI3MCIgaGVpZ2h0PSI3MCIgdmlld0JveD0iMCAwIDcwIDcwIj48cmVjdCB3aWR0aD0iNzAiIGhlaWdodD0iNzAiIGZpbGw9IiM4ODg4ODgiLz48Y2lyY2xlIGN4PSIzNSIgY3k9IjM1IiByPSIyMCIgZmlsbD0iI2ZmZiIvPjxjaXJjbGUgY3g9IjM1IiBjeT0iMzUiIHI9IjEwIiBmaWxsPSIjODg4ODg4Ii8+PC9zdmc+';
  }
}IDcwIj48cmVjdCB3aWR0aD0iNzAiIGhlaWdodD0iNzAiIGZpbGw9IiNlZTAwMDAiLz48Y2lyY2xlIGN4PSIzNSIgY3k9IjM1IiByPSIyMCIgZmlsbD0iI2ZmZiIvPjxwb2x5Z29uIHBvaW50cz0iMjgsMjUgNDUsNTUgMjUsNDUiIGZpbGw9IiNlZTAwMDAiLz48L3N2Zz4=';

    case 'spotify':
      return 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI3MCIgaGVpZ2h0PSI3MCIgdmlld0JveD0iMCAwIDcwIDcwIj48cmVjdCB3aWR0aD0iNzAiIGhlaWdodD0iNzAiIGZpbGw9IiMxREI5NTQiLz48Y2lyY2xlIGN4PSIzNSIgY3k9IjM1IiByPSIyOCIgZmlsbD0iIzAwMCIvPjxwYXRoIGQ9Ik0yNSAyNSBDNDUgMjAgNTAgMzUgNTAgMzUgQzM1IDQwIDI1IDMwIDI1IDMwIFoiIGZpbGw9IiMxREI5NTQiLz48cGF0aCBkPSJNMjUgMzUgQzQ1IDMwIDUwIDQ1IDUwIDQ1IEMzNSA1MCAyNSA0MCAyNSA0MCBaIiBmaWxsPSIjMURCOTU0Ii8+PHBhdGggZD0iTTI1IDQ1IEM0NSA0MCA1MCA1NSA1MCA1NSBDMzUgNjAgMjUgNTAgMjUgNTAgWiIgZmlsbD0iIzFEQjk1NCIvPjwvc3ZnPg==';

    case 'bandcamp':
      return 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI3MCIgaGVpZ2h0PSI3MCIgdmlld0JveD0iMCAwIDcw// Composant d'élément de téléchargement
// Créé automatiquement le 2025-05-02

