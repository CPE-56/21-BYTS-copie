/**
 * @fileoverview Gestionnaire de stockage sécurisé de tokens pour 21 BYTS
 *
 * Ce module est responsable du stockage et de la gestion sécurisée des tokens
 * d'authentification pour les différents services de streaming (Tidal, Spotify, etc.).
 * Il fournit des mécanismes de chiffrement/déchiffrement, de persistance et
 * d'expiration des tokens, ainsi que des services d'actualisation automatique.
 *
 * Conçu selon l'architecture "Single File Component", ce module fonctionne de
 * manière totalement autonome, sans dépendances directes sur d'autres composants
 * du système. Toutes les interactions se font via le bus d'événements central.
 *
 * @module auth/secure-token-store
 *
 * @events
 * ÉCOUTE:
 * - APP:READY: Initialise le store lorsque l'application est prête
 * - CONFIG:LOADED: Charge la configuration initiale
 * - CONFIG:UPDATED: Met à jour la configuration
 * - AUTH:TOKENS_UPDATED: Enregistre de nouveaux tokens
 * - AUTH:STORE_TOKEN: Demande de stockage d'un token
 * - AUTH:RETRIEVE_TOKEN: Demande de récupération d'un token
 * - AUTH:DELETE_TOKEN: Demande de suppression d'un token
 * - AUTH:CHECK_TOKEN_VALIDITY: Vérifie si un token est toujours valide
 * - AUTH:VERIFY_TOKEN: Vérifie si un token est présent et valide
 * - SYSTEM:PERIODIC_CHECK: Vérifie périodiquement les tokens expirés
 *
 * ÉMET:
 * - AUTH:TOKEN_STORED: Un token a été stocké avec succès
 * - AUTH:TOKEN_RETRIEVED: Un token a été récupéré avec succès
 * - AUTH:TOKEN_DELETED: Un token a été supprimé avec succès
 * - AUTH:TOKEN_EXPIRED: Un token a expiré
 * - AUTH:TOKEN_VALID: Un token est valide
 * - AUTH:TOKEN_INVALID: Un token est invalide ou absent
 * - AUTH:TOKENS_EXPIRED: Liste des tokens expirés
 * - ERROR:NON_CRITICAL: Une erreur non critique s'est produite
 * - LOG:INFO: Message d'information
 * - LOG:WARNING: Message d'avertissement
 * - LOG:ERROR: Message d'erreur
 */

'use strict';

// Dépendances Node.js standard
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * SecureTokenStore - Gestionnaire de stockage sécurisé de tokens
 */
