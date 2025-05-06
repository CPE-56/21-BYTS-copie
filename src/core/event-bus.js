/**
 * @fileoverview EventBus - Bus d'événements amélioré avec traçabilité pour 21 BYTS
 * @description Ce module implémente un bus d'événements centralisé pour la communication entre modules
 * sans dépendances directes. Il fournit des mécanismes d'abonnement/publication (pub/sub) avancés
 * avec traçabilité, débogage et gestion des erreurs.
 *
 * @module core/event-bus
 * @requires electron
 *
 * @example
 * // Comment ce module est utilisé par d'autres composants:
 * // (via événements, pas d'importation directe)
 *
 * // S'abonner à un événement
 * window.appEvents.subscribe('download:start', (data) => {
 *   console.log('Téléchargement démarré:', data);
 * });
 *
 * // Publier un événement
 * window.appEvents.publish('download:start', { url: 'https://example.com/audio.mp3' });
 */

const { ipcRenderer } = require('electron');

/**
 * Classe EventBus - Implémente le bus d'événements central de l'application
 */
class EventBus {
  /**
   * Initialise le bus d'événements
   */
  constructor() {
    this.subscribers = new Map();
    this.eventHistory = [];
    this.maxHistoryLength = 1000;
    this.debugMode = false;
    this.logger = null;
    this.errorHandler = null;

    // Identifiant unique pour ce bus d'événements (utile pour debug)
    this.id = `event-bus-${Date.now()}`;

    // Initialiser le gestionnaire d'événements
    this.init();
  }

  /**
   * Initialise le bus d'événements et s'enregistre pour les événements système
   * @private
   */
  init() {
    // Écouter les événements de configuration
    this.subscribe('config:updated', this.handleConfigUpdate.bind(this));

    // Écouter les événements système d'Electron
    const systemEventHandler = (_, eventData) => {
      this.publish('system:event', eventData);
    };
    ipcRenderer.on('system:event', systemEventHandler);

    // Stocker les références aux gestionnaires d'événements pour pouvoir les nettoyer
    this._eventHandlers = {
      systemEvent: systemEventHandler,
      windowError: this._handleWindowError.bind(this),
      unhandledRejection: this._handleUnhandledRejection.bind(this)
    };

    // Publier un événement indiquant que le bus d'événements est prêt
    setTimeout(() => {
      this.publish('core:event-bus:ready', { id: this.id });
    }, 0);

    // Intercepter les erreurs non capturées et les publier sur le bus d'événements
    window.addEventListener('error', this._eventHandlers.windowError);

    // Intercepter les rejets de promesses non gérés
    window.addEventListener('unhandledrejection', this._eventHandlers.unhandledRejection);

    // S'abonner à l'événement de fermeture de l'application pour nettoyer
    this.subscribe('APP_BEFORE_QUIT', this._cleanup.bind(this));
  }

  /**
   * Gestionnaire d'erreurs de fenêtre
   * @param {ErrorEvent} error - L'événement d'erreur
   * @private
   */
  _handleWindowError(error) {
    this.publish('core:error', {
      source: 'window',
      error: {
        message: error.message,
        stack: error.error ? error.error.stack : null
      }
    });
  }

  /**
   * Gestionnaire de rejets de promesses non gérés
   * @param {PromiseRejectionEvent} event - L'événement de rejet
   * @private
   */
  _handleUnhandledRejection(event) {
    this.publish('core:error', {
      source: 'promise',
      error: {
        message: event.reason ? event.reason.message : 'Rejet de promesse non géré',
        stack: event.reason ? event.reason.stack : null
      }
    });
  }

  /**
   * Nettoie les gestionnaires d'événements lors de la fermeture de l'application
   * @private
   */
  _cleanup() {
    if (this._eventHandlers) {
      // Supprimer les écouteurs d'événements
      window.removeEventListener('error', this._eventHandlers.windowError);
      window.removeEventListener('unhandledrejection', this._eventHandlers.unhandledRejection);
      ipcRenderer.removeListener('system:event', this._eventHandlers.systemEvent);

      console.log("[EventBus] Nettoyage des gestionnaires d'événements effectué");
    }
  }

