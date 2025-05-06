/**
 * @fileoverview File d'attente asynchrone pour l'application 21 BYTS
 *
 * Ce module implémente une file d'attente pour les opérations asynchrones
 * permettant de limiter le nombre d'opérations concurrentes et de gérer
 * les priorités. Il est conçu pour fonctionner de manière totalement autonome
 * sans aucune dépendance directe sur d'autres modules du projet.
 *
 * @module utils/async-queue
 *
 * Événements écoutés:
 * - APP:READY: S'initialise lorsque l'application est prête
 * - CONFIG:UPDATED: Met à jour les paramètres de la file d'attente
 * - QUEUE:ADD_TASK: Ajoute une tâche à la file d'attente
 * - QUEUE:CLEAR: Vide la file d'attente
 * - QUEUE:PAUSE: Met en pause le traitement des tâches
 * - QUEUE:RESUME: Reprend le traitement des tâches
 * - QUEUE:REMOVE_TASK: Retire une tâche spécifique de la file
 * - QUEUE:GET_STATUS: Demande le statut actuel de la file
 * - APP:SHUTTING_DOWN: Nettoie les ressources avant la fermeture
 *
 * Événements émis:
 * - QUEUE:TASK_ADDED: Une tâche a été ajoutée à la file
 * - QUEUE:TASK_STARTED: Une tâche a commencé son exécution
 * - QUEUE:TASK_COMPLETED: Une tâche s'est terminée avec succès
 * - QUEUE:TASK_FAILED: Une tâche a échoué
 * - QUEUE:TASK_REMOVED: Une tâche a été retirée de la file
 * - QUEUE:STATUS: Statut actuel de la file d'attente
 * - QUEUE:EMPTY: La file d'attente est vide
 * - QUEUE:PAUSED: La file d'attente est en pause
 * - QUEUE:RESUMED: La file d'attente a repris le traitement
 * - ERROR: Une erreur s'est produite dans le module
 */

'use strict';

/**
 * AsyncQueue - Gestionnaire de file d'attente asynchrone
 */
