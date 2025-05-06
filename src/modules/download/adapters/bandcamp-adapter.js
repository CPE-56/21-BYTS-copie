/**
 * @fileoverview Bandcamp Adapter pour l'application 21 BYTS
 * @description Ce module gère le téléchargement de fichiers audio depuis Bandcamp.
 * Il implémente l'interface standardisée pour tous les adaptateurs de plateforme.
 * Ce module fonctionne de manière totalement autonome et communique exclusivement
 * via le bus d'événements central.
 *
 * @module modules/download/adapters/bandcamp-adapter
 * @requires electron
 * @requires child_process
 * @requires fs
 * @requires path
 *
 * @events
 * ÉCOUTE:
 * - DOWNLOAD_REQUEST: Lorsqu'une demande de téléchargement pour Bandcamp est reçue
 * - BANDCAMP_DOWNLOAD_CANCEL: Pour annuler un téléchargement en cours
 * - BANDCAMP_DOWNLOAD_PAUSE: Pour suspendre temporairement un téléchargement
 * - BANDCAMP_DOWNLOAD_RESUME: Pour reprendre un téléchargement suspendu
 * - CONFIG_UPDATED: Pour mettre à jour les paramètres de configuration
 *
 * ÉMET:
 * - DOWNLOAD_STARTED: Lorsqu'un téléchargement commence
 * - DOWNLOAD_PROGRESS: Pour signaler la progression d'un téléchargement en cours
 * - DOWNLOAD_COMPLETED: Lorsqu'un téléchargement est terminé avec succès
 * - DOWNLOAD_ERROR: En cas d'erreur durant le téléchargement
 * - DOWNLOAD_CANCELLED: Lorsqu'un téléchargement est annulé
 * - DOWNLOAD_PAUSED: Lorsqu'un téléchargement est suspendu
 * - DOWNLOAD_RESUMED: Lorsqu'un téléchargement est repris
 * - METADATA_EXTRACTED: Lorsque les métadonnées sont extraites
 * - LOG_INFO: Pour journaliser des informations
 * - LOG_ERROR: Pour journaliser des erreurs
 * - ERROR_OCCURRED: Pour signaler une erreur système
 */

// Imports des modules standards Node.js/Electron
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { shell } = require('electron');
const crypto = require('crypto');

// Configuration par défaut (sera mise à jour via les événements CONFIG_UPDATED)
let config = {
  downloadFolder: '',
  defaultFormat: 'mp3',
  maxRetryAttempts: 3,
  ytDlpPath: '',
  ffmpegPath: '',
  concurrentDownloads: 2,
  bandcampOptions: {
    highQuality: true,
    includeArtwork: true
  }
};

// Variables de suivi des téléchargements
const activeDownloads = new Map();
let eventBus = null;

/**
 * Initialise l'adaptateur Bandcamp.
 * Cette fonction est appelée automatiquement lorsque le module est chargé.
 *
 * @param {Object} bus - Le bus d'événements central
 */
function initialize(bus) {
  if (!bus) {
    console.error("BandcampAdapter: Bus d'événements non fourni à l'initialisation");
    return;
  }

  eventBus = bus;

  // Enregistrement aux événements pertinents
  eventBus.on('DOWNLOAD_REQUEST', handleDownloadRequest);
  eventBus.on('BANDCAMP_DOWNLOAD_CANCEL', handleCancelRequest);
  eventBus.on('BANDCAMP_DOWNLOAD_PAUSE', handlePauseRequest);
  eventBus.on('BANDCAMP_DOWNLOAD_RESUME', handleResumeRequest);
  eventBus.on('CONFIG_UPDATED', updateConfig);

  // Émission d'un événement pour signaler que l'adaptateur est prêt
  eventBus.emit('LOG_INFO', {
    source: 'BandcampAdapter',
    message: 'Adaptateur Bandcamp initialisé'
  });

  // Demande initiale de configuration
  eventBus.emit('CONFIG_REQUEST', {
    source: 'BandcampAdapter',
    configKeys: ['downloadFolder', 'defaultFormat', 'ytDlpPath', 'ffmpegPath', 'bandcampOptions']
  });
}

