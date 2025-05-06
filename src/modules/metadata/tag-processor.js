/**
 * @fileoverview Module de traitement des tags audio pour l'application 21 BYTS
 *
 * Ce module gère l'extraction, la modification et l'écriture des métadonnées (tags)
 * dans les fichiers audio. Il utilise des bibliothèques externes pour manipuler
 * différents formats de tags (ID3, Vorbis Comments, etc.) et fournit une interface
 * unifiée accessible via le bus d'événements.
 *
 * Conformément à l'architecture "Single File Component", ce module fonctionne
 * de manière totalement autonome, sans aucune dépendance directe sur d'autres
 * modules du projet. Toute communication se fait exclusivement via le bus d'événements.
 *
 * @module metadata/tag-processor
 *
 * @events
 * ÉCOUTE:
 * - METADATA:EXTRACT_REQUEST - Demande d'extraction des métadonnées d'un fichier
 * - METADATA:UPDATE_REQUEST - Demande de mise à jour des métadonnées d'un fichier
 * - METADATA:ARTWORK_EXTRACT_REQUEST - Demande d'extraction de pochette d'album
 * - METADATA:ARTWORK_UPDATE_REQUEST - Demande de mise à jour de pochette d'album
 * - CONFIG:UPDATED - Mise à jour de la configuration du module
 * - APP:READY - Initialisation du module lorsque l'application est prête
 *
 * ÉMET:
 * - METADATA:EXTRACTED - Métadonnées extraites avec succès
 * - METADATA:EXTRACT_ERROR - Erreur lors de l'extraction de métadonnées
 * - METADATA:UPDATED - Métadonnées mises à jour avec succès
 * - METADATA:UPDATE_ERROR - Erreur lors de la mise à jour de métadonnées
 * - METADATA:ARTWORK_EXTRACTED - Pochette d'album extraite avec succès
 * - METADATA:ARTWORK_ERROR - Erreur lors de l'extraction/mise à jour de pochette
 * - ERROR:NON_CRITICAL - Signalement d'une erreur non critique
 * - LOG:INFO - Information de journalisation
 * - LOG:WARNING - Avertissement de journalisation
 * - LOG:ERROR - Erreur de journalisation
 */

'use strict';

// Dépendances Node.js standard uniquement
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const os = require('os');
const { promisify } = require('util');

// Promisification des fonctions fs
const fsAccess = promisify(fs.access);
const fsReadFile = promisify(fs.readFile);
const fsWriteFile = promisify(fs.writeFile);
const fsStat = promisify(fs.stat);
const execFilePromise = promisify(execFile);

/**
 * Format audio supportés et leurs extensions
 * @constant
 */
const SUPPORTED_FORMATS = {
  'mp3': {
    extensions: ['.mp3'],
    tagType: 'id3',
    mimeType: 'audio/mpeg'
  },
  'flac': {
    extensions: ['.flac'],
    tagType: 'vorbis',
    mimeType: 'audio/flac'
  },
  'ogg': {
    extensions: ['.ogg', '.oga'],
    tagType: 'vorbis',
    mimeType: 'audio/ogg'
  },
  'wav': {
    extensions: ['.wav', '.wave'],
    tagType: 'riff',
    mimeType: 'audio/wav'
  },
  'aac': {
    extensions: ['.aac', '.m4a'],
    tagType: 'mp4',
    mimeType: 'audio/aac'
  },
  'aiff': {
    extensions: ['.aiff', '.aif'],
    tagType: 'id3',
    mimeType: 'audio/aiff'
  }
};

/**
 * Mapping des tags standardisés vers les formats spécifiques
 * @constant
 */
