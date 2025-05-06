# MODULES.md

## Vue d'ensemble

Ce document détaille tous les modules qui composent l'application 21 BYTS, leur rôle, leurs responsabilités, et leurs interactions. L'architecture modulaire et basée sur les événements permet une séparation claire des préoccupations et facilite la maintenance et l'extension du système.

Chaque module est conçu pour fonctionner de manière autonome, communiquant exclusivement via le bus d'événements central. Cette approche garantit un couplage faible et une haute cohésion, facilitant les tests et permettant le remplacement de n'importe quel module par une implémentation alternative tant que l'interface événementielle est respectée.

## Structure des modules

Les modules sont organisés en plusieurs couches et catégories:

1. **Modules fondamentaux (Core)**: Fournissent l'infrastructure de base et les services partagés
2. **Modules fonctionnels**: Implémentent les fonctionnalités spécifiques de l'application
3. **Utilitaires**: Offrent des fonctionnalités d'assistance réutilisables
4. **Constantes**: Définissent les valeurs et types partagés dans toute l'application

## Modules fondamentaux (Core)

### Bus d'événements (`/src/core/event-bus.js`)

**Rôle**: Colonne vertébrale de l'application, permettant la communication entre tous les modules.

**Responsabilités**:

- Fournir un mécanisme d'abonnement/publication (pub/sub)
- Acheminer les événements entre les modules
- Journaliser les événements pour le débogage
- Supporter les événements synchrones et asynchrones

**Événements écoutés**: N/A (module fondamental)

**Événements émis**:

- `EVENT_BUS_READY`
- `EVENT_PUBLISHED`
- `EVENT_DELIVERY_ERROR`

**Exemple d'utilisation**:

```javascript
/**
 * @fileoverview Bus d'événements central avec capacités de traçage et de débogage
 * @module core/event-bus
 */

// Événements de conversion
module.exports.CONVERSION_STARTED = 'CONVERSION_STARTED';
module.exports.CONVERSION_PROGRESS = 'CONVERSION_PROGRESS';
module.exports.CONVERSION_COMPLETED = 'CONVERSION_COMPLETED';
module.exports.CONVERSION_FAILED = 'CONVERSION_FAILED';

// Événements de configuration
module.exports.CONFIG_REQUESTED = 'CONFIG_REQUESTED';
module.exports.CONFIG_PROVIDED = 'CONFIG_PROVIDED';
module.exports.CONFIG_UPDATED = 'CONFIG_UPDATED';

// Événements de fichiers
module.exports.FILE_ADDED_TO_LIBRARY = 'FILE_ADDED_TO_LIBRARY';

// Événements de playlist
module.exports.PLAYLIST_DETECTED = 'PLAYLIST_DETECTED';
module.exports.PLAYLIST_ITEMS_EXTRACTED = 'PLAYLIST_ITEMS_EXTRACTED';

// Événements de plateforme
module.exports.PLATFORM_DETECTED = 'PLATFORM_DETECTED';

// Événements d'erreur
module.exports.ERROR = 'ERROR';
module.exports.ERROR_RESOLVED = 'ERROR_RESOLVED';
module.exports.ERROR_NOTIFICATION = 'ERROR_NOTIFICATION';

// Événements de composants
module.exports.COMPONENT_REGISTERED = 'COMPONENT_REGISTERED';
module.exports.COMPONENT_UNREGISTERED = 'COMPONENT_UNREGISTERED';
```

### Codes d'erreur (`/src/constants/error-codes.js`)

**Rôle**: Définir des codes d'erreur standardisés.

**Contenu**:

```javascript
/**
 * @fileoverview Constantes pour les codes d'erreur standardisés
 * @module constants/error-codes
 */

// Erreurs générales d'application
module.exports.APP_INIT_ERROR = 'APP_INIT_ERROR';
module.exports.INTERNAL_ERROR = 'INTERNAL_ERROR';
module.exports.NOT_IMPLEMENTED = 'NOT_IMPLEMENTED';

// Erreurs de module
module.exports.MODULE_ALREADY_REGISTERED = 'MODULE_ALREADY_REGISTERED';
module.exports.MODULE_NOT_FOUND = 'MODULE_NOT_FOUND';
module.exports.MODULE_INSTANTIATION_ERROR = 'MODULE_INSTANTIATION_ERROR';
module.exports.MODULE_DISPOSAL_ERROR = 'MODULE_DISPOSAL_ERROR';
module.exports.CIRCULAR_DEPENDENCY = 'CIRCULAR_DEPENDENCY';

// Erreurs de bus d'événements
module.exports.INVALID_EVENT_FORMAT = 'INVALID_EVENT_FORMAT';
module.exports.EVENT_DELIVERY_ERROR = 'EVENT_DELIVERY_ERROR';

// Erreurs de téléchargement
module.exports.DOWNLOAD_ERROR = 'DOWNLOAD_ERROR';
module.exports.URL_INVALID = 'URL_INVALID';
module.exports.NETWORK_ERROR = 'NETWORK_ERROR';
module.exports.PLATFORM_NOT_SUPPORTED = 'PLATFORM_NOT_SUPPORTED';
module.exports.DOWNLOAD_CANCELLED = 'DOWNLOAD_CANCELLED';
module.exports.DOWNLOAD_TIMED_OUT = 'DOWNLOAD_TIMED_OUT';
module.exports.FILE_NOT_FOUND = 'FILE_NOT_FOUND';
module.exports.FILE_ALREADY_EXISTS = 'FILE_ALREADY_EXISTS';
module.exports.CONCURRENT_DOWNLOADS_LIMIT = 'CONCURRENT_DOWNLOADS_LIMIT';

// Erreurs d'adaptateur
module.exports.YOUTUBE_ERROR = 'YOUTUBE_ERROR';
module.exports.SPOTIFY_ERROR = 'SPOTIFY_ERROR';
module.exports.SOUNDCLOUD_ERROR = 'SOUNDCLOUD_ERROR';
module.exports.BANDCAMP_ERROR = 'BANDCAMP_ERROR';
module.exports.TIDAL_ERROR = 'TIDAL_ERROR';

// Erreurs d'authentification
module.exports.AUTH_ERROR = 'AUTH_ERROR';
module.exports.AUTH_CANCELLED = 'AUTH_CANCELLED';
module.exports.INVALID_CREDENTIALS = 'INVALID_CREDENTIALS';
module.exports.TOKEN_EXPIRED = 'TOKEN_EXPIRED';
module.exports.REFRESH_TOKEN_FAILED = 'REFRESH_TOKEN_FAILED';
module.exports.INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS';

// Erreurs de métadonnées
module.exports.METADATA_ERROR = 'METADATA_ERROR';
module.exports.TAG_WRITING_ERROR = 'TAG_WRITING_ERROR';
module.exports.ALBUM_ART_ERROR = 'ALBUM_ART_ERROR';

// Erreurs de conversion
module.exports.CONVERSION_ERROR = 'CONVERSION_ERROR';
module.exports.UNSUPPORTED_FORMAT = 'UNSUPPORTED_FORMAT';
module.exports.FFMPEG_ERROR = 'FFMPEG_ERROR';

// Erreurs de fichier
module.exports.FILE_OPERATION_ERROR = 'FILE_OPERATION_ERROR';
module.exports.PERMISSION_DENIED = 'PERMISSION_DENIED';
module.exports.DISK_FULL = 'DISK_FULL';
module.exports.PATH_NOT_FOUND = 'PATH_NOT_FOUND';

// Erreurs de configuration
module.exports.CONFIG_ERROR = 'CONFIG_ERROR';
module.exports.INVALID_CONFIG = 'INVALID_CONFIG';
module.exports.CONFIG_SAVE_ERROR = 'CONFIG_SAVE_ERROR';
```

### Valeurs par défaut de configuration (`/src/constants/config-defaults.js`)

**Rôle**: Définir les valeurs par défaut pour la configuration.

**Contenu**:

