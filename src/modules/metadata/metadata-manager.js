/**
 * @fileoverview Gestionnaire de métadonnées pour l'application 21 BYTS
 *
 * Ce module centralise la gestion des métadonnées audio pour l'application 21 BYTS.
 * Il est responsable de la coordination des opérations d'extraction, modification
 * et organisation des métadonnées des fichiers audio téléchargés. Il interagit
 * avec le module tag-processor pour les opérations de bas niveau, mais expose
 * une interface de plus haut niveau via le bus d'événements.
 *
 * Conformément à l'architecture "Single File Component", ce module fonctionne
 * de manière totalement autonome, sans aucune dépendance directe sur d'autres
 * modules du projet. Toute communication se fait exclusivement via le bus d'événements.
 *
 * @module metadata/metadata-manager
 *
 * @events
 * ÉCOUTE:
 * - APP:READY - Initialise le gestionnaire lorsque l'application est prête
 * - CONFIG:UPDATED - Met à jour la configuration du gestionnaire
 * - DOWNLOAD:ITEM_COMPLETED - Traite les métadonnées d'un téléchargement terminé
 * - METADATA:EXTRACT_REQUEST - Demande d'extraction des métadonnées d'un fichier
 * - METADATA:UPDATE_REQUEST - Demande de mise à jour des métadonnées d'un fichier
 * - METADATA:EXTRACT_FROM_URL - Demande d'extraction des métadonnées depuis une URL
 * - METADATA:BATCH_UPDATE - Demande de mise à jour groupée de métadonnées
 * - METADATA:EXTRACTED - Reçoit les métadonnées extraites par tag-processor
 * - METADATA:EXTRACT_ERROR - Reçoit les erreurs d'extraction de tag-processor
 * - METADATA:UPDATED - Reçoit la confirmation de mise à jour de tag-processor
 * - METADATA:UPDATE_ERROR - Reçoit les erreurs de mise à jour de tag-processor
 *
 * ÉMET:
 * - METADATA:EXTRACT_REQUEST - Demande l'extraction des métadonnées à tag-processor
 * - METADATA:UPDATE_REQUEST - Demande la mise à jour des métadonnées à tag-processor
 * - METADATA:PROCESSED - Informe que les métadonnées ont été traitées
 * - METADATA:PROCESS_ERROR - Informe d'une erreur de traitement de métadonnées
 * - METADATA:NORMALIZED - Informe que les métadonnées ont été normalisées
 * - ERROR:NON_CRITICAL - Signale une erreur non critique
 * - LOG:INFO - Publie un message d'information
 * - LOG:WARNING - Publie un message d'avertissement
 * - LOG:ERROR - Publie un message d'erreur
 */

'use strict';

// Dépendances Node.js standard uniquement
const path = require('path');
const os = require('os');
const { URL } = require('url');

/**
 * MetadataManager - Gestionnaire centralisé de métadonnées audio
 */
