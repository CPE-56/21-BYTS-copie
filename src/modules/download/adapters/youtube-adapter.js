/**
 * @file youtube-adapter.js
 * @description Adaptateur pour le téléchargement de contenu audio depuis YouTube
 * Ce module fournit une interface pour télécharger des fichiers audio depuis YouTube
 * en utilisant yt-dlp comme outil sous-jacent. Il gère la détection des URL YouTube,
 * l'extraction des métadonnées, et le téléchargement du contenu audio dans différents formats.
 *
 * @module adapters/youtube-adapter
 * @requires child_process (Node.js)
 * @requires path (Node.js)
 * @requires fs (Node.js)
 *
 * @events
 * Écoute:
 * - ADAPTER_REGISTER: S'enregistre comme adaptateur YouTube
 * - DOWNLOAD_REQUEST: Traite une demande de téléchargement si l'URL est de type YouTube
 * - CONFIG_UPDATED: Met à jour les configurations locales
 * - YOUTUBE_GET_INFO: Demande d'informations sur une vidéo YouTube
 * - YOUTUBE_VALIDATE_URL: Vérifie si une URL est valide pour YouTube
 *
 * Émet:
 * - ADAPTER_REGISTERED: Notifie que l'adaptateur YouTube est enregistré
 * - DOWNLOAD_STARTED: Le téléchargement a commencé
 * - DOWNLOAD_PROGRESS: Mise à jour de la progression du téléchargement
 * - DOWNLOAD_COMPLETED: Le téléchargement est terminé
 * - DOWNLOAD_ERROR: Une erreur s'est produite pendant le téléchargement
 * - DOWNLOAD_CANCELLED: Le téléchargement a été annulé
 * - METADATA_EXTRACTED: Les métadonnées ont été extraites
 * - ERROR: Erreur générale de l'adaptateur
 */

// Modules Node.js standards - aucune dépendance interne
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Adaptateur YouTube pour le téléchargement de contenu audio
 */
class YouTubeAdapter {
  /**
   * Crée une nouvelle instance de l'adaptateur YouTube
   */
  constructor() {
    // Configuration locale
    this.config = {
      ytDlpPath: '', // Chemin vers yt-dlp, sera défini par CONFIG_UPDATED
      ffmpegPath: '', // Chemin vers ffmpeg, sera défini par CONFIG_UPDATED
      outputDir: os.homedir(), // Répertoire de sortie par défaut
      defaultFormat: 'mp3', // Format audio par défaut
      maxQuality: '320k', // Qualité audio maximale
      concurrentDownloads: 2, // Nombre maximum de téléchargements simultanés
      playlistLimit: 200 // Limite de 200 éléments par playlist
    };

    // État interne
    this.activeDownloads = new Map(); // Map des téléchargements actifs
    this.eventBus = null; // Référence au bus d'événements, définie dans init()

    // Regex pour identifier les URL YouTube
    this.youtubeUrlPattern = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
  }

  /**
   * Initialise l'adaptateur et s'enregistre auprès du bus d'événements
   * @param {Object} eventBus - L'instance du bus d'événements
   */
  init(eventBus) {
    if (!eventBus) {
      console.error("YouTubeAdapter: eventBus est requis pour l'initialisation");
      return;
    }

    this.eventBus = eventBus;

    // S'abonner aux événements pertinents
    this.eventBus.subscribe('ADAPTER_REGISTER', this.register.bind(this));
    this.eventBus.subscribe('DOWNLOAD_REQUEST', this.handleDownloadRequest.bind(this));
    this.eventBus.subscribe('CONFIG_UPDATED', this.updateConfig.bind(this));
    this.eventBus.subscribe('YOUTUBE_GET_INFO', this.getVideoInfo.bind(this));
    this.eventBus.subscribe('YOUTUBE_VALIDATE_URL', this.validateUrl.bind(this));
    this.eventBus.subscribe('DOWNLOAD_CANCEL', this.cancelDownload.bind(this));

    // Annoncer que l'adaptateur est initialisé
    this.eventBus.publish('ADAPTER_REGISTERED', {
      type: 'youtube',
      name: 'YouTube',
      supportedDomains: ['youtube.com', 'youtu.be'],
      supportedFormats: ['mp3', 'wav', 'flac', 'aiff', 'm4a'],
      color: '#EE0000' // Couleur pour l'UI (rouge YouTube)
    });
  }

  /**
   * Enregistre l'adaptateur YouTube auprès du système
   * @param {Object} data - Données de l'événement
   */
  register(data) {
    // Rien à faire ici car l'enregistrement est déjà fait dans init()
    // Mais on pourrait répondre à des requêtes spécifiques d'enregistrement si nécessaire
  }