/**
 * Met à jour la configuration de l'adaptateur.
 *
 * @param {Object} configUpdate - Les nouvelles valeurs de configuration
 */
function updateConfig(configUpdate) {
  if (configUpdate && typeof configUpdate === 'object') {
    // Ne mettre à jour que les clés pertinentes pour cet adaptateur
    Object.keys(configUpdate).forEach((key) => {
      if (config.hasOwnProperty(key)) {
        config[key] = configUpdate[key];
      }
    });

    // Log de confirmation
    eventBus.emit('LOG_INFO', {
      source: 'BandcampAdapter',
      message: 'Configuration mise à jour'
    });
  }
}

/**
 * Vérifie si l'URL est compatible avec Bandcamp.
 *
 * @param {string} url - L'URL à vérifier
 * @returns {boolean} true si l'URL est une URL Bandcamp valide
 */
function isValidBandcampUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.includes('bandcamp.com') || /\.bandcamp\.com$/.test(urlObj.hostname);
  } catch (error) {
    return false;
  }
}

/**
 * Traite une demande de téléchargement.
 *
 * @param {Object} request - Les détails de la demande de téléchargement
 */
function handleDownloadRequest(request) {
  // Ignore les demandes qui ne sont pas pour Bandcamp
  if (!request || !request.url || !isValidBandcampUrl(request.url)) {
    return;
  }

  const downloadId = crypto.randomUUID();
  const downloadFormat = request.format || config.defaultFormat;
  const downloadUrl = request.url;

  // Création d'un objet de suivi pour ce téléchargement
  const downloadInfo = {
    id: downloadId,
    url: downloadUrl,
    format: downloadFormat,
    status: 'initializing',
    progress: 0,
    filePath: null,
    process: null,
    startTime: Date.now(),
    metadata: null,
    retryCount: 0
  };

  activeDownloads.set(downloadId, downloadInfo);

  // Notification du démarrage de téléchargement
  eventBus.emit('DOWNLOAD_STARTED', {
    id: downloadId,
    source: 'bandcamp',
    url: downloadUrl,
    format: downloadFormat
  });

  // Démarrage du processus de téléchargement
  startDownload(downloadInfo);
}

/**
 * Lance le processus de téléchargement.
 *
 * @param {Object} downloadInfo - Les informations du téléchargement
 */
function startDownload(downloadInfo) {
  if (!config.downloadFolder || !config.ytDlpPath) {
    handleDownloadError(downloadInfo, new Error('Configuration incomplète'));
    return;
  }

  // D'abord, extraire les métadonnées pour l'affichage
  extractMetadata(downloadInfo)
    .then(() => {
      // Puis démarrer le téléchargement effectif
      performDownload(downloadInfo);
    })
    .catch((error) => {
      handleDownloadError(downloadInfo, error);
    });
}

/**
 * Extrait les métadonnées du fichier audio à partir de l'URL Bandcamp.
 *
 * @param {Object} downloadInfo - Les informations du téléchargement
 * @returns {Promise<void>} Une promesse résolue lorsque les métadonnées sont extraites
 */
function extractMetadata(downloadInfo) {
  return new Promise((resolve, reject) => {
    const ytDlpArgs = ['--dump-json', '--no-playlist', downloadInfo.url];

    const process = spawn(config.ytDlpPath, ytDlpArgs, { shell: true });
    let outputData = '';

    process.stdout.on('data', (data) => {
      outputData += data.toString();
    });

    process.stderr.on('data', (data) => {
      const errorMessage = data.toString();
      eventBus.emit('LOG_ERROR', {
        source: 'BandcampAdapter',
        message: `Erreur lors de l'extraction des métadonnées: ${errorMessage}`,
        downloadId: downloadInfo.id
      });
    });

    process.on('close', (code) => {
      if (code === 0 && outputData) {
        try {
          const metadataObj = JSON.parse(outputData);
          downloadInfo.metadata = {
            title: metadataObj.title || 'Titre inconnu',
            artist: metadataObj.artist || metadataObj.uploader || 'Artiste inconnu',
            album: metadataObj.album || '',
            thumbnail: metadataObj.thumbnail || '',
            duration: metadataObj.duration || 0
          };

          // Émettre un événement avec les métadonnées extraites
          eventBus.emit('METADATA_EXTRACTED', {
            id: downloadInfo.id,
            metadata: downloadInfo.metadata
          });

          resolve();
        } catch (error) {
          reject(new Error(`Impossible de parser les métadonnées: ${error.message}`));
        }
      } else {
        reject(new Error(`Extraction des métadonnées échouée avec le code: ${code}`));
      }
    });
  });
}