function MetadataManager() {
  // Bus d'événements - sera injecté lors de l'initialisation
  let eventBus = null;

  // Références aux types d'événements et codes d'erreur standardisés
  let EVENT_TYPES = null;
  let ERROR_CODES = null;

  // Configuration par défaut
  const DEFAULT_CONFIG = {
    // Options de normalisation des métadonnées
    normalizeMetadata: true,
    convertToUTF8: true,
    standardizeTitles: true,       // Standardise la casse des titres
    removeDuplicateTags: true,     // Supprime les tags en double

    // Options des pochettes
    extractArtwork: true,          // Extraire les pochettes lors du traitement
    embedArtwork: true,            // Inclure les pochettes dans les fichiers
    artworkFolder: '',             // Dossier pour stocker les pochettes (sera configuré automatiquement)
    minArtworkSize: 500,           // Taille minimale en pixels pour les pochettes (carré)
    maxArtworkSize: 1500,          // Taille maximale en pixels pour les pochettes
    artworkFormat: 'jpeg',         // Format préféré pour les pochettes
    artworkQuality: 90,            // Qualité JPEG (0-100)
    keepOriginalArtwork: true,     // Conserver les pochettes originales

    // Options de gestion des erreurs
    retryOnError: true,            // Réessayer en cas d'erreur
    maxRetries: 3,                 // Nombre maximal de tentatives
    ignoreMinorErrors: true,       // Ignorer les erreurs mineures

    // Options de performance
    batchProcessing: true,         // Traitement par lots
    maxBatchSize: 10,              // Taille maximale des lots

    // Comportement automatique
    processDownloadsAutomatically: true,  // Traiter automatiquement les téléchargements
    writeMetadataOnProcessing: true,      // Écrire les métadonnées lors du traitement

    // Options spécifiques aux services
    serviceSpecificRules: {        // Règles spécifiques par service
      youtube: {
        extractArtistFromTitle: true,  // Extrait l'artiste du titre (format "Artiste - Titre")
        removeCommonSuffixes: true     // Supprime les suffixes courants ("Official Video", etc.)
      },
      soundcloud: {
        preferOriginalMetadata: true   // Préfère les métadonnées originales de SoundCloud
      },
      bandcamp: {
        preferOriginalMetadata: true   // Préfère les métadonnées originales de Bandcamp
      },
      spotify: {
        preferOriginalMetadata: true   // Préfère les métadonnées originales de Spotify
      },
      tidal: {
        preferOriginalMetadata: true   // Préfère les métadonnées originales de Tidal
      }
    }
  };

  // Configuration active
  let config = { ...DEFAULT_CONFIG };

  // État interne
  let state = {
    initialized: false,
    pendingRequests: new Map(),    // Requêtes en attente de traitement
    processingQueue: [],           // File d'attente de traitement
    processingBatch: false,        // Indique si un lot est en cours de traitement
    metadataCache: new Map(),      // Cache des métadonnées déjà traitées
    errorCounts: new Map(),        // Compteur d'erreurs par fichier
    isProcessingEnabled: true      // Indicateur d'activation du traitement
  };

  /**
   * Initialise le gestionnaire de métadonnées
   * @param {Object} injectedEventBus - Le bus d'événements à utiliser
   * @param {Object} eventTypes - Les types d'événements standardisés
   * @param {Object} errorCodes - Les codes d'erreur standardisés
   */
  function initialize(injectedEventBus, eventTypes, errorCodes) {
    if (!injectedEventBus) {
      console.error('MetadataManager: Bus d\'événements requis pour l\'initialisation');
      return;
    }

    eventBus = injectedEventBus;
    EVENT_TYPES = eventTypes || {};
    ERROR_CODES = errorCodes || {};

    // Configurer le dossier d'artwork par défaut
    config.artworkFolder = path.join(os.homedir(), '.21byts', 'artwork');

    // S'abonner aux événements
    registerEventListeners();

    state.initialized = true;

    // Publier un message d'information
    logInfo('Module MetadataManager initialisé');
  }

  /**
   * S'abonne aux événements pertinents
   */
  function registerEventListeners() {
    // Événements système
    eventBus.subscribe(EVENT_TYPES.APP.READY, handleAppReady);
    eventBus.subscribe(EVENT_TYPES.CONFIG.UPDATED, handleConfigUpdate);

    // Événements de téléchargement
    eventBus.subscribe(EVENT_TYPES.DOWNLOAD.ITEM_COMPLETED, handleDownloadCompleted);

    // Événements de métadonnées (demandes)
    eventBus.subscribe(EVENT_TYPES.METADATA.EXTRACT_REQUEST, handleExtractRequest);
    eventBus.subscribe(EVENT_TYPES.METADATA.UPDATE_REQUEST, handleUpdateRequest);
    eventBus.subscribe(EVENT_TYPES.METADATA.EXTRACT_FROM_URL, handleExtractFromUrl);
    eventBus.subscribe(EVENT_TYPES.METADATA.BATCH_UPDATE, handleBatchUpdate);

    // Événements de métadonnées (réponses de tag-processor)
    eventBus.subscribe(EVENT_TYPES.METADATA.EXTRACTED, handleMetadataExtracted);
    eventBus.subscribe(EVENT_TYPES.METADATA.EXTRACT_ERROR, handleMetadataExtractError);
    eventBus.subscribe(EVENT_TYPES.METADATA.UPDATED, handleMetadataUpdated);
    eventBus.subscribe(EVENT_TYPES.METADATA.UPDATE_ERROR, handleMetadataUpdateError);
  }

  /**
   * Gère l'événement de démarrage de l'application
   */
  function handleAppReady() {
    // Demander la configuration spécifique au module
    eventBus.publish(EVENT_TYPES.CONFIG.GET, {
      key: 'metadata',
      requestId: 'metadata-manager-init'
    });

    logInfo('MetadataManager prêt');
  }

  /**
   * Gère les mises à jour de configuration
   * @param {Object} data - Données de configuration mises à jour
   */
  function handleConfigUpdate(data) {
    if (!data || !data.metadata) {
      return;
    }

    const metadataConfig = data.metadata;

    // Mettre à jour la configuration
    Object.keys(metadataConfig).forEach(key => {
      if (config.hasOwnProperty(key)) {
        if (key === 'serviceSpecificRules' && metadataConfig[key]) {
          // Fusion spéciale pour les règles spécifiques aux services
          config[key] = {
            ...config[key],
            ...metadataConfig[key]
          };
        } else {
          config[key] = metadataConfig[key];
        }
      }
    });

    logInfo('Configuration mise à jour');
  }

  /**
   * Gère la fin d'un téléchargement
   * @param {Object} data - Données du téléchargement terminé
   */
  function handleDownloadCompleted(data) {
    if (!config.processDownloadsAutomatically || !data || !data.filePath) {
      return;
    }

    // Extraire les informations du téléchargement
    const filePath = data.filePath;
    const sourceType = data.sourceType || 'unknown';
    const sourceMetadata = data.metadata || {};
    const downloadId = data.downloadId || generateRequestId('download');

    logInfo(`Traitement automatique des métadonnées pour: ${filePath}`);

    // Demander l'extraction des métadonnées actuelles du fichier
    const requestId = generateRequestId('extract');

    // Stocker la demande en attente
    state.pendingRequests.set(requestId, {
      type: 'download-completed',
      filePath,
      sourceType,
      sourceMetadata,
      downloadId,
      timestamp: Date.now()
    });

    // Demander l'extraction des métadonnées du fichier
    eventBus.publish(EVENT_TYPES.METADATA.EXTRACT_REQUEST, {
      requestId,
      filePath,
      options: {
        includeArtwork: config.extractArtwork
      }
    });
  }

  /**
   * Gère une demande d'extraction de métadonnées
   * @param {Object} data - Données de la demande
   */
  function handleExtractRequest(data) {
    if (!data || !data.filePath) {
      publishError('INVALID_REQUEST', 'Chemin de fichier manquant dans la demande d\'extraction');

      if (data && data.requestId) {
        eventBus.publish(EVENT_TYPES.METADATA.PROCESS_ERROR, {
          requestId: data.requestId,
          error: 'Chemin de fichier manquant'
        });
      }

      return;
    }

    const filePath = data.filePath;
    const options = data.options || {};

    // Générer un ID de requête si non fourni
    const requestId = data.requestId || generateRequestId('extract');

    // Stocker la demande en attente
    state.pendingRequests.set(requestId, {
      type: 'direct-extract',
      filePath,
      options,
      timestamp: Date.now()
    });

    // Relayer la demande au module tag-processor
    eventBus.publish(EVENT_TYPES.METADATA.EXTRACT_REQUEST, {
      requestId,
      filePath,
      options
    });
  }

  /**
   * Gère une demande de mise à jour de métadonnées
   * @param {Object} data - Données de la demande
   */
  function handleUpdateRequest(data) {
    if (!data || !data.filePath || !data.metadata) {
      publishError('INVALID_REQUEST', 'Données invalides dans la demande de mise à jour');

      if (data && data.requestId) {
        eventBus.publish(EVENT_TYPES.METADATA.PROCESS_ERROR, {
          requestId: data.requestId,
          error: 'Données invalides'
        });
      }

      return;
    }

    const filePath = data.filePath;
    const metadata = data.metadata;
    const options = data.options || {};

    // Générer un ID de requête si non fourni
    const requestId = data.requestId || generateRequestId('update');

    // Normaliser les métadonnées si configuré
    let processedMetadata = metadata;
    if (config.normalizeMetadata && options.normalize !== false) {
      processedMetadata = normalizeMetadata(metadata, {
        sourceType: options.sourceType,
        standardizeTitles: config.standardizeTitles && options.standardizeTitles !== false,
        removeDuplicates: config.removeDuplicateTags && options.removeDuplicates !== false
      });
    }

    // Stocker la demande en attente
    state.pendingRequests.set(requestId, {
      type: 'direct-update',
      filePath,
      originalMetadata: metadata,
      processedMetadata,
      options,
      timestamp: Date.now()
    });

    // Relayer la demande au module tag-processor
    eventBus.publish(EVENT_TYPES.METADATA.UPDATE_REQUEST, {
      requestId,
      filePath,
      metadata: processedMetadata,
      options
    });
  }

  /**
   * Gère une demande d'extraction de métadonnées depuis une URL
   * @param {Object} data - Données de la demande
   */
  function handleExtractFromUrl(data) {
    if (!data || !data.url) {
      publishError('INVALID_REQUEST', 'URL manquante dans la demande d\'extraction');

      if (data && data.requestId) {
        eventBus.publish(EVENT_TYPES.METADATA.PROCESS_ERROR, {
          requestId: data.requestId,
          error: 'URL manquante'
        });
      }

      return;
    }

    const url = data.url;
    const options = data.options || {};

    // Générer un ID de requête si non fourni
    const requestId = data.requestId || generateRequestId('extract-url');

    // Détecter le type de source à partir de l'URL
    const sourceType = detectSourceType(url);

    // Pour l'instant, nous dépendons des adaptateurs spécifiques aux services
    // pour extraire les métadonnées depuis les URLs. Relayer la demande.
    switch (sourceType) {
      case 'youtube':
        eventBus.publish(EVENT_TYPES.ADAPTER.YOUTUBE.ANALYSIS_START, {
          requestId,
          url,
          extractMetadata: true,
          options
        });
        break;

      case 'bandcamp':
        eventBus.publish(EVENT_TYPES.ADAPTER.BANDCAMP.ANALYSIS_START, {
          requestId,
          url,
          extractMetadata: true,
          options
        });
        break;

      case 'soundcloud':
        eventBus.publish(EVENT_TYPES.ADAPTER.SOUNDCLOUD.ANALYSIS_START, {
          requestId,
          url,
          extractMetadata: true,
          options
        });
        break;

      case 'spotify':
        eventBus.publish(EVENT_TYPES.ADAPTER.SPOTIFY.ANALYSIS_START, {
          requestId,
          url,
          extractMetadata: true,
          options
        });
        break;

      case 'tidal':
        eventBus.publish(EVENT_TYPES.ADAPTER.TIDAL.ANALYSIS_START, {
          requestId,
          url,
          extractMetadata: true,
          options
        });
        break;

      default:
        // Source non reconnue
        publishError('UNSUPPORTED_SOURCE', `Source non supportée pour l'extraction de métadonnées: ${sourceType}`);

        eventBus.publish(EVENT_TYPES.METADATA.PROCESS_ERROR, {
          requestId,
          url,
          error: `Source non supportée: ${sourceType}`
        });
    }
  }

  /**
   * Gère une demande de mise à jour groupée de métadonnées
   * @param {Object} data - Données de la demande
   */
  function handleBatchUpdate(data) {
    if (!data || !data.items || !Array.isArray(data.items) || data.items.length === 0) {
      publishError('INVALID_REQUEST', 'Données invalides dans la demande de mise à jour groupée');

      if (data && data.requestId) {
        eventBus.publish(EVENT_TYPES.METADATA.PROCESS_ERROR, {
          requestId: data.requestId,
          error: 'Données invalides'
        });
      }

      return;
    }

    const items = data.items;
    const options = data.options || {};
    const requestId = data.requestId || generateRequestId('batch');

    // Vérifier chaque élément du lot
    const validItems = items.filter(item => {
      return item && item.filePath && item.metadata;
    });

    if (validItems.length === 0) {
      publishError('INVALID_BATCH_ITEMS', 'Aucun élément valide dans la demande de mise à jour groupée');

      eventBus.publish(EVENT_TYPES.METADATA.PROCESS_ERROR, {
        requestId,
        error: 'Aucun élément valide'
      });

      return;
    }

    // Ajouter les éléments à la file d'attente de traitement
    validItems.forEach(item => {
      const itemRequestId = generateRequestId('batch-item');

      // Stocker les informations de traitement par lot
      state.pendingRequests.set(itemRequestId, {
        type: 'batch-item',
        batchId: requestId,
        filePath: item.filePath,
        metadata: item.metadata,
        options: { ...options, ...item.options },
        timestamp: Date.now()
      });

      // Ajouter à la file d'attente de traitement
      state.processingQueue.push({
        requestId: itemRequestId,
        filePath: item.filePath,
        metadata: item.metadata,
        options: { ...options, ...item.options }
      });
    });

    // Commencer le traitement si ce n'est pas déjà en cours
    if (!state.processingBatch) {
      processBatch();
    }

    logInfo(`Mise à jour groupée programmée: ${validItems.length} éléments`);
  }

  /**
   * Traite un lot d'éléments dans la file d'attente
   */
  function processBatch() {
    if (state.processingQueue.length === 0) {
      state.processingBatch = false;
      return;
    }

    state.processingBatch = true;

    // Extraire un nombre limité d'éléments selon la taille de lot configurée
    const batchSize = Math.min(config.maxBatchSize, state.processingQueue.length);
    const batch = state.processingQueue.splice(0, batchSize);

    // Traiter chaque élément du lot
    let processedCount = 0;

    batch.forEach(item => {
      // Normaliser les métadonnées si configuré
      if (config.normalizeMetadata) {
        item.metadata = normalizeMetadata(item.metadata, {
          sourceType: item.options.sourceType,
          standardizeTitles: config.standardizeTitles,
          removeDuplicates: config.removeDuplicateTags
        });
      }

      // Publier la demande de mise à jour
      eventBus.publish(EVENT_TYPES.METADATA.UPDATE_REQUEST, {
        requestId: item.requestId,
        filePath: item.filePath,
        metadata: item.metadata,
        options: item.options
      });

      processedCount++;
    });

    logInfo(`Traitement par lot en cours: ${processedCount} éléments`);

    // Vérifier s'il reste des éléments à traiter après un délai
    setTimeout(() => {
      if (state.processingQueue.length > 0) {
        processBatch();
      } else {
        state.processingBatch = false;
      }
    }, 100);
  }

  /**
   * Gère la réception des métadonnées extraites
   * @param {Object} data - Métadonnées extraites
   */
  function handleMetadataExtracted(data) {
    if (!data || !data.requestId || !data.metadata) {
      return;
    }

    const requestId = data.requestId;

    // Rechercher la demande correspondante
    if (!state.pendingRequests.has(requestId)) {
      return;
    }

    const request = state.pendingRequests.get(requestId);

    // Traiter selon le type de demande
    switch (request.type) {
      case 'download-completed':
        processDownloadMetadata(requestId, request, data.metadata);
        break;

      case 'direct-extract':
        processDirectExtract(requestId, request, data.metadata);
        break;

      default:
        // Relayer simplement les métadonnées extraites
        eventBus.publish(EVENT_TYPES.METADATA.PROCESSED, {
          requestId,
          filePath: request.filePath,
          metadata: data.metadata,
          fromCache: data.fromCache
        });
    }

    // Nettoyer la demande
    state.pendingRequests.delete(requestId);
  }

  /**
   * Gère les erreurs d'extraction de métadonnées
   * @param {Object} data - Données d'erreur
   */
  function handleMetadataExtractError(data) {
    if (!data || !data.requestId) {
      return;
    }

    const requestId = data.requestId;

    // Rechercher la demande correspondante
    if (!state.pendingRequests.has(requestId)) {
      return;
    }

    const request = state.pendingRequests.get(requestId);

    // Incrémenter le compteur d'erreurs pour ce fichier
    const errorCount = state.errorCounts.get(request.filePath) || 0;
    state.errorCounts.set(request.filePath, errorCount + 1);

    // Vérifier si nous devons réessayer
    if (config.retryOnError && errorCount < config.maxRetries) {
      logWarning(`Réessai d'extraction des métadonnées: ${request.filePath} (tentative ${errorCount + 1})`);

      // Réessayer après un court délai
      setTimeout(() => {
        eventBus.publish(EVENT_TYPES.METADATA.EXTRACT_REQUEST, {
          requestId,
          filePath: request.filePath,
          options: request.options
        });
      }, 1000);

      return;
    }

    // Erreur définitive, relayer l'erreur
    eventBus.publish(EVENT_TYPES.METADATA.PROCESS_ERROR, {
      requestId,
      filePath: request.filePath,
      error: data.error
    });

    // Nettoyer la demande
    state.pendingRequests.delete(requestId);
  }

  /**
   * Gère la confirmation de mise à jour des métadonnées
   * @param {Object} data - Données de confirmation
   */
  function handleMetadataUpdated(data) {
    if (!data || !data.requestId) {
      return;
    }

    const requestId = data.requestId;

    // Rechercher la demande correspondante
    if (!state.pendingRequests.has(requestId)) {
      return;
    }

    const request = state.pendingRequests.get(requestId);

    // Traiter selon le type de demande
    switch (request.type) {
      case 'batch-item':
        // Vérifier si c'était le dernier élément du lot
        const batchId = request.batchId;
        const remainingItems = Array.from(state.pendingRequests.values())
          .filter(item => item.type === 'batch-item' && item.batchId === batchId);

        // Si c'était le dernier élément, publier la confirmation du lot
        if (remainingItems.length <= 1) {
          eventBus.publish(EVENT_TYPES.METADATA.BATCH_COMPLETED, {
            requestId: batchId,
            itemsProcessed: Array.from(state.pendingRequests.keys())
              .filter(key => {
                const item = state.pendingRequests.get(key);
                return item && item.type === 'batch-item' && item.batchId === batchId;
              })
          });
        }
        break;

      default:
        // Relayer simplement la confirmation
        eventBus.publish(EVENT_TYPES.METADATA.PROCESSED, {
          requestId,
          filePath: request.filePath,
          metadata: data.metadata || request.processedMetadata
        });
    }

    // Nettoyer la demande
    state.pendingRequests.delete(requestId);

    // Réinitialiser le compteur d'erreurs pour ce fichier
    state.errorCounts.delete(request.filePath);
  }

  /**
   * Gère les erreurs de mise à jour des métadonnées
   * @param {Object} data - Données d'erreur
   */
  function handleMetadataUpdateError(data) {
    if (!data || !data.requestId) {
      return;
    }

    const requestId = data.requestId;

    // Rechercher la demande correspondante
    if (!state.pendingRequests.has(requestId)) {
      return;
    }

    const request = state.pendingRequests.get(requestId);

    // Incrémenter le compteur d'erreurs pour ce fichier
    const errorCount = state.errorCounts.get(request.filePath) || 0;
    state.errorCounts.set(request.filePath, errorCount + 1);

    // Vérifier si nous devons réessayer
    if (config.retryOnError && errorCount < config.maxRetries) {
      logWarning(`Réessai de mise à jour des métadonnées: ${request.filePath} (tentative ${errorCount + 1})`);

      // Réessayer après un court délai
      setTimeout(() => {
        eventBus.publish(EVENT_TYPES.METADATA.UPDATE_REQUEST, {
          requestId,
          filePath: request.filePath,
          metadata: request.processedMetadata || request.metadata,
          options: request.options
        });
      }, 1000);

      return;
    }

    // Erreur définitive, relayer l'erreur
    eventBus.publish(EVENT_TYPES.METADATA.PROCESS_ERROR, {
      requestId,
      filePath: request.filePath,
      error: data.error
    });

    // Si c'était un élément d'un lot, vérifier s'il reste d'autres éléments
    if (request.type === 'batch-item' && request.batchId) {
      const batchId = request.batchId;
      const remainingItems = Array.from(state.pendingRequests.values())
        .filter(item => item.type === 'batch-item' && item.batchId === batchId);

      // Si c'était le dernier élément, publier la confirmation du lot avec erreur
      if (remainingItems.length <= 1) {
        eventBus.publish(EVENT_TYPES.METADATA.BATCH_COMPLETED, {
          requestId: batchId,
          itemsProcessed: Array.from(state.pendingRequests.keys())
            .filter(key => {
              const item = state.pendingRequests.get(key);
              return item && item.type === 'batch-item' && item.batchId === batchId;
            }),
          hasErrors: true
        });
      }
    }

    // Nettoyer la demande
    state.pendingRequests.delete(requestId);
  }

  /**
   * Traite les métadonnées d'un téléchargement terminé
   * @param {string} requestId - ID de la requête
   * @param {Object} request - Informations sur la demande
   * @param {Object} fileMetadata - Métadonnées extraites du fichier
   */
  /**
   * Traite les métadonnées d'un téléchargement terminé
   * @param {string} requestId - ID de la requête
   * @param {Object} request - Informations sur la demande
   * @param {Object} fileMetadata - Métadonnées extraites du fichier
   */
  function processDownloadMetadata(requestId, request, fileMetadata) {
    const filePath = request.filePath;
    const sourceType = request.sourceType;
    const sourceMetadata = request.sourceMetadata;
    const downloadId = request.downloadId;

    // Combiner les métadonnées sources avec celles extraites du fichier
    const combinedMetadata = mergeMetadata(sourceMetadata, fileMetadata, {
      sourceType,
      preferOriginal: getServicePreference(sourceType, 'preferOriginalMetadata')
    });

    // Normaliser les métadonnées
    const processedMetadata = normalizeMetadata(combinedMetadata, {
      sourceType,
      standardizeTitles: config.standardizeTitles,
      removeDuplicates: config.removeDuplicateTags,
      extractArtistFromTitle: getServicePreference(sourceType, 'extractArtistFromTitle'),
      removeCommonSuffixes: getServicePreference(sourceType, 'removeCommonSuffixes')
    });

    // Publier les métadonnées traitées
    eventBus.publish(EVENT_TYPES.METADATA.PROCESSED, {
      requestId,
      filePath,
      sourceType,
      metadata: processedMetadata,
      downloadId
    });

    // Si configuré pour écrire les métadonnées lors du traitement
    if (config.writeMetadataOnProcessing) {
      const updateRequestId = generateRequestId('update-processed');

      // Stocker la demande en attente
      state.pendingRequests.set(updateRequestId, {
        type: 'processed-update',
        originalRequestId: requestId,
        filePath,
        metadata: processedMetadata,
        options: {
          sourceType
        },
        timestamp: Date.now()
      });

      // Demander la mise à jour des métadonnées
      eventBus.publish(EVENT_TYPES.METADATA.UPDATE_REQUEST, {
        requestId: updateRequestId,
        filePath,
        metadata: processedMetadata,
        options: {
          sourceType
        }
      });

      logInfo(`Mise à jour des métadonnées pour: ${filePath}`);
    }
  }

  /**
   * Traite une demande directe d'extraction de métadonnées
   * @param {string} requestId - ID de la requête
   * @param {Object} request - Informations sur la demande
   * @param {Object} metadata - Métadonnées extraites
   */
  function processDirectExtract(requestId, request, metadata) {
    const filePath = request.filePath;
    const options = request.options;

    // Normaliser les métadonnées si configuré
    const processedMetadata = config.normalizeMetadata && options.normalize !== false
      ? normalizeMetadata(metadata, {
          sourceType: options.sourceType,
          standardizeTitles: config.standardizeTitles && options.standardizeTitles !== false,
          removeDuplicates: config.removeDuplicateTags && options.removeDuplicates !== false
        })
      : metadata;

    // Publier les métadonnées traitées
    eventBus.publish(EVENT_TYPES.METADATA.PROCESSED, {
      requestId,
      filePath,
      metadata: processedMetadata
    });

    // Stocker dans le cache
    state.metadataCache.set(filePath, processedMetadata);
  }

  /**
   * Normalise les métadonnées
   * @param {Object} metadata - Métadonnées à normaliser
   * @param {Object} options - Options de normalisation
   * @returns {Object} Métadonnées normalisées
   */
  function normalizeMetadata(metadata, options = {}) {
    if (!metadata) {
      return {};
    }

    // Créer une copie pour éviter de modifier l'original
    const normalized = { ...metadata };

    // Standardiser la casse des titres
    if (options.standardizeTitles && normalized.title) {
      normalized.title = standardizeTitle(normalized.title);
    }

    // Extraire l'artiste du titre si configuré et nécessaire
    if (options.extractArtistFromTitle &&
        options.sourceType === 'youtube' &&
        normalized.title &&
        !normalized.artist) {
      const extracted = extractArtistFromTitle(normalized.title);
      if (extracted.artist) {
        normalized.artist = extracted.artist;
        normalized.title = extracted.title;
      }
    }

    // Supprimer les suffixes communs
    if (options.removeCommonSuffixes && normalized.title) {
      normalized.title = removeCommonSuffixes(normalized.title);
    }

    // Supprimer les tags en double
    if (options.removeDuplicates) {
      // Implémenter si nécessaire
    }

    // Publier un événement de normalisation
    eventBus.publish(EVENT_TYPES.METADATA.NORMALIZED, {
      original: metadata,
      normalized: normalized,
      changes: Object.keys(normalized).filter(key => normalized[key] !== metadata[key])
    });

    return normalized;
  }

  /**
   * Fusionne les métadonnées de différentes sources
   * @param {Object} sourceMetadata - Métadonnées de la source (URL)
   * @param {Object} fileMetadata - Métadonnées extraites du fichier
   * @param {Object} options - Options de fusion
   * @returns {Object} Métadonnées fusionnées
   */
  function mergeMetadata(sourceMetadata, fileMetadata, options = {}) {
    // Par défaut, nous donnons la priorité aux métadonnées de la source
    const preferSource = options.preferOriginal === true;

    // Créer un nouvel objet pour les métadonnées fusionnées
    const merged = {};

    // Établir la liste des champs à considérer
    const fields = new Set([
      ...Object.keys(sourceMetadata || {}),
      ...Object.keys(fileMetadata || {})
    ]);

    // Parcourir tous les champs
    for (const field of fields) {
      // Ignorer les champs spéciaux commençant par un underscore
      if (field.startsWith('_')) {
        continue;
      }

      // Déterminer la valeur à utiliser
      if (preferSource && sourceMetadata && sourceMetadata[field] !== undefined && sourceMetadata[field] !== null) {
        merged[field] = sourceMetadata[field];
      } else if (fileMetadata && fileMetadata[field] !== undefined && fileMetadata[field] !== null) {
        merged[field] = fileMetadata[field];
      } else if (sourceMetadata && sourceMetadata[field] !== undefined && sourceMetadata[field] !== null) {
        merged[field] = sourceMetadata[field];
      }
    }

    // Ajouter les informations de fichier si disponibles
    if (fileMetadata && fileMetadata._fileInfo) {
      merged._fileInfo = fileMetadata._fileInfo;
    }

    // Ajouter les informations de pochette si disponibles
    if (fileMetadata && fileMetadata._hasArtwork !== undefined) {
      merged._hasArtwork = fileMetadata._hasArtwork;
    }

    return merged;
  }

  /**
   * Standardise la casse d'un titre
   * @param {string} title - Titre à standardiser
   * @returns {string} Titre standardisé
   */
  function standardizeTitle(title) {
    if (!title) return title;

    // Liste des mots qui ne sont pas capitalisés (sauf en début de phrase)
    const lowercaseWords = new Set([
      'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet',
      'at', 'by', 'for', 'from', 'in', 'into', 'of', 'off', 'on', 'onto',
      'out', 'over', 'to', 'up', 'with', 'as'
    ]);

    // Diviser en mots
    const words = title.split(' ');

    // Capitaliser chaque mot sauf exceptions
    const capitalized = words.map((word, index) => {
      // Toujours capitaliser le premier mot et le dernier mot
      if (index === 0 || index === words.length - 1) {
        return capitalizeFirstLetter(word);
      }

      // Ne pas capitaliser les mots de la liste sauf s'ils suivent un signe de ponctuation
      const lowerWord = word.toLowerCase();
      if (lowercaseWords.has(lowerWord) && !words[index - 1].endsWith(':')) {
        return lowerWord;
      }

      return capitalizeFirstLetter(word);
    });

    return capitalized.join(' ');
  }

  /**
   * Capitalise la première lettre d'un mot
   * @param {string} word - Mot à capitaliser
   * @returns {string} Mot avec la première lettre en majuscule
   */
  function capitalizeFirstLetter(word) {
    if (!word) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }

  /**
   * Extrait l'artiste et le titre d'une chaîne combinée (format "Artiste - Titre")
   * @param {string} combinedTitle - Titre combiné
   * @returns {Object} Objet avec les propriétés artiste et titre
   */
  function extractArtistFromTitle(combinedTitle) {
    if (!combinedTitle) {
      return { artist: '', title: '' };
    }

    // Rechercher le format "Artiste - Titre"
    const match = combinedTitle.match(/^(.*?)\s*[-–—]\s*(.*)$/);

    if (match) {
      return {
        artist: match[1].trim(),
        title: match[2].trim()
      };
    }

    // Si le format n'est pas détecté, renvoyer le titre original
    return {
      artist: '',
      title: combinedTitle
    };
  }

  /**
   * Supprime les suffixes courants des titres de vidéos
   * @param {string} title - Titre à nettoyer
   * @returns {string} Titre nettoyé
   */
  function removeCommonSuffixes(title) {
    if (!title) return title;

    // Liste des suffixes courants à supprimer
    const commonSuffixes = [
      '\\(Official Video\\)',
      '\\(Official Music Video\\)',
      '\\(Official Audio\\)',
      '\\(Official Lyric Video\\)',
      '\\(Lyric Video\\)',
      '\\(Lyrics\\)',
      '\\(Audio\\)',
      '\\(Music Video\\)',
      '\\[Official Video\\]',
      '\\[Official Music Video\\]',
      '\\[Official Audio\\]',
      '\\[Official Lyric Video\\]',
      '\\[Lyric Video\\]',
      '\\[Lyrics\\]',
      '\\[Audio\\]',
      '\\[Music Video\\]',
      'Official Video',
      'Official Music Video',
      'Official Audio',
      'Official Lyric Video',
      'Lyric Video',
      'Video',
      'Audio',
      'HD',
      '4K',
      '8K',
      'HQ'
    ];

    // Créer une expression régulière pour tous les suffixes
    const suffixPattern = new RegExp(`\\s*(${commonSuffixes.join('|')})\\s*/**
 * @fileoverview Gestionnaire de métadonnées pour l'application 21 BYTS
 *
 * Ce module centralise la gestion des métadonnées audio pour l'application 21 BYTS.
 * Il est responsable de la coordination des opérations d'extraction, modification
 * et organisation des métadonnées des fichiers audio téléchargés. Il interagit
 * avec le module tag-processor pour les opérations de bas niveau, mais expose
 * une interface de plus haut niveau via le bus d'événements.
 *
 * Conformément à l'architecture "Single File Component", ce module fonctionne
 * de manière totalement autonome, sans aucune dépendance directe sur d'autres
 * modules du projet. Toute communication se fait exclusivement via le bus d'événements.
 *
 * @module metadata/metadata-manager
 *
 * @events
 * ÉCOUTE:
 * - APP:READY - Initialise le gestionnaire lorsque l'application est prête
 * - CONFIG:UPDATED - Met à jour la configuration du gestionnaire
 * - DOWNLOAD:ITEM_COMPLETED - Traite les métadonnées d'un téléchargement terminé
 * - METADATA:EXTRACT_REQUEST - Demande d'extraction des métadonnées d'un fichier
 * - METADATA:UPDATE_REQUEST - Demande de mise à jour des métadonnées d'un fichier
 * - METADATA:EXTRACT_FROM_URL - Demande d'extraction des métadonnées depuis une URL
 * - METADATA:BATCH_UPDATE - Demande de mise à jour groupée de métadonnées
 * - METADATA:EXTRACTED - Reçoit les métadonnées extraites par tag-processor
 * - METADATA:EXTRACT_ERROR - Reçoit les erreurs d'extraction de tag-processor
 * - METADATA:UPDATED - Reçoit la confirmation de mise à jour de tag-processor
 * - METADATA:UPDATE_ERROR - Reçoit les erreurs de mise à jour de tag-processor
 *
 * ÉMET:
 * - METADATA:EXTRACT_REQUEST - Demande l'extraction des métadonnées à tag-processor
 * - METADATA:UPDATE_REQUEST - Demande la mise à jour des métadonnées à tag-processor
 * - METADATA:PROCESSED - Informe que les métadonnées ont été traitées
 * - METADATA:PROCESS_ERROR - Informe d'une erreur de traitement de métadonnées
 * - METADATA:NORMALIZED - Informe que les métadonnées ont été normalisées
 * - ERROR:NON_CRITICAL - Signale une erreur non critique
 * - LOG:INFO - Publie un message d'information
 * - LOG:WARNING - Publie un message d'avertissement
 * - LOG:ERROR - Publie un message d'erreur
 */

'use strict';

// Dépendances Node.js standard uniquement
const path = require('path');
const os = require('os');
const { URL } = require('url');

/**
 * MetadataManager - Gestionnaire centralisé de métadonnées audio
 */
function MetadataManager() {
  // Bus d'événements - sera injecté lors de l'initialisation
  let eventBus = null;

  // Références aux types d'événements et codes d'erreur standardisés
  let EVENT_TYPES = null;
  let ERROR_CODES = null;

  // Configuration par défaut
  const DEFAULT_CONFIG = {
    // Options de normalisation des métadonnées
    normalizeMetadata: true,
    convertToUTF8: true,
    standardizeTitles: true,       // Standardise la casse des titres
    removeDuplicateTags: true,     // Supprime les tags en double

    // Options des pochettes
    extractArtwork: true,          // Extraire les pochettes lors du traitement
    embedArtwork: true,            // Inclure les pochettes dans les fichiers
    artworkFolder: '',             // Dossier pour stocker les pochettes (sera configuré automatiquement)
    minArtworkSize: 500,           // Taille minimale en pixels pour les pochettes (carré)
    maxArtworkSize: 1500,          // Taille maximale en pixels pour les pochettes
    artworkFormat: 'jpeg',         // Format préféré pour les pochettes
    artworkQuality: 90,            // Qualité JPEG (0-100)
    keepOriginalArtwork: true,     // Conserver les pochettes originales

    // Options de gestion des erreurs
    retryOnError: true,            // Réessayer en cas d'erreur
    maxRetries: 3,                 // Nombre maximal de tentatives
    ignoreMinorErrors: true,       // Ignorer les erreurs mineures

    // Options de performance
    batchProcessing: true,         // Traitement par lots
    maxBatchSize: 10,              // Taille maximale des lots

    // Comportement automatique
    processDownloadsAutomatically: true,  // Traiter automatiquement les téléchargements
    writeMetadataOnProcessing: true,      // Écrire les métadonnées lors du traitement

    // Options spécifiques aux services
    serviceSpecificRules: {        // Règles spécifiques par service
      youtube: {
        extractArtistFromTitle: true,  // Extrait l'artiste du titre (format "Artiste - Titre")
        removeCommonSuffixes: true     // Supprime les suffixes courants ("Official Video", etc.)
      },
      soundcloud: {
        preferOriginalMetadata: true   // Préfère les métadonnées originales de SoundCloud
      },
      bandcamp: {
        preferOriginalMetadata: true   // Préfère les métadonnées originales de Bandcamp
      },
      spotify: {
        preferOriginalMetadata: true   // Préfère les métadonnées originales de Spotify
      },
      tidal: {
        preferOriginalMetadata: true   // Préfère les métadonnées originales de Tidal
      }
    }
  };

  // Configuration active
  let config = { ...DEFAULT_CONFIG };

  // État interne
  let state = {
    initialized: false,
    pendingRequests: new Map(),    // Requêtes en attente de traitement
    processingQueue: [],           // File d'attente de traitement
    processingBatch: false,        // Indique si un lot est en cours de traitement
    metadataCache: new Map(),      // Cache des métadonnées déjà traitées
    errorCounts: new Map(),        // Compteur d'erreurs par fichier
    isProcessingEnabled: true      // Indicateur d'activation du traitement
  };

  /**
   * Initialise le gestionnaire de métadonnées
   * @param {Object} injectedEventBus - Le bus d'événements à utiliser
   * @param {Object} eventTypes - Les types d'événements standardisés
   * @param {Object} errorCodes - Les codes d'erreur standardisés
   */
  function initialize(injectedEventBus, eventTypes, errorCodes) {
    if (!injectedEventBus) {
      console.error('MetadataManager: Bus d\'événements requis pour l\'initialisation');
      return;
    }

    eventBus = injectedEventBus;
    EVENT_TYPES = eventTypes || {};
    ERROR_CODES = errorCodes || {};

    // Configurer le dossier d'artwork par défaut
    config.artworkFolder = path.join(os.homedir(), '.21byts', 'artwork');

    // S'abonner aux événements
    registerEventListeners();

    state.initialized = true;

    // Publier un message d'information
    logInfo('Module MetadataManager initialisé');
  }

  /**
   * S'abonne aux événements pertinents
   */
  function registerEventListeners() {
    // Événements système
    eventBus.subscribe(EVENT_TYPES.APP.READY, handleAppReady);
    eventBus.subscribe(EVENT_TYPES.CONFIG.UPDATED, handleConfigUpdate);

    // Événements de téléchargement
    eventBus.subscribe(EVENT_TYPES.DOWNLOAD.ITEM_COMPLETED, handleDownloadCompleted);

    // Événements de métadonnées (demandes)
    eventBus.subscribe(EVENT_TYPES.METADATA.EXTRACT_REQUEST, handleExtractRequest);
    eventBus.subscribe(EVENT_TYPES.METADATA.UPDATE_REQUEST, handleUpdateRequest);
    eventBus.subscribe(EVENT_TYPES.METADATA.EXTRACT_FROM_URL, handleExtractFromUrl);
    eventBus.subscribe(EVENT_TYPES.METADATA.BATCH_UPDATE, handleBatchUpdate);

    // Événements de métadonnées (réponses de tag-processor)
    eventBus.subscribe(EVENT_TYPES.METADATA.EXTRACTED, handleMetadataExtracted);
    eventBus.subscribe(EVENT_TYPES.METADATA.EXTRACT_ERROR, handleMetadataExtractError);
    eventBus.subscribe(EVENT_TYPES.METADATA.UPDATED, handleMetadataUpdated);
    eventBus.subscribe(EVENT_TYPES.METADATA.UPDATE_ERROR, handleMetadataUpdateError);
  }

  /**
   * Gère l'événement de démarrage de l'application
   */
  function handleAppReady() {
    // Demander la configuration spécifique au module
    eventBus.publish(EVENT_TYPES.CONFIG.GET, {
      key: 'metadata',
      requestId: 'metadata-manager-init'
    });

    logInfo('MetadataManager prêt');
  }

  /**
   * Gère les mises à jour de configuration
   * @param {Object} data - Données de configuration mises à jour
   */
  function handleConfigUpdate(data) {
    if (!data || !data.metadata) {
      return;
    }

    const metadataConfig = data.metadata;

    // Mettre à jour la configuration
    Object.keys(metadataConfig).forEach(key => {
      if (config.hasOwnProperty(key)) {
        if (key === 'serviceSpecificRules' && metadataConfig[key]) {
          // Fusion spéciale pour les règles spécifiques aux services
          config[key] = {
            ...config[key],
            ...metadataConfig[key]
          };
        } else {
          config[key] = metadataConfig[key];
        }
      }
    });

    logInfo('Configuration mise à jour');
  }

  /**
   * Gère la fin d'un téléchargement
   * @param {Object} data - Données du téléchargement terminé
   */
  function handleDownloadCompleted(data) {
    if (!config.processDownloadsAutomatically || !data || !data.filePath) {
      return;
    }

    // Extraire les informations du téléchargement
    const filePath = data.filePath;
    const sourceType = data.sourceType || 'unknown';
    const sourceMetadata = data.metadata || {};
    const downloadId = data.downloadId || generateRequestId('download');

    logInfo(`Traitement automatique des métadonnées pour: ${filePath}`);

    // Demander l'extraction des métadonnées actuelles du fichier
    const requestId = generateRequestId('extract');

    // Stocker la demande en attente
    state.pendingRequests.set(requestId, {
      type: 'download-completed',
      filePath,
      sourceType,
      sourceMetadata,
      downloadId,
      timestamp: Date.now()
    });

    // Demander l'extraction des métadonnées du fichier
    eventBus.publish(EVENT_TYPES.METADATA.EXTRACT_REQUEST, {
      requestId,
      filePath,
      options: {
        includeArtwork: config.extractArtwork
      }
    });
  }

  /**
   * Gère une demande d'extraction de métadonnées
   * @param {Object} data - Données de la demande
   */
  function handleExtractRequest(data) {
    if (!data || !data.filePath) {
      publishError('INVALID_REQUEST', 'Chemin de fichier manquant dans la demande d\'extraction');

      if (data && data.requestId) {
        eventBus.publish(EVENT_TYPES.METADATA.PROCESS_ERROR, {
          requestId: data.requestId,
          error: 'Chemin de fichier manquant'
        });
      }

      return;
    }

    const filePath = data.filePath;
    const options = data.options || {};

    // Générer un ID de requête si non fourni
    const requestId = data.requestId || generateRequestId('extract');

    // Stocker la demande en attente
    state.pendingRequests.set(requestId, {
      type: 'direct-extract',
      filePath,
      options,
      timestamp: Date.now()
    });

    // Relayer la demande au module tag-processor
    eventBus.publish(EVENT_TYPES.METADATA.EXTRACT_REQUEST, {
      requestId,
      filePath,
      options
    });
  }

  /**
   * Gère une demande de mise à jour de métadonnées
   * @param {Object} data - Données de la demande
   */
  function handleUpdateRequest(data) {
    if (!data || !data.filePath || !data.metadata) {
      publishError('INVALID_REQUEST', 'Données invalides dans la demande de mise à jour');

      if (data && data.requestId) {
        eventBus.publish(EVENT_TYPES.METADATA.PROCESS_ERROR, {
          requestId: data.requestId,
          error: 'Données invalides'
        });
      }

      return;
    }

    const filePath = data.filePath;
    const metadata = data.metadata;
    const options = data.options || {};

    // Générer un ID de requête si non fourni
    const requestId = data.requestId || generateRequestId('update');

    // Normaliser les métadonnées si configuré
    let processedMetadata = metadata;
    if (config.normalizeMetadata && options.normalize !== false) {
      processedMetadata = normalizeMetadata(metadata, {
        sourceType: options.sourceType,
        standardizeTitles: config.standardizeTitles && options.standardizeTitles !== false,
        removeDuplicates: config.removeDuplicateTags && options.removeDuplicates !== false
      });
    }

    // Stocker la demande en attente
    state.pendingRequests.set(requestId, {
      type: 'direct-update',
      filePath,
      originalMetadata: metadata,
      processedMetadata,
      options,
      timestamp: Date.now()
    });

    // Relayer la demande au module tag-processor
    eventBus.publish(EVENT_TYPES.METADATA.UPDATE_REQUEST, {
      requestId,
      filePath,
      metadata: processedMetadata,
      options
    });
  }

  /**
   * Gère une demande d'extraction de métadonnées depuis une URL
   * @param {Object} data - Données de la demande
   */
  function handleExtractFromUrl(data) {
    if (!data || !data.url) {
      publishError('INVALID_REQUEST', 'URL manquante dans la demande d\'extraction');

      if (data && data.requestId) {
        eventBus.publish(EVENT_TYPES.METADATA.PROCESS_ERROR, {
          requestId: data.requestId,
          error: 'URL manquante'
        });
      }

      return;
    }

    const url = data.url;
    const options = data.options || {};

    // Générer un ID de requête si non fourni
    const requestId = data.requestId || generateRequestId('extract-url');

    // Détecter le type de source à partir de l'URL
    const sourceType = detectSourceType(url);

    // Pour l'instant, nous dépendons des adaptateurs spécifiques aux services
    // pour extraire les métadonnées depuis les URLs. Relayer la demande.
    switch (sourceType) {
      case 'youtube':
        eventBus.publish(EVENT_TYPES.ADAPTER.YOUTUBE.ANALYSIS_START, {
          requestId,
          url,
          extractMetadata: true,
          options
        });
        break;

      case 'bandcamp':
        eventBus.publish(EVENT_TYPES.ADAPTER.BANDCAMP.ANALYSIS_START, {
          requestId,
          url,
          extractMetadata: true,
          options
        });
        break;

      case 'soundcloud':
        eventBus.publish(EVENT_TYPES.ADAPTER.SOUNDCLOUD.ANALYSIS_START, {
          requestId,
          url,
          extractMetadata: true,
          options
        });
        break;

      case 'spotify':
        eventBus.publish(EVENT_TYPES.ADAPTER.SPOTIFY.ANALYSIS_START, {
          requestId,
          url,
          extractMetadata: true,
          options
        });
        break;

      case 'tidal':
        eventBus.publish(EVENT_TYPES.ADAPTER.TIDAL.ANALYSIS_START, {
          requestId,
          url,
          extractMetadata: true,
          options
        });
        break;

      default:
        // Source non reconnue
        publishError('UNSUPPORTED_SOURCE', `Source non supportée pour l'extraction de métadonnées: ${sourceType}`);

        eventBus.publish(EVENT_TYPES.METADATA.PROCESS_ERROR, {
          requestId,
          url,
          error: `Source non supportée: ${sourceType}`
        });
    }
  }

  /**
   * Gère une demande de mise à jour groupée de métadonnées
   * @param {Object} data - Données de la demande
   */
  function handleBatchUpdate(data) {
    if (!data || !data.items || !Array.isArray(data.items) || data.items.length === 0) {
      publishError('INVALID_REQUEST', 'Données invalides dans la demande de mise à jour groupée');

      if (data && data.requestId) {
        eventBus.publish(EVENT_TYPES.METADATA.PROCESS_ERROR, {
          requestId: data.requestId,
          error: 'Données invalides'
        });
      }

      return;
    }

    const items = data.items;
    const options = data.options || {};
    const requestId = data.requestId || generateRequestId('batch');

    // Vérifier chaque élément du lot
    const validItems = items.filter(item => {
      return item && item.filePath && item.metadata;
    });

    if (validItems.length === 0) {
      publishError('INVALID_BATCH_ITEMS', 'Aucun élément valide dans la demande de mise à jour groupée');

      eventBus.publish(EVENT_TYPES.METADATA.PROCESS_ERROR, {
        requestId,
        error: 'Aucun élément valide'
      });

      return;
    }

    // Ajouter les éléments à la file d'attente de traitement
    validItems.forEach(item => {
      const itemRequestId = generateRequestId('batch-item');

      // Stocker les informations de traitement par lot
      state.pendingRequests.set(itemRequestId, {
        type: 'batch-item',
        batchId: requestId,
        filePath: item.filePath,
        metadata: item.metadata,
        options: { ...options, ...item.options },
        timestamp: Date.now()
      });

      // Ajouter à la file d'attente de traitement
      state.processingQueue.push({
        requestId: itemRequestId,
        filePath: item.filePath,
        metadata: item.metadata,
        options: { ...options, ...item.options }
      });
    });

    // Commencer le traitement si ce n'est pas déjà en cours
    if (!state.processingBatch) {
      processBatch();
    }

    logInfo(`Mise à jour groupée programmée: ${validItems.length} éléments`);
  }

  /**
   * Traite un lot d'éléments dans la file d'attente
   */
  function processBatch() {
    if (state.processingQueue.length === 0) {
      state.processingBatch = false;
      return;
    }

    state.processingBatch = true;

    // Extraire un nombre limité d'éléments selon la taille de lot configurée
    const batchSize = Math.min(config.maxBatchSize, state.processingQueue.length);
    const batch = state.processingQueue.splice(0, batchSize);

    // Traiter chaque élément du lot
    let processedCount = 0;

    batch.forEach(item => {
      // Normaliser les métadonnées si configuré
      if (config.normalizeMetadata) {
        item.metadata = normalizeMetadata(item.metadata, {
          sourceType: item.options.sourceType,
          standardizeTitles: config.standardizeTitles,
          removeDuplicates: config.removeDuplicateTags
        });
      }

      // Publier la demande de mise à jour
      eventBus.publish(EVENT_TYPES.METADATA.UPDATE_REQUEST, {
        requestId: item.requestId,
        filePath: item.filePath,
        metadata: item.metadata,
        options: item.options
      });

      processedCount++;
    });

    logInfo(`Traitement par lot en cours: ${processedCount} éléments`);

    // Vérifier s'il reste des éléments à traiter après un délai
    setTimeout(() => {
      if (state.processingQueue.length > 0) {
        processBatch();
      } else {
        state.processingBatch = false;
      }
    }, 100);
  }

  /**
   * Gère la réception des métadonnées extraites
   * @param {Object} data - Métadonnées extraites
   */
  function handleMetadataExtracted(data) {
    if (!data || !data.requestId || !data.metadata) {
      return;
    }

    const requestId = data.requestId;

    // Rechercher la demande correspondante
    if (!state.pendingRequests.has(requestId)) {
      return;
    }

    const request = state.pendingRequests.get(requestId);

    // Traiter selon le type de demande
    switch (request.type) {
      case 'download-completed':
        processDownloadMetadata(requestId, request, data.metadata);
        break;

      case 'direct-extract':
        processDirectExtract(requestId, request, data.metadata);
        break;

      default:
        // Relayer simplement les métadonnées extraites
        eventBus.publish(EVENT_TYPES.METADATA.PROCESSED, {
          requestId,
          filePath: request.filePath,
          metadata: data.metadata,
          fromCache: data.fromCache
        });
    }

    // Nettoyer la demande
    state.pendingRequests.delete(requestId);
  }

  /**
   * Gère les erreurs d'extraction de métadonnées
   * @param {Object} data - Données d'erreur
   */
  function handleMetadataExtractError(data) {
    if (!data || !data.requestId) {
      return;
    }

    const requestId = data.requestId;

    // Rechercher la demande correspondante
    if (!state.pendingRequests.has(requestId)) {
      return;
    }

    const request = state.pendingRequests.get(requestId);

    // Incrémenter le compteur d'erreurs pour ce fichier
    const errorCount = state.errorCounts.get(request.filePath) || 0;
    state.errorCounts.set(request.filePath, errorCount + 1);

    // Vérifier si nous devons réessayer
    if (config.retryOnError && errorCount < config.maxRetries) {
      logWarning(`Réessai d'extraction des métadonnées: ${request.filePath} (tentative ${errorCount + 1})`);

      // Réessayer après un court délai
      setTimeout(() => {
        eventBus.publish(EVENT_TYPES.METADATA.EXTRACT_REQUEST, {
          requestId,
          filePath: request.filePath,
          options: request.options
        });
      }, 1000);

      return;
    }

    // Erreur définitive, relayer l'erreur
    eventBus.publish(EVENT_TYPES.METADATA.PROCESS_ERROR, {
      requestId,
      filePath: request.filePath,
      error: data.error
    });

    // Nettoyer la demande
    state.pendingRequests.delete(requestId);
  }

  /**
   * Gère la confirmation de mise à jour des métadonnées
   * @param {Object} data - Données de confirmation
   */
  function handleMetadataUpdated(data) {
    if (!data || !data.requestId) {
      return;
    }

    const requestId = data.requestId;

    // Rechercher la demande correspondante
    if (!state.pendingRequests.has(requestId)) {
      return;
    }

    const request = state.pendingRequests.get(requestId);

    // Traiter selon le type de demande
    switch (request.type) {
      case 'batch-item':
        // Vérifier si c'était le dernier élément du lot
        const batchId = request.batchId;
        const remainingItems = Array.from(state.pendingRequests.values())
          .filter(item => item.type === 'batch-item' && item.batchId === batchId);

        // Si c'était le dernier élément, publier la confirmation du lot
        if (remainingItems.length <= 1) {
          eventBus.publish(EVENT_TYPES.METADATA.BATCH_COMPLETED, {
            requestId: batchId,
            itemsProcessed: Array.from(state.pendingRequests.keys())
              .filter(key => {
                const item = state.pendingRequests.get(key);
                return item && item.type === 'batch-item' && item.batchId === batchId;
              })
          });
        }
        break;

      default:
        // Relayer simplement la confirmation
        eventBus.publish(EVENT_TYPES.METADATA.PROCESSED, {
          requestId,
          filePath: request.filePath,
          metadata: data.metadata || request.processedMetadata
        });
    }

    // Nettoyer la demande
    state.pendingRequests.delete(requestId);

    // Réinitialiser le compteur d'erreurs pour ce fichier
    state.errorCounts.delete(request.filePath);
  }

  /**
   * Gère les erreurs de mise à jour des métadonnées
   * @param {Object} data - Données d'erreur
   */
  function handleMetadataUpdateError(data) {
    if (!data || !data.requestId) {
      return;
    }

    const requestId = data.requestId;

    // Rechercher la demande correspondante
    if (!state.pendingRequests.has(requestId)) {
      return;
    }

    const request = state.pendingRequests.get(requestId);

    // Incrémenter le compteur d'erreurs pour ce fichier
    const errorCount = state.errorCounts.get(request.filePath) || 0;
    state.errorCounts.set(request.filePath, errorCount + 1);

    // Vérifier si nous devons réessayer
    if (config.retryOnError && errorCount < config.maxRetries) {
      logWarning(`Réessai de mise à jour des métadonnées: ${request.filePath} (tentative ${errorCount + 1})`);

      // Réessayer après un court délai
      setTimeout(() => {
        eventBus.publish(EVENT_TYPES.METADATA.UPDATE_REQUEST, {
          requestId,
          filePath: request.filePath,
          metadata: request.processedMetadata || request.metadata,
          options: request.options
        });
      }, 1000);

      return;
    }

    // Erreur définitive, relayer l'erreur
    eventBus.publish(EVENT_TYPES.METADATA.PROCESS_ERROR, {
      requestId,
      filePath: request.filePath,
      error: data.error
    });

    // Si c'était un élément d'un lot, vérifier s'il reste d'autres éléments
    if (request.type === 'batch-item' && request.batchId) {
      const batchId = request.batchId;
      const remainingItems = Array.from(state.pendingRequests.values())
        .filter(item => item.type === 'batch-item' && item.batchId === batchId);

      // Si c'était le dernier élément, publier la confirmation du lot avec erreur
      if (remainingItems.length <= 1) {
        eventBus.publish(EVENT_TYPES.METADATA.BATCH_COMPLETED, {
          requestId: batchId,
          itemsProcessed: Array.from(state.pendingRequests.keys())
            .filter(key => {
              const item = state.pendingRequests.get(key);
              return item && item.type === 'batch-item' && item.batchId === batchId;
            }),
          hasErrors: true
        });
      }
    }

    // Nettoyer la demande
    state.pendingRequests.delete(requestId);
  }

  /**
   * Traite les métadonnées d'un téléchargement terminé
   * @param {string} requestId - ID de la requête
   * @param {Object} request - Informations sur la demande
   * @param {Object} fileMetadata - Métadonnées extraites du fichier
   */
, 'i');

    // Supprimer les suffixes
    return title.replace(suffixPattern, '').trim();
  }

  /**
   * Obtient une préférence spécifique à un service
   * @param {string} serviceType - Type de service
   * @param {string} preference - Nom de la préférence
   * @returns {*} Valeur de la préférence
   */
  function getServicePreference(serviceType, preference) {
    if (!serviceType || !preference) {
      return false;
    }

    // Vérifier si le service a des règles spécifiques
    if (config.serviceSpecificRules &&
        config.serviceSpecificRules[serviceType] &&
        config.serviceSpecificRules[serviceType][preference] !== undefined) {
      return config.serviceSpecificRules[serviceType][preference];
    }

    // Valeur par défaut
    return false;
  }

  /**
   * Détecte le type de source à partir d'une URL
   * @param {string} url - URL à analyser
   * @returns {string} Type de source détecté
   */
  function detectSourceType(url) {
    if (!url) {
      return 'unknown';
    }

    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;

      if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
        return 'youtube';
      } else if (hostname.includes('bandcamp.com')) {
        return 'bandcamp';
      } else if (hostname.includes('soundcloud.com')) {
        return 'soundcloud';
      } else if (hostname.includes('spotify.com')) {
        return 'spotify';
      } else if (hostname.includes('tidal.com')) {
        return 'tidal';
      }

      return 'unknown';
    } catch (error) {
      // URL invalide
      return 'unknown';
    }
  }

  /**
   * Génère un ID de requête unique
   * @param {string} prefix - Préfixe pour l'ID
   * @returns {string} ID de requête unique
   */
  function generateRequestId(prefix) {
    const timestamp = Date.now();
    const counter = (requestCounter++).toString().padStart(5, '0');
    return `${prefix}_${timestamp}_${counter}`;
  }

  /**
   * Publie un message d'information
   * @param {string} message - Message à publier
   * @param {Object} [details] - Détails supplémentaires
   */
  function logInfo(message, details = {}) {
    if (!eventBus) return;

    eventBus.publish(EVENT_TYPES.LOG.INFO, {
      source: 'metadata-manager',
      message,
      details,
      timestamp: Date.now()
    });
  }

  /**
   * Publie un message d'avertissement
   * @param {string} message - Message à publier
   * @param {Object} [details] - Détails supplémentaires
   */
  function logWarning(message, details = {}) {
    if (!eventBus) return;

    eventBus.publish(EVENT_TYPES.LOG.WARNING, {
      source: 'metadata-manager',
      message,
      details,
      timestamp: Date.now()
    });
  }

  /**
   * Publie un message d'erreur
   * @param {string} message - Message à publier
   * @param {Object} [details] - Détails supplémentaires
   */
  function logError(message, details = {}) {
    if (!eventBus) return;

    eventBus.publish(EVENT_TYPES.LOG.ERROR, {
      source: 'metadata-manager',
      message,
      details,
      timestamp: Date.now()
    });
  }

  /**
   * Publie une erreur via le bus d'événements
   * @param {string} code - Code d'erreur
   * @param {string} message - Message d'erreur
   * @param {*} [details] - Détails supplémentaires
   */
  function publishError(code, message, details = null) {
    if (!eventBus) return;

    // Utiliser le code d'erreur standardisé si disponible
    const errorCode = ERROR_CODES && ERROR_CODES[code]
      ? ERROR_CODES[code]
      : code;

    eventBus.publish(EVENT_TYPES.ERROR.NON_CRITICAL, {
      source: 'metadata-manager',
      code: errorCode,
      message,
      details,
      timestamp: Date.now()
    });

    // Journaliser l'erreur
    logError(`${code}: ${message}`, details);
  }

  // API publique
  return {
    // Exposer uniquement la méthode d'initialisation
    initialize
  };
}

