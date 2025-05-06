/**
 * @fileoverview Module de gestion des opérations sur les fichiers
 *
 * Ce module fournit des fonctionnalités pour gérer toutes les opérations liées
 * aux fichiers dans l'application 21 BYTS. Il s'occupe de la lecture, l'écriture,
 * la vérification, et la gestion des fichiers audio téléchargés.
 *
 * @module utils/file-operations
 *
 * Événements écoutés:
 * - FILE_OPERATION_REQUESTED: Demande d'opération sur un fichier
 * - FILE_PATH_REQUESTED: Demande de chemin de fichier
 * - FILE_CHECKSUM_VERIFICATION_REQUESTED: Demande de vérification de checksum
 * - CONFIG_UPDATED: Mise à jour de la configuration (pour les chemins par défaut)
 * - FILE_CLEANUP_REQUESTED: Demande de nettoyage des fichiers temporaires
 *
 * Événements émis:
 * - FILE_OPERATION_COMPLETED: Opération sur un fichier terminée avec succès
 * - FILE_OPERATION_FAILED: Échec d'une opération sur un fichier
 * - FILE_PATH_RESOLVED: Résolution d'un chemin de fichier
 * - FILE_CHECKSUM_VERIFIED: Vérification de checksum terminée
 * - FILE_CLEANUP_COMPLETED: Nettoyage des fichiers temporaires terminé
 * - ERROR_OCCURRED: Une erreur s'est produite lors d'une opération
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const os = require('os');
const { pipeline } = require('stream');

// Promisification des fonctions fs
const fsAccess = promisify(fs.access);
const fsMkdir = promisify(fs.mkdir);
const fsReadFile = promisify(fs.readFile);
const fsWriteFile = promisify(fs.writeFile);
const fsUnlink = promisify(fs.unlink);
const fsStat = promisify(fs.stat);
const fsReaddir = promisify(fs.readdir);
const pipelinePromise = promisify(pipeline);

// Variables locales du module
let eventBus = null;
let appConfig = {
  defaultDownloadPath: path.join(os.homedir(), 'Music', '21BYTS'),
  tempDir: path.join(os.tmpdir(), '21BYTS'),
  chunkSize: 1024 * 1024, // 1MB par défaut
  useChecksumVerification: true
};

/**
 * Initialise le module de gestion des fichiers
 * @param {Object} context - Le contexte d'application contenant le bus d'événements
 */
function initialize(context) {
  if (!context || !context.eventBus) {
    throw new Error("Le bus d'événements est requis pour initialiser le module file-operations");
  }

  eventBus = context.eventBus;

  // S'assurer que les répertoires existent
  ensureDirectoriesExist()
    .then(() => {
      registerEventListeners();
      eventBus.emit('MODULE_INITIALIZED', { module: 'file-operations' });
    })
    .catch((error) => {
      eventBus.emit('ERROR_OCCURRED', {
        source: 'file-operations',
        error: error.message,
        details: error.stack
      });
    });
}

/**
 * S'assure que les répertoires requis existent, les crée si nécessaire
 * @returns {Promise<void>}
 */
async function ensureDirectoriesExist() {
  try {
    await ensureDirectoryExists(appConfig.defaultDownloadPath);
    await ensureDirectoryExists(appConfig.tempDir);

    // Créer également un sous-répertoire pour les téléchargements en cours
    await ensureDirectoryExists(path.join(appConfig.tempDir, 'downloads-in-progress'));

    return Promise.resolve();
  } catch (error) {
    return Promise.reject(error);
  }
}

/**
 * S'assure qu'un répertoire existe, le crée si nécessaire
 * @param {string} dirPath - Chemin du répertoire à vérifier/créer
 * @returns {Promise<void>}
 */
async function ensureDirectoryExists(dirPath) {
  try {
    await fsAccess(dirPath, fs.constants.F_OK);
  } catch (error) {
    // Le répertoire n'existe pas, on le crée
    try {
      await fsMkdir(dirPath, { recursive: true });
    } catch (mkdirError) {
      throw new Error(`Impossible de créer le répertoire ${dirPath}: ${mkdirError.message}`);
    }
  }
}

