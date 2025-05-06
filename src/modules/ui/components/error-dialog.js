/**
 * @file error-dialog.js
 * @description Composant de dialogue d'erreur unifié pour l'application 21 BYTS.
 * Ce module fournit une interface utilisateur pour afficher les erreurs de manière
 * cohérente et informative à l'utilisateur. Il est totalement indépendant des autres
 * modules et communique exclusivement via le bus d'événements central.
 *
 * @module ui/components/error-dialog
 *
 * @events
 * ÉCOUTÉS:
 * - ERROR_DISPLAY_REQUEST: Affiche un dialogue d'erreur avec les informations fournies
 * - ERROR_DIALOG_CLOSE: Ferme le dialogue d'erreur actif
 * - APP_THEME_CHANGED: Met à jour le thème du dialogue d'erreur
 * - APP_INITIALIZED: Initialise le composant de dialogue d'erreur
 *
 * ÉMIS:
 * - ERROR_DIALOG_SHOWN: Lorsqu'un dialogue d'erreur est affiché
 * - ERROR_DIALOG_CLOSED: Lorsqu'un dialogue d'erreur est fermé
 * - ERROR_RETRY_REQUESTED: Lorsque l'utilisateur demande une nouvelle tentative
 * - ERROR_LOGGED: Pour journaliser une erreur dans les logs système
 * - CONFIG_GET_REQUEST: Pour obtenir les préférences de configuration des dialogues
 * - CONFIG_GET_RESPONSE: Réponse à la demande de configuration
 *
 * @example
 * // La communication se fait uniquement via les événements
 * // Pour afficher une erreur depuis un autre module:
 * eventBus.publish('ERROR_DISPLAY_REQUEST', {
 *   title: 'Erreur de téléchargement',
 *   message: 'Impossible de télécharger le fichier audio',
 *   code: 'DOWNLOAD_FAILED',
 *   details: error.stack,
 *   source: 'youtube-adapter',
 *   retryable: true
 * });
 */

