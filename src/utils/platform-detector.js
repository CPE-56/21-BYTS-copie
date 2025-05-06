/**
 * @fileoverview Platform Detector Module
 *
 * Ce module détecte la plateforme sur laquelle l'application est exécutée
 * et publie ces informations sur le bus d'événements.
 * Il fonctionne de manière totalement autonome sans dépendances directes
 * sur d'autres modules du projet.
 *
 * @module utils/platform-detector
 *
 * Événements écoutés:
 * - APP_INITIALIZED: Déclenche la détection initiale de la plateforme
 * - PLATFORM_DETECTION_REQUESTED: Force une nouvelle détection
 *
 * Événements émis:
 * - PLATFORM_DETECTED: Publié avec les détails de la plateforme
 * - ERROR: En cas d'erreur lors de la détection
 *
 * @example
 * // Ce module s'initialise automatiquement lors du chargement
 * // Pour forcer une nouvelle détection, émettez:
 * // eventBus.emit('PLATFORM_DETECTION_REQUESTED');
 * //
 * // Pour réagir aux données de plateforme:
 * // eventBus.on('PLATFORM_DETECTED', (platformInfo) => {
 * //   console.log(`OS: ${platformInfo.os}, Architecture: ${platformInfo.arch}`);
 * // });
 */

'use strict';