  /**
   * Gère les mises à jour de configuration pour le bus d'événements
   * @param {Object} config - Objet de configuration
   * @private
   */
  handleConfigUpdate(config) {
    if (config && config.eventBus) {
      this.debugMode = config.eventBus.debugMode || false;
      this.maxHistoryLength = config.eventBus.maxHistoryLength || 1000;
    }
  }

  /**
   * S'abonne à un événement
   * @param {string} eventType - Type d'événement à écouter
   * @param {Function} callback - Fonction à appeler lorsque l'événement est publié
   * @param {Object} [options] - Options supplémentaires
   * @param {boolean} [options.once=false] - Si vrai, se désabonne après la première exécution
   * @param {Object} [options.filter] - Filtre pour ne recevoir que certains événements
   * @returns {string} ID d'abonnement unique pour le désabonnement
   * @public
   */
  subscribe(eventType, callback, options = {}) {
    if (!eventType || typeof callback !== 'function') {
      this.publish('core:error', {
        source: 'event-bus',
        error: new Error("Type d'événement et callback requis pour subscribe")
      });
      return null;
    }

    // Créer un ID unique pour cet abonnement
    const subscriptionId = `${eventType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Map());
    }

    this.subscribers.get(eventType).set(subscriptionId, {
      callback,
      options
    });

    if (this.debugMode) {
      this.logEvent('subscribe', { eventType, subscriptionId });
    }

    return subscriptionId;
  }

  /**
   * S'abonne à un événement pour une seule exécution
   * @param {string} eventType - Type d'événement à écouter
   * @param {Function} callback - Fonction à appeler lorsque l'événement est publié
   * @returns {string} ID d'abonnement unique
   * @public
   */
  once(eventType, callback) {
    return this.subscribe(eventType, callback, { once: true });
  }

  /**
   * Se désabonne d'un événement spécifique
   * @param {string} subscriptionId - ID d'abonnement retourné par subscribe
   * @returns {boolean} Vrai si désabonnement réussi
   * @public
   */
  unsubscribe(subscriptionId) {
    if (!subscriptionId) {
      return false;
    }

    // Parcourir tous les types d'événements pour trouver l'abonnement
    for (const [eventType, subscribers] of this.subscribers.entries()) {
      if (subscribers.has(subscriptionId)) {
        subscribers.delete(subscriptionId);

        // Si plus aucun abonné pour ce type, nettoyer la Map
        if (subscribers.size === 0) {
          this.subscribers.delete(eventType);
        }

        if (this.debugMode) {
          this.logEvent('unsubscribe', { eventType, subscriptionId });
        }

        return true;
      }
    }

    return false;
  }

  /**
   * Publie un événement à tous les abonnés
   * @param {string} eventType - Type d'événement à publier
   * @param {*} data - Données à transmettre aux abonnés
   * @param {Object} [options] - Options de publication
   * @param {boolean} [options.sync=false] - Si vrai, exécute les callbacks de manière synchrone
   * @returns {boolean} Vrai si au moins un abonné a reçu l'événement
   * @public
   */
  publish(eventType, data = {}, options = {}) {
    const timestamp = Date.now();
    const eventId = `${eventType}-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;

    // Créer l'objet événement
    const event = {
      id: eventId,
      type: eventType,
      data,
      timestamp,
      source: options.source || 'unknown'
    };

    // Ajouter à l'historique des événements
    this.addToHistory(event);

    // Si aucun abonné, terminer
    if (!this.subscribers.has(eventType)) {
      if (this.debugMode) {
        this.logEvent('publish-no-subscribers', { eventType, eventId });
      }
      return false;
    }

    const subscribers = this.subscribers.get(eventType);
    let subscriberCount = 0;

    // Copier les abonnés pour éviter les modifications durant l'itération
    const subscribersSnapshot = Array.from(subscribers.entries());

    for (const [subscriptionId, subscription] of subscribersSnapshot) {
      const { callback, options: subOptions } = subscription;

      // Vérifier si l'événement correspond aux filtres
      if (subOptions.filter && !this.matchesFilter(data, subOptions.filter)) {
        continue;
      }

      subscriberCount++;

      // Exécuter le callback
      const execCallback = () => {
        try {
          // Clone des données pour éviter les modifications par références
          const eventDataCopy = JSON.parse(JSON.stringify(data));
          callback(eventDataCopy, {
            eventId,
            eventType,
            timestamp
          });

          // Si abonnement unique, désabonner
          if (subOptions.once) {
            this.unsubscribe(subscriptionId);
          }
        } catch (error) {
          this.handleCallbackError(error, eventType, subscriptionId);
        }
      };

      // Exécution synchrone ou asynchrone
      if (options.sync) {
        execCallback();
      } else {
        setTimeout(execCallback, 0);
      }
    }

    if (this.debugMode) {
      this.logEvent('publish', {
        eventType,
        eventId,
        subscriberCount,
        dataSize: JSON.stringify(data).length
      });
    }

    return subscriberCount > 0;
  }

