/**
 * @fileoverview Classe de base pour tous les adaptateurs de téléchargement
 *
 * Ce module définit une classe abstraite qui sert de base pour tous les adaptateurs
 * spécifiques aux plateformes (YouTube, SoundCloud, Bandcamp, etc.). Il implémente
 * les fonctionnalités communes et définit l'interface que tous les adaptateurs doivent respecter.
 *
 * ARCHITECTURE ÉVÉNEMENTIELLE:
 *
 * Événements écoutés:
 * - ADAPTER_INIT:{PLATFORM} - Initialise l'adaptateur pour une plateforme spécifique
 * - DOWNLOAD_REQUEST:{PLATFORM} - Démarre un téléchargement pour une URL donnée
 * - DOWNLOAD_CANCEL:{PLATFORM} - Annule un téléchargement en cours
 * - CONFIG_UPDATED - Réagit aux changements de configuration
 * - APP_SHUTDOWN - Nettoie les ressources avant la fermeture de l'application
 *
 * Événements émis:
 * - ADAPTER_READY:{PLATFORM} - Signale que l'adaptateur est prêt à être utilisé
 * - DOWNLOAD_STARTED - Indique qu'un téléchargement a commencé
 * - DOWNLOAD_PROGRESS - Rapporte la progression d'un téléchargement
 * - DOWNLOAD_COMPLETED - Signale qu'un téléchargement est terminé
 * - DOWNLOAD_FAILED - Indique qu'un téléchargement a échoué
 * - DOWNLOAD_CANCELLED - Confirme l'annulation d'un téléchargement
 * - METADATA_EXTRACTED - Publie les métadonnées extraites d'un fichier
 * - ERROR - Signale une erreur survenue pendant le traitement
 *
 * @module adapters/base-adapter
 */

// Utilise uniquement des APIs standards et évite les importations de modules internes
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');

/**
 * Classe de base abstraite pour tous les adaptateurs de téléchargement
 */
class BaseAdapter {
  /**
   * @constructor
   * @param {Object} params - Paramètres d'initialisation
   * @param {string} params.platform - Nom de la plateforme (youtube, soundcloud, etc.)
   */
  constructor(params = {}) {
    // Identifiant unique de l'adaptateur
    this.id = crypto.randomUUID();

    // Nom de la plateforme que cet adaptateur gère
    this.platform = params.platform || 'unknown';

    // Files d'attente de téléchargements actifs et en attente
    this.activeDownloads = new Map();
    this.queuedDownloads = [];

    // État d'initialisation
    this.initialized = false;

    // Configuration par défaut
    this.config = {
      maxConcurrentDownloads: 2,
      defaultFormat: 'mp3',
      qualityPresets: {
        mp3: '320k',
        flac: 'best',
        wav: '44100Hz',
        aiff: '44100Hz'
      },
      timeoutSeconds: 300,
      retryAttempts: 3,
      tempDir: path.join(os.tmpdir(), '21byts', this.platform)
    };

    // Référence au bus d'événements (sera définie lors de l'initialisation)
    this.eventBus = null;
  }

  /**
   * Initialise l'adaptateur et s'abonne aux événements pertinents
   * @param {Object} eventBus - Le bus d'événements central
   */
  initialize(eventBus) {
    if (this.initialized) {
      return;
    }

    this.eventBus = eventBus;

    // Création du répertoire temporaire si nécessaire
    if (!fs.existsSync(this.config.tempDir)) {
      try {
        fs.mkdirSync(this.config.tempDir, { recursive: true });
      } catch (error) {
        this._emitError(
          'TEMP_DIR_CREATION_FAILED',
          `Failed to create temp directory: ${error.message}`
        );
        return;
      }
    }

    // S'abonner aux événements
    this._subscribeToEvents();

    this.initialized = true;

    // Signaler que l'adaptateur est prêt
    this._emitEvent('ADAPTER_READY', {
      platform: this.platform,
      adapterId: this.id,
      capabilities: this._getCapabilities()
    });
  }

