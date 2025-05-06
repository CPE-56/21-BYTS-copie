/**
 * @fileoverview Adaptateur Spotify pour l'application 21 BYTS
 * @description Ce module gère l'interaction avec Spotify pour extraire les métadonnées
 * et préparer les téléchargements audio. Il fonctionne de manière autonome et
 * communique exclusivement via le bus d'événements.
 *
 * @module modules/download/adapters/spotify-adapter
 * @requires electron
 * @requires node:child_process
 * @requires node:path
 * @requires node:fs
 *
 * @events
 * @listens ADAPTER_INIT - Initialisation de l'adaptateur
 * @listens SPOTIFY_URL_SUBMITTED - Une URL Spotify a été soumise pour traitement
 * @listens DOWNLOAD_SPOTIFY_ITEM - Demande de téléchargement d'un élément Spotify
 * @listens SPOTIFY_AUTH_TOKEN_RECEIVED - Token d'authentification reçu
 * @listens CONFIG_UPDATED - La configuration a été mise à jour
 *
 * @emits ADAPTER_INITIALIZED - L'adaptateur a été initialisé avec succès
 * @emits ADAPTER_INIT_ERROR - Erreur lors de l'initialisation de l'adaptateur
 * @emits SPOTIFY_URL_PROCESSED - L'URL Spotify a été analysée avec les métadonnées
 * @emits SPOTIFY_URL_ERROR - Erreur lors de l'analyse de l'URL Spotify
 * @emits SPOTIFY_METADATA_EXTRACTED - Métadonnées extraites avec succès
 * @emits SPOTIFY_DOWNLOAD_PROGRESS - Progression du téléchargement
 * @emits SPOTIFY_DOWNLOAD_COMPLETED - Téléchargement terminé
 * @emits SPOTIFY_DOWNLOAD_ERROR - Erreur lors du téléchargement
 * @emits SPOTIFY_DOWNLOAD_CANCELLED - Téléchargement annulé
 * @emits ERROR - Émis en cas d'erreur générale
 */

// Constantes pour les codes d'erreur
const ERROR_CODES = {
  INITIALIZATION_FAILED: 'SPT001',
  URL_PARSING_FAILED: 'SPT002',
  AUTHENTICATION_FAILED: 'SPT003',
  METADATA_EXTRACTION_FAILED: 'SPT004',
  DOWNLOAD_FAILED: 'SPT005',
  YTDLP_NOT_FOUND: 'SPT006',
  PROCESS_TERMINATED: 'SPT007',
  PLAYLIST_TOO_LARGE: 'SPT008',
  NETWORK_ERROR: 'SPT009'
};

// Type de ressources Spotify
const RESOURCE_TYPES = {
  TRACK: 'track',
  ALBUM: 'album',
  PLAYLIST: 'playlist',
  ARTIST: 'artist'
};

// Couleur pour les téléchargements Spotify (vert)
const SPOTIFY_COLOR = '#1DB954';

/**
 * Adaptateur pour les téléchargements depuis Spotify
 */
class SpotifyAdapter {
  constructor() {
    this.initialized = false;
    this.eventBus = null;
    this.config = {
      ytDlpPath: '',
      downloadPath: '',
      audioFormat: 'mp3',
      audioQuality: '320k',
      maxPlaylistItems: 200,
      concurrentDownloads: 2
    };
    this.activeDownloads = new Map();
    this.downloadProcesses = new Map();
    this.isTerminating = false;
  }

  /**
   * Initialise l'adaptateur Spotify
   * @param {Object} eventBus - L'instance du bus d'événements (injecté par le container)
   */
  initialize(eventBus) {
    try {
      if (!eventBus) {
        throw new Error("Le bus d'événements est requis pour l'initialisation");
      }

      this.eventBus = eventBus;
      this.registerEventListeners();

      // Demande la configuration initiale
      this.eventBus.publish('CONFIG_REQUESTED', {
        module: 'spotify-adapter',
        configKeys: [
          'ytDlpPath',
          'downloadPath',
          'audioFormat',
          'audioQuality',
          'maxPlaylistItems',
          'concurrentDownloads'
        ]
      });

      this.initialized = true;
      this.eventBus.publish('ADAPTER_INITIALIZED', {
        adapter: 'spotify',
        status: 'success',
        color: SPOTIFY_COLOR
      });
    } catch (error) {
      this.handleError(ERROR_CODES.INITIALIZATION_FAILED, error.message);
      throw error;
    }
  }

