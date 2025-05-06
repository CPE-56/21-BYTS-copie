/**
 * @fileoverview Component Registry - Gestion centralisée des composants UI
 *
 * Ce module fournit un registre central pour tous les composants de l'interface
 * utilisateur dans l'application 21 BYTS. Il permet l'enregistrement, la récupération
 * et la gestion du cycle de vie des composants sans dépendances directes entre eux.
 * Toute la communication se fait via le bus d'événements central.
 *
 * @module ui/components/component-registry
 *
 * ÉVÉNEMENTS ÉCOUTÉS:
 * - UI_REGISTER_COMPONENT: Enregistre un nouveau composant dans le registre
 * - UI_GET_COMPONENT: Récupère un composant par son ID
 * - UI_UPDATE_COMPONENT: Met à jour l'état d'un composant
 * - UI_REMOVE_COMPONENT: Supprime un composant du registre
 * - UI_GET_ALL_COMPONENTS: Récupère tous les composants enregistrés
 * - APP_SHUTDOWN: Nettoie les ressources lors de la fermeture de l'application
 * - CONFIG_UPDATED: Met à jour les configurations des composants concernés
 *
 * ÉVÉNEMENTS ÉMIS:
 * - UI_COMPONENT_REGISTERED: Émis quand un composant est enregistré avec succès
 * - UI_COMPONENT_UPDATED: Émis quand un composant est mis à jour avec succès
 * - UI_COMPONENT_REMOVED: Émis quand un composant est supprimé avec succès
 * - UI_COMPONENT_NOT_FOUND: Émis quand un composant demandé n'existe pas
 * - UI_REGISTRY_ERROR: Émis en cas d'erreur dans le registre
 * - UI_REGISTRY_READY: Émis quand le registre est initialisé et prêt
 */

// Utilisation des APIs Node.js standards
const { v4: uuidv4 } = require('uuid');

/**
 * Registre des composants UI
 */
class ComponentRegistry {
  /**
   * Constructeur - ne pas instancier directement, utiliser l'initialisation via initialize()
   * @private
   */
  constructor() {
    this.components = new Map();
    this.eventBus = null;
    this.isReady = false;
    this.logger = console; // Sera remplacé par le logger de l'application via les événements
  }

  /**
   * Initialise le registre en s'abonnant aux événements nécessaires
   * @param {Object} eventContext - Le contexte contenant le bus d'événements
   * @returns {Promise<void>}
   */
  async initialize(eventContext) {
    try {
      if (!eventContext || !eventContext.eventBus) {
        throw new Error("Bus d'événements non fourni à l'initialisation");
      }

      this.eventBus = eventContext.eventBus;
      this.logger.info('ComponentRegistry: Initialisation...');

      // Récupération des constantes d'événements par événement
      this.eventBus.emit('CONFIG_GET_CONSTANTS', { type: 'EVENT_TYPES' }, (eventTypes) => {
        if (!eventTypes) {
          this._emitError("Impossible de récupérer les constantes d'événements");
          return;
        }

        this.EVENT_TYPES = eventTypes;
        this._subscribeToEvents();
        this.isReady = true;

        // Notifier que le registre est prêt
        this.eventBus.emit(this.EVENT_TYPES.UI_REGISTRY_READY, {
          message: 'Registre de composants initialisé avec succès'
        });
      });
    } catch (error) {
      this._emitError(`Erreur lors de l'initialisation: ${error.message}`);
    }
  }

  /**
   * S'abonne aux événements requis
   * @private
   */
  _subscribeToEvents() {
    // S'abonner aux événements concernant les composants UI
    this.eventBus.on(
      this.EVENT_TYPES.UI_REGISTER_COMPONENT,
      this._handleRegisterComponent.bind(this)
    );
    this.eventBus.on(this.EVENT_TYPES.UI_GET_COMPONENT, this._handleGetComponent.bind(this));
    this.eventBus.on(this.EVENT_TYPES.UI_UPDATE_COMPONENT, this._handleUpdateComponent.bind(this));
    this.eventBus.on(this.EVENT_TYPES.UI_REMOVE_COMPONENT, this._handleRemoveComponent.bind(this));
    this.eventBus.on(
      this.EVENT_TYPES.UI_GET_ALL_COMPONENTS,
      this._handleGetAllComponents.bind(this)
    );
    this.eventBus.on(this.EVENT_TYPES.APP_SHUTDOWN, this._handleAppShutdown.bind(this));
    this.eventBus.on(this.EVENT_TYPES.CONFIG_UPDATED, this._handleConfigUpdated.bind(this));

    this.logger.info('ComponentRegistry: Abonnement aux événements effectué');
  }

