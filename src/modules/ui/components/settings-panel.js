/**
 * @fileoverview Panneau de réglages pour l'application 21 BYTS
 *
 * Ce module gère l'interface utilisateur et la logique du panneau de réglages.
 * Il permet à l'utilisateur de configurer ses préférences comme le dossier de destination
 * des téléchargements et les formats audio préférés. En accord avec l'architecture
 * de l'application, ce module fonctionne de manière autonome et communique
 * exclusivement via le bus d'événements central.
 *
 * @module ui/components/settings-panel
 *
 * @requires electron Utilisé pour accéder aux APIs natives (sélection de dossier)
 *
 * @events
 * - EVENT_SETTINGS_INITIALIZED: Émis quand le panneau de réglages est initialisé
 * - EVENT_SETTINGS_OPENED: Émis quand le panneau de réglages est ouvert
 * - EVENT_SETTINGS_CLOSED: Émis quand le panneau de réglages est fermé
 * - EVENT_SETTINGS_SAVED: Émis quand les réglages sont sauvegardés
 * - EVENT_SETTINGS_RESET: Émis quand les réglages sont réinitialisés
 * - EVENT_SETTINGS_CHANGED: Émis quand un réglage spécifique est modifié
 * - EVENT_SETTINGS_FOLDER_SELECTED: Émis quand un nouveau dossier de destination est sélectionné
 *
 * @listens
 * - EVENT_APP_INITIALIZED: Pour initialiser le panneau de réglages
 * - EVENT_UI_SETTINGS_BUTTON_CLICKED: Pour ouvrir le panneau de réglages
 * - EVENT_CONFIG_LOADED: Pour charger les réglages depuis la configuration
 * - EVENT_UI_RENDER_REQUIRED: Pour mettre à jour l'interface si nécessaire
 *
 * @example
 * // L'initialisation est automatiquement gérée par l'écoute de EVENT_APP_INITIALIZED
 * // Pour ouvrir manuellement le panneau via un autre module:
 * // eventBus.publish(EVENT_UI_SETTINGS_BUTTON_CLICKED);
 */

// Les dépendances externes sont autorisées (Node.js/Electron)
const { dialog, ipcRenderer } = require('electron');

/**
 * Classe principale du panneau de réglages, suivant le modèle de conception
 * "Singleton" pour garantir qu'une seule instance existe.
 */
class SettingsPanel {
  /**
   * Constructeur privé, utilisez SettingsPanel.init() pour l'initialisation
   */
  constructor() {
    // État interne
    this.isVisible = false;
    this.settings = {
      downloadFolder: '',
      preferredFormat: 'mp3',
      maxConcurrentDownloads: 3,
      autoAddToLibrary: false,
      enableNotifications: true
    };

    // Référence aux éléments DOM (initialisés plus tard)
    this.panelElement = null;
    this.folderPathElement = null;
    this.formatSelectElement = null;
    this.concurrentDownloadsElement = null;
    this.autoAddCheckboxElement = null;
    this.notificationsCheckboxElement = null;
    this.saveButtonElement = null;
    this.cancelButtonElement = null;
    this.resetButtonElement = null;

    // Abonnements aux événements gérés dans init()
  }

  /**
   * Initialise le panneau de réglages et s'abonne aux événements pertinents
   * @param {Object} eventBus - Le bus d'événements central
   * @param {Object} EVENT_TYPES - Constantes représentant les types d'événements standardisés
   */
  init(eventBus, EVENT_TYPES) {
    if (!eventBus || !EVENT_TYPES) {
      console.error('SettingsPanel: eventBus et EVENT_TYPES sont requis');
      return;
    }

    this.eventBus = eventBus;
    this.EVENT_TYPES = EVENT_TYPES;

    // Abonnement aux événements
    this.eventBus.subscribe(
      this.EVENT_TYPES.EVENT_APP_INITIALIZED,
      this.onAppInitialized.bind(this)
    );
    this.eventBus.subscribe(
      this.EVENT_TYPES.EVENT_UI_SETTINGS_BUTTON_CLICKED,
      this.openPanel.bind(this)
    );
    this.eventBus.subscribe(this.EVENT_TYPES.EVENT_CONFIG_LOADED, this.onConfigLoaded.bind(this));
    this.eventBus.subscribe(this.EVENT_TYPES.EVENT_UI_RENDER_REQUIRED, this.updateUI.bind(this));

    // Notification d'initialisation
    this.eventBus.publish(this.EVENT_TYPES.EVENT_SETTINGS_INITIALIZED);

    console.log('SettingsPanel: Module initialisé');
  }