/**
 * Effectue le téléchargement du fichier audio.
 *
 * @param {Object} downloadInfo - Les informations du téléchargement
 */
function performDownload(downloadInfo) {
  const outputTemplate = path.join(config.downloadFolder, '%(artist)s - %(title)s.%(ext)s');

  // Construction des arguments pour yt-dlp
  const ytDlpArgs = [
    '--no-playlist',
    '--extract-audio',
    `--audio-format=${downloadInfo.format}`,
    '--audio-quality=0', // Meilleure qualité
    '--embed-thumbnail',
    '--add-metadata',
    '--output',
    outputTemplate,
    downloadInfo.url
  ];

  if (config.bandcampOptions.highQuality) {
    ytDlpArgs.push('--prefer-free-formats');
  }

  // Mise à jour du statut
  downloadInfo.status = 'downloading';
  activeDownloads.set(downloadInfo.id, downloadInfo);

  // Lancement du processus de téléchargement
  const process = spawn(config.ytDlpPath, ytDlpArgs, { shell: true });
  downloadInfo.process = process;

  // Gestion des données de sortie pour suivre la progression
  let progressPattern = /\[download\]\s+(\d+\.?\d*)%/;
  let filePathPattern = /\[Metadata\] Adding metadata to '(.+?)'/;

  process.stdout.on('data', (data) => {
    const output = data.toString();

    // Analyse de la progression
    const progressMatch = output.match(progressPattern);
    if (progressMatch && progressMatch[1]) {
      const progressPercent = parseFloat(progressMatch[1]);
      downloadInfo.progress = progressPercent;

      // Émission d'un événement de progression
      eventBus.emit('DOWNLOAD_PROGRESS', {
        id: downloadInfo.id,
        progress: progressPercent
      });
    }

    // Capture du chemin du fichier de sortie
    const filePathMatch = output.match(filePathPattern);
    if (filePathMatch && filePathMatch[1]) {
      downloadInfo.filePath = filePathMatch[1];
    }
  });

  process.stderr.on('data', (data) => {
    const errorOutput = data.toString();

    // Certaines sorties d'erreur peuvent être des avertissements, les journaliser
    eventBus.emit('LOG_INFO', {
      source: 'BandcampAdapter',
      message: `Sortie stderr de yt-dlp: ${errorOutput}`,
      downloadId: downloadInfo.id
    });
  });

  process.on('close', (code) => {
    if (code === 0) {
      // Téléchargement réussi
      handleDownloadSuccess(downloadInfo);
    } else if (downloadInfo.status === 'cancelled') {
      // Le téléchargement a été annulé, rien à faire
    } else if (downloadInfo.retryCount < config.maxRetryAttempts) {
      // Tentative de nouvelle essai
      downloadInfo.retryCount++;
      downloadInfo.status = 'retrying';
      activeDownloads.set(downloadInfo.id, downloadInfo);

      eventBus.emit('LOG_INFO', {
        source: 'BandcampAdapter',
        message: `Tentative de reprise du téléchargement (${downloadInfo.retryCount}/${config.maxRetryAttempts})`,
        downloadId: downloadInfo.id
      });

      setTimeout(() => {
        performDownload(downloadInfo);
      }, 2000); // Attendre 2 secondes avant de réessayer
    } else {
      // Échec après plusieurs tentatives
      handleDownloadError(downloadInfo, new Error(`Échec du téléchargement avec le code: ${code}`));
    }
  });
}

/**
 * Gère un téléchargement réussi.
 *
 * @param {Object} downloadInfo - Les informations du téléchargement
 */