```javascript
/**
 * @fileoverview Valeurs par défaut pour la configuration
 * @module constants/config-defaults
 */

// Configuration générale de l'application
module.exports.APP_CONFIG = {
  // Version de l'application
  appVersion: '1.0.0',
  // Intervalle de vérification des mises à jour (en millisecondes)
  updateCheckInterval: 86400000, // 24 heures
  // Activer les rapports d'erreur anonymes
  enableErrorReporting: true,
  // Mode debug
  debugMode: false
};

// Configuration de l'interface utilisateur
module.exports.UI_CONFIG = {
  // Thème (light, dark, system)
  theme: 'system',
  // Langue (fr, en, etc.)
  language: 'fr',
  // Taille de la police
  fontSize: 'medium',
  // Animations activées
  enableAnimations: true
};

// Configuration des téléchargements
module.exports.DOWNLOAD_CONFIG = {
  // Dossier de destination par défaut
  downloadPath: null, // Sera défini au premier démarrage
  // Format audio par défaut
  defaultFormat: 'mp3',
  // Qualité audio par défaut
  defaultQuality: 'high',
  // Nombre maximum de téléchargements simultanés
  maxConcurrentDownloads: 3,
  // Limite de taille des playlists (nombre maximum de titres)
  playlistSizeLimit: 200,
  // Action après téléchargement (none, addToLibrary, openFolder)
  postDownloadAction: 'none',
  // Tentatives de téléchargement maximum
  maxRetryAttempts: 3,
  // Délai entre les tentatives (en millisecondes)
  retryDelay: 5000
};

// Configuration du format MP3
module.exports.MP3_CONFIG = {
  // Débit binaire (en kbps)
  bitrate: 320,
  // Type de débit (cbr, vbr)
  bitrateType: 'cbr',
  // Qualité VBR (0-9, 0 étant la meilleure)
  vbrQuality: 0
};

// Configuration du format FLAC
module.exports.FLAC_CONFIG = {
  // Niveau de compression (0-8, 8 étant le plus compressé)
  compressionLevel: 5
};

// Configuration du format WAV
module.exports.WAV_CONFIG = {
  // Profondeur de bits
  bitDepth: 16,
  // Taux d'échantillonnage (en Hz)
  sampleRate: 44100
};

// Configuration du format AIFF
module.exports.AIFF_CONFIG = {
  // Profondeur de bits
  bitDepth: 16,
  // Taux d'échantillonnage (en Hz)
  sampleRate: 44100
};

// Configuration des métadonnées
module.exports.METADATA_CONFIG = {
  // Extraire automatiquement les métadonnées
  autoExtractMetadata: true,
  // Incorporer les pochettes d'album
  embedAlbumArt: true,
  // Taille maximale des pochettes (en octets)
  maxAlbumArtSize: 1024 * 1024, // 1 Mo
  // Normaliser les noms de fichiers
  normalizeFilenames: true,
  // Modèle de nom de fichier
  filenameTemplate: '{artist} - {title}'
};

// Configuration des adaptateurs
module.exports.ADAPTERS_CONFIG = {
  // YouTube
  youtube: {
    preferHighQuality: true,
    extractClosedCaptions: false
  },
  // Spotify
  spotify: {
    preferOriginal: true,
    region: 'FR'
  },
  // SoundCloud
  soundcloud: {
    includeArtwork: true
  },
  // Bandcamp
  bandcamp: {
    preferLossless: true
  },
  // Tidal
  tidal: {
    quality: 'HiFi',
    useHiRes: false
  }
};

// Configuration de l'authentification
module.exports.AUTH_CONFIG = {
  // Sauvegarder les informations d'authentification
  saveAuth: true,
  // Durée de vie des tokens en cache (en millisecondes)
  tokenCacheDuration: 2592000000, // 30 jours
  // Clé de chiffrement (générée au premier démarrage)
  encryptionKey: null
};
```

## Points d'entrée

### Point d'entrée principal (`/src/main.js`)

**Rôle**: Point d'entrée de l'application Electron.

**Responsabilités**:

- Initialiser l'application
- Créer la fenêtre principale
- Démarrer les modules fondamentaux
- Gérer le cycle de vie de l'application

**Événements écoutés**:

- Événements du système Electron
- `APP_SHUTDOWN_READY`

**Événements émis**:

- `APP_INITIALIZED`
- `APP_SHUTDOWN_REQUESTED`

**Exemple d'utilisation**:

```javascript
/**
 * @fileoverview Point d'entrée principal de l'application Electron
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const url = require('url');

// Initialiser les modules fondamentaux
const eventBus = require('./core/event-bus').initialize({
  debug: process.env.DEBUG_EVENTS === 'true'
});
const appContainer = require('./core/app-container').initialize(eventBus);
const configManager = require('./core/config-manager').initialize(eventBus);
const errorHandler = require('./core/error-handler').initialize(eventBus);
const eventLogger = require('./core/event-logger').initialize(eventBus);
const stateManager = require('./core/state-manager').initialize(eventBus);

// Fenêtre principale
let mainWindow;

// Modules attendus pour la fermeture
const shutdownModules = new Set(['download-manager', 'auth-manager']);
const readyModules = new Set();

// Créer la fenêtre principale
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 600,
    minHeight: 400,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false,
    backgroundColor: '#1a1f35'
  });

  // Charger l'interface
  mainWindow.loadURL(
    url.format({
      pathname: path.join(__dirname, 'index.html'),
      protocol: 'file:',
      slashes: true
    })
  );

  // Afficher la fenêtre une fois chargée
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Gérer la fermeture de la fenêtre
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Publier l'événement d'initialisation
  eventBus.publish({
    type: 'APP_INITIALIZED',
    meta: {
      timestamp: Date.now(),
      source: 'main'
    }
  });

  // Écouter les événements de fermeture
  eventBus.subscribe('APP_SHUTDOWN_READY', handleShutdownReady);
}

// Créer la fenêtre au démarrage de l'application
app.on('ready', createWindow);

// Quitter l'application quand toutes les fenêtres sont fermées
app.on('window-all-closed', () => {
  // Sur macOS, il est courant que l'application reste active
  // jusqu'à ce que l'utilisateur quitte explicitement
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Sur macOS, recréer la fenêtre quand l'icône du dock est cliquée
app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Demande de fermeture
app.on('before-quit', (event) => {
  // Si des modules attendent encore la fermeture
  if (readyModules.size < shutdownModules.size) {
    event.preventDefault();

    // Publier l'événement de demande de fermeture
    eventBus.publish({
      type: 'APP_SHUTDOWN_REQUESTED',
      meta: {
        timestamp: Date.now(),
        source: 'main'
      }
    });

    // Définir un délai maximum pour la fermeture
    setTimeout(() => {
      app.exit(0);
    }, 5000); // 5 secondes maximum
  }
});

// Gérer les événements de fermeture des modules
function handleShutdownReady(event) {
  const { moduleId } = event.payload;

  if (shutdownModules.has(moduleId)) {
    readyModules.add(moduleId);

    // Si tous les modules sont prêts, quitter l'application
    if (readyModules.size >= shutdownModules.size) {
      app.quit();
    }
  }
}

// Gestion des erreurs non capturées
process.on('uncaughtException', (error) => {
  eventBus.publish({
    type: 'ERROR',
    payload: {
      code: 'INTERNAL_ERROR',
      message: 'Uncaught exception in main process',
      error: {
        message: error.message,
        stack: error.stack
      }
    },
    meta: {
      timestamp: Date.now(),
      source: 'main',
      severity: 'critical'
    }
  });

  // Journaliser l'erreur
  console.error('Uncaught exception:', error);
});
```

### Script de préchargement (`/src/preload.js`)

**Rôle**: Script de préchargement Electron.

**Responsabilités**:

- Exposer une API sécurisée au processus de rendu
- Établir la communication entre le processus principal et le processus de rendu

**Événements écoutés**: N/A (script de démarrage)

**Événements émis**: N/A (script de démarrage)

## Principes de développement

### Isolation des modules

Chaque module dans 21 BYTS est conçu pour être complètement isolé et autonome:

1. **Aucune importation statique** des autres modules internes du projet
2. **Communication exclusivement via événements**
3. **Aucune référence directe** aux instances d'autres modules
4. **Cycle de vie indépendant**

Cette isolation stricte offre plusieurs avantages:

- Facilité de test unitaire
- Remplacement aisé de n'importe quel module
- Meilleure résistance aux erreurs
- Développement parallèle simplifié

### Développement modulaire

Pour ajouter un nouveau module:

1. Créer un nouveau fichier dans le répertoire approprié
2. Implémenter la fonction `initialize` qui:
   - Accepte le bus d'événements comme paramètre
   - S'abonne aux événements pertinents
   - Retourne une API publique (si nécessaire)
3. Documenter les événements écoutés et émis

### Tests

Grâce à l'architecture basée sur les événements, les tests sont simples à implémenter:

1. **Tests unitaires**: Créer un simulacre de bus d'événements pour tester le module isolément
2. **Tests d'intégration**: Connecter plusieurs modules via un bus d'événements réel et vérifier les interactions

