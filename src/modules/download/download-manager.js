/**
 * @fileoverview Gestionnaire de téléchargement pour l'application 21 BYTS
 *
 * Ce module gère le cycle de vie complet des téléchargements audio :
 * - Analyse des URLs
 * - Gestion de la file d'attente
 * - Démarrage/pause/annulation des téléchargements
 * - Conversion des formats
 * - Extraction et mise à jour des métadonnées
 * - Gestion des erreurs spécifiques aux téléchargements
 *
 * @module download-manager
 * @requires electron
 * @requires child_process
 * @requires path
 * @requires fs
 */

// Dépendances externes uniquement (pas de dépendances internes)
const { app } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

/**
 * Gestionnaire de téléchargement pour l'application 21 BYTS
 * Communique exclusivement via le bus d'événements
 */
class DownloadManager {
  /**
   * Initialise le gestionnaire de téléchargement
   * @param {Object} eventBus - Instance du bus d'événements injectée au démarrage
   */
  constructor(eventBus) {
    // Référence au bus d'événements (unique dépendance autorisée)
    this.eventBus = eventBus;

    // État interne du gestionnaire
    this.downloadQueue = [];     // File d'attente des téléchargements
    this.activeDownloads = {};   // Téléchargements actuellement en cours {id: downloadObject}
    this.downloadHistory = [];   // Historique des téléchargements terminés
    this.maxConcurrentDownloads = 3; // Valeur par défaut
    this.defaultOutputFormat = 'mp3'; // Format par défaut
    this.defaultOutputPath = app.getPath('downloads'); // Chemin par défaut
    this.downloadPaths = {}; // Chemins temporaires des téléchargements en cours

    // Binaires externes
    this.binariesPath = this._getBinariesPath();
    this.binaries = {
      ytdlp: null,
      ffmpeg: null,
      tidalDownloader: null
    };

    // Stocker les processus actifs pour pouvoir les arrêter proprement
    this.activeProcesses = {};

    // Initialisation
    this._registerEventListeners();
  }

  /**
   * Récupère le chemin approprié pour les binaires selon la plateforme
   * @private
   * @returns {string} Chemin vers le dossier des binaires
   */
  _getBinariesPath() {
    const platform = process.platform;
    if (platform === 'darwin') {
      return path.join(process.resourcesPath, 'bin', 'macos');
    } else if (platform === 'win32') {
      return path.join(process.resourcesPath, 'bin', 'windows');
    } else {
      return path.join(process.resourcesPath, 'bin', 'linux');
    }
  }

  /**
   * Enregistre les écouteurs d'événements pour le module
   * @private
   */
  _registerEventListeners() {
    // Configuration
    this.eventBus.on('CONFIG:LOADED', this._handleConfigLoaded.bind(this));

    // Gestion des téléchargements
    this.eventBus.on('DOWNLOAD:ADD', this._handleDownloadAdd.bind(this));
    this.eventBus.on('DOWNLOAD:START', this._handleDownloadStart.bind(this));
    this.eventBus.on('DOWNLOAD:PAUSE', this._handleDownloadPause.bind(this));
    this.eventBus.on('DOWNLOAD:RESUME', this._handleDownloadResume.bind(this));
    this.eventBus.on('DOWNLOAD:CANCEL', this._handleDownloadCancel.bind(this));
    this.eventBus.on('DOWNLOAD:CLEAR_COMPLETED', this._handleClearCompleted.bind(this));
    this.eventBus.on('DOWNLOAD:START_ALL', this._handleStartAll.bind(this));
    this.eventBus.on('DOWNLOAD:PAUSE_ALL', this._handlePauseAll.bind(this));

    // Configuration
    this.eventBus.on('SETTINGS:UPDATED', this._handleSettingsUpdated.bind(this));

    // Cycle de vie de l'application
    this.eventBus.on('APP:WILL_CLOSE', this._handleAppWillClose.bind(this));

    // Validation des binaires au démarrage
    this.eventBus.emit('LOG:INFO', {
      module: 'download-manager',
      message: 'Initialisation du gestionnaire de téléchargement'
    });

    this._validateBinaries();
  }