function handleDownloadSuccess(downloadInfo) {
  downloadInfo.status = 'completed';
  downloadInfo.progress = 100;
  activeDownloads.set(downloadInfo.id, downloadInfo);

  // Vérifier que le fichier existe réellement
  if (downloadInfo.filePath && fs.existsSync(downloadInfo.filePath)) {
    // Émission d'un événement de complétion
    eventBus.emit('DOWNLOAD_COMPLETED', {
      id: downloadInfo.id,
      filePath: downloadInfo.filePath,
      metadata: downloadInfo.metadata
    });

    eventBus.emit('LOG_INFO', {
      source: 'BandcampAdapter',
      message: `Téléchargement terminé: ${downloadInfo.metadata.artist} - ${downloadInfo.metadata.title}`,
      downloadId: downloadInfo.id
    });
  } else {
    // Le fichier n'existe pas malgré un code de sortie 0, c'est une erreur
    handleDownloadError(downloadInfo, new Error('Fichier non trouvé après téléchargement'));
  }
}

/**
 * Gère une erreur de téléchargement.
 *
 * @param {Object} downloadInfo - Les informations du téléchargement
 * @param {Error} error - L'erreur rencontrée
 */
function handleDownloadError(downloadInfo, error) {
  downloadInfo.status = 'error';
  activeDownloads.set(downloadInfo.id, downloadInfo);

  // Émission d'un événement d'erreur
  eventBus.emit('DOWNLOAD_ERROR', {
    id: downloadInfo.id,
    error: error.message,
    details: error.stack
  });

  eventBus.emit('LOG_ERROR', {
    source: 'BandcampAdapter',
    message: `Erreur de téléchargement: ${error.message}`,
    downloadId: downloadInfo.id,
    error: error
  });

  // Signalement d'une erreur système
  eventBus.emit('ERROR_OCCURRED', {
    source: 'BandcampAdapter',
    type: 'DOWNLOAD_FAILURE',
    message: `Échec du téléchargement depuis Bandcamp: ${error.message}`,
    details: {
      url: downloadInfo.url,
      id: downloadInfo.id
    }
  });
}

/**
 * Gère une demande d'annulation de téléchargement.
 *
 * @param {Object} request - Les détails de la demande d'annulation
 */
function handleCancelRequest(request) {
  if (!request || !request.id) return;

  const downloadInfo = activeDownloads.get(request.id);
  if (!downloadInfo) {
    eventBus.emit('LOG_INFO', {
      source: 'BandcampAdapter',
      message: `Tentative d'annulation d'un téléchargement inexistant: ${request.id}`
    });
    return;
  }

  // Si le téléchargement est déjà terminé ou en erreur, ignorer
  if (downloadInfo.status === 'completed' || downloadInfo.status === 'error') {
    return;
  }

  // Arrêt du processus de téléchargement
  if (downloadInfo.process) {
    try {
      downloadInfo.process.kill();
    } catch (error) {
      eventBus.emit('LOG_ERROR', {
        source: 'BandcampAdapter',
        message: `Erreur lors de l'arrêt du processus: ${error.message}`,
        downloadId: downloadInfo.id
      });
    }
  }

  // Mise à jour du statut
  downloadInfo.status = 'cancelled';
  activeDownloads.set(downloadInfo.id, downloadInfo);

  // Émission d'un événement d'annulation
  eventBus.emit('DOWNLOAD_CANCELLED', {
    id: downloadInfo.id
  });

  eventBus.emit('LOG_INFO', {
    source: 'BandcampAdapter',
    message: `Téléchargement annulé: ${downloadInfo.url}`,
    downloadId: downloadInfo.id
  });
}

/**
 * Gère une demande de pause du téléchargement.
 * Note: yt-dlp ne supporte pas nativement la pause/reprise.
 * Cette implémentation est donc une approximation.
 *
 * @param {Object} request - Les détails de la demande de pause
 */