  /**
   * Gère l'enregistrement d'un nouveau composant
   * @param {Object} data - Les données du composant à enregistrer
   * @param {Function} [callback] - Fonction de rappel optionnelle
   * @private
   */
  _handleRegisterComponent(data, callback) {
    try {
      if (!this._validateComponentData(data)) {
        const error = 'Données de composant invalides ou incomplètes';
        this._emitError(error);
        if (callback) callback({ success: false, error });
        return;
      }

      // Génère un ID unique si non fourni
      const componentId = data.id || uuidv4();

      // Création de l'objet composant
      const component = {
        id: componentId,
        type: data.type,
        name: data.name,
        element: data.element,
        config: data.config || {},
        state: data.state || {},
        created: new Date().toISOString(),
        updated: new Date().toISOString()
      };

      // Enregistrement du composant
      this.components.set(componentId, component);

      // Émission de l'événement de confirmation
      this.eventBus.emit(this.EVENT_TYPES.UI_COMPONENT_REGISTERED, {
        componentId,
        type: component.type,
        name: component.name
      });

      this.logger.info(
        `ComponentRegistry: Composant enregistré - ID: ${componentId}, Type: ${component.type}`
      );

      if (callback) callback({ success: true, componentId });
    } catch (error) {
      this._emitError(`Erreur lors de l'enregistrement du composant: ${error.message}`);
      if (callback) callback({ success: false, error: error.message });
    }
  }

  /**
   * Gère la récupération d'un composant par son ID
   * @param {Object} data - Les données contenant l'ID du composant
   * @param {Function} callback - Fonction de rappel obligatoire
   * @private
   */
  _handleGetComponent(data, callback) {
    try {
      if (!data || !data.componentId || typeof callback !== 'function') {
        this._emitError('ID du composant ou fonction de rappel non fournis');
        if (typeof callback === 'function') {
          callback({ success: false, error: 'ID du composant non fourni' });
        }
        return;
      }

      const component = this.components.get(data.componentId);

      if (!component) {
        this.eventBus.emit(this.EVENT_TYPES.UI_COMPONENT_NOT_FOUND, {
          componentId: data.componentId,
          requestedBy: data.requestedBy || 'unknown'
        });

        callback({ success: false, error: 'Composant non trouvé' });
        return;
      }

      callback({ success: true, component });
    } catch (error) {
      this._emitError(`Erreur lors de la récupération du composant: ${error.message}`);
      callback({ success: false, error: error.message });
    }
  }

  /**
   * Gère la mise à jour d'un composant
   * @param {Object} data - Les données de mise à jour du composant
   * @param {Function} [callback] - Fonction de rappel optionnelle
   * @private
   */
  _handleUpdateComponent(data, callback) {
    try {
      if (!data || !data.componentId) {
        const error = 'ID du composant non fourni pour la mise à jour';
        this._emitError(error);
        if (callback) callback({ success: false, error });
        return;
      }

      const component = this.components.get(data.componentId);

      if (!component) {
        this.eventBus.emit(this.EVENT_TYPES.UI_COMPONENT_NOT_FOUND, {
          componentId: data.componentId,
          requestedBy: data.requestedBy || 'unknown'
        });

        if (callback) callback({ success: false, error: 'Composant non trouvé' });
        return;
      }

      // Mise à jour des propriétés fournies
      if (data.config) {
        component.config = { ...component.config, ...data.config };
      }

      if (data.state) {
        component.state = { ...component.state, ...data.state };
      }

      if (data.element) {
        component.element = data.element;
      }

      component.updated = new Date().toISOString();

      // Sauvegarde de la mise à jour
      this.components.set(data.componentId, component);

      // Émission de l'événement de confirmation
      this.eventBus.emit(this.EVENT_TYPES.UI_COMPONENT_UPDATED, {
        componentId: data.componentId,
        type: component.type,
        name: component.name,
        updatedFields: Object.keys(data).filter((k) => k !== 'componentId' && k !== 'requestedBy')
      });

      this.logger.info(`ComponentRegistry: Composant mis à jour - ID: ${data.componentId}`);

      if (callback) callback({ success: true, componentId: data.componentId });
    } catch (error) {
      this._emitError(`Erreur lors de la mise à jour du composant: ${error.message}`);
      if (callback) callback({ success: false, error: error.message });
    }
  }