  /**
   * Valide la présence et l'exécutabilité des binaires externes
   * @private
   */
  _validateBinaries() {
    this.eventBus.emit('LOG:INFO', {
      module: 'download-manager',
      message: 'Vérification des binaires externes'
    });

    const platform = process.platform;
    const ext = platform === 'win32' ? '.exe' : '';

    const ytdlpPath = path.join(this.binariesPath, `yt-dlp${ext}`);
    const ffmpegPath = path.join(this.binariesPath, `ffmpeg${ext}`);
    const tidalDownloaderPath = path.join(this.binariesPath, `tidal-downloader${ext}`);

    // Vérification de yt-dlp
    this._checkBinary(ytdlpPath, 'yt-dlp', '--version')
      .then(version => {
        this.binaries.ytdlp = ytdlpPath;
        this.eventBus.emit('LOG:INFO', {
          module: 'download-manager',
          message: `yt-dlp version ${version} trouvée`
        });
      })
      .catch(error => {
        this.eventBus.emit('ERROR:BINARY_MISSING', {
          binary: 'yt-dlp',
          path: ytdlpPath,
          error: error.message
        });
      });

    // Vérification de ffmpeg
    this._checkBinary(ffmpegPath, 'ffmpeg', '-version')
      .then(version => {
        this.binaries.ffmpeg = ffmpegPath;
        this.eventBus.emit('LOG:INFO', {
          module: 'download-manager',
          message: `ffmpeg trouvé: ${version.split('\n')[0]}`
        });
      })
      .catch(error => {
        this.eventBus.emit('ERROR:BINARY_MISSING', {
          binary: 'ffmpeg',
          path: ffmpegPath,
          error: error.message
        });
      });

    // Vérification de tidal-downloader (optionnel)
    this._checkBinary(tidalDownloaderPath, 'tidal-downloader', '--version')
      .then(version => {
        this.binaries.tidalDownloader = tidalDownloaderPath;
        this.eventBus.emit('LOG:INFO', {
          module: 'download-manager',
          message: `Tidal Downloader version ${version} trouvée`
        });
      })
      .catch(error => {
        // Juste un avertissement car Tidal est optionnel
        this.eventBus.emit('LOG:WARNING', {
          module: 'download-manager',
          message: `Tidal Downloader non trouvé: ${error.message}`
        });
      });
  }

