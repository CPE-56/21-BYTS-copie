/**
 * @fileoverview Convertisseur de formats audio pour 21 BYTS
 *
 * Ce module gère la conversion entre différents formats audio (MP3, WAV, FLAC, AIFF)
 * en utilisant FFmpeg comme backend. Il est conçu pour fonctionner de manière totalement
 * autonome, communiquant uniquement via le bus d'événements central.
 *
 * @module formats/format-converter
 *
 * @events
 * ÉCOUTÉS:
 * - FORMAT_CONVERSION_REQUESTED: Demande de conversion d'un fichier audio
 *   Payload: {
 *     sourceFile: String, // Chemin du fichier source
 *     targetFormat: String, // Format cible ('mp3', 'wav', 'flac', 'aiff')
 *     quality: Object, // Paramètres de qualité (ex: bitrate pour MP3, sample rate)
 *     metadata: Object, // Métadonnées à conserver
 *     requestId: String // Identifiant unique pour suivre la demande
 *   }
 * - FORMAT_CONVERSION_CANCEL: Annulation d'une conversion en cours
 *   Payload: {
 *     requestId: String // Identifiant de la demande à annuler
 *   }
 * - APP_SHUTDOWN: Signal d'arrêt de l'application
 *
 * ÉMIS:
 * - FORMAT_CONVERSION_STARTED: Conversion démarrée
 *   Payload: {
 *     requestId: String, // Identifiant de la demande
 *     sourceFile: String, // Fichier source
 *     targetFormat: String // Format cible
 *   }
 * - FORMAT_CONVERSION_PROGRESS: Progression de la conversion
 *   Payload: {
 *     requestId: String, // Identifiant de la demande
 *     progress: Number // Progression en pourcentage (0-100)
 *   }
 * - FORMAT_CONVERSION_COMPLETED: Conversion terminée avec succès
 *   Payload: {
 *     requestId: String, // Identifiant de la demande
 *     outputFile: String, // Chemin du fichier de sortie
 *     duration: Number // Durée en secondes de la conversion
 *   }
 * - FORMAT_CONVERSION_FAILED: Échec de la conversion
 *   Payload: {
 *     requestId: String, // Identifiant de la demande
 *     error: Object, // Détails de l'erreur
 *     sourceFile: String // Fichier source
 *   }
 * - ERROR: Erreur générale du module
 *   Payload: {
 *     source: 'format-converter',
 *     code: String, // Code d'erreur standardisé
 *     message: String, // Message d'erreur
 *     details: Object // Détails supplémentaires
 *   }
 *
 * @example
 * // La conversion est initiée par d'autres modules via un événement:
 * // eventBus.publish('FORMAT_CONVERSION_REQUESTED', {
 * //   sourceFile: '/chemin/vers/fichier.mp3',
 * //   targetFormat: 'flac',
 * //   quality: { sampleRate: 44100 },
 * //   metadata: { artist: 'Artiste', title: 'Titre' },
 * //   requestId: 'conversion-123'
 * // });
 */

// Dépendances externes (Node.js/Electron uniquement, pas de modules internes)
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

// Stockage local pour les conversions en cours
const activeConversions = new Map();

/**
 * Initialise le module et s'enregistre auprès du bus d'événements
 */
function initialize() {
  // Cette fonction est appelée par le système d'initialisation via un événement
  // Elle ne fait aucune référence directe à d'autres modules

  // Récupérer une référence au bus d'événements via l'événement d'initialisation
  window.addEventListener('MODULE_INITIALIZED', (event) => {
    if (event.detail && event.detail.module === 'format-converter') {
      const { eventBus } = event.detail;

      // S'abonner aux événements pertinents
      eventBus.subscribe('FORMAT_CONVERSION_REQUESTED', handleConversionRequest);
      eventBus.subscribe('FORMAT_CONVERSION_CANCEL', handleCancellation);
      eventBus.subscribe('APP_SHUTDOWN', cleanupModule);

      // Signaler que le module est prêt
      eventBus.publish('MODULE_READY', {
        module: 'format-converter',
        capabilities: getSupportedFormats()
      });

      // Stocker une référence locale au bus d'événements pour utilisation ultérieure
      moduleEventBus = eventBus;
    }
  });

  // Émettre un événement pour demander l'enregistrement
  window.dispatchEvent(
    new CustomEvent('MODULE_REGISTRATION_REQUESTED', {
      detail: { module: 'format-converter' }
    })
  );
}