  /**
   * S'abonne aux événements pertinents
   * @private
   */
  _subscribeToEvents() {
    const eventTypes = {
      [`ADAPTER_INIT:${this.platform}`]: this._handleInit.bind(this),
      [`DOWNLOAD_REQUEST:${this.platform}`]: this._handleDownloadRequest.bind(this),
      [`DOWNLOAD_CANCEL:${this.platform}`]: this._handleCancelRequest.bind(this),
      CONFIG_UPDATED: this._handleConfigUpdate.bind(this),
      APP_SHUTDOWN: this._handleShutdown.bind(this)
    };

    // S'abonner à chaque type d'événement
    Object.entries(eventTypes).forEach(([eventType, handler]) => {
      this.eventBus.subscribe(eventType, handler);
    });
  }

  /**
   * Émet un événement via le bus d'événements central
   * @param {string} eventType - Type d'événement à émettre
   * @param {Object} data - Données associées à l'événement
   * @private
   */
  _emitEvent(eventType, data = {}) {
    if (!this.eventBus) {
      console.error(`Cannot emit event ${eventType}: event bus not initialized`);
      return;
    }

    this.eventBus.publish(eventType, {
      ...data,
      adapterId: this.id,
      platform: this.platform,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Émet un événement d'erreur
   * @param {string} code - Code d'erreur
   * @param {string} message - Message d'erreur
   * @param {Object} [details={}] - Détails supplémentaires
   * @private
   */
  _emitError(code, message, details = {}) {
    this._emitEvent('ERROR', {
      source: `adapter:${this.platform}`,
      code,
      message,
      details
    });
  }

  /**
   * Traite l'événement d'initialisation
   * @param {Object} data - Données d'initialisation
   * @private
   */
  _handleInit(data) {
    if (data && data.config) {
      this.config = { ...this.config, ...data.config };
    }

    // Répondre que l'initialisation est terminée
    this._emitEvent('ADAPTER_READY', {
      platform: this.platform,
      adapterId: this.id,
      capabilities: this._getCapabilities()
    });
  }

  /**
   * Traite une demande de téléchargement
   * @param {Object} data - Données de la demande
   * @private
   */
  _handleDownloadRequest(data) {
    if (!data || !data.url) {
      this._emitError('INVALID_REQUEST', 'Missing URL in download request');
      return;
    }

    const downloadId = crypto.randomUUID();
    const downloadData = {
      id: downloadId,
      url: data.url,
      format: data.format || this.config.defaultFormat,
      metadata: data.metadata || {},
      status: 'queued',
      progress: 0,
      retryCount: 0,
      timestamp: new Date().toISOString()
    };

    // Ajouter à la file d'attente
    this.queuedDownloads.push(downloadData);

    // Signaler que le téléchargement est en file d'attente
    this._emitEvent('DOWNLOAD_QUEUED', {
      downloadId,
      url: data.url,
      format: downloadData.format
    });

    // Traiter la file d'attente
    this._processQueue();
  }

  /**
   * Traite une demande d'annulation de téléchargement
   * @param {Object} data - Données de la demande
   * @private
   */
  _handleCancelRequest(data) {
    if (!data || !data.downloadId) {
      this._emitError('INVALID_REQUEST', 'Missing downloadId in cancel request');
      return;
    }

    const { downloadId } = data;

    // Vérifier si le téléchargement est actif
    if (this.activeDownloads.has(downloadId)) {
      const download = this.activeDownloads.get(downloadId);

      // Terminer le processus si nécessaire
      if (download.process && typeof download.process.kill === 'function') {
        download.process.kill();
      }

      this.activeDownloads.delete(downloadId);

      this._emitEvent('DOWNLOAD_CANCELLED', { downloadId });
    } else {
      // Vérifier si le téléchargement est en file d'attente
      const queueIndex = this.queuedDownloads.findIndex((d) => d.id === downloadId);
      if (queueIndex !== -1) {
        this.queuedDownloads.splice(queueIndex, 1);
        this._emitEvent('DOWNLOAD_CANCELLED', { downloadId });
      } else {
        this._emitError('DOWNLOAD_NOT_FOUND', `Download with ID ${downloadId} not found`);
      }
    }
  }

  /**
   * Traite une mise à jour de la configuration
   * @param {Object} data - Données de configuration
   * @private
   */
  _handleConfigUpdate(data) {
    if (data && data.adapters && data.adapters[this.platform]) {
      this.config = { ...this.config, ...data.adapters[this.platform] };
    }
  }

  /**
   * Gère l'arrêt de l'application
   * @private
   */
  _handleShutdown() {
    // Arrêter tous les téléchargements actifs
    for (const [downloadId, download] of this.activeDownloads.entries()) {
      if (download.process && typeof download.process.kill === 'function') {
        download.process.kill();
      }
      this._emitEvent('DOWNLOAD_CANCELLED', { downloadId });
    }

    this.activeDownloads.clear();
    this.queuedDownloads = [];
  }

  /**
   * Traite la file d'attente de téléchargements
   * @private
   */
  _processQueue() {
    // Vérifier si on peut démarrer de nouveaux téléchargements
    while (
      this.queuedDownloads.length > 0 &&
      this.activeDownloads.size < this.config.maxConcurrentDownloads
    ) {
      const downloadData = this.queuedDownloads.shift();
      this._startDownload(downloadData);
    }
  }

  /**
   * Démarre un téléchargement spécifique
   * @param {Object} downloadData - Données du téléchargement
   * @private
   */
  _startDownload(downloadData) {
    // Cette méthode doit être implémentée par les classes dérivées
    this._emitError(
      'NOT_IMPLEMENTED',
      'The _startDownload method must be implemented by subclasses'
    );

    // Traiter le prochain téléchargement dans la file
    this._processQueue();
  }

  /**
   * Obtient les capacités spécifiques de cet adaptateur
   * @returns {Object} Capacités de l'adaptateur
   * @private
   */
  _getCapabilities() {
    // À surcharger par les classes dérivées
    return {
      formats: ['mp3', 'flac', 'wav', 'aiff'],
      supportsPlaylists: false,
      supportsChannels: false,
      requiresAuthentication: false,
      maxPlaylistItems: 0
    };
  }

  /**
   * Extrait les métadonnées d'un fichier téléchargé
   * @param {string} filePath - Chemin vers le fichier
   * @returns {Promise<Object>} Métadonnées extraites
   * @protected
   */
  async _extractMetadata(filePath) {
    // Cette méthode doit être implémentée par les classes dérivées
    return {};
  }

  /**
   * Convertit un fichier au format demandé
   * @param {string} inputPath - Chemin du fichier d'entrée
   * @param {string} outputPath - Chemin du fichier de sortie
   * @param {string} format - Format de sortie (mp3, flac, etc.)
   * @returns {Promise<string>} Chemin du fichier converti
   * @protected
   */
  async _convertFormat(inputPath, outputPath, format) {
    // À surcharger par les classes dérivées
    return inputPath;
  }
}

// Exporter la classe
module.exports = BaseAdapter;

/**
 * Exemple d'utilisation:
 *
 * // Dans un contexte isolé utilisant le bus d'événements
 * const eventBus = ...; // Obtenir le bus d'événements via injection
 *
 * // Initialiser l'adaptateur
 * eventBus.publish('ADAPTER_INIT:youtube', {
 *   config: {
 *     maxConcurrentDownloads: 3,
 *     defaultFormat: 'mp3'
 *   }
 * });
 *
 * // Démarrer un téléchargement
 * eventBus.publish('DOWNLOAD_REQUEST:youtube', {
 *   url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
 *   format: 'mp3',
 *   metadata: {
 *     title: 'Never Gonna Give You Up',
 *     artist: 'Rick Astley'
 *   }
 * });
 *
 * // Annuler un téléchargement
 * eventBus.publish('DOWNLOAD_CANCEL:youtube', {
 *   downloadId: '123e4567-e89b-12d3-a456-426614174000'
 * });
 */ // Classe de base pour tous les adaptateurs
// Créé automatiquement le 2025-05-02
