/**
 * @fileoverview Module de gestion de file d'attente pour les téléchargements audio
 * @module modules/download/download-queue
 * @description Gère une file d'attente optimisée pour les téléchargements audio avec priorisation,
 * reprise sur erreur, et limitation de téléchargements simultanés. Le module est complètement
 * autonome et communique uniquement via le bus d'événements.
 *
 * @events écoutés:
 * - QUEUE_ADD_ITEM: Ajoute un élément à la file d'attente
 * - QUEUE_REMOVE_ITEM: Supprime un élément de la file d'attente
 * - QUEUE_CLEAR: Vide la file d'attente
 * - QUEUE_PAUSE: Pause tous les téléchargements
 * - QUEUE_RESUME: Reprend tous les téléchargements
 * - QUEUE_ITEM_COMPLETED: Marque un élément comme terminé
 * - QUEUE_ITEM_FAILED: Marque un élément comme ayant échoué
 * - QUEUE_GET_STATUS: Demande le statut actuel de la file d'attente
 * - APP_INITIALIZED: L'application est initialisée
 * - CONFIG_UPDATED: La configuration a été mise à jour
 *
 * @events émis:
 * - QUEUE_ITEM_ADDED: Un élément a été ajouté à la file d'attente
 * - QUEUE_ITEM_REMOVED: Un élément a été retiré de la file d'attente
 * - QUEUE_CLEARED: La file d'attente a été vidée
 * - QUEUE_PAUSED: La file d'attente a été mise en pause
 * - QUEUE_RESUMED: La file d'attente a repris
 * - QUEUE_STATUS: État actuel de la file d'attente
 * - QUEUE_ITEM_DOWNLOAD_STARTED: Le téléchargement d'un élément a commencé
 * - QUEUE_ERROR: Une erreur s'est produite dans la file d'attente
 * - DOWNLOAD_REQUEST: Demande de téléchargement d'un élément
 */