// Variable locale pour stocker la référence au bus d'événements
let moduleEventBus = null;

/**
 * Récupère les formats supportés basés sur la configuration FFmpeg détectée
 * @returns {Object} Liste des formats supportés
 */
function getSupportedFormats() {
  // Dans une implémentation réelle, cela vérifierait dynamiquement les capacités
  // de l'installation FFmpeg, mais simplifié ici pour la démonstration
  return {
    input: ['mp3', 'wav', 'flac', 'aiff', 'ogg', 'm4a', 'wma'],
    output: ['mp3', 'wav', 'flac', 'aiff'],
    quality: {
      mp3: ['128kbps', '192kbps', '256kbps', '320kbps'],
      wav: ['16bit', '24bit', '32bit'],
      flac: ['level0', 'level5', 'level8'],
      aiff: ['16bit', '24bit']
    }
  };
}

/**
 * Gère une demande de conversion de format
 * @param {Object} payload Détails de la demande de conversion
 */
function handleConversionRequest(payload) {
  if (!validateConversionRequest(payload)) {
    moduleEventBus.publish('ERROR', {
      source: 'format-converter',
      code: 'INVALID_CONVERSION_REQUEST',
      message: 'Demande de conversion invalide',
      details: { payload }
    });

    moduleEventBus.publish('FORMAT_CONVERSION_FAILED', {
      requestId: payload.requestId || 'unknown',
      error: { code: 'INVALID_REQUEST' },
      sourceFile: payload.sourceFile || 'unknown'
    });

    return;
  }

  const { sourceFile, targetFormat, quality, metadata, requestId } = payload;

  // Vérifier l'existence du fichier source
  if (!fs.existsSync(sourceFile)) {
    moduleEventBus.publish('FORMAT_CONVERSION_FAILED', {
      requestId,
      error: { code: 'SOURCE_FILE_NOT_FOUND' },
      sourceFile
    });
    return;
  }

  // Préparer le fichier de sortie
  const outputFile = generateOutputFilePath(sourceFile, targetFormat);

  // Préparer la commande FFmpeg basée sur le format et la qualité
  const ffmpegCommand = buildFFmpegCommand(sourceFile, outputFile, targetFormat, quality, metadata);

  try {
    // Démarrer la conversion
    const conversionProcess = startConversion(ffmpegCommand, requestId);

    // Stocker la référence au processus pour pouvoir l'annuler si nécessaire
    activeConversions.set(requestId, {
      process: conversionProcess,
      sourceFile,
      outputFile,
      targetFormat,
      startTime: Date.now()
    });

    // Signaler que la conversion a commencé
    moduleEventBus.publish('FORMAT_CONVERSION_STARTED', {
      requestId,
      sourceFile,
      targetFormat
    });
  } catch (error) {
    handleConversionError(requestId, sourceFile, error);
  }
}

/**
 * Valide la demande de conversion
 * @param {Object} payload Payload de la demande
 * @returns {boolean} True si la demande est valide
 */
function validateConversionRequest(payload) {
  const supportedFormats = getSupportedFormats();

  // Vérifier les champs obligatoires
  if (!payload || !payload.sourceFile || !payload.targetFormat || !payload.requestId) {
    return false;
  }

  // Vérifier si le format cible est supporté
  if (!supportedFormats.output.includes(payload.targetFormat.toLowerCase())) {
    return false;
  }

  // Vérifier si le format source peut être détecté et est supporté
  const sourceExt = path.extname(payload.sourceFile).toLowerCase().slice(1);
  if (!sourceExt || !supportedFormats.input.includes(sourceExt)) {
    return false;
  }

  return true;
}

/**
 * Génère un chemin de fichier de sortie basé sur le fichier source et le format cible
 * @param {string} sourceFile Chemin du fichier source
 * @param {string} targetFormat Format cible
 * @returns {string} Chemin du fichier de sortie
 */
function generateOutputFilePath(sourceFile, targetFormat) {
  const dir = path.dirname(sourceFile);
  const basename = path.basename(sourceFile, path.extname(sourceFile));
  const timestamp = Date.now().toString(36);

  return path.join(dir, `${basename}_${timestamp}.${targetFormat.toLowerCase()}`);
}

/**
 * Construit les arguments de commande FFmpeg en fonction des paramètres
 * @param {string} sourceFile Fichier source
 * @param {string} outputFile Fichier de sortie
 * @param {string} targetFormat Format cible
 * @param {Object} quality Paramètres de qualité
 * @param {Object} metadata Métadonnées
 * @returns {Array} Arguments de la commande FFmpeg
 */
