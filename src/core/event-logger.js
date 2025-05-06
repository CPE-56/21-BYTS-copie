/**
 * @fileoverview event-logger.js - Module de journalisation des événements pour 21 BYTS
 *
 * Ce module fournit des fonctionnalités de journalisation des événements pour l'application.
 * Il écoute tous les événements du système et les enregistre selon leur niveau de priorité.
 * Le module est entièrement autonome et communique uniquement via le bus d'événements.
 *
 * @module event-logger
 * @requires electron
 * @author 21 BYTS Team
 * @version 1.0.0
 *
 * Événements écoutés:
 * - APP_INITIALIZED: Initialise le logger
 * - LOG_INFO: Enregistre un message d'information
 * - LOG_WARNING: Enregistre un avertissement
 * - LOG_ERROR: Enregistre une erreur
 * - LOG_DEBUG: Enregistre un message de débogage
 * - CONFIG_UPDATED: Met à jour la configuration du logger
 *
 * Événements émis:
 * - LOGGER_INITIALIZED: Émis lorsque le logger est initialisé
 * - LOGGER_ERROR: Émis en cas d'erreur interne du logger
 */

// Dépendances standards (pas de dépendances internes au projet)
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// Variables locales au module
let logLevel = 'info'; // 'debug', 'info', 'warning', 'error'
let logToFile = true;
let logToConsole = true;
let logFilePath = '';
let maxLogSize = 10 * 1024 * 1024; // 10 Mo par défaut
let maxLogFiles = 5;
let eventBus = null;

/**
 * Niveaux de log avec leurs valeurs numériques pour faciliter les comparaisons
 */
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warning: 2,
  error: 3
};

/**
 * Initialise le module de journalisation
 * @param {Object} bus - Le bus d'événements de l'application
 */
function initialize(bus) {
  if (!bus) {
    console.error("event-logger: Impossible d'initialiser sans bus d'événements");
    return;
  }

  eventBus = bus;

  // Configuration du chemin de log par défaut
  const userDataPath = app.getPath('userData');
  logFilePath = path.join(userDataPath, 'logs');

  // S'assurer que le répertoire de logs existe
  try {
    if (!fs.existsSync(logFilePath)) {
      fs.mkdirSync(logFilePath, { recursive: true });
    }
  } catch (error) {
    logToFile = false;
    if (eventBus) {
      eventBus.publish('LOGGER_ERROR', {
        message: 'Impossible de créer le répertoire de logs',
        error: error.toString()
      });
    }
  }

  // S'abonner aux événements
  subscribeToEvents();

  // Publier l'initialisation
  eventBus.publish('LOGGER_INITIALIZED', {
    logLevel,
    logToFile,
    logToConsole,
    logFilePath
  });

  // Premier log
  log('info', 'EVENT_LOGGER', 'Module de journalisation initialisé');
}

/**
 * S'abonne aux événements du bus
 */
function subscribeToEvents() {
  eventBus.subscribe('LOG_INFO', (data) => log('info', data.source, data.message, data.details));
  eventBus.subscribe('LOG_WARNING', (data) =>
    log('warning', data.source, data.message, data.details)
  );
  eventBus.subscribe('LOG_ERROR', (data) => log('error', data.source, data.message, data.details));
  eventBus.subscribe('LOG_DEBUG', (data) => log('debug', data.source, data.message, data.details));

  // Écouter les mises à jour de configuration
  eventBus.subscribe('CONFIG_UPDATED', handleConfigUpdate);
}

/**
 * Gère les mises à jour de configuration
 * @param {Object} config - Nouvelle configuration
 */