  /**
   * Enregistre les écouteurs d'événements
   */
  registerEventListeners() {
    if (!this.eventBus) {
      this.handleError(
        ERROR_CODES.INITIALIZATION_FAILED,
        "Impossible d'enregistrer les écouteurs: bus d'événements non disponible"
      );
      return;
    }

    this.eventBus.subscribe('SPOTIFY_URL_SUBMITTED', this.processUrl.bind(this));
    this.eventBus.subscribe('DOWNLOAD_SPOTIFY_ITEM', this.startDownload.bind(this));
    this.eventBus.subscribe('CANCEL_SPOTIFY_DOWNLOAD', this.cancelDownload.bind(this));
    this.eventBus.subscribe('SPOTIFY_AUTH_TOKEN_RECEIVED', this.updateAuthToken.bind(this));
    this.eventBus.subscribe('CONFIG_UPDATED', this.updateConfig.bind(this));
    this.eventBus.subscribe('APP_TERMINATING', this.cleanupOnTerminate.bind(this));

    // Log d'initialisation
    this.eventBus.publish('EVENT_LOG', {
      module: 'spotify-adapter',
      type: 'info',
      message: "Écouteurs d'événements Spotify enregistrés"
    });
  }

  /**
   * Met à jour la configuration
   * @param {Object} configData - Les données de configuration mises à jour
   */
  updateConfig(configData) {
    if (!configData) return;

    // Ne mettre à jour que les clés de configuration pertinentes pour cet adaptateur
    Object.keys(this.config).forEach((key) => {
      if (configData[key] !== undefined) {
        this.config[key] = configData[key];
      }
    });

    this.eventBus.publish('EVENT_LOG', {
      module: 'spotify-adapter',
      type: 'info',
      message: 'Configuration mise à jour'
    });
  }

  /**
   * Met à jour le token d'authentification
   * @param {Object} authData - Les données d'authentification
   */
  updateAuthToken(authData) {
    if (!authData || !authData.token) {
      this.handleError(ERROR_CODES.AUTHENTICATION_FAILED, "Token d'authentification invalide");
      return;
    }

    this.authToken = authData.token;
    this.tokenExpiry = authData.expiry || Date.now() + 3600000; // Par défaut 1 heure
  }

  /**
   * Traite une URL Spotify soumise
   * @param {Object} data - Les données contenant l'URL
   */
  async processUrl(data) {
    if (!this.initialized) {
      this.handleError(ERROR_CODES.INITIALIZATION_FAILED, "L'adaptateur n'est pas initialisé");
      return;
    }

    if (!data || !data.url) {
      this.handleError(ERROR_CODES.URL_PARSING_FAILED, 'URL manquante ou invalide');
      return;
    }

    try {
      const url = data.url.trim();

      // Vérifier si l'URL est une URL Spotify valide
      if (!this.isValidSpotifyUrl(url)) {
        this.handleError(ERROR_CODES.URL_PARSING_FAILED, 'URL Spotify invalide');
        return;
      }

      // Extraire le type de ressource et l'ID
      const { resourceType, resourceId } = this.extractResourceInfo(url);

      // Analyse de l'URL avec yt-dlp pour obtenir les métadonnées
      this.extractMetadata(url, resourceType, resourceId, data.requestId);
    } catch (error) {
      this.handleError(
        ERROR_CODES.URL_PARSING_FAILED,
        `Erreur lors de l'analyse de l'URL: ${error.message}`
      );
    }
  }

  /**
   * Vérifie si l'URL est une URL Spotify valide
   * @param {string} url - L'URL à vérifier
   * @returns {boolean} - true si l'URL est valide
   */
  isValidSpotifyUrl(url) {
    const spotifyUrlPattern =
      /^(https?:\/\/)?(open\.spotify\.com|play\.spotify\.com)\/(track|album|playlist|artist)\/([a-zA-Z0-9]+)(\?si=[\w-]+)?$/;
    return spotifyUrlPattern.test(url);
  }