function AsyncQueue() {
  // Bus d'événements
  let eventBus = null;

  // Configuration par défaut
  let config = {
    maxConcurrent: 3, // Nombre maximum de tâches concurrentes
    retryLimit: 3, // Nombre maximum de tentatives pour une tâche
    retryDelay: 1000, // Délai en ms avant de réessayer une tâche (1s)
    priorityLevels: 3, // Niveaux de priorité (0 = plus haute, 2 = plus basse)
    defaultPriority: 1, // Priorité par défaut
    processingInterval: 100, // Intervalle en ms pour vérifier les nouvelles tâches
    taskTimeout: 60000, // Timeout par défaut pour les tâches (1min)
    autoStart: true // Démarrer automatiquement le traitement
  };

  // État interne
  let state = {
    queue: [], // File d'attente des tâches
    active: new Map(), // Tâches actuellement en cours d'exécution
    paused: false, // Indicateur de pause
    processingTimer: null, // Timer pour le traitement des tâches
    initialized: false // Indicateur d'initialisation
  };

  // Statistiques
  let stats = {
    added: 0, // Nombre total de tâches ajoutées
    completed: 0, // Nombre de tâches terminées avec succès
    failed: 0, // Nombre de tâches échouées
    retried: 0, // Nombre de tâches réessayées
    removed: 0, // Nombre de tâches supprimées manuellement
    avgProcessingTime: 0 // Temps moyen de traitement (ms)
  };

  /**
   * Initialise le module et s'enregistre auprès du bus d'événements
   * @param {Object} bus - Bus d'événements central
   */
  function initialize(bus) {
    if (!bus) {
      console.error("AsyncQueue: EventBus est requis pour l'initialisation");
      return;
    }

    eventBus = bus;

    // S'abonner aux événements
    registerEventListeners();

    state.initialized = true;

    // Démarrer le traitement si autoStart est activé
    if (config.autoStart) {
      startProcessing();
    }

    // Indiquer que le module est prêt
    eventBus.publish('LOG:INFO', {
      source: 'async-queue',
      message: 'Module AsyncQueue initialisé'
    });
  }

  /**
   * S'abonne aux événements pertinents
   */
  function registerEventListeners() {
    // Événements système
    eventBus.subscribe('APP:READY', onAppReady);
    eventBus.subscribe('CONFIG:UPDATED', onConfigUpdated);
    eventBus.subscribe('APP:SHUTTING_DOWN', cleanup);

    // Événements spécifiques à la file d'attente
    eventBus.subscribe('QUEUE:ADD_TASK', onAddTask);
    eventBus.subscribe('QUEUE:CLEAR', onClear);
    eventBus.subscribe('QUEUE:PAUSE', onPause);
    eventBus.subscribe('QUEUE:RESUME', onResume);
    eventBus.subscribe('QUEUE:REMOVE_TASK', onRemoveTask);
    eventBus.subscribe('QUEUE:GET_STATUS', onGetStatus);
  }

  /**
   * Gère l'événement d'initialisation de l'application
   */
  function onAppReady() {
    // Demander la configuration
    eventBus.publish('CONFIG:GET', {
      key: 'queue',
      requestId: 'async-queue-init'
    });

    // Publier que le module est prêt
    eventBus.publish('MODULE:READY', {
      module: 'async-queue'
    });
  }

  /**
   * Gère les mises à jour de configuration
   * @param {Object} data - Données de configuration mises à jour
   */
  function onConfigUpdated(data) {
    // Vérifier si les données concernent la file d'attente
    if (data && data.queue) {
      const queueConfig = data.queue;

      // Mettre à jour la configuration
      if (queueConfig.maxConcurrent !== undefined) config.maxConcurrent = queueConfig.maxConcurrent;
      if (queueConfig.retryLimit !== undefined) config.retryLimit = queueConfig.retryLimit;
      if (queueConfig.retryDelay !== undefined) config.retryDelay = queueConfig.retryDelay;
      if (queueConfig.priorityLevels !== undefined)
        config.priorityLevels = queueConfig.priorityLevels;
      if (queueConfig.defaultPriority !== undefined)
        config.defaultPriority = queueConfig.defaultPriority;
      if (queueConfig.processingInterval !== undefined)
        config.processingInterval = queueConfig.processingInterval;
      if (queueConfig.taskTimeout !== undefined) config.taskTimeout = queueConfig.taskTimeout;

      // Redémarrer le traitement si l'intervalle a changé
      if (queueConfig.processingInterval !== undefined && state.processingTimer) {
        restartProcessingTimer();
      }

      // Logger la mise à jour de la configuration
      eventBus.publish('LOG:INFO', {
        source: 'async-queue',
        message: "Configuration de la file d'attente mise à jour",
        details: config
      });
    }
  }

  /**
   * Gère l'ajout d'une tâche à la file d'attente
   * @param {Object} data - Données de la tâche à ajouter
   */
  function onAddTask(data) {
    if (!data || !data.id || !data.task) {
      publishError('INVALID_TASK', 'Tâche invalide: ID et fonction de tâche requis');
      return;
    }

    try {
      // Vérifier que la tâche est une fonction
      if (typeof data.task !== 'function') {
        throw new Error('La tâche doit être une fonction');
      }

      // Créer la tâche
      const task = {
        id: data.id,
        task: data.task,
        priority: data.priority !== undefined ? data.priority : config.defaultPriority,
        timeout: data.timeout || config.taskTimeout,
        metadata: data.metadata || {},
        addedAt: Date.now(),
        attempts: 0,
        status: 'pending'
      };

      // Ajuster la priorité si elle est hors limites
      if (task.priority < 0) task.priority = 0;
      if (task.priority >= config.priorityLevels) task.priority = config.priorityLevels - 1;

      // Ajouter la tâche à la file
      state.queue.push(task);

      // Trier la file par priorité
      sortQueue();

      // Mettre à jour les statistiques
      stats.added++;

      // Publier l'événement d'ajout de tâche
      eventBus.publish('QUEUE:TASK_ADDED', {
        taskId: task.id,
        priority: task.priority,
        queuePosition: getQueuePosition(task.id),
        queueLength: state.queue.length
      });

      // Si le traitement est actif, vérifier s'il y a des slots disponibles
      if (!state.paused) {
        processNextTasks();
      }
    } catch (error) {
      publishError('ADD_TASK_FAILED', error.message);
    }
  }

  /**
   * Vide la file d'attente
   * @param {Object} data - Paramètres optionnels
   */
  function onClear(data) {
    const keepActive = data && data.keepActive;

    // Nombre de tâches supprimées
    const removedCount = state.queue.length;

    // Publier des événements pour chaque tâche supprimée
    state.queue.forEach((task) => {
      eventBus.publish('QUEUE:TASK_REMOVED', {
        taskId: task.id,
        reason: 'queue_cleared'
      });
    });

    // Vider la file
    state.queue = [];

    // Si demandé, annuler également les tâches actives
    if (!keepActive) {
      const activeTasks = Array.from(state.active.values());

      activeTasks.forEach((task) => {
        // Annuler le timeout
        if (task.timeoutId) {
          clearTimeout(task.timeoutId);
        }

        // Publier l'événement de suppression
        eventBus.publish('QUEUE:TASK_REMOVED', {
          taskId: task.id,
          reason: 'queue_cleared'
        });
      });

      state.active.clear();
    }

    // Mettre à jour les statistiques
    stats.removed += removedCount;

    // Publier l'événement de file vide
    eventBus.publish('QUEUE:EMPTY', {
      clearedCount: removedCount,
      activeRemaining: state.active.size
    });
  }

  /**
   * Met la file d'attente en pause
   */
  function onPause() {
    if (state.paused) return;

    state.paused = true;

    // Arrêter le timer de traitement
    if (state.processingTimer) {
      clearInterval(state.processingTimer);
      state.processingTimer = null;
    }

    eventBus.publish('QUEUE:PAUSED', {
      pendingTasks: state.queue.length,
      activeTasks: state.active.size
    });
  }

  /**
   * Reprend le traitement de la file d'attente
   */
  function onResume() {
    if (!state.paused) return;

    state.paused = false;

    // Redémarrer le timer de traitement
    startProcessing();

    eventBus.publish('QUEUE:RESUMED', {
      pendingTasks: state.queue.length,
      activeTasks: state.active.size
    });

    // Traiter les tâches en attente immédiatement
    processNextTasks();
  }

  /**
   * Retire une tâche spécifique de la file
   * @param {Object} data - Données de la tâche à retirer
   */
  function onRemoveTask(data) {
    if (!data || !data.taskId) {
      publishError('INVALID_TASK_ID', 'ID de tâche requis pour la suppression');
      return;
    }

    const taskId = data.taskId;
    let removed = false;

    // Vérifier dans la file d'attente
    const index = state.queue.findIndex((task) => task.id === taskId);

    if (index !== -1) {
      // Retirer de la file
      const task = state.queue[index];
      state.queue.splice(index, 1);
      removed = true;

      // Mettre à jour les statistiques
      stats.removed++;

      eventBus.publish('QUEUE:TASK_REMOVED', {
        taskId: task.id,
        reason: 'manually_removed',
        wasQueued: true
      });
    }

    // Vérifier dans les tâches actives
    if (state.active.has(taskId)) {
      const task = state.active.get(taskId);

      // Annuler le timeout
      if (task.timeoutId) {
        clearTimeout(task.timeoutId);
      }

      // Retirer des tâches actives
      state.active.delete(taskId);
      removed = true;

      // Mettre à jour les statistiques
      stats.removed++;

      eventBus.publish('QUEUE:TASK_REMOVED', {
        taskId: task.id,
        reason: 'manually_removed',
        wasActive: true
      });
    }

    if (!removed) {
      eventBus.publish('LOG:WARNING', {
        source: 'async-queue',
        message: `Tâche ${taskId} non trouvée pour suppression`
      });
    }
  }

  /**
   * Répond à une demande de statut de la file
   * @param {Object} data - Données de la requête
   */
  function onGetStatus(data) {
    const status = {
      queueLength: state.queue.length,
      activeTasks: Array.from(state.active.keys()),
      isPaused: state.paused,
      byPriority: countTasksByPriority(),
      stats: { ...stats }
    };

    // Si un ID de requête est fourni, l'inclure dans la réponse
    if (data && data.requestId) {
      status.requestId = data.requestId;
    }

    eventBus.publish('QUEUE:STATUS', status);
  }

  /**
   * Démarre le traitement des tâches
   */
  function startProcessing() {
    if (state.processingTimer) {
      clearInterval(state.processingTimer);
    }

    state.processingTimer = setInterval(() => {
      if (!state.paused) {
        processNextTasks();
      }
    }, config.processingInterval);
  }

  /**
   * Redémarre le timer de traitement (après changement de configuration)
   */
  function restartProcessingTimer() {
    if (state.processingTimer) {
      clearInterval(state.processingTimer);
      state.processingTimer = null;
    }

    if (!state.paused) {
      startProcessing();
    }
  }

  /**
   * Traite les tâches suivantes si des slots sont disponibles
   */
  function processNextTasks() {
    // Si la file est vide, rien à faire
    if (state.queue.length === 0) {
      return;
    }

    // Calculer combien de tâches peuvent être démarrées
    const availableSlots = Math.max(0, config.maxConcurrent - state.active.size);

    if (availableSlots === 0) {
      return;
    }

    // Prendre les N premières tâches de la file (selon le nombre de slots disponibles)
    const tasksToProcess = state.queue.slice(0, availableSlots);

    // Retirer ces tâches de la file
    state.queue = state.queue.slice(availableSlots);

    // Traiter chaque tâche
    tasksToProcess.forEach(executeTask);
  }

  /**
   * Exécute une tâche
   * @param {Object} task - Tâche à exécuter
   */
  function executeTask(task) {
    // Marquer la tâche comme active
    task.status = 'active';
    task.startedAt = Date.now();
    task.attempts++;

    // Ajouter à la map des tâches actives
    state.active.set(task.id, task);

    // Publier l'événement de démarrage
    eventBus.publish('QUEUE:TASK_STARTED', {
      taskId: task.id,
      attempt: task.attempts,
      metadata: task.metadata
    });

    // Configurer le timeout
    task.timeoutId = setTimeout(() => {
      handleTaskTimeout(task);
    }, task.timeout);

    // Exécuter la tâche
    try {
      const promise = Promise.resolve(task.task(task.metadata));

      promise
        .then((result) => {
          handleTaskSuccess(task, result);
        })
        .catch((error) => {
          handleTaskError(task, error);
        });
    } catch (error) {
      // Gérer les erreurs synchrones
      handleTaskError(task, error);
    }
  }

  /**
   * Gère le timeout d'une tâche
   * @param {Object} task - Tâche qui a expiré
   */
  function handleTaskTimeout(task) {
    // Vérifier si la tâche est toujours active
    if (!state.active.has(task.id)) {
      return;
    }

    const error = new Error(`La tâche a expiré après ${task.timeout}ms`);
    handleTaskError(task, error, 'timeout');
  }

  /**
   * Gère la réussite d'une tâche
   * @param {Object} task - Tâche terminée
   * @param {*} result - Résultat de la tâche
   */
  function handleTaskSuccess(task, result) {
    // Vérifier si la tâche est toujours active (non timeout)
    if (!state.active.has(task.id)) {
      return;
    }

    // Annuler le timeout
    if (task.timeoutId) {
      clearTimeout(task.timeoutId);
    }

    // Calculer le temps de traitement
    const processingTime = Date.now() - task.startedAt;

    // Mettre à jour les statistiques
    stats.completed++;
    stats.avgProcessingTime =
      (stats.avgProcessingTime * (stats.completed - 1) + processingTime) / stats.completed;

    // Supprimer de la liste des tâches actives
    state.active.delete(task.id);

    // Publier l'événement de succès
    eventBus.publish('QUEUE:TASK_COMPLETED', {
      taskId: task.id,
      result: result,
      processingTime,
      metadata: task.metadata
    });

    // Traiter les tâches suivantes
    processNextTasks();
  }

  /**
   * Gère l'échec d'une tâche
   * @param {Object} task - Tâche ayant échoué
   * @param {Error} error - Erreur survenue
   * @param {string} [reason='error'] - Raison de l'échec
   */
  function handleTaskError(task, error, reason = 'error') {
    // Vérifier si la tâche est toujours active
    if (!state.active.has(task.id)) {
      return;
    }

    // Annuler le timeout
    if (task.timeoutId) {
      clearTimeout(task.timeoutId);
    }

    // Supprimer de la liste des tâches actives
    state.active.delete(task.id);

    // Déterminer si un retry est possible
    if (task.attempts < config.retryLimit) {
      // Programmation d'un retry
      task.status = 'retry';
      task.lastError = {
        message: error.message,
        stack: error.stack,
        reason
      };

      // Mettre à jour les statistiques
      stats.retried++;

      // Publier l'événement de retry
      eventBus.publish('QUEUE:TASK_RETRY', {
        taskId: task.id,
        error: error.message,
        attempt: task.attempts,
        maxAttempts: config.retryLimit,
        nextRetryDelay: config.retryDelay,
        metadata: task.metadata
      });

      // Réajouter la tâche à la file après un délai
      setTimeout(() => {
        if (state.initialized) {
          // Vérifier que le module est toujours actif
          state.queue.push(task);
          sortQueue();
          processNextTasks();
        }
      }, config.retryDelay);
    } else {
      // Échec définitif
      task.status = 'failed';

      // Mettre à jour les statistiques
      stats.failed++;

      // Publier l'événement d'échec
      eventBus.publish('QUEUE:TASK_FAILED', {
        taskId: task.id,
        error: error.message,
        attempts: task.attempts,
        reason,
        metadata: task.metadata
      });

      // Publier l'erreur générale
      publishError('TASK_EXECUTION_FAILED', error.message, {
        taskId: task.id,
        attempts: task.attempts
      });

      // Traiter les tâches suivantes
      processNextTasks();
    }
  }

  /**
   * Trie la file d'attente par priorité
   */
  function sortQueue() {
    state.queue.sort((a, b) => {
      // Trier d'abord par priorité (0 = plus haute priorité)
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }

      // À priorité égale, trier par ordre d'ajout (FIFO)
      return a.addedAt - b.addedAt;
    });
  }

  /**
   * Détermine la position d'une tâche dans la file
   * @param {string} taskId - ID de la tâche
   * @returns {number} Position dans la file (0-indexed) ou -1 si non trouvée
   */
  function getQueuePosition(taskId) {
    return state.queue.findIndex((task) => task.id === taskId);
  }

  /**
   * Compte les tâches par niveau de priorité
   * @returns {Object} Nombre de tâches par priorité
   */
  function countTasksByPriority() {
    const counts = {};

    for (let i = 0; i < config.priorityLevels; i++) {
      counts[i] = 0;
    }

    state.queue.forEach((task) => {
      if (counts[task.priority] !== undefined) {
        counts[task.priority]++;
      }
    });

    return counts;
  }

  /**
   * Publie une erreur sur le bus d'événements
   * @param {string} code - Code d'erreur
   * @param {string} message - Message d'erreur
   * @param {Object} [details] - Détails supplémentaires
   */
  function publishError(code, message, details = {}) {
    eventBus.publish('ERROR', {
      source: 'async-queue',
      code,
      message,
      details,
      timestamp: Date.now()
    });

    eventBus.publish('LOG:ERROR', {
      source: 'async-queue',
      message: `${code}: ${message}`,
      details
    });
  }

  /**
   * Nettoie les ressources avant la fermeture
   */
  function cleanup() {
    // Arrêter le timer de traitement
    if (state.processingTimer) {
      clearInterval(state.processingTimer);
      state.processingTimer = null;
    }

    // Annuler tous les timeouts des tâches actives
    state.active.forEach((task) => {
      if (task.timeoutId) {
        clearTimeout(task.timeoutId);
      }
    });

    // Se désabonner des événements
    if (eventBus) {
      eventBus.unsubscribe('APP:READY', onAppReady);
      eventBus.unsubscribe('CONFIG:UPDATED', onConfigUpdated);
      eventBus.unsubscribe('APP:SHUTTING_DOWN', cleanup);
      eventBus.unsubscribe('QUEUE:ADD_TASK', onAddTask);
      eventBus.unsubscribe('QUEUE:CLEAR', onClear);
      eventBus.unsubscribe('QUEUE:PAUSE', onPause);
      eventBus.unsubscribe('QUEUE:RESUME', onResume);
      eventBus.unsubscribe('QUEUE:REMOVE_TASK', onRemoveTask);
      eventBus.unsubscribe('QUEUE:GET_STATUS', onGetStatus);
    }

    state.initialized = false;

    eventBus.publish('LOG:INFO', {
      source: 'async-queue',
      message: 'Module AsyncQueue nettoyé'
    });
  }

  // Interface publique
  return {
    initialize,
    cleanup // 👈 expose la fonction
  };
}