  /**
   * Met à jour la configuration locale de l'adaptateur
   * @param {Object} config - Nouvelles configurations
   */
  updateConfig(config) {
    if (!config) return;

    // Mettre à jour seulement les propriétés pertinentes pour cet adaptateur
    if (config.ytDlpPath) this.config.ytDlpPath = config.ytDlpPath;
    if (config.ffmpegPath) this.config.ffmpegPath = config.ffmpegPath;
    if (config.outputDir) this.config.outputDir = config.outputDir;
    if (config.defaultFormat) this.config.defaultFormat = config.defaultFormat;
    if (config.maxQuality) this.config.maxQuality = config.maxQuality;
    if (config.concurrentDownloads) this.config.concurrentDownloads = config.concurrentDownloads;
    if (config.playlistLimit) this.config.playlistLimit = config.playlistLimit;
  }

  /**
   * Vérifie si une URL est valide pour YouTube
   * @param {Object} data - Données de l'événement contenant l'URL
   */
  validateUrl(data) {
    if (!data || !data.url) {
      this.eventBus.publish('ERROR', {
        source: 'youtube-adapter',
        message: 'URL manquante pour la validation',
        code: 'MISSING_URL'
      });
      return;
    }

    const isValid = this.youtubeUrlPattern.test(data.url);

    this.eventBus.publish('URL_VALIDATED', {
      url: data.url,
      type: 'youtube',
      isValid: isValid,
      requestId: data.requestId
    });
  }

  /**
   * Récupère les informations sur une vidéo YouTube
   * @param {Object} data - Données de l'événement contenant l'URL
   */
  getVideoInfo(data) {
    if (!data || !data.url) {
      this.eventBus.publish('ERROR', {
        source: 'youtube-adapter',
        message: 'URL manquante pour obtenir les informations',
        code: 'MISSING_URL',
        requestId: data.requestId
      });
      return;
    }

    // Vérifier que l'URL est valide pour YouTube
    if (!this.youtubeUrlPattern.test(data.url)) {
      this.eventBus.publish('ERROR', {
        source: 'youtube-adapter',
        message: 'URL non valide pour YouTube',
        code: 'INVALID_URL',
        url: data.url,
        requestId: data.requestId
      });
      return;
    }

    // Vérifier que yt-dlp est disponible
    if (!this.config.ytDlpPath) {
      this.eventBus.publish('ERROR', {
        source: 'youtube-adapter',
        message: "yt-dlp n'est pas configuré",
        code: 'TOOL_NOT_CONFIGURED',
        requestId: data.requestId
      });
      return;
    }

    // Utiliser yt-dlp pour obtenir les informations
    const ytDlpProcess = spawn(this.config.ytDlpPath, ['--dump-json', '--no-playlist', data.url]);

    let stdout = '';
    let stderr = '';

    ytDlpProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ytDlpProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ytDlpProcess.on('close', (code) => {
      if (code !== 0) {
        this.eventBus.publish('ERROR', {
          source: 'youtube-adapter',
          message: `Erreur lors de l'extraction des informations: ${stderr}`,
          code: 'INFO_EXTRACTION_FAILED',
          url: data.url,
          requestId: data.requestId
        });
        return;
      }

      try {
        // Analyser les informations JSON
        const videoInfo = JSON.parse(stdout);

        // Extraire les métadonnées pertinentes
        const metadata = {
          title: videoInfo.title,
          artist: videoInfo.uploader,
          album: videoInfo.playlist || 'YouTube',
          duration: videoInfo.duration,
          thumbnail: videoInfo.thumbnail,
          uploadDate: videoInfo.upload_date,
          isPlaylist: false,
          url: data.url
        };

        // Publier les métadonnées extraites
        this.eventBus.publish('METADATA_EXTRACTED', {
          source: 'youtube',
          metadata: metadata,
          requestId: data.requestId
        });
      } catch (error) {
        this.eventBus.publish('ERROR', {
          source: 'youtube-adapter',
          message: `Erreur lors de l'analyse des informations: ${error.message}`,
          code: 'INFO_PARSING_FAILED',
          url: data.url,
          requestId: data.requestId
        });
      }
    });
  }