## Conclusion

L'architecture modulaire de 21 BYTS, basée entièrement sur les événements, offre une flexibilité et une maintenabilité exceptionnelles. Chaque module est conçu pour fonctionner de manière autonome, communiquant exclusivement via le bus d'événements central.

Cette approche garantit une séparation claire des préoccupations, facilite les tests et permet d'étendre facilement l'application avec de nouvelles fonctionnalités ou en remplaçant des modules existants par des implémentations alternatives.

Le respect strict des principes d'indépendance et de modularité permet de développer une application robuste et évolutive, capable de s'adapter aux besoins futurs tout en maintenant une base de code propre et bien organisée.
Stockage local des abonnements
const subscribers = new Map();
// Journalisation des événements pour débogage
const eventLog = [];
// Flag pour le mode debug
let debugMode = false;

/\*\*

- Initialise le bus d'événements
- @param {Object} options - Options de configuration
- @param {boolean} options.debug - Activer le mode debug
- @returns {Object} - API du bus d'événements
  \*/
  function initialize(options = {}) {
  debugMode = options.debug || false;

// Publication de l'événement d'initialisation
publish({
type: 'EVENT_BUS_READY',
meta: {
timestamp: Date.now(),
source: 'event-bus'
}
});

return {
subscribe,
unsubscribe,
publish,
getEventLog
};
}

/\*\*

- S'abonne à un type d'événement
- @param {string} eventType - Type d'événement
- @param {Function} callback - Fonction appelée lors de la réception
- @param {Object} options - Options d'abonnement
  \*/
  function subscribe(eventType, callback, options = {}) {
  if (!subscribers.has(eventType)) {
  subscribers.set(eventType, []);
  }

const subscription = {
callback,
options
};

subscribers.get(eventType).push(subscription);

if (debugMode) {
console.log(`[EventBus] Subscription added for: ${eventType}`);
}
}

/\*\*

- Se désabonne d'un type d'événement
- @param {string} eventType - Type d'événement
- @param {Function} callback - Fonction de callback à supprimer
  \*/
  function unsubscribe(eventType, callback) {
  if (!subscribers.has(eventType)) return;

const subs = subscribers.get(eventType);
const filteredSubs = subs.filter(sub => sub.callback !== callback);

subscribers.set(eventType, filteredSubs);

if (debugMode) {
console.log(`[EventBus] Subscription removed for: ${eventType}`);
}
}

/\*\*

- Publie un événement dans le bus
- @param {Object} event - Événement à publier
- @param {string} event.type - Type d'événement
- @param {Object} event.payload - Données de l'événement
- @param {Object} event.meta - Métadonnées de l'événement
  \*/
  function publish(event) {
  // Validation de base
  if (!event || !event.type) {
  console.error('[EventBus] Invalid event format');
  return;
  }

// Ajout de métadonnées par défaut si absentes
if (!event.meta) {
event.meta = {};
}

if (!event.meta.timestamp) {
event.meta.timestamp = Date.now();
}

// Journalisation
eventLog.push({
...event,
logTimestamp: Date.now()
});

// Limiter la taille du journal
if (eventLog.length > 1000) {
eventLog.shift();
}

// Diffusion aux abonnés
if (subscribers.has(event.type)) {
const subs = subscribers.get(event.type);

    subs.forEach(sub => {
      try {
        sub.callback(event);
      } catch (error) {
        console.error(`[EventBus] Error in subscriber for ${event.type}:`, error);

        // Publier l'erreur comme événement
        publish({
          type: 'EVENT_DELIVERY_ERROR',
          payload: {
            originalEvent: event,
            error: {
              message: error.message,
              stack: error.stack
            }
          },
          meta: {
            timestamp: Date.now(),
            source: 'event-bus'
          }
        });
      }
    });

}

// Abonnés aux événements génériques (type '_')
if (subscribers.has('_')) {
const subs = subscribers.get('\*');

    subs.forEach(sub => {
      try {
        sub.callback(event);
      } catch (error) {
        console.error('[EventBus] Error in wildcard subscriber:', error);
      }
    });

}

if (debugMode) {
console.log(`[EventBus] Event published: ${event.type}`, event);
}
}

/\*\*

- Récupère le journal des événements pour le débogage
- @param {Object} options - Options de filtrage
- @returns {Array} - Journal des événements
  \*/
  function getEventLog(options = {}) {
  let filteredLog = [...eventLog];

if (options.type) {
filteredLog = filteredLog.filter(event => event.type === options.type);
}

if (options.source && options.source !== '') {
filteredLog = filteredLog.filter(event =>
event.meta && event.meta.source === options.source
);
}

if (options.startTime) {
filteredLog = filteredLog.filter(event =>
event.meta && event.meta.timestamp >= options.startTime
);
}

if (options.endTime) {
filteredLog = filteredLog.filter(event =>
event.meta && event.meta.timestamp <= options.endTime
);
}

return filteredLog;
}

// Exporter uniquement la fonction d'initialisation
module.exports = {
initialize
};

````

### Conteneur d'application (`/src/core/app-container.js`)

**Rôle**: Fournir un mécanisme d'injection de dépendances léger.

**Responsabilités**:
- Enregistrer les services et modules
- Résoudre les dépendances à l'exécution
- Gérer le cycle de vie des modules

**Événements écoutés**:
- `APP_INITIALIZED`

**Événements émis**:
- `CONTAINER_READY`
- `MODULE_REGISTERED`
- `MODULE_RESOLVED`

