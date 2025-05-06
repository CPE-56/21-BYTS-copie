/**
 * @fileoverview Module adapter-factory.js - Factory pattern implementation for creating download adapters
 * @description Ce module fournit une fabrique pour créer des adaptateurs de téléchargement pour
 * différentes plateformes (YouTube, SoundCloud, Bandcamp, Spotify, Tidal) sans dépendances directes.
 * Il suit le pattern Factory et communique exclusivement via le bus d'événements.
 *
 * @module modules/download/adapters/adapter-factory
 * @requires electron
 * @requires path
 * @requires fs
 *
 * @events
 * Écoutés:
 * - ADAPTER_FACTORY_CREATE: Crée et renvoie une instance d'adaptateur pour une plateforme spécifique
 * - ADAPTER_FACTORY_DETECT_PLATFORM: Détecte la plateforme à partir d'une URL
 * - ADAPTER_FACTORY_GET_SUPPORTED_PLATFORMS: Renvoie la liste des plateformes supportées
 * - CONFIG_UPDATED: Mise à jour de la configuration globale affectant la création d'adaptateurs
 *
 * Émis:
 * - ADAPTER_FACTORY_ADAPTER_CREATED: Émis quand un adaptateur a été créé avec succès
 * - ADAPTER_FACTORY_PLATFORM_DETECTED: Émis quand la plateforme a été détectée depuis une URL
 * - ADAPTER_FACTORY_SUPPORTED_PLATFORMS: Liste des plateformes supportées
 * - ERROR: Émis quand une erreur se produit lors de la création d'un adaptateur
 */

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

/**
 * Classe Factory pour créer des adaptateurs de téléchargement
 */
class AdapterFactory {
  /**
   * Initialise la fabrique d'adaptateurs
   */
  constructor() {
    // Stocke les mappages d'URL pour la détection des plateformes
    this.platformPatterns = {
      youtube: /(youtube\.com|youtu\.be)/i,
      soundcloud: /soundcloud\.com/i,
      bandcamp: /bandcamp\.com/i,
      spotify: /spotify\.com/i,
      tidal: /tidal\.com/i
    };

    // Configuration par défaut - sera mise à jour via les événements CONFIG_UPDATED
    this.config = {
      yt_dlp_path: '',
      tidal_downloader_path: '',
      max_concurrent_downloads: 3,
      download_quality: 'high' // 'low', 'medium', 'high'
    };

    // État interne
    this.isInitialized = false;
  }

  /**
   * Initialise le module et établit les abonnements au bus d'événements
   * @param {Object} eventBus - Le bus d'événements pour la communication
   */
  initialize(eventBus) {
    if (this.isInitialized) {
      return;
    }

    this.eventBus = eventBus;

    // S'abonner aux événements pertinents
    this.eventBus.subscribe('ADAPTER_FACTORY_CREATE', this.handleCreateAdapter.bind(this));
    this.eventBus.subscribe(
      'ADAPTER_FACTORY_DETECT_PLATFORM',
      this.handleDetectPlatform.bind(this)
    );
    this.eventBus.subscribe(
      'ADAPTER_FACTORY_GET_SUPPORTED_PLATFORMS',
      this.handleGetSupportedPlatforms.bind(this)
    );
    this.eventBus.subscribe('CONFIG_UPDATED', this.handleConfigUpdated.bind(this));

    // Vérifier les chemins des binaires externes
    this.checkExternalDependencies();

    this.isInitialized = true;

    // Journalisation de l'initialisation
    this.eventBus.publish('LOG_INFO', {
      module: 'adapter-factory',
      message: 'AdapterFactory initialized successfully'
    });
  }

  /**
   * Vérifie si les dépendances externes (yt-dlp, Tidal downloader) sont présentes
   * et met à jour la configuration avec les chemins
   * @private
   */
  checkExternalDependencies() {
    try {
      // Déterminer les chemins en fonction de la plateforme
      const appPath = app.getAppPath();
      const binFolder = path.join(appPath, 'bin');

      let yt_dlp_bin = 'yt-dlp';
      let tidal_downloader_bin = 'tidal-downloader';

      // Ajuster selon le système d'exploitation
      if (process.platform === 'win32') {
        yt_dlp_bin += '.exe';
        tidal_downloader_bin += '.exe';
      }

      const yt_dlp_path = path.join(binFolder, yt_dlp_bin);
      const tidal_downloader_path = path.join(binFolder, tidal_downloader_bin);

      // Vérifier l'existence des binaires
      if (fs.existsSync(yt_dlp_path)) {
        this.config.yt_dlp_path = yt_dlp_path;
      } else {
        this.eventBus.publish('LOG_WARNING', {
          module: 'adapter-factory',
          message: 'yt-dlp binary not found at ' + yt_dlp_path
        });
      }

      if (fs.existsSync(tidal_downloader_path)) {
        this.config.tidal_downloader_path = tidal_downloader_path;
      } else {
        this.eventBus.publish('LOG_WARNING', {
          module: 'adapter-factory',
          message: 'Tidal downloader binary not found at ' + tidal_downloader_path
        });
      }
    } catch (error) {
      this.eventBus.publish('ERROR', {
        module: 'adapter-factory',
        method: 'checkExternalDependencies',
        message: 'Failed to check external dependencies',
        error: error.message
      });
    }
  }

