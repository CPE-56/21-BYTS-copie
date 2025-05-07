/**
 * state-manager.js
 *
 * @description
 * Gestionnaire d'état centralisé pour l'application 21 BYTS.
 * Ce module fournit un store immutable pour gérer les états globaux
 * de l'application, permettant une gestion prévisible des données
 * et facilitant le débogage.
 *
 * @events écoutés
 * - STATE_GET: Récupère un segment d'état par son chemin
 * - STATE_SET: Définit une valeur d'état à un chemin spécifié
 * - STATE_UPDATE: Met à jour une partie de l'état par fusion
 * - STATE_RESET: Réinitialise l'état ou un segment à sa valeur par défaut
 * - STATE_SUBSCRIBE: Abonne un module à des changements sur un chemin d'état
 * - STATE_UNSUBSCRIBE: Désabonne un module des notifications
 * - APP_INITIALIZE: Initialisation de l'application pour charger l'état initial
 * - APP_SHUTDOWN: Sauvegarde l'état actuel avant la fermeture
 *
 * @events émis
 * - STATE_CHANGED: Émis lorsqu'une partie de l'état change
 * - STATE_ERROR: Émis lorsqu'une erreur se produit (chemin invalide, etc.)
 * - CONFIG_NEEDED: Demande de configuration initiale
 * - STATE_READY: Émis lorsque l'état est initialisé et prêt
 */

'use strict';

// Définir les types d'événements pour le gestionnaire d'état
const STATE_EVENT_TYPES = {
  STATE_GET: 'STATE:GET',
  STATE_SET: 'STATE:SET',
  STATE_UPDATE: 'STATE:UPDATE',
  STATE_RESET: 'STATE:RESET',
  STATE_SUBSCRIBE: 'STATE:SUBSCRIBE',
  STATE_UNSUBSCRIBE: 'STATE:UNSUBSCRIBE',
  STATE_VALUE: 'STATE:VALUE',
  STATE_CHANGED: 'STATE:CHANGED',
  STATE_ERROR: 'STATE:ERROR',
  STATE_READY: 'STATE:READY',
  CONFIG_NEEDED: 'CONFIG:NEEDED',
  APP_INITIALIZE: 'APP:INITIALIZE',
  APP_SHUTDOWN: 'APP:SHUTDOWN',
  CONFIG_LOADED: 'CONFIG:LOADED'
};

/**
 * StateManager - Gestionnaire d'état centralisé
 *
 * Exemple d'utilisation (via événements):
 * - Pour lire: émettre STATE_EVENT_TYPES.STATE_GET avec {path: 'downloads.active', requestId: 'unique-id'}
 * - Pour définir: émettre STATE_EVENT_TYPES.STATE_SET avec {path: 'settings.audioFormat', value: 'mp3'}
 * - Pour s'abonner: émettre STATE_EVENT_TYPES.STATE_SUBSCRIBE avec {path: 'downloads', callback: 'callback-id'}
 */
