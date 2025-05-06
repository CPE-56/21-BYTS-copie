/**
 * @fileoverview Définition des codes d'erreur standardisés pour l'application 21 BYTS
 *
 * Ce module définit tous les codes d'erreur utilisés dans l'application.
 * Il suit le principe de modularité avec une architecture "Single File Component",
 * fonctionnant de manière autonome sans dépendances directes sur d'autres modules.
 *
 * Chaque code d'erreur est organisé par catégorie et possède:
 * - Un code unique (numérique)
 * - Un nom symbolique (constante)
 * - Un message par défaut
 * - Un niveau de sévérité
 *
 * Ces codes sont utilisés via le bus d'événements pour assurer une gestion
 * d'erreurs cohérente à travers toute l'application.
 *
 * @module constants/error-codes
 */

// Niveaux de sévérité des erreurs
const SEVERITY = {
  FATAL: 'FATAL', // Erreur critique nécessitant l'arrêt de l'application
  ERROR: 'ERROR', // Erreur sérieuse mais non fatale
  WARNING: 'WARNING', // Avertissement - l'opération peut continuer
  INFO: 'INFO' // Information - pour debugging
};

// Catégories d'erreurs
const CATEGORY = {
  GENERAL: 'GENERAL', // Erreurs générales
  NETWORK: 'NETWORK', // Erreurs réseau
  DOWNLOAD: 'DOWNLOAD', // Erreurs de téléchargement
  FILE_SYSTEM: 'FILE_SYSTEM', // Erreurs liées au système de fichiers
  AUTH: 'AUTH', // Erreurs d'authentification
  CONVERTER: 'CONVERTER', // Erreurs de conversion
  CONFIG: 'CONFIG', // Erreurs de configuration
  PLATFORM: 'PLATFORM', // Erreurs spécifiques à la plateforme
  EXTERNAL: 'EXTERNAL', // Erreurs liées aux outils externes (yt-dlp, FFmpeg)
  UI: 'UI', // Erreurs d'interface utilisateur
  METADATA: 'METADATA' // Erreurs de métadonnées
};

/**
 * Structure d'un code d'erreur
 * @typedef {Object} ErrorCode
 * @property {number} code - Code numérique unique
 * @property {string} name - Nom symbolique de l'erreur
 * @property {string} message - Message d'erreur par défaut
 * @property {string} severity - Niveau de sévérité (de SEVERITY)
 * @property {string} category - Catégorie d'erreur (de CATEGORY)
 */

/**
 * Codes d'erreur généraux (1-99)
 */
const GENERAL = {
  UNKNOWN_ERROR: {
    code: 1,
    name: 'UNKNOWN_ERROR',
    message: 'Une erreur inconnue est survenue',
    severity: SEVERITY.ERROR,
    category: CATEGORY.GENERAL
  },
  INITIALIZATION_FAILED: {
    code: 2,
    name: 'INITIALIZATION_FAILED',
    message: "Échec de l'initialisation du module",
    severity: SEVERITY.FATAL,
    category: CATEGORY.GENERAL
  },
  INVALID_PARAMETER: {
    code: 3,
    name: 'INVALID_PARAMETER',
    message: 'Paramètre invalide',
    severity: SEVERITY.ERROR,
    category: CATEGORY.GENERAL
  },
  OPERATION_TIMEOUT: {
    code: 4,
    name: 'OPERATION_TIMEOUT',
    message: "L'opération a expiré",
    severity: SEVERITY.ERROR,
    category: CATEGORY.GENERAL
  },
  OPERATION_ABORTED: {
    code: 5,
    name: 'OPERATION_ABORTED',
    message: "L'opération a été annulée",
    severity: SEVERITY.INFO,
    category: CATEGORY.GENERAL
  },
  MODULE_NOT_FOUND: {
    code: 6,
    name: 'MODULE_NOT_FOUND',
    message: 'Module non trouvé',
    severity: SEVERITY.ERROR,
    category: CATEGORY.GENERAL
  }
};

