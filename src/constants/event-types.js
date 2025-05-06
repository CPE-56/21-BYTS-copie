/**
 * @fileoverview Définition des types d'événements standardisés pour 21 BYTS
 *
 * Ce fichier contient tous les types d'événements utilisés dans l'application.
 * Il sert de contrat entre les différents modules qui communiquent via le bus d'événements.
 *
 * IMPORTANT: Toute communication inter-modules doit utiliser exclusivement ces événements.
 * Pour ajouter un nouvel événement:
 * 1. Ajoutez-le dans la catégorie appropriée
 * 2. Documentez son utilisation et la structure de données attendue
 * 3. Respectez la convention de nommage: CATEGORIE:ACTION[:CIBLE]
 */

/**
 * Types d'événements pour l'application
 * @namespace
 */
const EVENT_TYPES = {
  /**
   * Événements liés au cycle de vie de l'application
   */
  APP: {
    /** Application initialisée et prête */
    READY: 'APP:READY',
    /** Demande de fermeture de l'application */
    QUIT_REQUEST: 'APP:QUIT_REQUEST',
    /** L'application est en cours de fermeture */
    SHUTTING_DOWN: 'APP:SHUTTING_DOWN',
    /** Demande de redémarrage de l'application */
    RESTART_REQUEST: 'APP:RESTART_REQUEST',
    /** Mise à jour disponible détectée */
    UPDATE_AVAILABLE: 'APP:UPDATE_AVAILABLE',
    /** Mise à jour téléchargée et prête à être installée */
    UPDATE_DOWNLOADED: 'APP:UPDATE_DOWNLOADED',
    /** Demande d'installation de mise à jour */
    UPDATE_INSTALL_REQUEST: 'APP:UPDATE_INSTALL_REQUEST'
  },

  /**
   * Événements liés à la configuration
   */
  CONFIG: {
    /** Configuration chargée */
    LOADED: 'CONFIG:LOADED',
    /** Demande de modification de configuration */
    CHANGE_REQUEST: 'CONFIG:CHANGE_REQUEST',
    /** Configuration mise à jour */
    UPDATED: 'CONFIG:UPDATED',
    /** Erreur de chargement ou de sauvegarde de configuration */
    ERROR: 'CONFIG:ERROR',
    /** Réinitialisation de la configuration aux valeurs par défaut */
    RESET: 'CONFIG:RESET'
  },

  /**
   * Événements liés au téléchargement
   */
  DOWNLOAD: {
    /** Demande d'ajout d'URL pour téléchargement */
    URL_ADD_REQUEST: 'DOWNLOAD:URL_ADD_REQUEST',
    /** URL ajoutée à la file d'attente */
    URL_ADDED: 'DOWNLOAD:URL_ADDED',
    /** URL invalide ou non prise en charge */
    URL_INVALID: 'DOWNLOAD:URL_INVALID',
    /** Analyse d'URL commencée */
    URL_ANALYSIS_START: 'DOWNLOAD:URL_ANALYSIS_START',
    /** Analyse d'URL terminée avec succès */
    URL_ANALYSIS_SUCCESS: 'DOWNLOAD:URL_ANALYSIS_SUCCESS',
    /** Erreur lors de l'analyse d'URL */
    URL_ANALYSIS_ERROR: 'DOWNLOAD:URL_ANALYSIS_ERROR',
    /** Playlist détectée lors de l'analyse */
    PLAYLIST_DETECTED: 'DOWNLOAD:PLAYLIST_DETECTED',
    /** Demande de téléchargement d'un élément spécifique */
    ITEM_START_REQUEST: 'DOWNLOAD:ITEM_START_REQUEST',
    /** Téléchargement d'un élément commencé */
    ITEM_STARTED: 'DOWNLOAD:ITEM_STARTED',
    /** Progression du téléchargement mise à jour */
    ITEM_PROGRESS: 'DOWNLOAD:ITEM_PROGRESS',
    /** Téléchargement d'un élément terminé */
    ITEM_COMPLETED: 'DOWNLOAD:ITEM_COMPLETED',
    /** Erreur lors du téléchargement d'un élément */
    ITEM_ERROR: 'DOWNLOAD:ITEM_ERROR',
    /** Demande d'annulation d'un téléchargement */
    ITEM_CANCEL_REQUEST: 'DOWNLOAD:ITEM_CANCEL_REQUEST',
    /** Téléchargement annulé */
    ITEM_CANCELLED: 'DOWNLOAD:ITEM_CANCELLED',
    /** Tous les téléchargements terminés */
    ALL_COMPLETED: 'DOWNLOAD:ALL_COMPLETED',
    /** Demande de démarrage de tous les téléchargements */
    ALL_START_REQUEST: 'DOWNLOAD:ALL_START_REQUEST',
    /** Demande d'annulation de tous les téléchargements */
    ALL_CANCEL_REQUEST: 'DOWNLOAD:ALL_CANCEL_REQUEST',
    /** Demande de suppression des téléchargements terminés */
    CLEAR_COMPLETED_REQUEST: 'DOWNLOAD:CLEAR_COMPLETED_REQUEST',
    /** Téléchargements terminés supprimés */
    COMPLETED_CLEARED: 'DOWNLOAD:COMPLETED_CLEARED'
  },

  /**
   * Événements liés aux adaptateurs de téléchargement spécifiques aux plateformes
   */
  ADAPTER: {
    /** Initialisation de l'adaptateur */
    INIT: 'ADAPTER:INIT',
    /** Adaptateur prêt */
    READY: 'ADAPTER:READY',
    /** Erreur d'adaptateur */
    ERROR: 'ADAPTER:ERROR',
    /** Adaptateur YouTube spécifique */
    YOUTUBE: {
      /** Analyse YouTube commencée */
      ANALYSIS_START: 'ADAPTER:YOUTUBE:ANALYSIS_START',
      /** Analyse YouTube terminée */
      ANALYSIS_COMPLETE: 'ADAPTER:YOUTUBE:ANALYSIS_COMPLETE',
      /** Erreur lors de l'utilisation de yt-dlp */
      YT_DLP_ERROR: 'ADAPTER:YOUTUBE:YT_DLP_ERROR'
    },
    /** Adaptateur SoundCloud spécifique */
    SOUNDCLOUD: {
      /** Analyse SoundCloud commencée */
      ANALYSIS_START: 'ADAPTER:SOUNDCLOUD:ANALYSIS_START',
      /** Analyse SoundCloud terminée */
      ANALYSIS_COMPLETE: 'ADAPTER:SOUNDCLOUD:ANALYSIS_COMPLETE'
    },
    /** Adaptateur Bandcamp spécifique */
    BANDCAMP: {
      /** Analyse Bandcamp commencée */
      ANALYSIS_START: 'ADAPTER:BANDCAMP:ANALYSIS_START',
      /** Analyse Bandcamp terminée */
      ANALYSIS_COMPLETE: 'ADAPTER:BANDCAMP:ANALYSIS_COMPLETE'
    },
    /** Adaptateur Spotify spécifique */
    SPOTIFY: {
      /** Analyse Spotify commencée */
      ANALYSIS_START: 'ADAPTER:SPOTIFY:ANALYSIS_START',
      /** Analyse Spotify terminée */
      ANALYSIS_COMPLETE: 'ADAPTER:SPOTIFY:ANALYSIS_COMPLETE'
    },
    /** Adaptateur Tidal spécifique */
    TIDAL: {
      /** Analyse Tidal commencée */
      ANALYSIS_START: 'ADAPTER:TIDAL:ANALYSIS_START',
      /** Analyse Tidal terminée */
      ANALYSIS_COMPLETE: 'ADAPTER:TIDAL:ANALYSIS_COMPLETE',
      /** Authentification Tidal requise */
      AUTH_REQUIRED: 'ADAPTER:TIDAL:AUTH_REQUIRED',
      /** Code d'authentification Tidal généré */
      AUTH_CODE_GENERATED: 'ADAPTER:TIDAL:AUTH_CODE_GENERATED',
      /** Authentification Tidal réussie */
      AUTH_SUCCESS: 'ADAPTER:TIDAL:AUTH_SUCCESS',
      /** Erreur d'authentification Tidal */
      AUTH_ERROR: 'ADAPTER:TIDAL:AUTH_ERROR',
      /** Tokens d'authentification expirés */
      AUTH_TOKENS_EXPIRED: 'ADAPTER:TIDAL:AUTH_TOKENS_EXPIRED'
    }
  },

  /**
   * Événements liés à l'authentification
   */
  AUTH: {
    /** Demande d'authentification */
    REQUEST: 'AUTH:REQUEST',
    /** Authentification réussie */
    SUCCESS: 'AUTH:SUCCESS',
    /** Échec d'authentification */
    FAILURE: 'AUTH:FAILURE',
    /** Déconnexion */
    LOGOUT: 'AUTH:LOGOUT',
    /** Tokens mis à jour */
    TOKENS_UPDATED: 'AUTH:TOKENS_UPDATED',
    /** Tokens expirés */
    TOKENS_EXPIRED: 'AUTH:TOKENS_EXPIRED'
  },

  /**
   * Événements liés à l'interface utilisateur
   */
  UI: {
    /** Demande de mise à jour de l'interface */
    UPDATE_REQUEST: 'UI:UPDATE_REQUEST',
    /** Interface mise à jour */
    UPDATED: 'UI:UPDATED',
    /** Affichage d'une notification */
    NOTIFICATION_SHOW: 'UI:NOTIFICATION_SHOW',
    /** Ouverture du panneau de paramètres */
    SETTINGS_PANEL_OPEN: 'UI:SETTINGS_PANEL_OPEN',
    /** Fermeture du panneau de paramètres */
    SETTINGS_PANEL_CLOSE: 'UI:SETTINGS_PANEL_CLOSE',
    /** Pression sur une touche */
    KEY_PRESS: 'UI:KEY_PRESS',
    /** Affichage d'une boîte de dialogue d'erreur */
    ERROR_DIALOG_SHOW: 'UI:ERROR_DIALOG_SHOW',
    /** Fermeture d'une boîte de dialogue d'erreur */
    ERROR_DIALOG_CLOSE: 'UI:ERROR_DIALOG_CLOSE'
  },

  /**
   * Événements liés au système de fichiers
   */
  FILE: {
    /** Demande d'écriture de fichier */
    WRITE_REQUEST: 'FILE:WRITE_REQUEST',
    /** Fichier écrit avec succès */
    WRITE_SUCCESS: 'FILE:WRITE_SUCCESS',
    /** Erreur d'écriture de fichier */
    WRITE_ERROR: 'FILE:WRITE_ERROR',
    /** Demande de lecture de fichier */
    READ_REQUEST: 'FILE:READ_REQUEST',
    /** Fichier lu avec succès */
    READ_SUCCESS: 'FILE:READ_SUCCESS',
    /** Erreur de lecture de fichier */
    READ_ERROR: 'FILE:READ_ERROR',
    /** Demande de sélection de dossier */
    SELECT_DIRECTORY_REQUEST: 'FILE:SELECT_DIRECTORY_REQUEST',
    /** Dossier sélectionné */
    DIRECTORY_SELECTED: 'FILE:DIRECTORY_SELECTED',
    /** Demande d'ajout à la bibliothèque */
    ADD_TO_LIBRARY_REQUEST: 'FILE:ADD_TO_LIBRARY_REQUEST',
    /** Fichiers ajoutés à la bibliothèque */
    ADDED_TO_LIBRARY: 'FILE:ADDED_TO_LIBRARY'
  },

  /**
   * Événements liés aux métadonnées audio
   */
  METADATA: {
    /** Demande d'extraction de métadonnées */
    EXTRACT_REQUEST: 'METADATA:EXTRACT_REQUEST',
    /** Métadonnées extraites */
    EXTRACTED: 'METADATA:EXTRACTED',
    /** Erreur d'extraction de métadonnées */
    EXTRACT_ERROR: 'METADATA:EXTRACT_ERROR',
    /** Demande de mise à jour de métadonnées */
    UPDATE_REQUEST: 'METADATA:UPDATE_REQUEST',
    /** Métadonnées mises à jour */
    UPDATED: 'METADATA:UPDATED',
    /** Erreur de mise à jour de métadonnées */
    UPDATE_ERROR: 'METADATA:UPDATE_ERROR',
    /** Pochette d'album extraite */
    ARTWORK_EXTRACTED: 'METADATA:ARTWORK_EXTRACTED',
    /** Erreur d'extraction de pochette d'album */
    ARTWORK_ERROR: 'METADATA:ARTWORK_ERROR'
  },

  /**
   * Événements liés à la conversion de formats audio
   */
  FORMAT: {
    /** Demande de conversion de format */
    CONVERT_REQUEST: 'FORMAT:CONVERT_REQUEST',
    /** Conversion commencée */
    CONVERT_START: 'FORMAT:CONVERT_START',
    /** Progression de la conversion */
    CONVERT_PROGRESS: 'FORMAT:CONVERT_PROGRESS',
    /** Conversion terminée */
    CONVERT_COMPLETE: 'FORMAT:CONVERT_COMPLETE',
    /** Erreur de conversion */
    CONVERT_ERROR: 'FORMAT:CONVERT_ERROR',
    /** Formats disponibles mis à jour */
    AVAILABLE_UPDATED: 'FORMAT:AVAILABLE_UPDATED'
  },

  /**
   * Événements liés à la gestion d'erreurs
   */
  ERROR: {
    /** Erreur critique (empêchant le fonctionnement de l'application) */
    CRITICAL: 'ERROR:CRITICAL',
    /** Erreur non critique (l'application peut continuer) */
    NON_CRITICAL: 'ERROR:NON_CRITICAL',
    /** Erreur réseau */
    NETWORK: 'ERROR:NETWORK',
    /** Erreur de système de fichiers */
    FILESYSTEM: 'ERROR:FILESYSTEM',
    /** Erreur d'outil externe (yt-dlp, ffmpeg, etc.) */
    EXTERNAL_TOOL: 'ERROR:EXTERNAL_TOOL',
    /** Erreur de permission */
    PERMISSION: 'ERROR:PERMISSION'
  },

  /**
   * Événements liés à la journalisation
   */
  LOG: {
    /** Message de débogage */
    DEBUG: 'LOG:DEBUG',
    /** Message d'information */
    INFO: 'LOG:INFO',
    /** Message d'avertissement */
    WARNING: 'LOG:WARNING',
    /** Message d'erreur */
    ERROR: 'LOG:ERROR'
  },

  /**
   * Événements liés aux playlists
   */
  PLAYLIST: {
    /** Playlist détectée */
    DETECTED: 'PLAYLIST:DETECTED',
    /** Demande de traitement de playlist */
    PROCESS_REQUEST: 'PLAYLIST:PROCESS_REQUEST',
    /** Traitement de playlist commencé */
    PROCESSING_START: 'PLAYLIST:PROCESSING_START',
    /** Progression du traitement de playlist */
    PROCESSING_PROGRESS: 'PLAYLIST:PROCESSING_PROGRESS',
    /** Traitement de playlist terminé */
    PROCESSING_COMPLETE: 'PLAYLIST:PROCESSING_COMPLETE',
    /** Erreur de traitement de playlist */
    PROCESSING_ERROR: 'PLAYLIST:PROCESSING_ERROR',
    /** Limite de playlist dépassée (plus de 200 éléments) */
    LIMIT_EXCEEDED: 'PLAYLIST:LIMIT_EXCEEDED'
  },

  /**
   * Événements liés à la gestion d'état
   */
  STATE: {
    /** Récupère une valeur d'état */
    GET: 'STATE:GET',
    /** Retourne une valeur d'état demandée */
    VALUE: 'STATE:VALUE',
    /** Met à jour une valeur d'état */
    UPDATE: 'STATE:UPDATE',
    /** Définit une valeur d'état */
    SET: 'STATE:SET',
    /** Réinitialise une valeur d'état */
    RESET: 'STATE:RESET',
    /** S'abonne aux changements d'état */
    SUBSCRIBE: 'STATE:SUBSCRIBE',
    /** Se désabonne des changements d'état */
    UNSUBSCRIBE: 'STATE:UNSUBSCRIBE',
    /** Notification de changement d'état */
    CHANGED: 'STATE:CHANGED',
    /** Erreur de gestion d'état */
    ERROR: 'STATE:ERROR'
  }
};

// Geler l'objet pour éviter toute modification accidentelle
Object.freeze(EVENT_TYPES);

// Exporter les événements
module.exports = EVENT_TYPES;
