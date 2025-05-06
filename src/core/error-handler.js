/**
 * @file error-handler.js
 * @description Gestionnaire d'erreurs centralisé pour l'application 21 BYTS.
 * Ce module intercepte, enregistre et diffuse les erreurs de l'application via le bus d'événements.
 * Il implémente une stratégie de gestion d'erreurs progressive avec différents niveaux de sévérité.
 *
 * @module core/error-handler
 *
 * @events
 * ÉCOUTE:
 * - EVENT_TYPES.SYSTEM.INIT : Initialise le gestionnaire d'erreurs
 * - EVENT_TYPES.ERROR.REPORT : Reçoit les rapports d'erreurs des autres modules
 * - EVENT_TYPES.SYSTEM.SHUTDOWN : Nettoie les ressources avant la fermeture
 *
 * ÉMET:
 * - EVENT_TYPES.ERROR.CRITICAL : Erreur critique nécessitant l'attention de l'utilisateur
 * - EVENT_TYPES.ERROR.WARNING : Avertissement qui n'empêche pas l'opération principale
 * - EVENT_TYPES.ERROR.INFO : Information sur une erreur mineure résolue automatiquement
 * - EVENT_TYPES.UI.SHOW_ERROR : Demande l'affichage d'une erreur dans l'interface
 * - EVENT_TYPES.SYSTEM.LOG : Envoi des erreurs pour journalisation
 */

'use strict';

/**
 * Niveaux de sévérité des erreurs
 * @constant
 * @type {Object}
 */
const ERROR_LEVELS = {
  CRITICAL: 'critical', // Erreur bloquante nécessitant une action de l'utilisateur
  WARNING: 'warning', // Avertissement, l'application peut continuer
  INFO: 'info' // Information, erreur résolue automatiquement
};

/**
 * Codes d'erreur standard pour l'application
 * Ces codes devraient correspondre aux codes définis dans constants/error-codes.js
 * @constant
 * @type {Object}
 */
const ERROR_CATEGORIES = {
  NETWORK: 'NETWORK', // Problèmes réseau
  FILE_SYSTEM: 'FS', // Problèmes d'accès aux fichiers
  AUTH: 'AUTH', // Problèmes d'authentification
  DOWNLOAD: 'DOWNLOAD', // Problèmes de téléchargement
  CONVERSION: 'CONVERSION', // Problèmes de conversion audio
  UI: 'UI', // Problèmes d'interface utilisateur
  SYSTEM: 'SYSTEM', // Problèmes système
  EXTERNAL: 'EXTERNAL', // Erreurs des outils externes (yt-dlp, FFmpeg)
  UNKNOWN: 'UNKNOWN' // Erreurs non catégorisées
};

/**
 * Classe ErrorHandler - Gestionnaire d'erreurs centralisé
 */