/**
 * Codes d'erreur réseau (100-199)
 */
const NETWORK = {
  CONNECTION_FAILED: {
    code: 100,
    name: 'CONNECTION_FAILED',
    message: 'Échec de la connexion au serveur',
    severity: SEVERITY.ERROR,
    category: CATEGORY.NETWORK
  },
  CONNECTION_TIMEOUT: {
    code: 101,
    name: 'CONNECTION_TIMEOUT',
    message: "Délai d'attente de connexion dépassé",
    severity: SEVERITY.ERROR,
    category: CATEGORY.NETWORK
  },
  HOST_UNREACHABLE: {
    code: 102,
    name: 'HOST_UNREACHABLE',
    message: 'Hôte inaccessible',
    severity: SEVERITY.ERROR,
    category: CATEGORY.NETWORK
  },
  DNS_RESOLUTION_FAILED: {
    code: 103,
    name: 'DNS_RESOLUTION_FAILED',
    message: 'Échec de la résolution DNS',
    severity: SEVERITY.ERROR,
    category: CATEGORY.NETWORK
  },
  SSL_ERROR: {
    code: 104,
    name: 'SSL_ERROR',
    message: 'Erreur SSL/TLS',
    severity: SEVERITY.ERROR,
    category: CATEGORY.NETWORK
  },
  PROXY_ERROR: {
    code: 105,
    name: 'PROXY_ERROR',
    message: 'Erreur de proxy',
    severity: SEVERITY.ERROR,
    category: CATEGORY.NETWORK
  },
  RATE_LIMITED: {
    code: 106,
    name: 'RATE_LIMITED',
    message: 'Limitation de débit détectée',
    severity: SEVERITY.WARNING,
    category: CATEGORY.NETWORK
  },
  CONTENT_BLOCKED: {
    code: 107,
    name: 'CONTENT_BLOCKED',
    message: 'Contenu bloqué ou géo-restreint',
    severity: SEVERITY.ERROR,
    category: CATEGORY.NETWORK
  }
};

/**
 * Codes d'erreur de téléchargement (200-299)
 */
const DOWNLOAD = {
  DOWNLOAD_FAILED: {
    code: 200,
    name: 'DOWNLOAD_FAILED',
    message: 'Échec du téléchargement',
    severity: SEVERITY.ERROR,
    category: CATEGORY.DOWNLOAD
  },
  INVALID_URL: {
    code: 201,
    name: 'INVALID_URL',
    message: 'URL invalide ou non supportée',
    severity: SEVERITY.ERROR,
    category: CATEGORY.DOWNLOAD
  },
  STREAM_NOT_FOUND: {
    code: 202,
    name: 'STREAM_NOT_FOUND',
    message: 'Flux audio non trouvé',
    severity: SEVERITY.ERROR,
    category: CATEGORY.DOWNLOAD
  },
  DOWNLOAD_INTERRUPTED: {
    code: 203,
    name: 'DOWNLOAD_INTERRUPTED',
    message: 'Le téléchargement a été interrompu',
    severity: SEVERITY.WARNING,
    category: CATEGORY.DOWNLOAD
  },
  RESOURCE_UNAVAILABLE: {
    code: 204,
    name: 'RESOURCE_UNAVAILABLE',
    message: "La ressource n'est plus disponible",
    severity: SEVERITY.ERROR,
    category: CATEGORY.DOWNLOAD
  },
  TOO_MANY_REDIRECTS: {
    code: 205,
    name: 'TOO_MANY_REDIRECTS',
    message: 'Trop de redirections',
    severity: SEVERITY.ERROR,
    category: CATEGORY.DOWNLOAD
  },
  PLAYLIST_TOO_LARGE: {
    code: 206,
    name: 'PLAYLIST_TOO_LARGE',
    message: 'Playlist trop volumineuse (>200 titres)',
    severity: SEVERITY.WARNING,
    category: CATEGORY.DOWNLOAD
  },
  UNSUPPORTED_PLATFORM: {
    code: 207,
    name: 'UNSUPPORTED_PLATFORM',
    message: 'Plateforme non supportée',
    severity: SEVERITY.ERROR,
    category: CATEGORY.DOWNLOAD
  }
};

