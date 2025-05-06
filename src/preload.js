/**
 * @file preload.js
 * @description Script de préchargement qui établit un pont sécurisé entre le processus de rendu et le processus principal
 * dans l'application 21 BYTS (téléchargeur audio multiplateforme). Ce fichier suit une architecture événementielle
 * et ne contient aucune dépendance directe sur d'autres fichiers du projet, conformément aux principes
 * de modularité et d'indépendance.
 *
 * @module preload
 * @author 21 BYTS Team
 * @version 1.0.0
 *
 * @events
 * ÉCOUTE:
 * - APP:INITIALIZED - Émis lorsque l'application est initialisée
 * - CONFIG:UPDATED - Émis lorsque la configuration est mise à jour
 * - ERROR:OCCURRED - Émis lorsqu'une erreur est survenue
 * - UI:REQUEST_PLATFORM_INFO - Demande d'information sur la plateforme
 * - DOWNLOAD:STATUS_REQUEST - Demande d'information sur l'état des téléchargements
 *
 * ÉMET:
 * - PRELOAD:INITIALIZED - Émis lorsque le préchargement est terminé
 * - PRELOAD:CONTEXT_BRIDGE_READY - Émis lorsque le pont contextuel est prêt
 * - PRELOAD:ERROR - Émis en cas d'erreur dans le préchargement
 * - IPC:RENDERER_TO_MAIN - Relais d'un message du processus de rendu vers le processus principal
 * - IPC:MAIN_TO_RENDERER - Relais d'un message du processus principal vers le processus de rendu
 * - PLATFORM:INFO_RESPONSE - Réponse avec l'information sur la plateforme
 */

// Importation des modules Electron nécessaires (pas de dépendances internes)
const { contextBridge, ipcRenderer } = require('electron');
const os = require('os');
const path = require('path');

// Objet d'état local pour éviter les requêtes redondantes
let localState = {
  platform: null,
  isInitialized: false,
  eventBusProxy: null,
  securityTokens: {}
};

/**
 * Gestionnaire d'erreurs qui publie les erreurs via le bus d'événements
 *
 * @param {Error} error - L'erreur à gérer
 * @param {string} context - Le contexte dans lequel l'erreur s'est produite
 * @private
 */
function handleError(error, context) {
  console.error(`[Preload] Erreur dans le contexte "${context}":`, error);

  // Émettre un événement d'erreur si le bus d'événements est disponible
  if (localState.eventBusProxy) {
    localState.eventBusProxy.publish('PRELOAD:ERROR', {
      message: error.message,
      stack: error.stack,
      context: context,
      timestamp: Date.now()
    });
  }

  // Relayer l'erreur au processus principal en cas de besoin
  try {
    ipcRenderer.send('error-occurred', {
      source: 'preload',
      message: error.message,
      context: context,
      timestamp: Date.now()
    });
  } catch (secondaryError) {
    console.error(
      "[Preload] Erreur secondaire lors de la transmission de l'erreur originale:",
      secondaryError
    );
  }
}

/**
 * Détecte la plateforme actuelle de manière sécurisée
 *
 * @returns {Object} Informations sur la plateforme
 * @private
 */
function detectPlatform() {
  try {
    // Mise en cache du résultat si déjà calculé
    if (localState.platform) {
      return localState.platform;
    }

    const platform = {
      type: os.platform(), // 'darwin', 'win32', ou 'linux'
      arch: os.arch(),
      release: os.release(),
      homedir: os.homedir(),
      hostname: os.hostname(),
      userInfo: os.userInfo().username, // Uniquement le nom d'utilisateur pour la sécurité
      tempDir: os.tmpdir(),
      endianness: os.endianness(),
      isWindows: os.platform() === 'win32',
      isMac: os.platform() === 'darwin',
      isLinux: os.platform() === 'linux'
    };

    // Définir le chemin par défaut pour les téléchargements selon la plateforme
    platform.defaultDownloadPath = path.join(
      platform.homedir,
      platform.isMac
        ? 'Music/21 BYTS Downloads'
        : platform.isWindows
          ? 'Music\\21 BYTS Downloads'
          : 'Music/21 BYTS Downloads'
    );

    // Stocker en cache pour les futures demandes
    localState.platform = platform;
    return platform;
  } catch (error) {
    handleError(error, 'detectPlatform');
    return {
      type: 'unknown',
      error: error.message
    };
  }
}

/**
 * Crée un proxy pour le bus d'événements
 *
 * @returns {Object} Proxy pour le bus d'événements exposé à l'interface web
 * @private
 */
