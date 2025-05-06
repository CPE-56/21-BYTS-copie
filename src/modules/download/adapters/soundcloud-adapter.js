/**
 * @fileoverview SoundCloud Adapter for 21 BYTS Audio Downloader
 * @description Gère le téléchargement des fichiers audio depuis SoundCloud.
 * Ce module fonctionne de manière autonome et communique exclusivement
 * via le bus d'événements central.
 *
 * @module modules/download/adapters/soundcloud-adapter
 * @requires electron
 * @requires child_process
 * @requires path
 * @requires fs
 *
 * @events
 * Écoutés:
 * - DOWNLOAD_REQUEST_SOUNDCLOUD: Déclenche le téléchargement d'une URL SoundCloud
 * - DOWNLOAD_CANCEL: Annule un téléchargement en cours
 * - APP_SHUTDOWN: Nettoie les ressources avant la fermeture
 * - CONFIG_UPDATED: Reçoit les mises à jour de configuration
 *
 * Émis:
 * - DOWNLOAD_STARTED: Signale le début d'un téléchargement
 * - DOWNLOAD_PROGRESS: Mise à jour de la progression (pourcentage, vitesse)
 * - DOWNLOAD_COMPLETED: Signale la fin d'un téléchargement réussi
 * - DOWNLOAD_ERROR: Signale une erreur lors du téléchargement
 * - METADATA_EXTRACTED: Envoie les métadonnées extraites du fichier
 * - LOG_INFO: Informations de journalisation
 * - LOG_ERROR: Erreurs de journalisation
 */

const { app } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

/**
 * Adaptateur pour le téléchargement depuis SoundCloud
 */
class SoundCloudAdapter {
  /**
   * Crée une nouvelle instance de l'adaptateur SoundCloud
   */
  constructor() {
    this.downloads = new Map(); // Map des téléchargements actifs
    this.config = {
      outputPath: app.getPath('music'),
      format: 'mp3',
      quality: '320k',
      maxRetries: 3,
      ytDlpPath: '', // Sera mis à jour via les événements de configuration
      ffmpegPath: '', // Sera mis à jour via les événements de configuration
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };

    this.eventBus = null; // Sera défini lors de l'initialisation
  }