function buildFFmpegCommand(sourceFile, outputFile, targetFormat, quality, metadata) {
  const args = ['-i', sourceFile];

  // Ajouter les paramètres de qualité en fonction du format
  switch (targetFormat.toLowerCase()) {
    case 'mp3':
      // Exemple: qualité MP3
      args.push('-codec:a', 'libmp3lame');
      args.push('-b:a', quality?.bitrate || '320k');
      break;

    case 'flac':
      // Exemple: qualité FLAC
      args.push('-codec:a', 'flac');
      args.push('-compression_level', quality?.compressionLevel || '5');
      break;

    case 'wav':
      // Exemple: qualité WAV
      args.push('-codec:a', 'pcm_s16le'); // 16-bit par défaut
      if (quality?.bitDepth === '24bit') {
        args[args.length - 1] = 'pcm_s24le';
      } else if (quality?.bitDepth === '32bit') {
        args[args.length - 1] = 'pcm_s32le';
      }
      break;

    case 'aiff':
      // Exemple: qualité AIFF
      args.push('-codec:a', 'pcm_s16be');
      if (quality?.bitDepth === '24bit') {
        args[args.length - 1] = 'pcm_s24be';
      }
      break;
  }

  // Configurer le sample rate si spécifié
  if (quality?.sampleRate) {
    args.push('-ar', quality.sampleRate.toString());
  }

  // Ajouter les métadonnées si présentes
  if (metadata && Object.keys(metadata).length > 0) {
    Object.entries(metadata).forEach(([key, value]) => {
      args.push('-metadata', `${key}=${value}`);
    });
  }

  // Désactiver le remappage vidéo (nous traitons uniquement l'audio)
  args.push('-vn');

  // Forcer l'écrasement des fichiers existants
  args.push('-y');

  // Ajouter le fichier de sortie
  args.push(outputFile);

  return args;
}

/**
 * Démarre le processus de conversion avec FFmpeg
 * @param {Array} ffmpegArgs Arguments FFmpeg
 * @param {string} requestId ID de la demande
 * @returns {Object} Processus de conversion
 */
function startConversion(ffmpegArgs, requestId) {
  // Déterminer le chemin de FFmpeg (dans une implémentation réelle,
  // cela serait récupéré de la configuration ou détecté dynamiquement)
  const ffmpegPath = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';

  const process = spawn(ffmpegPath, ffmpegArgs);

  // Gérer les données de progression
  process.stderr.on('data', (data) => {
    // Extraire la progression à partir de la sortie FFmpeg (simplifié ici)
    const progressInfo = parseFFmpegProgress(data.toString());
    if (progressInfo) {
      moduleEventBus.publish('FORMAT_CONVERSION_PROGRESS', {
        requestId,
        progress: progressInfo
      });
    }
  });

  // Gérer la fin du processus
  process.on('close', (code) => {
    const conversionInfo = activeConversions.get(requestId);

    if (code === 0) {
      // Conversion réussie
      const duration = (Date.now() - conversionInfo.startTime) / 1000;

      moduleEventBus.publish('FORMAT_CONVERSION_COMPLETED', {
        requestId,
        outputFile: conversionInfo.outputFile,
        duration
      });
    } else {
      // Échec de la conversion
      moduleEventBus.publish('FORMAT_CONVERSION_FAILED', {
        requestId,
        error: { code: 'FFMPEG_ERROR', exitCode: code },
        sourceFile: conversionInfo.sourceFile
      });

      // Nettoyage: supprimer le fichier de sortie partiellement créé s'il existe
      if (fs.existsSync(conversionInfo.outputFile)) {
        try {
          fs.unlinkSync(conversionInfo.outputFile);
        } catch (err) {
          // Ignorer les erreurs de suppression
        }
      }
    }

    // Supprimer de la liste des conversions actives
    activeConversions.delete(requestId);
  });

  // Gérer les erreurs de processus
  process.on('error', (err) => {
    handleConversionError(requestId, activeConversions.get(requestId)?.sourceFile, err);
    activeConversions.delete(requestId);
  });

  return process;
}

/**
 * Analyse la sortie FFmpeg pour extraire les informations de progression
 * @param {string} output Sortie de FFmpeg
 * @returns {number|null} Pourcentage de progression ou null
 */