function StateManager() {
  // État privé, inaccessible directement de l'extérieur
  let state = {};
  let defaultState = {};
  let subscribers = {};
  let eventBus = null;

  /**
   * Initialise le gestionnaire d'état et s'enregistre auprès du bus d'événements
   * @param {Object} injectedEventBus - Bus d'événements central injecté
   */
  function initialize(injectedEventBus) {
    if (!injectedEventBus) {
      console.error("StateManager: Aucun bus d'événements fourni à l'initialisation");
      return;
    }

    eventBus = injectedEventBus;

    // État par défaut
    defaultState = {
      app: {
        version: '1.0.0',
        initialized: false,
        theme: 'dark',
        currentView: 'main'
      },
      downloads: {
        active: [],
        completed: [],
        failed: [],
        currentId: 0
      },
      settings: {
        downloadPath: '',
        audioFormat: 'mp3',
        audioQuality: 'high',
        maxConcurrentDownloads: 3,
        autoUpdateEnabled: true,
        addToLibraryEnabled: false
      },
      platforms: {
        youtube: { enabled: true },
        bandcamp: { enabled: true },
        soundcloud: { enabled: true },
        spotify: { enabled: true },
        tidal: {
          enabled: true,
          authenticated: false,
          tokenExpiry: null
        }
      },
      ui: {
        notifications: [],
        modals: {
          visible: false,
          type: null,
          data: null
        }
      }
    };

    // Initialisation de l'état avec les valeurs par défaut
    state = JSON.parse(JSON.stringify(defaultState));

    // Enregistrement des événements
    registerEventHandlers();

    // Notification que le module est prêt
    eventBus.publish(STATE_EVENT_TYPES.STATE_READY, {
      module: 'state-manager',
      timestamp: Date.now()
    });

    // Demande de la configuration initiale
    eventBus.publish(STATE_EVENT_TYPES.CONFIG_NEEDED, {
      requestedBy: 'state-manager',
      configKeys: ['settings', 'platforms']
    });
  }

  /**
   * Enregistre les gestionnaires d'événements pour réagir aux événements du système
   */
  function registerEventHandlers() {
    eventBus.subscribe(STATE_EVENT_TYPES.STATE_GET, handleGetState);
    eventBus.subscribe(STATE_EVENT_TYPES.STATE_SET, handleSetState);
    eventBus.subscribe(STATE_EVENT_TYPES.STATE_UPDATE, handleUpdateState);
    eventBus.subscribe(STATE_EVENT_TYPES.STATE_RESET, handleResetState);
    eventBus.subscribe(STATE_EVENT_TYPES.STATE_SUBSCRIBE, handleSubscribe);
    eventBus.subscribe(STATE_EVENT_TYPES.STATE_UNSUBSCRIBE, handleUnsubscribe);
    eventBus.subscribe(STATE_EVENT_TYPES.APP_INITIALIZE, handleAppInitialize);
    eventBus.subscribe(STATE_EVENT_TYPES.APP_SHUTDOWN, handleAppShutdown);
    eventBus.subscribe(STATE_EVENT_TYPES.CONFIG_LOADED, handleConfigLoaded);
  }

  /**
   * Récupère une valeur de l'état par son chemin
   * @param {Object} data - {path: string, requestId: string}
   */
  function handleGetState(data) {
    if (!data || !data.path) {
      publishError('PATH_REQUIRED', "Chemin requis pour la récupération d'état", data);
      return;
    }

    try {
      const value = getStateValue(data.path);

      // Réponse avec la valeur et l'ID de requête initial pour identification
      eventBus.publish(STATE_EVENT_TYPES.STATE_VALUE, {
        requestId: data.requestId,
        path: data.path,
        value: value ? JSON.parse(JSON.stringify(value)) : null // Copie profonde pour éviter les modifications directes
      });
    } catch (error) {
      publishError('INVALID_PATH', `Chemin d'état invalide: ${data.path}`, data);
    }
  }

  /**
   * Définit une valeur d'état à un chemin spécifié
   * @param {Object} data - {path: string, value: any}
   */
  function handleSetState(data) {
    if (!data || !data.path) {
      publishError('PATH_REQUIRED', "Chemin requis pour la définition d'état", data);
      return;
    }

    try {
      const oldValue = getStateValue(data.path);
      setStateValue(data.path, data.value);

      if (JSON.stringify(oldValue) !== JSON.stringify(data.value)) {
        notifySubscribers(data.path, data.value, oldValue);

        eventBus.publish(STATE_EVENT_TYPES.STATE_CHANGED, {
          path: data.path,
          oldValue: oldValue,
          newValue: data.value,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      publishError(
        'SET_STATE_ERROR',
        `Erreur lors de la définition de l'état: ${error.message}`,
        data
      );
    }
  }

  /**
   * Met à jour une partie de l'état par fusion avec l'objet fourni
   * @param {Object} data - {path: string, updates: Object}
   */
  function handleUpdateState(data) {
    if (!data || !data.path || !data.updates) {
      publishError('INVALID_UPDATE_DATA', 'Données de mise à jour invalides', data);
      return;
    }

    try {
      const currentValue = getStateValue(data.path);

      if (typeof currentValue !== 'object' || currentValue === null) {
        publishError('INVALID_UPDATE_TARGET', 'La cible de mise à jour doit être un objet', data);
        return;
      }

      // Création d'une copie profonde pour la mise à jour
      const newValue = JSON.parse(JSON.stringify(currentValue));

      // Fusion récursive des mises à jour
      deepMerge(newValue, data.updates);

      // Application de la mise à jour
      setStateValue(data.path, newValue);

      // Notification des changements
      notifySubscribers(data.path, newValue, currentValue);

      eventBus.publish(STATE_EVENT_TYPES.STATE_CHANGED, {
        path: data.path,
        oldValue: currentValue,
        newValue: newValue,
        timestamp: Date.now()
      });
    } catch (error) {
      publishError(
        'UPDATE_STATE_ERROR',
        `Erreur lors de la mise à jour de l'état: ${error.message}`,
        data
      );
    }
  }

  /**
   * Réinitialise l'état ou un segment à sa valeur par défaut
   * @param {Object} data - {path: string|null}
   */
  function handleResetState(data) {
    try {
      if (!data || !data.path) {
        // Réinitialisation complète
        const oldState = JSON.parse(JSON.stringify(state));
        state = JSON.parse(JSON.stringify(defaultState));

        eventBus.publish(STATE_EVENT_TYPES.STATE_CHANGED, {
          path: '',
          oldValue: oldState,
          newValue: state,
          timestamp: Date.now()
        });

        notifySubscribers('', state, oldState);
        return;
      }

      // Réinitialisation d'un segment spécifique
      const defaultValue = getStateValue(data.path, defaultState);
      const oldValue = getStateValue(data.path);

      setStateValue(data.path, JSON.parse(JSON.stringify(defaultValue)));

      eventBus.publish(STATE_EVENT_TYPES.STATE_CHANGED, {
        path: data.path,
        oldValue: oldValue,
        newValue: defaultValue,
        timestamp: Date.now()
      });

      notifySubscribers(data.path, defaultValue, oldValue);
    } catch (error) {
      publishError(
        'RESET_STATE_ERROR',
        `Erreur lors de la réinitialisation de l'état: ${error.message}`,
        data
      );
    }
  }

  /**
   * Abonne un module à des changements sur un chemin d'état
   * @param {Object} data - {path: string, callbackId: string, source: string}
   */
  function handleSubscribe(data) {
    if (!data || !data.path || !data.callbackId) {
      publishError('INVALID_SUBSCRIPTION', "Données d'abonnement invalides", data);
      return;
    }

    // Création du chemin d'abonnement s'il n'existe pas
    if (!subscribers[data.path]) {
      subscribers[data.path] = [];
    }

    // Vérification que l'abonnement n'existe pas déjà
    const existingSubscription = subscribers[data.path].find(
      (sub) => sub.callbackId === data.callbackId
    );

    if (!existingSubscription) {
      subscribers[data.path].push({
        callbackId: data.callbackId,
        source: data.source || 'unknown'
      });

      eventBus.publish(STATE_EVENT_TYPES.STATE_SUBSCRIPTION_ADDED, {
        path: data.path,
        callbackId: data.callbackId,
        source: data.source
      });
    }
  }

  /**
   * Désabonne un module des notifications de changement d'état
   * @param {Object} data - {path: string|null, callbackId: string}
   */
  function handleUnsubscribe(data) {
    if (!data || !data.callbackId) {
      publishError('INVALID_UNSUBSCRIPTION', 'ID de callback requis pour le désabonnement', data);
      return;
    }

    if (data.path) {
      // Désabonnement d'un chemin spécifique
      if (subscribers[data.path]) {
        subscribers[data.path] = subscribers[data.path].filter(
          (sub) => sub.callbackId !== data.callbackId
        );

        if (subscribers[data.path].length === 0) {
          delete subscribers[data.path];
        }
      }
    } else {
      // Désabonnement de tous les chemins pour ce callbackId
      Object.keys(subscribers).forEach((path) => {
        subscribers[path] = subscribers[path].filter((sub) => sub.callbackId !== data.callbackId);

        if (subscribers[path].length === 0) {
          delete subscribers[path];
        }
      });
    }

    eventBus.publish(STATE_EVENT_TYPES.STATE_SUBSCRIPTION_REMOVED, {
      path: data.path || 'all',
      callbackId: data.callbackId
    });
  }

  /**
   * Gère l'initialisation de l'application
   */
  function handleAppInitialize() {
    // Marquer l'application comme initialisée
    setStateValue('app.initialized', true);

    eventBus.publish(STATE_EVENT_TYPES.STATE_CHANGED, {
      path: 'app.initialized',
      oldValue: false,
      newValue: true,
      timestamp: Date.now()
    });
  }

  /**
   * Gère la fermeture de l'application
   */
  function handleAppShutdown() {
    // Enregistrement de l'état actuel si nécessaire
    eventBus.publish(STATE_EVENT_TYPES.CONFIG_SAVE, {
      module: 'state-manager',
      settings: getStateValue('settings'),
      platforms: getStateValue('platforms')
    });
  }

  /**
   * Traite la configuration chargée
   * @param {Object} data - Données de configuration
   */
  function handleConfigLoaded(data) {
    if (data.settings) {
      // Fusion des paramètres chargés avec les valeurs par défaut
      handleUpdateState({
        path: 'settings',
        updates: data.settings
      });
    }

    if (data.platforms) {
      handleUpdateState({
        path: 'platforms',
        updates: data.platforms
      });
    }
  }

  /**
   * Récupère une valeur de l'état par son chemin
   * @param {string} path - Chemin dot-notation (ex: 'downloads.active')
   * @param {Object} source - Source de l'état (état actuel par défaut)
   * @returns {any} La valeur à ce chemin
   */
  function getStateValue(path, source = state) {
    if (!path) return JSON.parse(JSON.stringify(source));

    const parts = path.split('.');
    let current = source;

    for (const part of parts) {
      if (current === undefined || current === null) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  /**
   * Définit une valeur dans l'état
   * @param {string} path - Chemin dot-notation
   * @param {any} value - Valeur à définir
   * @returns {Object} Le nouvel état
   */
  function setStateValue(path, value) {
    if (!path) {
      // Remplacement complet de l'état (rare)
      if (typeof value === 'object' && value !== null) {
        state = JSON.parse(JSON.stringify(value));
        return state;
      }
      throw new Error("Valeur invalide pour le remplacement complet de l'état");
    }

    const parts = path.split('.');
    let current = state;

    // Naviguer jusqu'au parent de la propriété cible
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];

      if (current[part] === undefined) {
        current[part] = {};
      } else if (typeof current[part] !== 'object' || current[part] === null) {
        current[part] = {};
      }

      current = current[part];
    }

    // Définir la valeur sur la propriété cible
    const lastPart = parts[parts.length - 1];

    // Si la valeur est un objet, on crée une copie profonde pour éviter les références
    if (typeof value === 'object' && value !== null) {
      current[lastPart] = JSON.parse(JSON.stringify(value));
    } else {
      current[lastPart] = value;
    }

    return state;
  }

  /**
   * Fusion profonde de deux objets
   * @param {Object} target - Objet cible
   * @param {Object} source - Objet source
   * @returns {Object} L'objet cible modifié
   */
  function deepMerge(target, source) {
    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        if (
          typeof source[key] === 'object' &&
          source[key] !== null &&
          typeof target[key] === 'object' &&
          target[key] !== null
        ) {
          deepMerge(target[key], source[key]);
        } else {
          target[key] = source[key];
        }
      }
    }
    return target;
  }

  /**
   * Notifie les abonnés des changements d'état
   * @param {string} path - Chemin modifié
   * @param {any} newValue - Nouvelle valeur
   * @param {any} oldValue - Ancienne valeur
   */
  function notifySubscribers(path, newValue, oldValue) {
    // Notification pour les abonnés exacts
    if (subscribers[path]) {
      subscribers[path].forEach((subscriber) => {
        eventBus.publish(STATE_EVENT_TYPES.STATE_NOTIFY, {
          callbackId: subscriber.callbackId,
          path: path,
          oldValue: oldValue,
          newValue: newValue
        });
      });
    }

    // Notification pour les abonnés des chemins parents
    if (path) {
      const parts = path.split('.');
      for (let i = parts.length - 1; i > 0; i--) {
        const parentPath = parts.slice(0, i).join('.');

        if (subscribers[parentPath]) {
          subscribers[parentPath].forEach((subscriber) => {
            eventBus.publish(STATE_EVENT_TYPES.STATE_NOTIFY, {
              callbackId: subscriber.callbackId,
              path: path, // Chemin complet qui a changé
              parentPath: parentPath, // Chemin parent auquel ils sont abonnés
              oldValue: oldValue,
              newValue: newValue
            });
          });
        }
      }
    }

    // Notification aux abonnés globaux (abonnés à '')
    if (subscribers['']) {
      subscribers[''].forEach((subscriber) => {
        eventBus.publish(STATE_EVENT_TYPES.STATE_NOTIFY, {
          callbackId: subscriber.callbackId,
          path: path,
          oldValue: oldValue,
          newValue: newValue
        });
      });
    }
  }

  /**
   * Publie une erreur sur le bus d'événements
   * @param {string} code - Code d'erreur
   * @param {string} message - Message d'erreur
   * @param {Object} data - Données contextuelles
   */
  function publishError(code, message, data) {
    if (!eventBus) return;

    eventBus.publish(STATE_EVENT_TYPES.STATE_ERROR, {
      code: code,
      message: message,
      data: data,
      module: 'state-manager',
      timestamp: Date.now()
    });
  }

  // Note: La fonction pathToRegExp a été supprimée car elle n'était pas utilisée

  // Interface publique
  return {
    initialize,
    get: getStateValue,
    set: setStateValue,
    update: (obj) => {
      if (typeof obj !== 'object' || obj === null) {
        throw new Error('Update requires an object');
      }

      // Mise à jour de l'état avec l'objet fourni
      Object.keys(obj).forEach((key) => {
        setStateValue(key, obj[key]);
      });
    },
    reset: () => {
      // Réinitialisation de l'état avec les valeurs par défaut
      state = JSON.parse(JSON.stringify(defaultState));
    }
  };
}

// Création de l'instance unique (singleton)
const stateManager = StateManager();

// Exportation de l'objet avec toutes les méthodes nécessaires pour les tests
module.exports = {
  initialize: stateManager.initialize,
  get: stateManager.get,
  set: stateManager.set,
  update: stateManager.update,
  reset: stateManager.reset
};