  /**
   * Gère une demande de téléchargement
   * @param {Object} data - Données de la demande de téléchargement
   */
  handleDownloadRequest(data) {
    if (!data || !data.url) {
      this.eventBus.publish('ERROR', {
        source: 'youtube-adapter',
        message: 'URL manquante pour le téléchargement',
        code: 'MISSING_URL',
        requestId: data.requestId
      });
      return;
    }

    // Vérifier si cette URL est gérée par cet adaptateur
    if (!this.youtubeUrlPattern.test(data.url)) {
      // Ce n'est pas une URL YouTube, ignorer la requête
      return;
    }

    // Vérifier que les outils nécessaires sont configurés
    if (!this.config.ytDlpPath || !this.config.ffmpegPath) {
      this.eventBus.publish('ERROR', {
        source: 'youtube-adapter',
        message: "yt-dlp ou ffmpeg n'est pas configuré",
        code: 'TOOLS_NOT_CONFIGURED',
        url: data.url,
        requestId: data.requestId
      });
      return;
    }

    // Vérifier si c'est une playlist et extraire les informations appropriées
    this.checkIfPlaylist(data);
  }

  /**
   * Vérifie si l'URL est une playlist et agit en conséquence
   * @param {Object} data - Données de la demande de téléchargement
   */
  checkIfPlaylist(data) {
    // Commande pour vérifier s'il s'agit d'une playlist et compter les éléments
    const ytDlpProcess = spawn(this.config.ytDlpPath, ['--flat-playlist', '--dump-json', data.url]);

    let stdout = '';
    let playlistItems = [];

    ytDlpProcess.stdout.on('data', (chunk) => {
      stdout += chunk.toString();

      // Traiter chaque ligne comme un élément JSON indépendant
      const lines = stdout.split('\n');
      stdout = lines.pop(); // Garder la dernière ligne potentiellement incomplète

      for (const line of lines) {
        if (line.trim()) {
          try {
            const item = JSON.parse(line);
            playlistItems.push(item);

            // Si on dépasse la limite de playlist, arrêter le processus
            if (playlistItems.length > this.config.playlistLimit) {
              ytDlpProcess.kill();
              break;
            }
          } catch (e) {
            // Ignorer les lignes qui ne sont pas du JSON valide
          }
        }
      }
    });

    ytDlpProcess.on('close', () => {
      // Si nous avons plus d'un élément, c'est une playlist
      if (playlistItems.length > 1) {
        // Notifier l'utilisateur que c'est une playlist
        this.eventBus.publish('PLAYLIST_DETECTED', {
          source: 'youtube',
          url: data.url,
          count: playlistItems.length,
          limited: playlistItems.length > this.config.playlistLimit,
          maxItems: this.config.playlistLimit,
          items: playlistItems.slice(0, this.config.playlistLimit).map((item) => ({
            id: item.id,
            title: item.title,
            url: `https://www.youtube.com/watch?v=${item.id}`
          })),
          requestId: data.requestId
        });

        // Si l'utilisateur a choisi de télécharger toute la playlist, on procède
        if (data.downloadPlaylist) {
          this.downloadPlaylist(data, playlistItems.slice(0, this.config.playlistLimit));
        }
      } else {
        // C'est une seule vidéo, on procède au téléchargement
        this.downloadSingleVideo(data);
      }
    });
  }

  /**
   * Télécharge une playlist YouTube
   * @param {Object} data - Données de la demande de téléchargement
   * @param {Array} items - Éléments de la playlist à télécharger
   */
  downloadPlaylist(data, items) {
    // Pour chaque élément de la playlist, créer une demande de téléchargement
    items.forEach((item, index) => {
      const videoData = {
        ...data,
        url: `https://www.youtube.com/watch?v=${item.id}`,
        title: item.title,
        requestId: `${data.requestId}_${index}`,
        playlistIndex: index,
        playlistTotal: items.length
      };

      // Ajouter un délai pour éviter de surcharger le serveur YouTube
      setTimeout(() => {
        this.downloadSingleVideo(videoData);
      }, index * 1000); // Espacer les téléchargements d'1 seconde
    });
  }

