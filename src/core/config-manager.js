/**
 * @fileoverview Gestionnaire de configuration pour l'application 21 BYTS
 *
 * Ce module est responsable de charger, sauvegarder et gérer les configurations
 * de l'application. Il fonctionne de manière autonome et communique exclusivement
 * via le bus d'événements central.
 *
 * Événements écoutés:
 * - CONFIG_GET: Demande d'obtention d'une configuration
 * - CONFIG_SET: Demande de modification d'une configuration
 * - CONFIG_RESET: Demande de réinitialisation des configurations
 * - CONFIG_EXPORT: Demande d'exportation des configurations
 * - CONFIG_IMPORT: Demande d'importation des configurations
 * - APP_INIT: Initialisation de l'application
 *
 * Événements émis:
 * - CONFIG_UPDATED: Émis lorsqu'une configuration est mise à jour
 * - CONFIG_LOADED: Émis lorsque les configurations sont chargées
 * - CONFIG_ERROR: Émis en cas d'erreur dans le gestionnaire de configuration
 * - CONFIG_EXPORTED: Émis lorsque les configurations sont exportées
 * - CONFIG_IMPORTED: Émis lorsque les configurations sont importées
 *
 * @example
 * // Pour obtenir une configuration:
 * eventBus.publish('CONFIG_GET', {
 *   key: 'downloadPath',
 *   requestId: 'unique-request-id'
 * });
 *
 * // Pour définir une configuration:
 * eventBus.publish('CONFIG_SET', {
 *   key: 'downloadPath',
 *   value: '/chemin/vers/dossier'
 * });
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const electron = require('electron');
const os = require('os');

/**
 * Initialise le gestionnaire de configuration
 * @param {Object} eventBus - Le bus d'événements central
 */