/**
 * Codes d'erreur système de fichiers (300-399)
 */
const FILE_SYSTEM = {
  FILE_NOT_FOUND: {
    code: 300,
    name: 'FILE_NOT_FOUND',
    message: 'Fichier non trouvé',
    severity: SEVERITY.ERROR,
    category: CATEGORY.FILE_SYSTEM
  },
  PERMISSION_DENIED: {
    code: 301,
    name: 'PERMISSION_DENIED',
    message: 'Permission refusée',
    severity: SEVERITY.ERROR,
    category: CATEGORY.FILE_SYSTEM
  },
  DISK_FULL: {
    code: 302,
    name: 'DISK_FULL',
    message: 'Espace disque insuffisant',
    severity: SEVERITY.ERROR,
    category: CATEGORY.FILE_SYSTEM
  },
  FILE_ALREADY_EXISTS: {
    code: 303,
    name: 'FILE_ALREADY_EXISTS',
    message: 'Le fichier existe déjà',
    severity: SEVERITY.WARNING,
    category: CATEGORY.FILE_SYSTEM
  },
  PATH_TOO_LONG: {
    code: 304,
    name: 'PATH_TOO_LONG',
    message: 'Chemin trop long',
    severity: SEVERITY.ERROR,
    category: CATEGORY.FILE_SYSTEM
  },
  INVALID_FILENAME: {
    code: 305,
    name: 'INVALID_FILENAME',
    message: 'Nom de fichier invalide',
    severity: SEVERITY.ERROR,
    category: CATEGORY.FILE_SYSTEM
  },
  IO_ERROR: {
    code: 306,
    name: 'IO_ERROR',
    message: "Erreur d'entrée/sortie",
    severity: SEVERITY.ERROR,
    category: CATEGORY.FILE_SYSTEM
  },
  FOLDER_ACCESS_DENIED: {
    code: 307,
    name: 'FOLDER_ACCESS_DENIED',
    message: 'Accès au dossier refusé',
    severity: SEVERITY.ERROR,
    category: CATEGORY.FILE_SYSTEM
  }
};

/**
 * Codes d'erreur d'authentification (400-499)
 */
const AUTH = {
  AUTH_FAILED: {
    code: 400,
    name: 'AUTH_FAILED',
    message: "Échec d'authentification",
    severity: SEVERITY.ERROR,
    category: CATEGORY.AUTH
  },
  TOKEN_EXPIRED: {
    code: 401,
    name: 'TOKEN_EXPIRED',
    message: "Token d'authentification expiré",
    severity: SEVERITY.WARNING,
    category: CATEGORY.AUTH
  },
  INVALID_CREDENTIALS: {
    code: 402,
    name: 'INVALID_CREDENTIALS',
    message: 'Identifiants invalides',
    severity: SEVERITY.ERROR,
    category: CATEGORY.AUTH
  },
  SESSION_EXPIRED: {
    code: 403,
    name: 'SESSION_EXPIRED',
    message: 'Session expirée',
    severity: SEVERITY.WARNING,
    category: CATEGORY.AUTH
  },
  OAUTH_ERROR: {
    code: 404,
    name: 'OAUTH_ERROR',
    message: "Erreur lors de l'authentification OAuth",
    severity: SEVERITY.ERROR,
    category: CATEGORY.AUTH
  },
  AUTH_REQUIRED: {
    code: 405,
    name: 'AUTH_REQUIRED',
    message: 'Authentification requise',
    severity: SEVERITY.WARNING,
    category: CATEGORY.AUTH
  },
  TOKEN_STORAGE_ERROR: {
    code: 406,
    name: 'TOKEN_STORAGE_ERROR',
    message: 'Erreur lors du stockage du token',
    severity: SEVERITY.ERROR,
    category: CATEGORY.AUTH
  }
};