  /**
   * Gère la suppression d'un composant
   * @param {Object} data - Les données contenant l'ID du composant à supprimer
   * @param {Function} [callback] - Fonction de rappel optionnelle
   * @private
   */
  _handleRemoveComponent(data, callback) {
    try {
      if (!data || !data.componentId) {
        const error = 'ID du composant non fourni pour la suppression';
        this._emitError(error);
        if (callback) callback({ success: false, error });
        return;
      }

      const component = this.components.get(data.componentId);

      if (!component) {
        this.eventBus.emit(this.EVENT_TYPES.UI_COMPONENT_NOT_FOUND, {
          componentId: data.componentId,
          requestedBy: data.requestedBy || 'unknown'
        });

        if (callback) callback({ success: false, error: 'Composant non trouvé' });
        return;
      }

      // Suppression du composant
      this.components.delete(data.componentId);

      // Émission de l'événement de confirmation
      this.eventBus.emit(this.EVENT_TYPES.UI_COMPONENT_REMOVED, {
        componentId: data.componentId,
        type: component.type,
        name: component.name
      });

      this.logger.info(
        `ComponentRegistry: Composant supprimé - ID: ${data.componentId}, Type: ${component.type}`
      );

      if (callback) callback({ success: true });
    } catch (error) {
      this._emitError(`Erreur lors de la suppression du composant: ${error.message}`);
      if (callback) callback({ success: false, error: error.message });
    }
  }

  /**
   * Gère la récupération de tous les composants
   * @param {Object} data - Les données de la requête (filtrage optionnel)
   * @param {Function} callback - Fonction de rappel obligatoire
   * @private
   */
  _handleGetAllComponents(data = {}, callback) {
    try {
      if (typeof callback !== 'function') {
        this._emitError('Fonction de rappel non fournie');
        return;
      }

      let componentsArray = Array.from(this.components.values());

      // Filtrage optionnel par type
      if (data.type) {
        componentsArray = componentsArray.filter((comp) => comp.type === data.type);
      }

      callback({
        success: true,
        components: componentsArray,
        count: componentsArray.length
      });
    } catch (error) {
      this._emitError(`Erreur lors de la récupération des composants: ${error.message}`);
      callback({ success: false, error: error.message });
    }
  }

  /**
   * Gère la mise à jour de configuration des composants concernés
   * @param {Object} configData - Les données de configuration mises à jour
   * @private
   */
  _handleConfigUpdated(configData) {
    try {
      if (!configData || !configData.section) {
        return;
      }

      // Si la configuration concerne l'UI, mettre à jour les composants concernés
      if (configData.section === 'ui' || configData.section === 'theme') {
        // Parcours des composants pour les mettre à jour si nécessaire
        for (const [componentId, component] of this.components.entries()) {
          if (
            component.config.configSections &&
            component.config.configSections.includes(configData.section)
          ) {
            // Émission d'un événement de mise à jour pour ce composant spécifique
            this.eventBus.emit(this.EVENT_TYPES.UI_COMPONENT_CONFIG_UPDATED, {
              componentId,
              configSection: configData.section,
              configData: configData.data
            });
          }
        }
      }
    } catch (error) {
      this._emitError(`Erreur lors de la mise à jour de configuration: ${error.message}`);
    }
  }