function createEventBusProxy() {
  try {
    // Éviter de créer plusieurs fois le proxy
    if (localState.eventBusProxy) {
      return localState.eventBusProxy;
    }

    const eventBusProxy = {
      /**
       * S'abonne à un événement
       *
       * @param {string} eventType - Type d'événement standardisé
       * @param {Function} callback - Fonction de rappel à exécuter
       * @returns {string} ID de l'abonnement pour désabonnement ultérieur
       */
      subscribe: (eventType, callback) => {
        const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        // Enregistrer la souscription pour pouvoir relayer les événements
        ipcRenderer.on(`event-${eventType}`, (_, data) => {
          try {
            callback(data);
          } catch (error) {
            handleError(error, `eventCallback:${eventType}`);
          }
        });

        // Informer le processus principal de cet abonnement
        ipcRenderer.send('event-subscribe', {
          eventType,
          subscriptionId
        });

        return subscriptionId;
      },

      /**
       * Publie un événement
       *
       * @param {string} eventType - Type d'événement standardisé
       * @param {any} data - Données associées à l'événement
       */
      publish: (eventType, data) => {
        // Relayer l'événement au processus principal
        ipcRenderer.send('event-publish', {
          eventType,
          data,
          source: 'renderer',
          timestamp: Date.now()
        });
      },

      /**
       * Se désabonne d'un événement
       *
       * @param {string} subscriptionId - ID de l'abonnement à annuler
       */
      unsubscribe: (subscriptionId) => {
        // Informer le processus principal de ce désabonnement
        ipcRenderer.send('event-unsubscribe', {
          subscriptionId
        });
      }
    };

    // Stocker en cache pour les futures demandes
    localState.eventBusProxy = eventBusProxy;
    return eventBusProxy;
  } catch (error) {
    handleError(error, 'createEventBusProxy');

    // Retourner un proxy de secours qui ne fait rien mais évite les erreurs
    return {
      subscribe: () => 'error_subscription',
      publish: () => {},
      unsubscribe: () => {}
    };
  }
}

/**
 * Configure le pont contextuel entre le processus de rendu et le processus principal
 *
 * @private
 */
function setupContextBridge() {
  try {
    // Créer le proxy pour le bus d'événements
    const eventBusProxy = createEventBusProxy();

    // Exposer les API sécurisées au processus de rendu
    contextBridge.exposeInMainWorld('electronAPI', {
      // API du bus d'événements
      eventBus: {
        subscribe: eventBusProxy.subscribe,
        publish: eventBusProxy.publish,
        unsubscribe: eventBusProxy.unsubscribe
      },

      // API système
      system: {
        /**
         * Obtient des informations sur la plateforme
         *
         * @returns {Promise<Object>} Informations sur la plateforme
         */
        getPlatformInfo: () => {
          return Promise.resolve(detectPlatform());
        },

        /**
         * Ouvre un dossier dans l'explorateur de fichiers natif
         *
         * @param {string} folderPath - Chemin du dossier à ouvrir
         * @returns {Promise<boolean>} Succès de l'opération
         */
        openFolder: (folderPath) => {
          return new Promise((resolve) => {
            ipcRenderer.once('folder-opened-response', (_, success) => {
              resolve(success);
            });

            ipcRenderer.send('open-folder', { folderPath });
          });
        },

        /**
         * Ouvre une boîte de dialogue pour sélectionner un dossier
         *
         * @param {Object} options - Options pour la boîte de dialogue
         * @returns {Promise<string|null>} Chemin du dossier sélectionné ou null
         */
        selectFolder: (options = {}) => {
          return new Promise((resolve) => {
            ipcRenderer.once('folder-selected-response', (_, folderPath) => {
              resolve(folderPath);
            });

            ipcRenderer.send('select-folder', options);
          });
        }
      },

      // API de configuration
      config: {
        /**
         * Obtient une valeur de configuration
         *
         * @param {string} key - Clé de la configuration à obtenir
         * @param {any} defaultValue - Valeur par défaut si la clé n'existe pas
         * @returns {Promise<any>} Valeur de la configuration
         */
        get: (key, defaultValue) => {
          return new Promise((resolve) => {
            ipcRenderer.once(`config-get-response-${key}`, (_, value) => {
              resolve(value !== undefined ? value : defaultValue);
            });

            ipcRenderer.send('config-get', { key, defaultValue });
          });
        },

        /**
         * Définit une valeur de configuration
         *
         * @param {string} key - Clé de la configuration à définir
         * @param {any} value - Valeur à définir
         * @returns {Promise<boolean>} Succès de l'opération
         */
        set: (key, value) => {
          return new Promise((resolve) => {
            ipcRenderer.once(`config-set-response-${key}`, (_, success) => {
              resolve(success);
            });

            ipcRenderer.send('config-set', { key, value });
          });
        }
      },

      // API d'application
      app: {
        /**
         * Obtient la version de l'application
         *
         * @returns {Promise<string>} Version de l'application
         */
        getVersion: () => {
          return new Promise((resolve) => {
            ipcRenderer.once('app-version-response', (_, version) => {
              resolve(version);
            });

            ipcRenderer.send('get-app-version');
          });
        },

        /**
         * Vérifie si des mises à jour sont disponibles
         *
         * @returns {Promise<Object>} Informations sur les mises à jour
         */
        checkForUpdates: () => {
          return new Promise((resolve) => {
            ipcRenderer.once('check-updates-response', (_, updateInfo) => {
              resolve(updateInfo);
            });

            ipcRenderer.send('check-for-updates');
          });
        },

        /**
         * Quitte l'application
         */
        quit: () => {
          ipcRenderer.send('quit-app');
        }
      }
    });

    // Signaler que le pont contextuel est prêt
    eventBusProxy.publish('PRELOAD:CONTEXT_BRIDGE_READY', {
      timestamp: Date.now()
    });
  } catch (error) {
    handleError(error, 'setupContextBridge');

    // Tenter d'exposer des fonctionnalités minimales malgré l'erreur
    try {
      contextBridge.exposeInMainWorld('electronAPI', {
        // Version minimale de secours
        system: {
          getPlatformInfo: () => Promise.resolve({ type: 'unknown', error: error.message })
        },
        eventBus: {
          subscribe: () => 'error_subscription',
          publish: () => {},
          unsubscribe: () => {}
        }
      });
    } catch (secondaryError) {
      console.error('[Preload] Erreur fatale lors de la configuration de secours:', secondaryError);
    }
  }
}

