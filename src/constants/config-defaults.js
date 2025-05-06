/**
 * @file config-defaults.js
 * @description Définit les valeurs par défaut pour la configuration de l'application 21 BYTS.
 * Ce module expose les configurations par défaut qui seront utilisées par le config-manager.
 * Il ne contient aucune logique, seulement des constantes et des valeurs par défaut.
 *
 * @note Ce fichier est autonome et ne dépend d'aucun autre module du projet,
 * conformément à l'architecture "Single File Components".
 */

// Objet contenant toutes les valeurs par défaut de l'application
const CONFIG_DEFAULTS = {
  /**
   * Configuration générale de l'application
   */
  app: {
    name: '21 BYTS',
    version: '1.0.0',
    logLevel: 'info', // Niveaux possibles: debug, info, warn, error
    maxConcurrentDownloads: 3,
    autoCheckUpdates: true,
    updateCheckInterval: 86400000, // 24 heures en millisecondes
    language: 'fr', // Langue par défaut
    theme: 'dark' // Thème par défaut (dark/light)
  },

  /**
   * Configuration des chemins de l'application
   */
  paths: {
    downloads: '', // Sera défini automatiquement selon l'OS par le config-manager
    tempDir: '', // Sera défini automatiquement selon l'OS
    logDir: '', // Sera défini automatiquement selon l'OS
    configDir: '', // Sera défini automatiquement selon l'OS
    binaries: {
      ytdlp: '', // Sera défini automatiquement selon l'OS
      ffmpeg: '' // Sera défini automatiquement selon l'OS
    }
  },

  /**
   * Configuration des téléchargements
   */
  downloads: {
    maxPlaylistItems: 200, // Nombre maximum d'éléments à télécharger dans une playlist
    formats: {
      defaultAudioFormat: 'mp3', // Format par défaut
      availableFormats: ['mp3', 'wav', 'flac', 'aiff'],
      qualityPresets: {
        mp3: {
          bitrate: '320k',
          sampleRate: '44.1k'
        },
        wav: {
          bitDepth: '16',
          sampleRate: '44.1k'
        },
        flac: {
          compressionLevel: '8', // 0-8, 8 étant la compression maximale
          sampleRate: '44.1k'
        },
        aiff: {
          bitDepth: '16',
          sampleRate: '44.1k'
        }
      }
    },
    autoRetryCount: 3, // Nombre de tentatives en cas d'échec
    retryDelay: 5000, // Délai entre les tentatives en millisecondes
    timeout: 120000 // Timeout en millisecondes (2 minutes)
  },

  /**
   * Configuration des adaptateurs par plateforme
   */
  adapters: {
    youtube: {
      enabled: true,
      priority: 1, // Priorité de l'adaptateur (plus petit = plus prioritaire)
      maxConnections: 3,
      options: {
        extractAudio: true,
        audioFormat: 'mp3', // Format par défaut
        audioQuality: 0, // 0 = meilleure qualité
        addMetadata: true,
        embedThumbnail: true,
        preferFreeFormats: true
      }
    },
    soundcloud: {
      enabled: true,
      priority: 2,
      maxConnections: 3,
      options: {
        extractAudio: true,
        audioFormat: 'mp3',
        addMetadata: true,
        embedThumbnail: true
      }
    },
    bandcamp: {
      enabled: true,
      priority: 2,
      maxConnections: 2,
      options: {
        extractAudio: true,
        audioFormat: 'mp3',
        addMetadata: true,
        embedThumbnail: true
      }
    },
    spotify: {
      enabled: true,
      priority: 3,
      maxConnections: 2,
      options: {
        extractAudio: true,
        audioFormat: 'mp3',
        addMetadata: true,
        embedThumbnail: true
      }
    },
    tidal: {
      enabled: true,
      priority: 3,
      maxConnections: 2,
      authEndpoint: 'https://auth.tidal.com/v1/oauth2',
      maxTokenAge: 3600000, // 1 heure en millisecondes
      preferredQuality: 'HIGH', // Options: NORMAL, HIGH, LOSSLESS, HI_RES
      options: {
        extractAudio: true,
        audioFormat: 'flac', // Par défaut en FLAC pour Tidal
        addMetadata: true,
        embedThumbnail: true
      }
    }
  },

  /**
   * Configuration de l'interface utilisateur
   */
  ui: {
    showThumbnails: true,
    compactMode: false,
    refreshRate: 1000, // Taux de rafraîchissement des informations en millisecondes
    notificationsEnabled: true,
    confirmClearCompleted: true,
    confirmDeleteDownload: true,
    autoExpandPlaylists: true,
    colorCoding: {
      youtube: '#ee0000', // Rouge
      bandcamp: '#1DA0C3', // Bleu
      soundcloud: '#FF7700', // Orange
      spotify: '#1DB954', // Vert
      tidal: '#000000', // Noir
      default: '#888888' // Gris pour les autres services
    }
  },

  /**
   * Configuration de métadonnées
   */
  metadata: {
    extractFromSource: true,
    overwriteExisting: false,
    embedArtwork: true,
    keepOriginalArtwork: true,
    minArtworkSize: 500, // Taille minimale en pixels (carré)
    maxArtworkSize: 1500, // Taille maximale en pixels (carré)
    artworkFormat: 'jpeg', // Format d'image pour les pochettes
    artworkQuality: 90, // Qualité JPEG (0-100)
    normalizeAudioTags: true, // Standardise les noms de tags
    standardizeTitles: true // Corrige la casse des titres
  },

  /**
   * Configuration de sécurité
   */
  security: {
    encryptionKey: '', // Sera générée au premier lancement
    encryptionAlgorithm: 'aes-256-gcm',
    secureTokenStorage: true,
    tokenExpiryCheck: true,
    minimumPasswordLength: 8 // Pour l'accès aux comptes protégés
  },

  /**
   * Configuration pour la mise à jour automatique
   */
  updater: {
    checkOnStartup: true,
    autoDownload: true,
    autoInstall: false, // Demande confirmation par défaut
    releaseChannel: 'stable', // Options: stable, beta, dev
    updateEndpoint: 'https://api.github.com/repos/21byts/desktop/releases/latest'
  },

  /**
   * Configuration pour la bibliothèque musicale
   */
  library: {
    autoImport: false, // N'importe pas automatiquement
    macMusicAppIntegration: false, // Integration avec Music.app sur macOS
    windowsMediaPlayerIntegration: false, // Integration avec Media Player sur Windows
    organizeFiles: true, // Organise les fichiers téléchargés
    fileNamingTemplate: '{artist} - {title}', // Modèle de nommage des fichiers
    folderStructureTemplate: '{artist}/{album}' // Structure des dossiers
  },

  /**
   * Configuration pour le debug et la journalisation
   */
  debug: {
    enabled: false,
    logDownloadProgress: false,
    logNetworkActivity: false,
    logEventBus: false,
    logConfigChanges: true,
    saveLogsToFile: true,
    maxLogFileSize: 10485760, // 10 Mo en octets
    maxLogFiles: 5 // Nombre de fichiers de logs à conserver
  }
};

// Export de l'objet de configuration
module.exports = Object.freeze(CONFIG_DEFAULTS); // Valeurs par défaut pour la configuration
// Créé automatiquement le 2025-05-02