// Utilisation du modèle IIFE pour isoler le scope
(function () {
  'use strict';

  // État interne de la file d'attente
  const state = {
    queue: [], // Liste des éléments en attente
    activeDownloads: [], // Liste des téléchargements actifs
    paused: false, // État de pause
    maxConcurrentDownloads: 3, // Nombre maximal de téléchargements simultanés
    retryLimit: 3, // Nombre maximal de tentatives
    retryDelay: 5000, // Délai avant nouvelle tentative (ms)
    initialized: false // Indicateur d'initialisation
  };

  // Statistiques de la file d'attente
  const stats = {
    totalQueued: 0,
    totalCompleted: 0,
    totalFailed: 0,
    totalCancelled: 0
  };

  /**
   * Initialise le module et s'abonne aux événements nécessaires
   * @private
   */
  function initialize() {
    if (state.initialized) return;

    // Publication d'un événement pour récupérer une référence au bus d'événements
    window.dispatchEvent(
      new CustomEvent('MODULE_READY', {
        detail: {
          moduleId: 'download-queue',
          eventHandler: handleEvent
        }
      })
    );

    state.initialized = true;

    // Log d'initialisation
    console.log('Module download-queue initialisé');
  }

  /**
   * Gestionnaire d'événements pour le module
   * @param {string} type - Type d'événement
   * @param {Object} data - Données associées à l'événement
   * @param {Function} [reply] - Fonction de réponse pour les demandes
   * @private
   */
  function handleEvent(type, data, reply) {
    try {
      switch (type) {
        case 'APP_INITIALIZED':
          // Demande la configuration initiale
          emitEvent('CONFIG_GET', {
            keys: ['download.maxConcurrent', 'download.retryLimit', 'download.retryDelay']
          });
          break;

        case 'CONFIG_UPDATED':
          handleConfigUpdate(data);
          break;

        case 'QUEUE_ADD_ITEM':
          addToQueue(data);
          break;

        case 'QUEUE_REMOVE_ITEM':
          removeFromQueue(data.id);
          break;

        case 'QUEUE_CLEAR':
          clearQueue();
          break;

        case 'QUEUE_PAUSE':
          pauseQueue();
          break;

        case 'QUEUE_RESUME':
          resumeQueue();
          break;

        case 'QUEUE_ITEM_COMPLETED':
          handleItemCompleted(data.id);
          break;

        case 'QUEUE_ITEM_FAILED':
          handleItemFailed(data.id, data.error);
          break;

        case 'QUEUE_GET_STATUS':
          if (reply) {
            reply(getQueueStatus());
          } else {
            emitEvent('QUEUE_STATUS', getQueueStatus());
          }
          break;

        default:
          // Événement non géré
          console.warn(`Module download-queue: Événement non géré: ${type}`);
      }
    } catch (error) {
      handleError('EVENT_HANDLER_ERROR', `Erreur lors du traitement de l'événement ${type}`, error);
    }
  }

  /**
   * Traite les mises à jour de configuration
   * @param {Object} configData - Données de configuration
   * @private
   */
  function handleConfigUpdate(configData) {
    if (configData['download.maxConcurrent'] !== undefined) {
      state.maxConcurrentDownloads = configData['download.maxConcurrent'];
    }

    if (configData['download.retryLimit'] !== undefined) {
      state.retryLimit = configData['download.retryLimit'];
    }

    if (configData['download.retryDelay'] !== undefined) {
      state.retryDelay = configData['download.retryDelay'];
    }

    // Vérifier s'il faut démarrer de nouveaux téléchargements après mise à jour de la config
    processQueue();
  }

  /**
   * Ajoute un élément à la file d'attente
   * @param {Object} item - Élément à ajouter
   * @private
   */
  function addToQueue(item) {
    try {
      // Validation de l'élément
      if (!item || !item.id || !item.url) {
        throw new Error("Élément invalide pour la file d'attente");
      }

      // Vérifier si l'élément existe déjà
      const existingIndex = state.queue.findIndex((qItem) => qItem.id === item.id);
      if (existingIndex >= 0) {
        // Mettre à jour l'élément existant
        state.queue[existingIndex] = {
          ...state.queue[existingIndex],
          ...item,
          updatedAt: Date.now()
        };

        emitEvent('QUEUE_ITEM_UPDATED', state.queue[existingIndex]);
      } else {
        // Créer un nouvel élément
        const newItem = {
          ...item,
          status: 'queued',
          progress: 0,
          retries: 0,
          addedAt: Date.now(),
          updatedAt: Date.now()
        };

        // Ajouter à la file d'attente
        state.queue.push(newItem);
        stats.totalQueued++;

        // Émettre un événement
        emitEvent('QUEUE_ITEM_ADDED', newItem);
      }

      // Traiter la file d'attente
      processQueue();
    } catch (error) {
      handleError('QUEUE_ADD_ERROR', "Erreur lors de l'ajout à la file d'attente", error);
    }
  }

  /**
   * Supprime un élément de la file d'attente
   * @param {string} id - Identifiant de l'élément à supprimer
   * @private
   */
  function removeFromQueue(id) {
    try {
      // Rechercher l'élément
      const index = state.queue.findIndex((item) => item.id === id);

      if (index >= 0) {
        const item = state.queue[index];

        // Supprimer de la file d'attente
        state.queue.splice(index, 1);

        // Mettre à jour les stats
        if (item.status === 'active') {
          const activeIndex = state.activeDownloads.indexOf(id);
          if (activeIndex >= 0) {
            state.activeDownloads.splice(activeIndex, 1);
          }
          stats.totalCancelled++;
        }

        // Émettre un événement
        emitEvent('QUEUE_ITEM_REMOVED', { id });

        // Traiter la file d'attente pour démarrer le suivant
        processQueue();
      }
    } catch (error) {
      handleError('QUEUE_REMOVE_ERROR', `Erreur lors de la suppression de l'élément ${id}`, error);
    }
  }

  /**
   * Vide complètement la file d'attente
   * @private
   */
  function clearQueue() {
    try {
      // Sauvegarder les IDs des téléchargements actifs
      const activeIds = [...state.activeDownloads];

      // Vider la file d'attente
      state.queue = state.queue.filter((item) => activeIds.includes(item.id));

      // Émettre un événement
      emitEvent('QUEUE_CLEARED');
    } catch (error) {
      handleError('QUEUE_CLEAR_ERROR', "Erreur lors du vidage de la file d'attente", error);
    }
  }

  /**
   * Met la file d'attente en pause
   * @private
   */
  function pauseQueue() {
    if (!state.paused) {
      state.paused = true;
      emitEvent('QUEUE_PAUSED');
    }
  }

  /**
   * Reprend la file d'attente
   * @private
   */
  function resumeQueue() {
    if (state.paused) {
      state.paused = false;
      emitEvent('QUEUE_RESUMED');

      // Relancer le traitement de la file d'attente
      processQueue();
    }
  }

  /**
   * Traite un élément marqué comme terminé
   * @param {string} id - Identifiant de l'élément
   * @private
   */
  function handleItemCompleted(id) {
    try {
      // Trouver l'élément
      const item = state.queue.find((qItem) => qItem.id === id);

      if (item) {
        // Mettre à jour l'état
        item.status = 'completed';
        item.progress = 100;
        item.completedAt = Date.now();

        // Retirer des téléchargements actifs
        const activeIndex = state.activeDownloads.indexOf(id);
        if (activeIndex >= 0) {
          state.activeDownloads.splice(activeIndex, 1);
        }

        // Mettre à jour les stats
        stats.totalCompleted++;

        // Traiter la file d'attente pour le prochain élément
        processQueue();
      }
    } catch (error) {
      handleError(
        'ITEM_COMPLETION_ERROR',
        `Erreur lors du traitement de la complétion pour ${id}`,
        error
      );
    }
  }

  /**
   * Traite un élément marqué comme échoué
   * @param {string} id - Identifiant de l'élément
   * @param {Error|Object} error - Erreur rencontrée
   * @private
   */
  function handleItemFailed(id, error) {
    try {
      // Trouver l'élément
      const item = state.queue.find((qItem) => qItem.id === id);

      if (item) {
        // Incrémenter le compteur de tentatives
        item.retries = (item.retries || 0) + 1;

        // Retirer des téléchargements actifs
        const activeIndex = state.activeDownloads.indexOf(id);
        if (activeIndex >= 0) {
          state.activeDownloads.splice(activeIndex, 1);
        }

        // Vérifier si on peut réessayer
        if (item.retries <= state.retryLimit) {
          // Remettre en queue avec délai
          item.status = 'retry_pending';
          item.lastError = error;

          // Planifier une nouvelle tentative
          setTimeout(() => {
            if (item.status === 'retry_pending') {
              item.status = 'queued';
              processQueue();
            }
          }, state.retryDelay);
        } else {
          // Marquer comme échoué définitivement
          item.status = 'failed';
          item.lastError = error;
          stats.totalFailed++;
        }

        // Traiter la file d'attente pour le prochain élément
        processQueue();
      }
    } catch (error) {
      handleError('ITEM_FAILURE_ERROR', `Erreur lors du traitement de l'échec pour ${id}`, error);
    }
  }

  /**
   * Traite la file d'attente pour démarrer les téléchargements
   * @private
   */
  function processQueue() {
    // Ne rien faire si en pause
    if (state.paused) return;

    try {
      // Nombre de slots disponibles
      const availableSlots = state.maxConcurrentDownloads - state.activeDownloads.length;

      if (availableSlots <= 0) return;

      // Trouver les prochains éléments à télécharger
      const nextItems = state.queue
        .filter((item) => item.status === 'queued')
        .slice(0, availableSlots);

      // Démarrer les téléchargements
      for (const item of nextItems) {
        startDownload(item);
      }
    } catch (error) {
      handleError(
        'QUEUE_PROCESSING_ERROR',
        "Erreur lors du traitement de la file d'attente",
        error
      );
    }
  }

  /**
   * Démarre le téléchargement d'un élément
   * @param {Object} item - Élément à télécharger
   * @private
   */
  function startDownload(item) {
    try {
      // Mettre à jour l'état
      item.status = 'active';
      item.startedAt = Date.now();

      // Ajouter aux téléchargements actifs
      state.activeDownloads.push(item.id);

      // Émettre un événement de démarrage
      emitEvent('QUEUE_ITEM_DOWNLOAD_STARTED', item);

      // Émettre une demande de téléchargement
      emitEvent('DOWNLOAD_REQUEST', item);
    } catch (error) {
      handleError(
        'DOWNLOAD_START_ERROR',
        `Erreur lors du démarrage du téléchargement ${item.id}`,
        error
      );

      // Gérer l'échec
      handleItemFailed(item.id, error);
    }
  }

  /**
   * Récupère l'état actuel de la file d'attente
   * @returns {Object} État de la file d'attente
   * @private
   */
  function getQueueStatus() {
    const queuedCount = state.queue.filter((item) => item.status === 'queued').length;
    const activeCount = state.activeDownloads.length;
    const completedCount = state.queue.filter((item) => item.status === 'completed').length;
    const failedCount = state.queue.filter((item) => item.status === 'failed').length;
    const retryCount = state.queue.filter((item) => item.status === 'retry_pending').length;

    return {
      queued: queuedCount,
      active: activeCount,
      completed: completedCount,
      failed: failedCount,
      retrying: retryCount,
      total: state.queue.length,
      paused: state.paused,
      stats: { ...stats },
      items: state.queue.map((item) => ({
        id: item.id,
        url: item.url,
        title: item.title,
        status: item.status,
        progress: item.progress,
        source: item.source,
        addedAt: item.addedAt,
        startedAt: item.startedAt,
        completedAt: item.completedAt
      }))
    };
  }

  /**
   * Gère les erreurs du module
   * @param {string} code - Code d'erreur
   * @param {string} message - Message d'erreur
   * @param {Error} [error] - Objet d'erreur original
   * @private
   */
  function handleError(code, message, error) {
    console.error(`[download-queue] ${message}`, error);

    // Émettre un événement d'erreur
    emitEvent('QUEUE_ERROR', {
      code,
      message,
      timestamp: Date.now(),
      originalError: error ? error.message || String(error) : undefined
    });
  }

  /**
   * Émet un événement sur le bus d'événements
   * @param {string} type - Type d'événement
   * @param {Object} [data] - Données associées à l'événement
   * @private
   */
  function emitEvent(type, data) {
    window.dispatchEvent(
      new CustomEvent('EVENT_BUS', {
        detail: {
          type,
          data,
          source: 'download-queue'
        }
      })
    );
  }

  // Initialisation automatique
  initialize();

  // Exposer le module au système de modules de l'application
  // Cette méthode sera invoquée par le conteneur d'application
  window.registerModule = window.registerModule || {};
  window.registerModule['download-queue'] = {
    initialize
  };
})();

/**
 * Exemples d'utilisation (par événements, non implémentés directement ici):
 *
 * // Ajouter un élément à la file d'attente
 * emit('QUEUE_ADD_ITEM', {
 *   id: 'unique-id-123',
 *   url: 'https://youtube.com/watch?v=example',
 *   title: 'Titre de la chanson',
 *   artist: 'Nom de l\'artiste',
 *   album: 'Nom de l\'album',
 *   source: 'youtube',
 *   format: 'mp3',
 *   priority: 1
 * });
 *
 * // Obtenir l'état de la file d'attente
 * emit('QUEUE_GET_STATUS', null, (status) => {
 *   console.log('État de la file:', status);
 * });
 *
 * // Supprimer un élément
 * emit('QUEUE_REMOVE_ITEM', { id: 'unique-id-123' });
 *
 * // Mettre en pause la file d'attente
 * emit('QUEUE_PAUSE');
 *
 * // Reprendre la file d'attente
 * emit('QUEUE_RESUME');
 */ // File d'attente optimisée
// Créé automatiquement le 2025-05-02