**Exemple d'utilisation**:
```javascript
/**
 * @fileoverview Conteneur d'application avec injection de dépendances
 * @module core/app-container
 */

// Fonction d'initialisation, appelée au démarrage
function initialize(eventBus) {
  // Stockage local des modules enregistrés
  const registeredModules = new Map();

  // S'abonner aux événements pertinents
  eventBus.subscribe('APP_INITIALIZED', handleAppInitialized);

  // Gestionnaire d'initialisation de l'application
  function handleAppInitialized(event) {
    eventBus.publish({
      type: 'CONTAINER_READY',
      meta: {
        timestamp: Date.now(),
        source: 'app-container'
      }
    });
  }

  // Enregistre un nouveau module dans le conteneur
  function registerModule(moduleId, factory, dependencies = []) {
    if (registeredModules.has(moduleId)) {
      eventBus.publish({
        type: 'ERROR',
        payload: {
          code: 'MODULE_ALREADY_REGISTERED',
          message: `Module ${moduleId} is already registered`,
          moduleId
        },
        meta: {
          timestamp: Date.now(),
          source: 'app-container',
          severity: 'warning'
        }
      });
      return;
    }

    registeredModules.set(moduleId, {
      factory,
      dependencies,
      instance: null
    });

    eventBus.publish({
      type: 'MODULE_REGISTERED',
      payload: {
        moduleId,
        dependencies
      },
      meta: {
        timestamp: Date.now(),
        source: 'app-container'
      }
    });
  }

  // Résout un module et ses dépendances
  function resolveModule(moduleId) {
    if (!registeredModules.has(moduleId)) {
      eventBus.publish({
        type: 'ERROR',
        payload: {
          code: 'MODULE_NOT_FOUND',
          message: `Module ${moduleId} not found`,
          moduleId
        },
        meta: {
          timestamp: Date.now(),
          source: 'app-container',
          severity: 'error'
        }
      });
      return null;
    }

    const moduleInfo = registeredModules.get(moduleId);

    // Si l'instance existe déjà, la retourner
    if (moduleInfo.instance) {
      return moduleInfo.instance;
    }

    // Résoudre les dépendances
    const resolvedDependencies = moduleInfo.dependencies.map(depId => {
      // Vérifier les dépendances circulaires
      if (depId === moduleId) {
        eventBus.publish({
          type: 'ERROR',
          payload: {
            code: 'CIRCULAR_DEPENDENCY',
            message: `Circular dependency detected for module ${moduleId}`,
            moduleId
          },
          meta: {
            timestamp: Date.now(),
            source: 'app-container',
            severity: 'error'
          }
        });
        return null;
      }

      return resolveModule(depId);
    });

    // Créer l'instance du module
    try {
      moduleInfo.instance = moduleInfo.factory(...resolvedDependencies);

      eventBus.publish({
        type: 'MODULE_RESOLVED',
        payload: {
          moduleId
        },
        meta: {
          timestamp: Date.now(),
          source: 'app-container'
        }
      });

      return moduleInfo.instance;
    } catch (error) {
      eventBus.publish({
        type: 'ERROR',
        payload: {
          code: 'MODULE_INSTANTIATION_ERROR',
          message: `Error instantiating module ${moduleId}: ${error.message}`,
          moduleId,
          error: {
            message: error.message,
            stack: error.stack
          }
        },
        meta: {
          timestamp: Date.now(),
          source: 'app-container',
          severity: 'critical'
        }
      });

      return null;
    }
  }

  // Nettoie les ressources d'un module
  function disposeModule(moduleId) {
    if (!registeredModules.has(moduleId)) {
      return;
    }

    const moduleInfo = registeredModules.get(moduleId);

    if (moduleInfo.instance && typeof moduleInfo.instance.dispose === 'function') {
      try {
        moduleInfo.instance.dispose();
      } catch (error) {
        eventBus.publish({
          type: 'ERROR',
          payload: {
            code: 'MODULE_DISPOSAL_ERROR',
            message: `Error disposing module ${moduleId}: ${error.message}`,
            moduleId,
            error: {
              message: error.message,
              stack: error.stack
            }
          },
          meta: {
            timestamp: Date.now(),
            source: 'app-container',
            severity: 'warning'
          }
        });
      }
    }

    moduleInfo.instance = null;
  }

  // API publique du conteneur
  return {
    registerModule,
    resolveModule,
    disposeModule
  };
}

module.exports = {
  initialize
};
````

### Gestionnaire de configuration (`/src/core/config-manager.js`)

**Rôle**: Gérer les paramètres et la configuration de l'application.

**Responsabilités**:

- Charger et sauvegarder les préférences utilisateur
- Fournir les valeurs par défaut
- Notifier les changements de configuration

**Événements écoutés**:

- `CONFIG_REQUESTED`
- `UI_SETTINGS_SAVED`

**Événements émis**:

- `CONFIG_PROVIDED`
- `CONFIG_UPDATED`

### Gestionnaire d'erreurs (`/src/core/error-handler.js`)

**Rôle**: Centraliser la gestion des erreurs.

**Responsabilités**:

- Capturer et journaliser les erreurs
- Classifier les erreurs par type
- Appliquer des stratégies de récupération

**Événements écoutés**:

- `ERROR`

**Événements émis**:

- `ERROR_RESOLVED`
- `ERROR_NOTIFICATION`

### Journal d'événements (`/src/core/event-logger.js`)

**Rôle**: Journaliser les événements pour le débogage et l'analyse.

**Responsabilités**:

- Enregistrer les événements chronologiquement
- Filtrer les événements par type
- Exporter les journaux

**Événements écoutés**:

- `*` (tous les événements)

**Événements émis**:

- Aucun (module passif)

### Gestionnaire d'état (`/src/core/state-manager.js`)

**Rôle**: Maintenir l'état global de l'application.

**Responsabilités**:

- Stocker l'état centralisé
- Appliquer les modifications d'état via des événements
- Notifier les changements d'état

**Événements écoutés**:

- Divers événements de modification d'état

**Événements émis**:

- `STATE_CHANGED`

## Modules fonctionnels

### Module de téléchargement

#### Gestionnaire de téléchargement (`/src/modules/download/download-manager.js`)

**Rôle**: Coordonner toutes les opérations de téléchargement.

**Responsabilités**:

- Analyser les URLs soumises
- Déléguer aux adaptateurs de plateforme
- Gérer la file d'attente des téléchargements
- Surveiller la progression
- Gérer les erreurs et les reprises

**Événements écoutés**:

- `URL_SUBMITTED`
- `UI_DOWNLOAD_START_REQUESTED`
- `UI_DOWNLOAD_CANCEL_REQUESTED`
- `UI_DOWNLOAD_PAUSE_REQUESTED`
- `UI_DOWNLOAD_RESUME_REQUESTED`
- `UI_CLEAR_COMPLETED_REQUESTED`
- `DOWNLOAD_COMPLETED`
- `DOWNLOAD_FAILED`
- `CONVERSION_COMPLETED`

**Événements émis**:

- `DOWNLOAD_ANALYZED`
- `DOWNLOAD_QUEUED`
- `DOWNLOAD_STARTED`
- `DOWNLOAD_CANCELED`
- `DOWNLOAD_PAUSED`
- `DOWNLOAD_RESUMED`
- `DOWNLOADS_CLEARED`
- `ERROR`

**Exemple d'utilisation**:

```javascript
/**
 * @fileoverview Gestionnaire principal de téléchargement
 * @module modules/download/download-manager
 */

