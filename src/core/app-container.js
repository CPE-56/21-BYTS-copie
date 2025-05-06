/**
 * @fileoverview Conteneur d'application avec injection de dépendances pour 21 BYTS
 *
 * @module core/app-container
 * @requires electron
 */

const { app } = require('electron');

/**
 * @class AppContainer
 * @description Conteneur d'application avec injection de dépendances pour 21 BYTS
 */
class AppContainer {
  /**
   * @param {Object} params
   * @param {Object} params.eventBus - Le bus d'événements central
   */
  constructor({ eventBus }) {
    if (!eventBus) {
      throw new Error('eventBus est requis pour initialiser AppContainer');
    }

    this.eventBus = eventBus;
    this.modules = new Map();
    this.isInitialized = false;
    this.initializationQueue = [];

    this._setupEventListeners();

    this.eventBus.emit('core:debug', {
      source: 'AppContainer',
      message: "Conteneur d'application créé"
    });
  }

  _setupEventListeners() {
    this.eventBus.on('core:register-module', ({ moduleId, moduleInstance, dependencies = [] }) => {
      try {
        this._registerModule(moduleId, moduleInstance, dependencies);
        this.eventBus.emit('core:module-registered', { moduleId, success: true });
      } catch (error) {
        this.eventBus.emit('core:error', {
          source: 'AppContainer',
          message: `Erreur lors de l'enregistrement du module ${moduleId}`,
          error: error.message,
          stack: error.stack
        });
      }
    });

    this.eventBus.on('core:get-module', ({ moduleId, requestId }) => {
      try {
        const module = this.modules.get(moduleId);
        if (!module) throw new Error(`Module ${moduleId} non trouvé`);
        this.eventBus.emit(`core:module-response:${requestId}`, {
          moduleId,
          module: module.instance,
          success: true
        });
      } catch (error) {
        this.eventBus.emit(`core:module-response:${requestId}`, {
          moduleId,
          success: false,
          error: error.message
        });
      }
    });

    this.eventBus.on('core:get-all-modules', ({ requestId }) => {
      try {
        const modulesList = Array.from(this.modules.keys()).map((id) => ({
          id,
          dependencies: this.modules.get(id).dependencies
        }));
        this.eventBus.emit(`core:all-modules-response:${requestId}`, {
          modules: modulesList,
          success: true
        });
      } catch (error) {
        this.eventBus.emit(`core:all-modules-response:${requestId}`, {
          success: false,
          error: error.message
        });
      }
    });

    this.eventBus.on('core:app-init', async () => {
      if (this.isInitialized) {
        this.eventBus.emit('core:warning', {
          source: 'AppContainer',
          message: "L'application est déjà initialisée"
        });
        return;
      }

      try {
        await this._initializeModules();
        this.isInitialized = true;
        this.eventBus.emit('core:app-ready', { timestamp: Date.now() });
      } catch (error) {
        this.eventBus.emit('core:error', {
          source: 'AppContainer',
          message: "Erreur lors de l'initialisation de l'application",
          error: error.message,
          stack: error.stack
        });
      }
    });

    this.eventBus.on('core:app-shutdown', async () => {
      if (!this.isInitialized) return;
      try {
        this.eventBus.emit('core:app-shutting-down');
        const moduleIds = Array.from(this.modules.keys()).reverse();
        for (const moduleId of moduleIds) {
          const moduleData = this.modules.get(moduleId);
          if (moduleData.instance?.shutdown instanceof Function) {
            await moduleData.instance.shutdown();
            this.eventBus.emit('core:debug', {
              source: 'AppContainer',
              message: `Module ${moduleId} arrêté`
            });
          }
        }
        this.isInitialized = false;
        app.quit();
      } catch (error) {
        this.eventBus.emit('core:error', {
          source: 'AppContainer',
          message: "Erreur lors de l'arrêt de l'application",
          error: error.message,
          stack: error.stack
        });
        setTimeout(() => app.exit(1), 1000);
      }
    });
  }

  _registerModule(moduleId, moduleInstance, dependencies = []) {
    if (!moduleId || typeof moduleId !== 'string') {
      throw new Error('moduleId doit être une chaîne de caractères non vide');
    }
    if (!moduleInstance) {
      throw new Error(`moduleInstance est requis pour ${moduleId}`);
    }
    if (this.modules.has(moduleId)) {
      throw new Error(`Un module avec l'ID ${moduleId} est déjà enregistré`);
    }

    this.modules.set(moduleId, {
      instance: moduleInstance,
      dependencies,
      initialized: false
    });

    this.eventBus.emit('core:debug', {
      source: 'AppContainer',
      message: `Module ${moduleId} enregistré avec dépendances: ${dependencies.join(', ') || 'aucune'}`
    });

    if (this.isInitialized) {
      this.initializationQueue.push(moduleId);
      this._processInitializationQueue();
    }
  }

  async _initializeModules() {
    this.initializationQueue = Array.from(this.modules.keys());
    await this._processInitializationQueue();
  }

  async _processInitializationQueue() {
    const maxIterations = this.initializationQueue.length * 2;
    let iterations = 0;

    while (this.initializationQueue.length > 0 && iterations < maxIterations) {
      iterations++;
      const moduleId = this.initializationQueue.shift();
      const moduleData = this.modules.get(moduleId);
      if (!moduleData) continue;

      const allDependenciesInitialized = moduleData.dependencies.every((depId) => {
        const dep = this.modules.get(depId);
        return dep && dep.initialized;
      });

      if (!allDependenciesInitialized) {
        this.initializationQueue.push(moduleId);
        continue;
      }

      try {
        if (typeof moduleData.instance.initialize === 'function') {
          await moduleData.instance.initialize();
        }
        moduleData.initialized = true;
        this.eventBus.emit('core:debug', {
          source: 'AppContainer',
          message: `Module ${moduleId} initialisé avec succès`
        });
      } catch (error) {
        this.eventBus.emit('core:error', {
          source: 'AppContainer',
          message: `Erreur lors de l'initialisation du module ${moduleId}`,
          error: error.message,
          stack: error.stack
        });
        moduleData.initialized = true;
        moduleData.initError = error;
      }
    }

    if (this.initializationQueue.length > 0) {
      const remainingModules = this.initializationQueue.join(', ');
      const error = new Error(`Dépendances circulaires détectées : ${remainingModules}`);
      this.eventBus.emit('core:error', {
        source: 'AppContainer',
        message: 'Dépendances circulaires détectées',
        error: error.message,
        modules: this.initializationQueue
      });
      throw error;
    }
  }

  getDependencyGraph() {
    const graph = {};
    for (const [moduleId, moduleData] of this.modules.entries()) {
      graph[moduleId] = {
        dependencies: moduleData.dependencies,
        initialized: moduleData.initialized
      };
    }
    return graph;
  }
}

/**
 * Initialise le conteneur d'application
 * @param {Object} params
 * @param {Object} params.eventBus - Le bus d'événements central
 * @returns {AppContainer}
 */
function initializeAppContainer({ eventBus }) {
  if (!eventBus) throw new Error('eventBus est requis pour initialiser AppContainer');
  const container = new AppContainer({ eventBus });
  container._registerModule('app-container', container, []);
  return container;
}

module.exports = {
  initialize: initializeAppContainer
};