(function () {
  'use strict';

  // Référence à l'élément DOM du dialogue (sera initialisé plus tard)
  let dialogElement = null;

  // Cache des éléments DOM internes du dialogue
  let dialogElements = {
    title: null,
    message: null,
    details: null,
    detailsToggle: null,
    closeButton: null,
    retryButton: null
  };

  // Configuration par défaut
  let config = {
    autoCloseTimeout: 0, // 0 = pas de fermeture automatique
    logErrors: true,
    showRetryButton: true,
    defaultTitle: 'Erreur',
    errorCodePrefix: '21BYTS-ERR-'
  };

  // État interne
  let currentError = null;
  let isVisible = false;
  let autoCloseTimer = null;
  let isDarkTheme = true;

  /**
   * Initialise le composant de dialogue d'erreur
   * @private
   */
  function initialize() {
    if (typeof window === 'undefined') {
      // Nous sommes dans un contexte non-UI, ne pas initialiser l'interface
      console.warn("error-dialog: tentative d'initialisation dans un contexte non-UI");
      return;
    }

    // Création et insertion du dialogue dans le DOM
    createDialogElement();

    // Récupération des éléments internes du dialogue
    cacheDialogElements();

    // Mise en place des écouteurs d'événements du DOM
    setupDOMEventListeners();

    // Récupération de la configuration depuis le gestionnaire de configuration
    requestConfiguration();

    // Logging de l'initialisation réussie
    console.log('error-dialog: composant initialisé avec succès');
  }

  /**
   * Crée l'élément de dialogue et l'ajoute au DOM
   * @private
   */
  function createDialogElement() {
    // Vérification si l'élément existe déjà
    const existingDialog = document.getElementById('error-dialog');
    if (existingDialog) {
      dialogElement = existingDialog;
      return;
    }

    // Création du contenu HTML du dialogue
    dialogElement = document.createElement('div');
    dialogElement.id = 'error-dialog';
    dialogElement.className = 'error-dialog hidden';
    dialogElement.setAttribute('role', 'dialog');
    dialogElement.setAttribute('aria-modal', 'true');
    dialogElement.setAttribute('aria-labelledby', 'error-dialog-title');

    // Structure interne du dialogue avec des styles intégrés pour respecter le design
    dialogElement.innerHTML = `
        <div class="error-dialog-backdrop"></div>
        <div class="error-dialog-container">
          <div class="error-dialog-header">
            <h2 id="error-dialog-title"></h2>
            <button type="button" class="error-dialog-close-btn" aria-label="Fermer">×</button>
          </div>
          <div class="error-dialog-content">
            <p id="error-dialog-message"></p>
            <div class="error-dialog-details-container">
              <button type="button" class="error-dialog-details-toggle">Afficher les détails</button>
              <pre id="error-dialog-details" class="hidden"></pre>
            </div>
          </div>
          <div class="error-dialog-footer">
            <button type="button" class="error-dialog-retry-btn">Réessayer</button>
            <button type="button" class="error-dialog-close-btn-footer">Fermer</button>
          </div>
        </div>
      `;

    // Ajout des styles CSS inline pour garantir l'indépendance
    const style = document.createElement('style');
    style.textContent = `
        .error-dialog {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Arial', sans-serif;
        }

        .error-dialog.hidden {
          display: none;
        }

        .error-dialog-backdrop {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(5px);
        }

        .error-dialog-container {
          position: relative;
          width: 90%;
          max-width: 500px;
          max-height: 90vh;
          border-radius: 16px;
          background: linear-gradient(135deg, #1a1f35, #2d3a66);
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
          color: white;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .error-dialog-header {
          padding: 16px 20px;
          background-color: rgba(255, 255, 255, 0.12);
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .error-dialog-header h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }

        .error-dialog-close-btn {
          background: none;
          border: none;
          color: white;
          font-size: 24px;
          cursor: pointer;
          padding: 0;
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          transition: background-color 0.2s;
        }

        .error-dialog-close-btn:hover {
          background-color: rgba(255, 255, 255, 0.1);
        }

        .error-dialog-content {
          padding: 20px;
          flex-grow: 1;
          overflow-y: auto;
        }

        .error-dialog-message {
          margin-top: 0;
          margin-bottom: 16px;
          line-height: 1.5;
        }

        .error-dialog-details-container {
          margin-top: 16px;
        }

        .error-dialog-details-toggle {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.7);
          padding: 5px 0;
          cursor: pointer;
          font-size: 14px;
          text-decoration: underline;
        }

        .error-dialog-details {
          margin-top: 8px;
          padding: 12px;
          background-color: rgba(0, 0, 0, 0.2);
          border-radius: 8px;
          white-space: pre-wrap;
          word-break: break-all;
          font-family: monospace;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.8);
          max-height: 200px;
          overflow-y: auto;
        }

        .error-dialog-details.hidden {
          display: none;
        }

        .error-dialog-footer {
          padding: 16px 20px;
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          background-color: rgba(255, 255, 255, 0.05);
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .error-dialog-footer button {
          padding: 8px 16px;
          border-radius: 30px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background-color: rgba(255, 255, 255, 0.15);
          color: white;
          font-size: 14px;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .error-dialog-footer button:hover {
          background-color: rgba(255, 255, 255, 0.25);
        }

        .error-dialog-retry-btn {
          background-color: rgba(66, 133, 244, 0.4) !important;
        }

        .error-dialog-retry-btn:hover {
          background-color: rgba(66, 133, 244, 0.6) !important;
        }

        /* Thème clair (sera appliqué dynamiquement) */
        .error-dialog.light-theme .error-dialog-container {
          background: linear-gradient(135deg, #f0f2f5, #e1e6ef);
          color: #333;
        }

        .error-dialog.light-theme .error-dialog-close-btn,
        .error-dialog.light-theme .error-dialog-footer button {
          color: #333;
        }

        .error-dialog.light-theme .error-dialog-details-toggle {
          color: rgba(0, 0, 0, 0.7);
        }

        .error-dialog.light-theme .error-dialog-details {
          background-color: rgba(0, 0, 0, 0.05);
          color: rgba(0, 0, 0, 0.8);
        }
      `;

    // Ajout au DOM
    document.head.appendChild(style);
    document.body.appendChild(dialogElement);
  }

  /**
   * Récupère les références aux éléments internes du dialogue
   * @private
   */
  function cacheDialogElements() {
    if (!dialogElement) return;

    dialogElements = {
      title: dialogElement.querySelector('#error-dialog-title'),
      message: dialogElement.querySelector('#error-dialog-message'),
      details: dialogElement.querySelector('#error-dialog-details'),
      detailsToggle: dialogElement.querySelector('.error-dialog-details-toggle'),
      closeButton: dialogElement.querySelector('.error-dialog-close-btn'),
      closeButtonFooter: dialogElement.querySelector('.error-dialog-close-btn-footer'),
      retryButton: dialogElement.querySelector('.error-dialog-retry-btn')
    };
  }

  /**
   * Configure les écouteurs d'événements du DOM
   * @private
   */
  function setupDOMEventListeners() {
    if (!dialogElement) return;

    // Bouton fermer
    dialogElements.closeButton.addEventListener('click', handleClose);
    dialogElements.closeButtonFooter.addEventListener('click', handleClose);

    // Bouton réessayer
    dialogElements.retryButton.addEventListener('click', handleRetry);

    // Toggle des détails
    dialogElements.detailsToggle.addEventListener('click', toggleDetails);

    // Fermeture en cliquant sur l'arrière-plan
    dialogElement.querySelector('.error-dialog-backdrop').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        handleClose();
      }
    });

    // Touche Echap pour fermer
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isVisible) {
        handleClose();
      }
    });
  }

  /**
   * Demande la configuration au gestionnaire de configuration
   * @private
   */
  function requestConfiguration() {
    // Publication d'un événement pour demander la configuration
    if (window.eventBus) {
      window.eventBus.publish('CONFIG_GET_REQUEST', {
        module: 'error-dialog',
        callback: 'CONFIG_GET_RESPONSE'
      });
    }
  }

  /**
   * Affiche le dialogue d'erreur avec les informations fournies
   * @param {Object} errorInfo - Informations sur l'erreur
   * @private
   */
  function showErrorDialog(errorInfo) {
    if (!dialogElement) {
      console.error("error-dialog: impossible d'afficher le dialogue, élément non initialisé");
      return;
    }

    // Stockage des informations d'erreur actuelles
    currentError = errorInfo;

    // Configuration des éléments du dialogue
    dialogElements.title.textContent = errorInfo.title || config.defaultTitle;
    dialogElements.message.textContent =
      errorInfo.message || "Une erreur inattendue s'est produite.";

    // Affichage du code d'erreur s'il existe
    if (errorInfo.code) {
      dialogElements.message.textContent += ` (${config.errorCodePrefix}${errorInfo.code})`;
    }

    // Configuration des détails d'erreur
    if (errorInfo.details) {
      dialogElements.details.textContent = errorInfo.details;
      dialogElements.detailsToggle.style.display = 'block';
      dialogElements.details.classList.add('hidden');
      dialogElements.detailsToggle.textContent = 'Afficher les détails';
    } else {
      dialogElements.detailsToggle.style.display = 'none';
      dialogElements.details.classList.add('hidden');
    }

    // Configuration du bouton de nouvelle tentative
    if (errorInfo.retryable && config.showRetryButton) {
      dialogElements.retryButton.style.display = 'block';
    } else {
      dialogElements.retryButton.style.display = 'none';
    }

    // Affichage du dialogue
    dialogElement.classList.remove('hidden');
    isVisible = true;

    // Application du thème actuel
    applyTheme();

    // Configuration de la fermeture automatique si nécessaire
    if (config.autoCloseTimeout > 0) {
      if (autoCloseTimer) {
        clearTimeout(autoCloseTimer);
      }
      autoCloseTimer = setTimeout(handleClose, config.autoCloseTimeout);
    }

    // Journalisation de l'erreur si configuré
    if (config.logErrors && window.eventBus) {
      window.eventBus.publish('ERROR_LOGGED', {
        ...errorInfo,
        timestamp: new Date().toISOString()
      });
    }

    // Notification que le dialogue est affiché
    if (window.eventBus) {
      window.eventBus.publish('ERROR_DIALOG_SHOWN', {
        errorInfo: currentError
      });
    }
  }

  /**
   * Ferme le dialogue d'erreur
   * @private
   */
  function handleClose() {
    if (!isVisible) return;

    // Masquer le dialogue
    dialogElement.classList.add('hidden');
    isVisible = false;

    // Nettoyer le timer de fermeture automatique
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
      autoCloseTimer = null;
    }

    // Notification que le dialogue est fermé
    if (window.eventBus) {
      window.eventBus.publish('ERROR_DIALOG_CLOSED', {
        errorInfo: currentError
      });
    }

    // Réinitialiser l'erreur courante
    currentError = null;
  }

  /**
   * Gère une demande de nouvelle tentative
   * @private
   */
  function handleRetry() {
    if (!currentError || !currentError.retryable) return;

    // Notification de la demande de nouvelle tentative
    if (window.eventBus) {
      window.eventBus.publish('ERROR_RETRY_REQUESTED', {
        errorInfo: currentError
      });
    }

    // Fermer le dialogue
    handleClose();
  }

  /**
   * Bascule l'affichage des détails d'erreur
   * @private
   */
  function toggleDetails() {
    if (!dialogElements.details) return;

    const isHidden = dialogElements.details.classList.contains('hidden');

    if (isHidden) {
      dialogElements.details.classList.remove('hidden');
      dialogElements.detailsToggle.textContent = 'Masquer les détails';
    } else {
      dialogElements.details.classList.add('hidden');
      dialogElements.detailsToggle.textContent = 'Afficher les détails';
    }
  }

  /**
   * Applique le thème actuel au dialogue
   * @private
   */
  function applyTheme() {
    if (!dialogElement) return;

    if (isDarkTheme) {
      dialogElement.classList.remove('light-theme');
    } else {
      dialogElement.classList.add('light-theme');
    }
  }

  /**
   * Configure le dialogue avec la nouvelle configuration
   * @param {Object} newConfig - Nouvelle configuration
   * @private
   */
  function updateConfig(newConfig) {
    if (!newConfig) return;

    // Fusion de la configuration
    config = {
      ...config,
      ...newConfig
    };

    // Application de la nouvelle configuration si le dialogue est visible
    if (isVisible && currentError) {
      // Mise à jour du bouton de réessai selon la nouvelle configuration
      if (currentError.retryable && config.showRetryButton) {
        dialogElements.retryButton.style.display = 'block';
      } else {
        dialogElements.retryButton.style.display = 'none';
      }

      // Mise à jour du timer de fermeture automatique
      if (autoCloseTimer) {
        clearTimeout(autoCloseTimer);
        autoCloseTimer = null;
      }

      if (config.autoCloseTimeout > 0) {
        autoCloseTimer = setTimeout(handleClose, config.autoCloseTimeout);
      }
    }
  }

  /**
   * Enregistre les écouteurs d'événements sur le bus d'événements central
   * @private
   */
  function setupEventBusListeners() {
    if (!window.eventBus) {
      console.error("error-dialog: bus d'événements non disponible");
      return;
    }

    // Écouteur pour les demandes d'affichage d'erreur
    window.eventBus.subscribe('ERROR_DISPLAY_REQUEST', showErrorDialog);

    // Écouteur pour les demandes de fermeture du dialogue
    window.eventBus.subscribe('ERROR_DIALOG_CLOSE', handleClose);

    // Écouteur pour les changements de thème
    window.eventBus.subscribe('APP_THEME_CHANGED', (data) => {
      isDarkTheme = data.theme === 'dark';
      applyTheme();
    });

    // Écouteur pour les réponses de configuration
    window.eventBus.subscribe('CONFIG_GET_RESPONSE', (data) => {
      if (data.module === 'error-dialog') {
        updateConfig(data.config);
      }
    });
  }

  /**
   * Point d'entrée du module, appelé lorsque le bus d'événements est prêt
   */
  function initializeModule() {
    // Initialisation de l'interface utilisateur
    initialize();

    // Configuration des écouteurs d'événements
    setupEventBusListeners();

    console.log('error-dialog: module initialisé et écouteurs configurés');
  }

  // S'enregistrer pour l'initialisation de l'application
  if (window.eventBus) {
    window.eventBus.subscribe('APP_INITIALIZED', initializeModule);
    console.log("error-dialog: en attente d'initialisation de l'application");
  } else {
    // Fallback si le bus d'événements n'est pas encore disponible
    window.addEventListener('DOMContentLoaded', () => {
      if (window.eventBus) {
        window.eventBus.subscribe('APP_INITIALIZED', initializeModule);
        console.log(
          "error-dialog: en attente d'initialisation de l'application (chargement différé)"
        );
      } else {
        console.error("error-dialog: bus d'événements non disponible après chargement du DOM");
      }
    });
  }

  // Exposer uniquement l'initialisation pour les tests
  // Respecte la structure modulaire en n'exposant pas d'API publique
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      initializeForTests: initializeModule
    };
  }
})(); // Dialogue d'erreur unifié
// Créé automatiquement le 2025-05-02
