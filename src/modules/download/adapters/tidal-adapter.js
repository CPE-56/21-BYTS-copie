/**
 * @fileoverview Adaptateur pour la plateforme Tidal, permettant de télécharger des fichiers audio.
 * @module modules/download/adapters/tidal-adapter
 *
 * @description
 * Ce module gère l'intégration avec Tidal via OAuth et Tidal-Media-Downloader-PRO.
 * Il permet l'authentification, la récupération des métadonnées et le téléchargement
 * de fichiers audio depuis la plateforme Tidal.
 *
 * @requires electron
 * @requires child_process
 * @requires crypto
 * @requires path
 * @requires fs
 *
 * @events
 * ÉCOUTE:
 * - ADAPTER_REGISTER: S'enregistre auprès du système
 * - DOWNLOAD_REQUEST_TIDAL: Demande de téléchargement pour un média Tidal
 * - AUTH_TOKEN_REQUEST_TIDAL: Demande de récupération du token d'authentification
 * - AUTH_LOGOUT_TIDAL: Demande de déconnexion
 * - CONFIG_UPDATED: Mise à jour de la configuration
 *
 * ÉMET:
 * - ADAPTER_REGISTERED: Confirmation de l'enregistrement de l'adaptateur
 * - DOWNLOAD_STARTED: Téléchargement démarré
 * - DOWNLOAD_PROGRESS: Progression du téléchargement
 * - DOWNLOAD_COMPLETE: Téléchargement terminé
 * - DOWNLOAD_ERROR: Erreur lors du téléchargement
 * - METADATA_EXTRACTED: Métadonnées extraites
 * - AUTH_TOKEN_READY: Token d'authentification prêt
 * - AUTH_REQUIRED: Authentification requise
 * - AUTH_SUCCESS: Authentification réussie
 * - AUTH_FAILURE: Échec de l'authentification
 * - ERROR: Erreur générale
 *
 * @example
 * // Ce module est chargé automatiquement et communique via des événements.
 * // Exemple d'utilisation depuis un autre module:
 * //
 * // eventBus.emit('DOWNLOAD_REQUEST_TIDAL', {
 * //   url: 'https://tidal.com/browse/track/12345678',
 * //   format: 'FLAC',
 * //   outputPath: '/chemin/vers/dossier'
 * // });
 */

// Dépendances externes (Node.js/Electron)
const { BrowserWindow, shell } = require('electron');
const { execFile } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Adaptateur Tidal qui gère les téléchargements via Tidal-Media-Downloader-PRO
 */
class TidalAdapter {
  /**
   * Crée une instance de TidalAdapter.
   */
  constructor() {
    this.authWindow = null;
    this.authInProgress = false;
    this.tidalDownloaderPath = null;
    this.tidalConfig = null;
    this.downloadQueue = new Map();
    this.tokenData = null;
    this.encryptionKey = null;
    this.tempDir = path.join(os.tmpdir(), '21byts-tidal');
  }

  /**
   * Initialise l'adaptateur et s'abonne aux événements
   * @param {Object} eventBus - Le bus d'événements central
   */
  initialize(eventBus) {
    if (!eventBus) {
      console.error("TidalAdapter: eventBus est requis pour l'initialisation");
      return;
    }

    this.eventBus = eventBus;

    // Création du répertoire temporaire si nécessaire
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    // Génération d'une clé d'encryption si elle n'existe pas
    this.generateEncryptionKey();

    // Écoute des événements
    this.eventBus.on('ADAPTER_REGISTER', this.handleAdapterRegister.bind(this));
    this.eventBus.on('DOWNLOAD_REQUEST_TIDAL', this.handleDownloadRequest.bind(this));
    this.eventBus.on('AUTH_TOKEN_REQUEST_TIDAL', this.handleAuthTokenRequest.bind(this));
    this.eventBus.on('AUTH_LOGOUT_TIDAL', this.handleLogout.bind(this));
    this.eventBus.on('CONFIG_UPDATED', this.handleConfigUpdate.bind(this));

    // Notification que l'adaptateur est prêt
    this.eventBus.emit('ADAPTER_REGISTERED', {
      platform: 'tidal',
      capabilities: ['streaming', 'download', 'metadata'],
      formats: ['FLAC', 'AAC', 'MP3'],
      requiresAuth: true
    });
  }

