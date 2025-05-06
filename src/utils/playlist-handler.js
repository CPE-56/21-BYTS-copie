/**
 * @fileoverview Module de gestion des playlists pour l'application 21 BYTS
 *
 * Ce module est responsable de la détection, du traitement et de la gestion des playlists
 * lors du téléchargement de contenu audio. Il peut détecter les playlists à partir d'URLs,
 * les traiter et les convertir en tâches de téléchargement individuelles,
 * ainsi que générer des fichiers de playlist (M3U, etc.) à partir des fichiers téléchargés.
 *
 * Conformément à l'architecture "Single File Component", ce module fonctionne
 * de manière autonome sans dépendances directes sur d'autres modules du projet.
 * Toute communication se fait exclusivement via le bus d'événements.
 *
 * @module utils/playlist-handler
 *
 * @requires node:path
 * @requires node:fs
 * @requires electron
 *
 * @events
 * ÉCOUTE:
 * - PLAYLIST:DETECTED - Quand une playlist est détectée
 * - PLAYLIST:PROCESS_REQUEST - Demande de traitement d'une playlist
 * - PLAYLIST:GENERATE_FILE_REQUEST - Demande de génération d'un fichier de playlist
 * - FILE:READ_SUCCESS - Résultat de lecture de fichier
 * - FILE:WRITE_SUCCESS - Résultat d'écriture de fichier
 * - FILE:READ_ERROR - Erreur de lecture de fichier
 * - FILE:WRITE_ERROR - Erreur d'écriture de fichier
 * - CONFIG:UPDATED - Mise à jour de la configuration
 * - DOWNLOAD:ITEM_COMPLETED - Téléchargement d'un élément terminé
 *
 * ÉMET:
 * - PLAYLIST:PROCESSING_START - Début du traitement d'une playlist
 * - PLAYLIST:PROCESSING_PROGRESS - Progression du traitement d'une playlist
 * - PLAYLIST:PROCESSING_COMPLETE - Fin du traitement d'une playlist
 * - PLAYLIST:PROCESSING_ERROR - Erreur lors du traitement d'une playlist
 * - PLAYLIST:LIMIT_EXCEEDED - Playlist dépassant la limite configurée
 * - PLAYLIST:FILE_GENERATED - Fichier de playlist généré
 * - PLAYLIST:FILE_ERROR - Erreur lors de la génération du fichier de playlist
 * - DOWNLOAD:URL_ADD_REQUEST - Demande d'ajout d'URL pour téléchargement
 * - FILE:READ_REQUEST - Demande de lecture de fichier
 * - FILE:WRITE_REQUEST - Demande d'écriture de fichier
 * - ERROR:NON_CRITICAL - Erreur non critique
 * - LOG:INFO - Message d'information
 * - LOG:WARNING - Message d'avertissement
 * - LOG:ERROR - Message d'erreur
 */

'use strict';

// Modules standards de Node.js uniquement
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

/**
 * Gestionnaire de playlists pour l'application 21 BYTS
 * @class PlaylistHandler
 */