function handleConfigUpdate(config) {
  if (config && config.logger) {
    const loggerConfig = config.logger;

    if (
      loggerConfig.logLevel &&
      Object.prototype.hasOwnProperty.call(LOG_LEVELS, loggerConfig.logLevel)
    ) {
      logLevel = loggerConfig.logLevel;
    }

    if (typeof loggerConfig.logToFile === 'boolean') {
      logToFile = loggerConfig.logToFile;
    }

    if (typeof loggerConfig.logToConsole === 'boolean') {
      logToConsole = loggerConfig.logToConsole;
    }

    if (loggerConfig.logFilePath) {
      try {
        const newPath = path.resolve(loggerConfig.logFilePath);
        if (!fs.existsSync(newPath)) {
          fs.mkdirSync(newPath, { recursive: true });
        }
        logFilePath = newPath;
      } catch (error) {
        log('error', 'EVENT_LOGGER', 'Impossible de définir le nouveau chemin de logs', error);
      }
    }

    if (typeof loggerConfig.maxLogSize === 'number') {
      maxLogSize = loggerConfig.maxLogSize;
    }

    if (typeof loggerConfig.maxLogFiles === 'number') {
      maxLogFiles = loggerConfig.maxLogFiles;
    }

    log('info', 'EVENT_LOGGER', 'Configuration du logger mise à jour', {
      logLevel,
      logToFile,
      logToConsole,
      logFilePath,
      maxLogSize,
      maxLogFiles
    });
  }
}

/**
 * Enregistre un message dans les logs
 * @param {string} level - Niveau de log ('debug', 'info', 'warning', 'error')
 * @param {string} source - Source du message (module émetteur)
 * @param {string} message - Contenu du message
 * @param {Object} [details] - Détails additionnels optionnels
 */
function log(level, source, message, details = null) {
  try {
    // Vérifier si le niveau de log est suffisant pour être enregistré
    if (
      !Object.prototype.hasOwnProperty.call(LOG_LEVELS, level) ||
      LOG_LEVELS[level] < LOG_LEVELS[logLevel]
    ) {
      return;
    }

    // Vérifier et normaliser les paramètres
    const safeLevel = Object.prototype.hasOwnProperty.call(LOG_LEVELS, level) ? level : 'info';
    const safeSource = source || 'unknown';
    const safeMessage = message || 'No message provided';

    const timestamp = new Date().toISOString();
    const formattedMessage = formatLogMessage(
      timestamp,
      safeLevel,
      safeSource,
      safeMessage,
      details
    );

    if (logToConsole) {
      logToConsoleOutput(safeLevel, formattedMessage);
    }

    if (logToFile) {
      logToFileOutput(timestamp, formattedMessage);
    }
  } catch (error) {
    // Fallback en cas d'erreur dans la fonction de log elle-même
    console.error(`[EVENT_LOGGER] Erreur lors de la journalisation: ${error.message}`);

    // Tenter d'écrire directement en console en cas d'erreur
    try {
      console.error(`[EVENT_LOGGER] Message original: [${level}] [${source}] ${message}`);
    } catch (secondaryError) {
      // Silence - dernière tentative échouée
    }
  }
}

/**
 * Formate un message de log
 * @param {string} timestamp - Horodatage ISO
 * @param {string} level - Niveau de log
 * @param {string} source - Source du message
 * @param {string} message - Contenu du message
 * @param {Object} details - Détails additionnels
 * @returns {string} Message formaté
 */
function formatLogMessage(timestamp, level, source, message, details) {
  try {
    // Normaliser les entrées pour éviter les erreurs
    const safeTimestamp = timestamp || new Date().toISOString();
    const safeLevel = (level || 'info').toUpperCase();
    const safeSource = source || 'unknown';
    const safeMessage = message || 'No message provided';

    let formattedMessage = `[${safeTimestamp}] [${safeLevel}] [${safeSource}] ${safeMessage}`;

    if (details) {
      if (details instanceof Error) {
        formattedMessage += `\n${details.stack || details.toString()}`;
      } else if (typeof details === 'object') {
        try {
          // Utiliser un replacer pour gérer les objets circulaires
          const seen = new WeakSet();
          const replacer = (key, value) => {
            if (typeof value === 'object' && value !== null) {
              if (seen.has(value)) {
                return '[Référence circulaire]';
              }
              seen.add(value);
            }
            return value;
          };

          formattedMessage += `\n${JSON.stringify(details, replacer, 2)}`;
        } catch (error) {
          formattedMessage += `\n[Object non sérialisable: ${error.message}]`;
        }
      } else {
        formattedMessage += `\n${details}`;
      }
    }

    return formattedMessage;
  } catch (error) {
    // En cas d'erreur, retourner un message de base
    return `[${new Date().toISOString()}] [ERROR] [event-logger] Erreur lors du formatage du message: ${error.message}`;
  }
}