  /**
   * Vérifie si un binaire est disponible et exécutable
   * @private
   * @param {string} binaryPath - Chemin vers le binaire
   * @param {string} name - Nom du binaire
   * @param {string} versionFlag - Drapeau pour vérifier la version
   * @returns {Promise<string>} Version du binaire
   */
  _checkBinary(binaryPath, name, versionFlag) {
    return new Promise((resolve, reject) => {
      // Vérifier l'existence du fichier
      if (!fs.existsSync(binaryPath)) {
        return reject(new Error(`Binaire ${name} non trouvé: ${binaryPath}`));
      }

      // Vérifier si le fichier est exécutable
      try {
        fs.accessSync(binaryPath, fs.constants.X_OK);
      } catch (error) {
        return reject(new Error(`Binaire ${name} non exécutable: ${error.message}`));
      }

      // Tester l'exécution
      const process = spawn(binaryPath, [versionFlag]);
      let output = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.stderr.on('data', (data) => {
        output += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve(output.trim());
        } else {
          reject(new Error(`Échec de l'exécution (code ${code}): ${output}`));
        }
      });

      process.on('error', (error) => {
        reject(new Error(`Erreur lors du lancement: ${error.message}`));
      });
    });
  }

  /**
   * Gère l'événement de chargement de la configuration
   * @private
   * @param {Object} config - Configuration chargée
   */
  _handleConfigLoaded(config) {
    if (config.downloads) {
      if (config.downloads.maxConcurrent) {
        this.maxConcurrentDownloads = config.downloads.maxConcurrent;
      }

      if (config.downloads.defaultFormat) {
        this.defaultOutputFormat = config.downloads.defaultFormat;
      }

      if (config.downloads.outputPath) {
        this.defaultOutputPath = config.downloads.outputPath;
      }
    }

    this.eventBus.emit('LOG:INFO', {
      module: 'download-manager',
      message: `Configuration chargée: max=${this.maxConcurrentDownloads}, format=${this.defaultOutputFormat}`
    });
  }

  /**
   * Gère l'événement d'ajout d'un téléchargement
   * @private
   * @param {Object} downloadRequest - Requête de téléchargement
   * @param {string} downloadRequest.url - URL à télécharger
   * @param {string} [downloadRequest.format] - Format de sortie désiré
   * @param {string} [downloadRequest.outputPath] - Chemin de sortie personnalisé
   * @param {boolean} [downloadRequest.extractPlaylist=false] - Extraire la playlist si détectée
   * @param {number} [downloadRequest.playlistLimit=200] - Limite de titres dans une playlist
   */
  _handleDownloadAdd({ url, format, outputPath, extractPlaylist = false, playlistLimit = 200 }) {
    if (!url) {
      this.eventBus.emit('ERROR:INVALID_PARAMS', {
        module: 'download-manager',
        function: 'handleDownloadAdd',
        message: 'URL manquante'
      });
      return;
    }

    this.eventBus.emit('LOG:INFO', {
      module: 'download-manager',
      message: `Ajout d'un nouveau téléchargement: ${url}`
    });

    // Générer un ID unique pour ce téléchargement
    const downloadId = crypto.randomUUID();

    // Créer l'objet de téléchargement
    const downloadItem = {
      id: downloadId,
      url: url,
      status: 'pending', // pending, analyzing, downloading, paused, completed, error, cancelled
      progress: 0,
      format: format || this.defaultOutputFormat,
      outputPath: outputPath || this.defaultOutputPath,
      extractPlaylist: extractPlaylist,
      playlistLimit: playlistLimit,
      isPlaylist: false,
      playlistItems: [],
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      fileSize: 0,
      downloadedSize: 0,
      speed: 0,
      eta: 0,
      metadata: {
        title: null,
        artist: null,
        album: null,
        thumbnail: null,
        duration: null,
        platform: this._detectPlatformFromUrl(url)
      },
      error: null
    };

    // Ajouter à la file d'attente
    this.downloadQueue.push(downloadItem);

    // Notifier l'ajout
    this.eventBus.emit('DOWNLOAD:ADDED', {
      downloadId: downloadId,
      download: downloadItem
    });

    // Lancer l'analyse immédiate (hors file d'attente principale)
    this._analyzeDownload(downloadItem);

    // Lancer le processus si possible
    this._processQueue();
  }

  /**
   * Détecte la plateforme à partir de l'URL
   * @private
   * @param {string} url - URL à analyser
   * @returns {string} Plateforme détectée (youtube, soundcloud, bandcamp, spotify, tidal, unknown)
   */
  _detectPlatformFromUrl(url) {
    const urlLower = url.toLowerCase();

    if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
      return 'youtube';
    } else if (urlLower.includes('soundcloud.com')) {
      return 'soundcloud';
    } else if (urlLower.includes('bandcamp.com')) {
      return 'bandcamp';
    } else if (urlLower.includes('spotify.com')) {
      return 'spotify';
    } else if (urlLower.includes('tidal.com')) {
      return 'tidal';
    } else {
      return 'unknown';
    }
  }

  /**
   * Analyse un téléchargement pour extraire les métadonnées et détecter les playlists
   * @private
   * @param {Object} downloadItem - Élément de téléchargement à analyser
   */
  _analyzeDownload(downloadItem) {
    // Mise à jour du statut
    downloadItem.status = 'analyzing';
    this._updateDownloadStatus(downloadItem);

    // Vérifier que yt-dlp est disponible
    if (!this.binaries.ytdlp) {
      this._handleDownloadError(downloadItem, 'Binaire yt-dlp non disponible');
      return;
    }

    // Pour Tidal, vérifier si le binaire est disponible
    if (downloadItem.metadata.platform === 'tidal' && !this.binaries.tidalDownloader) {
      this._handleDownloadError(downloadItem, 'Support Tidal non disponible (binaire manquant)');
      return;
    }

    // Options pour l'analyse (pas de téléchargement, juste les infos)
    const args = [
      '--no-playlist', // Désactiver la playlist sauf si explicitement demandé
      '--dump-json',   // Sortie JSON
      '--flat-playlist', // Playlist à plat
      downloadItem.url
    ];

    // Si extraction de playlist est demandée, modifier les options
    if (downloadItem.extractPlaylist) {
      args[0] = '--yes-playlist';

      if (downloadItem.playlistLimit > 0) {
        args.unshift(`--playlist-end=${downloadItem.playlistLimit}`);
      }
    }

    this.eventBus.emit('LOG:DEBUG', {
      module: 'download-manager',
      message: `Analyse de ${downloadItem.url} avec les options: ${args.join(' ')}`
    });

    const analyzeProcess = spawn(this.binaries.ytdlp, args);
    let outputData = '';
    let errorData = '';

    analyzeProcess.stdout.on('data', (data) => {
      outputData += data.toString();
    });

    analyzeProcess.stderr.on('data', (data) => {
      errorData += data.toString();
    });

    analyzeProcess.on('close', (code) => {
      if (code !== 0) {
        this._handleDownloadError(downloadItem, `Erreur d'analyse (code ${code}): ${errorData}`);
        return;
      }

      try {
        // Traiter la sortie JSON
        let jsonData;

        // La sortie peut contenir plusieurs lignes JSON pour les playlists
        const jsonLines = outputData.trim().split('\n');

        if (jsonLines.length > 1) {
          // C'est une playlist
          downloadItem.isPlaylist = true;

          // Première entrée = infos de la playlist
          jsonData = JSON.parse(jsonLines[0]);

          // Extraire les métadonnées de la playlist
          downloadItem.metadata.title = jsonData.title || 'Playlist sans titre';
          downloadItem.metadata.thumbnail = jsonData.thumbnail || null;

          // Traiter chaque élément de la playlist
          const playlistItems = [];

          for (let i = 0; i < jsonLines.length; i++) {
            try {
              const itemData = JSON.parse(jsonLines[i]);

              if (itemData.id && itemData.title) {
                const playlistItem = {
                  id: itemData.id,
                  title: itemData.title,
                  url: itemData.original_url || itemData.webpage_url || downloadItem.url,
                  duration: itemData.duration,
                  thumbnail: itemData.thumbnail,
                  artist: itemData.artist || itemData.uploader,
                  status: 'pending',
                  progress: 0
                };

                playlistItems.push(playlistItem);
              }
            } catch (e) {
              // Ignorer les lignes non-JSON
              this.eventBus.emit('LOG:WARNING', {
                module: 'download-manager',
                message: `Ligne JSON invalide ignorée: ${e.message}`
              });
            }
          }

          downloadItem.playlistItems = playlistItems;

          // Si la playlist dépasse la limite, tronquer et notifier
          if (downloadItem.playlistItems.length > downloadItem.playlistLimit) {
            downloadItem.playlistItems = downloadItem.playlistItems.slice(0, downloadItem.playlistLimit);

            this.eventBus.emit('NOTIFICATION:SHOW', {
              type: 'warning',
              title: 'Playlist limitée',
              message: `La playlist a été limitée à ${downloadItem.playlistLimit} titres.`
            });
          }

          this.eventBus.emit('LOG:INFO', {
            module: 'download-manager',
            message: `Playlist détectée avec ${downloadItem.playlistItems.length} éléments`
          });
        } else {
          // Fichier unique
          jsonData = JSON.parse(outputData);

          // Extraire les métadonnées
          downloadItem.metadata.title = jsonData.title || 'Titre inconnu';
          downloadItem.metadata.artist = jsonData.artist || jsonData.uploader || 'Artiste inconnu';
          downloadItem.metadata.album = jsonData.album || jsonData.playlist || '';
          downloadItem.metadata.thumbnail = jsonData.thumbnail || null;
          downloadItem.metadata.duration = jsonData.duration || 0;

          this.eventBus.emit('LOG:INFO', {
            module: 'download-manager',
            message: `Fichier unique détecté: ${downloadItem.metadata.title}`
          });
        }

        // Mise à jour du statut
        downloadItem.status = 'ready';
        this._updateDownloadStatus(downloadItem);

      } catch (error) {
        this._handleDownloadError(downloadItem, `Erreur de traitement des métadonnées: ${error.message}`);
      }
    });

    analyzeProcess.on('error', (error) => {
      this._handleDownloadError(downloadItem, `Erreur lors de l'analyse: ${error.message}`);
    });
  }

  /**
   * Traite la file d'attente des téléchargements
   * @private
   */
  _processQueue() {
    // Vérifier combien de téléchargements sont actifs
    const activeCount = Object.keys(this.activeDownloads).length;

    // Si on peut lancer plus de téléchargements
    if (activeCount < this.maxConcurrentDownloads) {
      // Chercher le prochain téléchargement ready ou pending
      const nextDownload = this.downloadQueue.find(item =>
        (item.status === 'ready' || item.status === 'pending')
      );

      // Si un téléchargement est disponible, le démarrer
      if (nextDownload) {
        // Démarrer le téléchargement
        this._startDownload(nextDownload);

        // Continuer à traiter la file d'attente (récursif)
        this._processQueue();
      }
    }
  }

  /**
   * Démarre un téléchargement spécifique
   * @private
   * @param {Object} downloadItem - Élément de téléchargement à démarrer
   */
  _startDownload(downloadItem) {
    // Vérifier l'état actuel
    if (downloadItem.status === 'downloading') {
      return; // Déjà en cours
    }

    // Vérifier la disponibilité des binaires
    if (!this.binaries.ytdlp || !this.binaries.ffmpeg) {
      this._handleDownloadError(downloadItem, 'Binaires requis non disponibles');
      return;
    }

    // Pour Tidal, vérifier si le binaire spécifique est disponible
    if (downloadItem.metadata.platform === 'tidal' && !this.binaries.tidalDownloader) {
      this._handleDownloadError(downloadItem, 'Support Tidal non disponible (binaire manquant)');
      return;
    }

    // Mettre à jour l'état
    downloadItem.status = 'downloading';
    downloadItem.startedAt = new Date();
    this._updateDownloadStatus(downloadItem);

    // Ajouter aux téléchargements actifs
    this.activeDownloads[downloadItem.id] = downloadItem;

    // Créer le dossier de sortie si nécessaire
    if (!fs.existsSync(downloadItem.outputPath)) {
      try {
        fs.mkdirSync(downloadItem.outputPath, { recursive: true });
      } catch (error) {
        this._handleDownloadError(downloadItem, `Impossible de créer le dossier de sortie: ${error.message}`);
        return;
      }
    }

    // Chemin temporaire pour les fichiers en cours de téléchargement
    const tempDir = path.join(app.getPath('temp'), '21byts', downloadItem.id);
    this.downloadPaths[downloadItem.id] = tempDir;

    try {
      fs.mkdirSync(tempDir, { recursive: true });
    } catch (error) {
      this._handleDownloadError(downloadItem, `Impossible de créer le dossier temporaire: ${error.message}`);
      return;
    }

    // Si c'est une playlist, traiter différemment
    if (downloadItem.isPlaylist) {
      this._startPlaylistDownload(downloadItem);
    } else {
      this._startSingleDownload(downloadItem);
    }
  }

  /**
   * Démarre le téléchargement d'un fichier unique
   * @private
   * @param {Object} downloadItem - Élément de téléchargement
   */
  _startSingleDownload(downloadItem) {
    const tempDir = this.downloadPaths[downloadItem.id];
    const tempFile = path.join(tempDir, `${crypto.randomUUID()}.%(ext)s`);

    // Options pour yt-dlp
    const args = [
      '--newline',                 // Facilite le parsing des sorties
      '--no-playlist',             // Pas de playlist
      '-f', 'bestaudio',           // Meilleure qualité audio
      '--add-metadata',            // Ajouter les métadonnées
      '--embed-thumbnail',         // Intégrer la miniature
      '--no-overwrites',           // Ne pas écraser les fichiers existants
      '-o', tempFile,              // Fichier de sortie
      downloadItem.url             // URL à télécharger
    ];

    // Ajouter la conversion si nécessaire
    if (downloadItem.format !== 'original') {
      args.push('--extract-audio');
      args.push('--audio-format', downloadItem.format);
      args.push('--audio-quality', '0'); // Meilleure qualité
    }

    this.eventBus.emit('LOG:DEBUG', {
      module: 'download-manager',
      message: `Démarrage du téléchargement: ${this.binaries.ytdlp} ${args.join(' ')}`
    });

    // Lancer le processus
    const downloadProcess = spawn(this.binaries.ytdlp, args);
    this.activeProcesses[downloadItem.id] = downloadProcess;

    let outputData = '';
    let lastProgressLine = '';
    let actualFilename = null;

    downloadProcess.stdout.on('data', (data) => {
      const output = data.toString();
      outputData += output;

      // Mise à jour de la progression
      const lines = output.split('\n');

      for (const line of lines) {
        // Ignorer les lignes vides
        if (!line.trim()) continue;

        // Capture du nom de fichier réel si disponible
        if (line.includes('Destination:')) {
          actualFilename = line.split('Destination:')[1].trim();
          continue;
        }

        // Seules les lignes avec pourcentage nous intéressent pour la progression
        if (line.includes('%')) {
          lastProgressLine = line;

          // Analyser la progression
          this._parseProgressLine(downloadItem, line);
        }
      }
    });

    downloadProcess.stderr.on('data', (data) => {
      const errorText = data.toString();
      this.eventBus.emit('LOG:WARNING', {
        module: 'download-manager',
        message: `Erreur potentielle: ${errorText}`
      });
    });

    downloadProcess.on('close', (code) => {
      // Supprimer de la liste des processus actifs
      delete this.activeProcesses[downloadItem.id];

      if (code !== 0) {
        // Erreur lors du téléchargement
        this._handleDownloadError(downloadItem, `Erreur de téléchargement (code ${code}): ${lastProgressLine}`);
        return;
      }

      // Trouver le fichier téléchargé
      const files = fs.readdirSync(tempDir);
      if (files.length === 0) {
        this._handleDownloadError(downloadItem, 'Aucun fichier téléchargé trouvé');
        return;
      }

      // Utiliser le nom de fichier capturé ou le premier fichier trouvé
      const downloadedFile = actualFilename ? path.basename(actualFilename) : files[0];
      const tempFilePath = path.join(tempDir, downloadedFile);

      // Construire le nom de fichier final
      const sanitizedTitle = this._sanitizeFilename(downloadItem.metadata.title);
      const sanitizedArtist = this._sanitizeFilename(downloadItem.metadata.artist);
      const extension = path.extname(downloadedFile);
      let finalFilename = `${sanitizedArtist} - ${sanitizedTitle}${extension}`;

      // Chemin de sortie final
      const finalPath = path.join(downloadItem.outputPath, finalFilename);

      // Copier le fichier vers la destination finale
      try {
        fs.copyFileSync(tempFilePath, finalPath);

        // Nettoyer les fichiers temporaires
        this._cleanupTempFiles(tempDir);

        // Marquer comme terminé
        downloadItem.status = 'completed';
        downloadItem.progress = 100;
        downloadItem.completedAt = new Date();

        // Notifier l'événement de complétion
        this.eventBus.emit('DOWNLOAD:COMPLETED', {
          downloadId: downloadItem.id,
          download: downloadItem,
          filePath: finalPath
        });

        // Mettre à jour l'historique
        this.downloadHistory.push({
          id: downloadItem.id,
          url: downloadItem.url,
          title: downloadItem.metadata.title,
          artist: downloadItem.metadata.artist,
          outputPath: finalPath,
          completedAt: downloadItem.completedAt
        });

        // Supprimer des téléchargements actifs
        delete this.activeDownloads[downloadItem.id];

        // Traiter le prochain téléchargement dans la file
        this._processQueue();

      } catch (error) {
        this._handleDownloadError(downloadItem, `Erreur lors de la finalisation: ${error.message}`);
      }
    });

    downloadProcess.on('error', (error) => {
      this._handleDownloadError(downloadItem, `Erreur du processus: ${error.message}`);
    });
  }

  /**
   * Démarre le téléchargement d'une playlist
   * @private
   * @param {Object} downloadItem - Élément de téléchargement
   */
  _startPlaylistDownload(downloadItem) {
    // Initialiser le suivi de progression
    let completedItems = 0;
    const totalItems = downloadItem.playlistItems.length;

    // Fonction pour télécharger le prochain élément de la playlist
    const downloadNextItem = (index) => {
      // Si tous les éléments sont traités
      if (index >= totalItems) {
        // Marquer la playlist comme terminée
        downloadItem.status = 'completed';
        downloadItem.progress = 100;
        downloadItem.completedAt = new Date();

        // Notifier l'événement de complétion
        this.eventBus.emit('DOWNLOAD:COMPLETED', {
          downloadId: downloadItem.id,
          download: downloadItem,
          isPlaylist: true,
          itemsCount: totalItems
        });

        // Supprimer des téléchargements actifs
        delete this.activeDownloads[downloadItem.id];

        // Traiter le prochain téléchargement dans la file
        this._processQueue();
        return;
      }

      // Récupérer l'élément de playlist actuel
      const playlistItem = downloadItem.playlistItems[index];

      // Mettre à jour le statut
      playlistItem.status = 'downloading';
      this._updateDownloadStatus(downloadItem, `Téléchargement ${index + 1}/${totalItems}: ${playlistItem.title}`);

      // Préparer le téléchargement de cet élément
      const tempDir = this.downloadPaths[downloadItem.id];
      const tempFile = path.join(tempDir, `${crypto.randomUUID()}.%(ext)s`);

      // Options pour yt-dlp
      const args = [
        '--newline',                 // Facilite le parsing des sorties
        '--no-playlist',             // Pas de playlist
        '-f', 'bestaudio',           // Meilleure qualité audio
        '--add-metadata',            // Ajouter les métadonnées
        '--embed-thumbnail',         // Intégrer la miniature
        '--no-overwrites',           // Ne pas écraser les fichiers existants
        '-o', tempFile,              // Fichier de sortie
        playlistItem.url             // URL de l'élément actuel
      ];

      // Ajouter la conversion si nécessaire
      if (downloadItem.format !== 'original') {
        args.push('--extract-audio');
        args.push('--audio-format', downloadItem.format);
        args.push('--audio-quality', '0'); // Meilleure qualité
      }

      // Lancer le processus
      const itemProcess = spawn(this.binaries.ytdlp, args);
      this.activeProcesses[`${downloadItem.id}_${index}`] = itemProcess;

      let outputData = '';
      let lastProgressLine = '';
      let actualFilename = null;

      itemProcess.stdout.on('data', (data) => {
        const output = data.toString();
        outputData += output;

        // Mise à jour de la progression
        const lines = output.split('\n');

        for (const line of lines) {
          // Ignorer les lignes vides
          if (!line.trim()) continue;

          // Capture du nom de fichier réel si disponible
          if (line.includes('Destination:')) {
            actualFilename = line.split('Destination:')[1].trim();
            continue;
          }

          // Seules les lignes avec pourcentage nous intéressent pour la progression
          if (line.includes('%')) {
            lastProgressLine = line;

            // Analyser la progression de cet élément
            const itemProgress = this._parseProgressLine(null, line);

            // Mettre à jour la progression de l'élément
            if (itemProgress !== null) {
              playlistItem.progress = itemProgress;

              // Calculer la progression globale de la playlist
              const totalProgress = downloadItem.playlistItems.reduce((sum, item) => sum + item.progress, 0) / totalItems;
              downloadItem.progress = Math.floor(totalProgress);

              // Émettre la mise à jour
              this._updateDownloadStatus(downloadItem, `Élément ${index + 1}/${totalItems}: ${itemProgress}%`);
            }
          }
        }
      });

      itemProcess.stderr.on('data', (data) => {
        const errorText = data.toString();
        this.eventBus.emit('LOG:WARNING', {
          module: 'download-manager',
          message: `Erreur potentielle (élément ${index + 1}): ${errorText}`
        });
      });

      itemProcess.on('close', (code) => {
        // Supprimer de la liste des processus actifs
        delete this.activeProcesses[`${downloadItem.id}_${index}`];

        if (code !== 0) {
          // Erreur lors du téléchargement de cet élément
          playlistItem.status = 'error';
          playlistItem.error = `Erreur (code ${code}): ${lastProgressLine}`;

          this.eventBus.emit('LOG:ERROR', {
            module: 'download-manager',
            message: `Échec du téléchargement de l'élément ${index + 1}/${totalItems}: ${playlistItem.title}`
          });

          // Continuer avec le prochain élément
          setTimeout(() => downloadNextItem(index + 1), 1000);
          return;
        }

        // Trouver le fichier téléchargé
        const files = fs.readdirSync(tempDir);
        const downloadedFiles = files.filter(f => fs.statSync(path.join(tempDir, f)).isFile() && f.includes(path.basename(tempFile.replace('%(ext)s', ''))));

        if (downloadedFiles.length === 0) {
          // Aucun fichier trouvé
          playlistItem.status = 'error';
          playlistItem.error = 'Aucun fichier téléchargé trouvé';

          // Continuer avec le prochain élément
          setTimeout(() => downloadNextItem(index + 1), 1000);
          return;
        }

        // Utiliser le nom de fichier capturé ou le premier fichier trouvé
        const downloadedFile = actualFilename ? path.basename(actualFilename) : downloadedFiles[0];
        const tempFilePath = path.join(tempDir, downloadedFile);

        // Construire le nom de fichier final
        const sanitizedTitle = this._sanitizeFilename(playlistItem.title);
        const sanitizedArtist = this._sanitizeFilename(playlistItem.artist || 'Unknown');
        const extension = path.extname(downloadedFile);
        let finalFilename = `${sanitizedArtist} - ${sanitizedTitle}${extension}`;

        // Sous-dossier pour la playlist
        const playlistDir = path.join(
          downloadItem.outputPath,
          this._sanitizeFilename(downloadItem.metadata.title || 'Playlist')
        );

        // Créer le sous-dossier si nécessaire
        if (!fs.existsSync(playlistDir)) {
          try {
            fs.mkdirSync(playlistDir, { recursive: true });
          } catch (error) {
            playlistItem.status = 'error';
            playlistItem.error = `Impossible de créer le dossier: ${error.message}`;

            // Continuer avec le prochain élément
            setTimeout(() => downloadNextItem(index + 1), 1000);
            return;
          }
        }

        // Chemin de sortie final
        const finalPath = path.join(playlistDir, finalFilename);

        // Copier le fichier vers la destination finale
        try {
          fs.copyFileSync(tempFilePath, finalPath);

          // Marquer comme terminé
          playlistItem.status = 'completed';
          playlistItem.progress = 100;
          completedItems++;

          // Mise à jour de la progression globale
          downloadItem.progress = Math.floor((completedItems / totalItems) * 100);

          // Notifier l'événement de complétion d'un élément
          this.eventBus.emit('DOWNLOAD:PLAYLIST_ITEM_COMPLETED', {
            downloadId: downloadItem.id,
            itemIndex: index,
            itemTitle: playlistItem.title,
            filePath: finalPath
          });

          // Passer au prochain élément
          setTimeout(() => downloadNextItem(index + 1), 1000);

        } catch (error) {
          // Erreur lors de la finalisation
          playlistItem.status = 'error';
          playlistItem.error = `Erreur lors de la finalisation: ${error.message}`;

          this.eventBus.emit('LOG:ERROR', {
            module: 'download-manager',
            message: `Erreur lors de la finalisation de l'élément ${index + 1}: ${error.message}`
          });

          // Continuer avec le prochain élément
          setTimeout(() => downloadNextItem(index + 1), 1000);
        }
      });

      itemProcess.on('error', (error) => {
        // Erreur du processus
        playlistItem.status = 'error';
        playlistItem.error = `Erreur du processus: ${error.message}`;

        this.eventBus.emit('LOG:ERROR', {
          module: 'download-manager',
          message: `Erreur de processus pour l'élément ${index + 1}: ${error.message}`
        });

        // Continuer avec le prochain élément
        setTimeout(() => downloadNextItem(index + 1), 1000);
      });
    };

    // Démarrer le téléchargement du premier élément
    downloadNextItem(0);
}