  /**
   * Gère la fermeture de l'application
   * @private
   */
  _handleAppShutdown() {
    try {
      this.logger.info('ComponentRegistry: Nettoyage des ressources avant fermeture...');

      // Nettoyer le registre
      this.components.clear();

      // Se désabonner des événements
      if (this.eventBus && this.EVENT_TYPES) {
        this.eventBus.off(this.EVENT_TYPES.UI_REGISTER_COMPONENT, this._handleRegisterComponent);
        this.eventBus.off(this.EVENT_TYPES.UI_GET_COMPONENT, this._handleGetComponent);
        this.eventBus.off(this.EVENT_TYPES.UI_UPDATE_COMPONENT, this._handleUpdateComponent);
        this.eventBus.off(this.EVENT_TYPES.UI_REMOVE_COMPONENT, this._handleRemoveComponent);
        this.eventBus.off(this.EVENT_TYPES.UI_GET_ALL_COMPONENTS, this._handleGetAllComponents);
        this.eventBus.off(this.EVENT_TYPES.APP_SHUTDOWN, this._handleAppShutdown);
        this.eventBus.off(this.EVENT_TYPES.CONFIG_UPDATED, this._handleConfigUpdated);
      }

      this.isReady = false;
      this.eventBus = null;

      this.logger.info('ComponentRegistry: Ressources nettoyées avec succès');
    } catch (error) {
      this._emitError(`Erreur lors du nettoyage des ressources: ${error.message}`);
    }
  }

  /**
   * Valide les données d'un composant
   * @param {Object} data - Les données du composant à valider
   * @returns {boolean} - true si les données sont valides, false sinon
   * @private
   */
  _validateComponentData(data) {
    if (!data) return false;

    // Vérification des champs obligatoires
    const requiredFields = ['type', 'name'];
    for (const field of requiredFields) {
      if (!data[field]) {
        this.logger.warn(`ComponentRegistry: Champ obligatoire manquant: ${field}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Émet une erreur via le bus d'événements
   * @param {string} message - Message d'erreur
   * @private
   */
  _emitError(message) {
    this.logger.error(`ComponentRegistry: ${message}`);

    if (this.eventBus && this.EVENT_TYPES) {
      this.eventBus.emit(this.EVENT_TYPES.UI_REGISTRY_ERROR, {
        message,
        timestamp: new Date().toISOString()
      });
    }
  }
}

// Instance singleton du registre
const registryInstance = new ComponentRegistry();

/**
 * Fonction d'initialisation exportée
 * Cette fonction est le point d'entrée de ce module
 * @param {Object} context - Le contexte d'application contenant le bus d'événements
 * @returns {Promise<void>}
 */
async function initialize(context) {
  if (!context || !context.eventBus) {
    console.error("ComponentRegistry: Impossible d'initialiser sans bus d'événements");
    return;
  }

  await registryInstance.initialize(context);
}

// Exports uniquement la fonction d'initialisation pour maintenir le singleton
module.exports = { initialize };

/**
 * Exemples d'utilisation (en commentaires pour référence uniquement):
 *
 * 1. Enregistrement d'un composant:
 * eventBus.emit('UI_REGISTER_COMPONENT', {
 *   type: 'button',
 *   name: 'downloadButton',
 *   element: buttonElement,
 *   config: {
 *     configSections: ['ui', 'theme'],
 *     color: 'primary'
 *   },
 *   state: {
 *     isActive: false
 *   }
 * }, callback);
 *
 * 2. Récupération d'un composant:
 * eventBus.emit('UI_GET_COMPONENT', {
 *   componentId: 'abc-123',
 *   requestedBy: 'download-manager'
 * }, (response) => {
 *   if (response.success) {
 *     const component = response.component;
 *     // Utilisation du composant...
 *   }
 * });
 *
 * 3. Mise à jour d'un composant:
 * eventBus.emit('UI_UPDATE_COMPONENT', {
 *   componentId: 'abc-123',
 *   state: {
 *     isActive: true,
 *     progress: 45
 *   }
 * });
 *
 * 4. Suppression d'un composant:
 * eventBus.emit('UI_REMOVE_COMPONENT', {
 *   componentId: 'abc-123'
 * });
 *
 * 5. Récupération de tous les composants d'un type:
 * eventBus.emit('UI_GET_ALL_COMPONENTS', {
 *   type: 'downloadItem'
 * }, (response) => {
 *   if (response.success) {
 *     const items = response.components;
 *     // Traitement des items...
 *   }
 * });
 */ // Registre central des composants
// Créé automatiquement le 2025-05-02