function parseFFmpegProgress(output) {
  // Exemple simplifié - dans une implémentation réelle, cela serait plus robuste
  // et analyserait correctement la sortie de FFmpeg
  const timeMatch = output.match(/time=(\d+):(\d+):(\d+.\d+)/);
  const durationMatch = output.match(/Duration: (\d+):(\d+):(\d+.\d+)/);

  if (timeMatch && durationMatch) {
    const currentSeconds =
      parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);

    const totalSeconds =
      parseInt(durationMatch[1]) * 3600 +
      parseInt(durationMatch[2]) * 60 +
      parseFloat(durationMatch[3]);

    if (totalSeconds > 0) {
      return Math.round((currentSeconds / totalSeconds) * 100);
    }
  }

  return null;
}

/**
 * Gère une demande d'annulation de conversion
 * @param {Object} payload Détails de la demande d'annulation
 */
function handleCancellation(payload) {
  const { requestId } = payload;

  if (!requestId || !activeConversions.has(requestId)) {
    moduleEventBus.publish('ERROR', {
      source: 'format-converter',
      code: 'INVALID_CANCELLATION',
      message: "Impossible d'annuler la conversion: ID inconnu",
      details: { requestId }
    });
    return;
  }

  const conversionInfo = activeConversions.get(requestId);

  // Tuer le processus
  try {
    conversionInfo.process.kill();

    // Tenter de supprimer le fichier partiellement créé
    if (fs.existsSync(conversionInfo.outputFile)) {
      fs.unlinkSync(conversionInfo.outputFile);
    }

    // Notifier l'annulation
    moduleEventBus.publish('FORMAT_CONVERSION_FAILED', {
      requestId,
      error: { code: 'CONVERSION_CANCELLED' },
      sourceFile: conversionInfo.sourceFile
    });

    // Retirer de la liste des conversions actives
    activeConversions.delete(requestId);
  } catch (error) {
    moduleEventBus.publish('ERROR', {
      source: 'format-converter',
      code: 'CANCELLATION_FAILED',
      message: "Échec de l'annulation de la conversion",
      details: { requestId, error: error.message }
    });
  }
}

/**
 * Gère les erreurs lors de la conversion
 * @param {string} requestId ID de la demande
 * @param {string} sourceFile Fichier source
 * @param {Error} error Erreur
 */
function handleConversionError(requestId, sourceFile, error) {
  // Nettoyage: supprimer le fichier de sortie partiellement créé s'il existe
  const conversionInfo = activeConversions.get(requestId);
  if (conversionInfo && fs.existsSync(conversionInfo.outputFile)) {
    try {
      fs.unlinkSync(conversionInfo.outputFile);
    } catch (err) {
      // Ignorer les erreurs de suppression
    }
  }

  // Déterminer le type d'erreur et publier l'événement approprié
  let errorCode = 'UNKNOWN_ERROR';
  let errorMessage = error.message || 'Erreur inconnue lors de la conversion';

  if (error.code === 'ENOENT') {
    errorCode = 'FFMPEG_NOT_FOUND';
    errorMessage = 'FFmpeg non trouvé ou non accessible';
  }

  moduleEventBus.publish('ERROR', {
    source: 'format-converter',
    code: errorCode,
    message: errorMessage,
    details: { requestId, sourceFile, error: error.toString() }
  });

  moduleEventBus.publish('FORMAT_CONVERSION_FAILED', {
    requestId,
    error: { code: errorCode, message: errorMessage },
    sourceFile: sourceFile || 'unknown'
  });
}

/**
 * Nettoyage du module lors de l'arrêt de l'application
 */
function cleanupModule() {
  // Arrêter toutes les conversions en cours
  for (const [requestId, conversionInfo] of activeConversions.entries()) {
    try {
      conversionInfo.process.kill();

      // Notifier l'annulation due à l'arrêt
      moduleEventBus.publish('FORMAT_CONVERSION_FAILED', {
        requestId,
        error: { code: 'APP_SHUTDOWN' },
        sourceFile: conversionInfo.sourceFile
      });
    } catch (error) {
      // Ignorer les erreurs lors de l'arrêt
    }
  }

  // Vider la map des conversions actives
  activeConversions.clear();
}

// Point d'entrée du module
initialize();

// Exporter uniquement pour les tests - non utilisé dans l'application réelle
// puisque toutes les interactions passent par le bus d'événements
module.exports = {
  // Fonctions exportées uniquement pour les tests
  __test: {
    validateConversionRequest,
    buildFFmpegCommand,
    parseFFmpegProgress
  }
}; // Conversion entre formats audio
// Créé automatiquement le 2025-05-02
