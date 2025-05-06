/**
 * @fileoverview Module de limitation d'événements pour l'application 21 BYTS
 *
 * Ce module permet de limiter la fréquence des événements sur le bus d'événements
 * afin d'éviter une surcharge du système lors d'événements à haute fréquence
 * (comme les mises à jour de progression des téléchargements).
 *
 * Il implémente différentes stratégies de limitation :
 * - Débounce : n'émet qu'après un délai d'inactivité
 * - Throttle : limite à une fréquence maximale
 * - Batch : regroupe plusieurs événements en un seul
 * - Sample : ne transmet qu'un échantillon représentatif
 *
 * Conformément à l'architecture "Single File Component", ce module ne dépend
 * d'aucun autre module interne et communique exclusivement via le bus d'événements.
 *
 * @module utils/event-throttler
 *
 * @events
 * ÉCOUTE:
 * - APP:READY: Initialise le throttler lorsque l'application est prête
 * - CONFIG:UPDATED: Met à jour la configuration du throttler
 * - THROTTLER:REGISTER: Enregistre un nouvel événement à limiter
 * - THROTTLER:UNREGISTER: Désenregistre un événement
 * - THROTTLER:PAUSE: Met en pause toutes les limitations
 * - THROTTLER:RESUME: Reprend les limitations
 * - APP:SHUTTING_DOWN: Nettoie les ressources
 *
 * INTERCEPTE ET RÉGULE:
 * - Tous les événements enregistrés pour la limitation
 *
 * ÉMET:
 * - THROTTLER:REGISTERED: Confirmation d'enregistrement d'une limitation
 * - THROTTLER:UNREGISTERED: Confirmation de désenregistrement
 * - THROTTLER:STATUS: Statut actuel des limitations
 * - THROTTLER:STATS: Statistiques sur les événements traités
 * - ERROR: En cas d'erreur dans le module
 *
 * @example
 * // Enregistrement d'une limitation via le bus d'événements:
 * eventBus.publish('THROTTLER:REGISTER', {
 *   sourceEvent: 'DOWNLOAD:ITEM_PROGRESS',
 *   targetEvent: 'DOWNLOAD:ITEM_PROGRESS_THROTTLED',
 *   strategy: 'throttle',
 *   options: {
 *     interval: 500 // Limiter à un événement toutes les 500ms
 *   }
 * });
 */

'use strict';

/**
 * Event Throttler - Module de limitation de la fréquence des événements
 */