  /**
   * Gère l'enregistrement de l'adaptateur auprès du système
   * @param {Object} data - Données d'enregistrement
   */
  handleAdapterRegister(data) {
    if (data.all || data.platform === 'tidal') {
      // Demande de la configuration
      this.eventBus.emit('CONFIG_REQUEST', {
        module: 'tidal-adapter',
        keys: ['tidalDownloaderPath', 'tidalApiSettings']
      });
    }
  }

  /**
   * Gère la mise à jour de la configuration
   * @param {Object} config - Nouvelle configuration
   */
  handleConfigUpdate(config) {
    if (config && config.module === 'tidal-adapter') {
      this.tidalConfig = config.data.tidalApiSettings;
      this.tidalDownloaderPath = config.data.tidalDownloaderPath;

      // Vérification de l'installation du downloader
      this.checkDownloaderInstallation();
    }
  }

  /**
   * Vérifie que le downloader Tidal est correctement installé
   */
  checkDownloaderInstallation() {
    if (!this.tidalDownloaderPath || !fs.existsSync(this.tidalDownloaderPath)) {
      this.eventBus.emit('ERROR', {
        module: 'tidal-adapter',
        code: 'TIDAL_DOWNLOADER_MISSING',
        message: 'Tidal Media Downloader non trouvé',
        details: {
          path: this.tidalDownloaderPath
        }
      });
      return false;
    }
    return true;
  }

  /**
   * Gère une demande de téléchargement
   * @param {Object} request - Requête de téléchargement
   */
  handleDownloadRequest(request) {
    const { url, format, outputPath, quality, metadata } = request;

    // Validation de l'URL Tidal
    if (!this.isValidTidalUrl(url)) {
      this.eventBus.emit('DOWNLOAD_ERROR', {
        url,
        error: 'URL Tidal invalide',
        code: 'INVALID_URL'
      });
      return;
    }

    // Vérification de l'authentification
    this.checkAuthentication()
      .then((isAuthenticated) => {
        if (!isAuthenticated) {
          this.eventBus.emit('AUTH_REQUIRED', { platform: 'tidal' });
          return;
        }

        // Extraction de l'ID de la ressource Tidal
        const tidalId = this.extractTidalId(url);
        const tidalType = this.getTidalResourceType(url);

        // Génération d'un ID de téléchargement unique
        const downloadId = crypto.randomUUID();

        // Enregistrement dans la file d'attente
        this.downloadQueue.set(downloadId, {
          id: downloadId,
          url,
          tidalId,
          tidalType,
          format: format || 'FLAC',
          quality: quality || 'HiFi',
          outputPath: outputPath || this.getDefaultOutputPath(),
          metadata: metadata || {},
          progress: 0,
          status: 'pending'
        });

        // Notification du démarrage
        this.eventBus.emit('DOWNLOAD_STARTED', {
          id: downloadId,
          url,
          platform: 'tidal'
        });

        // Extraction des métadonnées
        this.extractMetadata(tidalId, tidalType)
          .then((metadata) => {
            const download = this.downloadQueue.get(downloadId);
            download.metadata = { ...download.metadata, ...metadata };
            this.downloadQueue.set(downloadId, download);

            this.eventBus.emit('METADATA_EXTRACTED', {
              id: downloadId,
              metadata
            });

            // Lancement du téléchargement
            this.startDownload(downloadId);
          })
          .catch((error) => {
            this.eventBus.emit('DOWNLOAD_ERROR', {
              id: downloadId,
              error: "Erreur d'extraction des métadonnées",
              details: error.message
            });
          });
      })
      .catch((error) => {
        this.eventBus.emit('ERROR', {
          module: 'tidal-adapter',
          error: "Erreur de vérification d'authentification",
          details: error.message
        });
      });
  }