/**
 * Codes d'erreur de conversion (500-599)
 */
const CONVERTER = {
  CONVERSION_FAILED: {
    code: 500,
    name: 'CONVERSION_FAILED',
    message: 'Échec de la conversion audio',
    severity: SEVERITY.ERROR,
    category: CATEGORY.CONVERTER
  },
  UNSUPPORTED_FORMAT: {
    code: 501,
    name: 'UNSUPPORTED_FORMAT',
    message: 'Format audio non supporté',
    severity: SEVERITY.ERROR,
    category: CATEGORY.CONVERTER
  },
  QUALITY_NOT_AVAILABLE: {
    code: 502,
    name: 'QUALITY_NOT_AVAILABLE',
    message: "La qualité demandée n'est pas disponible",
    severity: SEVERITY.WARNING,
    category: CATEGORY.CONVERTER
  },
  ENCODER_ERROR: {
    code: 503,
    name: 'ENCODER_ERROR',
    message: "Erreur de l'encodeur",
    severity: SEVERITY.ERROR,
    category: CATEGORY.CONVERTER
  },
  DECODER_ERROR: {
    code: 504,
    name: 'DECODER_ERROR',
    message: 'Erreur du décodeur',
    severity: SEVERITY.ERROR,
    category: CATEGORY.CONVERTER
  },
  CORRUPTED_FILE: {
    code: 505,
    name: 'CORRUPTED_FILE',
    message: 'Fichier audio corrompu',
    severity: SEVERITY.ERROR,
    category: CATEGORY.CONVERTER
  }
};

/**
 * Codes d'erreur de configuration (600-699)
 */
const CONFIG = {
  CONFIG_NOT_FOUND: {
    code: 600,
    name: 'CONFIG_NOT_FOUND',
    message: 'Configuration non trouvée',
    severity: SEVERITY.ERROR,
    category: CATEGORY.CONFIG
  },
  INVALID_CONFIG: {
    code: 601,
    name: 'INVALID_CONFIG',
    message: 'Configuration invalide',
    severity: SEVERITY.ERROR,
    category: CATEGORY.CONFIG
  },
  CONFIG_WRITE_ERROR: {
    code: 602,
    name: 'CONFIG_WRITE_ERROR',
    message: "Erreur lors de l'écriture de la configuration",
    severity: SEVERITY.ERROR,
    category: CATEGORY.CONFIG
  },
  DEFAULT_CONFIG_LOAD_ERROR: {
    code: 603,
    name: 'DEFAULT_CONFIG_LOAD_ERROR',
    message: 'Erreur lors du chargement de la configuration par défaut',
    severity: SEVERITY.ERROR,
    category: CATEGORY.CONFIG
  },
  CONFIG_MIGRATION_FAILED: {
    code: 604,
    name: 'CONFIG_MIGRATION_FAILED',
    message: 'Échec de la migration de configuration',
    severity: SEVERITY.WARNING,
    category: CATEGORY.CONFIG
  }
};

/**
 * Codes d'erreur spécifiques à la plateforme (700-799)
 */
const PLATFORM = {
  UNSUPPORTED_OS: {
    code: 700,
    name: 'UNSUPPORTED_OS',
    message: "Système d'exploitation non supporté",
    severity: SEVERITY.ERROR,
    category: CATEGORY.PLATFORM
  },
  MISSING_DEPENDENCY: {
    code: 701,
    name: 'MISSING_DEPENDENCY',
    message: 'Dépendance système manquante',
    severity: SEVERITY.ERROR,
    category: CATEGORY.PLATFORM
  },
  PLATFORM_RESTRICTION: {
    code: 702,
    name: 'PLATFORM_RESTRICTION',
    message: 'Restriction liée à la plateforme',
    severity: SEVERITY.WARNING,
    category: CATEGORY.PLATFORM
  },
  SYSTEM_INTEGRATION_FAILED: {
    code: 703,
    name: 'SYSTEM_INTEGRATION_FAILED',
    message: "Échec de l'intégration système",
    severity: SEVERITY.ERROR,
    category: CATEGORY.PLATFORM
  }
};