  /**
   * Vérifie si les données correspondent au filtre
   * @param {Object} data - Données de l'événement
   * @param {Object} filter - Critères de filtrage
   * @returns {boolean} Vrai si les données correspondent au filtre
   * @private
   */
  matchesFilter(data, filter) {
    // Implémentation simple: tous les champs du filtre doivent correspondre
    for (const [key, value] of Object.entries(filter)) {
      if (data[key] !== value) {
        return false;
      }
    }
    return true;
  }

  /**
   * Gère les erreurs dans les callbacks d'abonnés
   * @param {Error} error - Erreur survenue
   * @param {string} eventType - Type d'événement
   * @param {string} subscriptionId - ID d'abonnement
   * @private
   */
  handleCallbackError(error, eventType, subscriptionId) {
    const errorEvent = {
      source: 'event-bus',
      error: {
        message: error.message,
        stack: error.stack
      },
      context: {
        eventType,
        subscriptionId
      }
    };

    // Publier l'erreur sur le bus d'événements (sans créer de boucle)
    if (eventType !== 'core:error') {
      this.publish('core:error', errorEvent, { sync: true });
    }

    // Logging de l'erreur en console pour debug immédiat
    console.error(`[EventBus] Erreur dans callback pour ${eventType}:`, error);
  }

  /**
   * Ajoute un événement à l'historique
   * @param {Object} event - Événement à ajouter
   * @private
   */
  addToHistory(event) {
    this.eventHistory.push(event);

    // Limiter la taille de l'historique
    if (this.eventHistory.length > this.maxHistoryLength) {
      this.eventHistory.shift();
    }
  }

  /**
   * Enregistre un événement de debug
   * @param {string} action - Action effectuée
   * @param {Object} details - Détails de l'action
   * @private
   */
  logEvent(action, details) {
    const logEntry = {
      time: new Date().toISOString(),
      action,
      details
    };

    console.debug(`[EventBus] ${action}:`, details);

    // Si un logger est configuré, l'utiliser
    if (this.logger && typeof this.logger.log === 'function') {
      this.logger.log('debug', 'event-bus', logEntry);
    }
  }

  /**
   * Récupère l'historique des événements
   * @returns {Array} Historique des événements
   * @public
   */
  getEventHistory() {
    return [...this.eventHistory];
  }

  /**
   * Efface l'historique des événements
   * @public
   */
  clearEventHistory() {
    this.eventHistory = [];
  }

  /**
   * Active ou désactive le mode debug
   * @param {boolean} enabled - Si vrai, active le mode debug
   * @public
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
    this.publish('core:event-bus:debug-mode-changed', { enabled });
  }

  /**
   * Configure le logger pour les événements de debug
   * @param {Object} logger - Instance de logger
   * @public
   */
  setLogger(logger) {
    this.logger = logger;
  }
}

// Singleton: une seule instance d'EventBus pour toute l'application
let eventBusInstance = null;

/**
 * Initialise et retourne l'instance unique d'EventBus
 * @returns {EventBus} Instance d'EventBus
 */
function initialize() {
  if (!eventBusInstance) {
    eventBusInstance = new EventBus();

    // Exposer le bus d'événements globalement pour que tous les modules puissent y accéder
    // sans avoir besoin d'importations
    window.appEvents = eventBusInstance;

    console.info(`[EventBus] Initialized with ID: ${eventBusInstance.id}`);
  }

  return eventBusInstance;
}

// Auto-initialisation lors du chargement
initialize();

// Module exports (principalement pour les tests unitaires)
module.exports = {
  getInstance: () => eventBusInstance || initialize()
};