function PlaylistHandler() {
  // Bus d'événements - sera injecté lors de l'initialisation
  let eventBus = null;

  // Référence aux types d'événements standardisés
  let EVENT_TYPES = null;

  // Référence aux codes d'erreur
  // eslint-disable-next-line no-unused-vars
  let ERROR_CODES = null;

  // Configuration par défaut
  const DEFAULT_CONFIG = {
    maxPlaylistItems: 200, // Nombre max d'éléments dans une playlist
    playlistFolder: '', // Sera configuré automatiquement
    defaultPlaylistFormat: 'm3u', // Format par défaut des playlists
    supportedFormats: ['m3u', 'm3u8', 'pls'], // Formats de playlist supportés
    autoGeneratePlaylistFile: true, // Générer automatiquement un fichier de playlist
    includeMetadata: true, // Inclure les métadonnées dans les fichiers de playlist
    addToLibrary: false, // Ajouter à la bibliothèque musicale
    processingTimeout: 300000 // Timeout de traitement (5 minutes)
  };

  // Configuration active
  let config = { ...DEFAULT_CONFIG };

  // État interne du module
  const state = {
    processedPlaylists: new Map(), // Playlists en cours de traitement ou terminées
    completedDownloads: new Map(), // Téléchargements terminés pour suivi des playlists
    initialized: false
  };

  /**
   * Initialise le module et s'enregistre auprès du bus d'événements
   * @param {Object} injectedEventBus - Le bus d'événements à utiliser
   * @param {Object} eventTypes - Les types d'événements standardisés
   * @param {Object} errorCodes - Les codes d'erreur standardisés
   */
  function initialize(injectedEventBus, eventTypes, errorCodes) {
    if (!injectedEventBus) {
      console.error("PlaylistHandler: Le bus d'événements est requis pour l'initialisation");
      return;
    }

    eventBus = injectedEventBus;
    EVENT_TYPES = eventTypes || {};
    ERROR_CODES = errorCodes || {};

    // Configurer le dossier de playlists par défaut
    config.playlistFolder = path.join(os.homedir(), 'Music', '21BYTS', 'Playlists');

    // S'abonner aux événements
    registerEventListeners();

    state.initialized = true;

    logInfo('Module PlaylistHandler initialisé');
  }

  /**
   * Enregistre les écouteurs d'événements
   */
  function registerEventListeners() {
    // Événements liés aux playlists
    eventBus.subscribe(EVENT_TYPES.PLAYLIST.DETECTED, handlePlaylistDetected);
    eventBus.subscribe(EVENT_TYPES.PLAYLIST.PROCESS_REQUEST, handleProcessRequest);
    eventBus.subscribe(EVENT_TYPES.PLAYLIST.GENERATE_FILE_REQUEST, handleGenerateFileRequest);

    // Événements de fichiers
    eventBus.subscribe(EVENT_TYPES.FILE.READ_SUCCESS, handleFileReadSuccess);
    eventBus.subscribe(EVENT_TYPES.FILE.WRITE_SUCCESS, handleFileWriteSuccess);
    eventBus.subscribe(EVENT_TYPES.FILE.READ_ERROR, handleFileReadError);
    eventBus.subscribe(EVENT_TYPES.FILE.WRITE_ERROR, handleFileWriteError);

    // Événements de configuration
    eventBus.subscribe(EVENT_TYPES.CONFIG.UPDATED, handleConfigUpdate);

    // Événements de téléchargement
    eventBus.subscribe(EVENT_TYPES.DOWNLOAD.ITEM_COMPLETED, handleDownloadCompleted);
  }

  /**
   * Gère la détection d'une playlist
   * @param {Object} data - Données de la playlist détectée
   */
  function handlePlaylistDetected(data) {
    if (!data || !data.url || !data.sourceType) {
      logError('Données de playlist invalides', {
        code: 'INVALID_PLAYLIST_DATA',
        data
      });
      return;
    }

    logInfo(`Playlist détectée: ${data.url}`, {
      sourceType: data.sourceType,
      itemCount: data.itemCount || 'inconnu'
    });

    // Si la playlist dépasse la limite configurée
    if (data.itemCount && data.itemCount > config.maxPlaylistItems) {
      eventBus.publish(EVENT_TYPES.PLAYLIST.LIMIT_EXCEEDED, {
        url: data.url,
        sourceType: data.sourceType,
        itemCount: data.itemCount,
        maxItems: config.maxPlaylistItems
      });

      logWarning(
        `Playlist trop volumineuse (${data.itemCount} éléments, max: ${config.maxPlaylistItems})`,
        {
          url: data.url
        }
      );
    }
  }

  /**
   * Gère une demande de traitement de playlist
   * @param {Object} data - Données de la demande
   */
  function handleProcessRequest(data) {
    if (!data || !data.url || !data.sourceType) {
      logError('Données de demande de traitement invalides', {
        code: 'INVALID_PROCESS_REQUEST',
        data
      });
      return;
    }

    const playlistId = data.id || generatePlaylistId();

    // Vérifier si la playlist est déjà en traitement
    if (
      state.processedPlaylists.has(playlistId) &&
      state.processedPlaylists.get(playlistId).status === 'processing'
    ) {
      logWarning(`Playlist déjà en cours de traitement: ${playlistId}`, {
        url: data.url
      });
      return;
    }

    // Créer un nouvel objet de suivi de playlist
    const playlistInfo = {
      id: playlistId,
      url: data.url,
      sourceType: data.sourceType,
      name: data.name || extractPlaylistName(data.url),
      status: 'processing',
      startTime: Date.now(),
      items: [],
      processedItems: 0,
      failedItems: 0,
      maxItems: data.maxItems || config.maxPlaylistItems
    };

    // Enregistrer dans le suivi
    state.processedPlaylists.set(playlistId, playlistInfo);

    // Publier le début du traitement
    eventBus.publish(EVENT_TYPES.PLAYLIST.PROCESSING_START, {
      playlistId,
      url: data.url,
      sourceType: data.sourceType,
      name: playlistInfo.name
    });

    logInfo(`Début du traitement de la playlist: ${playlistInfo.name}`, {
      playlistId,
      url: data.url
    });

    // Démarrer le traitement en fonction du type de source
    switch (data.sourceType) {
      case 'youtube':
        processYoutubePlaylist(playlistInfo, data);
        break;
      case 'bandcamp':
        processBandcampPlaylist(playlistInfo, data);
        break;
      case 'soundcloud':
        processSoundcloudPlaylist(playlistInfo, data);
        break;
      case 'spotify':
        processSpotifyPlaylist(playlistInfo, data);
        break;
      case 'tidal':
        processTidalPlaylist(playlistInfo, data);
        break;
      case 'local':
        processLocalPlaylist(playlistInfo, data);
        break;
      default:
        // Type de source non supporté
        logError(`Type de playlist non supporté: ${data.sourceType}`, {
          code: 'UNSUPPORTED_PLAYLIST_TYPE',
          playlistId,
          url: data.url
        });

        // Mettre à jour le statut
        playlistInfo.status = 'error';
        playlistInfo.error = `Type de playlist non supporté: ${data.sourceType}`;
        state.processedPlaylists.set(playlistId, playlistInfo);

        // Publier l'erreur
        eventBus.publish(EVENT_TYPES.PLAYLIST.PROCESSING_ERROR, {
          playlistId,
          url: data.url,
          sourceType: data.sourceType,
          error: playlistInfo.error
        });
    }
  }

  /**
   * Gère une demande de génération de fichier de playlist
   * @param {Object} data - Données de la demande
   */
  function handleGenerateFileRequest(data) {
    if (!data || !data.playlistId || !data.items) {
      logError('Données de génération de fichier invalides', {
        code: 'INVALID_GENERATE_FILE_REQUEST',
        data
      });
      return;
    }

    const playlistId = data.playlistId;
    const items = data.items;
    const format = data.format || config.defaultPlaylistFormat;

    // Vérifier si le format est supporté
    if (!config.supportedFormats.includes(format)) {
      logError(`Format de playlist non supporté: ${format}`, {
        code: 'UNSUPPORTED_PLAYLIST_FORMAT',
        playlistId,
        format
      });
      return;
    }

    // Obtenir le nom et le chemin du fichier
    const playlistInfo = state.processedPlaylists.get(playlistId) || {};
    const playlistName = data.name || playlistInfo.name || `playlist_${playlistId}`;
    const sanitizedName = sanitizeFilename(playlistName);

    // Assurer que le dossier de playlists existe
    ensureDirectoryExists(config.playlistFolder);

    const filePath = path.join(config.playlistFolder, `${sanitizedName}.${format}`);

    // Générer le contenu du fichier selon le format
    let content = '';

    switch (format) {
      case 'm3u':
      case 'm3u8':
        content = generateM3UContent(items);
        break;
      case 'pls':
        content = generatePLSContent(items);
        break;
    }

    // Demander l'écriture du fichier
    const requestId = `generate_playlist_${playlistId}_${Date.now()}`;

    eventBus.publish(EVENT_TYPES.FILE.WRITE_REQUEST, {
      requestId,
      filePath,
      data: content,
      encoding: format === 'm3u8' ? 'utf8' : 'utf8',
      metadata: {
        playlistId,
        format,
        itemCount: items.length
      }
    });

    logInfo(`Demande d'écriture du fichier de playlist: ${filePath}`, {
      playlistId,
      format,
      itemCount: items.length
    });
  }

  /**
   * Gère une réponse de lecture de fichier réussie
   * @param {Object} data - Données de la réponse
   */
  function handleFileReadSuccess(data) {
    // Vérifier si c'est une réponse pour ce module
    if (!data || !data.requestId || !data.requestId.startsWith('playlist_')) {
      return;
    }

    const metadata = data.metadata || {};
    const playlistId = metadata.playlistId;

    if (!playlistId) {
      return;
    }

    logInfo(`Lecture de fichier réussie pour la playlist ${playlistId}`, {
      filePath: data.filePath,
      size: data.result ? data.result.length : 0
    });

    // Traiter le contenu selon le format
    const fileExt = path.extname(data.filePath).toLowerCase();

    if (fileExt === '.m3u' || fileExt === '.m3u8') {
      processM3UContent(data.result, playlistId, metadata);
    } else if (fileExt === '.pls') {
      processPLSContent(data.result, playlistId, metadata);
    }
  }

  /**
   * Gère une réponse d'écriture de fichier réussie
   * @param {Object} data - Données de la réponse
   */
  function handleFileWriteSuccess(data) {
    // Vérifier si c'est une réponse pour ce module
    if (!data || !data.requestId || !data.requestId.startsWith('generate_playlist_')) {
      return;
    }

    const metadata = data.metadata || {};
    const playlistId = metadata.playlistId;

    if (!playlistId) {
      return;
    }

    logInfo(`Écriture de fichier de playlist réussie: ${data.filePath}`, {
      playlistId,
      format: metadata.format,
      itemCount: metadata.itemCount
    });

    // Publier la génération réussie
    eventBus.publish(EVENT_TYPES.PLAYLIST.FILE_GENERATED, {
      playlistId,
      filePath: data.filePath,
      format: metadata.format,
      itemCount: metadata.itemCount
    });

    // Si configuré, ajouter à la bibliothèque musicale
    if (config.addToLibrary) {
      eventBus.publish(EVENT_TYPES.FILE.ADD_TO_LIBRARY_REQUEST, {
        filePath: data.filePath,
        type: 'playlist'
      });
    }
  }

  /**
   * Gère une erreur de lecture de fichier
   * @param {Object} data - Données de l'erreur
   */
  function handleFileReadError(data) {
    // Vérifier si c'est une réponse pour ce module
    if (!data || !data.requestId || !data.requestId.startsWith('playlist_')) {
      return;
    }

    const metadata = data.metadata || {};
    const playlistId = metadata.playlistId;

    if (!playlistId) {
      return;
    }

    logError(`Erreur de lecture du fichier pour la playlist ${playlistId}`, {
      code: 'FILE_READ_ERROR',
      filePath: data.filePath,
      error: data.error
    });

    // Publier l'erreur
    eventBus.publish(EVENT_TYPES.PLAYLIST.PROCESSING_ERROR, {
      playlistId,
      filePath: data.filePath,
      error: `Erreur de lecture du fichier: ${data.error}`
    });
  }

  /**
   * Gère une erreur d'écriture de fichier
   * @param {Object} data - Données de l'erreur
   */
  function handleFileWriteError(data) {
    // Vérifier si c'est une réponse pour ce module
    if (!data || !data.requestId || !data.requestId.startsWith('generate_playlist_')) {
      return;
    }

    const metadata = data.metadata || {};
    const playlistId = metadata.playlistId;

    if (!playlistId) {
      return;
    }

    logError(`Erreur d'écriture du fichier de playlist: ${data.filePath}`, {
      code: 'FILE_WRITE_ERROR',
      playlistId,
      error: data.error
    });

    // Publier l'erreur
    eventBus.publish(EVENT_TYPES.PLAYLIST.FILE_ERROR, {
      playlistId,
      filePath: data.filePath,
      error: `Erreur d'écriture du fichier: ${data.error}`
    });
  }

  /**
   * Gère une mise à jour de configuration
   * @param {Object} data - Nouvelles données de configuration
   */
  function handleConfigUpdate(data) {
    // Vérifier si la configuration contient des données pour ce module
    if (!data || !data.playlist) {
      return;
    }

    const playlistConfig = data.playlist;

    // Mettre à jour la configuration
    if (playlistConfig.maxPlaylistItems !== undefined) {
      config.maxPlaylistItems = playlistConfig.maxPlaylistItems;
    }

    if (playlistConfig.playlistFolder) {
      config.playlistFolder = playlistConfig.playlistFolder;
      ensureDirectoryExists(config.playlistFolder);
    }

    if (playlistConfig.defaultPlaylistFormat) {
      config.defaultPlaylistFormat = playlistConfig.defaultPlaylistFormat;
    }

    if (playlistConfig.supportedFormats) {
      config.supportedFormats = playlistConfig.supportedFormats;
    }

    if (playlistConfig.autoGeneratePlaylistFile !== undefined) {
      config.autoGeneratePlaylistFile = playlistConfig.autoGeneratePlaylistFile;
    }

    if (playlistConfig.includeMetadata !== undefined) {
      config.includeMetadata = playlistConfig.includeMetadata;
    }

    if (playlistConfig.addToLibrary !== undefined) {
      config.addToLibrary = playlistConfig.addToLibrary;
    }

    if (playlistConfig.processingTimeout !== undefined) {
      config.processingTimeout = playlistConfig.processingTimeout;
    }

    logInfo('Configuration du gestionnaire de playlists mise à jour', config);
  }

  /**
   * Gère la fin d'un téléchargement
   * @param {Object} data - Données du téléchargement terminé
   */
  function handleDownloadCompleted(data) {
    if (!data || !data.downloadId) {
      return;
    }

    // Vérifier si le téléchargement fait partie d'une playlist
    const playlistId = data.metadata?.playlistId;

    if (!playlistId) {
      return;
    }

    // Récupérer les informations de la playlist
    const playlistInfo = state.processedPlaylists.get(playlistId);

    if (!playlistInfo) {
      return;
    }

    // Enregistrer le téléchargement terminé
    state.completedDownloads.set(data.downloadId, {
      playlistId,
      filePath: data.filePath,
      metadata: data.metadata
    });

    // Incrémenter le compteur d'éléments traités
    playlistInfo.processedItems++;

    // Mettre à jour l'état de la playlist
    state.processedPlaylists.set(playlistId, playlistInfo);

    // Publier la progression
    eventBus.publish(EVENT_TYPES.PLAYLIST.PROCESSING_PROGRESS, {
      playlistId,
      processedItems: playlistInfo.processedItems,
      totalItems: playlistInfo.items.length,
      progress:
        playlistInfo.items.length > 0
          ? (playlistInfo.processedItems / playlistInfo.items.length) * 100
          : 0
    });

    // Vérifier si tous les éléments sont traités
    if (playlistInfo.processedItems === playlistInfo.items.length) {
      completePlaylistProcessing(playlistInfo);
    }
  }

  /**
   * Traite une playlist YouTube
   * @param {Object} playlistInfo - Informations sur la playlist
   */
  function processYoutubePlaylist(playlistInfo) {
    // Pour une playlist YouTube, nous attendons que l'adaptateur fournisse les éléments
    // via les événements d'analyse. Nous configurons simplement un timeout ici.

    // Mettre en place un timeout pour éviter de bloquer indéfiniment
    const timeoutId = setTimeout(() => {
      // Vérifier si la playlist est toujours en traitement
      if (playlistInfo.status === 'processing') {
        // Terminer le traitement avec erreur de timeout
        playlistInfo.status = 'error';
        playlistInfo.error = 'Timeout lors du traitement de la playlist';
        state.processedPlaylists.set(playlistInfo.id, playlistInfo);

        // Publier l'erreur
        eventBus.publish(EVENT_TYPES.PLAYLIST.PROCESSING_ERROR, {
          playlistId: playlistInfo.id,
          url: playlistInfo.url,
          sourceType: playlistInfo.sourceType,
          error: playlistInfo.error
        });

        logError(`Timeout lors du traitement de la playlist: ${playlistInfo.name}`, {
          code: 'PLAYLIST_PROCESSING_TIMEOUT',
          playlistId: playlistInfo.id,
          duration: config.processingTimeout
        });
      }
    }, config.processingTimeout);

    // Stocker l'ID du timeout pour pouvoir l'annuler si nécessaire
    playlistInfo.timeoutId = timeoutId;

    // Émettre un événement pour demander à l'adaptateur YouTube d'analyser la playlist
    eventBus.publish(EVENT_TYPES.ADAPTER.YOUTUBE.ANALYSIS_START, {
      url: playlistInfo.url,
      playlistId: playlistInfo.id,
      maxItems: playlistInfo.maxItems
    });

    logInfo(`Demande d'analyse de playlist YouTube: ${playlistInfo.url}`, {
      playlistId: playlistInfo.id
    });
  }

  /**
   * Traite une playlist Bandcamp
   * @param {Object} playlistInfo - Informations sur la playlist
   */
  function processBandcampPlaylist(playlistInfo) {
    // Similaire à YouTube, nous déléguons l'analyse à l'adaptateur Bandcamp

    // Mettre en place un timeout
    const timeoutId = setTimeout(() => {
      if (playlistInfo.status === 'processing') {
        playlistInfo.status = 'error';
        playlistInfo.error = 'Timeout lors du traitement de la playlist';
        state.processedPlaylists.set(playlistInfo.id, playlistInfo);

        eventBus.publish(EVENT_TYPES.PLAYLIST.PROCESSING_ERROR, {
          playlistId: playlistInfo.id,
          url: playlistInfo.url,
          sourceType: playlistInfo.sourceType,
          error: playlistInfo.error
        });

        logError(`Timeout lors du traitement de la playlist: ${playlistInfo.name}`, {
          code: 'PLAYLIST_PROCESSING_TIMEOUT',
          playlistId: playlistInfo.id,
          duration: config.processingTimeout
        });
      }
    }, config.processingTimeout);

    playlistInfo.timeoutId = timeoutId;

    // Émettre un événement pour demander à l'adaptateur Bandcamp d'analyser la playlist
    eventBus.publish(EVENT_TYPES.ADAPTER.BANDCAMP.ANALYSIS_START, {
      url: playlistInfo.url,
      playlistId: playlistInfo.id,
      maxItems: playlistInfo.maxItems
    });

    logInfo(`Demande d'analyse de playlist Bandcamp: ${playlistInfo.url}`, {
      playlistId: playlistInfo.id
    });
  }

  /**
   * Traite une playlist SoundCloud
   * @param {Object} playlistInfo - Informations sur la playlist
   */
  function processSoundcloudPlaylist(playlistInfo) {
    // Similaire aux autres services, nous déléguons l'analyse à l'adaptateur SoundCloud

    // Mettre en place un timeout
    const timeoutId = setTimeout(() => {
      if (playlistInfo.status === 'processing') {
        playlistInfo.status = 'error';
        playlistInfo.error = 'Timeout lors du traitement de la playlist';
        state.processedPlaylists.set(playlistInfo.id, playlistInfo);

        eventBus.publish(EVENT_TYPES.PLAYLIST.PROCESSING_ERROR, {
          playlistId: playlistInfo.id,
          url: playlistInfo.url,
          sourceType: playlistInfo.sourceType,
          error: playlistInfo.error
        });

        logError(`Timeout lors du traitement de la playlist: ${playlistInfo.name}`, {
          code: 'PLAYLIST_PROCESSING_TIMEOUT',
          playlistId: playlistInfo.id,
          duration: config.processingTimeout
        });
      }
    }, config.processingTimeout);

    playlistInfo.timeoutId = timeoutId;

    // Émettre un événement pour demander à l'adaptateur SoundCloud d'analyser la playlist
    eventBus.publish(EVENT_TYPES.ADAPTER.SOUNDCLOUD.ANALYSIS_START, {
      url: playlistInfo.url,
      playlistId: playlistInfo.id,
      maxItems: playlistInfo.maxItems
    });

    logInfo(`Demande d'analyse de playlist SoundCloud: ${playlistInfo.url}`, {
      playlistId: playlistInfo.id
    });
  }

  /**
   * Traite une playlist Spotify
   * @param {Object} playlistInfo - Informations sur la playlist
   */
  function processSpotifyPlaylist(playlistInfo) {
    // Similaire aux autres services, nous déléguons l'analyse à l'adaptateur Spotify

    // Mettre en place un timeout
    const timeoutId = setTimeout(() => {
      if (playlistInfo.status === 'processing') {
        playlistInfo.status = 'error';
        playlistInfo.error = 'Timeout lors du traitement de la playlist';
        state.processedPlaylists.set(playlistInfo.id, playlistInfo);

        eventBus.publish(EVENT_TYPES.PLAYLIST.PROCESSING_ERROR, {
          playlistId: playlistInfo.id,
          url: playlistInfo.url,
          sourceType: playlistInfo.sourceType,
          error: playlistInfo.error
        });

        logError(`Timeout lors du traitement de la playlist: ${playlistInfo.name}`, {
          code: 'PLAYLIST_PROCESSING_TIMEOUT',
          playlistId: playlistInfo.id,
          duration: config.processingTimeout
        });
      }
    }, config.processingTimeout);

    playlistInfo.timeoutId = timeoutId;

    // Émettre un événement pour demander à l'adaptateur Spotify d'analyser la playlist
    eventBus.publish(EVENT_TYPES.ADAPTER.SPOTIFY.ANALYSIS_START, {
      url: playlistInfo.url,
      playlistId: playlistInfo.id,
      maxItems: playlistInfo.maxItems
    });

    logInfo(`Demande d'analyse de playlist Spotify: ${playlistInfo.url}`, {
      playlistId: playlistInfo.id
    });
  }

  /**
   * Traite une playlist Tidal
   * @param {Object} playlistInfo - Informations sur la playlist
   */
  function processTidalPlaylist(playlistInfo) {
    // Similaire aux autres services, nous déléguons l'analyse à l'adaptateur Tidal

    // Mettre en place un timeout
    const timeoutId = setTimeout(() => {
      if (playlistInfo.status === 'processing') {
        playlistInfo.status = 'error';
        playlistInfo.error = 'Timeout lors du traitement de la playlist';
        state.processedPlaylists.set(playlistInfo.id, playlistInfo);

        eventBus.publish(EVENT_TYPES.PLAYLIST.PROCESSING_ERROR, {
          playlistId: playlistInfo.id,
          url: playlistInfo.url,
          sourceType: playlistInfo.sourceType,
          error: playlistInfo.error
        });

        logError(`Timeout lors du traitement de la playlist: ${playlistInfo.name}`, {
          code: 'PLAYLIST_PROCESSING_TIMEOUT',
          playlistId: playlistInfo.id,
          duration: config.processingTimeout
        });
      }
    }, config.processingTimeout);

    playlistInfo.timeoutId = timeoutId;

    // Vérifier si l'authentification Tidal est nécessaire
    eventBus.publish(EVENT_TYPES.ADAPTER.TIDAL.ANALYSIS_START, {
      url: playlistInfo.url,
      playlistId: playlistInfo.id,
      maxItems: playlistInfo.maxItems
    });

    logInfo(`Demande d'analyse de playlist Tidal: ${playlistInfo.url}`, {
      playlistId: playlistInfo.id
    });
  }

  /**
   * Traite une playlist locale
   * @param {Object} playlistInfo - Informations sur la playlist
   */
  function processLocalPlaylist(playlistInfo) {
    // Pour les playlists locales, nous devons lire le fichier nous-mêmes
    if (!playlistInfo.filePath) {
      // Erreur: chemin de fichier manquant
      playlistInfo.status = 'error';
      playlistInfo.error = 'Chemin de fichier manquant pour la playlist locale';
      state.processedPlaylists.set(playlistInfo.id, playlistInfo);

      eventBus.publish(EVENT_TYPES.PLAYLIST.PROCESSING_ERROR, {
        playlistId: playlistInfo.id,
        sourceType: playlistInfo.sourceType,
        error: playlistInfo.error
      });

      logError('Chemin de fichier manquant pour la playlist locale', {
        code: 'MISSING_LOCAL_PLAYLIST_PATH',
        playlistId: playlistInfo.id
      });

      return;
    }

    // Demander la lecture du fichier
    const requestId = `playlist_${playlistInfo.id}_${Date.now()}`;

    eventBus.publish(EVENT_TYPES.FILE.READ_REQUEST, {
      requestId,
      filePath: playlistInfo.filePath,
      encoding: 'utf8',
      metadata: {
        playlistId: playlistInfo.id,
        sourceType: 'local',
        format: path.extname(playlistInfo.filePath).substring(1)
      }
    });

    logInfo(`Demande de lecture de fichier de playlist locale: ${playlistInfo.filePath}`, {
      playlistId: playlistInfo.id
    });
  }

  /**
   * Traite le contenu d'un fichier M3U/M3U8
   * @param {string} content - Contenu du fichier
   * @param {string} playlistId - ID de la playlist
   */
  function processM3UContent(content, playlistId) {
    // Récupérer les informations de la playlist
    const playlistInfo = state.processedPlaylists.get(playlistId);

    if (!playlistInfo) {
      logError(`Playlist non trouvée pour le traitement M3U: ${playlistId}`, {
        code: 'PLAYLIST_NOT_FOUND',
        playlistId
      });
      return;
    }

    // Analyser le contenu M3U
    const lines = content.split(/\r?\n/);
    const items = [];
    let currentItem = null;

    // Vérifier si c'est un fichier M3U étendu (commence par #EXTM3U)
    const isExtendedM3U = lines.length > 0 && lines[0].trim() === '#EXTM3U';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Ignorer les lignes vides ou commentaires (sauf EXTINF)
      if (!line || (line.startsWith('#') && !line.startsWith('#EXTINF:'))) {
        continue;
      }

      if (isExtendedM3U && line.startsWith('#EXTINF:')) {
        // Format: #EXTINF:durée,Artiste - Titre
        currentItem = {};

        // Extraire les métadonnées
        const infoMatch = line.match(/^#EXTINF:(-?\d+),(.*)$/);

        if (infoMatch) {
          const duration = parseInt(infoMatch[1], 10);
          const infoText = infoMatch[2].trim();

          currentItem.duration = duration;

          // Essayer d'extraire l'artiste et le titre
          const splitIdx = infoText.indexOf(' - ');

          if (splitIdx !== -1) {
            currentItem.artist = infoText.substring(0, splitIdx).trim();
            currentItem.title = infoText.substring(splitIdx + 3).trim();
          } else {
            currentItem.title = infoText;
          }
        }
      } else if (!line.startsWith('#')) {
        // C'est une URL ou un chemin de fichier
        if (currentItem) {
          currentItem.url = line;
          items.push(currentItem);
          currentItem = null;
        } else {
          // Format simple, juste l'URL
          items.push({
            url: line,
            title: path.basename(line)
          });
        }
      }
    }

    // Limiter le nombre d'éléments si nécessaire
    if (items.length > playlistInfo.maxItems) {
      items.length = playlistInfo.maxItems;

      // Publier un avertissement
      eventBus.publish(EVENT_TYPES.PLAYLIST.LIMIT_EXCEEDED, {
        playlistId,
        itemCount: items.length,
        maxItems: playlistInfo.maxItems
      });

      logWarning(`Playlist locale tronquée à ${playlistInfo.maxItems} éléments`, {
        playlistId,
        originalCount: items.length
      });
    }

    // Mettre à jour les informations de la playlist
    playlistInfo.items = items;
    playlistInfo.status = items.length > 0 ? 'ready' : 'error';

    if (items.length === 0) {
      playlistInfo.error = 'Aucun élément trouvé dans la playlist';

      eventBus.publish(EVENT_TYPES.PLAYLIST.PROCESSING_ERROR, {
        playlistId,
        error: playlistInfo.error
      });

      logError(`Aucun élément trouvé dans la playlist M3U: ${playlistId}`, {
        code: 'EMPTY_PLAYLIST',
        playlistId
      });
    } else {
      // Soumettre les éléments pour téléchargement
      submitPlaylistItemsForDownload(playlistInfo);
    }

    // Mettre à jour l'état
    state.processedPlaylists.set(playlistId, playlistInfo);
  }

  /**
   * Traite le contenu d'un fichier PLS
   * @param {string} content - Contenu du fichier
   * @param {string} playlistId - ID de la playlist
   */
  function processPLSContent(content, playlistId) {
    // Récupérer les informations de la playlist
    const playlistInfo = state.processedPlaylists.get(playlistId);

    if (!playlistInfo) {
      logError(`Playlist non trouvée pour le traitement PLS: ${playlistId}`, {
        code: 'PLAYLIST_NOT_FOUND',
        playlistId
      });
      return;
    }

    // Analyser le contenu PLS
    const lines = content.split(/\r?\n/);
    const entries = {};
    let numEntries = 0;

    // Extraire le nombre d'entrées
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('NumberOfEntries=')) {
        numEntries = parseInt(line.substring('NumberOfEntries='.length), 10) || 0;
        break;
      }
    }

    // Lire toutes les entrées
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (!line || line.startsWith('[')) {
        continue;
      }

      const equalPos = line.indexOf('=');

      if (equalPos === -1) {
        continue;
      }

      const key = line.substring(0, equalPos).trim();
      const value = line.substring(equalPos + 1).trim();

      if (!key || !value) {
        continue;
      }

      // Format: FileX, TitleX, LengthX
      const keyMatch = key.match(/^(File|Title|Length)(\d+)$/i);

      if (keyMatch) {
        const type = keyMatch[1].toLowerCase();
        const index = parseInt(keyMatch[2], 10);

        if (!entries[index]) {
          entries[index] = {};
        }

        entries[index][type] = value;
      }
    }

    // Convertir en tableau
    const items = [];

    for (let i = 1; i <= numEntries; i++) {
      if (entries[i] && entries[i].file) {
        items.push({
          url: entries[i].file,
          title: entries[i].title || path.basename(entries[i].file),
          duration: entries[i].length ? parseInt(entries[i].length, 10) : -1
        });
      }
    }

    // Limiter le nombre d'éléments si nécessaire
    if (items.length > playlistInfo.maxItems) {
      items.length = playlistInfo.maxItems;

      // Publier un avertissement
      eventBus.publish(EVENT_TYPES.PLAYLIST.LIMIT_EXCEEDED, {
        playlistId,
        itemCount: items.length,
        maxItems: playlistInfo.maxItems
      });

      logWarning(`Playlist locale tronquée à ${playlistInfo.maxItems} éléments`, {
        playlistId,
        originalCount: items.length
      });
    }

    // Mettre à jour les informations de la playlist
    playlistInfo.items = items;
    playlistInfo.status = items.length > 0 ? 'ready' : 'error';

    if (items.length === 0) {
      playlistInfo.error = 'Aucun élément trouvé dans la playlist';

      eventBus.publish(EVENT_TYPES.PLAYLIST.PROCESSING_ERROR, {
        playlistId,
        error: playlistInfo.error
      });

      logError(`Aucun élément trouvé dans la playlist PLS: ${playlistId}`, {
        code: 'EMPTY_PLAYLIST',
        playlistId
      });
    } else {
      // Soumettre les éléments pour téléchargement
      submitPlaylistItemsForDownload(playlistInfo);
    }

    // Mettre à jour l'état
    state.processedPlaylists.set(playlistId, playlistInfo);
  }

  /**
   * Soumet les éléments d'une playlist pour téléchargement
   * @param {Object} playlistInfo - Informations sur la playlist
   */
  function submitPlaylistItemsForDownload(playlistInfo) {
    if (!playlistInfo || !playlistInfo.items || playlistInfo.items.length === 0) {
      return;
    }

    logInfo(`Soumission de ${playlistInfo.items.length} éléments pour téléchargement`, {
      playlistId: playlistInfo.id,
      sourceType: playlistInfo.sourceType
    });

    // Soumettre chaque élément
    for (let i = 0; i < playlistInfo.items.length; i++) {
      const item = playlistInfo.items[i];

      if (!item.url) {
        logWarning(`Élément sans URL ignoré`, {
          playlistId: playlistInfo.id,
          itemIndex: i
        });
        continue;
      }

      // Générer un ID unique pour cet élément
      const downloadId = `${playlistInfo.id}_item_${i}`;

      // Créer les métadonnées
      const metadata = {
        playlistId: playlistInfo.id,
        playlistName: playlistInfo.name,
        playlistIndex: i,
        playlistTotal: playlistInfo.items.length,
        title: item.title || '',
        artist: item.artist || '',
        album: playlistInfo.name
      };

      // Ajouter l'URL à la file d'attente de téléchargement
      eventBus.publish(EVENT_TYPES.DOWNLOAD.URL_ADD_REQUEST, {
        downloadId,
        url: item.url,
        sourceType: detectSourceType(item.url, playlistInfo.sourceType),
        metadata
      });
    }

    // Publier que le traitement est terminé
    eventBus.publish(EVENT_TYPES.PLAYLIST.PROCESSING_COMPLETE, {
      playlistId: playlistInfo.id,
      itemCount: playlistInfo.items.length,
      sourceType: playlistInfo.sourceType,
      name: playlistInfo.name
    });
  }

  /**
   * Termine le traitement d'une playlist
   * @param {Object} playlistInfo - Informations sur la playlist
   */
  function completePlaylistProcessing(playlistInfo) {
    // Annuler le timeout s'il existe
    if (playlistInfo.timeoutId) {
      clearTimeout(playlistInfo.timeoutId);
      delete playlistInfo.timeoutId;
    }

    // Mettre à jour le statut
    playlistInfo.status = 'completed';
    playlistInfo.completedTime = Date.now();

    // Mettre à jour l'état
    state.processedPlaylists.set(playlistInfo.id, playlistInfo);

    logInfo(`Traitement de playlist terminé: ${playlistInfo.name}`, {
      playlistId: playlistInfo.id,
      itemCount: playlistInfo.items.length,
      processedItems: playlistInfo.processedItems,
      duration: playlistInfo.completedTime - playlistInfo.startTime
    });

    // Si configuré, générer un fichier de playlist
    if (config.autoGeneratePlaylistFile) {
      // Récupérer les chemins de fichier des téléchargements terminés
      const completedFiles = [];

      for (const [, download] of state.completedDownloads.entries()) {
        if (download.playlistId === playlistInfo.id && download.filePath) {
          // Ajouter les métadonnées si disponibles
          const item = {
            filePath: download.filePath,
            metadata: download.metadata || {}
          };

          completedFiles.push(item);
        }
      }

      // Générer le fichier de playlist
      if (completedFiles.length > 0) {
        eventBus.publish(EVENT_TYPES.PLAYLIST.GENERATE_FILE_REQUEST, {
          playlistId: playlistInfo.id,
          name: playlistInfo.name,
          items: completedFiles,
          format: config.defaultPlaylistFormat
        });
      }
    }
  }

  /**
   * Génère un contenu M3U pour une playlist
   * @param {Array} items - Éléments de la playlist
   * @returns {string} Contenu M3U
   */
  function generateM3UContent(items) {
    if (!items || items.length === 0) {
      return '';
    }

    let content = '#EXTM3U\n';

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const filePath = item.filePath;
      const metadata = item.metadata || {};

      // Skip items without valid file path
      if (!filePath) {
        continue;
      }

      // Add extended info if metadata is available and enabled
      if (config.includeMetadata) {
        const title = metadata.title || path.basename(filePath, path.extname(filePath));
        const artist = metadata.artist || '';
        const duration = metadata.duration || -1;

        content += `#EXTINF:${duration},${artist ? artist + ' - ' : ''}${title}\n`;
      }

      // Add the file path
      content += `${filePath}\n`;
    }

    return content;
  }

  /**
   * Génère un contenu PLS pour une playlist
   * @param {Array} items - Éléments de la playlist
   * @returns {string} Contenu PLS
   */
  function generatePLSContent(items) {
    if (!items || items.length === 0) {
      return '';
    }

    let content = '[playlist]\n';
    content += `NumberOfEntries=${items.length}\n\n`;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const filePath = item.filePath;
      const metadata = item.metadata || {};

      // Skip items without valid file path
      if (!filePath) {
        continue;
      }

      const index = i + 1;
      const title = metadata.title || path.basename(filePath, path.extname(filePath));
      const duration = metadata.duration || -1;

      content += `File${index}=${filePath}\n`;

      if (config.includeMetadata) {
        content += `Title${index}=${metadata.artist ? metadata.artist + ' - ' : ''}${title}\n`;
        content += `Length${index}=${duration}\n`;
      } else {
        content += `Title${index}=${title}\n`;
        content += `Length${index}=-1\n`;
      }

      content += '\n';
    }

    return content;
  }

  /**
   * Détecte le type de source d'une URL
   * @param {string} url - URL à analyser
   * @param {string} defaultType - Type par défaut si non détecté
   * @returns {string} Type de source détecté
   */
  function detectSourceType(url, defaultType = 'unknown') {
    if (!url) {
      return defaultType;
    }

    url = url.toLowerCase();

    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      return 'youtube';
    } else if (url.includes('bandcamp.com')) {
      return 'bandcamp';
    } else if (url.includes('soundcloud.com')) {
      return 'soundcloud';
    } else if (url.includes('spotify.com')) {
      return 'spotify';
    } else if (url.includes('tidal.com')) {
      return 'tidal';
    } else if (url.startsWith('file://') || !url.includes('://')) {
      return 'local';
    }

    return defaultType;
  }

  /**
   * Extrait le nom d'une playlist à partir de son URL
   * @param {string} url - URL de la playlist
   * @returns {string} Nom de la playlist
   */
  function extractPlaylistName(url) {
    if (!url) {
      return 'Playlist';
    }

    let name = 'Playlist';

    try {
      // Essayer d'extraire le nom de la playlist à partir de l'URL
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter((part) => part.length > 0);

      if (pathParts.length > 0) {
        const lastPart = pathParts[pathParts.length - 1];

        // Nettoyer le nom
        name = lastPart.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); // Capitalize words
      }
    } catch (error) {
      // Si l'URL n'est pas valide, utiliser la dernière partie
      const parts = url.split('/').filter((part) => part.length > 0);

      if (parts.length > 0) {
        name = parts[parts.length - 1].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      }
    }

    return name;
  }

  /**
   * Génère un ID unique pour une playlist
   * @returns {string} ID unique
   */
  function generatePlaylistId() {
    return `playlist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Nettoie un nom de fichier pour qu'il soit valide
   * @param {string} filename - Nom de fichier à nettoyer
   * @returns {string} Nom de fichier nettoyé
   */
  function sanitizeFilename(filename) {
    if (!filename) {
      return 'playlist';
    }

    // Remplacer les caractères non valides
    return filename
      .replace(/[\\/:*?"<>|]/g, '_') // Caractères interdits sur Windows
      .replace(/\s+/g, ' ') // Espaces multiples
      .trim();
  }

  /**
   * S'assure qu'un répertoire existe, le crée si nécessaire
   * @param {string} dir - Chemin du répertoire
   */
  function ensureDirectoryExists(dir) {
    try {
      if (!dir) {
        return;
      }

      // Vérifier si le répertoire existe
      if (!fs.existsSync(dir)) {
        // Créer le répertoire de manière récursive
        fs.mkdirSync(dir, { recursive: true });

        logInfo(`Répertoire créé: ${dir}`);
      }
    } catch (error) {
      logError(`Impossible de créer le répertoire: ${dir}`, {
        code: 'DIRECTORY_CREATE_ERROR',
        error: error.message
      });
    }
  }

  /**
   * Journalise un message d'information
   * @param {string} message - Message à journaliser
   * @param {Object} [details] - Détails supplémentaires
   */
  function logInfo(message, details = {}) {
    if (!eventBus) return;

    eventBus.publish(EVENT_TYPES.LOG.INFO, {
      source: 'playlist-handler',
      message,
      details,
      timestamp: Date.now()
    });
  }

  /**
   * Journalise un message d'avertissement
   * @param {string} message - Message à journaliser
   * @param {Object} [details] - Détails supplémentaires
   */
  function logWarning(message, details = {}) {
    if (!eventBus) return;

    eventBus.publish(EVENT_TYPES.LOG.WARNING, {
      source: 'playlist-handler',
      message,
      details,
      timestamp: Date.now()
    });
  }

  /**
   * Journalise un message d'erreur
   * @param {string} message - Message à journaliser
   * @param {Object} [details] - Détails supplémentaires
   */
  function logError(message, details = {}) {
    if (!eventBus) return;

    // Publier l'erreur dans le journal
    eventBus.publish(EVENT_TYPES.LOG.ERROR, {
      source: 'playlist-handler',
      message,
      details,
      timestamp: Date.now()
    });

    // Publier également l'erreur sur le bus d'événements
    const errorCode = details.code || 'PLAYLIST_ERROR';

    eventBus.publish(EVENT_TYPES.ERROR.NON_CRITICAL, {
      source: 'playlist-handler',
      code: errorCode,
      message,
      details
    });
  }

  // Exporter uniquement la fonction d'initialisation
  return {
    initialize
  };
}

// Créer et exporter l'instance
const playlistHandler = PlaylistHandler();
module.exports = playlistHandler;

/**
 * Exemples d'utilisation:
 *
 * // Initialisation
 * const eventBus = require('./core/event-bus').getInstance();
 * const EVENT_TYPES = require('./constants/event-types');
 * const ERROR_CODES = require('./constants/error-codes');
 * const playlistHandler = require('./utils/playlist-handler');
 *
 * playlistHandler.initialize(eventBus, EVENT_TYPES, ERROR_CODES);
 *
 * // Détecter une playlist YouTube
 * eventBus.publish(EVENT_TYPES.PLAYLIST.DETECTED, {
 *   url: 'https://www.youtube.com/playlist?list=PLxxx',
 *   sourceType: 'youtube',
 *   itemCount: 45
 * });
 *
 * // Demander le traitement d'une playlist
 * eventBus.publish(EVENT_TYPES.PLAYLIST.PROCESS_REQUEST, {
 *   id: 'my_playlist_123',
 *   url: 'https://www.youtube.com/playlist?list=PLxxx',
 *   sourceType: 'youtube',
 *   name: 'Ma Super Playlist'
 * });
 *
 * // Écouter les événements de progression
 * eventBus.subscribe(EVENT_TYPES.PLAYLIST.PROCESSING_PROGRESS, (data) => {
 *   console.log(`Progression: ${data.progress.toFixed(2)}%`);
 *   updateProgressBar(data.progress);
 * });
 *
 * // Génération d'un fichier de playlist
 * eventBus.publish(EVENT_TYPES.PLAYLIST.GENERATE_FILE_REQUEST, {
 *   playlistId: 'my_playlist_123',
 *   name: 'Ma Super Playlist',
 *   items: [
 *     {
 *       filePath: '/chemin/vers/fichier1.mp3',
 *       metadata: {
 *         title: 'Titre 1',
 *         artist: 'Artiste 1',
 *         duration: 180
 *       }
 *     },
 *     {
 *       filePath: '/chemin/vers/fichier2.mp3',
 *       metadata: {
 *         title: 'Titre 2',
 *         artist: 'Artiste 2',
 *         duration: 240
 *       }
 *     }
 *   ],
 *   format: 'm3u'
 * });
 */ // Traitement des playlists
// Créé automatiquement le 2025-05-02