const TAG_MAPPING = {
  // Format standardisé -> Format spécifique
  'title': {
    'id3': 'TIT2',
    'vorbis': 'TITLE',
    'riff': 'INAM',
    'mp4': '©nam'
  },
  'artist': {
    'id3': 'TPE1',
    'vorbis': 'ARTIST',
    'riff': 'IART',
    'mp4': '©ART'
  },
  'album': {
    'id3': 'TALB',
    'vorbis': 'ALBUM',
    'riff': 'IALB',
    'mp4': '©alb'
  },
  'year': {
    'id3': 'TYER',
    'vorbis': 'DATE',
    'riff': 'ICRD',
    'mp4': '©day'
  },
  'genre': {
    'id3': 'TCON',
    'vorbis': 'GENRE',
    'riff': 'IGNR',
    'mp4': '©gen'
  },
  'trackNumber': {
    'id3': 'TRCK',
    'vorbis': 'TRACKNUMBER',
    'riff': 'ITRK',
    'mp4': 'trkn'
  },
  'comment': {
    'id3': 'COMM',
    'vorbis': 'COMMENT',
    'riff': 'ICMT',
    'mp4': '©cmt'
  },
  'albumArtist': {
    'id3': 'TPE2',
    'vorbis': 'ALBUMARTIST',
    'riff': 'IARL',
    'mp4': 'aART'
  },
  'discNumber': {
    'id3': 'TPOS',
    'vorbis': 'DISCNUMBER',
    'riff': 'IDCD',
    'mp4': 'disk'
  },
  'composer': {
    'id3': 'TCOM',
    'vorbis': 'COMPOSER',
    'riff': 'IMUS',
    'mp4': '©wrt'
  },
  'length': {
    'id3': 'TLEN',
    'vorbis': 'LENGTH',
    'riff': 'ILEN',
    'mp4': '©len'
  }
};

/**
 * TagProcessor - Module de traitement des tags audio
 */