// Exporter l'instance du module
const instance = AsyncQueue();
module.exports = instance;

/**
 * Exemples d'utilisation:
 *
 * // Initialisation du module via le bus d'événements central
 * // (habituellement fait par le conteneur d'application)
 * const eventBus = window.appEvents; // Obtenu globalement
 * const asyncQueue = require('./utils/async-queue');
 * asyncQueue.initialize(eventBus);
 *
 * // Ajouter une tâche à la file d'attente
 * eventBus.publish('QUEUE:ADD_TASK', {
 *   id: 'download-123',
 *   task: async (metadata) => {
 *     // Effectuer une opération asynchrone
 *     const result = await someAsyncOperation();
 *     return result;
 *   },
 *   priority: 0, // Haute priorité
 *   metadata: {
 *     url: 'https://example.com/audio.mp3',
 *     format: 'mp3'
 *   }
 * });
 *
 * // Écouter l'achèvement d'une tâche
 * eventBus.subscribe('QUEUE:TASK_COMPLETED', (data) => {
 *   if (data.taskId === 'download-123') {
 *     console.log('Téléchargement terminé:', data.result);
 *   }
 * });
 *
 * // Obtenir le statut de la file d'attente
 * eventBus.publish('QUEUE:GET_STATUS', {
 *   requestId: 'status-request-1'
 * });
 *
 * eventBus.subscribe('QUEUE:STATUS', (status) => {
 *   if (status.requestId === 'status-request-1') {
 *     console.log('Statut de la file:', status);
 *   }
 * });
 *
 * // Mettre en pause la file d'attente
 * eventBus.publish('QUEUE:PAUSE');
 *
 * // Reprendre le traitement
 * eventBus.publish('QUEUE:RESUME');
 */ // File d'attente pour opérations asynchrones
// Créé automatiquement le 2025-05-02