  /**
   * Extrait les informations de ressource de l'URL
   * @param {string} url - L'URL Spotify
   * @returns {Object} - Les informations de ressource
   */
  extractResourceInfo(url) {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);

    if (pathParts.length < 2) {
      throw new Error("Format d'URL Spotify invalide");
    }

    return {
      resourceType: pathParts[0],
      resourceId: pathParts[1]
    };
  }

  /**
   * Extrait les métadonnées à partir de l'URL
   * @param {string} url - L'URL Spotify
   * @param {string} resourceType - Le type de ressource
   * @param {string} resourceId - L'ID de la ressource
   * @param {string} requestId - L'ID de la requête
   */
  async extractMetadata(url, resourceType, resourceId, requestId) {
    if (!this.config.ytDlpPath) {
      this.handleError(ERROR_CODES.YTDLP_NOT_FOUND, 'Chemin vers yt-dlp non configuré');
      return;
    }

    const { spawn } = require('node:child_process');
    const args = ['--dump-json', '--no-playlist', url];

    // Si c'est une playlist, inclure les détails de la playlist
    if (resourceType === RESOURCE_TYPES.PLAYLIST) {
      args.splice(1, 1); // Enlever --no-playlist
      args.push('--flat-playlist'); // Obtenir les infos de base
    }

    try {
      const ytDlpProcess = spawn(this.config.ytDlpPath, args);
      let outputData = '';
      let errorData = '';

      ytDlpProcess.stdout.on('data', (data) => {
        outputData += data.toString();
      });

      ytDlpProcess.stderr.on('data', (data) => {
        errorData += data.toString();
      });

      ytDlpProcess.on('close', (code) => {
        if (code !== 0) {
          this.handleError(
            ERROR_CODES.METADATA_EXTRACTION_FAILED,
            `yt-dlp a échoué avec le code ${code}: ${errorData}`
          );
          return;
        }

        try {
          const metadata = this.parseMetadata(outputData, resourceType);

          // Vérifier si la playlist est trop grande
          if (
            resourceType === RESOURCE_TYPES.PLAYLIST &&
            metadata.entries &&
            metadata.entries.length > this.config.maxPlaylistItems
          ) {
            // Tronquer la playlist et avertir
            metadata.entries = metadata.entries.slice(0, this.config.maxPlaylistItems);
            metadata.truncated = true;
            metadata.originalCount = metadata.entries.length;

            this.eventBus.publish('EVENT_LOG', {
              module: 'spotify-adapter',
              type: 'warning',
              message: `Playlist tronquée à ${this.config.maxPlaylistItems} éléments (original: ${metadata.originalCount})`
            });
          }

          this.eventBus.publish('SPOTIFY_URL_PROCESSED', {
            url,
            resourceType,
            resourceId,
            metadata,
            requestId,
            color: SPOTIFY_COLOR
          });

          this.eventBus.publish('SPOTIFY_METADATA_EXTRACTED', {
            requestId,
            metadata
          });
        } catch (parseError) {
          this.handleError(
            ERROR_CODES.METADATA_EXTRACTION_FAILED,
            `Erreur lors de l'analyse des métadonnées: ${parseError.message}`
          );
        }
      });
    } catch (error) {
      this.handleError(
        ERROR_CODES.METADATA_EXTRACTION_FAILED,
        `Erreur lors de l'extraction des métadonnées: ${error.message}`
      );
    }
  }

  /**
   * Analyse les métadonnées JSON retournées par yt-dlp
   * @param {string} data - Les données JSON
   * @param {string} resourceType - Le type de ressource
   * @returns {Object} - Les métadonnées analysées
   */
  parseMetadata(data, resourceType) {
    try {
      // Traiter différemment selon le type de ressource
      if (resourceType === RESOURCE_TYPES.PLAYLIST) {
        // Pour les playlists, yt-dlp retourne plusieurs objets JSON, un par ligne
        const lines = data.trim().split('\n');
        const entries = lines.map((line) => JSON.parse(line));

        return {
          type: RESOURCE_TYPES.PLAYLIST,
          id: entries[0]?.id || 'unknown',
          title: entries[0]?.playlist || 'Playlist Spotify',
          entries: entries.map((entry, index) => ({
            id: entry.id || `track-${index}`,
            title: entry.title || 'Titre inconnu',
            artist: entry.artist || entry.uploader || 'Artiste inconnu',
            thumbnail: entry.thumbnail || '',
            duration: entry.duration || 0,
            index: index
          }))
        };
      } else {
        // Pour les pistes, albums ou artistes
        const parsedData = JSON.parse(data);

        if (resourceType === RESOURCE_TYPES.TRACK) {
          return {
            type: RESOURCE_TYPES.TRACK,
            id: parsedData.id || 'unknown',
            title: parsedData.title || 'Titre inconnu',
            artist: parsedData.artist || parsedData.uploader || 'Artiste inconnu',
            album: parsedData.album || '',
            thumbnail: parsedData.thumbnail || '',
            duration: parsedData.duration || 0
          };
        } else if (resourceType === RESOURCE_TYPES.ALBUM) {
          // Pour un album, yt-dlp peut retourner des informations sur l'album et les pistes
          return {
            type: RESOURCE_TYPES.ALBUM,
            id: parsedData.id || 'unknown',
            title: parsedData.title || 'Album inconnu',
            artist: parsedData.artist || parsedData.uploader || 'Artiste inconnu',
            thumbnail: parsedData.thumbnail || '',
            entries: (parsedData.entries || []).map((entry, index) => ({
              id: entry.id || `track-${index}`,
              title: entry.title || 'Titre inconnu',
              artist: entry.artist || parsedData.artist || 'Artiste inconnu',
              thumbnail: entry.thumbnail || parsedData.thumbnail || '',
              duration: entry.duration || 0,
              index: index
            }))
          };
        } else if (resourceType === RESOURCE_TYPES.ARTIST) {
          // Pour un artiste, informations sur l'artiste et top tracks potentiellement
          return {
            type: RESOURCE_TYPES.ARTIST,
            id: parsedData.id || 'unknown',
            title: parsedData.title || 'Artiste inconnu',
            thumbnail: parsedData.thumbnail || '',
            entries: (parsedData.entries || []).map((entry, index) => ({
              id: entry.id || `track-${index}`,
              title: entry.title || 'Titre inconnu',
              artist: parsedData.title || 'Artiste inconnu',
              thumbnail: entry.thumbnail || parsedData.thumbnail || '',
              duration: entry.duration || 0,
              index: index
            }))
          };
        }
      }
    } catch (error) {
      throw new Error(`Échec d'analyse des métadonnées JSON: ${error.message}`);
    }
  }

  /**
   * Démarre le téléchargement d'un élément Spotify
   * @param {Object} data - Les données de téléchargement
   */
  async startDownload(data) {
    if (!this.initialized) {
      this.handleError(ERROR_CODES.INITIALIZATION_FAILED, "L'adaptateur n'est pas initialisé");
      return;
    }

    if (!data || !data.url) {
      this.handleError(
        ERROR_CODES.DOWNLOAD_FAILED,
        'Données de téléchargement manquantes ou invalides'
      );
      return;
    }

    const {
      url,
      itemId,
      downloadId,
      format = this.config.audioFormat,
      quality = this.config.audioQuality
    } = data;

    try {
      // Vérifier si le téléchargement est déjà actif
      if (this.activeDownloads.has(downloadId)) {
        this.eventBus.publish('EVENT_LOG', {
          module: 'spotify-adapter',
          type: 'warning',
          message: `Téléchargement ${downloadId} déjà en cours`
        });
        return;
      }

      // Créer l'entrée pour ce téléchargement
      this.activeDownloads.set(downloadId, {
        url,
        itemId,
        downloadId,
        status: 'starting',
        progress: 0,
        format,
        quality,
        startTime: Date.now()
      });

      // Préparer le chemin de téléchargement
      const path = require('node:path');
      const fs = require('node:fs');

      const downloadPath =
        this.config.downloadPath || path.join(require('electron').app.getPath('music'), '21BYTS');

      // S'assurer que le dossier existe
      if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath, { recursive: true });
      }

      // Démarrer le processus de téléchargement avec yt-dlp
      const { spawn } = require('node:child_process');
      const args = [
        '-x', // Extraire l'audio
        '--audio-format',
        format, // Format audio
        '--audio-quality',
        quality, // Qualité audio
        '--embed-thumbnail', // Intégrer la miniature
        '--add-metadata', // Ajouter les métadonnées
        '--convert-thumbnails',
        'jpg', // Convertir les miniatures en JPG
        '--parse-metadata',
        '%(artist)s:%(meta_artist)s', // Parser les métadonnées
        '--parse-metadata',
        '%(title)s:%(meta_title)s', // Parser les métadonnées
        '--parse-metadata',
        '%(album)s:%(meta_album)s', // Parser les métadonnées
        '-o',
        path.join(downloadPath, '%(title)s.%(ext)s'), // Chemin de sortie
        url // URL à télécharger
      ];

      // Si c'est un itemId spécifique d'une playlist, ajouter un filtre
      if (itemId) {
        args.splice(args.length - 1, 0, '--playlist-items', itemId);
      }

      const downloadProcess = spawn(this.config.ytDlpPath, args);
      let errorOutput = '';

      // Stocker le processus pour pouvoir l'annuler
      this.downloadProcesses.set(downloadId, downloadProcess);

      // Mettre à jour le statut
      this.activeDownloads.get(downloadId).status = 'downloading';

      // Publier l'événement de début de téléchargement
      this.eventBus.publish('SPOTIFY_DOWNLOAD_PROGRESS', {
        downloadId,
        progress: 0,
        status: 'downloading',
        color: SPOTIFY_COLOR
      });

      // Écouter la sortie du processus pour suivre la progression
      downloadProcess.stdout.on('data', (data) => {
        const output = data.toString();
        // Extraire les informations de progression à partir de la sortie de yt-dlp
        const progressInfo = this.parseDownloadProgress(output);

        if (progressInfo && progressInfo.percent !== undefined) {
          const downloadInfo = this.activeDownloads.get(downloadId);
          if (downloadInfo) {
            downloadInfo.progress = progressInfo.percent;
            downloadInfo.status = 'downloading';
            downloadInfo.eta = progressInfo.eta;
            downloadInfo.speed = progressInfo.speed;

            // Publier la progression
            this.eventBus.publish('SPOTIFY_DOWNLOAD_PROGRESS', {
              downloadId,
              progress: progressInfo.percent,
              status: 'downloading',
              eta: progressInfo.eta,
              speed: progressInfo.speed,
              color: SPOTIFY_COLOR
            });
          }
        }
      });

      downloadProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
        // Publier les erreurs comme événements de log
        this.eventBus.publish('EVENT_LOG', {
          module: 'spotify-adapter',
          type: 'error',
          message: `Erreur yt-dlp: ${data.toString().trim()}`
        });
      });

      downloadProcess.on('close', (code) => {
        // Supprimer le processus de la liste
        this.downloadProcesses.delete(downloadId);

        if (code === 0) {
          // Téléchargement réussi
          const download = this.activeDownloads.get(downloadId);
          if (download) {
            download.status = 'completed';
            download.progress = 100;
            download.endTime = Date.now();

            this.eventBus.publish('SPOTIFY_DOWNLOAD_COMPLETED', {
              downloadId,
              itemId,
              status: 'completed',
              progress: 100,
              duration: download.endTime - download.startTime,
              color: SPOTIFY_COLOR
            });
          }
        } else if (code === null && this.isTerminating) {
          // Application en cours de fermeture, téléchargement annulé
          this.eventBus.publish('SPOTIFY_DOWNLOAD_CANCELLED', {
            downloadId,
            reason: 'app_terminating',
            color: SPOTIFY_COLOR
          });
        } else {
          // Échec du téléchargement
          this.handleError(
            ERROR_CODES.DOWNLOAD_FAILED,
            `Échec du téléchargement avec le code ${code}: ${errorOutput}`,
            { downloadId, itemId }
          );
        }

        // Nettoyer les données de téléchargement
        this.activeDownloads.delete(downloadId);
      });
    } catch (error) {
      this.handleError(
        ERROR_CODES.DOWNLOAD_FAILED,
        `Erreur lors du téléchargement: ${error.message}`,
        { downloadId, itemId }
      );

      // Nettoyer en cas d'erreur
      this.activeDownloads.delete(downloadId);
      if (this.downloadProcesses.has(downloadId)) {
        this.downloadProcesses.delete(downloadId);
      }
    }
  }

  /**
   * Analyse la progression du téléchargement à partir de la sortie de yt-dlp
   * @param {string} output - La sortie du processus yt-dlp
   * @returns {Object|null} - Les informations de progression ou null
   */
  parseDownloadProgress(output) {
    if (!output) return null;

    // Extraire le pourcentage à partir de la sortie de yt-dlp
    // Exemple de format: "[download] 25.5% of ~50.00MiB at 2.50MiB/s ETA 00:20"
    const progressRegex =
      /\[download\]\s+(\d+\.\d+)%\s+of\s+~?(\d+\.\d+)(\w+)\s+at\s+(\d+\.\d+)(\w+)\/s\s+ETA\s+(\d+:\d+)/;
    const match = output.match(progressRegex);

    if (match) {
      return {
        percent: parseFloat(match[1]),
        size: `${match[2]}${match[3]}`,
        speed: `${match[4]}${match[5]}/s`,
        eta: match[6]
      };
    }

    // Vérifier si c'est un message de fin de téléchargement
    if (
      output.includes('[ExtractAudio] Destination:') ||
      output.includes('[ffmpeg] Destination:')
    ) {
      return { percent: 100 };
    }

    return null;
  }

  /**
   * Annule un téléchargement en cours
   * @param {Object} data - Les données contenant l'ID du téléchargement
   */
  cancelDownload(data) {
    if (!data || !data.downloadId) return;

    const { downloadId } = data;
    const downloadProcess = this.downloadProcesses.get(downloadId);

    if (downloadProcess) {
      try {
        // Envoyer un signal SIGTERM pour terminer proprement le processus
        downloadProcess.kill('SIGTERM');

        // Mettre à jour le statut
        const download = this.activeDownloads.get(downloadId);
        if (download) {
          download.status = 'cancelled';
        }

        // Publier l'événement d'annulation
        this.eventBus.publish('SPOTIFY_DOWNLOAD_CANCELLED', {
          downloadId,
          reason: 'user_cancelled',
          color: SPOTIFY_COLOR
        });

        this.eventBus.publish('EVENT_LOG', {
          module: 'spotify-adapter',
          type: 'info',
          message: `Téléchargement ${downloadId} annulé par l'utilisateur`
        });
      } catch (error) {
        this.handleError(
          ERROR_CODES.PROCESS_TERMINATED,
          `Erreur lors de l'annulation du téléchargement: ${error.message}`,
          { downloadId }
        );
      } finally {
        // Nettoyer les données
        this.downloadProcesses.delete(downloadId);
        this.activeDownloads.delete(downloadId);
      }
    }
  }

  /**
   * Nettoie les ressources lors de la fermeture de l'application
   */
  cleanupOnTerminate() {
    this.isTerminating = true;

    // Annuler tous les téléchargements en cours
    for (const [downloadId, process] of this.downloadProcesses.entries()) {
      try {
        process.kill('SIGTERM');

        this.eventBus.publish('EVENT_LOG', {
          module: 'spotify-adapter',
          type: 'info',
          message: `Téléchargement ${downloadId} annulé en raison de la fermeture de l'application`
        });
      } catch (error) {
        // Ignorer les erreurs pendant la fermeture
      }
    }

    // Vider les collections
    this.downloadProcesses.clear();
    this.activeDownloads.clear();
  }

  /**
   * Gère les erreurs et les publie sur le bus d'événements
   * @param {string} code - Le code d'erreur
   * @param {string} message - Le message d'erreur
   * @param {Object} [additionalData] - Données supplémentaires
   */
  handleError(code, message, additionalData = {}) {
    const errorData = {
      module: 'spotify-adapter',
      code,
      message,
      timestamp: Date.now(),
      ...additionalData
    };

    // Publier sur le bus d'événements général
    if (this.eventBus) {
      this.eventBus.publish('ERROR', errorData);

      // Publier aussi un événement spécifique selon le type d'erreur
      if (
        code === ERROR_CODES.URL_PARSING_FAILED ||
        code === ERROR_CODES.METADATA_EXTRACTION_FAILED
      ) {
        this.eventBus.publish('SPOTIFY_URL_ERROR', errorData);
      } else if (code === ERROR_CODES.DOWNLOAD_FAILED) {
        this.eventBus.publish('SPOTIFY_DOWNLOAD_ERROR', errorData);
      } else if (code === ERROR_CODES.INITIALIZATION_FAILED) {
        this.eventBus.publish('ADAPTER_INIT_ERROR', errorData);
      }

      // Logger également l'erreur
      this.eventBus.publish('EVENT_LOG', {
        module: 'spotify-adapter',
        type: 'error',
        message: `[${code}] ${message}`
      });
    } else {
      // Fallback si le bus d'événements n'est pas disponible
      console.error(`[SpotifyAdapter] [${code}] ${message}`);
    }
  }
}