/**
 * Initialise le script de préchargement
 *
 * @private
 */
function initialize() {
  try {
    console.log('[Preload] Initialisation du script de préchargement...');

    // Configurer les gestionnaires d'événements IPC
    setupIpcEventHandlers();

    // Configurer le pont contextuel
    setupContextBridge();

    // Marquer comme initialisé
    localState.isInitialized = true;

    // Créer et obtenir le proxy d'événements
    const eventBusProxy = createEventBusProxy();

    // Publier un événement d'initialisation
    eventBusProxy.publish('PRELOAD:INITIALIZED', {
      timestamp: Date.now(),
      platform: detectPlatform().type
    });

    console.log('[Preload] Script de préchargement initialisé avec succès.');
  } catch (error) {
    handleError(error, 'initialize');
  }
}

/**
 * Configure les gestionnaires d'événements IPC
 *
 * @private
 */
function setupIpcEventHandlers() {
  try {
    // Gestionnaire pour les demandes d'informations sur la plateforme
    ipcRenderer.on('request-platform-info', (event) => {
      try {
        const platformInfo = detectPlatform();
        event.sender.send('platform-info-response', platformInfo);

        // Publier également via le bus d'événements
        if (localState.eventBusProxy) {
          localState.eventBusProxy.publish('PLATFORM:INFO_RESPONSE', platformInfo);
        }
      } catch (error) {
        handleError(error, 'request-platform-info handler');
      }
    });

    // Gestionnaire pour les messages du processus principal au processus de rendu
    ipcRenderer.on('main-to-renderer', (_, data) => {
      try {
        if (localState.eventBusProxy) {
          localState.eventBusProxy.publish('IPC:MAIN_TO_RENDERER', data);

          // Si le message contient un type d'événement spécifique, le publier également
          if (data && data.eventType) {
            localState.eventBusProxy.publish(data.eventType, data.payload || {});
          }
        }
      } catch (error) {
        handleError(error, 'main-to-renderer handler');
      }
    });

    // Gestionnaire pour les mises à jour de configuration
    ipcRenderer.on('config-updated', (_, data) => {
      try {
        if (localState.eventBusProxy) {
          localState.eventBusProxy.publish('CONFIG:UPDATED', data);
        }
      } catch (error) {
        handleError(error, 'config-updated handler');
      }
    });
  } catch (error) {
    handleError(error, 'setupIpcEventHandlers');
  }
}

// Initialiser le script de préchargement
initialize();

/**
 * Exemple d'utilisation:
 *
 * Dans le processus de rendu (interface utilisateur):
 *
 * // S'abonner à un événement
 * const subscriptionId = window.electronAPI.eventBus.subscribe('DOWNLOAD:STATUS_UPDATED', (data) => {
 *   console.log('État du téléchargement mis à jour:', data);
 *   // Mettre à jour l'interface utilisateur
 * });
 *
 * // Publier un événement
 * window.electronAPI.eventBus.publish('UI:REQUEST_DOWNLOAD', {
 *   url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
 *   format: 'mp3',
 *   quality: '320k'
 * });
 *
 * // Obtenir des informations sur la plateforme
 * window.electronAPI.system.getPlatformInfo().then((platformInfo) => {
 *   console.log('Plateforme:', platformInfo);
 * });
 *
 * // Se désabonner d'un événement
 * window.electronAPI.eventBus.unsubscribe(subscriptionId);
 */ // Script de préchargement
// Créé automatiquement le 2025-05-02