function TagProcessor() {
  // Bus d'événements - injecté lors de l'initialisation
  let eventBus = null;

  // Références aux types d'événements et codes d'erreur standardisés
  let EVENT_TYPES = null;
  let ERROR_CODES = null;

  // Configuration par défaut
  const DEFAULT_CONFIG = {
    // Chemin des outils externes
    ffmpegPath: '',
    ffprobePath: '',

    // Options de traitement des pochettes
    artworkEmbedding: true,
    artworkMaxSize: 1000,
    artworkFormat: 'jpg',
    artworkJpegQuality: 90,

    // Options de normalisation
    normalizeTagNames: true,
    convertToUTF8: true,
    removeDuplicateTags: true,

    // Options de génération de tags
    generateMissingArtwork: false,
    fallbackArtworkPath: '',

    // Comportement en cas d'erreur
    ignoreMinorTagErrors: true,

    // Formats supportés (peut être restreint par la configuration)
    enabledFormats: ['mp3', 'flac', 'ogg', 'wav', 'aac', 'aiff'],

    // Options de performance
    useCaching: true,
    maxCacheSize: 50 // Nombre maximum d'entrées en cache
  };

  // Configuration active
  let config = { ...DEFAULT_CONFIG };

  // Cache des métadonnées pour éviter des lectures répétées
  let metadataCache = new Map();

  // État du module
  let isInitialized = false;

  // Compteur pour les IDs de requête générés
  let requestCounter = 0;

  /**
   * Initialise le module de traitement des tags
   * @param {Object} injectedEventBus - Le bus d'événements à utiliser
   * @param {Object} eventTypes - Les types d'événements standardisés
   * @param {Object} errorCodes - Les codes d'erreur standardisés
   */
  function initialize(injectedEventBus, eventTypes, errorCodes) {
    if (!injectedEventBus) {
      console.error('TagProcessor: Bus d\'événements requis pour l\'initialisation');
      return;
    }

    eventBus = injectedEventBus;
    EVENT_TYPES = eventTypes || {};
    ERROR_CODES = errorCodes || {};

    // Configurer les chemins par défaut en fonction de la plateforme
    configurePlatformDefaults();

    // S'abonner aux événements
    registerEventListeners();

    isInitialized = true;

    // Logger l'initialisation
    logInfo('Module TagProcessor initialisé');
  }

  /**
   * Configure les valeurs par défaut spécifiques à la plateforme
   */
  function configurePlatformDefaults() {
    const platform = process.platform;

    // Déterminer les chemins par défaut des outils externes selon la plateforme
    if (platform === 'win32') {
      // Windows
      config.ffmpegPath = path.join(process.resourcesPath, 'bin', 'ffmpeg.exe');
      config.ffprobePath = path.join(process.resourcesPath, 'bin', 'ffprobe.exe');
    } else if (platform === 'darwin') {
      // macOS
      config.ffmpegPath = path.join(process.resourcesPath, 'bin', 'ffmpeg');
      config.ffprobePath = path.join(process.resourcesPath, 'bin', 'ffprobe');
    } else {
      // Linux et autres plateformes
      config.ffmpegPath = 'ffmpeg'; // Supposé être dans le PATH
      config.ffprobePath = 'ffprobe'; // Supposé être dans le PATH
    }

    // Définir un dossier de pochettes par défaut
    config.fallbackArtworkPath = path.join(
      os.homedir(), '.21byts', 'artwork', 'fallback.jpg'
    );
  }

  /**
   * S'abonne aux événements pertinents sur le bus d'événements
   */
  function registerEventListeners() {
    // Événements système
    eventBus.subscribe(EVENT_TYPES.APP.READY, handleAppReady);
    eventBus.subscribe(EVENT_TYPES.CONFIG.UPDATED, handleConfigUpdate);

    // Événements de métadonnées
    eventBus.subscribe(EVENT_TYPES.METADATA.EXTRACT_REQUEST, handleExtractRequest);
    eventBus.subscribe(EVENT_TYPES.METADATA.UPDATE_REQUEST, handleUpdateRequest);
    eventBus.subscribe(EVENT_TYPES.METADATA.ARTWORK_EXTRACT_REQUEST, handleArtworkExtractRequest);
    eventBus.subscribe(EVENT_TYPES.METADATA.ARTWORK_UPDATE_REQUEST, handleArtworkUpdateRequest);
  }

  /**
   * Gère l'événement de démarrage de l'application
   */
  function handleAppReady() {
    // Demander la configuration spécifique au module
    eventBus.publish(EVENT_TYPES.CONFIG.GET, {
      key: 'metadata',
      requestId: 'tag-processor-init'
    });

    // Vérifier la disponibilité des outils externes
    checkExternalTools();
  }

  /**
   * Gère les mises à jour de configuration
   * @param {Object} data - Données de la mise à jour
   */
  function handleConfigUpdate(data) {
    if (!data || !data.metadata) {
      return;
    }

    const metadataConfig = data.metadata;

    // Mettre à jour la configuration
    Object.keys(metadataConfig).forEach(key => {
      if (config.hasOwnProperty(key)) {
        config[key] = metadataConfig[key];
      }
    });

    // Vider le cache après une mise à jour de configuration
    if (metadataConfig.useCaching === false) {
      metadataCache.clear();
    }

    logInfo('Configuration mise à jour');
  }

  /**
   * Vérifie la disponibilité des outils externes (FFmpeg, FFprobe)
   */
  async function checkExternalTools() {
    try {
      // Vérifier FFmpeg
      await execFilePromise(config.ffmpegPath, ['-version']);

      // Vérifier FFprobe
      await execFilePromise(config.ffprobePath, ['-version']);

      logInfo('Outils externes (FFmpeg, FFprobe) disponibles');
    } catch (error) {
      publishError(
        'EXTERNAL_TOOL_NOT_FOUND',
        'Outils externes (FFmpeg, FFprobe) non trouvés ou non fonctionnels',
        error
      );
    }
  }

  /**
   * Gère une demande d'extraction de métadonnées
   * @param {Object} data - Données de la demande
   */
  function handleExtractRequest(data) {
    if (!data || !data.filePath) {
      publishError('INVALID_REQUEST', 'Chemin de fichier manquant dans la demande d\'extraction');

      if (data && data.requestId) {
        eventBus.publish(EVENT_TYPES.METADATA.EXTRACT_ERROR, {
          requestId: data.requestId,
          error: 'Chemin de fichier manquant'
        });
      }

      return;
    }

    const filePath = data.filePath;
    const requestId = data.requestId || generateRequestId('extract');
    const options = data.options || {};

    // Vérifier si les métadonnées sont en cache
    if (config.useCaching && metadataCache.has(filePath) && !options.forceRefresh) {
      const cachedMetadata = metadataCache.get(filePath);

      // Publier les métadonnées depuis le cache
      eventBus.publish(EVENT_TYPES.METADATA.EXTRACTED, {
        requestId,
        filePath,
        metadata: cachedMetadata,
        fromCache: true
      });

      logInfo(`Métadonnées extraites depuis le cache: ${filePath}`);
      return;
    }

    // Extraire les métadonnées du fichier
    extractMetadata(filePath, options)
      .then(metadata => {
        // Mettre en cache si activé
        if (config.useCaching) {
          // Limiter la taille du cache
          if (metadataCache.size >= config.maxCacheSize) {
            // Supprimer l'entrée la plus ancienne (première entrée)
            const oldestKey = metadataCache.keys().next().value;
            metadataCache.delete(oldestKey);
          }

          metadataCache.set(filePath, metadata);
        }

        // Publier les métadonnées extraites
        eventBus.publish(EVENT_TYPES.METADATA.EXTRACTED, {
          requestId,
          filePath,
          metadata,
          fromCache: false
        });

        logInfo(`Métadonnées extraites: ${filePath}`);
      })
      .catch(error => {
        publishError('METADATA_EXTRACTION_FAILED', `Échec d'extraction des métadonnées: ${filePath}`, error);

        // Publier l'erreur
        eventBus.publish(EVENT_TYPES.METADATA.EXTRACT_ERROR, {
          requestId,
          filePath,
          error: error.message
        });
      });
  }

  /**
   * Gère une demande de mise à jour de métadonnées
   * @param {Object} data - Données de la demande
   */
  function handleUpdateRequest(data) {
    if (!data || !data.filePath || !data.metadata) {
      publishError('INVALID_REQUEST', 'Données invalides dans la demande de mise à jour de métadonnées');

      if (data && data.requestId) {
        eventBus.publish(EVENT_TYPES.METADATA.UPDATE_ERROR, {
          requestId: data.requestId,
          error: 'Données invalides'
        });
      }

      return;
    }

    const filePath = data.filePath;
    const metadata = data.metadata;
    const requestId = data.requestId || generateRequestId('update');
    const options = data.options || {};

    // Mettre à jour les métadonnées du fichier
    updateMetadata(filePath, metadata, options)
      .then(updatedMetadata => {
        // Mettre à jour le cache si activé
        if (config.useCaching) {
          metadataCache.set(filePath, updatedMetadata);
        }

        // Publier la confirmation de mise à jour
        eventBus.publish(EVENT_TYPES.METADATA.UPDATED, {
          requestId,
          filePath,
          metadata: updatedMetadata
        });

        logInfo(`Métadonnées mises à jour: ${filePath}`);
      })
      .catch(error => {
        publishError('METADATA_UPDATE_FAILED', `Échec de mise à jour des métadonnées: ${filePath}`, error);

        // Publier l'erreur
        eventBus.publish(EVENT_TYPES.METADATA.UPDATE_ERROR, {
          requestId,
          filePath,
          error: error.message
        });
      });
  }

  /**
   * Gère une demande d'extraction de pochette
   * @param {Object} data - Données de la demande
   */
  function handleArtworkExtractRequest(data) {
    if (!data || !data.filePath) {
      publishError('INVALID_REQUEST', 'Chemin de fichier manquant dans la demande d\'extraction de pochette');

      if (data && data.requestId) {
        eventBus.publish(EVENT_TYPES.METADATA.ARTWORK_ERROR, {
          requestId: data.requestId,
          error: 'Chemin de fichier manquant'
        });
      }

      return;
    }

    const filePath = data.filePath;
    const requestId = data.requestId || generateRequestId('artwork-extract');
    const outputPath = data.outputPath || generateTempPath(filePath, 'artwork');
    const options = data.options || {};

    // Extraire la pochette du fichier
    extractArtwork(filePath, outputPath, options)
      .then(artworkData => {
        // Publier la pochette extraite
        eventBus.publish(EVENT_TYPES.METADATA.ARTWORK_EXTRACTED, {
          requestId,
          filePath,
          artworkPath: artworkData.path,
          artworkBuffer: artworkData.buffer,
          format: artworkData.format,
          size: artworkData.size,
          dimensions: artworkData.dimensions
        });

        logInfo(`Pochette extraite: ${filePath} -> ${artworkData.path}`);
      })
      .catch(error => {
        publishError('ARTWORK_EXTRACTION_FAILED', `Échec d'extraction de pochette: ${filePath}`, error);

        // Si l'option de fallback est activée et qu'une pochette par défaut est définie
        if (options.useFallback !== false && config.generateMissingArtwork && config.fallbackArtworkPath) {
          try {
            // Vérifier si la pochette par défaut existe
            if (fs.existsSync(config.fallbackArtworkPath)) {
              // Publier la pochette par défaut
              eventBus.publish(EVENT_TYPES.METADATA.ARTWORK_EXTRACTED, {
                requestId,
                filePath,
                artworkPath: config.fallbackArtworkPath,
                isFallback: true
              });

              logInfo(`Pochette par défaut utilisée: ${filePath} -> ${config.fallbackArtworkPath}`);
              return;
            }
          } catch (fallbackError) {
            // Ignorer les erreurs de fallback
          }
        }

        // Publier l'erreur
        eventBus.publish(EVENT_TYPES.METADATA.ARTWORK_ERROR, {
          requestId,
          filePath,
          error: error.message
        });
      });
  }

  /**
   * Gère une demande de mise à jour de pochette
   * @param {Object} data - Données de la demande
   */
  function handleArtworkUpdateRequest(data) {
    if (!data || !data.filePath || (!data.artworkPath && !data.artworkBuffer)) {
      publishError('INVALID_REQUEST', 'Données invalides dans la demande de mise à jour de pochette');

      if (data && data.requestId) {
        eventBus.publish(EVENT_TYPES.METADATA.ARTWORK_ERROR, {
          requestId: data.requestId,
          error: 'Données invalides'
        });
      }

      return;
    }

    const filePath = data.filePath;
    const artworkPath = data.artworkPath;
    const artworkBuffer = data.artworkBuffer;
    const requestId = data.requestId || generateRequestId('artwork-update');
    const options = data.options || {};

    // Mettre à jour la pochette du fichier
    updateArtwork(filePath, { path: artworkPath, buffer: artworkBuffer }, options)
      .then(result => {
        // Invalider le cache
        if (config.useCaching && metadataCache.has(filePath)) {
          metadataCache.delete(filePath);
        }

        // Publier la confirmation de mise à jour
        eventBus.publish(EVENT_TYPES.METADATA.UPDATED, {
          requestId,
          filePath,
          artworkUpdated: true
        });

        logInfo(`Pochette mise à jour: ${filePath}`);
      })
      .catch(error => {
        publishError('ARTWORK_UPDATE_FAILED', `Échec de mise à jour de pochette: ${filePath}`, error);

        // Publier l'erreur
        eventBus.publish(EVENT_TYPES.METADATA.ARTWORK_ERROR, {
          requestId,
          filePath,
          error: error.message
        });
      });
  }

  /**
   * Extrait les métadonnées d'un fichier audio
   * @param {string} filePath - Chemin du fichier audio
   * @param {Object} options - Options d'extraction
   * @returns {Promise<Object>} Métadonnées extraites
   */
  async function extractMetadata(filePath, options = {}) {
    try {
      // Vérifier que le fichier existe
      await fsAccess(filePath, fs.constants.R_OK);

      // Déterminer le format audio
      const format = detectAudioFormat(filePath);

      if (!format) {
        throw new Error(`Format audio non supporté: ${path.extname(filePath)}`);
      }

      // Extraire les métadonnées via FFprobe
      const metadata = await extractMetadataWithFFprobe(filePath, format);

      // Normaliser les noms de tags si configuré
      if (config.normalizeTagNames) {
        normalizeTagNames(metadata, format.tagType);
      }

      // Ajouter des informations sur le fichier
      const stats = await fsStat(filePath);
      metadata._fileInfo = {
        path: filePath,
        size: stats.size,
        modified: stats.mtime,
        format: format.name,
        extension: path.extname(filePath).toLowerCase()
      };

      // Vérifier si le fichier contient une pochette
      metadata._hasArtwork = await checkHasArtwork(filePath);

      return metadata;
    } catch (error) {
      throw new Error(`Erreur lors de l'extraction des métadonnées: ${error.message}`);
    }
  }

  /**
   * Met à jour les métadonnées d'un fichier audio
   * @param {string} filePath - Chemin du fichier audio
   * @param {Object} metadata - Nouvelles métadonnées
   * @param {Object} options - Options de mise à jour
   * @returns {Promise<Object>} Métadonnées mises à jour
   */
  async function updateMetadata(filePath, metadata, options = {}) {
    try {
      // Vérifier que le fichier existe et est accessible
      await fsAccess(filePath, fs.constants.R_OK | fs.constants.W_OK);

      // Déterminer le format audio
      const format = detectAudioFormat(filePath);

      if (!format) {
        throw new Error(`Format audio non supporté: ${path.extname(filePath)}`);
      }

      // Créer un fichier temporaire pour éviter de corrompre l'original en cas d'erreur
      const tempFilePath = generateTempPath(filePath, 'update');

      // Préparer les arguments FFmpeg
      const ffmpegArgs = [
        '-i', filePath,
        '-map_metadata', '0',
        '-id3v2_version', '3'
      ];

      // Ajouter les arguments de métadonnées
      for (const [key, value] of Object.entries(metadata)) {
        // Ignorer les clés spéciales
        if (key.startsWith('_')) continue;

        // Ignorer les valeurs nulles ou vides
        if (value === null || value === undefined || value === '') continue;

        // Convertir le nom standardisé en nom spécifique au format
        const specificKey = getSpecificTagName(key, format.tagType);

        if (specificKey) {
          ffmpegArgs.push('-metadata', `${specificKey}=${value}`);
        }
      }

      // Conserver le format audio original
      ffmpegArgs.push('-c', 'copy');

      // Spécifier le fichier de sortie
      ffmpegArgs.push(tempFilePath);

      // Exécuter FFmpeg pour mettre à jour les métadonnées
      await execFilePromise(config.ffmpegPath, ffmpegArgs);

      // Remplacer le fichier original par le fichier mis à jour
      await fs.promises.rename(tempFilePath, filePath);

      // Extraire les nouvelles métadonnées pour confirmation
      const updatedMetadata = await extractMetadata(filePath, { forceRefresh: true });

      return updatedMetadata;
    } catch (error) {
      throw new Error(`Erreur lors de la mise à jour des métadonnées: ${error.message}`);
    }
  }

  /**
   * Extrait la pochette d'un fichier audio
   * @param {string} filePath - Chemin du fichier audio
   * @param {string} outputPath - Chemin de sortie pour la pochette
   * @param {Object} options - Options d'extraction
   * @returns {Promise<Object>} Informations sur la pochette extraite
   */
  async function extractArtwork(filePath, outputPath, options = {}) {
    try {
      // Vérifier que le fichier existe
      await fsAccess(filePath, fs.constants.R_OK);

      // Préparer les arguments FFmpeg
      const ffmpegArgs = [
        '-i', filePath,
        '-an', // Ignorer l'audio
        '-vcodec', 'copy', // Copier le codec vidéo (pochette)
        outputPath
      ];

      // Exécuter FFmpeg pour extraire la pochette
      await execFilePromise(config.ffmpegPath, ffmpegArgs);

      // Vérifier si la pochette a été extraite
      try {
        await fsAccess(outputPath, fs.constants.R_OK);
      } catch (error) {
        throw new Error('Aucune pochette trouvée dans le fichier');
      }

      // Obtenir les informations sur la pochette
      const stats = await fsStat(outputPath);
      const artworkBuffer = await fsReadFile(outputPath);

      // Analyser le format et les dimensions de l'image
      const imageInfo = await getImageInfo(artworkBuffer);

      return {
        path: outputPath,
        buffer: options.includeBuffer ? artworkBuffer : undefined,
        format: imageInfo.format,
        size: stats.size,
        dimensions: imageInfo.dimensions
      };
    } catch (error) {
      throw new Error(`Erreur lors de l'extraction de la pochette: ${error.message}`);
    }
  }

  /**
   * Met à jour la pochette d'un fichier audio
   * @param {string} filePath - Chemin du fichier audio
   * @param {Object} artwork - Données de la pochette (chemin ou buffer)
   * @param {Object} options - Options de mise à jour
   * @returns {Promise<boolean>} Succès de la mise à jour
   */
  async function updateArtwork(filePath, artwork, options = {}) {
    try {
      // Vérifier que le fichier existe et est accessible
      await fsAccess(filePath, fs.constants.R_OK | fs.constants.W_OK);

      // Déterminer le format audio
      const format = detectAudioFormat(filePath);

      if (!format) {
        throw new Error(`Format audio non supporté: ${path.extname(filePath)}`);
      }

      // Vérifier si nous avons un chemin ou un buffer pour la pochette
      let artworkPath = artwork.path;

      if (!artworkPath && artwork.buffer) {
        // Écrire le buffer dans un fichier temporaire
        artworkPath = generateTempPath(filePath, 'artwork-buffer');
        await fsWriteFile(artworkPath, artwork.buffer);
      }

      if (!artworkPath) {
        throw new Error('Aucune pochette fournie (ni chemin, ni buffer)');
      }

      // Vérifier que la pochette existe
      await fsAccess(artworkPath, fs.constants.R_OK);

      // Créer un fichier temporaire pour éviter de corrompre l'original en cas d'erreur
      const tempFilePath = generateTempPath(filePath, 'artwork-update');

      // Redimensionner et convertir la pochette si nécessaire
      let processedArtworkPath = artworkPath;
      if (options.resize !== false || options.convertFormat) {
        processedArtworkPath = await processArtwork(
          artworkPath,
          generateTempPath(filePath, 'artwork-processed'),
          {
            maxSize: options.maxSize || config.artworkMaxSize,
            format: options.format || config.artworkFormat,
            quality: options.quality || config.artworkJpegQuality
          }
        );
      }

      // Préparer les arguments FFmpeg
      const ffmpegArgs = [
        '-i', filePath,
        '-i', processedArtworkPath,
        '-map', '0', // Prendre tout du premier fichier (audio)
        '-map', '1', // Prendre tout du deuxième fichier (pochette)
        '-c', 'copy', // Copier le codec audio
        '-id3v2_version', '3' // Utiliser ID3v2.3 pour une meilleure compatibilité
      ];

      // Arguments spécifiques selon le format
      if (format.name === 'mp3' || format.name === 'aiff') {
        ffmpegArgs.push('-metadata:s:v', 'title=Album cover');
        ffmpegArgs.push('-metadata:s:v', 'comment=Cover (front)');
      }

      // Spécifier le fichier de sortie
      ffmpegArgs.push(tempFilePath);

      // Exécuter FFmpeg pour mettre à jour la pochette
      await execFilePromise(config.ffmpegPath, ffmpegArgs);

      // Remplacer le fichier original par le fichier mis à jour
      await fs.promises.rename(tempFilePath, filePath);

      // Nettoyer les fichiers temporaires
      if (processedArtworkPath !== artworkPath) {
        try {
          await fs.promises.unlink(processedArtworkPath);
        } catch (cleanupError) {
          // Ignorer les erreurs de nettoyage
        }
      }

      // Si le buffer a été écrit dans un fichier temporaire, le supprimer
      if (!artwork.path && artwork.buffer) {
        try {
          await fs.promises.unlink(artworkPath);
        } catch (cleanupError) {
          // Ignorer les erreurs de nettoyage
        }
      }

      return true;
    } catch (error) {
      throw new Error(`Erreur lors de la mise à jour de la pochette: ${error.message}`);
    }
  }// Traitement des tags
// Créé automatiquement le 2025-05-02