/**
 * Enregistre les écouteurs d'événements pour ce module
 */
function registerEventListeners() {
  // Écouter les mises à jour de configuration
  eventBus.on('CONFIG_UPDATED', handleConfigUpdate);

  // Écouter les demandes d'opérations sur les fichiers
  eventBus.on('FILE_OPERATION_REQUESTED', handleFileOperation);

  // Écouter les demandes de chemins de fichiers
  eventBus.on('FILE_PATH_REQUESTED', handlePathRequest);

  // Écouter les demandes de vérification de checksum
  eventBus.on('FILE_CHECKSUM_VERIFICATION_REQUESTED', verifyFileChecksum);

  // Écouter les demandes de nettoyage
  eventBus.on('FILE_CLEANUP_REQUESTED', cleanupTemporaryFiles);
}

/**
 * Gère les mises à jour de configuration
 * @param {Object} data - Données de configuration mises à jour
 */
function handleConfigUpdate(data) {
  if (data.defaultDownloadPath) {
    appConfig.defaultDownloadPath = data.defaultDownloadPath;
    ensureDirectoryExists(appConfig.defaultDownloadPath).catch((error) => {
      eventBus.emit('ERROR_OCCURRED', {
        source: 'file-operations',
        error: `Erreur lors de la création du répertoire de téléchargement: ${error.message}`,
        details: error.stack
      });
    });
  }

  if (data.tempDir) {
    appConfig.tempDir = data.tempDir;
    ensureDirectoryExists(appConfig.tempDir).catch((error) => {
      eventBus.emit('ERROR_OCCURRED', {
        source: 'file-operations',
        error: `Erreur lors de la création du répertoire temporaire: ${error.message}`,
        details: error.stack
      });
    });
  }

  if (data.chunkSize !== undefined) {
    appConfig.chunkSize = data.chunkSize;
  }

  if (data.useChecksumVerification !== undefined) {
    appConfig.useChecksumVerification = data.useChecksumVerification;
  }
}

/**
 * Gère les demandes d'opérations sur les fichiers
 * @param {Object} data - Données de l'opération demandée
 */