function EventThrottler() {
  // Bus d'événements central
  let eventBus = null;

  // Référence aux types d'événements standards
  // eslint-disable-next-line no-unused-vars
  let EVENT_TYPES = null;

  // Référence aux codes d'erreur standards
  let ERROR_CODES = null;

  // Configuration par défaut
  const DEFAULT_CONFIG = {
    enabled: true,
    defaultThrottleInterval: 500, // ms
    defaultDebounceDelay: 300, // ms
    defaultBatchSize: 10, // événements
    defaultBatchInterval: 1000, // ms
    defaultSampleRate: 0.1, // 10%
    maxLimitersPerEvent: 3 // Nombre max de limiteurs par type d'événement
  };

  // Configuration active
  let config = { ...DEFAULT_CONFIG };

  // Registre des limiteurs actifs
  // Structure: { sourceEvent: [{ targetEvent, strategy, options, state, timers, stats }] }
  const limiters = new Map();

  // État global du module
  let state = {
    initialized: false,
    paused: false,
    startTime: Date.now()
  };

  /**
   * Initialise le module et s'enregistre auprès du bus d'événements
   * @param {Object} injectedEventBus - Bus d'événements central
   * @param {Object} eventTypes - Types d'événements standardisés
   * @param {Object} errorCodes - Codes d'erreur standardisés
   */
  function initialize(injectedEventBus, eventTypes, errorCodes) {
    if (!injectedEventBus) {
      console.error("EventThrottler: EventBus est requis pour l'initialisation");
      return;
    }

    eventBus = injectedEventBus;
    EVENT_TYPES = eventTypes || {};
    ERROR_CODES = errorCodes || {};

    // S'abonner aux événements système
    registerSystemEvents();

    state.initialized = true;
    state.startTime = Date.now();

    // Publier un événement d'info
    publishInfo('Module EventThrottler initialisé');
  }

  /**
   * S'abonne aux événements système nécessaires au fonctionnement du module
   */
  function registerSystemEvents() {
    // Événements d'initialisation et de configuration
    eventBus.subscribe('APP:READY', onAppReady);
    eventBus.subscribe('CONFIG:UPDATED', onConfigUpdated);

    // Gestion des limiteurs
    eventBus.subscribe('THROTTLER:REGISTER', onRegisterLimiter);
    eventBus.subscribe('THROTTLER:UNREGISTER', onUnregisterLimiter);

    // Contrôle de l'état
    eventBus.subscribe('THROTTLER:PAUSE', onPauseThrottler);
    eventBus.subscribe('THROTTLER:RESUME', onResumeThrottler);
    eventBus.subscribe('THROTTLER:GET_STATUS', onGetStatus);

    // Nettoyage à la fermeture
    eventBus.subscribe('APP:SHUTTING_DOWN', cleanup);
  }

  /**
   * Gère l'événement d'initialisation de l'application
   */
  function onAppReady() {
    // Demander la configuration
    eventBus.publish('CONFIG:GET', {
      key: 'eventThrottler',
      requestId: 'event-throttler-init'
    });

    publishInfo('EventThrottler prêt');
  }

  /**
   * Gère les mises à jour de configuration
   * @param {Object} data - Données de configuration mises à jour
   */
  function onConfigUpdated(data) {
    // Vérifier si les données concernent ce module
    if (data && data.eventThrottler) {
      const throttlerConfig = data.eventThrottler;

      // Mettre à jour la configuration
      config = {
        ...config,
        ...throttlerConfig
      };

      publishInfo('Configuration mise à jour', config);
    }
  }

  /**
   * Gère l'enregistrement d'un nouveau limiteur d'événements
   * @param {Object} data - Données du limiteur à enregistrer
   */
  function onRegisterLimiter(data) {
    try {
      if (!data || !data.sourceEvent || !data.strategy) {
        throw new Error('Données incomplètes: sourceEvent et strategy sont requis');
      }

      const sourceEvent = data.sourceEvent;
      const targetEvent = data.targetEvent || `${sourceEvent}_THROTTLED`;
      const strategy = data.strategy.toLowerCase();

      // Vérifier que la stratégie est valide
      if (!['throttle', 'debounce', 'batch', 'sample'].includes(strategy)) {
        throw new Error(`Stratégie invalide: ${strategy}`);
      }

      // Obtenir ou créer la liste des limiteurs pour cet événement source
      if (!limiters.has(sourceEvent)) {
        limiters.set(sourceEvent, []);
      }

      const eventLimiters = limiters.get(sourceEvent);

      // Vérifier si on n'a pas atteint le nombre maximum de limiteurs pour cet événement
      if (eventLimiters.length >= config.maxLimitersPerEvent) {
        throw new Error(`Nombre maximum de limiteurs atteint pour ${sourceEvent}`);
      }

      // Vérifier si un limiteur avec le même targetEvent existe déjà
      const existingIndex = eventLimiters.findIndex((l) => l.targetEvent === targetEvent);
      if (existingIndex !== -1) {
        // Remplacer le limiteur existant
        unsubscribeFromSourceEvent(sourceEvent, eventLimiters[existingIndex]);
        eventLimiters.splice(existingIndex, 1);
      }

      // Créer les options en fonction de la stratégie
      const options = createStrategyOptions(strategy, data.options || {});

      // Créer le limiteur
      const limiter = {
        targetEvent,
        strategy,
        options,
        state: {
          active: true,
          lastEmit: 0,
          queue: [],
          subscription: null
        },
        timers: {},
        stats: {
          received: 0,
          emitted: 0,
          dropped: 0,
          lastEvent: null
        }
      };

      // Ajouter le limiteur à la liste
      eventLimiters.push(limiter);

      // S'abonner à l'événement source
      subscribeToSourceEvent(sourceEvent, limiter);

      // Notifier l'enregistrement réussi
      eventBus.publish('THROTTLER:REGISTERED', {
        sourceEvent,
        targetEvent,
        strategy,
        options
      });

      publishInfo(`Limiteur enregistré: ${sourceEvent} -> ${targetEvent} (${strategy})`, options);
    } catch (error) {
      publishError('REGISTER_LIMITER_FAILED', error.message);
    }
  }

  /**
   * Crée les options appropriées pour la stratégie choisie
   * @param {string} strategy - Stratégie de limitation
   * @param {Object} userOptions - Options fournies par l'utilisateur
   * @returns {Object} Options complétées avec les valeurs par défaut
   */
  function createStrategyOptions(strategy, userOptions) {
    const options = { ...userOptions };

    switch (strategy) {
      case 'throttle':
        if (!options.interval) options.interval = config.defaultThrottleInterval;
        options.leading = options.leading !== undefined ? options.leading : true;
        options.trailing = options.trailing !== undefined ? options.trailing : true;
        break;

      case 'debounce':
        if (!options.delay) options.delay = config.defaultDebounceDelay;
        options.leading = options.leading !== undefined ? options.leading : false;
        options.trailing = options.trailing !== undefined ? options.trailing : true;
        break;

      case 'batch':
        if (!options.maxSize) options.maxSize = config.defaultBatchSize;
        if (!options.maxInterval) options.maxInterval = config.defaultBatchInterval;
        break;

      case 'sample':
        if (!options.rate) options.rate = config.defaultSampleRate;
        options.timeWindow = options.timeWindow !== undefined ? options.timeWindow : true;
        break;
    }

    return options;
  }

  /**
   * S'abonne à un événement source pour un limiteur
   * @param {string} sourceEvent - Type d'événement source
   * @param {Object} limiter - Configuration du limiteur
   */
  function subscribeToSourceEvent(sourceEvent, limiter) {
    // Fonction de gestion d'événement avec la stratégie appropriée
    const eventHandler = createStrategyHandler(sourceEvent, limiter);

    // S'abonner à l'événement source
    eventBus.subscribe(sourceEvent, eventHandler);

    // Stocker le handler pour pouvoir se désabonner plus tard
    limiter.state.subscription = eventHandler;
  }

  /**
   * Crée un gestionnaire d'événement selon la stratégie choisie
   * @param {string} sourceEvent - Type d'événement source
   * @param {Object} limiter - Configuration du limiteur
   * @returns {Function} Fonction de gestion d'événement
   */
  function createStrategyHandler(sourceEvent, limiter) {
    const { strategy, stats } = limiter;

    switch (strategy) {
      case 'throttle':
        return (eventData) => handleThrottleStrategy(sourceEvent, limiter, eventData);

      case 'debounce':
        return (eventData) => handleDebounceStrategy(sourceEvent, limiter, eventData);

      case 'batch':
        return (eventData) => handleBatchStrategy(sourceEvent, limiter, eventData);

      case 'sample':
        return (eventData) => handleSampleStrategy(sourceEvent, limiter, eventData);

      default:
        // Fallback, ne devrait jamais arriver grâce à la validation
        return (eventData) => {
          stats.received++;
          emit(limiter.targetEvent, eventData);
          stats.emitted++;
        };
    }
  }

  /**
   * Gère la stratégie "throttle" - limite à une fréquence maximale
   * @param {string} sourceEvent - Type d'événement source
   * @param {Object} limiter - Configuration du limiteur
   * @param {*} eventData - Données de l'événement
   */
  function handleThrottleStrategy(sourceEvent, limiter, eventData) {
    const { options, state, timers, stats } = limiter;
    const now = Date.now();

    // Incrémenter le compteur d'événements reçus
    stats.received++;
    stats.lastEvent = {
      timestamp: now,
      data: eventData
    };

    // Si en pause, ignorer
    if (state.paused || !config.enabled) {
      stats.dropped++;
      return;
    }

    const elapsed = now - state.lastEmit;

    // Si c'est le premier événement ou si l'intervalle s'est écoulé
    if (state.lastEmit === 0 || elapsed >= options.interval) {
      // Émettre immédiatement (leading edge)
      if (options.leading) {
        emit(limiter.targetEvent, eventData);
        stats.emitted++;
        state.lastEmit = now;
      } else {
        // Programmer l'émission après l'intervalle (trailing edge)
        if (options.trailing) {
          clearTimeout(timers.throttleTimer);
          timers.throttleTimer = setTimeout(() => {
            emit(limiter.targetEvent, eventData);
            stats.emitted++;
            state.lastEmit = Date.now();
          }, options.interval);
        }
      }
    } else if (options.trailing) {
      // Programmer l'émission après l'intervalle restant
      clearTimeout(timers.throttleTimer);
      timers.throttleTimer = setTimeout(() => {
        emit(limiter.targetEvent, eventData);
        stats.emitted++;
        state.lastEmit = Date.now();
      }, options.interval - elapsed);
    } else {
      // L'événement est ignoré
      stats.dropped++;
    }
  }

  /**
   * Gère la stratégie "debounce" - n'émet qu'après un délai d'inactivité
   * @param {string} sourceEvent - Type d'événement source
   * @param {Object} limiter - Configuration du limiteur
   * @param {*} eventData - Données de l'événement
   */
  function handleDebounceStrategy(sourceEvent, limiter, eventData) {
    const { options, state, timers, stats } = limiter;
    const now = Date.now();

    // Incrémenter le compteur d'événements reçus
    stats.received++;
    stats.lastEvent = {
      timestamp: now,
      data: eventData
    };

    // Si en pause, ignorer
    if (state.paused || !config.enabled) {
      stats.dropped++;
      return;
    }

    // Effacer le timer existant
    clearTimeout(timers.debounceTimer);

    // Si c'est le premier événement et que leading est activé
    if (state.lastEmit === 0 && options.leading) {
      emit(limiter.targetEvent, eventData);
      stats.emitted++;
      state.lastEmit = now;

      // Empêcher l'émission trailing edge immédiatement après
      timers.debounceTimer = setTimeout(() => {
        state.lastEmit = Date.now();
      }, options.delay);
    } else if (options.trailing) {
      // Programmer l'émission après le délai
      timers.debounceTimer = setTimeout(() => {
        emit(limiter.targetEvent, eventData);
        stats.emitted++;
        state.lastEmit = Date.now();
      }, options.delay);
    } else {
      // L'événement est ignoré
      stats.dropped++;
    }
  }

  /**
   * Gère la stratégie "batch" - regroupe plusieurs événements en un seul
   * @param {string} sourceEvent - Type d'événement source
   * @param {Object} limiter - Configuration du limiteur
   * @param {*} eventData - Données de l'événement
   */
  function handleBatchStrategy(sourceEvent, limiter, eventData) {
    const { options, state, timers, stats } = limiter;
    const now = Date.now();

    // Incrémenter le compteur d'événements reçus
    stats.received++;
    stats.lastEvent = {
      timestamp: now,
      data: eventData
    };

    // Si en pause, ignorer
    if (state.paused || !config.enabled) {
      stats.dropped++;
      return;
    }

    // Ajouter à la file d'attente
    state.queue.push({
      timestamp: now,
      data: eventData
    });

    // Si c'est le premier événement du batch, démarrer le timer
    if (state.queue.length === 1) {
      timers.batchTimer = setTimeout(() => {
        flushBatch(limiter);
      }, options.maxInterval);
    }

    // Si la taille maximale est atteinte, envoyer le batch immédiatement
    if (state.queue.length >= options.maxSize) {
      clearTimeout(timers.batchTimer);
      flushBatch(limiter);
    }
  }

  /**
   * Envoie le batch actuel et vide la file d'attente
   * @param {Object} limiter - Configuration du limiteur
   */
  function flushBatch(limiter) {
    const { state, stats } = limiter;

    if (state.queue.length === 0) {
      return;
    }

    const batchData = {
      count: state.queue.length,
      items: [...state.queue],
      timestamp: Date.now()
    };

    // Vider la file d'attente avant d'émettre pour éviter des boucles
    state.queue = [];

    // Émettre le batch
    emit(limiter.targetEvent, batchData);

    // Mettre à jour les statistiques
    stats.emitted++;
    stats.lastEmit = Date.now();
  }

  /**
   * Gère la stratégie "sample" - ne transmet qu'un échantillon représentatif
   * @param {string} sourceEvent - Type d'événement source
   * @param {Object} limiter - Configuration du limiteur
   * @param {*} eventData - Données de l'événement
   */
  function handleSampleStrategy(sourceEvent, limiter, eventData) {
    const { options, state, stats } = limiter;
    const now = Date.now();

    // Incrémenter le compteur d'événements reçus
    stats.received++;
    stats.lastEvent = {
      timestamp: now,
      data: eventData
    };

    // Si en pause, ignorer
    if (state.paused || !config.enabled) {
      stats.dropped++;
      return;
    }

    let shouldEmit = false;

    if (options.timeWindow) {
      // Vérifier si l'événement tombe dans la fenêtre temporelle d'échantillonnage
      // Formule: maintenant % (1/taux) < 1 (en secondes)
      const windowSize = 1000 / options.rate; // En millisecondes
      shouldEmit = now % windowSize < 1000;
    } else {
      // Échantillonnage aléatoire
      shouldEmit = Math.random() < options.rate;
    }

    if (shouldEmit) {
      emit(limiter.targetEvent, eventData);
      stats.emitted++;
      state.lastEmit = now;
    } else {
      stats.dropped++;
    }
  }

  /**
   * Émet un événement sur le bus d'événements
   * @param {string} eventType - Type d'événement à émettre
   * @param {*} eventData - Données d'événement
   */
  function emit(eventType, eventData) {
    if (!eventBus) return;

    try {
      eventBus.publish(eventType, eventData);
    } catch (error) {
      publishError('EVENT_EMIT_FAILED', error.message);
    }
  }

  /**
   * Gère le désenregistrement d'un limiteur
   * @param {Object} data - Données du limiteur à désenregistrer
   */
  function onUnregisterLimiter(data) {
    try {
      if (!data || (!data.sourceEvent && !data.targetEvent)) {
        throw new Error('Données incomplètes: sourceEvent ou targetEvent requis');
      }

      const sourceEvent = data.sourceEvent;
      const targetEvent = data.targetEvent;

      if (sourceEvent) {
        // Désenregistrer tous les limiteurs pour cet événement source
        if (limiters.has(sourceEvent)) {
          const eventLimiters = limiters.get(sourceEvent);

          // Si targetEvent est spécifié, désenregistrer seulement ce limiteur
          if (targetEvent) {
            const limiterIndex = eventLimiters.findIndex((l) => l.targetEvent === targetEvent);

            if (limiterIndex !== -1) {
              const limiter = eventLimiters[limiterIndex];
              unsubscribeFromSourceEvent(sourceEvent, limiter);
              eventLimiters.splice(limiterIndex, 1);

              eventBus.publish('THROTTLER:UNREGISTERED', {
                sourceEvent,
                targetEvent
              });
            }
          } else {
            // Désenregistrer tous les limiteurs pour cet événement
            eventLimiters.forEach((limiter) => {
              unsubscribeFromSourceEvent(sourceEvent, limiter);

              eventBus.publish('THROTTLER:UNREGISTERED', {
                sourceEvent,
                targetEvent: limiter.targetEvent
              });
            });

            limiters.delete(sourceEvent);
          }
        }
      } else if (targetEvent) {
        // Rechercher le targetEvent dans tous les limiteurs
        for (const [srcEvent, eventLimiters] of limiters.entries()) {
          const limiterIndex = eventLimiters.findIndex((l) => l.targetEvent === targetEvent);

          if (limiterIndex !== -1) {
            const limiter = eventLimiters[limiterIndex];
            unsubscribeFromSourceEvent(srcEvent, limiter);
            eventLimiters.splice(limiterIndex, 1);

            eventBus.publish('THROTTLER:UNREGISTERED', {
              sourceEvent: srcEvent,
              targetEvent
            });

            // Si plus aucun limiteur pour cet événement source, supprimer l'entrée
            if (eventLimiters.length === 0) {
              limiters.delete(srcEvent);
            }

            break;
          }
        }
      }

      publishInfo(`Limiteur désenregistré: ${sourceEvent || '*'} -> ${targetEvent || '*'}`);
    } catch (error) {
      publishError('UNREGISTER_LIMITER_FAILED', error.message);
    }
  }

  /**
   * Se désabonne d'un événement source pour un limiteur
   * @param {string} sourceEvent - Type d'événement source
   * @param {Object} limiter - Configuration du limiteur
   */
  function unsubscribeFromSourceEvent(sourceEvent, limiter) {
    if (limiter.state.subscription) {
      // Dans certains environnements, unsubscribe peut attendre un ID ou un handler
      // Dans notre cas, nous devons nous désabonner de l'événement source
      eventBus.unsubscribe(sourceEvent, limiter.state.subscription);
      limiter.state.subscription = null;
    }

    // Pour la stratégie throttle, émettre l'événement si aucun n'a été émis
    // ou s'il y a un timer en attente
    if (limiter.strategy === 'throttle') {
      if (limiter.stats.received > 0 && limiter.stats.emitted === 0) {
        // Aucun événement n'a été émis mais nous en avons reçu au moins un
        if (limiter.stats.lastEvent) {
          emit(limiter.targetEvent, limiter.stats.lastEvent.data);
          limiter.stats.emitted++;
        }
      } else if (limiter.timers.throttleTimer && limiter.stats.lastEvent) {
        // Un timer est en attente, émettre immédiatement
        emit(limiter.targetEvent, limiter.stats.lastEvent.data);
        limiter.stats.emitted++;
      }
    }

    // Pour la stratégie debounce, émettre l'événement en attente
    if (
      limiter.strategy === 'debounce' &&
      limiter.timers.debounceTimer &&
      limiter.stats.lastEvent
    ) {
      emit(limiter.targetEvent, limiter.stats.lastEvent.data);
      limiter.stats.emitted++;
    }

    // Nettoyer les timers
    clearTimeout(limiter.timers.throttleTimer);
    clearTimeout(limiter.timers.debounceTimer);
    clearTimeout(limiter.timers.batchTimer);

    // Vider la file d'attente pour les stratégies batch
    if (limiter.strategy === 'batch' && limiter.state.queue.length > 0) {
      // Envoyer le batch final si nécessaire
      flushBatch(limiter);
    }
  }

  /**
   * Met en pause le traitement des limitations
   */
  function onPauseThrottler() {
    if (state.paused) return;

    state.paused = true;

    // Mettre en pause tous les limiteurs
    for (const [, eventLimiters] of limiters.entries()) {
      for (const limiter of eventLimiters) {
        limiter.state.paused = true;
      }
    }

    eventBus.publish('THROTTLER:PAUSED', {
      timestamp: Date.now()
    });

    publishInfo('EventThrottler en pause');
  }

  /**
   * Reprend le traitement des limitations
   */
  function onResumeThrottler() {
    if (!state.paused) return;

    state.paused = false;

    // Reprendre tous les limiteurs
    for (const [, eventLimiters] of limiters.entries()) {
      for (const limiter of eventLimiters) {
        limiter.state.paused = false;
      }
    }

    eventBus.publish('THROTTLER:RESUMED', {
      timestamp: Date.now()
    });

    publishInfo('EventThrottler a repris');
  }

  /**
   * Renvoie le statut actuel du throttler
   * @param {Object} data - Données de la requête
   */
  function onGetStatus(data) {
    const status = {
      enabled: config.enabled,
      paused: state.paused,
      limitersCount: Array.from(limiters.keys()).reduce(
        (acc, key) => acc + limiters.get(key).length,
        0
      ),
      sourceEventsCount: limiters.size,
      stats: calculateGlobalStats(),
      timestamp: Date.now()
    };

    // Ajouter les détails des limiteurs si demandé
    if (data && data.detailed) {
      status.limiters = [];

      for (const [sourceEvent, eventLimiters] of limiters.entries()) {
        for (const limiter of eventLimiters) {
          status.limiters.push({
            sourceEvent,
            targetEvent: limiter.targetEvent,
            strategy: limiter.strategy,
            options: limiter.options,
            stats: limiter.stats,
            paused: limiter.state.paused
          });
        }
      }
    }

    // Si un ID de requête est fourni, l'inclure dans la réponse
    if (data && data.requestId) {
      status.requestId = data.requestId;
    }

    eventBus.publish('THROTTLER:STATUS', status);
  }

  /**
   * Calcule les statistiques globales des limiteurs
   * @returns {Object} Statistiques globales
   */
  function calculateGlobalStats() {
    const stats = {
      received: 0,
      emitted: 0,
      dropped: 0,
      limitersWithActivity: 0
    };

    for (const [, eventLimiters] of limiters.entries()) {
      for (const limiter of eventLimiters) {
        stats.received += limiter.stats.received;
        stats.emitted += limiter.stats.emitted;
        stats.dropped += limiter.stats.dropped;

        if (limiter.stats.received > 0) {
          stats.limitersWithActivity++;
        }
      }
    }

    return stats;
  }

  /**
   * Publie un message d'information dans le journal
   * @param {string} message - Message à journaliser
   * @param {Object} [details] - Détails supplémentaires
   */
  function publishInfo(message, details = {}) {
    if (!eventBus) return;

    eventBus.publish('LOG:INFO', {
      source: 'event-throttler',
      message,
      details
    });
  }

  /**
   * Publie une erreur sur le bus d'événements
   * @param {string} code - Code d'erreur
   * @param {string} message - Message d'erreur
   * @param {Object} [details] - Détails supplémentaires
   */
  function publishError(code, message, details = {}) {
    if (!eventBus) return;

    // Utiliser le code d'erreur standardisé si disponible
    const errorCode = ERROR_CODES && ERROR_CODES[code] ? ERROR_CODES[code] : code;

    eventBus.publish('ERROR:NON_CRITICAL', {
      source: 'event-throttler',
      code: errorCode,
      message,
      details,
      timestamp: Date.now()
    });

    eventBus.publish('LOG:ERROR', {
      source: 'event-throttler',
      message: `${code}: ${message}`,
      details
    });
  }

  /**
   * Nettoie les ressources avant la fermeture
   */
  function cleanup() {
    // Désabonner tous les limiteurs
    for (const [sourceEvent, eventLimiters] of limiters.entries()) {
      for (const limiter of eventLimiters) {
        unsubscribeFromSourceEvent(sourceEvent, limiter);
      }
    }

    // Vider le registre des limiteurs
    limiters.clear();

    // Se désabonner des événements système
    if (eventBus) {
      eventBus.unsubscribe('APP:READY', onAppReady);
      eventBus.unsubscribe('CONFIG:UPDATED', onConfigUpdated);
      eventBus.unsubscribe('THROTTLER:REGISTER', onRegisterLimiter);
      eventBus.unsubscribe('THROTTLER:UNREGISTER', onUnregisterLimiter);
      eventBus.unsubscribe('THROTTLER:PAUSE', onPauseThrottler);
      eventBus.unsubscribe('THROTTLER:RESUME', onResumeThrottler);
      eventBus.unsubscribe('THROTTLER:GET_STATUS', onGetStatus);
      eventBus.unsubscribe('APP:SHUTTING_DOWN', cleanup);
    }

    state.initialized = false;

    publishInfo('EventThrottler nettoyé, ressources libérées');
  }

  // Interface publique
  return {
    initialize
  };
}