  /**
   * Initialise l'adaptateur SoundCloud
   * @param {Object} eventBus - Le bus d'événements central
   */
  initialize(eventBus) {
    if (!eventBus) {
      throw new Error('SoundCloudAdapter: eventBus est requis pour l'initialisation');
    }

    this.eventBus = eventBus;

    // S'abonner aux événements pertinents
    this._subscribeToEvents();

    // Signaler que l'adaptateur est prêt
    this.eventBus.publish('MODULE_READY', {
      module: 'soundcloud-adapter',
      capabilities: ['audio-download', 'metadata-extraction', 'playlist-support']
    });

    this._logInfo('SoundCloudAdapter initialisé avec succès');
  }

  /**
   * S'abonne aux événements du bus d'événements
   * @private
   */
  _subscribeToEvents() {
    if (!this.eventBus) return;

    // Écouter les demandes de téléchargement SoundCloud
    this.eventBus.subscribe('DOWNLOAD_REQUEST_SOUNDCLOUD', this._handleDownloadRequest.bind(this));

    // Écouter les demandes d'annulation
    this.eventBus.subscribe('DOWNLOAD_CANCEL', this._handleCancelRequest.bind(this));

    // Écouter les mises à jour de configuration
    this.eventBus.subscribe('CONFIG_UPDATED', this._handleConfigUpdate.bind(this));

    // Nettoyage lors de la fermeture de l'application
    this.eventBus.subscribe('APP_SHUTDOWN', this._cleanup.bind(this));
  }

  /**
   * Gère une demande de téléchargement
   * @param {Object} data - Données de la demande
   * @param {string} data.url - URL SoundCloud à télécharger
   * @param {string} data.format - Format de sortie (mp3, flac, etc.)
   * @param {string} data.requestId - Identifiant unique de la demande
   * @private
   */
  _handleDownloadRequest(data) {
    if (!data || !data.url || !data.requestId) {
      this._emitError(data?.requestId, 'INVALID_REQUEST', 'Données de requête invalides');
      return;
    }

    // Vérifier si l'URL est valide pour SoundCloud
    if (!this._isSoundCloudUrl(data.url)) {
      this._emitError(data.requestId, 'INVALID_URL', 'URL SoundCloud invalide');
      return;
    }

    // Générer un ID unique pour ce téléchargement si non fourni
    const downloadId = data.downloadId || crypto.randomUUID();

    // Format de sortie (utiliser celui de la demande ou la configuration par défaut)
    const format = data.format || this.config.format;

    // Créer un objet de téléchargement avec les informations
    const downloadInfo = {
      id: downloadId,
      requestId: data.requestId,
      url: data.url,
      format: format,
      status: 'initializing',
      progress: 0,
      startTime: Date.now(),
      process: null,
      metadata: null,
      outputPath: null,
      finalFilePath: null,
      error: null,
      retryCount: 0
    };

    // Stocker dans la map des téléchargements actifs
    this.downloads.set(downloadId, downloadInfo);

    // Émettre un événement indiquant que le téléchargement a commencé
    this.eventBus.publish('DOWNLOAD_STARTED', {
      requestId: data.requestId,
      downloadId: downloadId,
      url: data.url,
      source: 'soundcloud',
      format: format
    });

    // Démarrer le processus de téléchargement
    this._startDownload(downloadId);
  }

  /**
   * Démarre le processus de téléchargement
   * @param {string} downloadId - Identifiant du téléchargement
   * @private
   */
  _startDownload(downloadId) {
    const downloadInfo = this.downloads.get(downloadId);

    if (!downloadInfo) {
      this._logError(`Téléchargement introuvable pour l'ID: ${downloadId}`);
      return;
    }

    // Mettre à jour le statut
    downloadInfo.status = 'downloading';

    // Créer un répertoire temporaire pour le téléchargement
    const tempDir = path.join(app.getPath('temp'), '21byts', 'downloads', downloadId);
    fs.mkdirSync(tempDir, { recursive: true });

    downloadInfo.outputPath = tempDir;

    try {
      this._downloadWithYtDlp(downloadInfo);
    } catch (error) {
      this._handleDownloadError(downloadInfo, error);
    }
  }

  /**
   * Exécute le téléchargement via yt-dlp
   * @param {Object} downloadInfo - Informations du téléchargement
   * @private
   */
  _downloadWithYtDlp(downloadInfo) {
    // Vérifier si le chemin vers yt-dlp est configuré
    if (!this.config.ytDlpPath) {
      this._emitError(
        downloadInfo.requestId,
        'CONFIGURATION_ERROR',
        'Chemin vers yt-dlp non configuré'
      );
      return;
    }

    // Préparer les arguments pour yt-dlp
    const outputTemplate = path.join(downloadInfo.outputPath, '%(title)s.%(ext)s');
    const args = [
      '--extract-audio',
      '--audio-format', downloadInfo.format,
      '--audio-quality', this.config.quality,
      '--add-metadata',
      '--embed-thumbnail',
      '--no-playlist', // Télécharger uniquement la piste, pas la playlist entière
      '--output', outputTemplate,
      '--user-agent', this.config.userAgent,
      '--write-info-json', // Écrire les métadonnées dans un fichier JSON
      downloadInfo.url
    ];

    // Si c'est un téléchargement de playlist explicitement demandé
    if (downloadInfo.isPlaylist) {
      // Remplacer --no-playlist par --yes-playlist
      const noPlaylistIndex = args.indexOf('--no-playlist');
      if (noPlaylistIndex !== -1) {
        args[noPlaylistIndex] = '--yes-playlist';
        // Limiter à 200 éléments
        args.push('--playlist-items', '1-200');
      }
    }

    this._logInfo(`Démarrage du téléchargement SoundCloud: ${downloadInfo.url}`);

    // Lancer le processus yt-dlp
    const process = spawn(this.config.ytDlpPath, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // Stocker le processus dans les informations de téléchargement
    downloadInfo.process = process;

    // Gérer la sortie standard (stdout)
    process.stdout.on('data', (data) => {
      this._parseYtDlpOutput(downloadInfo, data.toString());
    });

    // Gérer la sortie d'erreur (stderr)
    process.stderr.on('data', (data) => {
      const errorOutput = data.toString();
      this._logError(`Erreur yt-dlp pour ${downloadInfo.id}: ${errorOutput}`);

      // Ne pas considérer tous les messages stderr comme des erreurs fatales
      // certains sont juste des avertissements
      if (errorOutput.includes('ERROR:')) {
        downloadInfo.error = errorOutput;
      }
    });

    // Gérer la fin du processus
    process.on('close', (code) => {
      this._handleProcessClose(downloadInfo, code);
    });

    // Gérer les erreurs du processus
    process.on('error', (error) => {
      this._handleDownloadError(downloadInfo, error);
    });
  }

  /**
   * Parse la sortie de yt-dlp pour extraire les informations de progression
   * @param {Object} downloadInfo - Informations du téléchargement
   * @param {string} output - Sortie de yt-dlp
   * @private
   */
  _parseYtDlpOutput(downloadInfo, output) {
    // Rechercher les informations de progression
    const progressMatch = output.match(/(\d+\.?\d*)% of ~?(\d+\.?\d*)(\w+) at\s+(\d+\.?\d*)(\w+)\/s/);

    if (progressMatch) {
      const percentage = parseFloat(progressMatch[1]);
      const size = parseFloat(progressMatch[2]);
      const sizeUnit = progressMatch[3];
      const speed = parseFloat(progressMatch[4]);
      const speedUnit = progressMatch[5];

      // Mettre à jour la progression
      downloadInfo.progress = percentage / 100;

      // Publier un événement de progression
      this.eventBus.publish('DOWNLOAD_PROGRESS', {
        requestId: downloadInfo.requestId,
        downloadId: downloadInfo.id,
        progress: downloadInfo.progress,
        percentage: percentage,
        size: `${size}${sizeUnit}`,
        speed: `${speed}${speedUnit}/s`,
        source: 'soundcloud'
      });
    }

    // Rechercher les informations de destination
    const destinationMatch = output.match(/Destination:\s+(.+)/);
    if (destinationMatch) {
      downloadInfo.finalFilePath = destinationMatch[1];
    }

    // Rechercher les informations de métadonnées
    if (output.includes('Writing video thumbnail') || output.includes('Writing thumbnail')) {
      // Les métadonnées sont traitées, la recherche et extraction des métadonnées
      // seront faites après le téléchargement complet
    }
  }

  /**
   * Gère la fermeture du processus yt-dlp
   * @param {Object} downloadInfo - Informations du téléchargement
   * @param {number} code - Code de sortie du processus
   * @private
   */
  _handleProcessClose(downloadInfo, code) {
    // Si le processus s'est terminé avec un code d'erreur
    if (code !== 0) {
      // Vérifier s'il faut réessayer
      if (downloadInfo.retryCount < this.config.maxRetries) {
        downloadInfo.retryCount++;
        this._logInfo(`Nouvelle tentative de téléchargement (${downloadInfo.retryCount}/${this.config.maxRetries}): ${downloadInfo.url}`);

        // Attendre un peu avant de réessayer
        setTimeout(() => {
          this._startDownload(downloadInfo.id);
        }, 2000);
        return;
      }

      // Plus de tentatives possibles
      this._handleDownloadError(
        downloadInfo,
        new Error(`Le téléchargement a échoué après ${this.config.maxRetries} tentatives. Code: ${code}`)
      );
      return;
    }

    // Le téléchargement s'est terminé avec succès
    downloadInfo.status = 'processing';

    // Rechercher le fichier téléchargé
    this._findDownloadedFile(downloadInfo)
      .then(filePath => {
        if (!filePath) {
          throw new Error('Impossible de trouver le fichier téléchargé');
        }

        downloadInfo.finalFilePath = filePath;
        return this._extractMetadata(downloadInfo);
      })
      .then(() => {
        // Déplacer le fichier vers le dossier de destination final
        return this._moveToFinalDestination(downloadInfo);
      })
      .then(() => {
        // Marquer le téléchargement comme terminé
        downloadInfo.status = 'completed';
        downloadInfo.progress = 1;

        // Publier un événement de téléchargement terminé
        this.eventBus.publish('DOWNLOAD_COMPLETED', {
          requestId: downloadInfo.requestId,
          downloadId: downloadInfo.id,
          filePath: downloadInfo.finalFilePath,
          metadata: downloadInfo.metadata,
          source: 'soundcloud',
          format: downloadInfo.format
        });

        this._logInfo(`Téléchargement SoundCloud terminé: ${downloadInfo.url}`);

        // Nettoyage des fichiers temporaires
        this._cleanupTempFiles(downloadInfo);
      })
      .catch(error => {
        this._handleDownloadError(downloadInfo, error);
      });
  }

  /**
   * Trouve le fichier téléchargé dans le répertoire de sortie
   * @param {Object} downloadInfo - Informations du téléchargement
   * @returns {Promise<string>} Chemin du fichier téléchargé
   * @private
   */
  _findDownloadedFile(downloadInfo) {
    return new Promise((resolve, reject) => {
      // Si le chemin final est déjà connu
      if (downloadInfo.finalFilePath && fs.existsSync(downloadInfo.finalFilePath)) {
        resolve(downloadInfo.finalFilePath);
        return;
      }

      // Lister tous les fichiers du répertoire de sortie
      fs.readdir(downloadInfo.outputPath, (err, files) => {
        if (err) {
          reject(new Error(`Impossible de lire le répertoire de sortie: ${err.message}`));
          return;
        }

        // Filtrer pour trouver des fichiers audio correspondant au format demandé
        const audioFiles = files.filter(file => {
          const ext = path.extname(file).toLowerCase().substring(1);
          return ext === downloadInfo.format;
        });

        if (audioFiles.length === 0) {
          reject(new Error('Aucun fichier audio trouvé dans le répertoire de sortie'));
          return;
        }

        // Prendre le premier fichier trouvé (ou le plus récent si plusieurs)
        resolve(path.join(downloadInfo.outputPath, audioFiles[0]));
      });
    });
  }

  /**
   * Extrait les métadonnées du fichier téléchargé
   * @param {Object} downloadInfo - Informations du téléchargement
   * @returns {Promise<void>}
   * @private
   */
  _extractMetadata(downloadInfo) {
    return new Promise((resolve, reject) => {
      const jsonFilePath = path.join(
        downloadInfo.outputPath,
        path.basename(downloadInfo.finalFilePath, path.extname(downloadInfo.finalFilePath)) + '.info.json'
      );

      // Vérifier si le fichier JSON existe
      if (fs.existsSync(jsonFilePath)) {
        try {
          // Lire et parser le fichier JSON
          const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));

          // Extraire les métadonnées pertinentes
          downloadInfo.metadata = {
            title: jsonData.title || '',
            artist: jsonData.uploader || jsonData.artist || '',
            album: jsonData.album || '',
            genre: jsonData.genre || '',
            description: jsonData.description || '',
            uploadDate: jsonData.upload_date || '',
            thumbnailUrl: jsonData.thumbnail || '',
            duration: jsonData.duration || 0,
            webpage_url: jsonData.webpage_url || downloadInfo.url
          };

          // Publier les métadonnées extraites
          this.eventBus.publish('METADATA_EXTRACTED', {
            requestId: downloadInfo.requestId,
            downloadId: downloadInfo.id,
            metadata: downloadInfo.metadata,
            source: 'soundcloud'
          });

          resolve();
        } catch (error) {
          this._logError(`Erreur d'extraction des métadonnées: ${error.message}`);
          // Continuer même en cas d'erreur de métadonnées
          resolve();
        }
      } else {
        // Si le fichier JSON n'existe pas, essayer d'extraire les métadonnées du nom de fichier
        const fileName = path.basename(downloadInfo.finalFilePath, path.extname(downloadInfo.finalFilePath));

        downloadInfo.metadata = {
          title: fileName,
          artist: 'Unknown Artist',
          source: 'soundcloud'
        };

        this.eventBus.publish('METADATA_EXTRACTED', {
          requestId: downloadInfo.requestId,
          downloadId: downloadInfo.id,
          metadata: downloadInfo.metadata,
          source: 'soundcloud'
        });

        resolve();
      }
    });
  }