function handleFileOperation(data) {
  const { operation, params } = data;

  switch (operation) {
    case 'READ':
      readFile(params)
        .then((result) => {
          eventBus.emit('FILE_OPERATION_COMPLETED', {
            operation: 'READ',
            requestId: data.requestId,
            result
          });
        })
        .catch((error) => {
          eventBus.emit('FILE_OPERATION_FAILED', {
            operation: 'READ',
            requestId: data.requestId,
            error: error.message
          });
        });
      break;

    case 'WRITE':
      writeFile(params)
        .then(() => {
          eventBus.emit('FILE_OPERATION_COMPLETED', {
            operation: 'WRITE',
            requestId: data.requestId,
            filePath: params.filePath
          });
        })
        .catch((error) => {
          eventBus.emit('FILE_OPERATION_FAILED', {
            operation: 'WRITE',
            requestId: data.requestId,
            error: error.message
          });
        });
      break;

    case 'DELETE':
      deleteFile(params.filePath)
        .then(() => {
          eventBus.emit('FILE_OPERATION_COMPLETED', {
            operation: 'DELETE',
            requestId: data.requestId,
            filePath: params.filePath
          });
        })
        .catch((error) => {
          eventBus.emit('FILE_OPERATION_FAILED', {
            operation: 'DELETE',
            requestId: data.requestId,
            error: error.message
          });
        });
      break;

    case 'COPY':
      copyFile(params.sourcePath, params.destinationPath)
        .then(() => {
          eventBus.emit('FILE_OPERATION_COMPLETED', {
            operation: 'COPY',
            requestId: data.requestId,
            sourcePath: params.sourcePath,
            destinationPath: params.destinationPath
          });
        })
        .catch((error) => {
          eventBus.emit('FILE_OPERATION_FAILED', {
            operation: 'COPY',
            requestId: data.requestId,
            error: error.message
          });
        });
      break;

    case 'MOVE':
      moveFile(params.sourcePath, params.destinationPath)
        .then(() => {
          eventBus.emit('FILE_OPERATION_COMPLETED', {
            operation: 'MOVE',
            requestId: data.requestId,
            sourcePath: params.sourcePath,
            destinationPath: params.destinationPath
          });
        })
        .catch((error) => {
          eventBus.emit('FILE_OPERATION_FAILED', {
            operation: 'MOVE',
            requestId: data.requestId,
            error: error.message
          });
        });
      break;

    case 'CHECK_EXISTS':
      checkFileExists(params.filePath)
        .then((exists) => {
          eventBus.emit('FILE_OPERATION_COMPLETED', {
            operation: 'CHECK_EXISTS',
            requestId: data.requestId,
            filePath: params.filePath,
            exists
          });
        })
        .catch((error) => {
          eventBus.emit('FILE_OPERATION_FAILED', {
            operation: 'CHECK_EXISTS',
            requestId: data.requestId,
            error: error.message
          });
        });
      break;

    case 'GET_FILE_SIZE':
      getFileSize(params.filePath)
        .then((size) => {
          eventBus.emit('FILE_OPERATION_COMPLETED', {
            operation: 'GET_FILE_SIZE',
            requestId: data.requestId,
            filePath: params.filePath,
            size
          });
        })
        .catch((error) => {
          eventBus.emit('FILE_OPERATION_FAILED', {
            operation: 'GET_FILE_SIZE',
            requestId: data.requestId,
            error: error.message
          });
        });
      break;

    case 'CREATE_WRITE_STREAM':
      try {
        const stream = fs.createWriteStream(params.filePath);
        eventBus.emit('FILE_OPERATION_COMPLETED', {
          operation: 'CREATE_WRITE_STREAM',
          requestId: data.requestId,
          filePath: params.filePath,
          streamId: params.streamId
        });

        // Gestion des événements du stream
        stream.on('error', (error) => {
          eventBus.emit('FILE_STREAM_ERROR', {
            streamId: params.streamId,
            error: error.message
          });
        });

        stream.on('finish', () => {
          eventBus.emit('FILE_STREAM_FINISHED', {
            streamId: params.streamId,
            filePath: params.filePath
          });
        });

        // Stocker le stream dans un registre global via un événement
        eventBus.emit('REGISTER_STREAM', {
          streamId: params.streamId,
          stream
        });
      } catch (error) {
        eventBus.emit('FILE_OPERATION_FAILED', {
          operation: 'CREATE_WRITE_STREAM',
          requestId: data.requestId,
          error: error.message
        });
      }
      break;

    default:
      eventBus.emit('FILE_OPERATION_FAILED', {
        operation: operation || 'UNKNOWN',
        requestId: data.requestId,
        error: `Opération non prise en charge: ${operation}`
      });
  }
}

/**
 * Gère les demandes de résolution de chemins de fichiers
 * @param {Object} data - Données de la demande
 */
function handlePathRequest(data) {
  try {
    let filePath;

    switch (data.pathType) {
      case 'DOWNLOAD':
        filePath = generateDownloadFilePath(data.filename, data.metadata);
        break;

      case 'TEMP':
        filePath = generateTempFilePath(data.filename);
        break;

      case 'PLAYLIST':
        filePath = generatePlaylistFilePath(data.playlistName);
        break;

      default:
        throw new Error(`Type de chemin non reconnu: ${data.pathType}`);
    }

    eventBus.emit('FILE_PATH_RESOLVED', {
      requestId: data.requestId,
      pathType: data.pathType,
      filePath
    });
  } catch (error) {
    eventBus.emit('ERROR_OCCURRED', {
      source: 'file-operations',
      error: `Erreur lors de la résolution du chemin: ${error.message}`,
      details: error.stack
    });
  }
}