/**
 * Codes d'erreur liés aux outils externes (800-899)
 */
const EXTERNAL = {
  TOOL_NOT_FOUND: {
    code: 800,
    name: 'TOOL_NOT_FOUND',
    message: 'Outil externe non trouvé',
    severity: SEVERITY.ERROR,
    category: CATEGORY.EXTERNAL
  },
  TOOL_EXECUTION_FAILED: {
    code: 801,
    name: 'TOOL_EXECUTION_FAILED',
    message: "Échec de l'exécution de l'outil externe",
    severity: SEVERITY.ERROR,
    category: CATEGORY.EXTERNAL
  },
  TOOL_VERSION_INCOMPATIBLE: {
    code: 802,
    name: 'TOOL_VERSION_INCOMPATIBLE',
    message: "Version de l'outil incompatible",
    severity: SEVERITY.ERROR,
    category: CATEGORY.EXTERNAL
  },
  YTDLP_ERROR: {
    code: 810,
    name: 'YTDLP_ERROR',
    message: 'Erreur yt-dlp',
    severity: SEVERITY.ERROR,
    category: CATEGORY.EXTERNAL
  },
  FFMPEG_ERROR: {
    code: 820,
    name: 'FFMPEG_ERROR',
    message: 'Erreur FFmpeg',
    severity: SEVERITY.ERROR,
    category: CATEGORY.EXTERNAL
  },
  TIDAL_DOWNLOADER_ERROR: {
    code: 830,
    name: 'TIDAL_DOWNLOADER_ERROR',
    message: 'Erreur Tidal-Media-Downloader',
    severity: SEVERITY.ERROR,
    category: CATEGORY.EXTERNAL
  }
};

/**
 * Codes d'erreur d'interface utilisateur (900-999)
 */
const UI = {
  RENDER_ERROR: {
    code: 900,
    name: 'RENDER_ERROR',
    message: "Erreur de rendu de l'interface",
    severity: SEVERITY.ERROR,
    category: CATEGORY.UI
  },
  COMPONENT_NOT_FOUND: {
    code: 901,
    name: 'COMPONENT_NOT_FOUND',
    message: 'Composant UI non trouvé',
    severity: SEVERITY.ERROR,
    category: CATEGORY.UI
  },
  EVENT_BINDING_FAILED: {
    code: 902,
    name: 'EVENT_BINDING_FAILED',
    message: "Échec de la liaison d'événement UI",
    severity: SEVERITY.ERROR,
    category: CATEGORY.UI
  },
  DIALOG_ERROR: {
    code: 903,
    name: 'DIALOG_ERROR',
    message: "Erreur lors de l'affichage du dialogue",
    severity: SEVERITY.ERROR,
    category: CATEGORY.UI
  }
};

/**
 * Codes d'erreur de métadonnées (1000-1099)
 */
const METADATA = {
  METADATA_EXTRACTION_FAILED: {
    code: 1000,
    name: 'METADATA_EXTRACTION_FAILED',
    message: "Échec de l'extraction des métadonnées",
    severity: SEVERITY.WARNING,
    category: CATEGORY.METADATA
  },
  METADATA_WRITE_FAILED: {
    code: 1001,
    name: 'METADATA_WRITE_FAILED',
    message: "Échec de l'écriture des métadonnées",
    severity: SEVERITY.WARNING,
    category: CATEGORY.METADATA
  },
  ARTWORK_NOT_FOUND: {
    code: 1002,
    name: 'ARTWORK_NOT_FOUND',
    message: "Pochette d'album non trouvée",
    severity: SEVERITY.INFO,
    category: CATEGORY.METADATA
  },
  UNSUPPORTED_TAG_FORMAT: {
    code: 1003,
    name: 'UNSUPPORTED_TAG_FORMAT',
    message: 'Format de tag non supporté',
    severity: SEVERITY.WARNING,
    category: CATEGORY.METADATA
  },
  TAG_WRITE_PERMISSION_DENIED: {
    code: 1004,
    name: 'TAG_WRITE_PERMISSION_DENIED',
    message: "Permission d'écriture des tags refusée",
    severity: SEVERITY.WARNING,
    category: CATEGORY.METADATA
  }
};