// Fonction d'initialisation principale - expose le module
function initPlatformDetector(eventBus) {
  if (!eventBus) {
    console.error('PlatformDetector: EventBus non fourni');
    return;
  }

  // Variables privées
  let isInitialized = false;
  // eslint-disable-next-line no-unused-vars
  let lastDetectionResult = null;

  /**
   * Détecte la plateforme et les caractéristiques du système
   * @returns {Object} Les informations de plateforme
   */
  function detectPlatform() {
    try {
      const os = require('os');

      // Informations système basiques
      const platformInfo = {
        os: process.platform, // 'darwin', 'win32', 'linux', etc.
        arch: process.arch, // 'x64', 'arm64', etc.
        release: os.release(),
        hostname: os.hostname(),
        username: os.userInfo().username,
        homedir: os.homedir(),
        tempdir: os.tmpdir(),
        isWindows: process.platform === 'win32',
        isMac: process.platform === 'darwin',
        isLinux: process.platform === 'linux',
        isMacArm: process.platform === 'darwin' && process.arch === 'arm64',
        cpuCores: os.cpus().length,
        totalMemory: Math.round(os.totalmem() / (1024 * 1024 * 1024)), // GB
        freeMemory: Math.round(os.freemem() / (1024 * 1024 * 1024)), // GB
        uptime: os.uptime(),
        timestamp: Date.now()
      };

      // Détection de la version d'OS plus spécifique
      if (platformInfo.isWindows) {
        platformInfo.osName = 'Windows';
        platformInfo.osVersion = getWindowsVersion(os.release());
      } else if (platformInfo.isMac) {
        platformInfo.osName = 'macOS';
        platformInfo.osVersion = getMacOSVersion();
      } else if (platformInfo.isLinux) {
        platformInfo.osName = 'Linux';
        platformInfo.osVersion = getLinuxDistro();
      }

      // Détecter si nous sommes dans un environnement de développement
      platformInfo.isDev = process.env.NODE_ENV === 'development';

      // Ajouter des informations sur l'affichage si disponible
      try {
        if (typeof window !== 'undefined' && window.screen) {
          platformInfo.screen = {
            width: window.screen.width,
            height: window.screen.height,
            scaleFactor: window.devicePixelRatio || 1
          };
        }
      } catch (e) {
        // Ignorer les erreurs d'accès à l'écran (peut arriver en contexte non-GUI)
      }

      lastDetectionResult = platformInfo;
      return platformInfo;
    } catch (error) {
      const errorInfo = {
        code: 'PLATFORM_DETECTION_FAILED',
        message: `Échec de la détection de plateforme: ${error.message}`,
        details: error.stack
      };

      eventBus.emit('ERROR', errorInfo);
      throw error;
    }
  }

  /**
   * Obtient la version de Windows à partir de la chaîne de release
   * @param {string} releaseStr - La chaîne de release OS
   * @returns {string} - Version Windows lisible
   */
  function getWindowsVersion(releaseStr) {
    const versionMap = {
      '10.0': 'Windows 10/11',
      6.3: 'Windows 8.1',
      6.2: 'Windows 8',
      6.1: 'Windows 7',
      '6.0': 'Windows Vista',
      5.2: 'Windows Server 2003/XP x64',
      5.1: 'Windows XP',
      '5.0': 'Windows 2000'
    };

    const majorMinor = releaseStr.split('.').slice(0, 2).join('.');
    return versionMap[majorMinor] || `Windows (Release ${releaseStr})`;
  }

  /**
   * Tente de déterminer la version macOS
   * @returns {string} - Version macOS
   */
  function getMacOSVersion() {
    try {
      const { execSync } = require('child_process');
      const stdout = execSync('sw_vers -productVersion').toString().trim();
      return `macOS ${stdout}`;
    } catch (e) {
      return 'macOS (version inconnue)';
    }
  }

  /**
   * Tente de déterminer la distribution Linux
   * @returns {string} - Nom de la distribution Linux
   */
  function getLinuxDistro() {
    try {
      const fs = require('fs');
      const { execSync } = require('child_process');

      // Tenter de lire /etc/os-release
      if (fs.existsSync('/etc/os-release')) {
        const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
        const nameMatch = osRelease.match(/^NAME="?([^"\n]*)"?/m);
        const versionMatch = osRelease.match(/^VERSION="?([^"\n]*)"?/m);

        if (nameMatch && versionMatch) {
          return `${nameMatch[1]} ${versionMatch[1]}`;
        } else if (nameMatch) {
          return nameMatch[1];
        }
      }

      // Autres méthodes de détection si os-release échoue
      if (fs.existsSync('/etc/lsb-release')) {
        const lsbRelease = execSync('lsb_release -ds').toString().trim();
        return lsbRelease;
      }

      // Si tout échoue
      return 'Linux (distribution inconnue)';
    } catch (e) {
      return 'Linux (distribution inconnue)';
    }
  }

  /**
   * Gestionnaire d'événement pour la demande de détection
   */
  function handleDetectionRequest() {
    const platformInfo = detectPlatform();
    eventBus.emit('PLATFORM_DETECTED', platformInfo);
  }

  // Initialiser les écouteurs d'événements
  function init() {
    if (isInitialized) return;

    eventBus.on('APP_INITIALIZED', handleDetectionRequest);
    eventBus.on('PLATFORM_DETECTION_REQUESTED', handleDetectionRequest);

    isInitialized = true;

    // Effectuer une détection initiale et publier les résultats
    const platformInfo = detectPlatform();
    eventBus.emit('PLATFORM_DETECTED', platformInfo);

    // Informer que le module est prêt
    eventBus.emit('MODULE_READY', {
      name: 'platform-detector',
      type: 'utility'
    });
  }

  /**
   * Nettoie les ressources utilisées par le module
   */
  function cleanup() {
    eventBus.off('APP_INITIALIZED', handleDetectionRequest);
    eventBus.off('PLATFORM_DETECTION_REQUESTED', handleDetectionRequest);

    isInitialized = false;
    eventBus.emit('MODULE_UNLOADED', {
      name: 'platform-detector',
      type: 'utility'
    });
  }

  // Auto-initialisation lorsque le module est chargé
  init();

  // Exposer une API publique via le bus d'événements
  return {
    cleanup
  };
}

// Point d'entrée du module - s'enregistre lorsque le conteneur d'application est prêt
if (typeof window !== 'undefined' && window.APP_CONTAINER) {
  window.APP_CONTAINER.registerModule('platform-detector', (container) => {
    return initPlatformDetector(container.get('eventBus'));
  });
} else {
  // Pour les tests ou l'utilisation manuelle
  module.exports = initPlatformDetector;
} // Détection de la plateforme OS
// Créé automatiquement le 2025-05-02