/**
 * Lit un fichier
 * @param {Object} params - Paramètres de lecture
 * @param {string} params.filePath - Chemin du fichier à lire
 * @param {string} [params.encoding] - Encodage du fichier (utf8 par défaut)
 * @returns {Promise<Buffer|string>} Contenu du fichier
 */
async function readFile(params) {
  try {
    return await fsReadFile(params.filePath, params.encoding || null);
  } catch (error) {
    throw new Error(`Erreur lors de la lecture du fichier ${params.filePath}: ${error.message}`);
  }
}

/**
 * Écrit dans un fichier
 * @param {Object} params - Paramètres d'écriture
 * @param {string} params.filePath - Chemin du fichier à écrire
 * @param {Buffer|string} params.data - Données à écrire
 * @param {string} [params.encoding] - Encodage du fichier (utf8 par défaut pour les chaînes)
 * @returns {Promise<void>}
 */
async function writeFile(params) {
  try {
    await ensureDirectoryExists(path.dirname(params.filePath));
    await fsWriteFile(params.filePath, params.data, params.encoding || null);
  } catch (error) {
    throw new Error(`Erreur lors de l'écriture du fichier ${params.filePath}: ${error.message}`);
  }
}

/**
 * Supprime un fichier
 * @param {string} filePath - Chemin du fichier à supprimer
 * @returns {Promise<void>}
 */
async function deleteFile(filePath) {
  try {
    await fsUnlink(filePath);
  } catch (error) {
    // Si le fichier n'existe pas, considérer l'opération comme réussie
    if (error.code !== 'ENOENT') {
      throw new Error(`Erreur lors de la suppression du fichier ${filePath}: ${error.message}`);
    }
  }
}

/**
 * Copie un fichier
 * @param {string} sourcePath - Chemin du fichier source
 * @param {string} destinationPath - Chemin de destination
 * @returns {Promise<void>}
 */
async function copyFile(sourcePath, destinationPath) {
  try {
    // S'assurer que le répertoire de destination existe
    await ensureDirectoryExists(path.dirname(destinationPath));

    // Utiliser streams pour une efficacité maximale, surtout pour les gros fichiers
    const readStream = fs.createReadStream(sourcePath);
    const writeStream = fs.createWriteStream(destinationPath);

    await pipelinePromise(readStream, writeStream);
  } catch (error) {
    throw new Error(
      `Erreur lors de la copie du fichier de ${sourcePath} vers ${destinationPath}: ${error.message}`
    );
  }
}

/**
 * Déplace un fichier
 * @param {string} sourcePath - Chemin du fichier source
 * @param {string} destinationPath - Chemin de destination
 * @returns {Promise<void>}
 */
async function moveFile(sourcePath, destinationPath) {
  try {
    // S'assurer que le répertoire de destination existe
    await ensureDirectoryExists(path.dirname(destinationPath));

    // Tenter de renommer d'abord (plus rapide)
    try {
      await promisify(fs.rename)(sourcePath, destinationPath);
    } catch (renameError) {
      // Si erreur de périphérique différent, copier puis supprimer
      if (renameError.code === 'EXDEV') {
        await copyFile(sourcePath, destinationPath);
        await deleteFile(sourcePath);
      } else {
        throw renameError;
      }
    }
  } catch (error) {
    throw new Error(
      `Erreur lors du déplacement du fichier de ${sourcePath} vers ${destinationPath}: ${error.message}`
    );
  }
}

/**
 * Vérifie si un fichier existe
 * @param {string} filePath - Chemin du fichier à vérifier
 * @returns {Promise<boolean>} True si le fichier existe
 */