function SecureTokenStore() {
  // Bus d'événements - injecté lors de l'initialisation
  let eventBus = null;

  // Références vers les constantes standardisées
  let EVENT_TYPES = null;
  let ERROR_CODES = null;

  // Configuration par défaut
  const DEFAULT_CONFIG = {
    enabled: true,
    storageDir: '', // Sera défini automatiquement
    encryptionAlgorithm: 'aes-256-gcm',
    tokenExpiryCheck: true,
    checkInterval: 3600000, // 1 heure en millisecondes
    automaticRefresh: true, // Actualisation automatique des tokens sur le point d'expirer
    refreshThreshold: 86400000, // 24 heures en millisecondes
    secureDelete: true, // Écrasement sécurisé lors de la suppression
    tokenLifetimeDefaults: {
      // Valeurs par défaut pour les services qui n'indiquent pas de durée
      tidal: 7 * 24 * 3600 * 1000, // 7 jours
      spotify: 30 * 24 * 3600 * 1000, // 30 jours
      soundcloud: 30 * 24 * 3600 * 1000 // 30 jours
    },
    storeFileName: 'token-store.dat'
  };

  // Configuration active
  let config = { ...DEFAULT_CONFIG };

  // État interne
  let state = {
    initialized: false,
    encryptionKey: null, // Clé principale de chiffrement
    tokens: new Map(), // Cache en mémoire des tokens
    checkTimer: null, // Timer pour la vérification périodique
    dirty: false // Indique si des modifications sont en attente d'écriture
  };

  /**
   * Initialise le module et s'enregistre auprès du bus d'événements
   * @param {Object} injectedEventBus - Le bus d'événements à utiliser
   * @param {Object} eventTypes - Types d'événements standardisés
   * @param {Object} errorCodes - Codes d'erreur standardisés
   */
  function initialize(injectedEventBus, eventTypes, errorCodes) {
    if (!injectedEventBus) {
      console.error("SecureTokenStore: EventBus est requis pour l'initialisation");
      return;
    }

    eventBus = injectedEventBus;
    EVENT_TYPES = eventTypes || {};
    ERROR_CODES = errorCodes || {};

    // Définir le répertoire de stockage par défaut
    config.storageDir = path.join(os.homedir(), '.21byts', 'secure-data');

    // S'abonner aux événements
    registerEventListeners();

    state.initialized = true;

    logInfo('SecureTokenStore initialisé');
  }

  /**
   * Enregistre les écouteurs d'événements
   */
  function registerEventListeners() {
    // Événements système
    eventBus.subscribe(EVENT_TYPES.APP.READY, onAppReady);
    eventBus.subscribe(EVENT_TYPES.CONFIG.LOADED, onConfigLoaded);
    eventBus.subscribe(EVENT_TYPES.CONFIG.UPDATED, onConfigUpdated);
    eventBus.subscribe(EVENT_TYPES.SYSTEM.PERIODIC_CHECK, onPeriodicCheck);

    // Événements d'authentification
    eventBus.subscribe(EVENT_TYPES.AUTH.TOKENS_UPDATED, onTokensUpdated);
    eventBus.subscribe(EVENT_TYPES.AUTH.STORE_TOKEN, onStoreToken);
    eventBus.subscribe(EVENT_TYPES.AUTH.RETRIEVE_TOKEN, onRetrieveToken);
    eventBus.subscribe(EVENT_TYPES.AUTH.DELETE_TOKEN, onDeleteToken);
    eventBus.subscribe(EVENT_TYPES.AUTH.CHECK_TOKEN_VALIDITY, onCheckTokenValidity);
    eventBus.subscribe(EVENT_TYPES.AUTH.VERIFY_TOKEN, onVerifyToken);
  }

  /**
   * Gère l'événement de démarrage de l'application
   */
  function onAppReady() {
    // Demander la configuration spécifique à ce module
    eventBus.publish(EVENT_TYPES.CONFIG.GET, {
      key: 'security',
      requestId: 'token-store-init'
    });

    logInfo("SecureTokenStore prêt à l'utilisation");
  }

  /**
   * Gère le chargement initial de la configuration
   * @param {Object} data - Données de configuration
   */
  function onConfigLoaded(data) {
    // Extraire la clé de chiffrement
    if (data && data.security && data.security.encryptionKey) {
      try {
        state.encryptionKey = Buffer.from(data.security.encryptionKey, 'hex');
        logInfo('Clé de chiffrement chargée');

        // Charger les tokens depuis le stockage persistant
        loadTokens();
      } catch (error) {
        publishError('ENCRYPTION_KEY_INVALID', 'Format de clé de chiffrement invalide', error);
      }
    } else {
      publishError('ENCRYPTION_KEY_MISSING', 'Clé de chiffrement manquante dans la configuration');
    }
  }

  /**
   * Gère les mises à jour de configuration
   * @param {Object} data - Données de configuration mises à jour
   */
  function onConfigUpdated(data) {
    // Vérifier si les données concernent ce module
    if (!data || !data.security) {
      return;
    }

    const securityConfig = data.security;

    // Mettre à jour les paramètres pertinents
    if (securityConfig.enabled !== undefined) {
      config.enabled = securityConfig.enabled;
    }

    if (securityConfig.encryptionAlgorithm) {
      config.encryptionAlgorithm = securityConfig.encryptionAlgorithm;
    }

    if (securityConfig.tokenExpiryCheck !== undefined) {
      config.tokenExpiryCheck = securityConfig.tokenExpiryCheck;
    }

    if (securityConfig.checkInterval) {
      config.checkInterval = securityConfig.checkInterval;
    }

    if (securityConfig.automaticRefresh !== undefined) {
      config.automaticRefresh = securityConfig.automaticRefresh;
    }

    if (securityConfig.refreshThreshold) {
      config.refreshThreshold = securityConfig.refreshThreshold;
    }

    if (securityConfig.secureDelete !== undefined) {
      config.secureDelete = securityConfig.secureDelete;
    }

    if (securityConfig.tokenLifetimeDefaults) {
      config.tokenLifetimeDefaults = {
        ...config.tokenLifetimeDefaults,
        ...securityConfig.tokenLifetimeDefaults
      };
    }

    if (securityConfig.storageDir) {
      config.storageDir = securityConfig.storageDir;
    }

    // Si la clé de chiffrement a été mise à jour
    if (securityConfig.encryptionKey) {
      try {
        const newKey = Buffer.from(securityConfig.encryptionKey, 'hex');

        // Si nous avions déjà une clé, nous devons re-chiffrer les tokens existants
        if (state.encryptionKey) {
          reEncryptTokens(state.encryptionKey, newKey);
        }

        state.encryptionKey = newKey;
        logInfo('Clé de chiffrement mise à jour');
      } catch (error) {
        publishError('ENCRYPTION_KEY_INVALID', 'Format de clé de chiffrement invalide', error);
      }
    }

    logInfo('Configuration du SecureTokenStore mise à jour');
  }

  /**
   * Gère l'événement de vérification périodique des tokens
   */
  function onPeriodicCheck() {
    if (!config.enabled || !config.tokenExpiryCheck) {
      return;
    }

    const now = Date.now();
    const expiredTokens = [];
    const expiringTokens = [];

    // Vérifier chaque token
    for (const [serviceId, tokenData] of state.tokens.entries()) {
      // Ignorer les tokens sans date d'expiration
      if (!tokenData.expiresAt) {
        continue;
      }

      const timeToExpiry = tokenData.expiresAt - now;

      // Si le token a expiré
      if (timeToExpiry <= 0) {
        expiredTokens.push({
          serviceId,
          expiresAt: tokenData.expiresAt
        });
      }
      // Si le token va expirer bientôt et que le rafraîchissement automatique est activé
      else if (config.automaticRefresh && timeToExpiry <= config.refreshThreshold) {
        expiringTokens.push({
          serviceId,
          expiresAt: tokenData.expiresAt,
          timeToExpiry
        });
      }
    }

    // Publier les tokens expirés
    if (expiredTokens.length > 0) {
      eventBus.publish(EVENT_TYPES.AUTH.TOKENS_EXPIRED, {
        tokens: expiredTokens,
        timestamp: now
      });

      // Journaliser les expirations
      logWarning(`${expiredTokens.length} tokens expirés détectés`, {
        expiredTokens: expiredTokens.map((t) => t.serviceId)
      });
    }

    // Pour les tokens qui expirent bientôt, demander un rafraîchissement
    expiringTokens.forEach((token) => {
      eventBus.publish(EVENT_TYPES.AUTH.TOKEN_REFRESH_NEEDED, {
        serviceId: token.serviceId,
        expiresAt: token.expiresAt,
        timeToExpiry: token.timeToExpiry
      });

      logInfo(`Token sur le point d'expirer, rafraîchissement demandé: ${token.serviceId}`, {
        timeToExpiry: Math.floor(token.timeToExpiry / 3600000) + ' heures'
      });
    });
  }

  /**
   * Gère la mise à jour des tokens (typiquement lors d'une authentification réussie)
   * @param {Object} data - Données des tokens mis à jour
   */
  function onTokensUpdated(data) {
    if (!data || !data.service) {
      publishError('INVALID_TOKEN_DATA', 'Données de token invalides: service manquant');
      return;
    }

    try {
      const service = data.service;
      const tokens = data.tokens;

      if (!tokens) {
        publishError('INVALID_TOKEN_DATA', 'Données de token invalides: tokens manquants');
        return;
      }

      // Créer un objet TokenData standardisé
      const tokenData = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken || null,
        tokenType: tokens.tokenType || 'Bearer',
        scope: tokens.scope || '',
        storedAt: Date.now()
      };

      // Calculer la date d'expiration
      if (tokens.expiresIn) {
        // Si exprimé en secondes depuis maintenant
        tokenData.expiresAt = Date.now() + tokens.expiresIn * 1000;
      } else if (tokens.expiresAt) {
        // Si une date d'expiration absolue est fournie (en millisecondes)
        tokenData.expiresAt = tokens.expiresAt;
      } else {
        // Utiliser la valeur par défaut pour ce service
        const defaultLifetime =
          config.tokenLifetimeDefaults[service.toLowerCase()] || 24 * 3600 * 1000; // 24h par défaut
        tokenData.expiresAt = Date.now() + defaultLifetime;
      }

      // Stocker les meta-informations non sensibles
      tokenData.metadata = {
        service,
        userId: data.userId || tokens.userId || 'unknown',
        createdAt: Date.now()
      };

      // Stocker le token
      storeTokenData(service, tokenData);

      // Journaliser le succès
      logInfo(`Tokens mis à jour pour le service: ${service}`, {
        userId: tokenData.metadata.userId,
        expiresAt: new Date(tokenData.expiresAt).toISOString()
      });
    } catch (error) {
      publishError('TOKEN_UPDATE_FAILED', 'Mise à jour des tokens échouée', error);
    }
  }

  /**
   * Gère une demande de stockage de token
   * @param {Object} data - Données de la demande
   */
  function onStoreToken(data) {
    if (!data || !data.serviceId || !data.token) {
      publishError('INVALID_STORE_REQUEST', 'Données invalides pour le stockage de token');

      // Répondre avec une erreur si un ID de requête est fourni
      if (data && data.requestId) {
        eventBus.publish(EVENT_TYPES.AUTH.TOKEN_STORED, {
          requestId: data.requestId,
          success: false,
          error: 'Données invalides pour le stockage de token'
        });
      }

      return;
    }

    try {
      const serviceId = data.serviceId;
      const token = data.token;
      const metadata = data.metadata || {};

      // Créer l'objet TokenData
      const tokenData = {
        accessToken: token.accessToken || token.access_token,
        refreshToken: token.refreshToken || token.refresh_token || null,
        tokenType: token.tokenType || token.token_type || 'Bearer',
        scope: token.scope || '',
        storedAt: Date.now()
      };

      // Calculer la date d'expiration
      if (token.expiresIn || token.expires_in) {
        tokenData.expiresAt = Date.now() + (token.expiresIn || token.expires_in) * 1000;
      } else if (token.expiresAt || token.expires_at) {
        tokenData.expiresAt = token.expiresAt || token.expires_at;
      } else {
        // Utiliser la valeur par défaut pour ce service
        const defaultLifetime =
          config.tokenLifetimeDefaults[serviceId.toLowerCase()] || 24 * 3600 * 1000; // 24h par défaut
        tokenData.expiresAt = Date.now() + defaultLifetime;
      }

      // Stocker les meta-informations
      tokenData.metadata = {
        service: serviceId,
        userId: metadata.userId || token.userId || 'unknown',
        createdAt: Date.now(),
        ...metadata
      };

      // Stocker le token
      storeTokenData(serviceId, tokenData);

      // Répondre avec succès si un ID de requête est fourni
      if (data.requestId) {
        eventBus.publish(EVENT_TYPES.AUTH.TOKEN_STORED, {
          requestId: data.requestId,
          success: true,
          serviceId,
          expiresAt: tokenData.expiresAt
        });
      }

      logInfo(`Token stocké pour le service: ${serviceId}`, {
        userId: tokenData.metadata.userId,
        expiresAt: new Date(tokenData.expiresAt).toISOString()
      });
    } catch (error) {
      publishError('TOKEN_STORE_FAILED', 'Stockage du token échoué', error);

      // Répondre avec une erreur si un ID de requête est fourni
      if (data && data.requestId) {
        eventBus.publish(EVENT_TYPES.AUTH.TOKEN_STORED, {
          requestId: data.requestId,
          success: false,
          error: `Stockage du token échoué: ${error.message}`
        });
      }
    }
  }

  /**
   * Gère une demande de récupération de token
   * @param {Object} data - Données de la demande
   */
  function onRetrieveToken(data) {
    if (!data || !data.serviceId) {
      publishError('INVALID_RETRIEVE_REQUEST', 'Données invalides pour la récupération de token');

      // Répondre avec une erreur si un ID de requête est fourni
      if (data && data.requestId) {
        eventBus.publish(EVENT_TYPES.AUTH.TOKEN_RETRIEVED, {
          requestId: data.requestId,
          success: false,
          error: 'Données invalides pour la récupération de token'
        });
      }

      return;
    }

    try {
      const serviceId = data.serviceId;

      // Vérifier si le token existe
      if (!state.tokens.has(serviceId)) {
        // Essayer de charger depuis le stockage
        loadTokens();

        // Vérifier à nouveau
        if (!state.tokens.has(serviceId)) {
          if (data.requestId) {
            eventBus.publish(EVENT_TYPES.AUTH.TOKEN_RETRIEVED, {
              requestId: data.requestId,
              success: false,
              error: `Aucun token trouvé pour le service: ${serviceId}`
            });
          }

          return;
        }
      }

      const tokenData = state.tokens.get(serviceId);

      // Vérifier si le token a expiré
      if (config.tokenExpiryCheck && tokenData.expiresAt && tokenData.expiresAt < Date.now()) {
        // Publier l'événement d'expiration
        eventBus.publish(EVENT_TYPES.AUTH.TOKEN_EXPIRED, {
          serviceId,
          expiresAt: tokenData.expiresAt
        });

        if (data.requestId) {
          eventBus.publish(EVENT_TYPES.AUTH.TOKEN_RETRIEVED, {
            requestId: data.requestId,
            success: false,
            error: `Token expiré pour le service: ${serviceId}`,
            expired: true,
            expiresAt: tokenData.expiresAt
          });
        }

        logWarning(`Tentative d'utilisation d'un token expiré: ${serviceId}`, {
          expiresAt: new Date(tokenData.expiresAt).toISOString()
        });

        return;
      }

      // Tout est bon, renvoyer le token
      if (data.requestId) {
        eventBus.publish(EVENT_TYPES.AUTH.TOKEN_RETRIEVED, {
          requestId: data.requestId,
          success: true,
          serviceId,
          token: {
            accessToken: tokenData.accessToken,
            refreshToken: tokenData.refreshToken,
            tokenType: tokenData.tokenType,
            expiresAt: tokenData.expiresAt
          },
          metadata: tokenData.metadata
        });
      }

      logInfo(`Token récupéré pour le service: ${serviceId}`);
    } catch (error) {
      publishError('TOKEN_RETRIEVE_FAILED', 'Récupération du token échouée', error);

      // Répondre avec une erreur si un ID de requête est fourni
      if (data && data.requestId) {
        eventBus.publish(EVENT_TYPES.AUTH.TOKEN_RETRIEVED, {
          requestId: data.requestId,
          success: false,
          error: `Récupération du token échouée: ${error.message}`
        });
      }
    }
  }

  /**
   * Gère une demande de suppression de token
   * @param {Object} data - Données de la demande
   */
  function onDeleteToken(data) {
    if (!data || !data.serviceId) {
      publishError('INVALID_DELETE_REQUEST', 'Données invalides pour la suppression de token');

      // Répondre avec une erreur si un ID de requête est fourni
      if (data && data.requestId) {
        eventBus.publish(EVENT_TYPES.AUTH.TOKEN_DELETED, {
          requestId: data.requestId,
          success: false,
          error: 'Données invalides pour la suppression de token'
        });
      }

      return;
    }

    try {
      const serviceId = data.serviceId;

      // Vérifier si le token existe
      if (!state.tokens.has(serviceId)) {
        // Pas d'erreur, juste un avertissement
        logWarning(`Tentative de suppression d'un token inexistant: ${serviceId}`);

        if (data.requestId) {
          eventBus.publish(EVENT_TYPES.AUTH.TOKEN_DELETED, {
            requestId: data.requestId,
            success: true,
            serviceId,
            warning: 'Token déjà absent'
          });
        }

        return;
      }

      // Supprimer le token
      state.tokens.delete(serviceId);
      state.dirty = true;

      // Sauvegarder les changements
      saveTokens();

      // Répondre avec succès si un ID de requête est fourni
      if (data.requestId) {
        eventBus.publish(EVENT_TYPES.AUTH.TOKEN_DELETED, {
          requestId: data.requestId,
          success: true,
          serviceId
        });
      }

      logInfo(`Token supprimé pour le service: ${serviceId}`);
    } catch (error) {
      publishError('TOKEN_DELETE_FAILED', 'Suppression du token échouée', error);

      // Répondre avec une erreur si un ID de requête est fourni
      if (data && data.requestId) {
        eventBus.publish(EVENT_TYPES.AUTH.TOKEN_DELETED, {
          requestId: data.requestId,
          success: false,
          error: `Suppression du token échouée: ${error.message}`
        });
      }
    }
  }

  /**
   * Gère une demande de vérification de validité d'un token
   * @param {Object} data - Données de la demande
   */
  function onCheckTokenValidity(data) {
    if (!data || !data.serviceId) {
      publishError('INVALID_CHECK_REQUEST', 'Données invalides pour la vérification de token');

      // Répondre avec une erreur si un ID de requête est fourni
      if (data && data.requestId) {
        eventBus.publish(EVENT_TYPES.AUTH.TOKEN_INVALID, {
          requestId: data.requestId,
          error: 'Données invalides pour la vérification de token'
        });
      }

      return;
    }

    try {
      const serviceId = data.serviceId;

      // Vérifier si le token existe
      if (!state.tokens.has(serviceId)) {
        if (data.requestId) {
          eventBus.publish(EVENT_TYPES.AUTH.TOKEN_INVALID, {
            requestId: data.requestId,
            serviceId,
            reason: 'not_found'
          });
        }

        return;
      }

      const tokenData = state.tokens.get(serviceId);

      // Vérifier si le token a expiré
      if (config.tokenExpiryCheck && tokenData.expiresAt && tokenData.expiresAt < Date.now()) {
        if (data.requestId) {
          eventBus.publish(EVENT_TYPES.AUTH.TOKEN_INVALID, {
            requestId: data.requestId,
            serviceId,
            reason: 'expired',
            expiresAt: tokenData.expiresAt
          });
        }

        // Publier l'événement d'expiration
        eventBus.publish(EVENT_TYPES.AUTH.TOKEN_EXPIRED, {
          serviceId,
          expiresAt: tokenData.expiresAt
        });

        return;
      }

      // Le token est valide
      if (data.requestId) {
        eventBus.publish(EVENT_TYPES.AUTH.TOKEN_VALID, {
          requestId: data.requestId,
          serviceId,
          expiresAt: tokenData.expiresAt,
          metadata: tokenData.metadata
        });
      }
    } catch (error) {
      publishError('TOKEN_CHECK_FAILED', 'Vérification du token échouée', error);

      // Répondre avec une erreur si un ID de requête est fourni
      if (data && data.requestId) {
        eventBus.publish(EVENT_TYPES.AUTH.TOKEN_INVALID, {
          requestId: data.requestId,
          error: `Vérification du token échouée: ${error.message}`
        });
      }
    }
  }

  /**
   * Gère une demande de vérification de l'existence et validité d'un token
   * @param {Object} data - Données de la demande
   */
  function onVerifyToken(data) {
    if (!data || !data.serviceId) {
      publishError('INVALID_VERIFY_REQUEST', 'Données invalides pour la vérification de token');
      return;
    }

    // Cette fonction est similaire à checkTokenValidity mais avec une interface simplifiée
    // pour les composants qui ont uniquement besoin de savoir si un token valide existe

    try {
      const serviceId = data.serviceId;
      const requestId = data.requestId;

      // Vérifier si le token existe
      if (!state.tokens.has(serviceId)) {
        eventBus.publish(EVENT_TYPES.AUTH.TOKEN_INVALID, {
          requestId,
          serviceId,
          reason: 'not_found'
        });
        return;
      }

      const tokenData = state.tokens.get(serviceId);

      // Vérifier si le token a expiré
      if (config.tokenExpiryCheck && tokenData.expiresAt && tokenData.expiresAt < Date.now()) {
        eventBus.publish(EVENT_TYPES.AUTH.TOKEN_INVALID, {
          requestId,
          serviceId,
          reason: 'expired',
          expiresAt: tokenData.expiresAt
        });
        return;
      }

      // Calculer le temps restant avant expiration
      const timeToExpiry = tokenData.expiresAt ? tokenData.expiresAt - Date.now() : null;

      // Le token est valide
      eventBus.publish(EVENT_TYPES.AUTH.TOKEN_VALID, {
        requestId,
        serviceId,
        expiresAt: tokenData.expiresAt,
        timeToExpiry,
        metadata: tokenData.metadata
      });
    } catch (error) {
      publishError('TOKEN_VERIFY_FAILED', 'Vérification du token échouée', error);

      if (data.requestId) {
        eventBus.publish(EVENT_TYPES.AUTH.TOKEN_INVALID, {
          requestId: data.requestId,
          error: `Vérification du token échouée: ${error.message}`
        });
      }
    }
  }

  /**
   * Stocke les données d'un token
   * @param {string} serviceId - Identifiant du service
   * @param {Object} tokenData - Données du token
   */
  function storeTokenData(serviceId, tokenData) {
    if (!state.encryptionKey) {
      throw new Error('Clé de chiffrement non initialisée');
    }

    // Stocker le token dans le cache en mémoire
    state.tokens.set(serviceId, tokenData);
    state.dirty = true;

    // Enregistrer les changements dans le stockage persistant
    saveTokens();
  }

  /**
   * Charge les tokens depuis le stockage persistant
   */
  function loadTokens() {
    try {
      // Vérifier que la clé de chiffrement est disponible
      if (!state.encryptionKey) {
        throw new Error('Clé de chiffrement non initialisée');
      }

      // S'assurer que le répertoire de stockage existe
      ensureDirectoryExists(config.storageDir);

      const storePath = path.join(config.storageDir, config.storeFileName);

      // Vérifier si le fichier existe
      if (!fs.existsSync(storePath)) {
        logInfo("Aucun fichier de stockage de tokens trouvé, création d'un nouveau store");
        state.tokens = new Map();
        return;
      }

      // Lire le fichier chiffré
      const encryptedData = fs.readFileSync(storePath);

      // Déchiffrer les données
      const decryptedData = decryptData(encryptedData);
      const tokensData = JSON.parse(decryptedData);

      // Convertir en Map
      state.tokens = new Map();

      for (const [serviceId, tokenData] of Object.entries(tokensData)) {
        state.tokens.set(serviceId, tokenData);
      }

      logInfo(`Tokens chargés depuis le stockage: ${state.tokens.size} services`);
    } catch (error) {
      publishError('LOAD_TOKENS_FAILED', 'Chargement des tokens échoué', error);

      // Réinitialiser en cas d'erreur
      state.tokens = new Map();
    }
  }

  /**
   * Sauvegarde les tokens dans le stockage persistant
   */
  function saveTokens() {
    if (!state.dirty) {
      return;
    }

    try {
      // Vérifier que la clé de chiffrement est disponible
      if (!state.encryptionKey) {
        throw new Error('Clé de chiffrement non initialisée');
      }

      // S'assurer que le répertoire de stockage existe
      ensureDirectoryExists(config.storageDir);

      const storePath = path.join(config.storageDir, config.storeFileName);

      // Convertir la Map en objet pour la sérialisation
      const tokensObj = {};

      for (const [serviceId, tokenData] of state.tokens.entries()) {
        tokensObj[serviceId] = tokenData;
      }

      // Sérialiser et chiffrer les données
      const jsonData = JSON.stringify(tokensObj);
      const encryptedData = encryptData(jsonData);

      // Écrire dans le fichier
      fs.writeFileSync(storePath, encryptedData);

      // Réinitialiser le flag de modification
      state.dirty = false;

      logInfo(`Tokens sauvegardés dans le stockage: ${state.tokens.size} services`);
    } catch (error) {
      publishError('SAVE_TOKENS_FAILED', 'Sauvegarde des tokens échouée', error);
    }
  }

  /**
   * Re-chiffre tous les tokens avec une nouvelle clé
   * @param {Buffer} oldKey - Ancienne clé de chiffrement
   * @param {Buffer} newKey - Nouvelle clé de chiffrement
   */
  function reEncryptTokens(oldKey, newKey) {
    try {
      // Sauvegarde temporaire de la clé actuelle
      const tempKey = state.encryptionKey;

      // Utiliser l'ancienne clé pour charger les tokens
      state.encryptionKey = oldKey;
      loadTokens();

      // Utiliser la nouvelle clé pour enregistrer les tokens
      state.encryptionKey = newKey;
      state.dirty = true;
      saveTokens();

      logInfo('Tokens re-chiffrés avec la nouvelle clé');
    } catch (error) {
      publishError('REENCRYPT_TOKENS_FAILED', 'Re-chiffrement des tokens échoué', error);
    }
  }

  /**
   * Chiffre des données
   * @param {string} data - Données à chiffrer
   * @returns {Buffer} Données chiffrées
   */
  function encryptData(data) {
    try {
      // Générer un IV aléatoire
      const iv = crypto.randomBytes(12); // 12 octets pour GCM

      // Créer le chiffreur
      const cipher = crypto.createCipheriv(config.encryptionAlgorithm, state.encryptionKey, iv);

      // Chiffrer les données
      let encrypted = cipher.update(data, 'utf8');
      encrypted = Buffer.concat([encrypted, cipher.final()]);

      // Obtenir le tag d'authentification (pour GCM)
      const authTag = cipher.getAuthTag();

      // Concaténer IV + AuthTag + Données chiffrées pour le stockage
      return Buffer.concat([
        // Format: 1 octet pour la version, 1 octet pour la longueur de l'IV,
        // IV, 1 octet pour la longueur du tag, AuthTag, Données chiffrées
        Buffer.from([1, iv.length]), // Version 1, longueur de l'IV
        iv,
        Buffer.from([authTag.length]),
        authTag,
        encrypted
      ]);
    } catch (error) {
      throw new Error(`Échec du chiffrement: ${error.message}`);
    }
  }

  /**
   * Déchiffre des données
   * @param {Buffer} encryptedData - Données chiffrées
   * @returns {string} Données en clair
   */
  function decryptData(encryptedData) {
    try {
      // Format: Version(1) + IVLength(1) + IV + TagLength(1) + AuthTag + EncryptedData

      // Lire l'en-tête
      const version = encryptedData[0];

      if (version !== 1) {
        throw new Error(`Version de format non supportée: ${version}`);
      }

      const ivLength = encryptedData[1];
      const iv = encryptedData.slice(2, 2 + ivLength);

      const tagLength = encryptedData[2 + ivLength];
      const authTag = encryptedData.slice(3 + ivLength, 3 + ivLength + tagLength);

      const encrypted = encryptedData.slice(3 + ivLength + tagLength);

      // Créer le déchiffreur
      const decipher = crypto.createDecipheriv(config.encryptionAlgorithm, state.encryptionKey, iv);

      // Définir le tag d'authentification
      decipher.setAuthTag(authTag);

      // Déchiffrer les données
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      return decrypted.toString('utf8');
    } catch (error) {
      throw new Error(`Échec du déchiffrement: ${error.message}`);
    }
  }

  /**
   * S'assure qu'un répertoire existe, le crée si nécessaire
   * @param {string} dirPath - Chemin du répertoire
   */
  function ensureDirectoryExists(dirPath) {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        logInfo(`Répertoire créé: ${dirPath}`);
      }
    } catch (error) {
      throw new Error(`Impossible de créer le répertoire ${dirPath}: ${error.message}`);
    }
  }

  /**
   * Supprime de manière sécurisée un fichier
   * @param {string} filePath - Chemin du fichier à supprimer
   */
  function secureDelete(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        return; // Fichier déjà absent
      }

      if (!config.secureDelete) {
        // Suppression simple
        fs.unlinkSync(filePath);
        return;
      }

      // Suppression sécurisée (écrasement des données)
      const fileSize = fs.statSync(filePath).size;
      const fd = fs.openSync(filePath, 'r+');

      // Écraser 3 fois avec des motifs différents
      const buffer = Buffer.alloc(64 * 1024); // 64KB buffer

      // Passe 1: Zéros
      buffer.fill(0);
      secureDeletePass(fd, buffer, fileSize);

      // Passe 2: Uns
      buffer.fill(255);
      secureDeletePass(fd, buffer, fileSize);

      // Passe 3: Aléatoire
      crypto.randomFillSync(buffer);
      secureDeletePass(fd, buffer, fileSize);

      // Fermer et supprimer le fichier
      fs.closeSync(fd);
      fs.unlinkSync(filePath);
    } catch (error) {
      publishError('SECURE_DELETE_FAILED', `Suppression sécurisée échouée pour ${filePath}`, error);
    }
  }

  /**
   * Effectue une passe d'écriture pour la suppression sécurisée
   * @param {number} fd - Descripteur de fichier
   * @param {Buffer} buffer - Buffer à écrire
   * @param {number} fileSize - Taille du fichier
   */
  function secureDeletePass(fd, buffer, fileSize) {
    let position = 0;

    while (position < fileSize) {
      const bufferSize = Math.min(buffer.length, fileSize - position);
      fs.writeSync(fd, buffer, 0, bufferSize, position);
      position += bufferSize;
    }

    // Synchoniser pour s'assurer que les données sont écrites sur le disque
    fs.fsyncSync(fd);
  }

  /**
   * Publie un message d'information
   * @param {string} message - Message à publier
   * @param {Object} [details] - Détails supplémentaires
   */
  function logInfo(message, details = {}) {
    if (!eventBus) return;

    eventBus.publish(EVENT_TYPES.LOG.INFO, {
      source: 'secure-token-store',
      message,
      details,
      timestamp: Date.now()
    });
  }

  /**
   * Publie un message d'avertissement
   * @param {string} message - Message à publier
   * @param {Object} [details] - Détails supplémentaires
   */
  function logWarning(message, details = {}) {
    if (!eventBus) return;

    eventBus.publish(EVENT_TYPES.LOG.WARNING, {
      source: 'secure-token-store',
      message,
      details,
      timestamp: Date.now()
    });
  }

  /**
   * Publie un message d'erreur
   * @param {string} code - Code d'erreur
   * @param {string} message - Message d'erreur
   * @param {Error} [error] - Objet d'erreur
   */
  function publishError(code, message, error = null) {
    if (!eventBus) return;

    // Utiliser le code d'erreur standardisé si disponible
    const errorCode = ERROR_CODES && ERROR_CODES[code] ? ERROR_CODES[code] : code;

    // Publier l'erreur
    eventBus.publish(EVENT_TYPES.ERROR.NON_CRITICAL, {
      source: 'secure-token-store',
      code: errorCode,
      message,
      error: error ? error.message : null,
      stack: error ? error.stack : null,
      timestamp: Date.now()
    });

    // Journaliser l'erreur
    eventBus.publish(EVENT_TYPES.LOG.ERROR, {
      source: 'secure-token-store',
      message: `${code}: ${message}`,
      error: error ? error.message : null,
      timestamp: Date.now()
    });
  }

  /**
   * Nettoie les ressources avant la fermeture de l'application
   */
  function cleanup() {
    // Sauvegarder les tokens si des modifications sont en attente
    if (state.dirty) {
      saveTokens();
    }

    // Arrêter le timer de vérification
    if (state.checkTimer) {
      clearInterval(state.checkTimer);
      state.checkTimer = null;
    }

    logInfo('SecureTokenStore nettoyé avant fermeture');
  }

  // Interface publique (seule la fonction d'initialisation est exposée)
  return {
    initialize
  };
}