/**
 * Fonction d'auto-enregistrement du module
 * Cette fonction est appelée automatiquement lorsque le module est chargé
 * et s'enregistre auprès du bus d'événements global.
 */
function registerEventThrottler() {
  // Vérifier si le bus d'événements global est disponible
  if (typeof window !== 'undefined' && window.appEvents) {
    const eventThrottler = EventThrottler(); // ✅ pas besoin de changer ici, car on garde l'auto-enregistrement côté fenêtre
    const eventBus = window.appEvents;

    // Obtenir les types d'événements et codes d'erreur si disponibles
    let EVENT_TYPES = null;
    let ERROR_CODES = null;

    if (typeof window.EVENT_TYPES !== 'undefined') {
      EVENT_TYPES = window.EVENT_TYPES;
    }

    if (typeof window.ERROR_CODES !== 'undefined') {
      ERROR_CODES = window.ERROR_CODES;
    }

    // Initialiser le module avec le bus d'événements global
    eventThrottler.initialize(eventBus, EVENT_TYPES, ERROR_CODES);

    // Exposer l'instance si nécessaire pour les tests
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      window.__eventThrottler = eventThrottler;
    }
  } else {
    console.warn("EventThrottler: Aucun bus d'événements global trouvé");
  }
}

// Exporter le module pour une utilisation directe ou pour les tests
// Cela permet l'initialisation manuelle avec un bus d'événements spécifique
module.exports = EventThrottler; // ← exporte la factory