/**
 * Initialise et exporte l'adaptateur Spotify
 *
 * Cette fonction est le point d'entrée pour l'adapter.
 * Elle est appelée par le container d'application lors du chargement.
 *
 * @param {Object} container - Le container d'application (qui contient le bus d'événements)
 */
module.exports = function initializeSpotifyAdapter(container) {
  try {
    if (!container || !container.get || !container.get('eventBus')) {
      throw new Error("Bus d'événements non trouvé dans le container");
    }

    const eventBus = container.get('eventBus');

    // Créer et initialiser l'adaptateur
    const spotifyAdapter = new SpotifyAdapter();
    spotifyAdapter.initialize(eventBus);

    // Publier un événement de log pour indiquer que l'adaptateur est prêt
    eventBus.publish('EVENT_LOG', {
      module: 'spotify-adapter',
      type: 'info',
      message: 'Adaptateur Spotify initialisé et prêt'
    });

    // Retourner l'adaptateur pour les tests (mais ne pas l'exposer directement)
    return spotifyAdapter;
  } catch (error) {
    console.error(`[SpotifyAdapter] Erreur d'initialisation: ${error.message}`);
    // Publier l'erreur sur le bus d'événements global si possible
    if (container && container.get && container.get('eventBus')) {
      container.get('eventBus').publish('ERROR', {
        module: 'spotify-adapter',
        code: ERROR_CODES.INITIALIZATION_FAILED,
        message: `Erreur d'initialisation: ${error.message}`,
        timestamp: Date.now()
      });
    }
    throw error;
  }
};