class ErrorHandler {
  /**
   * Crée une instance du gestionnaire d'erreurs
   * @param {Object} eventBus - Le bus d'événements central (injecté via initialisation)
   */
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.errorHistory = [];
    this.maxHistorySize = 100; // Taille maximale de l'historique des erreurs
    this.initialized = false;
  }

  /**
   * Initialise le gestionnaire d'erreurs et s'abonne aux événements pertinents
   */
  initialize() {
    if (this.initialized) return;

    // Intercepter les erreurs non gérées au niveau global
    process.on('uncaughtException', (error) => {
      this.handleError({
        error,
        level: ERROR_LEVELS.CRITICAL,
        category: ERROR_CATEGORIES.SYSTEM,
        message: 'Exception non gérée',
        source: 'process'
      });
    });

    // Intercepter les rejets de promesses non gérés
    process.on('unhandledRejection', (reason) => {
      this.handleError({
        error: reason,
        level: ERROR_LEVELS.CRITICAL,
        category: ERROR_CATEGORIES.SYSTEM,
        message: 'Rejet de promesse non géré',
        source: 'promise'
      });
    });

    // S'abonner aux rapports d'erreurs des autres modules
    this.eventBus.subscribe('ERROR.REPORT', this.handleError.bind(this));

    // S'abonner à l'événement de fermeture de l'application
    this.eventBus.subscribe('SYSTEM.SHUTDOWN', this.cleanup.bind(this));

    this.initialized = true;

    // Signaler que le gestionnaire d'erreurs est prêt
    this.eventBus.publish('SYSTEM.MODULE_READY', { module: 'error-handler' });
  }

  /**
   * Traite une erreur et détermine l'action appropriée
   * @param {Object} errorData - Les données de l'erreur
   * @param {Error} errorData.error - L'objet d'erreur original
   * @param {string} errorData.level - Le niveau de sévérité (de ERROR_LEVELS)
   * @param {string} errorData.category - La catégorie d'erreur (de ERROR_CATEGORIES)
   * @param {string} errorData.message - Message d'erreur convivial
   * @param {string} errorData.source - Module source de l'erreur
   * @param {Object} [errorData.context] - Contexte supplémentaire (optionnel)
   */
  handleError(errorData) {
    // Normaliser les données d'erreur
    const normalizedError = this.normalizeErrorData(errorData);

    // Ajouter à l'historique
    this.addToHistory(normalizedError);

    // Journaliser l'erreur
    this.logError(normalizedError);

    // Diffuser l'erreur sur le bus d'événements selon sa sévérité
    this.publishError(normalizedError);

    // Pour les erreurs critiques, afficher dans l'interface utilisateur
    if (normalizedError.level === ERROR_LEVELS.CRITICAL) {
      this.showErrorDialog(normalizedError);
    }

    return normalizedError;
  }

  /**
   * Normalise les données d'erreur en un format standard
   * @param {Object} errorData - Les données d'erreur brutes
   * @returns {Object} - Les données d'erreur normalisées
   */
  normalizeErrorData(errorData) {
    const now = new Date();

    // Si errorData est une instance d'Error, la convertir en objet approprié
    if (errorData instanceof Error) {
      return {
        error: errorData,
        level: ERROR_LEVELS.CRITICAL,
        category: ERROR_CATEGORIES.UNKNOWN,
        message: errorData.message,
        source: 'unknown',
        timestamp: now,
        id: this.generateErrorId(),
        stack: errorData.stack,
        context: {}
      };
    }

    // Normaliser les données existantes
    return {
      error: errorData.error || new Error(errorData.message || 'Erreur inconnue'),
      level: errorData.level || ERROR_LEVELS.WARNING,
      category: errorData.category || ERROR_CATEGORIES.UNKNOWN,
      message: errorData.message || 'Erreur non spécifiée',
      source: errorData.source || 'unknown',
      timestamp: now,
      id: this.generateErrorId(),
      stack: errorData.error ? errorData.error.stack : new Error().stack,
      context: errorData.context || {}
    };
  }

  /**
   * Génère un identifiant unique pour une erreur
   * @returns {string} - ID d'erreur unique
   */
  generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Ajoute une erreur à l'historique, en maintenant la taille maximale
   * @param {Object} errorData - Les données d'erreur normalisées
   */
  addToHistory(errorData) {
    this.errorHistory.push(errorData);

    // Limiter la taille de l'historique
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift(); // Supprimer l'élément le plus ancien
    }
  }

  /**
   * Envoie l'erreur pour journalisation
   * @param {Object} errorData - Les données d'erreur normalisées
   */
  logError(errorData) {
    // Envoyer l'erreur au système de journalisation via le bus d'événements
    this.eventBus.publish('SYSTEM.LOG', {
      level: errorData.level,
      category: 'ERROR',
      message: `[${errorData.category}] ${errorData.message}`,
      data: {
        errorId: errorData.id,
        source: errorData.source,
        stack: errorData.stack,
        context: errorData.context
      }
    });
  }

  /**
   * Publie l'erreur sur le bus d'événements selon sa sévérité
   * @param {Object} errorData - Les données d'erreur normalisées
   */
  publishError(errorData) {
    const eventType = `ERROR.${errorData.level.toUpperCase()}`;
    this.eventBus.publish(eventType, errorData);
  }

  /**
   * Demande l'affichage d'une boîte de dialogue d'erreur
   * @param {Object} errorData - Les données d'erreur normalisées
   */
  showErrorDialog(errorData) {
    // Préparer un message d'erreur convivial pour l'utilisateur
    const userMessage = this.createUserFriendlyMessage(errorData);

    // Publier l'événement pour afficher l'erreur dans l'interface
    this.eventBus.publish('UI.SHOW_ERROR', {
      title: userMessage.title,
      message: userMessage.message,
      details: userMessage.details,
      errorId: errorData.id,
      actions: this.getRecommendedActions(errorData)
    });
  }

  /**
   * Crée un message d'erreur convivial pour l'utilisateur
   * @param {Object} errorData - Les données d'erreur normalisées
   * @returns {Object} - Message formaté pour l'utilisateur
   */
  createUserFriendlyMessage(errorData) {
    // Titres par catégorie
    const titles = {
      [ERROR_CATEGORIES.NETWORK]: 'Problème de connexion',
      [ERROR_CATEGORIES.FILE_SYSTEM]: "Problème d'accès aux fichiers",
      [ERROR_CATEGORIES.AUTH]: "Problème d'authentification",
      [ERROR_CATEGORIES.DOWNLOAD]: 'Erreur de téléchargement',
      [ERROR_CATEGORIES.CONVERSION]: 'Erreur de conversion audio',
      [ERROR_CATEGORIES.UI]: "Problème d'interface",
      [ERROR_CATEGORIES.SYSTEM]: 'Erreur système',
      [ERROR_CATEGORIES.EXTERNAL]: 'Problème avec un outil externe',
      [ERROR_CATEGORIES.UNKNOWN]: 'Erreur inattendue'
    };

    // Messages génériques par catégorie
    const genericMessages = {
      [ERROR_CATEGORIES.NETWORK]:
        'Impossible de se connecter au service. Vérifiez votre connexion internet.',
      [ERROR_CATEGORIES.FILE_SYSTEM]: "Impossible d'accéder au fichier ou au dossier demandé.",
      [ERROR_CATEGORIES.AUTH]:
        "Problème d'authentification avec le service. Veuillez vous reconnecter.",
      [ERROR_CATEGORIES.DOWNLOAD]: 'Le téléchargement a échoué.',
      [ERROR_CATEGORIES.CONVERSION]: 'La conversion du fichier audio a échoué.',
      [ERROR_CATEGORIES.UI]: "Un problème est survenu dans l'interface.",
      [ERROR_CATEGORIES.SYSTEM]: 'Une erreur système est survenue.',
      [ERROR_CATEGORIES.EXTERNAL]:
        'Un problème est survenu avec un outil externe (yt-dlp, FFmpeg).',
      [ERROR_CATEGORIES.UNKNOWN]: 'Une erreur inattendue est survenue.'
    };

    // Utiliser le message spécifique ou le message générique
    const title = titles[errorData.category] || titles[ERROR_CATEGORIES.UNKNOWN];
    const message =
      errorData.message ||
      genericMessages[errorData.category] ||
      genericMessages[ERROR_CATEGORIES.UNKNOWN];

    // Détails techniques (pour un utilisateur avancé)
    const details = `
Source: ${errorData.source}
Catégorie: ${errorData.category}
ID: ${errorData.id}
Date: ${errorData.timestamp.toLocaleString()}

Message technique: ${errorData.error.message}

${errorData.stack ? `Stack: ${errorData.stack}` : ''}
`;

    return { title, message, details };
  }

  /**
   * Détermine les actions recommandées pour résoudre l'erreur
   * @param {Object} errorData - Les données d'erreur normalisées
   * @returns {Array} - Actions recommandées
   */
  getRecommendedActions(errorData) {
    const commonActions = [{ label: 'Fermer', action: 'CLOSE', primary: true }];

    // Actions spécifiques par catégorie
    const specificActions = {
      [ERROR_CATEGORIES.NETWORK]: [
        { label: 'Réessayer', action: 'RETRY', primary: true },
        { label: 'Vérifier connexion', action: 'CHECK_CONNECTION' }
      ],
      [ERROR_CATEGORIES.FILE_SYSTEM]: [{ label: 'Changer dossier', action: 'CHANGE_DIRECTORY' }],
      [ERROR_CATEGORIES.AUTH]: [{ label: 'Reconnecter', action: 'RECONNECT', primary: true }],
      [ERROR_CATEGORIES.DOWNLOAD]: [{ label: 'Réessayer', action: 'RETRY', primary: true }],
      [ERROR_CATEGORIES.EXTERNAL]: [
        { label: 'Vérifier installation', action: 'CHECK_DEPENDENCIES' }
      ]
    };

    return (specificActions[errorData.category] || []).concat(commonActions);
  }

  /**
   * Récupère l'historique des erreurs
   * @param {Object} [filters] - Filtres optionnels (catégorie, niveau, etc.)
   * @returns {Array} - Historique des erreurs filtré
   */
  getErrorHistory(filters = {}) {
    let filteredHistory = [...this.errorHistory];

    // Appliquer les filtres
    if (filters.category) {
      filteredHistory = filteredHistory.filter((e) => e.category === filters.category);
    }

    if (filters.level) {
      filteredHistory = filteredHistory.filter((e) => e.level === filters.level);
    }

    if (filters.source) {
      filteredHistory = filteredHistory.filter((e) => e.source === filters.source);
    }

    if (filters.since) {
      filteredHistory = filteredHistory.filter((e) => e.timestamp >= filters.since);
    }

    return filteredHistory;
  }

  /**
   * Supprime des erreurs de l'historique selon des critères
   * @param {Object} [criteria] - Critères de suppression
   */
  clearErrors(criteria = {}) {
    if (Object.keys(criteria).length === 0) {
      // Vider tout l'historique si aucun critère n'est spécifié
      this.errorHistory = [];
      return;
    }

    // Filtrer l'historique pour ne garder que les erreurs qui ne correspondent pas aux critères
    this.errorHistory = this.errorHistory.filter((error) => {
      for (const [key, value] of Object.entries(criteria)) {
        if (error[key] === value) {
          return false; // Supprimer si correspond au critère
        }
      }
      return true; // Garder sinon
    });
  }

  /**
   * Nettoie les ressources avant la fermeture de l'application
   */
  cleanup() {
    // Se désabonner des événements
    this.eventBus.unsubscribe('ERROR.REPORT', this.handleError);
    this.eventBus.unsubscribe('SYSTEM.SHUTDOWN', this.cleanup);

    // Archiver l'historique des erreurs si nécessaire
    if (this.errorHistory.length > 0) {
      this.archiveErrorHistory();
    }

    this.initialized = false;
  }

  /**
   * Archive l'historique des erreurs pour analyse ultérieure
   */
  archiveErrorHistory() {
    // Publier un événement pour archiver l'historique
    this.eventBus.publish('SYSTEM.LOG', {
      level: 'info',
      category: 'ERROR',
      message: "Archivage de l'historique des erreurs",
      data: {
        errorCount: this.errorHistory.length
      }
    });

    // Dans une implémentation réelle, on pourrait sauvegarder l'historique
    // des erreurs dans un fichier ou l'envoyer à un service de monitoring
  }
}