  /**
   * Gestionnaire pour l'événement d'initialisation de l'application
   */
  onAppInitialized() {
    console.log('SettingsPanel: Répondant à EVENT_APP_INITIALIZED');
    this.createElements();
    this.attachEventListeners();

    // Demande la configuration actuelle
    this.eventBus.publish(this.EVENT_TYPES.EVENT_CONFIG_REQUEST, {
      component: 'settings-panel',
      keys: [
        'downloadFolder',
        'preferredFormat',
        'maxConcurrentDownloads',
        'autoAddToLibrary',
        'enableNotifications'
      ]
    });
  }

  /**
   * Création des éléments DOM du panneau de réglages
   * @private
   */
  createElements() {
    // Création du panneau modal
    this.panelElement = document.createElement('div');
    this.panelElement.className = 'settings-panel modal';
    this.panelElement.id = 'settings-panel';
    this.panelElement.style.display = 'none';

    // Structure du panneau (en suivant le design visuel de l'application)
    this.panelElement.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>Réglages</h2>
          <button class="close-button">&times;</button>
        </div>
        <div class="modal-body">
          <div class="settings-group">
            <label for="download-folder">Dossier de destination:</label>
            <div class="folder-selector">
              <input type="text" id="download-folder" readonly />
              <button id="browse-button">Parcourir</button>
            </div>
          </div>

          <div class="settings-group">
            <label for="preferred-format">Format audio préféré:</label>
            <select id="preferred-format">
              <option value="mp3">MP3 (320kbps)</option>
              <option value="flac">FLAC</option>
              <option value="wav">WAV</option>
              <option value="aiff">AIFF</option>
            </select>
          </div>

          <div class="settings-group">
            <label for="concurrent-downloads">Téléchargements simultanés:</label>
            <input type="number" id="concurrent-downloads" min="1" max="10" value="3" />
          </div>

          <div class="settings-group checkbox">
            <input type="checkbox" id="auto-add-library" />
            <label for="auto-add-library">Ajouter automatiquement à la bibliothèque</label>
          </div>

          <div class="settings-group checkbox">
            <input type="checkbox" id="enable-notifications" />
            <label for="enable-notifications">Activer les notifications</label>
          </div>
        </div>
        <div class="modal-footer">
          <button id="reset-settings">Réinitialiser</button>
          <div class="action-buttons">
            <button id="cancel-settings">Annuler</button>
            <button id="save-settings" class="primary">Enregistrer</button>
          </div>
        </div>
      </div>
    `;

    // Ajout au DOM
    document.body.appendChild(this.panelElement);

    // Récupération des références aux éléments
    this.folderPathElement = document.getElementById('download-folder');
    this.formatSelectElement = document.getElementById('preferred-format');
    this.concurrentDownloadsElement = document.getElementById('concurrent-downloads');
    this.autoAddCheckboxElement = document.getElementById('auto-add-library');
    this.notificationsCheckboxElement = document.getElementById('enable-notifications');
    this.saveButtonElement = document.getElementById('save-settings');
    this.cancelButtonElement = document.getElementById('cancel-settings');
    this.resetButtonElement = document.getElementById('reset-settings');
    this.browseButtonElement = document.getElementById('browse-button');
    this.closeButtonElement = document.querySelector('#settings-panel .close-button');
  }

  /**
   * Attache les écouteurs d'événements aux éléments de l'interface
   * @private
   */
  attachEventListeners() {
    // Bouton de fermeture
    this.closeButtonElement.addEventListener('click', () => {
      this.closePanel();
    });

    // Bouton Annuler
    this.cancelButtonElement.addEventListener('click', () => {
      this.closePanel();
    });

    // Bouton Enregistrer
    this.saveButtonElement.addEventListener('click', () => {
      this.saveSettings();
    });

    // Bouton Réinitialiser
    this.resetButtonElement.addEventListener('click', () => {
      this.resetSettings();
    });

    // Bouton Parcourir
    this.browseButtonElement.addEventListener('click', () => {
      this.selectDownloadFolder();
    });

    // Écouteurs de changements
    this.formatSelectElement.addEventListener('change', () => {
      this.onSettingChanged('preferredFormat', this.formatSelectElement.value);
    });

    this.concurrentDownloadsElement.addEventListener('change', () => {
      this.onSettingChanged(
        'maxConcurrentDownloads',
        parseInt(this.concurrentDownloadsElement.value, 10)
      );
    });

    this.autoAddCheckboxElement.addEventListener('change', () => {
      this.onSettingChanged('autoAddToLibrary', this.autoAddCheckboxElement.checked);
    });

    this.notificationsCheckboxElement.addEventListener('change', () => {
      this.onSettingChanged('enableNotifications', this.notificationsCheckboxElement.checked);
    });

    // Fermeture en cliquant en dehors du panneau
    window.addEventListener('click', (event) => {
      if (event.target === this.panelElement) {
        this.closePanel();
      }
    });

    // Support des touches clavier (Echap pour fermer)
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.isVisible) {
        this.closePanel();
      }
    });
  }

  /**
   * Gère le chargement de la configuration depuis le gestionnaire de configuration
   * @param {Object} config - La configuration chargée
   */
  onConfigLoaded(config) {
    if (!config || typeof config !== 'object') {
      console.error('SettingsPanel: Configuration invalide reçue');
      return;
    }

    try {
      // Mise à jour des réglages locaux avec les valeurs reçues
      this.settings = {
        ...this.settings,
        ...config
      };

      // Mise à jour de l'interface
      this.updateUI();

      console.log('SettingsPanel: Configuration chargée avec succès');
    } catch (error) {
      this.handleError('Erreur lors du chargement de la configuration', error);
    }
  }

  /**
   * Met à jour l'interface utilisateur avec les réglages actuels
   */
  updateUI() {
    if (!this.folderPathElement) return; // Vérification que les éléments sont créés

    try {
      // Mise à jour des champs avec les valeurs actuelles
      this.folderPathElement.value = this.settings.downloadFolder || 'Non défini';
      this.formatSelectElement.value = this.settings.preferredFormat || 'mp3';
      this.concurrentDownloadsElement.value = this.settings.maxConcurrentDownloads || 3;
      this.autoAddCheckboxElement.checked = this.settings.autoAddToLibrary || false;
      this.notificationsCheckboxElement.checked = this.settings.enableNotifications !== false; // par défaut activé
    } catch (error) {
      this.handleError("Erreur lors de la mise à jour de l'interface", error);
    }
  }

  /**
   * Ouvre le panneau de réglages
   */
  openPanel() {
    if (!this.panelElement) return;

    this.panelElement.style.display = 'block';
    this.isVisible = true;

    // Animation d'ouverture
    setTimeout(() => {
      this.panelElement.classList.add('visible');
    }, 10);

    // Notification d'ouverture
    this.eventBus.publish(this.EVENT_TYPES.EVENT_SETTINGS_OPENED);

    console.log('SettingsPanel: Panneau ouvert');
  }

  /**
   * Ferme le panneau de réglages
   */
  closePanel() {
    if (!this.panelElement || !this.isVisible) return;

    this.panelElement.classList.remove('visible');

    // Animation de fermeture
    setTimeout(() => {
      this.panelElement.style.display = 'none';
      this.isVisible = false;
    }, 300); // Durée de l'animation CSS de transition

    // Notification de fermeture
    this.eventBus.publish(this.EVENT_TYPES.EVENT_SETTINGS_CLOSED);

    console.log('SettingsPanel: Panneau fermé');
  }

  /**
   * Enregistre les réglages actuels
   */
  saveSettings() {
    try {
      // Recueillir les valeurs actuelles depuis l'interface
      const updatedSettings = {
        downloadFolder: this.folderPathElement.value,
        preferredFormat: this.formatSelectElement.value,
        maxConcurrentDownloads: parseInt(this.concurrentDownloadsElement.value, 10),
        autoAddToLibrary: this.autoAddCheckboxElement.checked,
        enableNotifications: this.notificationsCheckboxElement.checked
      };

      // Mettre à jour l'état local
      this.settings = updatedSettings;

      // Publier les nouveaux réglages pour le stockage persistant
      this.eventBus.publish(this.EVENT_TYPES.EVENT_SETTINGS_SAVED, updatedSettings);

      // Fermer le panneau
      this.closePanel();

      console.log('SettingsPanel: Réglages enregistrés', updatedSettings);
    } catch (error) {
      this.handleError("Erreur lors de l'enregistrement des réglages", error);
    }
  }

  /**
   * Réinitialise les réglages aux valeurs par défaut
   */
  resetSettings() {
    try {
      // Valeurs par défaut
      const defaultSettings = {
        downloadFolder: '',
        preferredFormat: 'mp3',
        maxConcurrentDownloads: 3,
        autoAddToLibrary: false,
        enableNotifications: true
      };

      // Mettre à jour l'état local
      this.settings = defaultSettings;

      // Mettre à jour l'interface
      this.updateUI();

      // Publier l'événement de réinitialisation
      this.eventBus.publish(this.EVENT_TYPES.EVENT_SETTINGS_RESET, defaultSettings);

      console.log('SettingsPanel: Réglages réinitialisés');
    } catch (error) {
      this.handleError('Erreur lors de la réinitialisation des réglages', error);
    }
  }

  /**
   * Gère le changement d'un réglage spécifique
   * @param {string} key - Clé du réglage modifié
   * @param {any} value - Nouvelle valeur
   */
  onSettingChanged(key, value) {
    try {
      // Mise à jour de l'état local
      this.settings[key] = value;

      // Notification du changement
      this.eventBus.publish(this.EVENT_TYPES.EVENT_SETTINGS_CHANGED, {
        key,
        value,
        settings: this.settings
      });

      console.log(`SettingsPanel: Réglage modifié - ${key}:`, value);
    } catch (error) {
      this.handleError(`Erreur lors de la modification du réglage ${key}`, error);
    }
  }

  /**
   * Permet à l'utilisateur de sélectionner un dossier de téléchargement
   */
  selectDownloadFolder() {
    try {
      // Utilisation de l'API Electron pour la sélection de dossier
      // Dans un environnement réel, ceci serait géré par IPC avec le processus principal
      // Pour respecter l'architecture basée sur les événements, on simule ce comportement

      this.eventBus.publish(this.EVENT_TYPES.EVENT_FOLDER_SELECTION_REQUESTED, {
        component: 'settings-panel',
        currentPath: this.settings.downloadFolder
      });

      // Dans un environnement de production, un handler dans le processus principal
      // écouterait cet événement et répondrait via IPC. Ici, on simule la réponse
      // pour démontrer le flux d'événements.

      // Simulation d'une réponse asynchrone du processus principal
      setTimeout(() => {
        // Dans un cas réel, cette valeur viendrait du dialog.showOpenDialog d'Electron
        const selectedPath = `/Users/example/Downloads/21BYTS`;

        if (selectedPath) {
          this.folderPathElement.value = selectedPath;
          this.onSettingChanged('downloadFolder', selectedPath);

          // Publier l'événement de sélection de dossier
          this.eventBus.publish(this.EVENT_TYPES.EVENT_SETTINGS_FOLDER_SELECTED, {
            path: selectedPath
          });
        }
      }, 500);
    } catch (error) {
      this.handleError('Erreur lors de la sélection du dossier', error);
    }
  }

  /**
   * Gestion centralisée des erreurs
   * @param {string} message - Message d'erreur
   * @param {Error} error - Objet d'erreur
   */
  handleError(message, error) {
    console.error(`SettingsPanel: ${message}`, error);

    // Publication de l'erreur via le bus d'événements
    if (this.eventBus && this.EVENT_TYPES) {
      this.eventBus.publish(this.EVENT_TYPES.EVENT_ERROR, {
        source: 'settings-panel',
        message,
        error: error.toString(),
        stack: error.stack
      });
    }
  }
}

/**
 * Singleton et fonction d'initialisation exportée
 */
const settingsPanel = new SettingsPanel();

/**
 * Fonction d'initialisation du module
 * @param {Object} eventBus - Le bus d'événements central
 * @param {Object} EVENT_TYPES - Types d'événements standardisés
 */
function initialize(eventBus, EVENT_TYPES) {
  console.log('Initialisation du module settings-panel');

  if (!eventBus) {
    console.error("SettingsPanel: eventBus requis pour l'initialisation");
    return;
  }

  if (!EVENT_TYPES) {
    console.error("SettingsPanel: EVENT_TYPES requis pour l'initialisation");
    return;
  }

  settingsPanel.init(eventBus, EVENT_TYPES);
}

// Point d'entrée du module lors du chargement par le conteneur d'application
module.exports = { initialize }; // Panneau de paramètres
// Créé automatiquement le 2025-05-02