/**
 * Exemples d'utilisation:
 *
 * 1. Initialisation de l'adaptateur:
 * ```javascript
 * // Dans app-container.js ou main.js
 * const container = require('./core/app-container');
 * const initializeSpotifyAdapter = require('./modules/download/adapters/spotify-adapter');
 *
 * // L'adaptateur s'initialise avec le bus d'événements du container
 * initializeSpotifyAdapter(container);
 * ```
 *
 * 2. Soumettre une URL pour traitement:
 * ```javascript
 * // Dans n'importe quel module utilisant le bus d'événements
 * eventBus.publish('SPOTIFY_URL_SUBMITTED', {
 *   url: 'https://open.spotify.com/track/1234567890',
 *   requestId: 'req-123'
 * });
 * ```
 *
 * 3. Démarrer un téléchargement:
 * ```javascript
 * eventBus.publish('DOWNLOAD_SPOTIFY_ITEM', {
 *   url: 'https://open.spotify.com/track/1234567890',
 *   downloadId: 'dl-123',
 *   format: 'mp3',       // optionnel, par défaut selon config
 *   quality: '320k'      // optionnel, par défaut selon config
 * });
 * ```
 *
 * 4. Annuler un téléchargement:
 * ```javascript
 * eventBus.publish('CANCEL_SPOTIFY_DOWNLOAD', {
 *   downloadId: 'dl-123'
 * });
 * ```
 *
 * 5. Écouter les événements de progression:
 * ```javascript
 * eventBus.subscribe('SPOTIFY_DOWNLOAD_PROGRESS', (data) => {
 *   console.log(`Téléchargement ${data.downloadId}: ${data.progress}%`);
 * });
 *
 * eventBus.subscribe('SPOTIFY_DOWNLOAD_COMPLETED', (data) => {
 *   console.log(`Téléchargement ${data.downloadId} terminé`);
 * });
 * ```
 */ // Adaptateur pour Spotify
// Créé automatiquement le 2025-05-02