/**
 * Factory pour créer et initialiser le gestionnaire d'erreurs
 * Cette approche permet l'injection de dépendances via le bus d'événements
 */
function createErrorHandler() {
  // Cette variable stockera l'instance du gestionnaire
  let instance = null;

  // Fonction d'initialisation appelée par le bus d'événements
  const initialize = (data) => {
    const { eventBus } = data;

    if (!eventBus) {
      console.error("ErrorHandler: eventBus requis pour l'initialisation");
      return;
    }

    instance = new ErrorHandler(eventBus);
    instance.initialize();

    // Publier un événement indiquant que le module est prêt
    eventBus.publish('SYSTEM.MODULE_READY', { module: 'error-handler' });
  };

  // Fonction pour accéder à l'instance (pour les tests unitaires)
  const getInstance = () => instance;

  return {
    initialize,
    getInstance
  };
}

// Exporter la factory du gestionnaire d'erreurs
module.exports = createErrorHandler();

/**
 * EXEMPLE D'UTILISATION:
 *
 * Dans main.js ou un autre point d'entrée:
 *
 * const eventBus = require('./src/core/event-bus');
 * const errorHandler = require('./src/core/error-handler');
 *
 * // Initialiser avec le bus d'événements
 * eventBus.publish('SYSTEM.INIT', {
 *   module: 'error-handler',
 *   eventBus: eventBus
 * });
 *
 * // Pour signaler une erreur depuis n'importe quel module:
 * eventBus.publish('ERROR.REPORT', {
 *   error: new Error('Échec du téléchargement'),
 *   level: 'warning',
 *   category: 'DOWNLOAD',
 *   message: 'Le téléchargement a échoué en raison d\'une erreur réseau',
 *   source: 'download-manager',
 *   context: { url: 'https://example.com/audio.mp3' }
 * });
 */