/**
 * Enregistre un message dans la console
 * @param {string} level - Niveau de log
 * @param {string} message - Message formaté
 */
function logToConsoleOutput(level, message) {
  switch (level) {
    case 'debug':
      console.debug(message);
      break;
    case 'info':
      console.info(message);
      break;
    case 'warning':
      console.warn(message);
      break;
    case 'error':
      console.error(message);
      break;
    default:
      console.log(message);
  }
}

/**
 * Enregistre un message dans un fichier
 * @param {string} timestamp - Horodatage pour le nom de fichier
 * @param {string} message - Message formaté
 */
function logToFileOutput(timestamp, message) {
  try {
    const date = timestamp.split('T')[0];
    const logFile = path.join(logFilePath, `${date}.log`);

    // Ajouter une nouvelle ligne
    message += '\n';

    // Vérifier si le fichier existe et sa taille
    if (fs.existsSync(logFile)) {
      const stats = fs.statSync(logFile);

      // Si le fichier dépasse la taille maximale, créer un nouveau fichier avec horodatage
      if (stats.size >= maxLogSize) {
        const time = timestamp.replace(/[:.]/g, '-');
        const rotatedLogFile = path.join(logFilePath, `${date}-${time}.log`);
        fs.appendFileSync(rotatedLogFile, message, { encoding: 'utf8' });

        // Nettoyer les anciens fichiers si nécessaire
        cleanupOldLogFiles();
        return;
      }
    }

    // Écrire dans le fichier de log du jour
    fs.appendFileSync(logFile, message, { encoding: 'utf8' });
  } catch (error) {
    if (logToConsole) {
      console.error(`Erreur lors de l'écriture dans le fichier de log: ${error.message}`);
    }

    if (eventBus) {
      eventBus.publish('LOGGER_ERROR', {
        message: "Erreur lors de l'écriture dans le fichier de log",
        error: error.toString()
      });
    }
  }
}

/**
 * Nettoie les anciens fichiers de log si leur nombre dépasse maxLogFiles
 */
function cleanupOldLogFiles() {
  try {
    const files = fs
      .readdirSync(logFilePath)
      .filter((file) => file.endsWith('.log'))
      .map((file) => ({
        name: file,
        path: path.join(logFilePath, file),
        stats: fs.statSync(path.join(logFilePath, file))
      }))
      .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());

    // Supprimer les fichiers les plus anciens si nécessaire
    if (files.length > maxLogFiles) {
      for (let i = maxLogFiles; i < files.length; i++) {
        fs.unlinkSync(files[i].path);
        log('debug', 'EVENT_LOGGER', `Ancien fichier de log supprimé: ${files[i].name}`);
      }
    }
  } catch (error) {
    if (logToConsole) {
      console.error(`Erreur lors du nettoyage des anciens fichiers de log: ${error.message}`);
    }
  }
}

// Note: La fonction register a été supprimée car elle n'était pas utilisée

// Exporter un objet avec la méthode d'initialisation
module.exports = {
  initialize
};

// Alias pour compatibilité avec les tests
module.exports.register = ({ getBus }) => {
  const bus = getBus?.();
  if (bus) {
    module.exports.initialize(bus);
  }
};

/**
 * Exemples d'utilisation:
 *
 * 1. Initialisation avec le bus d'événements:
 *
* const eventLogger = require('./event-logger');
 * eventLogger.register(appContainer);
 *

 *
 * 2. Journalisation d'un message via le bus d'événements:
 *
* eventBus.publish('LOG_INFO', {
 *   source: 'DOWNLOAD_MANAGER',
 *   message: 'Téléchargement démarré',
 *   details: { url: 'https://example.com/audio.mp3' }
 * });
 *

 *
 * 3. Écoute des erreurs du logger:
 *
* eventBus.subscribe('LOGGER_ERROR', (error) => {
 *   // Gérer l'erreur du logger
 * });
 *

 */