  /**
   * Démarre le téléchargement d'un média Tidal
   * @param {string} downloadId - ID du téléchargement
   */
  startDownload(downloadId) {
    const download = this.downloadQueue.get(downloadId);
    if (!download) {
      this.eventBus.emit('ERROR', {
        module: 'tidal-adapter',
        error: 'Téléchargement introuvable',
        details: { downloadId }
      });
      return;
    }

    // Mise à jour du statut
    download.status = 'downloading';
    this.downloadQueue.set(downloadId, download);

    // Préparation des arguments pour le downloader
    const args = [
      '--id',
      download.tidalId,
      '--type',
      download.tidalType,
      '--format',
      download.format,
      '--output',
      download.outputPath,
      '--quality',
      download.quality,
      '--token',
      this.getDecryptedToken()
    ];

    if (download.metadata.album) {
      args.push('--album-folder');
    }

    // Démarrage du processus de téléchargement
    const process = execFile(this.tidalDownloaderPath, args, {
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });

    let stdoutData = '';
    let stderrData = '';

    process.stdout.on('data', (data) => {
      stdoutData += data.toString();
      this.parseProgressOutput(downloadId, stdoutData);
    });

    process.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        // Téléchargement réussi
        download.status = 'completed';
        download.progress = 100;
        this.downloadQueue.set(downloadId, download);

        // Recherche du fichier téléchargé
        const filePath = this.findDownloadedFile(download);

        this.eventBus.emit('DOWNLOAD_COMPLETE', {
          id: downloadId,
          url: download.url,
          filePath,
          metadata: download.metadata
        });
      } else {
        // Erreur de téléchargement
        download.status = 'error';
        this.downloadQueue.set(downloadId, download);

        const errorMessage = stderrData || `Erreur de téléchargement (code ${code})`;
        this.eventBus.emit('DOWNLOAD_ERROR', {
          id: downloadId,
          error: errorMessage,
          code: `TIDAL_DOWNLOAD_ERROR_${code}`
        });
      }
    });

    process.on('error', (error) => {
      download.status = 'error';
      this.downloadQueue.set(downloadId, download);

      this.eventBus.emit('DOWNLOAD_ERROR', {
        id: downloadId,
        error: `Erreur d'exécution: ${error.message}`,
        code: 'TIDAL_PROCESS_ERROR'
      });
    });
  }

  /**
   * Analyse la sortie du downloader pour extraire la progression
   * @param {string} downloadId - ID du téléchargement
   * @param {string} output - Sortie du processus de téléchargement
   */
  parseProgressOutput(downloadId, output) {
    const download = this.downloadQueue.get(downloadId);
    if (!download) return;

    // Exemple de pattern pour capturer la progression: "Downloading: 45%"
    const progressMatch = output.match(/Downloading:\s+(\d+)%/);
    if (progressMatch && progressMatch[1]) {
      const newProgress = parseInt(progressMatch[1], 10);

      // Ne mettre à jour que si la progression a changé
      if (newProgress !== download.progress) {
        download.progress = newProgress;
        this.downloadQueue.set(downloadId, download);

        this.eventBus.emit('DOWNLOAD_PROGRESS', {
          id: downloadId,
          progress: newProgress
        });
      }
    }
  }

  /**
   * Trouve le fichier téléchargé sur le disque
   * @param {Object} download - Informations du téléchargement
   * @returns {string} Chemin du fichier téléchargé
   */
  findDownloadedFile(download) {
    // Construction du chemin probable du fichier basé sur les métadonnées
    let fileName = '';

    if (download.metadata.artist && download.metadata.title) {
      fileName = `${download.metadata.artist} - ${download.metadata.title}`;
    } else {
      fileName = `TIDAL-${download.tidalId}`;
    }

    // Ajout de l'extension selon le format
    const extension = download.format.toLowerCase();
    if (!fileName.endsWith(`.${extension}`)) {
      fileName += `.${extension}`;
    }

    const filePath = path.join(download.outputPath, fileName);

    // Vérification de l'existence du fichier
    if (fs.existsSync(filePath)) {
      return filePath;
    }

    // Si le fichier exact n'est pas trouvé, chercher dans le dossier
    // pour tout fichier correspondant au format
    try {
      const files = fs.readdirSync(download.outputPath);
      const matchingFiles = files.filter(
        (file) => file.includes(download.tidalId) && file.endsWith(`.${extension}`)
      );

      if (matchingFiles.length > 0) {
        return path.join(download.outputPath, matchingFiles[0]);
      }
    } catch (error) {
      console.error('Erreur lors de la recherche du fichier:', error);
    }

    // Par défaut, retourner le chemin attendu même s'il n'existe pas
    return filePath;
  }

  /**
   * Extrait les métadonnées d'une ressource Tidal
   * @param {string} tidalId - ID de la ressource Tidal
   * @param {string} tidalType - Type de ressource (track, album, playlist)
   * @returns {Promise<Object>} Métadonnées extraites
   */
  extractMetadata(tidalId, tidalType) {
    return new Promise((resolve, reject) => {
      // Préparation des arguments pour l'extraction des métadonnées
      const args = [
        '--id',
        tidalId,
        '--type',
        tidalType,
        '--token',
        this.getDecryptedToken(),
        '--info-only'
      ];

      // Exécution du processus d'extraction des métadonnées
      const process = execFile(this.tidalDownloaderPath, args, {
        maxBuffer: 1024 * 1024 // 1MB buffer
      });

      let stdoutData = '';
      let stderrData = '';

      process.stdout.on('data', (data) => {
        stdoutData += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderrData += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          // Analyse des métadonnées depuis la sortie
          const metadata = this.parseMetadataOutput(stdoutData);
          resolve(metadata);
        } else {
          reject(new Error(stderrData || `Erreur d'extraction des métadonnées (code ${code})`));
        }
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Analyse les métadonnées depuis la sortie du downloader
   * @param {string} output - Sortie du processus
   * @returns {Object} Métadonnées structurées
   */
  parseMetadataOutput(output) {
    const metadata = {
      title: '',
      artist: '',
      album: '',
      releaseDate: '',
      duration: 0,
      coverUrl: '',
      quality: ''
    };

    // Extraction du titre
    const titleMatch = output.match(/Titre\s*:\s*(.+)/i) || output.match(/Title\s*:\s*(.+)/i);
    if (titleMatch && titleMatch[1]) {
      metadata.title = titleMatch[1].trim();
    }

    // Extraction de l'artiste
    const artistMatch = output.match(/Artiste\s*:\s*(.+)/i) || output.match(/Artist\s*:\s*(.+)/i);
    if (artistMatch && artistMatch[1]) {
      metadata.artist = artistMatch[1].trim();
    }

    // Extraction de l'album
    const albumMatch = output.match(/Album\s*:\s*(.+)/i);
    if (albumMatch && albumMatch[1]) {
      metadata.album = albumMatch[1].trim();
    }

    // Extraction de la date de sortie
    const dateMatch =
      output.match(/Date\s*:\s*(.+)/i) || output.match(/Release\s*date\s*:\s*(.+)/i);
    if (dateMatch && dateMatch[1]) {
      metadata.releaseDate = dateMatch[1].trim();
    }

    // Extraction de la durée
    const durationMatch =
      output.match(/Durée\s*:\s*(\d+:\d+)/i) || output.match(/Duration\s*:\s*(\d+:\d+)/i);
    if (durationMatch && durationMatch[1]) {
      const [minutes, seconds] = durationMatch[1].split(':').map(Number);
      metadata.duration = minutes * 60 + seconds;
    }

    // Extraction de l'URL de la pochette
    const coverMatch = output.match(/Cover\s*:\s*(https?:\/\/[^\s]+)/i);
    if (coverMatch && coverMatch[1]) {
      metadata.coverUrl = coverMatch[1].trim();
    }

    // Extraction de la qualité
    const qualityMatch = output.match(/Quality\s*:\s*(.+)/i);
    if (qualityMatch && qualityMatch[1]) {
      metadata.quality = qualityMatch[1].trim();
    }

    return metadata;
  }

  /**
   * Gère une demande de récupération du token d'authentification
   */
  handleAuthTokenRequest() {
    this.checkAuthentication()
      .then((isAuthenticated) => {
        if (isAuthenticated) {
          this.eventBus.emit('AUTH_TOKEN_READY', {
            platform: 'tidal',
            isValid: true
          });
        } else {
          this.initiateOAuthAuthentication();
        }
      })
      .catch((error) => {
        this.eventBus.emit('ERROR', {
          module: 'tidal-adapter',
          error: 'Erreur de vérification du token',
          details: error.message
        });
      });
  }

  /**
   * Vérifie si l'utilisateur est authentifié
   * @returns {Promise<boolean>} True si l'utilisateur est authentifié
   */
  checkAuthentication() {
    return new Promise((resolve) => {
      // Si nous n'avons pas de token, pas authentifié
      if (!this.tokenData) {
        // Essayer de charger le token depuis la configuration
        this.eventBus.emit('CONFIG_REQUEST', {
          module: 'tidal-adapter',
          keys: ['tidalTokenData']
        });

        // On attend un peu pour voir si on reçoit la config
        setTimeout(() => {
          if (!this.tokenData) {
            resolve(false);
            return;
          }

          // Vérifier la validité du token (expiration)
          try {
            const token = this.getDecryptedToken();
            if (!token) {
              resolve(false);
              return;
            }

            // Vérifier l'expiration
            const expiryDate = new Date(this.tokenData.expiresAt);
            const now = new Date();

            if (expiryDate <= now) {
              // Token expiré, essayer le refresh
              this.refreshToken()
                .then((success) => resolve(success))
                .catch(() => resolve(false));
            } else {
              // Token valide
              resolve(true);
            }
          } catch (error) {
            resolve(false);
          }
        }, 500);
      } else {
        // Vérifier l'expiration du token
        const expiryDate = new Date(this.tokenData.expiresAt);
        const now = new Date();

        if (expiryDate <= now) {
          // Token expiré, essayer le refresh
          this.refreshToken()
            .then((success) => resolve(success))
            .catch(() => resolve(false));
        } else {
          // Token valide
          resolve(true);
        }
      }
    });
  }

  /**
   * Rafraîchit le token d'authentification
   * @returns {Promise<boolean>} True si le refresh a réussi
   */
  refreshToken() {
    return new Promise((resolve, reject) => {
      if (!this.tokenData || !this.tokenData.refreshToken) {
        reject(new Error('Pas de refresh token disponible'));
        return;
      }

      // On pourrait utiliser le downloader pour rafraîchir le token
      // ou une requête HTTP directe à l'API Tidal

      // Exemple avec le downloader:
      const args = ['--refresh-token', this.tokenData.refreshToken];

      const process = execFile(this.tidalDownloaderPath, args);

      let stdoutData = '';
      let stderrData = '';

      process.stdout.on('data', (data) => {
        stdoutData += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderrData += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          // Analyse de la sortie pour extraire le nouveau token
          try {
            const tokenMatch = stdoutData.match(/Token\s*:\s*([^\s]+)/i);
            const expiryMatch = stdoutData.match(/Expires\s*:\s*(\d+)/i);

            if (tokenMatch && tokenMatch[1] && expiryMatch && expiryMatch[1]) {
              const newToken = tokenMatch[1].trim();
              const expiresIn = parseInt(expiryMatch[1], 10);

              const expiresAt = new Date();
              expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);

              this.tokenData = {
                ...this.tokenData,
                accessToken: this.encryptToken(newToken),
                expiresAt: expiresAt.toISOString()
              };

              // Sauvegarder le nouveau token
              this.saveTokenToConfig();

              resolve(true);
            } else {
              reject(new Error('Format de token invalide dans la réponse'));
            }
          } catch (error) {
            reject(error);
          }
        } else {
          reject(new Error(stderrData || `Erreur de rafraîchissement du token (code ${code})`));
        }
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Initie le processus d'authentification OAuth
   */
  initiateOAuthAuthentication() {
    if (this.authInProgress) {
      return;
    }

    this.authInProgress = true;

    // Création d'une fenêtre pour l'authentification
    this.authWindow = new BrowserWindow({
      width: 800,
      height: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    // Préparation des arguments pour générer le code de vérification
    const args = ['--auth-url-only'];

    // Exécution du downloader pour obtenir l'URL d'authentification
    const process = execFile(this.tidalDownloaderPath, args);

    let stdoutData = '';
    let authUrl = '';
    let verificationCode = '';

    process.stdout.on('data', (data) => {
      stdoutData += data.toString();

      // Extraction de l'URL d'authentification
      const urlMatch = stdoutData.match(/URL\s*:\s*(https?:\/\/[^\s]+)/i);
      if (urlMatch && urlMatch[1] && !authUrl) {
        authUrl = urlMatch[1].trim();

        // Extraction du code de vérification
        const codeMatch = stdoutData.match(/Code\s*:\s*([A-Z0-9]+)/i);
        if (codeMatch && codeMatch[1]) {
          verificationCode = codeMatch[1].trim();

          // Ouverture de l'URL d'authentification
          this.authWindow.loadURL(authUrl);

          // Attendre que la page soit chargée pour insérer le code
          this.authWindow.webContents.on('did-finish-load', () => {
            // Injection de script pour remplir automatiquement le champ de code
            this.authWindow.webContents.executeJavaScript(`
              setTimeout(() => {
                const codeInput = document.querySelector('input[name="code"]');
                if (codeInput) {
                  codeInput.value = "${verificationCode}";

                  // Simuler un clic sur le bouton de soumission
                  const submitButton = document.querySelector('button[type="submit"]');
                  if (submitButton) {
                    submitButton.click();
                  }
                }
              }, 1000);
            `);
          });

          // Surveiller les redirections pour détecter la fin de l'authentification
          this.authWindow.webContents.on('will-navigate', (event, url) => {
            if (url.includes('tidal.com/success') || url.includes('tidal://login/success')) {
              // L'authentification a réussi, récupérer le token
              this.retrieveToken();
            }
          });
        }
      }
    });

    process.on('error', (error) => {
      this.authInProgress = false;

      if (this.authWindow) {
        this.authWindow.close();
        this.authWindow = null;
      }

      this.eventBus.emit('AUTH_FAILURE', {
        platform: 'tidal',
        error: error.message
      });
    });

    // Gestion de la fermeture de la fenêtre
    this.authWindow.on('closed', () => {
      this.authWindow = null;

      if (this.authInProgress) {
        this.authInProgress = false;
        this.eventBus.emit('AUTH_FAILURE', {
          platform: 'tidal',
          error: "Authentification annulée par l'utilisateur"
        });
      }
    });
  }

  /**
   * Récupère le token après une authentification réussie
   */
  retrieveToken() {
    if (this.authWindow) {
      this.authWindow.close();
      this.authWindow = null;
    }

    // Exécution du downloader pour récupérer le token
    const args = ['--check-auth'];

    const process = execFile(this.tidalDownloaderPath, args);

    let stdoutData = '';
    let stderrData = '';

    process.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    process.on('close', (code) => {
      this.authInProgress = false;

      if (code === 0) {
        // Extraction du token et de sa durée de validité
        try {
          const tokenMatch = stdoutData.match(/Token\s*:\s*([^\s]+)/i);
          const refreshMatch = stdoutData.match(/Refresh\s*:\s*([^\s]+)/i);
          const expiryMatch = stdoutData.match(/Expires\s*:\s*(\d+)/i);

          if (tokenMatch && tokenMatch[1] && expiryMatch && expiryMatch[1]) {
            const token = tokenMatch[1].trim();
            const refreshToken = refreshMatch && refreshMatch[1] ? refreshMatch[1].trim() : null;
            const expiresIn = parseInt(expiryMatch[1], 10);

            const expiresAt = new Date();
            expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);

            this.tokenData = {
              accessToken: this.encryptToken(token),
              refreshToken: refreshToken ? this.encryptToken(refreshToken) : null,
              expiresAt: expiresAt.toISOString()
            };

            // Sauvegarder le token
            this.saveTokenToConfig();

            this.eventBus.emit('AUTH_SUCCESS', {
              platform: 'tidal'
            });
          } else {
            this.eventBus.emit('AUTH_FAILURE', {
              platform: 'tidal',
              error: 'Token non trouvé dans la réponse'
            });
          }
        } catch (error) {
          this.eventBus.emit('AUTH_FAILURE', {
            platform: 'tidal',
            error: `Erreur de traitement du token: ${error.message}`
          });
        }
      } else {
        this.eventBus.emit('AUTH_FAILURE', {
          platform: 'tidal',
          error: stderrData || `Erreur de récupération du token (code ${code})`
        });
      }
    });

    process.on('error', (error) => {
      this.authInProgress = false;
      this.eventBus.emit('AUTH_FAILURE', {
        platform: 'tidal',
        error: `Erreur d'exécution: ${error.message}`
      });
    });
  }

  /**
   * Gère une demande de déconnexion
   */
  handleLogout() {
    this.tokenData = null;

    // Supprimer le token de la configuration
    this.eventBus.emit('CONFIG_UPDATE', {
      module: 'tidal-adapter',
      data: {
        tidalTokenData: null
      }
    });

    this.eventBus.emit('AUTH_LOGOUT_COMPLETE', {
      platform: 'tidal'
    });
  }

  /**
   * Sauvegarde le token dans la configuration
   */
  saveTokenToConfig() {
    if (this.tokenData) {
      this.eventBus.emit('CONFIG_UPDATE', {
        module: 'tidal-adapter',
        data: {
          tidalTokenData: this.tokenData
        }
      });
    }
  }

  /**
   * Génère une clé d'encryption pour sécuriser les tokens
   */
  generateEncryptionKey() {
    // Utiliser une clé existante si disponible
    this.eventBus.emit('CONFIG_REQUEST', {
      module: 'tidal-adapter',
      keys: ['tidalEncryptionKey']
    });

    // Si pas de clé après un délai, en générer une nouvelle
    setTimeout(() => {
      if (!this.encryptionKey) {
        this.encryptionKey = crypto.randomBytes(32).toString('hex');

        // Sauvegarder la clé
        this.eventBus.emit('CONFIG_UPDATE', {
          module: 'tidal-adapter',
          data: {
            tidalEncryptionKey: this.encryptionKey
          }
        });
      }
    }, 500);
  }

  /**
   * Chiffre un token avec AES-256
   * @param {string} token - Token à chiffrer
   * @returns {string} Token chiffré (format Base64)
   */
  encryptToken(token) {
    if (!token) return null;
    if (!this.encryptionKey) {
      this.eventBus.emit('ERROR', {
        module: 'tidal-adapter',
        error: "Clé d'encryption non disponible",
        code: 'ENCRYPTION_KEY_MISSING'
      });
      return null;
    }

    try {
      const iv = crypto.randomBytes(16);
      const key = Buffer.from(this.encryptionKey, 'hex');
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

      let encrypted = cipher.update(token, 'utf8', 'base64');
      encrypted += cipher.final('base64');

      // Stocker l'IV avec le texte chiffré
      return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
      this.eventBus.emit('ERROR', {
        module: 'tidal-adapter',
        error: `Erreur de chiffrement: ${error.message}`,
        code: 'ENCRYPTION_ERROR'
      });
      return null;
    }
  }

  /**
   * Déchiffre un token avec AES-256
   * @param {string} encryptedToken - Token chiffré (format Base64 avec IV)
   * @returns {string} Token déchiffré
   */
  decryptToken(encryptedToken) {
    if (!encryptedToken) return null;
    if (!this.encryptionKey) {
      this.eventBus.emit('ERROR', {
        module: 'tidal-adapter',
        error: "Clé d'encryption non disponible",
        code: 'ENCRYPTION_KEY_MISSING'
      });
      return null;
    }

    try {
      const [ivHex, encrypted] = encryptedToken.split(':');
      if (!ivHex || !encrypted) {
        throw new Error('Format de token invalide');
      }

      const iv = Buffer.from(ivHex, 'hex');
      const key = Buffer.from(this.encryptionKey, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

      let decrypted = decipher.update(encrypted, 'base64', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      this.eventBus.emit('ERROR', {
        module: 'tidal-adapter',
        error: `Erreur de déchiffrement: ${error.message}`,
        code: 'DECRYPTION_ERROR'
      });
      return null;
    }
  }

  /**
   * Obtient le token déchiffré
   * @returns {string} Token d'accès déchiffré
   */
  getDecryptedToken() {
    if (!this.tokenData || !this.tokenData.accessToken) {
      return null;
    }

    return this.decryptToken(this.tokenData.accessToken);
  }

  /**
   * Vérifie si une URL est une URL Tidal valide
   * @param {string} url - URL à vérifier
   * @returns {boolean} True si l'URL est valide
   */
  isValidTidalUrl(url) {
    if (!url || typeof url !== 'string') {
      return false;
    }

    // Vérification des patterns d'URL Tidal
    const tidalPatterns = [
      /^https?:\/\/(?:listen|www|play)\.tidal\.com\/(?:track|album|playlist|artist)\/(\d+)/i,
      /^tidal:\/\/(?:track|album|playlist|artist)\/(\d+)/i
    ];

    return tidalPatterns.some((pattern) => pattern.test(url));
  }

  /**
   * Extrait l'ID d'une ressource Tidal depuis son URL
   * @param {string} url - URL Tidal
   * @returns {string} ID de la ressource
   */
  extractTidalId(url) {
    if (!url) return null;

    // Extraction depuis les patterns d'URL standards
    const standardMatch = url.match(/(?:track|album|playlist|artist)\/(\d+)/i);
    if (standardMatch && standardMatch[1]) {
      return standardMatch[1];
    }

    return null;
  }

  /**
   * Détermine le type de ressource Tidal (track, album, playlist, artist)
   * @param {string} url - URL Tidal
   * @returns {string} Type de ressource
   */
  getTidalResourceType(url) {
    if (!url) return 'track';

    // Détection du type de ressource
    if (url.includes('/track/')) {
      return 'track';
    } else if (url.includes('/album/')) {
      return 'album';
    } else if (url.includes('/playlist/')) {
      return 'playlist';
    } else if (url.includes('/artist/')) {
      return 'artist';
    }

    // Par défaut, considérer comme une piste
    return 'track';
  }

  /**
   * Obtient le chemin de sortie par défaut
   * @returns {string} Chemin de sortie par défaut
   */
  getDefaultOutputPath() {
    // Utiliser le répertoire de musique par défaut selon l'OS
    const homeDir = os.homedir();
    let musicDir;

    switch (os.platform()) {
      case 'win32':
        musicDir = path.join(homeDir, 'Music');
        break;
      case 'darwin':
        musicDir = path.join(homeDir, 'Music');
        break;
      default: // Linux et autres
        musicDir = path.join(homeDir, 'Music');
        break;
    }

    // Création du dossier 21BYTS si nécessaire
    const outputDir = path.join(musicDir, '21BYTS');
    if (!fs.existsSync(outputDir)) {
      try {
        fs.mkdirSync(outputDir, { recursive: true });
      } catch (error) {
        console.error('Erreur lors de la création du dossier de sortie:', error);
        return musicDir; // Fallback sur le dossier Music
      }
    }

    return outputDir;
  }
}

// Initialisation du module
let tidalAdapter = null;

/**
 * Fonction d'initialisation qui sera appelée par le système
 * Crée l'adaptateur Tidal et s'enregistre auprès du bus d'événements
 *
 * @param {Object} eventBus - Le bus d'événements central
 */
function initializeTidalAdapter(eventBus) {
  if (!eventBus) {
    console.error("TidalAdapter: eventBus est requis pour l'initialisation");
    return;
  }

  if (!tidalAdapter) {
    tidalAdapter = new TidalAdapter();
    tidalAdapter.initialize(eventBus);

    console.log('TidalAdapter: Adaptateur Tidal initialisé');
  }
}

// Export de la fonction d'initialisation
module.exports = {
  initialize: initializeTidalAdapter
}; // Adaptateur pour Tidal
// Créé automatiquement le 2025-05-02