async function checkFileExists(filePath) {
  try {
    await fsAccess(filePath, fs.constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Obtient la taille d'un fichier
 * @param {string} filePath - Chemin du fichier
 * @returns {Promise<number>} Taille du fichier en octets
 */
async function getFileSize(filePath) {
  try {
    const stats = await fsStat(filePath);
    return stats.size;
  } catch (error) {
    throw new Error(
      `Erreur lors de l'obtention de la taille du fichier ${filePath}: ${error.message}`
    );
  }
}

/**
 * Génère un chemin de fichier pour un téléchargement
 * @param {string} filename - Nom du fichier
 * @param {Object} metadata - Métadonnées de l'audio
 * @returns {string} Chemin complet du fichier
 */
function generateDownloadFilePath(filename, metadata = {}) {
  // Nettoyer le nom de fichier pour éviter les problèmes de système de fichiers
  const cleanFilename = sanitizeFilename(filename);

  // Si des métadonnées sont fournies, organiser les fichiers en dossiers
  if (metadata.artist) {
    const artistDir = sanitizeFilename(metadata.artist);
    let albumDir = '';

    if (metadata.album) {
      albumDir = sanitizeFilename(metadata.album);
      return path.join(appConfig.defaultDownloadPath, artistDir, albumDir, cleanFilename);
    }

    return path.join(appConfig.defaultDownloadPath, artistDir, cleanFilename);
  }

  return path.join(appConfig.defaultDownloadPath, cleanFilename);
}

/**
 * Génère un chemin de fichier temporaire
 * @param {string} filename - Nom du fichier
 * @returns {string} Chemin complet du fichier temporaire
 */
function generateTempFilePath(filename) {
  const cleanFilename = sanitizeFilename(filename);
  return path.join(appConfig.tempDir, 'downloads-in-progress', cleanFilename);
}

/**
 * Génère un chemin de fichier pour une playlist
 * @param {string} playlistName - Nom de la playlist
 * @returns {string} Chemin complet du fichier de playlist
 */
function generatePlaylistFilePath(playlistName) {
  const cleanName = sanitizeFilename(playlistName);
  return path.join(appConfig.defaultDownloadPath, 'Playlists', `${cleanName}.m3u`);
}

/**
 * Nettoie un nom de fichier pour qu'il soit valide sur le système de fichiers
 * @param {string} filename - Nom de fichier à nettoyer
 * @returns {string} Nom de fichier nettoyé
 */
function sanitizeFilename(filename) {
  if (!filename) return 'unknown';

  // Remplacer les caractères non valides pour les systèmes de fichiers
  let cleaned = filename.replace(/[/\\?%*:|"<>]/g, '_');

  // Limiter la longueur (certains systèmes de fichiers ont des limites)
  if (cleaned.length > 255) {
    cleaned = cleaned.substring(0, 255);
  }

  return cleaned;
}

/**
 * Vérifie le checksum d'un fichier
 * @param {Object} data - Données de la vérification
 * @param {string} data.filePath - Chemin du fichier à vérifier
 * @param {string} data.expectedChecksum - Checksum attendu
 * @param {string} [data.algorithm='sha256'] - Algorithme de hachage
 */
async function verifyFileChecksum(data) {
  try {
    if (!appConfig.useChecksumVerification) {
      eventBus.emit('FILE_CHECKSUM_VERIFIED', {
        requestId: data.requestId,
        filePath: data.filePath,
        verified: true,
        skipped: true
      });
      return;
    }

    const algorithm = data.algorithm || 'sha256';
    const computedChecksum = await calculateFileChecksum(data.filePath, algorithm);

    const verified = computedChecksum === data.expectedChecksum;

    eventBus.emit('FILE_CHECKSUM_VERIFIED', {
      requestId: data.requestId,
      filePath: data.filePath,
      verified,
      checksum: computedChecksum
    });

    if (!verified) {
      eventBus.emit('ERROR_OCCURRED', {
        source: 'file-operations',
        error: `Vérification du checksum échouée pour ${data.filePath}`,
        details: `Attendu: ${data.expectedChecksum}, Obtenu: ${computedChecksum}`
      });
    }
  } catch (error) {
    eventBus.emit('FILE_OPERATION_FAILED', {
      operation: 'VERIFY_CHECKSUM',
      requestId: data.requestId,
      error: error.message
    });
  }
}

/**
 * Calcule le checksum d'un fichier
 * @param {string} filePath - Chemin du fichier
 * @param {string} algorithm - Algorithme de hachage
 * @returns {Promise<string>} Checksum calculé
 */
async function calculateFileChecksum(filePath, algorithm) {
  return new Promise((resolve, reject) => {
    try {
      const hash = crypto.createHash(algorithm);
      const stream = fs.createReadStream(filePath);

      stream.on('error', (error) => {
        reject(
          new Error(
            `Erreur lors de la lecture du fichier pour le calcul du checksum: ${error.message}`
          )
        );
      });

      stream.on('data', (chunk) => {
        hash.update(chunk);
      });

      stream.on('end', () => {
        resolve(hash.digest('hex'));
      });
    } catch (error) {
      reject(new Error(`Erreur lors du calcul du checksum: ${error.message}`));
    }
  });
}

/**
 * Nettoie les fichiers temporaires
 * @param {Object} data - Paramètres de nettoyage
 * @param {number} [data.olderThan] - Supprimer les fichiers plus vieux que X millisecondes
 */
async function cleanupTemporaryFiles(data) {
  try {
    const tempDir = path.join(appConfig.tempDir, 'downloads-in-progress');
    const files = await fsReaddir(tempDir);
    const now = Date.now();
    const maxAge = data.olderThan || 24 * 60 * 60 * 1000; // 24h par défaut

    let deletedCount = 0;

    for (const file of files) {
      const filePath = path.join(tempDir, file);
      try {
        const stats = await fsStat(filePath);

        // Supprimer les fichiers plus vieux que maxAge
        if (now - stats.mtime.getTime() > maxAge) {
          await fsUnlink(filePath);
          deletedCount++;
        }
      } catch (error) {
        // Ignorer les erreurs par fichier individuel
        eventBus.emit('ERROR_OCCURRED', {
          source: 'file-operations',
          error: `Impossible de nettoyer le fichier temporaire ${filePath}: ${error.message}`,
          level: 'warning'
        });
      }
    }

    eventBus.emit('FILE_CLEANUP_COMPLETED', {
      requestId: data.requestId,
      deletedCount,
      tempDir
    });
  } catch (error) {
    eventBus.emit('FILE_OPERATION_FAILED', {
      operation: 'CLEANUP',
      requestId: data.requestId,
      error: error.message
    });
  }
}

// Exposer uniquement la fonction d'initialisation
module.exports = {
  initialize
};

/**
 * Exemples d'utilisation:
 *
 * // Initialisation
 * const fileOperations = require('./utils/file-operations');
 * fileOperations.initialize({ eventBus });
 *
 * // Lecture d'un fichier
 * eventBus.emit('FILE_OPERATION_REQUESTED', {
 *   operation: 'READ',
 *   requestId: 'read-123',
 *   params: {
 *     filePath: '/chemin/vers/fichier.mp3',
 *     encoding: null // Buffer pour les fichiers binaires
 *   }
 * });
 *
 * // Pour recevoir le résultat
 * eventBus.on('FILE_OPERATION_COMPLETED', (data) => {
 *   if (data.requestId === 'read-123') {
 *     // Utiliser data.result
 *   }
 * });
 *
 * // Demande de génération de chemin de fichier
 * eventBus.emit('FILE_PATH_REQUESTED', {
 *   requestId: 'path-123',
 *   pathType: 'DOWNLOAD',
 *   filename: 'chanson.mp3',
 *   metadata: {
 *     artist: 'Artiste',
 *     album: 'Album'
 *   }
 * });
 *
 * // Réception du chemin généré
 * eventBus.on('FILE_PATH_RESOLVED', (data) => {
 *   if (data.requestId === 'path-123') {
 *     // Utiliser data.filePath
 *   }
 * });
 */