// Auto-enregistrement si nous sommes dans un environnement navigateur
if (typeof window !== 'undefined') {
  // Différer l'enregistrement pour s'assurer que le bus d'événements est chargé
  setTimeout(registerEventThrottler, 0);
}

/**
 * Exemples d'utilisation:
 *
 * 1. Initialisation manuelle (pour les tests ou utilisation spécifique)
 * ```
 * const eventThrottler = require('./utils/event-throttler');
 * const eventBus = require('./core/event-bus').getInstance();
 * const EVENT_TYPES = require('./constants/event-types');
 * const ERROR_CODES = require('./constants/error-codes');
 *
 * eventThrottler.initialize(eventBus, EVENT_TYPES, ERROR_CODES);
 * ```
 *
 * 2. Enregistrement d'un limiteur de type "throttle" pour la progression des téléchargements
 * ```
 * eventBus.publish('THROTTLER:REGISTER', {
 *   sourceEvent: 'DOWNLOAD:ITEM_PROGRESS',
 *   targetEvent: 'DOWNLOAD:ITEM_PROGRESS_THROTTLED',
 *   strategy: 'throttle',
 *   options: {
 *     interval: 500, // Limiter à un événement toutes les 500ms
 *     leading: true, // Émettre le premier événement immédiatement
 *     trailing: true // Émettre le dernier événement après l'intervalle
 *   }
 * });
 *
 * // Puis s'abonner à l'événement limité plutôt qu'à l'original
 * eventBus.subscribe('DOWNLOAD:ITEM_PROGRESS_THROTTLED', (data) => {
 *   // Mise à jour de l'interface utilisateur avec une fréquence raisonnable
 *   updateProgressBar(data.downloadId, data.progress);
 * });
 * ```
 *
 * 3. Enregistrement d'un limiteur de type "batch" pour les logs
 * ```
 * eventBus.publish('THROTTLER:REGISTER', {
 *   sourceEvent: 'LOG:DEBUG',
 *   targetEvent: 'LOG:DEBUG_BATCH',
 *   strategy: 'batch',
 *   options: {
 *     maxSize: 20,       // Nombre maximum d'événements par batch
 *     maxInterval: 2000  // Intervalle maximum en ms avant envoi du batch
 *   }
 * });
 *
 * // S'abonner à l'événement de batch
 * eventBus.subscribe('LOG:DEBUG_BATCH', (batchData) => {
 *   // batchData contient un tableau d'événements de log
 *   console.log(`Traitement de ${batchData.count} logs en batch`);
 *
 *   // Enregistrer les logs en une seule opération
 *   saveLogs(batchData.items);
 * });
 * ```
 *
 * 4. Enregistrement d'un limiteur de type "debounce" pour les recherches
 * ```
 * eventBus.publish('THROTTLER:REGISTER', {
 *   sourceEvent: 'SEARCH:QUERY_CHANGED',
 *   targetEvent: 'SEARCH:QUERY_DEBOUNCED',
 *   strategy: 'debounce',
 *   options: {
 *     delay: 300,      // Attendre 300ms d'inactivité avant d'émettre
 *     trailing: true   // Émettre après le délai
 *   }
 * });
 *
 * // S'abonner à l'événement débounce
 * eventBus.subscribe('SEARCH:QUERY_DEBOUNCED', (query) => {
 *   // Lancer la recherche uniquement quand l'utilisateur a fini de taper
 *   performSearch(query);
 * });
 * ```
 *
 * 5. Obtenir le statut des limiteurs
 * ```
 * eventBus.publish('THROTTLER:GET_STATUS', {
 *   requestId: 'status-123',
 *   detailed: true // Inclure les détails de chaque limiteur
 * });
 *
 * eventBus.subscribe('THROTTLER:STATUS', (status) => {
 *   if (status.requestId === 'status-123') {
 *     console.log('Statut actuel:', status);
 *
 *     // Analyser les statistiques
 *     const efficiency = (status.stats.emitted / status.stats.received) * 100;
 *     console.log(`Efficacité: ${efficiency.toFixed(2)}% (${status.stats.dropped} événements filtrés)`);
 *   }
 * });
 * ```
 */ // Limiteur d'événements pour éviter la surcharge
// Créé automatiquement le 2025-05-02