  /**
   * Déplace le fichier téléchargé vers son emplacement final
   * @param {Object} downloadInfo - Informations du téléchargement
   * @returns {Promise<void>}
   * @private
   */
  _moveToFinalDestination(downloadInfo) {
    return new Promise((resolve, reject) => {
      const metadata = downloadInfo.metadata || {};

      // Créer un nom de fichier basé sur les métadonnées
      const sanitizedArtist = (metadata.artist || 'Unknown Artist').replace(/[\\/:*?"<>|]/g, '_');
      const sanitizedTitle = (metadata.title || 'Unknown Title').replace(/[\\/:*?"<>|]/g, '_');

      // Créer un répertoire basé sur l'artiste
      const artistDir = path.join(this.config.outputPath, sanitizedArtist);

      // Créer le répertoire si nécessaire
      fs.mkdirSync(artistDir, { recursive: true });

      // Définir le chemin final du fichier
      const finalFileName = `${sanitizedTitle}.${downloadInfo.format}`;
      const finalFilePath = path.join(artistDir, finalFileName);

      // Copier le fichier vers sa destination finale
      try {
        fs.copyFileSync(downloadInfo.finalFilePath, finalFilePath);
        downloadInfo.finalFilePath = finalFilePath;
        resolve();
      } catch (error) {
        reject(new Error(`Impossible de déplacer le fichier: ${error.message}`));
      }
    });
  }

  /**
   * Nettoie les fichiers temporaires après un téléchargement réussi
   * @param {Object} downloadInfo - Informations du téléchargement
   * @private
   */
  _cleanupTempFiles(downloadInfo) {
    if (!downloadInfo.outputPath) return;

    try {
      // Supprimer récursivement le répertoire temporaire
      fs.rm(downloadInfo.outputPath, { recursive: true, force: true }, (err) => {
        if (err) {
          this._logError(`Erreur lors du nettoyage des fichiers temporaires: ${err.message}`);
        }
      });
    } catch (error) {
      this._logError(`Erreur lors du nettoyage: ${error.message}`);
    }
  }

  /**
   * Gère une demande d'annulation de téléchargement
   * @param {Object} data - Données de la demande
   * @param {string} data.downloadId - ID du téléchargement à annuler
   * @private
   */
  _handleCancelRequest(data) {
    if (!data || !data.downloadId) {
      this._logError('Demande d\'annulation invalide: ID de téléchargement manquant');
      return;
    }

    const downloadInfo = this.downloads.get(data.downloadId);

    if (!downloadInfo) {
      this._logError(`Téléchargement introuvable pour l'annulation: ${data.downloadId}`);
      return;
    }

    // Annuler uniquement si en cours de téléchargement
    if (downloadInfo.status === 'downloading' && downloadInfo.process) {
      // Terminer le processus
      try {
        downloadInfo.process.kill('SIGTERM');
      } catch (error) {
        this._logError(`Erreur lors de l'annulation du processus: ${error.message}`);
      }

      // Mettre à jour le statut
      downloadInfo.status = 'cancelled';

      // Publier un événement d'annulation
      this.eventBus.publish('DOWNLOAD_CANCELLED', {
        requestId: downloadInfo.requestId,
        downloadId: downloadInfo.id,
        source: 'soundcloud'
      });

      this._logInfo(`Téléchargement SoundCloud annulé: ${downloadInfo.url}`);

      // Nettoyer les fichiers temporaires
      this._cleanupTempFiles(downloadInfo);

      // Supprimer de la map des téléchargements actifs
      this.downloads.delete(data.downloadId);
    }
  }

  /**
   * Gère les mises à jour de configuration
   * @param {Object} config - Nouvelle configuration
   * @private
   */
  _handleConfigUpdate(config) {
    if (!config) return;

    // Mettre à jour les propriétés de configuration pertinentes
    if (config.outputPath) {
      this.config.outputPath = config.outputPath;
    }

    if (config.format) {
      this.config.format = config.format;
    }

    if (config.quality) {
      this.config.quality = config.quality;
    }

    if (config.maxRetries !== undefined) {
      this.config.maxRetries = config.maxRetries;
    }

    if (config.ytDlpPath) {
      this.config.ytDlpPath = config.ytDlpPath;
    }

    if (config.ffmpegPath) {
      this.config.ffmpegPath = config.ffmpegPath;
    }

    this._logInfo('Configuration SoundCloud mise à jour');
  }

  /**
   * Vérifie si une URL est une URL SoundCloud valide
   * @param {string} url - URL à vérifier
   * @returns {boolean} Vrai si l'URL est une URL SoundCloud valide
   * @private
   */
  _isSoundCloudUrl(url) {
    if (!url) return false;

    try {
      const urlObj = new URL(url);
      return urlObj.hostname === 'soundcloud.com' ||
             urlObj.hostname === 'www.soundcloud.com' ||
             urlObj.hostname === 'm.soundcloud.com';
    } catch (error) {
      return false;
    }
  }

  /**
   * Gère les erreurs de téléchargement
   * @param {Object} downloadInfo - Informations du téléchargement
   * @param {Error} error - Erreur survenue
   * @private
   */
  _handleDownloadError(downloadInfo, error) {
    if (!downloadInfo) return;

    // Mettre à jour le statut
    downloadInfo.status = 'error';
    downloadInfo.error = error.message || 'Erreur inconnue';

    // Émettre un événement d'erreur
    this._emitError(
      downloadInfo.requestId,
      'DOWNLOAD_FAILED',
      `Échec du téléchargement: ${downloadInfo.error}`,
      downloadInfo.id
    );

    this._logError(`Erreur de téléchargement SoundCloud: ${downloadInfo.error}`);

    // Nettoyer les fichiers temporaires
    this._cleanupTempFiles(downloadInfo);
  }

  /**
   * Émet une erreur via le bus d'événements
   * @param {string} requestId - ID de la requête
   * @param {string} code - Code d'erreur
   * @param {string} message - Message d'erreur
   * @param {string} [downloadId] - ID du téléchargement (optionnel)
   * @private
   */
  _emitError(requestId, code, message, downloadId = null) {
    if (!this.eventBus) return;

    this.eventBus.publish('DOWNLOAD_ERROR', {
      requestId: requestId,
      downloadId: downloadId,
      code: code,
      message: message,
      source: 'soundcloud',
      timestamp: Date.now()
    });

    this._logError(`${code}: ${message}`);
  }

  /**
   * Enregistre un message d'information
   * @param {string} message - Message à logger
   * @private
   */
  _logInfo(message) {
    if (!this.eventBus) return;

    this.eventBus.publish('LOG_INFO', {
      module: 'soundcloud-adapter',
      message: message,
      timestamp: Date.now()
    });
  }

  /**
   * Enregistre un message d'erreur
   * @param {string} message - Message d'erreur à logger
   * @private
   */
  _logError(message) {
    if (!this.eventBus) return;

    this.eventBus.publish('LOG_ERROR', {
      module: 'soundcloud-adapter',
      message: message,
      timestamp: Date.now()
    });
  }

  /**
   * Nettoie les ressources avant la fermeture de l'application
   * @private
   */
  _cleanup() {
    // Annuler tous les téléchargements en cours
    for (const [downloadId, downloadInfo] of this.downloads.entries()) {
      if (downloadInfo.status === 'downloading' && downloadInfo.process) {
        try {
          downloadInfo.process.kill('SIGTERM');
        } catch (error) {
          // Ignorer les erreurs lors du nettoyage
        }
      }
    }

    this._logInfo('SoundCloudAdapter: ressources nettoyées');
  }
}

/**
 * Crée et initialise l'adaptateur SoundCloud
 * @param {Object} eventBus - Le bus d'événements central
 * @returns {SoundCloudAdapter} L'instance de l'adaptateur initialisée
 */
function createSoundCloudAdapter(eventBus) {
  const adapter = new SoundCloudAdapter();
  adapter.initialize(eventBus);
  return adapter;
}

/**
 * Point d'entrée du module
 * Fonction appelée pour enregistrer l'adaptateur auprès du système
 * @param {Object} eventBus - Le bus d'événements central
 */
function initialize(eventBus) {
  if (!eventBus) {
    console.error('SoundCloudAdapter: eventBus est requis pour l\'initialisation');
    return;
  }

  createSoundCloudAdapter(eventBus);
}

// Exporter uniquement la fonction d'initialisation
module.exports = { initialize };

/**
 * Exemples d'utilisation:
 *
 * // 1. Initialisation du module:
 * const eventBus = require('./event-bus').getEventBus();
 * require('./soundcloud-adapter').initialize(eventBus);
 *
 * // 2. Déclenchement d'un téléchargement:
 * eventBus.publish('DOWNLOAD_REQUEST_SOUNDCLOUD', {
 *   requestId: 'req-123',
 *   url: 'https://soundcloud.com/artist/track',
 *   format: 'mp3'
 * });
 *
 * // 3. Annulation d'un téléchargement:
 * eventBus.publish('DOWNLOAD_CANCEL', {
 *   downloadId: 'download-123'
 * });
 */// Adaptateur pour SoundCloud
// Créé automatiquement le 2025-05-02