// Créer et exporter l'instance unique
const metadataManager = MetadataManager();
module.exports = metadataManager;

/**
 * Exemples d'utilisation:
 *
 * // Initialisation
 * const eventBus = window.appEvents; // Récupéré depuis l'objet global window
 * const EVENT_TYPES = require('./constants/event-types');
 * const ERROR_CODES = require('./constants/error-codes');
 * const metadataManager = require('./metadata/metadata-manager');
 *
 * // Pour initialiser le module
 * metadataManager.initialize(eventBus, EVENT_TYPES, ERROR_CODES);
 *
 * // Pour extraire les métadonnées d'un fichier
 * eventBus.publish(EVENT_TYPES.METADATA.EXTRACT_REQUEST, {
 *   requestId: 'extract_123',
 *   filePath: '/chemin/vers/fichier.mp3'
 * });
 *
 * // Pour recevoir les métadonnées
 * eventBus.subscribe(EVENT_TYPES.METADATA.PROCESSED, (data) => {
 *   if (data.requestId === 'extract_123') {
 *     console.log('Métadonnées extraites:', data.metadata);
 *   }
 * });
 *
 * // Pour mettre à jour les métadonnées
 * eventBus.publish(EVENT_TYPES.METADATA.UPDATE_REQUEST, {
 *   requestId: 'update_123',
 *   filePath: '/chemin/vers/fichier.mp3',
 *   metadata: {
 *     title: 'Nouveau Titre',
 *     artist: 'Nouvel Artiste',
 *     album: 'Nouvel Album'
 *   }
 * });
 *
 * // Pour recevoir la confirmation de mise à jour
 * eventBus.subscribe(EVENT_TYPES.METADATA.PROCESSED, (data) => {
 *   if (data.requestId === 'update_123') {
 *     console.log('Métadonnées mises à jour:', data.metadata);
 *   }
 * });
 *
 * // Pour gérer les erreurs
 * eventBus.subscribe(EVENT_TYPES.METADATA.PROCESS_ERROR, (data) => {
 *   console.error('Erreur de traitement des métadonnées:', data.error);
 * });
 */// Gestionnaire de métadonnées
// Créé automatiquement le 2025-05-02