// Initialisation du module
function initialize(eventBus) {
  // Map des téléchargements actifs, indexés par ID
  const activeDownloads = new Map();
  // Liste des téléchargements en file d'attente
  const downloadQueue = [];
  // Nombre maximum de téléchargements simultanés
  let maxConcurrentDownloads = 3;

  // S'abonner aux événements pertinents
  eventBus.subscribe('APP_INITIALIZED', handleAppInitialized);
  eventBus.subscribe('URL_SUBMITTED', handleUrlSubmitted);
  eventBus.subscribe('UI_DOWNLOAD_START_REQUESTED', handleStartRequested);
  eventBus.subscribe('UI_DOWNLOAD_CANCEL_REQUESTED', handleCancelRequested);
  eventBus.subscribe('UI_DOWNLOAD_PAUSE_REQUESTED', handlePauseRequested);
  eventBus.subscribe('UI_DOWNLOAD_RESUME_REQUESTED', handleResumeRequested);
  eventBus.subscribe('UI_CLEAR_COMPLETED_REQUESTED', handleClearCompleted);
  eventBus.subscribe('DOWNLOAD_COMPLETED', handleDownloadCompleted);
  eventBus.subscribe('DOWNLOAD_FAILED', handleDownloadFailed);
  eventBus.subscribe('CONVERSION_COMPLETED', handleConversionCompleted);
  eventBus.subscribe('CONFIG_PROVIDED', handleConfigProvided);

  // Demander la configuration au démarrage
  function handleAppInitialized() {
    eventBus.publish({
      type: 'CONFIG_REQUESTED',
      payload: {
        keys: ['maxConcurrentDownloads', 'defaultFormat', 'downloadPath'],
        moduleId: 'download-manager'
      },
      meta: {
        timestamp: Date.now(),
        source: 'download-manager'
      }
    });
  }

  // Traiter la configuration reçue
  function handleConfigProvided(event) {
    if (event.payload.moduleId !== 'download-manager') return;

    const config = event.payload.config;

    if (config.maxConcurrentDownloads) {
      maxConcurrentDownloads = config.maxConcurrentDownloads;
    }
  }

  // Traiter une URL soumise
  function handleUrlSubmitted(event) {
    const { url, options } = event.payload;

    // Générer un ID unique pour ce téléchargement
    const itemId = `download-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Déterminer la plateforme (YouTube, Spotify, etc.)
    const platformType = detectPlatform(url);

    // Publier un événement pour l'analyse de l'URL
    eventBus.publish({
      type: 'METADATA_EXTRACTION_STARTED',
      payload: {
        itemId,
        url,
        platformType,
        options
      },
      meta: {
        timestamp: Date.now(),
        source: 'download-manager'
      }
    });

    // Ajouter à la liste des téléchargements actifs
    activeDownloads.set(itemId, {
      id: itemId,
      url,
      platformType,
      status: 'analyzing',
      options: options || {},
      submitted: Date.now()
    });
  }

  // Détecter la plateforme à partir de l'URL
  function detectPlatform(url) {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    if (hostname.includes('youtube') || hostname.includes('youtu.be')) {
      return 'youtube';
    } else if (hostname.includes('spotify')) {
      return 'spotify';
    } else if (hostname.includes('soundcloud')) {
      return 'soundcloud';
    } else if (hostname.includes('bandcamp')) {
      return 'bandcamp';
    } else if (hostname.includes('tidal')) {
      return 'tidal';
    } else {
      return 'unknown';
    }
  }

  // Traiter les métadonnées extraites
  eventBus.subscribe('METADATA_EXTRACTED', event => {
    const { itemId, metadata } = event.payload;

    if (!activeDownloads.has(itemId)) return;

    const download = activeDownloads.get(itemId);
    download.metadata = metadata;
    download.status = 'ready';

    // Mettre à jour l'entrée active
    activeDownloads.set(itemId, download);

    // Publier l'événement de reprise
    eventBus.publish({
      type: 'DOWNLOAD_RESUMED',
      payload: {
        itemId,
        bytesDownloaded: download.bytesDownloaded || 0,
        progress: download.progress || 0
      },
      meta: {
        timestamp: Date.now(),
        source: 'download-manager'
      }
    });

    // Traiter la file d'attente
    processQueue();
  }

  // Mise à jour de la progression d'un téléchargement
  eventBus.subscribe('DOWNLOAD_PROGRESS', event => {
    const { itemId, bytesDownloaded, totalBytes, progress } = event.payload;

    if (!activeDownloads.has(itemId)) return;

    const download = activeDownloads.get(itemId);
    download.bytesDownloaded = bytesDownloaded;
    download.totalBytes = totalBytes;
    download.progress = progress;

    // Mettre à jour l'entrée active
    activeDownloads.set(itemId, download);
  });

  // Nettoyage à la fermeture de l'application
  eventBus.subscribe('APP_SHUTDOWN_REQUESTED', () => {
    // Annuler tous les téléchargements en cours
    const activeIds = Array.from(activeDownloads.entries())
      .filter(([id, download]) => download.status === 'downloading')
      .map(([id]) => id);

    activeIds.forEach(cancelDownload);

    // Notifier que le module est prêt pour la fermeture
    eventBus.publish({
      type: 'APP_SHUTDOWN_READY',
      payload: {
        moduleId: 'download-manager'
      },
      meta: {
        timestamp: Date.now(),
        source: 'download-manager'
      }
    });
  });

  // API publique du module
  return {
    // Les méthodes publiques ne sont généralement pas nécessaires
    // car toute l'interaction se fait via le bus d'événements
  };
}

// Exporter uniquement la fonction d'initialisation
module.exports = {
  initialize
};
```

#### File d'attente de téléchargement (`/src/modules/download/download-queue.js`)

**Rôle**: Gérer la file d'attente des téléchargements.

**Responsabilités**:

- Prioriser les téléchargements
- Limiter le nombre de téléchargements simultanés
- Gérer la pause et la reprise

**Événements écoutés**:

- `DOWNLOAD_QUEUED`
- `DOWNLOAD_PRIORITY_CHANGED`
- `CONFIG_PROVIDED`

**Événements émis**:

- `DOWNLOAD_QUEUE_UPDATED`
- `DOWNLOAD_READY_TO_START`

#### Fabrique d'adaptateurs (`/src/modules/download/adapters/adapter-factory.js`)

**Rôle**: Créer les adaptateurs appropriés pour chaque plateforme.

**Responsabilités**:

- Sélectionner l'adaptateur pour une URL donnée
- Instancier les adaptateurs

**Événements écoutés**:

- `DOWNLOAD_STARTED`

**Événements émis**:

- `ADAPTER_SELECTED`

#### Adaptateur de base (`/src/modules/download/adapters/base-adapter.js`)

**Rôle**: Fournir une classe de base pour tous les adaptateurs de plateforme.

**Responsabilités**:

- Définir l'interface commune
- Partager la logique commune

**Événements écoutés**: N/A (classe abstraite)

**Événements émis**: N/A (classe abstraite)

#### Adaptateurs spécifiques (`/src/modules/download/adapters/*.js`)

**Rôle**: Implémenter l'extraction spécifique à chaque plateforme.

**Responsabilités**:

- Gérer l'authentification si nécessaire
- Extraire les métadonnées
- Gérer le téléchargement

**Événements écoutés**:

- `DOWNLOAD_STARTED` (avec platformType correspondant)
- `DOWNLOAD_PAUSED`
- `DOWNLOAD_RESUMED`
- `DOWNLOAD_CANCELED`
- `AUTH_SUCCESS`

**Événements émis**:

- `DOWNLOAD_PROGRESS`
- `DOWNLOAD_COMPLETED`
- `DOWNLOAD_FAILED`
- `AUTH_REQUIRED`
- `METADATA_EXTRACTED`

**Exemple pour YouTube Adapter**:

```javascript
/**
 * @fileoverview Adaptateur pour la plateforme YouTube
 * @module modules/download/adapters/youtube-adapter
 */

// Initialisation du module
function initialize(eventBus) {
  // Téléchargements actifs gérés par cet adaptateur
  const activeDownloads = new Map();
  // Référence aux processus yt-dlp
  const processes = new Map();

  // S'abonner aux événements pertinents
  eventBus.subscribe('DOWNLOAD_STARTED', handleDownloadStarted);
  eventBus.subscribe('DOWNLOAD_PAUSED', handleDownloadPaused);
  eventBus.subscribe('DOWNLOAD_RESUMED', handleDownloadResumed);
  eventBus.subscribe('DOWNLOAD_CANCELED', handleDownloadCanceled);

  // Vérifier si cet adaptateur doit gérer le téléchargement
  function handleDownloadStarted(event) {
    const { itemId, platformType, url, options } = event.payload;

    // Vérifier si c'est pour YouTube
    if (platformType !== 'youtube') return;

    // Ajouter aux téléchargements actifs
    activeDownloads.set(itemId, {
      id: itemId,
      url,
      options,
      status: 'initializing'
    });

    // Démarrer le téléchargement
    startDownload(itemId);
  }

  // Démarrer le téléchargement YouTube
  function startDownload(itemId) {
    const download = activeDownloads.get(itemId);

    // Préparer le chemin temporaire
    const tempDir = getTempDirectory();
    const tempFilePath = `${tempDir}/${itemId}.%(ext)s`;

    // Préparer les options pour yt-dlp
    const format = download.options.format || 'mp3';
    const quality = download.options.quality || 'high';

    let formatOption;
    if (format === 'mp3') {
      formatOption = 'bestaudio[ext=m4a]/bestaudio';
    } else if (format === 'mp4') {
      formatOption = 'bestvideo[height<=1080]+bestaudio/best[height<=1080]';
    } else {
      formatOption = 'bestaudio/best';
    }

    // Construire la commande yt-dlp
    const ytDlpArgs = [
      '-f',
      formatOption,
      '-o',
      tempFilePath,
      '--newline',
      '--no-playlist', // Gérer les playlists séparément
      url
    ];

    // Mettre à jour l'état du téléchargement
    download.status = 'downloading';
    download.tempFilePath = tempFilePath;
    activeDownloads.set(itemId, download);

    // Démarrer le processus yt-dlp
    const { spawn } = require('child_process');
    const ytDlpProcess = spawn('yt-dlp', ytDlpArgs);

    // Stocker le processus
    processes.set(itemId, ytDlpProcess);

    // Traiter la sortie standard
    ytDlpProcess.stdout.on('data', (data) => {
      parseYtDlpOutput(itemId, data.toString());
    });

    // Traiter la sortie d'erreur
    ytDlpProcess.stderr.on('data', (data) => {
      const errorMessage = data.toString();

      eventBus.publish({
        type: 'ERROR',
        payload: {
          code: 'YOUTUBE_DOWNLOAD_ERROR',
          message: `Error downloading from YouTube: ${errorMessage}`,
          itemId,
          errorDetails: errorMessage
        },
        meta: {
          timestamp: Date.now(),
          source: 'youtube-adapter',
          severity: 'error'
        }
      });
    });

    // Gérer la fin du processus
    ytDlpProcess.on('close', (code) => {
      if (code === 0) {
        // Téléchargement réussi
        handleDownloadSuccess(itemId);
      } else {
        // Échec du téléchargement
        handleDownloadError(itemId, code);
      }

      // Nettoyer
      processes.delete(itemId);
    });
  }

  // Parser la sortie de yt-dlp pour suivre la progression
  function parseYtDlpOutput(itemId, output) {
    const download = activeDownloads.get(itemId);

    // Analyse de la progression
    const progressMatch = output.match(
      /(\d+\.\d+)% of ~?(\d+\.\d+)(\w+) at\s+(\d+\.\d+)(\w+)\/s ETA (\d+:\d+)/
    );
    if (progressMatch) {
      const progress = parseFloat(progressMatch[1]) / 100;
      const totalSize = parseFloat(progressMatch[2]);
      const sizeUnit = progressMatch[3];
      const speed = parseFloat(progressMatch[4]);
      const speedUnit = progressMatch[5];
      const eta = progressMatch[6];

      // Convertir en octets
      const totalBytes = convertToBytes(totalSize, sizeUnit);
      const bytesDownloaded = Math.floor(totalBytes * progress);
      const speedInBytes = convertToBytes(speed, speedUnit);

      // Mettre à jour les informations de téléchargement
      download.progress = progress;
      download.bytesDownloaded = bytesDownloaded;
      download.totalBytes = totalBytes;
      download.speed = speedInBytes;
      download.eta = convertEtaToSeconds(eta);

      activeDownloads.set(itemId, download);

      // Publier la progression
      eventBus.publish({
        type: 'DOWNLOAD_PROGRESS',
        payload: {
          itemId,
          bytesDownloaded,
          totalBytes,
          progress,
          speed: speedInBytes,
          eta: download.eta
        },
        meta: {
          timestamp: Date.now(),
          source: 'youtube-adapter'
        }
      });
    }

    // Détection des métadonnées
    const titleMatch = output.match(/\[download\] Destination: (.+)/);
    if (titleMatch && !download.metadata) {
      // Extraire le titre du nom de fichier
      const filename = titleMatch[1];
      const title = filename
        .split('/')
        .pop()
        .replace(/\.[^/.]+$/, '');

      // Publier les métadonnées extraites
      eventBus.publish({
        type: 'METADATA_EXTRACTED',
        payload: {
          itemId,
          metadata: {
            title,
            platform: 'youtube',
            url: download.url
          }
        },
        meta: {
          timestamp: Date.now(),
          source: 'youtube-adapter'
        }
      });
    }
  }

  // Gérer un téléchargement réussi
  function handleDownloadSuccess(itemId) {
    const download = activeDownloads.get(itemId);

    // Trouver le fichier réel (yt-dlp utilise des wildcards)
    const fs = require('fs');
    const path = require('path');
    const tempDir = path.dirname(download.tempFilePath);
    const tempFileName = path
      .basename(download.tempFilePath)
      .replace('%(ext)s', '*');
    const files = fs.readdirSync(tempDir);

    // Trouver le fichier correspondant
    const matchingFile = files.find((file) => {
      return file.startsWith(itemId) && path.extname(file) !== '';
    });

    if (!matchingFile) {
      handleDownloadError(itemId, 'FILE_NOT_FOUND');
      return;
    }

    const finalTempPath = path.join(tempDir, matchingFile);

    // Mettre à jour l'état du téléchargement
    download.status = 'completed';
    download.filePath = finalTempPath;
    download.completedTime = Date.now();

    activeDownloads.set(itemId, download);

    // Calculer la durée et la taille
    const duration = (download.completedTime - download.startTime) / 1000;
    const stats = fs.statSync(finalTempPath);

    // Publier l'événement de fin
    eventBus.publish({
      type: 'DOWNLOAD_COMPLETED',
      payload: {
        itemId,
        filePath: finalTempPath,
        duration,
        fileSize: stats.size,
        originalFormat: path.extname(finalTempPath).substring(1)
      },
      meta: {
        timestamp: Date.now(),
        source: 'youtube-adapter'
      }
    });

    // Nettoyer
    activeDownloads.delete(itemId);
  }

  // Gérer une erreur de téléchargement
  function handleDownloadError(itemId, errorCode) {
    const download = activeDownloads.get(itemId);

    let errorMessage;
    let canRetry = true;

    switch (errorCode) {
      case 1:
        errorMessage = 'Generic error in YouTube downloader';
        break;
      case 2:
        errorMessage = 'YouTube video not found or is unavailable';
        canRetry = false;
        break;
      case 'FILE_NOT_FOUND':
        errorMessage = 'Downloaded file not found';
        break;
      default:
        errorMessage = `YouTube download failed with code ${errorCode}`;
    }

    // Publier l'événement d'échec
    eventBus.publish({
      type: 'DOWNLOAD_FAILED',
      payload: {
        itemId,
        error: {
          code: 'YOUTUBE_ERROR',
          message: errorMessage,
          details: {
            ytDlpCode: errorCode
          }
        },
        attempts: download.attempts || 1,
        canRetry
      },
      meta: {
        timestamp: Date.now(),
        source: 'youtube-adapter',
        severity: 'error'
      }
    });

    // Nettoyer
    activeDownloads.delete(itemId);
  }

  // Gérer la mise en pause d'un téléchargement
  function handleDownloadPaused(event) {
    const { itemId } = event.payload;

    if (!activeDownloads.has(itemId) || !processes.has(itemId)) return;

    const process = processes.get(itemId);

    // Tuer le processus (yt-dlp ne prend pas en charge la pause)
    process.kill();
    processes.delete(itemId);

    // Marquer comme en pause
    const download = activeDownloads.get(itemId);
    download.status = 'paused';
    activeDownloads.set(itemId, download);
  }

  // Gérer la reprise d'un téléchargement
  function handleDownloadResumed(event) {
    const { itemId } = event.payload;

    if (!activeDownloads.has(itemId)) return;

    const download = activeDownloads.get(itemId);

    if (download.status === 'paused') {
      // Reprendre en créant un nouveau processus
      download.attempts = (download.attempts || 1) + 1;
      activeDownloads.set(itemId, download);

      startDownload(itemId);
    }
  }

  // Gérer l'annulation d'un téléchargement
  function handleDownloadCanceled(event) {
    const { itemId } = event.payload;

    if (!activeDownloads.has(itemId)) return;

    // Tuer le processus si actif
    if (processes.has(itemId)) {
      const process = processes.get(itemId);
      process.kill();
      processes.delete(itemId);
    }

    // Nettoyer les fichiers temporaires
    const download = activeDownloads.get(itemId);
    if (download.tempFilePath) {
      try {
        const fs = require('fs');
        const path = require('path');
        const tempDir = path.dirname(download.tempFilePath);
        const tempFileName = path
          .basename(download.tempFilePath)
          .replace('%(ext)s', '*');

        // Rechercher les fichiers correspondants
        const files = fs.readdirSync(tempDir);
        files.forEach((file) => {
          if (file.startsWith(itemId)) {
            fs.unlinkSync(path.join(tempDir, file));
          }
        });
      } catch (error) {
        console.error(`Error cleaning up temp files for ${itemId}:`, error);
      }
    }

    // Nettoyer
    activeDownloads.delete(itemId);
  }

  // Utilitaires
  function getTempDirectory() {
    const os = require('os');
    return os.tmpdir();
  }

  function convertToBytes(value, unit) {
    const units = {
      B: 1,
      KiB: 1024,
      MiB: 1024 * 1024,
      GiB: 1024 * 1024 * 1024,
      KB: 1000,
      MB: 1000 * 1000,
      GB: 1000 * 1000 * 1000
    };

    return value * (units[unit] || 1);
  }

  function convertEtaToSeconds(eta) {
    const parts = eta.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }

  // API publique du module
  return {
    // Les méthodes publiques ne sont généralement pas nécessaires
    // car toute l'interaction se fait via le bus d'événements
  };
}

// Exporter uniquement la fonction d'initialisation
module.exports = {
  initialize
};
```

### Module d'interface utilisateur (UI)

#### Gestionnaire d'UI (`/src/modules/ui/ui-manager.js`)

**Rôle**: Coordonner tous les composants d'interface.

**Responsabilités**:

- Initialiser l'interface utilisateur
- Coordonner les composants d'interface
- Réagir aux événements système

**Événements écoutés**:

- `APP_INITIALIZED`
- `DOWNLOAD_QUEUED`
- `DOWNLOAD_STARTED`
- `DOWNLOAD_PROGRESS`
- `DOWNLOAD_COMPLETED`
- `DOWNLOAD_FAILED`
- `DOWNLOAD_CANCELED`
- `DOWNLOADS_CLEARED`
- `ERROR`
- `CONFIG_PROVIDED`

**Événements émis**:

- `UI_READY`
- `CONFIG_REQUESTED`

#### Registre des composants (`/src/modules/ui/components/component-registry.js`)

**Rôle**: Gérer le registre central des composants d'interface.

**Responsabilités**:

- Enregistrer les composants d'interface
- Fournir une référence aux composants

**Événements écoutés**:

- `UI_READY`

**Événements émis**:

- `COMPONENT_REGISTERED`
- `COMPONENT_UNREGISTERED`

#### Composants d'interface (`/src/modules/ui/components/*.js`)

**Rôle**: Gérer des parties spécifiques de l'interface utilisateur.

**Responsabilités**:

- Afficher et mettre à jour les éléments d'interface
- Traiter les interactions utilisateur

**Événements écoutés**: Divers, selon le composant

**Événements émis**: Divers, selon le composant

### Module d'authentification

#### Gestionnaire d'authentification (`/src/modules/auth/auth-manager.js`)

**Rôle**: Gérer l'authentification pour les services nécessitant des identifiants.

**Responsabilités**:

- Gérer le processus d'authentification OAuth
- Rafraîchir les tokens

**Événements écoutés**:

- `AUTH_REQUIRED`
- `AUTH_TOKEN_EXPIRED`

**Événements émis**:

- `AUTH_STARTED`
- `AUTH_CODE_RECEIVED`
- `AUTH_SUCCESS`
- `AUTH_FAILED`
- `AUTH_TOKEN_REFRESHED`

#### Stockage sécurisé des tokens (`/src/modules/auth/secure-token-store.js`)

**Rôle**: Stocker les tokens d'authentification de manière sécurisée.

**Responsabilités**:

- Chiffrer les tokens avec AES-256
- Stocker les tokens localement
- Vérifier l'expiration des tokens

**Événements écoutés**:

- `AUTH_SUCCESS`
- `AUTH_TOKEN_REFRESHED`

**Événements émis**:

- `AUTH_TOKEN_EXPIRED`
- `AUTH_TOKEN_RETRIEVED`

### Module de métadonnées

#### Gestionnaire de métadonnées (`/src/modules/metadata/metadata-manager.js`)

**Rôle**: Gérer les métadonnées des fichiers audio.

**Responsabilités**:

- Extraire les métadonnées des sources
- Formatter et normaliser les métadonnées

**Événements écoutés**:

- `DOWNLOAD_COMPLETED`
- `METADATA_UPDATED`

**Événements émis**:

- `METADATA_EXTRACTION_STARTED`
- `METADATA_EXTRACTED`
- `METADATA_EXTRACTION_FAILED`

#### Processeur de tags (`/src/modules/metadata/tag-processor.js`)

**Rôle**: Appliquer les métadonnées aux fichiers téléchargés.

**Responsabilités**:

- Appliquer les tags aux fichiers audio
- Gérer les pochettes d'album

**Événements écoutés**:

- `METADATA_EXTRACTED`
- `METADATA_UPDATED`
- `CONVERSION_COMPLETED`

**Événements émis**:

- `TAGS_APPLIED`
- `ERROR`

### Module de formats

#### Convertisseur de format (`/src/modules/formats/format-converter.js`)

**Rôle**: Gérer la conversion entre formats audio.

**Responsabilités**:

- Convertir les fichiers audio entre différents formats
- Appliquer des paramètres de qualité

**Événements écoutés**:

- `DOWNLOAD_COMPLETED`
- `UI_FORMAT_CHANGED`

**Événements émis**:

- `CONVERSION_STARTED`
- `CONVERSION_PROGRESS`
- `CONVERSION_COMPLETED`
- `CONVERSION_FAILED`

## Utilitaires

### Opérations sur les fichiers (`/src/utils/file-operations.js`)

**Rôle**: Gérer les opérations sur les fichiers.

**Responsabilités**:

- Lecture/écriture de fichiers
- Copie et déplacement de fichiers
- Gestion des dossiers

**Événements écoutés**:

- `UI_ADD_TO_LIBRARY_REQUESTED`
- `CONVERSION_COMPLETED`

**Événements émis**:

- `FILE_ADDED_TO_LIBRARY`
- `ERROR`

### Utilitaires de cryptographie (`/src/utils/crypto-utils.js`)

**Rôle**: Fournir des fonctions de cryptographie.

**Responsabilités**:

- Chiffrement/déchiffrement AES-256
- Génération de hash (SHA-256)
- Vérification des checksums

**Événements écoutés**: N/A (utilitaire passif)

**Événements émis**: N/A (utilitaire passif)

### Détection de plateforme (`/src/utils/platform-detector.js`)

**Rôle**: Détecter la plateforme d'exécution.

**Responsabilités**:

- Déterminer le système d'exploitation
- Adapter les chemins de fichiers
- Identifier les capacités du système

**Événements écoutés**: N/A (utilitaire passif)

**Événements émis**:

- `PLATFORM_DETECTED`

### Traitement des playlists (`/src/utils/playlist-handler.js`)

**Rôle**: Gérer les playlists dans différents formats.

**Responsabilités**:

- Détecter les playlists
- Extraire les éléments de la playlist
- Gérer la limite des playlists (max 200 titres)

**Événements écoutés**:

- `DOWNLOAD_ANALYZED`

**Événements émis**:

- `PLAYLIST_DETECTED`
- `PLAYLIST_ITEMS_EXTRACTED`

### File d'attente asynchrone (`/src/utils/async-queue.js`)

**Rôle**: Gérer les opérations asynchrones en file d'attente.

**Responsabilités**:

- Limiter le nombre d'opérations simultanées
- Gérer les priorités
- Réessayer les opérations échouées

**Événements écoutés**: N/A (utilitaire passif)

**Événements émis**: N/A (utilitaire passif)

### Limiteur d'événements (`/src/utils/event-throttler.js`)

**Rôle**: Limiter la fréquence des événements.

**Responsabilités**:

- Regrouper les événements fréquents
- Limiter les mises à jour d'interface

**Événements écoutés**: N/A (utilitaire passif)

**Événements émis**: N/A (utilitaire passif)

## Constantes

### Types d'événements (`/src/constants/event-types.js`)

**Rôle**: Définir tous les types d'événements standardisés.

**Contenu**:

```javascript
/**
 * @fileoverview Constantes pour les types d'événements standardisés
 * @module constants/event-types
 */

// Événements d'application
module.exports.APP_INITIALIZED = 'APP_INITIALIZED';
module.exports.APP_SHUTDOWN_REQUESTED = 'APP_SHUTDOWN_REQUESTED';
module.exports.APP_SHUTDOWN_READY = 'APP_SHUTDOWN_READY';
module.exports.APP_UPDATE_AVAILABLE = 'APP_UPDATE_AVAILABLE';

// Événements de bus d'événements
module.exports.EVENT_BUS_READY = 'EVENT_BUS_READY';
module.exports.EVENT_PUBLISHED = 'EVENT_PUBLISHED';
module.exports.EVENT_DELIVERY_ERROR = 'EVENT_DELIVERY_ERROR';

// Événements de conteneur
module.exports.CONTAINER_READY = 'CONTAINER_READY';
module.exports.MODULE_REGISTERED = 'MODULE_REGISTERED';
module.exports.MODULE_RESOLVED = 'MODULE_RESOLVED';

// Événements d'interface utilisateur
module.exports.UI_READY = 'UI_READY';
module.exports.URL_SUBMITTED = 'URL_SUBMITTED';
module.exports.UI_FORMAT_CHANGED = 'UI_FORMAT_CHANGED';
module.exports.UI_DOWNLOAD_START_REQUESTED = 'UI_DOWNLOAD_START_REQUESTED';
module.exports.UI_DOWNLOAD_CANCEL_REQUESTED = 'UI_DOWNLOAD_CANCEL_REQUESTED';
module.exports.UI_DOWNLOAD_PAUSE_REQUESTED = 'UI_DOWNLOAD_PAUSE_REQUESTED';
module.exports.UI_DOWNLOAD_RESUME_REQUESTED = 'UI_DOWNLOAD_RESUME_REQUESTED';
module.exports.UI_SETTINGS_OPENED = 'UI_SETTINGS_OPENED';
module.exports.UI_SETTINGS_SAVED = 'UI_SETTINGS_SAVED';
module.exports.UI_CLEAR_COMPLETED_REQUESTED = 'UI_CLEAR_COMPLETED_REQUESTED';
module.exports.UI_ADD_TO_LIBRARY_REQUESTED = 'UI_ADD_TO_LIBRARY_REQUESTED';

// Événements de téléchargement
module.exports.DOWNLOAD_ANALYZED = 'DOWNLOAD_ANALYZED';
module.exports.DOWNLOAD_QUEUED = 'DOWNLOAD_QUEUED';
module.exports.DOWNLOAD_STARTED = 'DOWNLOAD_STARTED';
module.exports.DOWNLOAD_PROGRESS = 'DOWNLOAD_PROGRESS';
module.exports.DOWNLOAD_COMPLETED = 'DOWNLOAD_COMPLETED';
module.exports.DOWNLOAD_FAILED = 'DOWNLOAD_FAILED';
module.exports.DOWNLOAD_CANCELED = 'DOWNLOAD_CANCELED';
module.exports.DOWNLOAD_PAUSED = 'DOWNLOAD_PAUSED';
module.exports.DOWNLOAD_RESUMED = 'DOWNLOAD_RESUMED';
module.exports.DOWNLOADS_CLEARED = 'DOWNLOADS_CLEARED';
module.exports.DOWNLOAD_QUEUE_UPDATED = 'DOWNLOAD_QUEUE_UPDATED';
module.exports.DOWNLOAD_READY_TO_START = 'DOWNLOAD_READY_TO_START';
module.exports.DOWNLOAD_PRIORITY_CHANGED = 'DOWNLOAD_PRIORITY_CHANGED';
module.exports.ADAPTER_SELECTED = 'ADAPTER_SELECTED';

// Événements d'authentification
module.exports.AUTH_REQUIRED = 'AUTH_REQUIRED';
module.exports.AUTH_STARTED = 'AUTH_STARTED';
module.exports.AUTH_CODE_RECEIVED = 'AUTH_CODE_RECEIVED';
module.exports.AUTH_SUCCESS = 'AUTH_SUCCESS';
module.exports.AUTH_FAILED = 'AUTH_FAILED';
module.exports.AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED';
module.exports.AUTH_TOKEN_REFRESHED = 'AUTH_TOKEN_REFRESHED';
module.exports.AUTH_TOKEN_RETRIEVED = 'AUTH_TOKEN_RETRIEVED';

// Événements de métadonnées
module.exports.METADATA_EXTRACTION_STARTED = 'METADATA_EXTRACTION_STARTED';
module.exports.METADATA_EXTRACTED = 'METADATA_EXTRACTED';
module.exports.METADATA_EXTRACTION_FAILED = 'METADATA_EXTRACTION_FAILED';
module.exports.METADATA_UPDATED = 'METADATA_UPDATED';
module.exports.TAGS_APPLIED = 'TAGS_APPLIED';

//
    activeDownloads.set(itemId, download);

    // Ajouter à la file d'attente
    addToQueue(itemId);
  });

  // Ajouter un téléchargement à la file d'attente
  function addToQueue(itemId) {
    const download = activeDownloads.get(itemId);

    downloadQueue.push(itemId);

    eventBus.publish({
      type: 'DOWNLOAD_QUEUED',
      payload: {
        itemId,
        position: downloadQueue.indexOf(itemId) + 1,
        metadata: download.metadata
      },
      meta: {
        timestamp: Date.now(),
        source: 'download-manager'
      }
    });

    // Démarrer le traitement de la file d'attente
    processQueue();
  }

  // Traiter la file d'attente de téléchargement
  function processQueue() {
    // Compter les téléchargements actifs
    const activeCount = Array.from(activeDownloads.values())
      .filter(d => d.status === 'downloading')
      .length;

    // Vérifier si on peut démarrer de nouveaux téléchargements
    if (activeCount >= maxConcurrentDownloads) {
      return;
    }

    // Démarrer les téléchargements dans la limite du nombre maximum
    while (downloadQueue.length > 0 && activeCount < maxConcurrentDownloads) {
      const itemId = downloadQueue.shift();

      if (activeDownloads.has(itemId)) {
        const download = activeDownloads.get(itemId);

        // Vérifier que le téléchargement est prêt
        if (download.status === 'ready') {
          startDownload(itemId);
        }
      }
    }
  }

  // Démarrer un téléchargement spécifique
  function startDownload(itemId) {
    if (!activeDownloads.has(itemId)) return;

    const download = activeDownloads.get(itemId);
    download.status = 'downloading';
    download.startTime = Date.now();

    // Mettre à jour l'entrée active
    activeDownloads.set(itemId, download);

    // Publier l'événement de démarrage
    eventBus.publish({
      type: 'DOWNLOAD_STARTED',
      payload: {
        itemId,
        platformType: download.platformType,
        url: download.url,
        startTime: download.startTime,
        options: download.options
      },
      meta: {
        timestamp: Date.now(),
        source: 'download-manager'
      }
    });
  }

  // Gestionnaire de demande de démarrage
  function handleStartRequested(event) {
    const { itemId } = event.payload;

    if (!activeDownloads.has(itemId)) return;

    const download = activeDownloads.get(itemId);

    if (download.status === 'ready') {
      // Si en file d'attente, promouvoir au début
      const queueIndex = downloadQueue.indexOf(itemId);
      if (queueIndex !== -1) {
        downloadQueue.splice(queueIndex, 1);
        downloadQueue.unshift(itemId);
      }

      // Traiter la file d'attente
      processQueue();
    } else if (download.status === 'paused') {
      // Reprendre un téléchargement en pause
      resumeDownload(itemId);
    }
  }

  // Gestionnaire de demande d'annulation
  function handleCancelRequested(event) {
    const { itemId } = event.payload;

    if (!activeDownloads.has(itemId)) return;

    cancelDownload(itemId);
  }

  // Gestionnaire de demande de pause
  function handlePauseRequested(event) {
    const { itemId } = event.payload;

    if (!activeDownloads.has(itemId)) return;

    const download = activeDownloads.get(itemId);

    if (download.status === 'downloading') {
      pauseDownload(itemId);
    }
  }

  // Gestionnaire de demande de reprise
  function handleResumeRequested(event) {
    const { itemId } = event.payload;

    if (!activeDownloads.has(itemId)) return;

    const download = activeDownloads.get(itemId);

    if (download.status === 'paused') {
      resumeDownload(itemId);
    }
  }

  // Gestionnaire de nettoyage des téléchargements terminés
  function handleClearCompleted(event) {
    const completedIds = Array.from(activeDownloads.entries())
      .filter(([id, download]) => download.status === 'completed')
      .map(([id]) => id);

    if (completedIds.length === 0) return;

    // Supprimer les téléchargements terminés
    completedIds.forEach(id => {
      activeDownloads.delete(id);
    });

    // Publier l'événement de nettoyage
    eventBus.publish({
      type: 'DOWNLOADS_CLEARED',
      payload: {
        itemIds: completedIds
      },
      meta: {
        timestamp: Date.now(),
        source: 'download-manager'
      }
    });
  }

  // Gérer la fin d'un téléchargement
  function handleDownloadCompleted(event) {
    const { itemId, filePath } = event.payload;

    if (!activeDownloads.has(itemId)) return;

    const download = activeDownloads.get(itemId);
    download.status = 'processing';
    download.filePath = filePath;
    download.completedTime = Date.now();

    // Mettre à jour l'entrée active
    activeDownloads.set(itemId, download);

    // Traiter la file d'attente pour démarrer d'autres téléchargements
    processQueue();
  }

  // Gérer les échecs de téléchargement
  function handleDownloadFailed(event) {
    const { itemId, error, canRetry } = event.payload;

    if (!activeDownloads.has(itemId)) return;

    const download = activeDownloads.get(itemId);
    download.status = 'failed';
    download.error = error;
    download.canRetry = canRetry;

    // Mettre à jour l'entrée active
    activeDownloads.set(itemId, download);

    // Traiter la file d'attente
    processQueue();
  }

  // Gérer la fin d'une conversion
  function handleConversionCompleted(event) {
    const { itemId, convertedFilePath } = event.payload;

    if (!activeDownloads.has(itemId)) return;

    const download = activeDownloads.get(itemId);
    download.status = 'completed';
    download.filePath = convertedFilePath;

    // Mettre à jour l'entrée active
    activeDownloads.set(itemId, download);
  }

  // Annuler un téléchargement
  function cancelDownload(itemId) {
    if (!activeDownloads.has(itemId)) return;

    const download = activeDownloads.get(itemId);
    const previousStatus = download.status;
    download.status = 'canceled';

    // Mettre à jour l'entrée active
    activeDownloads.set(itemId, download);

    // Publier l'événement d'annulation
    eventBus.publish({
      type: 'DOWNLOAD_CANCELED',
      payload: {
        itemId,
        previousStatus,
        tempFilePath: download.tempFilePath
      },
      meta: {
        timestamp: Date.now(),
        source: 'download-manager'
      }
    });

    // Traiter la file d'attente
    processQueue();
  }

  // Mettre en pause un téléchargement
  function pauseDownload(itemId) {
    if (!activeDownloads.has(itemId)) return;

    const download = activeDownloads.get(itemId);
    download.status = 'paused';

    // Mettre à jour l'entrée active
    activeDownloads.set(itemId, download);

    // Publier l'événement de pause
    eventBus.publish({
      type: 'DOWNLOAD_PAUSED',
      payload: {
        itemId,
        bytesDownloaded: download.bytesDownloaded || 0,
        progress: download.progress || 0
      },
      meta: {
        timestamp: Date.now(),
        source: 'download-manager'
      }
    });

    // Traiter la file d'attente
    processQueue();
  }

  // Reprendre un téléchargement
  function resumeDownload(itemId) {
    if (!activeDownloads.has(itemId)) return;

    const download = activeDownloads.get(itemId);
    download.status = 'downloading';

    // Mettre à jour l'entrée active
```