  /**
   * Détecte la plateforme à partir d'une URL
   * @param {string} url - L'URL à analyser
   * @returns {string|null} - Le nom de la plateforme ou null si non supportée
   * @private
   */
  detectPlatform(url) {
    if (!url || typeof url !== 'string') {
      return null;
    }

    for (const [platform, pattern] of Object.entries(this.platformPatterns)) {
      if (pattern.test(url)) {
        return platform;
      }
    }

    return null;
  }

  /**
   * Crée un adaptateur pour la plateforme spécifiée
   * @param {string} platform - La plateforme pour laquelle créer l'adaptateur
   * @param {Object} options - Options de configuration spécifiques à l'adaptateur
   * @returns {Object} - Un objet représentant l'adaptateur de téléchargement
   * @private
   */
  createAdapter(platform, options = {}) {
    // Vérifier si la plateforme est supportée
    if (!this.getSupportedPlatforms().includes(platform)) {
      throw new Error(`Platform '${platform}' is not supported`);
    }

    // Créer une configuration spécifique à l'adaptateur en combinant la config globale et les options
    const adapterConfig = {
      ...this.config,
      ...options,
      platform
    };

    // Créer un adaptateur sous forme d'objet avec les méthodes nécessaires
    // mais sans dépendance directe sur une classe d'adaptateur
    const adapter = {
      platform,
      config: adapterConfig,

      // Structure commune à tous les adaptateurs sans dépendance sur une classe de base
      downloadInfo: {
        progress: 0,
        status: 'ready',
        message: '',
        metadata: {},
        errors: []
      },

      // Méthodes qui seront transformées en événements
      download: (url, options) => {
        this.eventBus.publish(`ADAPTER_${platform.toUpperCase()}_DOWNLOAD`, {
          url,
          options,
          adapterId: adapter.id
        });
      },

      pause: () => {
        this.eventBus.publish(`ADAPTER_${platform.toUpperCase()}_PAUSE`, {
          adapterId: adapter.id
        });
      },

      resume: () => {
        this.eventBus.publish(`ADAPTER_${platform.toUpperCase()}_RESUME`, {
          adapterId: adapter.id
        });
      },

      cancel: () => {
        this.eventBus.publish(`ADAPTER_${platform.toUpperCase()}_CANCEL`, {
          adapterId: adapter.id
        });
      },

      // Identifiant unique pour cet adaptateur
      id: `${platform}_adapter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    return adapter;
  }

  /**
   * Renvoie la liste des plateformes supportées
   * @returns {string[]} - Tableau des noms de plateformes supportées
   * @private
   */
  getSupportedPlatforms() {
    return Object.keys(this.platformPatterns);
  }

  /**
   * Gestionnaire pour l'événement de création d'adaptateur
   * @param {Object} data - Données de la requête
   * @private
   */
  handleCreateAdapter(data) {
    try {
      const { platform, options, requestId } = data;

      if (!platform) {
        throw new Error('Platform is required to create an adapter');
      }

      const adapter = this.createAdapter(platform, options);

      // Émettre un événement avec l'adaptateur créé
      this.eventBus.publish('ADAPTER_FACTORY_ADAPTER_CREATED', {
        adapter,
        requestId
      });
    } catch (error) {
      this.eventBus.publish('ERROR', {
        module: 'adapter-factory',
        method: 'handleCreateAdapter',
        message: 'Failed to create adapter',
        error: error.message,
        requestId: data?.requestId
      });
    }
  }

  /**
   * Gestionnaire pour l'événement de détection de plateforme
   * @param {Object} data - Données de la requête
   * @private
   */
  handleDetectPlatform(data) {
    try {
      const { url, requestId } = data;

      if (!url) {
        throw new Error('URL is required to detect platform');
      }

      const platform = this.detectPlatform(url);

      // Émettre un événement avec la plateforme détectée
      this.eventBus.publish('ADAPTER_FACTORY_PLATFORM_DETECTED', {
        url,
        platform,
        requestId
      });
    } catch (error) {
      this.eventBus.publish('ERROR', {
        module: 'adapter-factory',
        method: 'handleDetectPlatform',
        message: 'Failed to detect platform',
        error: error.message,
        requestId: data?.requestId
      });
    }
  }

  /**
   * Gestionnaire pour l'événement de récupération des plateformes supportées
   * @param {Object} data - Données de la requête
   * @private
   */
  handleGetSupportedPlatforms(data) {
    try {
      const { requestId } = data;
      const platforms = this.getSupportedPlatforms();

      // Émettre un événement avec les plateformes supportées
      this.eventBus.publish('ADAPTER_FACTORY_SUPPORTED_PLATFORMS', {
        platforms,
        requestId
      });
    } catch (error) {
      this.eventBus.publish('ERROR', {
        module: 'adapter-factory',
        method: 'handleGetSupportedPlatforms',
        message: 'Failed to get supported platforms',
        error: error.message,
        requestId: data?.requestId
      });
    }
  }

  /**
   * Gestionnaire pour l'événement de mise à jour de la configuration
   * @param {Object} data - Données de configuration
   * @private
   */
  handleConfigUpdated(data) {
    try {
      // Mise à jour des paramètres pertinents pour les adaptateurs
      if (data.yt_dlp_path) {
        this.config.yt_dlp_path = data.yt_dlp_path;
      }

      if (data.tidal_downloader_path) {
        this.config.tidal_downloader_path = data.tidal_downloader_path;
      }

      if (data.max_concurrent_downloads) {
        this.config.max_concurrent_downloads = data.max_concurrent_downloads;
      }

      if (data.download_quality) {
        this.config.download_quality = data.download_quality;
      }

      this.eventBus.publish('LOG_INFO', {
        module: 'adapter-factory',
        message: 'Configuration updated successfully'
      });
    } catch (error) {
      this.eventBus.publish('ERROR', {
        module: 'adapter-factory',
        method: 'handleConfigUpdated',
        message: 'Failed to update configuration',
        error: error.message
      });
    }
  }
}

/**
 * Crée et initialise une instance de la fabrique d'adaptateurs
 * @param {Object} eventBus - Le bus d'événements pour la communication
 */
function initializeAdapterFactory(eventBus) {
  if (!eventBus) {
    console.error('Event bus is required to initialize AdapterFactory');
    return;
  }

  const factory = new AdapterFactory();
  factory.initialize(eventBus);

  // Indiquer que le module est prêt
  eventBus.publish('MODULE_READY', {
    module: 'adapter-factory',
    version: '1.0.0'
  });
}

// Export de la fonction d'initialisation uniquement
module.exports = {
  initializeAdapterFactory
};

/**
 * Exemples d'utilisation:
 *
 * 1. Initialisation du module:
 *    ```javascript
 *    const { initializeAdapterFactory } = require('./adapter-factory');
 *    const eventBus = // obtenir l'instance du bus d'événements
 *    initializeAdapterFactory(eventBus);
 *    ```
 *
 * 2. Détecter la plateforme d'une URL:
 *    ```javascript
 *    // Publier un événement pour détecter la plateforme
 *    eventBus.publish('ADAPTER_FACTORY_DETECT_PLATFORM', {
 *      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
 *      requestId: 'request-123'
 *    });
 *
 *    // Écouter la réponse
 *    eventBus.subscribe('ADAPTER_FACTORY_PLATFORM_DETECTED', (data) => {
 *      if (data.requestId === 'request-123') {
 *        console.log(`Detected platform: ${data.platform}`);
 *      }
 *    });
 *    ```
 *
 * 3. Créer un adaptateur pour YouTube:
 *    ```javascript
 *    // Publier un événement pour créer un adaptateur
 *    eventBus.publish('ADAPTER_FACTORY_CREATE', {
 *      platform: 'youtube',
 *      options: { quality: 'high' },
 *      requestId: 'request-456'
 *    });
 *
 *    // Écouter la réponse
 *    eventBus.subscribe('ADAPTER_FACTORY_ADAPTER_CREATED', (data) => {
 *      if (data.requestId === 'request-456') {
 *        const adapter = data.adapter;
 *        // Utiliser l'adaptateur
 *        adapter.download('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
 *          format: 'mp3',
 *          outputPath: '/downloads'
 *        });
 *      }
 *    });
 *    ```
 */