function initialize(eventBus) {
  if (!eventBus) {
    console.error("ConfigManager: EventBus est requis pour l'initialisation");
    return;
  }

  let userDataPath;
  try {
    // Obtenir le chemin des données utilisateur en fonction de la plateforme
    userDataPath = (electron.app || electron.remote.app).getPath('userData');
  } catch (error) {
    // Fallback en cas d'erreur
    userDataPath = path.join(os.homedir(), '.21byts');

    // Émettre une erreur via le bus d'événements
    eventBus.publish('CONFIG_ERROR', {
      code: 'CONFIG_PATH_FALLBACK',
      message:
        "Impossible d'obtenir le chemin de données utilisateur standard, utilisation du chemin de secours",
      details: error.message
    });
  }

  const configFilePath = path.join(userDataPath, 'config.json');
  let configCache = null;

  // Valeurs par défaut de la configuration
  const defaultConfig = {
    // Chemins et emplacements
    downloadPath: path.join(os.homedir(), 'Music', '21BYTS'),
    tempPath: path.join(os.tmpdir(), '21BYTS'),

    // Options de téléchargement
    maxConcurrentDownloads: 3,
    defaultAudioFormat: 'mp3',
    availableFormats: ['mp3', 'flac', 'wav', 'aiff'],
    audioQuality: {
      mp3: '320k',
      flac: 'best',
      wav: '44100:s16',
      aiff: '44100:s16'
    },

    // Options d'interface
    theme: 'dark',
    language: 'auto',
    notificationsEnabled: true,
    minimizeToTray: true,

    // Options de sécurité
    encryptionKey: '', // Sera généré lors de la première exécution

    // Options avancées
    ytdlpPath: '',
    ffmpegPath: '',

    // Identifiants des services (chiffrés avant stockage)
    credentials: {
      tidal: {
        token: '',
        refreshToken: '',
        expiresAt: 0
      }
    },

    // Historique
    maxHistoryItems: 100,

    // Intégration système
    addToLibraryAfterDownload: false,

    // Détail des plateformes supportées
    platforms: {
      youtube: { enabled: true, color: '#ee0000' },
      bandcamp: { enabled: true, color: '#1DA0C3' },
      soundcloud: { enabled: true, color: '#FF7700' },
      spotify: { enabled: true, color: '#1DB954' },
      tidal: { enabled: true, color: '#000000' }
    },

    // Version de la configuration (pour migrations futures)
    configVersion: 1
  };

  /**
   * Charge la configuration depuis le fichier
   * @returns {Object} La configuration chargée
   */
  function loadConfig() {
    try {
      // Vérifier si le fichier de configuration existe
      if (!fs.existsSync(configFilePath)) {
        // Si le fichier n'existe pas, créer le dossier parent si nécessaire
        if (!fs.existsSync(path.dirname(configFilePath))) {
          fs.mkdirSync(path.dirname(configFilePath), { recursive: true });
        }

        // Générer une clé de chiffrement unique lors de la première exécution
        const newConfig = { ...defaultConfig };
        newConfig.encryptionKey = crypto.randomBytes(32).toString('hex');

        // Sauvegarder la nouvelle configuration
        fs.writeFileSync(configFilePath, JSON.stringify(newConfig, null, 2));
        configCache = newConfig;

        eventBus.publish('CONFIG_LOADED', {
          isFirstRun: true,
          configVersion: newConfig.configVersion
        });

        return newConfig;
      }

      // Charger la configuration existante
      const fileData = fs.readFileSync(configFilePath, 'utf8');
      const loadedConfig = JSON.parse(fileData);

      // Fusionner avec les valeurs par défaut pour s'assurer que toutes les clés existent
      const mergedConfig = { ...defaultConfig, ...loadedConfig };

      // Vérifier si une migration est nécessaire
      if (mergedConfig.configVersion < defaultConfig.configVersion) {
        migrateConfig(mergedConfig);
      }

      configCache = mergedConfig;

      eventBus.publish('CONFIG_LOADED', {
        isFirstRun: false,
        configVersion: mergedConfig.configVersion
      });

      return mergedConfig;
    } catch (error) {
      // En cas d'erreur, utiliser les valeurs par défaut
      eventBus.publish('CONFIG_ERROR', {
        code: 'CONFIG_LOAD_ERROR',
        message: 'Erreur lors du chargement de la configuration',
        details: error.message
      });

      return { ...defaultConfig };
    }
  }

  /**
   * Sauvegarde la configuration dans le fichier
   * @param {Object} config - La configuration à sauvegarder
   */
  function saveConfig(config) {
    try {
      // S'assurer que le dossier existe
      if (!fs.existsSync(path.dirname(configFilePath))) {
        fs.mkdirSync(path.dirname(configFilePath), { recursive: true });
      }

      // Sauvegarder la configuration
      fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
      configCache = config;

      return true;
    } catch (error) {
      eventBus.publish('CONFIG_ERROR', {
        code: 'CONFIG_SAVE_ERROR',
        message: 'Erreur lors de la sauvegarde de la configuration',
        details: error.message
      });

      return false;
    }
  }

  /**
   * Migre une configuration d'une version à une autre
   * @param {Object} config - La configuration à migrer
   */
  function migrateConfig(config) {
    // Version 1 est la version initiale, pas besoin de migration
    // Pour les versions futures, implémenter la logique de migration ici

    // Mettre à jour la version de la configuration
    config.configVersion = defaultConfig.configVersion;

    // Sauvegarder la configuration migrée
    saveConfig(config);

    eventBus.publish('CONFIG_UPDATED', {
      key: 'configVersion',
      value: config.configVersion,
      reason: 'migration'
    });
  }

  /**
   * Obtient une valeur de configuration
   * @param {string} key - La clé de configuration à obtenir
   * @param {string} [requestId] - ID de la requête (pour répondre directement)
   * @returns {*} La valeur de la configuration
   */
  function getConfig(key, requestId) {
    try {
      // S'assurer que la configuration est chargée
      if (!configCache) {
        configCache = loadConfig();
      }

      let value;

      // Si aucune clé n'est fournie, retourner toute la configuration
      if (!key) {
        value = { ...configCache }; // Copie pour éviter les modifications directes
      }
      // Gérer les clés imbriquées (ex: "credentials.tidal.token")
      else if (key.includes('.')) {
        const keys = key.split('.');
        value = { ...configCache }; // Commencer avec une copie

        for (const k of keys) {
          if (value === undefined || value === null || typeof value !== 'object') {
            value = undefined;
            break;
          }
          value = value[k];
        }
      }
      // Pour les clés simples
      else {
        value = configCache[key];
      }

      // Répondre à la requête si un ID est fourni
      if (requestId) {
        eventBus.publish('CONFIG_GET_RESPONSE', {
          requestId,
          key,
          value,
          timestamp: Date.now()
        });
      }

      return value;
    } catch (error) {
      console.error(
        `[ConfigManager] Erreur lors de l'obtention de la configuration pour la clé "${key}":`,
        error
      );

      if (requestId) {
        eventBus.publish('CONFIG_ERROR', {
          code: 'CONFIG_GET_ERROR',
          message: `Erreur lors de l'obtention de la configuration pour la clé "${key}"`,
          details: error.message,
          requestId
        });
      }

      return undefined;
    }
  }

  /**
   * Définit une valeur de configuration
   * @param {string} key - La clé de configuration à définir
   * @param {*} value - La nouvelle valeur
   * @returns {boolean} Succès de l'opération
   */
  function setConfig(key, value) {
    try {
      // S'assurer que la configuration est chargée
      if (!configCache) {
        configCache = loadConfig();
      }

      // Vérifier les paramètres
      if (key === undefined || key === null) {
        console.error('[ConfigManager] Tentative de définir une configuration sans clé');
        return false;
      }

      // Créer une copie de travail pour éviter de modifier l'original en cas d'erreur
      const workingConfig = JSON.parse(JSON.stringify(configCache));

      // Gérer les clés imbriquées
      if (key.includes('.')) {
        const keys = key.split('.');
        const lastKey = keys.pop();
        let target = workingConfig;

        for (const k of keys) {
          if (target[k] === undefined) {
            target[k] = {};
          }
          if (typeof target[k] !== 'object' || target[k] === null) {
            target[k] = {};
          }
          target = target[k];
        }

        // Ne pas sauvegarder si la valeur est identique
        try {
          if (JSON.stringify(target[lastKey]) === JSON.stringify(value)) {
            return true;
          }
        } catch (error) {
          // Continuer même si la comparaison échoue
          console.warn(
            `[ConfigManager] Impossible de comparer les valeurs pour "${key}": ${error.message}`
          );
        }

        target[lastKey] = value;
      } else {
        // Ne pas sauvegarder si la valeur est identique
        try {
          if (JSON.stringify(workingConfig[key]) === JSON.stringify(value)) {
            return true;
          }
        } catch (error) {
          // Continuer même si la comparaison échoue
          console.warn(
            `[ConfigManager] Impossible de comparer les valeurs pour "${key}": ${error.message}`
          );
        }

        // Pour les clés simples
        workingConfig[key] = value;
      }

      // Sauvegarder la configuration
      const success = saveConfig(workingConfig);

      if (success) {
        // Mettre à jour le cache seulement si la sauvegarde a réussi
        configCache = workingConfig;

        eventBus.publish('CONFIG_UPDATED', {
          key,
          value,
          timestamp: Date.now()
        });
      }

      return success;
    } catch (error) {
      console.error(
        `[ConfigManager] Erreur lors de la définition de la configuration pour la clé "${key}":`,
        error
      );

      eventBus.publish('CONFIG_ERROR', {
        code: 'CONFIG_SET_ERROR',
        message: `Erreur lors de la définition de la configuration pour la clé "${key}"`,
        details: error.message
      });

      return false;
    }
  }

  /**
   * Réinitialise la configuration aux valeurs par défaut
   * @param {string} [specificKey] - Clé spécifique à réinitialiser (optionnel)
   * @returns {boolean} Succès de l'opération
   */
  function resetConfig(specificKey) {
    if (specificKey) {
      // Réinitialiser une clé spécifique
      if (specificKey.includes('.')) {
        // Cas des clés imbriquées
        const keys = specificKey.split('.');
        const lastKey = keys.pop();

        // Trouver la valeur par défaut correspondante
        let defaultValue = defaultConfig;
        for (const k of keys) {
          if (defaultValue[k] === undefined) {
            return false; // La clé n'existe pas dans les valeurs par défaut
          }
          defaultValue = defaultValue[k];
        }

        return setConfig(specificKey, defaultValue[lastKey]);
      } else {
        // Cas des clés simples
        return setConfig(specificKey, defaultConfig[specificKey]);
      }
    } else {
      // Réinitialiser toute la configuration
      // Garder la clé de chiffrement pour ne pas perdre les données chiffrées
      const encryptionKey = configCache
        ? configCache.encryptionKey
        : crypto.randomBytes(32).toString('hex');
      const newConfig = { ...defaultConfig, encryptionKey };

      const success = saveConfig(newConfig);

      if (success) {
        eventBus.publish('CONFIG_UPDATED', {
          key: null,
          value: null,
          reason: 'reset'
        });
      }

      return success;
    }
  }

  /**
   * Exporte la configuration vers un fichier ou retourne l'objet
   * @param {string|null} exportPath - Chemin du fichier d'exportation ou null pour retourner l'objet
   * @param {boolean} includeCredentials - Inclure ou non les identifiants
   * @returns {boolean|Object} Succès de l'opération ou objet de configuration
   */
  function exportConfig(exportPath, includeCredentials = false) {
    try {
      // S'assurer que la configuration est chargée
      if (!configCache) {
        configCache = loadConfig();
      }

      // Créer une copie de la configuration pour l'exportation
      const exportConfig = { ...configCache };

      // Supprimer les données sensibles si nécessaire
      if (!includeCredentials) {
        delete exportConfig.credentials;
        delete exportConfig.encryptionKey;
      }

      // Si aucun chemin n'est fourni, retourner l'objet (pour les tests)
      if (!exportPath) {
        return exportConfig;
      }

      // Exporter la configuration
      fs.writeFileSync(exportPath, JSON.stringify(exportConfig, null, 2));

      eventBus.publish('CONFIG_EXPORTED', {
        path: exportPath,
        includesCredentials: includeCredentials
      });

      return true;
    } catch (error) {
      eventBus.publish('CONFIG_ERROR', {
        code: 'CONFIG_EXPORT_ERROR',
        message: "Erreur lors de l'exportation de la configuration",
        details: error.message
      });

      return false;
    }
  }

  /**
   * Importe la configuration depuis un fichier ou un objet
   * @param {string|Object} importPath - Chemin du fichier d'importation ou objet de configuration
   * @param {boolean} mergeWithCurrent - Fusionner avec la configuration actuelle
   * @returns {boolean} Succès de l'opération
   */
  function importConfig(importPath, mergeWithCurrent = true) {
    try {
      let importedConfig;

      // Déterminer si l'entrée est un chemin de fichier ou un objet de configuration
      if (typeof importPath === 'string') {
        // C'est un chemin de fichier
        const importData = fs.readFileSync(importPath, 'utf8');
        importedConfig = JSON.parse(importData);
      } else if (typeof importPath === 'object' && importPath !== null) {
        // C'est un objet de configuration directement fourni (pour les tests)
        importedConfig = importPath;
      } else {
        throw new Error("Format d'importation invalide");
      }

      // S'assurer que la configuration est chargée
      if (!configCache) {
        configCache = loadConfig();
      }

      let newConfig;

      if (mergeWithCurrent) {
        // Fusionner avec la configuration actuelle
        // Conserver les données sensibles de la configuration actuelle
        const currentCredentials = configCache.credentials;
        const currentEncryptionKey = configCache.encryptionKey;

        newConfig = { ...configCache, ...importedConfig };

        // Restaurer les données sensibles
        newConfig.credentials = currentCredentials;
        newConfig.encryptionKey = currentEncryptionKey;
      } else {
        // Remplacer complètement la configuration
        // Mais conserver la clé de chiffrement pour ne pas perdre les données chiffrées
        const currentEncryptionKey = configCache.encryptionKey;

        newConfig = { ...importedConfig };
        newConfig.encryptionKey = currentEncryptionKey;
      }

      // Sauvegarder la nouvelle configuration
      const success = saveConfig(newConfig);

      if (success && typeof importPath === 'string') {
        eventBus.publish('CONFIG_IMPORTED', {
          path: importPath,
          mergedWithCurrent: mergeWithCurrent
        });
      }

      return success;
    } catch (error) {
      eventBus.publish('CONFIG_ERROR', {
        code: 'CONFIG_IMPORT_ERROR',
        message: "Erreur lors de l'importation de la configuration",
        details: error.message
      });

      return false;
    }
  }

  /**
   * Vérifie et crée les dossiers nécessaires
   */
  function ensureDirectories() {
    const config = getConfig();

    // Créer le dossier de téléchargement s'il n'existe pas
    if (config.downloadPath && !fs.existsSync(config.downloadPath)) {
      try {
        fs.mkdirSync(config.downloadPath, { recursive: true });
      } catch (error) {
        eventBus.publish('CONFIG_ERROR', {
          code: 'DIRECTORY_CREATE_ERROR',
          message: 'Impossible de créer le dossier de téléchargement',
          details: error.message,
          path: config.downloadPath
        });
      }
    }

    // Créer le dossier temporaire s'il n'existe pas
    if (config.tempPath && !fs.existsSync(config.tempPath)) {
      try {
        fs.mkdirSync(config.tempPath, { recursive: true });
      } catch (error) {
        eventBus.publish('CONFIG_ERROR', {
          code: 'DIRECTORY_CREATE_ERROR',
          message: 'Impossible de créer le dossier temporaire',
          details: error.message,
          path: config.tempPath
        });
      }
    }
  }

  // =========================================================================
  // Configuration des écouteurs d'événements
  // =========================================================================

  // Écouter l'événement d'initialisation de l'application
  eventBus.subscribe('APP_INIT', () => {
    // Charger la configuration
    loadConfig();

    // Vérifier et créer les dossiers nécessaires
    ensureDirectories();
  });

  // Écouter les demandes de configuration
  eventBus.subscribe('CONFIG_GET', (data) => {
    const { key, requestId } = data;
    getConfig(key, requestId);
  });

  // Écouter les demandes de modification de configuration
  eventBus.subscribe('CONFIG_SET', (data) => {
    const { key, value } = data;
    setConfig(key, value);
  });

  // Écouter les demandes de réinitialisation de configuration
  eventBus.subscribe('CONFIG_RESET', (data) => {
    const { key } = data;
    resetConfig(key);
  });

  // Écouter les demandes d'exportation de configuration
  eventBus.subscribe('CONFIG_EXPORT', (data) => {
    const { path, includeCredentials } = data;
    exportConfig(path, includeCredentials);
  });

  // Écouter les demandes d'importation de configuration
  eventBus.subscribe('CONFIG_IMPORT', (data) => {
    const { path, mergeWithCurrent } = data;
    importConfig(path, mergeWithCurrent);
  });

  // Charger la configuration initiale
  configCache = loadConfig();

  // Exposer les méthodes publiques pour les tests unitaires
  // (ces méthodes ne sont utilisées que dans les tests, pas par d'autres modules)
  return {
    getConfig,
    setConfig,
    resetConfig,
    exportConfig,
    importConfig,
    ensureDirectories
  };
}

// Créer une instance du gestionnaire de configuration
const configManagerInstance = initialize;

// Exporter un objet avec toutes les méthodes nécessaires pour les tests
module.exports = {
  initialize: (eventBus) => {
    const instance = configManagerInstance(eventBus);
    // Exposer les méthodes pour les tests
    module.exports.get = instance.getConfig;
    module.exports.set = instance.setConfig;
    module.exports.reset = instance.resetConfig;
    module.exports.export = instance.exportConfig;
    module.exports.import = instance.importConfig;
    return instance;
  },
  get: null,  // Sera remplacé lors de l'initialisation
  set: null,  // Sera remplacé lors de l'initialisation
  reset: null, // Sera remplacé lors de l'initialisation
  export: null, // Sera remplacé lors de l'initialisation
  import: null  // Sera remplacé lors de l'initialisation
};