/**
 * Regroupement de tous les codes d'erreur
 */
const ERROR_CODES = {
  // Catégories de sévérité
  SEVERITY,
  // Catégories d'erreurs
  CATEGORY,
  // Codes d'erreur par catégorie
  GENERAL,
  NETWORK,
  DOWNLOAD,
  FILE_SYSTEM,
  AUTH,
  CONVERTER,
  CONFIG,
  PLATFORM,
  EXTERNAL,
  UI,
  METADATA,

  /**
   * Retrouve un code d'erreur à partir de son code numérique
   * @param {number} code - Code numérique à rechercher
   * @returns {ErrorCode|null} - Le code d'erreur ou null si non trouvé
   */
  getByCode(code) {
    // Recherche dans toutes les catégories
    for (const category of Object.values(this)) {
      if (typeof category !== 'object' || category === null || typeof category === 'function') {
        continue;
      }

      for (const errorCode of Object.values(category)) {
        if (typeof errorCode === 'object' && errorCode !== null && errorCode.code === code) {
          return errorCode;
        }
      }
    }

    return null;
  },

  /**
   * Retrouve un code d'erreur à partir de son nom symbolique
   * @param {string} name - Nom symbolique à rechercher
   * @returns {ErrorCode|null} - Le code d'erreur ou null si non trouvé
   */
  getByName(name) {
    // Recherche dans toutes les catégories
    for (const category of Object.values(this)) {
      if (typeof category !== 'object' || category === null || typeof category === 'function') {
        continue;
      }

      if (category[name]) {
        return category[name];
      }
    }

    return null;
  },

  /**
   * Crée un objet d'erreur avec des informations supplémentaires
   * @param {string|number} codeOrName - Code numérique ou nom symbolique de l'erreur
   * @param {string} [message] - Message d'erreur personnalisé (optionnel)
   * @param {Object} [data] - Données additionnelles sur l'erreur (optionnel)
   * @returns {Object} - Objet d'erreur formaté
   */
  createError(codeOrName, message, data = {}) {
    let errorCode;

    if (typeof codeOrName === 'number') {
      errorCode = this.getByCode(codeOrName);
    } else {
      errorCode = this.getByName(codeOrName);
    }

    if (!errorCode) {
      errorCode = this.GENERAL.UNKNOWN_ERROR;
    }

    return {
      code: errorCode.code,
      name: errorCode.name,
      message: message || errorCode.message,
      severity: errorCode.severity,
      category: errorCode.category,
      timestamp: new Date().toISOString(),
      data
    };
  }
};

// Exportation du module
module.exports = ERROR_CODES;

/**
 * Exemple d'utilisation:
 *
 * // Dans un autre module (via le bus d'événements)
 *
 * // Importation du bus d'événements
 * const eventBus = (...); // Obtenu via l'injection de dépendances
 *
 * try {
 *   // Tentative de téléchargement...
 * } catch (err) {
 *   // Création d'une erreur standardisée
 *   const error = ERROR_CODES.createError(
 *     ERROR_CODES.DOWNLOAD.DOWNLOAD_FAILED,
 *     "Échec du téléchargement: réponse HTTP 403",
 *     { url: "https://example.com/audio.mp3", statusCode: 403 }
 *   );
 *
 *   // Publication de l'erreur sur le bus d'événements
 *   eventBus.publish('error:download', error);
 * }
 */ // Codes d'erreur standardisés
// Créé automatiquement le 2025-05-02
