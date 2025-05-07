/**
 * @fileoverview Module de gestion de téléchargement (core)
 * Cette version est indépendante du DOM et testable avec Jest
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');

let eventBus = null;

class DownloadManager {
  constructor(bus) {
    eventBus = bus;

    this.downloadQueue = [];
    this.activeDownloads = {};
    this.downloadHistory = [];
    this.maxConcurrentDownloads = 3;
    this.defaultOutputFormat = 'mp3';
    this.defaultOutputPath = os.homedir();
    this.downloadPaths = {};
    this.activeProcesses = {};
    this.binariesPath = this._resolveBinariesPath();

    this.binaries = {
      ytdlp: null,
      ffmpeg: null,
      tidalDownloader: null
    };

    this._registerEventListeners();
    this._validateBinaries();
  }

  _resolveBinariesPath() {
    const base = process.resourcesPath || path.resolve(__dirname, '../../../bin');
    if (process.platform === 'darwin') return path.join(base, 'macos');
    if (process.platform === 'win32') return path.join(base, 'windows');
    return path.join(base, 'linux');
  }

  _registerEventListeners() {
    eventBus.subscribe('CONFIG:LOADED', this._handleConfigLoaded.bind(this));
    eventBus.subscribe('DOWNLOAD:ADD', this._handleDownloadAdd.bind(this));
    eventBus.subscribe('DOWNLOAD:START_ALL', this._handleStartAll.bind(this));
    eventBus.subscribe('APP:WILL_CLOSE', this._handleAppWillClose.bind(this));
  }

  _validateBinaries() {
    const ext = process.platform === 'win32' ? '.exe' : '';

    const binariesToCheck = {
      ytdlp: path.join(this.binariesPath, `yt-dlp${ext}`),
      ffmpeg: path.join(this.binariesPath, `ffmpeg${ext}`),
      tidal: path.join(this.binariesPath, `tidal-downloader${ext}`)
    };

    Object.entries(binariesToCheck).forEach(([key, binaryPath]) => {
      this._checkBinary(binaryPath, '--version')
        .then(() => (this.binaries[key] = binaryPath))
        .catch((err) => {
          const level = key === 'tidal' ? 'LOG:WARNING' : 'ERROR:BINARY_MISSING';
          eventBus.publish(level, {
            module: 'download-manager',
            binary: key,
            path: binaryPath,
            error: err.message
          });
        });
    });
  }

  _checkBinary(binaryPath, versionFlag) {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(binaryPath)) return reject(new Error('Non trouvé'));
      try {
        fs.accessSync(binaryPath, fs.constants.X_OK);
      } catch {
        return reject(new Error('Non exécutable'));
      }
      const proc = spawn(binaryPath, [versionFlag]);
      let output = '';
      proc.stdout.on('data', (d) => (output += d.toString()));
      proc.stderr.on('data', (d) => (output += d.toString()));
      proc.on('close', (code) => (code === 0 ? resolve(output.trim()) : reject(new Error(output))));
      proc.on('error', reject);
    });
  }

  _handleConfigLoaded(config) {
    if (config.downloads) {
      this.maxConcurrentDownloads = config.downloads.maxConcurrent || this.maxConcurrentDownloads;
      this.defaultOutputFormat = config.downloads.defaultFormat || this.defaultOutputFormat;
      this.defaultOutputPath = config.downloads.outputPath || this.defaultOutputPath;
    }
  }

  _handleDownloadAdd({ url, format, outputPath }) {
    if (!url) {
      return eventBus.publish('ERROR:INVALID_PARAMS', {
        module: 'download-manager',
        function: 'handleDownloadAdd',
        message: 'URL manquante'
      });
    }

    const downloadId = crypto.randomUUID();
    const downloadItem = {
      id: downloadId,
      url,
      status: 'pending',
      progress: 0,
      format: format || this.defaultOutputFormat,
      outputPath: outputPath || this.defaultOutputPath,
      metadata: {},
      createdAt: new Date()
    };

    this.downloadQueue.push(downloadItem);
    eventBus.publish('DOWNLOAD:ADDED', { downloadId, download: downloadItem });

    this._analyzeDownload(downloadItem);
    this._processQueue();
  }

  _detectPlatformFromUrl(url) {
    const lower = url.toLowerCase();
    if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
    if (lower.includes('soundcloud.com')) return 'soundcloud';
    if (lower.includes('bandcamp.com')) return 'bandcamp';
    if (lower.includes('spotify.com')) return 'spotify';
    if (lower.includes('tidal.com')) return 'tidal';
    return 'unknown';
  }

  _analyzeDownload(downloadItem) {
    downloadItem.status = 'analyzing';
    this._updateDownloadStatus(downloadItem);

    if (!this.binaries.ytdlp) {
      return this._handleDownloadError(downloadItem, 'yt-dlp non disponible');
    }

    const args = ['--no-playlist', '--dump-json', downloadItem.url];
    const proc = spawn(this.binaries.ytdlp, args);
    let output = '',
      error = '';

    proc.stdout.on('data', (d) => (output += d.toString()));
    proc.stderr.on('data', (d) => (error += d.toString()));

    proc.on('close', (code) => {
      if (code !== 0) return this._handleDownloadError(downloadItem, `Erreur d’analyse: ${error}`);

      try {
        const data = JSON.parse(output);
        downloadItem.metadata = {
          title: data.title,
          artist: data.artist || data.uploader,
          duration: data.duration
        };
        downloadItem.status = 'ready';
        this._updateDownloadStatus(downloadItem);
      } catch (err) {
        this._handleDownloadError(downloadItem, 'Erreur parsing JSON');
      }
    });

    proc.on('error', (err) => this._handleDownloadError(downloadItem, err.message));
  }

  _processQueue() {
    const activeCount = Object.keys(this.activeDownloads).length;
    if (activeCount >= this.maxConcurrentDownloads) return;

    const next = this.downloadQueue.find((d) => d.status === 'ready');
    if (next) {
      this._startDownload(next);
    }
  }

  _startDownload(downloadItem) {
    downloadItem.status = 'downloading';
    downloadItem.startedAt = new Date();
    this._updateDownloadStatus(downloadItem);
    this.activeDownloads[downloadItem.id] = downloadItem;

    const tempDir = path.join(os.tmpdir(), '21byts', downloadItem.id);
    fs.mkdirSync(tempDir, { recursive: true });
    const outputTemplate = path.join(tempDir, `${crypto.randomUUID()}.%(ext)s`);

    const args = [
      '--newline',
      '-f',
      'bestaudio',
      '--extract-audio',
      '--audio-format',
      downloadItem.format,
      '-o',
      outputTemplate,
      downloadItem.url
    ];

    const proc = spawn(this.binaries.ytdlp, args);
    this.activeProcesses[downloadItem.id] = proc;

    proc.on('close', (code) => {
      delete this.activeProcesses[downloadItem.id];
      if (code !== 0) {
        return this._handleDownloadError(downloadItem, 'Erreur code ' + code);
      }

      const files = fs.readdirSync(tempDir);
      const final = files.find((f) => f.endsWith(`.${downloadItem.format}`));
      const outputPath = path.join(downloadItem.outputPath, final);
      fs.copyFileSync(path.join(tempDir, final), outputPath);

      downloadItem.status = 'completed';
      downloadItem.completedAt = new Date();
      eventBus.publish('DOWNLOAD:COMPLETED', {
        downloadId: downloadItem.id,
        download: downloadItem,
        filePath: outputPath
      });
      delete this.activeDownloads[downloadItem.id];
      this._processQueue();
    });

    proc.on('error', (err) => this._handleDownloadError(downloadItem, err.message));
  }

  _updateDownloadStatus(item, message) {
    eventBus.publish('DOWNLOAD:UPDATED', {
      downloadId: item.id,
      status: item.status,
      message: message || ''
    });
  }

  _handleDownloadError(item, msg) {
    item.status = 'error';
    item.error = msg;
    this._updateDownloadStatus(item, msg);
    delete this.activeDownloads[item.id];
    this._processQueue();
  }

  _handleStartAll() {
    this.downloadQueue.forEach((item) => {
      if (item.status === 'ready') this._startDownload(item);
    });
  }

  _handleAppWillClose() {
    Object.values(this.activeProcesses).forEach((proc) => {
      try {
        proc.kill();
      } catch {}
    });
  }
}

function initDownloadManager({ eventBus: bus }) {
  return new DownloadManager(bus);
}

module.exports = {
  initDownloadManager
};