  /**
   * Télécharge une seule vidéo YouTube
   * @param {Object} data - Données de la demande de téléchargement
   */
  downloadSingleVideo(data) {
    // Extraire les options de téléchargement
    const format = data.format || this.config.defaultFormat;
    const outputDir = data.outputDir || this.config.outputDir;

    // Créer un ID unique pour ce téléchargement
    const downloadId = data.requestId || `youtube_${Date.now()}`;

    // Notifier que le téléchargement commence
    this.eventBus.publish('DOWNLOAD_STARTED', {
      id: downloadId,
      url: data.url,
      format: format,
      source: 'youtube',
      outputDir: outputDir,
      requestId: data.requestId
    });

    // Construire les arguments pour yt-dlp
    const ytDlpArgs = [
      '-f',
      'bestaudio',
      '--extract-audio',
      '--audio-format',
      format,
      '--audio-quality',
      this.config.maxQuality,
      '--embed-thumbnail',
      '--add-metadata',
      '--output',
      path.join(outputDir, '%(title)s.%(ext)s'),
      '--no-playlist', // Force le téléchargement d'une seule vidéo
      data.url
    ];

    // Lancer le processus de téléchargement
    const downloadProcess = spawn(this.config.ytDlpPath, ytDlpArgs);

    // Stocker le processus pour pouvoir l'annuler plus tard
    this.activeDownloads.set(downloadId, downloadProcess);

    let filePath = '';
    let progress = 0;
    let stderr = '';

    // Analyser la sortie pour suivre la progression
    downloadProcess.stdout.on('data', (chunk) => {
      const output = chunk.toString();

      // Analyser la progression du téléchargement
      const progressMatch = output.match(
        /(\d+(\.\d+)?)% of ~?(\d+(\.\d+)?)(\w+) at\s+(\d+(\.\d+)?)(\w+)\/s/
      );
      if (progressMatch) {
        progress = parseFloat(progressMatch[1]);

        this.eventBus.publish('DOWNLOAD_PROGRESS', {
          id: downloadId,
          progress: progress,
          speed: `${progressMatch[6]}${progressMatch[8]}/s`,
          source: 'youtube',
          requestId: data.requestId
        });
      }

      // Capturer le chemin du fichier de sortie
      const destMatch = output.match(/\[download\] Destination: (.+)/);
      if (destMatch) {
        filePath = destMatch[1];
      }
    });

    downloadProcess.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    downloadProcess.on('close', (code) => {
      // Supprimer le téléchargement actif
      this.activeDownloads.delete(downloadId);

      if (code === 0) {
        // Téléchargement réussi
        this.eventBus.publish('DOWNLOAD_COMPLETED', {
          id: downloadId,
          filePath: filePath,
          format: format,
          source: 'youtube',
          url: data.url,
          requestId: data.requestId
        });

        // Demander l'extraction des métadonnées pour mise à jour
        this.eventBus.publish('METADATA_REQUEST', {
          filePath: filePath,
          source: 'youtube',
          requestId: data.requestId
        });
      } else {
        // Erreur de téléchargement
        this.eventBus.publish('DOWNLOAD_ERROR', {
          id: downloadId,
          url: data.url,
          error: stderr || 'Erreur de téléchargement inconnue',
          code: code,
          source: 'youtube',
          requestId: data.requestId
        });
      }
    });
  }

  /**
   * Annule un téléchargement en cours
   * @param {Object} data - Données de la demande d'annulation
   */
  cancelDownload(data) {
    if (!data || !data.id) {
      this.eventBus.publish('ERROR', {
        source: 'youtube-adapter',
        message: "ID de téléchargement manquant pour l'annulation",
        code: 'MISSING_DOWNLOAD_ID',
        requestId: data.requestId
      });
      return;
    }

    const downloadProcess = this.activeDownloads.get(data.id);
    if (downloadProcess) {
      // Tuer le processus de téléchargement
      downloadProcess.kill();

      // Supprimer de la liste des téléchargements actifs
      this.activeDownloads.delete(data.id);

      // Notifier que le téléchargement a été annulé
      this.eventBus.publish('DOWNLOAD_CANCELLED', {
        id: data.id,
        source: 'youtube',
        requestId: data.requestId
      });
    }
  }
}

/**
 * Initialise l'adaptateur YouTube lorsqu'il est chargé dans l'application
 * @param {Object} eventBus - Le bus d'événements de l'application
 * @returns {YouTubeAdapter} L'instance de l'adaptateur YouTube
 */
function initializeYouTubeAdapter(eventBus) {
  const adapter = new YouTubeAdapter();
  adapter.init(eventBus);
  return adapter;
}

// Exposer uniquement la fonction d'initialisation
module.exports = initializeYouTubeAdapter;

/**
 * Exemples d'utilisation:
 *
 * // Initialisation de l'adaptateur
 * const eventBus = ... // obtenir le bus d'événements de l'application
 * const youtubeAdapter = require('./adapters/youtube-adapter')(eventBus);
 *
 * // Pour télécharger une vidéo:
 * eventBus.publish('DOWNLOAD_REQUEST', {
 *   url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
 *   format: 'mp3',
 *   outputDir: '/chemin/vers/dossier',
 *   requestId: 'request_123'
 * });
 *
 * // Pour obtenir des informations sur une vidéo:
 * eventBus.publish('YOUTUBE_GET_INFO', {
 *   url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
 *   requestId: 'info_123'
 * });
 *
 * // Pour annuler un téléchargement:
 * eventBus.publish('DOWNLOAD_CANCEL', {
 *   id: 'youtube_1234567890',
 *   requestId: 'cancel_123'
 * });
 */ // Adaptateur pour YouTube
// Créé automatiquement le 2025-05-02
