/**
 * Module central de conversion audio
 * Utilise FFmpeg et communique via un eventBus fourni
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const activeConversions = new Map();

let eventBus = null;

/**
 * Initialise le module avec un bus d'événements
 * @param {Object} deps - { eventBus: EventEmitter-like }
 */
function initFormatConverter(deps) {
  if (!deps || !deps.eventBus) {
    throw new Error('eventBus requis pour initialiser le format-converter');
  }

  eventBus = deps.eventBus;

  eventBus.subscribe('FORMAT_CONVERSION_REQUESTED', handleConversionRequest);
  eventBus.subscribe('FORMAT_CONVERSION_CANCEL', handleCancellation);
  eventBus.subscribe('APP_SHUTDOWN', cleanupModule);
}

/**
 * Gère une demande de conversion
 */
function handleConversionRequest(payload) {
  if (!validateConversionRequest(payload)) {
    eventBus.publish('FORMAT_CONVERSION_FAILED', {
      requestId: payload.requestId || 'unknown',
      error: { code: 'INVALID_REQUEST' },
      sourceFile: payload.sourceFile || 'unknown'
    });
    return;
  }

  const { sourceFile, targetFormat, quality, metadata, requestId } = payload;

  if (!fs.existsSync(sourceFile)) {
    eventBus.publish('FORMAT_CONVERSION_FAILED', {
      requestId,
      error: { code: 'SOURCE_FILE_NOT_FOUND' },
      sourceFile
    });
    return;
  }

  const outputFile = generateOutputFilePath(sourceFile, targetFormat);
  const ffmpegCommand = buildFFmpegCommand(sourceFile, outputFile, targetFormat, quality, metadata);

  try {
    const proc = startConversion(ffmpegCommand, requestId, sourceFile, outputFile);
    activeConversions.set(requestId, {
      process: proc,
      sourceFile,
      outputFile,
      startTime: Date.now()
    });

    eventBus.publish('FORMAT_CONVERSION_STARTED', { requestId, sourceFile, targetFormat });
  } catch (err) {
    handleConversionError(requestId, sourceFile, err);
  }
}

/**
 * Crée un chemin de sortie horodaté
 */
function generateOutputFilePath(sourceFile, targetFormat) {
  const dir = path.dirname(sourceFile);
  const base = path.basename(sourceFile, path.extname(sourceFile));
  const timestamp = Date.now().toString(36);
  return path.join(dir, `${base}_${timestamp}.${targetFormat}`);
}

/**
 * Construit les arguments pour FFmpeg
 */
function buildFFmpegCommand(source, target, format, quality = {}, metadata = {}) {
  const args = ['-i', source];

  switch (format) {
    case 'mp3':
      args.push('-codec:a', 'libmp3lame', '-b:a', quality.bitrate || '320k');
      break;
    case 'flac':
      args.push('-codec:a', 'flac', '-compression_level', quality.compressionLevel || '5');
      break;
    case 'wav':
      args.push(
        '-codec:a',
        quality.bitDepth === '24bit'
          ? 'pcm_s24le'
          : quality.bitDepth === '32bit'
            ? 'pcm_s32le'
            : 'pcm_s16le'
      );
      break;
    case 'aiff':
      args.push('-codec:a', quality.bitDepth === '24bit' ? 'pcm_s24be' : 'pcm_s16be');
      break;
  }

  if (quality.sampleRate) args.push('-ar', quality.sampleRate.toString());

  for (const [k, v] of Object.entries(metadata)) {
    args.push('-metadata', `${k}=${v}`);
  }

  args.push('-vn', '-y', target);
  return args;
}

/**
 * Lance la conversion FFmpeg
 */
function startConversion(args, requestId, sourceFile, outputFile) {
  const ffmpeg = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const proc = spawn(ffmpeg, args);

  proc.stderr.on('data', (data) => {
    const p = parseFFmpegProgress(data.toString());
    if (p) {
      eventBus.publish('FORMAT_CONVERSION_PROGRESS', { requestId, progress: p });
    }
  });

  proc.on('close', (code) => {
    const info = activeConversions.get(requestId);
    if (code === 0) {
      eventBus.publish('FORMAT_CONVERSION_COMPLETED', {
        requestId,
        outputFile: info.outputFile,
        duration: (Date.now() - info.startTime) / 1000
      });
    } else {
      if (fs.existsSync(info.outputFile)) {
        try {
          fs.unlinkSync(info.outputFile);
        } catch {}
      }
      eventBus.publish('FORMAT_CONVERSION_FAILED', {
        requestId,
        error: { code: 'FFMPEG_ERROR', exitCode: code },
        sourceFile: info.sourceFile
      });
    }
    activeConversions.delete(requestId);
  });

  proc.on('error', (err) => {
    handleConversionError(requestId, sourceFile, err);
    activeConversions.delete(requestId);
  });

  return proc;
}

/**
 * Gère les erreurs critiques
 */
function handleConversionError(requestId, sourceFile, error) {
  const info = activeConversions.get(requestId);
  if (info && fs.existsSync(info.outputFile)) {
    try {
      fs.unlinkSync(info.outputFile);
    } catch {}
  }

  eventBus.publish('FORMAT_CONVERSION_FAILED', {
    requestId,
    error: {
      code: error.code === 'ENOENT' ? 'FFMPEG_NOT_FOUND' : 'UNKNOWN_ERROR',
      message: error.message
    },
    sourceFile
  });
}

/**
 * Parse la sortie FFmpeg (simplifiée)
 */
function parseFFmpegProgress(output) {
  const time = output.match(/time=(\d+):(\d+):([\d.]+)/);
  const dur = output.match(/Duration: (\d+):(\d+):([\d.]+)/);
  if (time && dur) {
    const current = +time[1] * 3600 + +time[2] * 60 + +time[3];
    const total = +dur[1] * 3600 + +dur[2] * 60 + +dur[3];
    return total ? Math.round((current / total) * 100) : null;
  }
  return null;
}

/**
 * Annule une conversion en cours
 */
function handleCancellation({ requestId }) {
  const info = activeConversions.get(requestId);
  if (!info) return;

  try {
    info.process.kill();
    if (fs.existsSync(info.outputFile)) fs.unlinkSync(info.outputFile);
    eventBus.publish('FORMAT_CONVERSION_FAILED', {
      requestId,
      error: { code: 'CONVERSION_CANCELLED' },
      sourceFile: info.sourceFile
    });
    activeConversions.delete(requestId);
  } catch (err) {
    eventBus.publish('FORMAT_CONVERSION_FAILED', {
      requestId,
      error: { code: 'CANCELLATION_FAILED', message: err.message },
      sourceFile: info.sourceFile
    });
  }
}

/**
 * Nettoyage global (arrêt de l’app)
 */
function cleanupModule() {
  for (const [requestId, info] of activeConversions) {
    try {
      info.process.kill();
      eventBus.publish('FORMAT_CONVERSION_FAILED', {
        requestId,
        error: { code: 'APP_SHUTDOWN' },
        sourceFile: info.sourceFile
      });
    } catch {}
  }
  activeConversions.clear();
}

/**
 * Validation de la requête
 */
function validateConversionRequest(p) {
  return p?.sourceFile && p?.targetFormat && p?.requestId;
}

module.exports = {
  initFormatConverter,
  __test: {
    buildFFmpegCommand,
    parseFFmpegProgress,
    validateConversionRequest
  }
};