// Créer et exporter l'instance singleton
const secureTokenStore = SecureTokenStore();
module.exports = secureTokenStore;

/**
 * Exemples d'utilisation:
 *
 * // Initialisation
 * const eventBus = require('../core/event-bus').getInstance();
 * const EVENT_TYPES = require('../constants/event-types');
 * const ERROR_CODES = require('../constants/error-codes');
 * const secureTokenStore = require('./secure-token-store');
 *
 * secureTokenStore.initialize(eventBus, EVENT_TYPES, ERROR_CODES);
 *
 * // Stocker un token (par un autre module, via le bus d'événements)
 * eventBus.publish(EVENT_TYPES.AUTH.STORE_TOKEN, {
 *   requestId: 'store-1',
 *   serviceId: 'tidal',
 *   token: {
 *     accessToken: 'eyJhbGc...',
 *     refreshToken: 'aHR0cHM...',
 *     tokenType: 'Bearer',
 *     expiresIn: 3600 // En secondes
 *   },
 *   metadata: {
 *     userId: 'user123',
 *     country: 'FR'
 *   }
 * });
 *
 * // Récupérer un token
 * eventBus.publish(EVENT_TYPES.AUTH.RETRIEVE_TOKEN, {
 *   requestId: 'retrieve-1',
 *   serviceId: 'tidal'
 * });
 *
 * // Écouter la réponse
 * eventBus.subscribe(EVENT_TYPES.AUTH.TOKEN_RETRIEVED, (data) => {
 *   if (data.requestId === 'retrieve-1' && data.success) {
 *     // Utiliser le token
 *     const accessToken = data.token.accessToken;
 *     const tokenType = data.token.tokenType;
 *
 *     // Exemple d'utilisation avec fetch
 *     fetch('https://api.tidal.com/v1/tracks/123', {
 *       headers: {
 *         'Authorization': `${tokenType} ${accessToken}`
 *       }
 *     });
 *   }
 * });
 *
 * // Vérifier si un token est valide
 * eventBus.publish(EVENT_TYPES.AUTH.VERIFY_TOKEN, {
 *   requestId: 'verify-1',
 *   serviceId: 'spotify'
 * });
 *
 * // Écouter la réponse
 * eventBus.subscribe(EVENT_TYPES.AUTH.TOKEN_VALID, (data) => {
 *   if (data.requestId === 'verify-1') {
 *     console.log(`Token valide jusqu'au ${new Date(data.expiresAt).toISOString()}`);
 *   }
 * });
 *
 * // Supprimer un token
 * eventBus.publish(EVENT_TYPES.AUTH.DELETE_TOKEN, {
 *   requestId: 'delete-1',
 *   serviceId: 'tidal'
 * });
 */ // Stockage sécurisé des tokens
// Créé automatiquement le 2025-05-02
