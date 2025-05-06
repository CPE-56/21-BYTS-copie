/**
 * @fileoverview Point d'entrée principal de l'application 21 BYTS
 * @description Ce fichier initialise l'application Electron et coordonne le chargement
 * des modules via le bus d'événements. Il ne contient aucune logique métier directe
 * et sert uniquement de bootstrap pour l'application.
 *
 * @module main
 * @requires electron
 */

'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let eventBus = null;
let appState = {
  isReady: false,
  modulesInitialized: 0,
  totalModules: 5,
  appConfig: null
};

function initializeEventBus() {
  const eventListeners = {};
  let debugMode = false;

  return {
    subscribe(eventType, callback) {
      if (!eventListeners[eventType]) eventListeners[eventType] = [];
      eventListeners[eventType].push(callback);
      console.log(`[EventBus] Nouvel abonnement à l'événement: ${eventType}`);
    },
    publish(eventType, data = {}) {
      console.log(`[EventBus] Publication d'un événement: ${eventType}`);
      if (eventListeners[eventType]) {
        eventListeners[eventType].forEach((callback) => {
          try {
            callback(data);
          } catch (error) {
            console.error(
              `[EventBus] Erreur lors du traitement de l'événement ${eventType}:`,
              error
            );
            if (eventType !== 'ERROR') {
              this.publish('ERROR', {
                source: 'eventBus',
                message: `Erreur lors du traitement de l'événement ${eventType}`,
                error
              });
            }
          }
        });
      }
    },
    setDebugMode(enabled) {
      debugMode = enabled;
      console.log(`[EventBus] Mode debug ${enabled ? 'activé' : 'désactivé'}`);
    },
    getDebugMode() {
      return debugMode;
    }
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#1a1f35',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      enableRemoteModule: false,
      webSecurity: true,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();

    // Activer le mode debug si en environnement de développement
    if (process.env.NODE_ENV === 'development') {
      setTimeout(() => {
        if (eventBus && typeof eventBus.setDebugMode === 'function') {
          eventBus.setDebugMode(true);
          console.log('[Main] Mode debug activé');
        }
      }, 500); // Délai pour s'assurer que le bus d'événements est initialisé
    }

    eventBus.publish('UI_WINDOW_READY', { windowId: 'main' });
  });

  mainWindow.on('closed', () => {
    eventBus.publish('APP_WINDOW_CLOSED', { windowId: 'main' });
    mainWindow = null;
  });
}

function setupIPC() {
  ipcMain.handle('event-channel', (event, { eventType, data }) => {
    eventBus.publish(eventType, data);
  });
}

function loadModule(modulePath) {
  try {
    const fullPath = path.join(process.cwd(), 'src', modulePath);
    if (!fs.existsSync(fullPath)) throw new Error(`Module introuvable: ${fullPath}`);
    const moduleExports = require(fullPath);
    if (typeof moduleExports.initialize === 'function') {
      moduleExports.initialize(eventBus);
      console.log(`[Main] Module chargé: ${modulePath}`);
      appState.modulesInitialized++;
      if (appState.modulesInitialized === appState.totalModules) {
        eventBus.publish('APP_ALL_MODULES_LOADED', { moduleCount: appState.totalModules });
      }
    } else {
      throw new Error(`Le module ${modulePath} n'expose pas de fonction d'initialisation`);
    }
  } catch (error) {
    console.error(`[Main] Erreur lors du chargement du module ${modulePath}:`, error);
    eventBus.publish('ERROR', {
      source: 'moduleLoader',
      message: `Erreur lors du chargement du module ${modulePath}`,
      error
    });
  }
}

function setupEventHandlers() {
  eventBus.subscribe('ERROR', (data) => {
    console.error('[Main] Erreur reçue:', data);
    if (mainWindow && !mainWindow.isDestroyed()) {
      eventBus.publish('UI_SHOW_ERROR', {
        title: 'Erreur',
        message: data.message || "Une erreur inattendue s'est produite",
        details: data.error ? data.error.stack || data.error.toString() : ''
      });
    }
  });

  eventBus.subscribe('CONFIG_LOADED', (config) => {
    appState.appConfig = config;
    console.log('[Main] Configuration chargée');
    eventBus.publish('APP_CONFIG_READY', { config });
  });

  eventBus.subscribe('APP_CORE_READY', () => {
    appState.isReady = true;
    console.log("[Main] Noyau de l'application prêt");
    if (!mainWindow) createWindow();
  });

  eventBus.subscribe('OPEN_EXTERNAL_URL', (data) => {
    if (data?.url && (data.url.startsWith('http://') || data.url.startsWith('https://'))) {
      shell.openExternal(data.url);
    } else {
      eventBus.publish('ERROR', {
        source: 'main',
        message: "Tentative d'ouverture d'une URL non sécurisée ou invalide",
        error: new Error(`URL non autorisée ou invalide: ${data?.url || 'undefined'}`)
      });
    }
  });

  eventBus.subscribe('DIALOG_SELECT_DIRECTORY', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      dialog
        .showOpenDialog(mainWindow, {
          properties: ['openDirectory']
        })
        .then((result) => {
          if (!result.canceled && result.filePaths.length > 0) {
            eventBus.publish('DIALOG_DIRECTORY_SELECTED', {
              requestId: data.requestId,
              directory: result.filePaths[0]
            });
          } else {
            eventBus.publish('DIALOG_CANCELLED', {
              requestId: data.requestId
            });
          }
        })
        .catch((error) => {
          eventBus.publish('ERROR', {
            source: 'dialog',
            message: 'Erreur lors de la sélection du dossier',
            error
          });
        });
    }
  });
}

app.whenReady().then(() => {
  console.log('[Main] Application en cours de démarrage...');
  eventBus = initializeEventBus();

  if (process.env.NODE_ENV !== 'production') {
    try {
      const { registerDebugSimulator } = require('./utils/debug-simulator');
      registerDebugSimulator(eventBus);
    } catch (err) {
      console.warn('[Main] Impossible de charger le simulateur de debug :', err.message);
    }
  }

  setupEventHandlers();
  setupIPC();

  eventBus.publish('APP_STARTING', {
    timestamp: Date.now(),
    environment: process.env.NODE_ENV || 'development'
  });

  loadModule('core/config-manager.js');
  loadModule('core/error-handler.js');
  loadModule('core/event-logger.js');
  loadModule('core/state-manager.js');
  loadModule('core/app-container.js');
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  eventBus.publish('APP_ALL_WINDOWS_CLOSED');
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  eventBus.publish('APP_BEFORE_QUIT');
});

if (process.env.NODE_ENV === 'test') {
  module.exports = {
    getEventBus: () => eventBus,
    getAppState: () => appState
  };
}