function handlePauseRequest(request) {
  if (!request || !request.id) return;

  const downloadInfo = activeDownloads.get(request.id);
  if (!downloadInfo || downloadInfo.status !== 'downloading') {
    return;
  }

  // Arrêt du processus actuel (pour le reprendre plus tard)
  if (downloadInfo.process) {
    try {
      downloadInfo.process.kill();

      // Mise à jour du statut
      downloadInfo.status = 'paused';
      activeDownloads.set(downloadInfo.id, downloadInfo);

      // Émission d'un événement de pause
      eventBus.emit('DOWNLOAD_PAUSED', {
        id: downloadInfo.id
      });

      eventBus.emit('LOG_INFO', {
        source: 'BandcampAdapter',
        message: `Téléchargement mis en pause: ${downloadInfo.url}`,
        downloadId: downloadInfo.id
      });
    } catch (error) {
      eventBus.emit('LOG_ERROR', {
        source: 'BandcampAdapter',
        message: `Erreur lors de la mise en pause: ${error.message}`,
        downloadId: downloadInfo.id
      });
    }
  }
}

/**
 * Gère une demande de reprise du téléchargement.
 *
 * @param {Object} request - Les détails de la demande de reprise
 */
function handleResumeRequest(request) {
  if (!request || !request.id) return;

  const downloadInfo = activeDownloads.get(request.id);
  if (!downloadInfo || downloadInfo.status !== 'paused') {
    return;
  }

  // Mise à jour du statut
  downloadInfo.status = 'resuming';
  activeDownloads.set(downloadInfo.id, downloadInfo);

  // Émission d'un événement de reprise
  eventBus.emit('DOWNLOAD_RESUMED', {
    id: downloadInfo.id
  });

  eventBus.emit('LOG_INFO', {
    source: 'BandcampAdapter',
    message: `Reprise du téléchargement: ${downloadInfo.url}`,
    downloadId: downloadInfo.id
  });

  // Redémarrer le téléchargement à partir de zéro
  // (yt-dlp va automatiquement reprendre là où il s'était arrêté s'il trouve un fichier partiel)
  performDownload(downloadInfo);
}

/**
 * Nettoie les ressources utilisées par l'adaptateur.
 * Cette fonction devrait être appelée lors de la fermeture de l'application.
 */
function cleanup() {
  // Arrêter tous les téléchargements actifs
  for (const [id, downloadInfo] of activeDownloads.entries()) {
    if (downloadInfo.process && downloadInfo.status === 'downloading') {
      try {
        downloadInfo.process.kill();

        eventBus.emit('LOG_INFO', {
          source: 'BandcampAdapter',
          message: `Arrêt du téléchargement lors du nettoyage: ${downloadInfo.url}`,
          downloadId: id
        });
      } catch (error) {
        eventBus.emit('LOG_ERROR', {
          source: 'BandcampAdapter',
          message: `Erreur lors de l'arrêt du téléchargement: ${error.message}`,
          downloadId: id
        });
      }
    }
  }

  // Se désabonner des événements
  if (eventBus) {
    eventBus.off('DOWNLOAD_REQUEST', handleDownloadRequest);
    eventBus.off('BANDCAMP_DOWNLOAD_CANCEL', handleCancelRequest);
    eventBus.off('BANDCAMP_DOWNLOAD_PAUSE', handlePauseRequest);
    eventBus.off('BANDCAMP_DOWNLOAD_RESUME', handleResumeRequest);
    eventBus.off('CONFIG_UPDATED', updateConfig);

    eventBus.emit('LOG_INFO', {
      source: 'BandcampAdapter',
      message: 'Adaptateur Bandcamp nettoyé'
    });
  }

  // Réinitialiser les variables internes
  activeDownloads.clear();
}

// Exposer uniquement la fonction d'initialisation
module.exports = {
  initialize,
  cleanup
};

/**
 * Exemples d'utilisation:
 *
 * // Initialisation de l'adaptateur
 * const eventBus = require('path/to/event-bus');
 * const bandcampAdapter = require('path/to/bandcamp-adapter');
 * bandcampAdapter.initialize(eventBus);
 *
 * // Déclenchement d'un téléchargement via événement
 * eventBus.emit('DOWNLOAD_REQUEST', {
 *   url: 'https://artist.bandcamp.com/track/song-name',
 *   format: 'mp3'
 * });
 *
 * // Annulation d'un téléchargement
 * eventBus.emit('BANDCAMP_DOWNLOAD_CANCEL', {
 *   id: 'download-id-to-cancel'
 * });
 */ // Adaptateur pour Bandcamp
// Créé automatiquement le 2025-05-02
