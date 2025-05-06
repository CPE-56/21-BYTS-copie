/**
 * @fileoverview Gestionnaire d'authentification pour l'application 21 BYTS
 *
 * Ce module gère l'authentification avec différentes plateformes de streaming
 * (Tidal, Spotify, etc.) et maintient l'état d'authentification pour chaque service.
 * Il orchestre les flux OAuth et autres méthodes d'authentification, gère les tokens
 * et leur stockage sécurisé, et fournit l'état d'authentification au reste de l'application.
 *
 * Conformément à l'architecture "Single File Component", ce module fonctionne
 * de manière totalement autonome sans dépendances directes sur d'autres modules du projet.
 * Toute communication se fait exclusivement via le bus d'événements.
 *
 * @module auth/auth-manager
 *
 * @requires electron
 * @requires node:url
 * @requires node:crypto
 * @requires node:https
 * @requires node:querystring
 *
 * @events
 * ÉCOUTE:
 * - APP:READY - Initialise le gestionnaire lorsque l'application est prête
 * - CONFIG:UPDATED - Met à jour la configuration du gestionnaire
 * - AUTH:LOGIN_REQUEST - Demande de connexion à un service
 * - AUTH:LOGOUT_REQUEST - Demande de déconnexion d'un service
 * - AUTH:CHECK_STATUS - Vérifie l'état d'authentification d'un service
 * - AUTH:TOKEN_RETRIEVED - Reçoit un token stocké (depuis secure-token-store)
 * - AUTH:TOKEN_STORED - Confirmation de stockage d'un token
 * - AUTH:TOKEN_EXPIRED - Notification d'expiration d'un token
 * - AUTH:OAUTH_CALLBACK - Callback reçu d'un processus OAuth
 * - AUTH:REFRESH_TOKEN - Demande de rafraîchissement d'un token
 *
 * ÉMET:
 * - AUTH:LOGIN_STARTED - Début du processus de connexion
 * - AUTH:LOGIN_SUCCESS - Connexion réussie
 * - AUTH:LOGIN_FAILED - Échec de la connexion
 * - AUTH:LOGOUT_SUCCESS - Déconnexion réussie
 * - AUTH:STATUS_RESPONSE - Réponse à une vérification d'état
 * - AUTH:STORE_TOKEN - Demande de stockage d'un token
 * - AUTH:RETRIEVE_TOKEN - Demande de récupération d'un token
 * - AUTH:DELETE_TOKEN - Demande de suppression d'un token
 * - AUTH:TOKENS_UPDATED - Tokens mis à jour
 * - ERROR:NON_CRITICAL - Erreur non critique
 * - LOG:INFO - Message d'information
 * - LOG:WARNING - Message d'avertissement
 * - LOG:ERROR - Message d'erreur
 */

'use strict';

// Dépendances externes standards
const { BrowserWindow, shell } = require('electron');
const url = require('node:url');
const crypto = require('node:crypto');
const https = require('node:https');
const querystring = require('node:querystring');

/**
 * Gestionnaire d'authentification pour 21 BYTS
 * @class AuthManager
 */
function AuthManager() {
  // Bus d'événements - sera injecté lors de l'initialisation
  let eventBus = null;

  // Références aux constantes standardisées
  let EVENT_TYPES = null;
  let ERROR_CODES = null;

  // Configuration par défaut
  const DEFAULT_CONFIG = {
    oauthRedirectPort: 8888,
    oauthRedirectPath: '/oauth/callback',
    oauthTimeoutMs: 300000, // 5 minutes
    autoRefreshTokens: true,
    services: {
      tidal: {
        enabled: true,
        clientId: '',  // À remplir depuis la configuration
        clientSecret: '',
        authUrl: 'https://auth.tidal.com/v1/oauth2/authorize',
        tokenUrl: 'https://auth.tidal.com/v1/oauth2/token',
        redirectUri: 'http://localhost:8888/oauth/callback',
        scope: 'r_usr w_usr',
        responseType: 'code',
        useDeviceCode: false,
        useExternalBrowser: false
      },
      spotify: {
        enabled: true,
        clientId: '',
        clientSecret: '',
        authUrl: 'https://accounts.spotify.com/authorize',
        tokenUrl: 'https://accounts.spotify.com/api/token',
        redirectUri: 'http://localhost:8888/oauth/callback',
        scope: 'user-read-private user-read-email playlist-read-private',
        responseType: 'code',
        useExternalBrowser: true
      },
      soundcloud: {
        enabled: true,
        clientId: '',
        clientSecret: '',
        authUrl: 'https://soundcloud.com/connect',
        tokenUrl: 'https://api.soundcloud.com/oauth2/token',
        redirectUri: 'http://localhost:8888/oauth/callback',
        scope: '*',
        responseType: 'code',
        useExternalBrowser: true
      }
    },
    secureStorage: true
  };

  // Configuration active
  let config = { ...DEFAULT_CONFIG };

  // État interne
  let state = {
    initialized: false,
    authStatus: {},          // État d'authentification par service
    pendingAuth: new Map(),  // Authentifications en cours
    authWindows: new Map(),  // Fenêtres d'authentification
    httpServer: null,        // Serveur temporaire pour la redirection OAuth
    pollingIntervals: {}     // Intervalles de polling (device code)
  };

  /**
   * Initialise le module et s'enregistre auprès du bus d'événements
   * @param {Object} injectedEventBus - Le bus d'événements à utiliser
   * @param {Object} eventTypes - Types d'événements standardisés
   * @param {Object} errorCodes - Codes d'erreur standardisés
   */
  function initialize(injectedEventBus, eventTypes, errorCodes) {
    if (!injectedEventBus) {
      console.error('AuthManager: EventBus est requis pour l\'initialisation');
      return;
    }

    eventBus = injectedEventBus;
    EVENT_TYPES = eventTypes || {};
    ERROR_CODES = errorCodes || {};

    // S'abonner aux événements
    registerEventListeners();

    state.initialized = true;

    logInfo('Module AuthManager initialisé');
  }

  /**
   * Enregistre les écouteurs d'événements
   */
  function registerEventListeners() {
    // Événements système
    eventBus.subscribe(EVENT_TYPES.APP.READY, onAppReady);
    eventBus.subscribe(EVENT_TYPES.CONFIG.UPDATED, onConfigUpdated);

    // Événements d'authentification
    eventBus.subscribe(EVENT_TYPES.AUTH.LOGIN_REQUEST, onLoginRequest);
    eventBus.subscribe(EVENT_TYPES.AUTH.LOGOUT_REQUEST, onLogoutRequest);
    eventBus.subscribe(EVENT_TYPES.AUTH.CHECK_STATUS, onCheckStatus);
    eventBus.subscribe(EVENT_TYPES.AUTH.TOKEN_RETRIEVED, onTokenRetrieved);
    eventBus.subscribe(EVENT_TYPES.AUTH.TOKEN_STORED, onTokenStored);
    eventBus.subscribe(EVENT_TYPES.AUTH.TOKEN_EXPIRED, onTokenExpired);
    eventBus.subscribe(EVENT_TYPES.AUTH.OAUTH_CALLBACK, onOAuthCallback);
    eventBus.subscribe(EVENT_TYPES.AUTH.REFRESH_TOKEN, onRefreshToken);
  }

  /**
   * Gère l'événement de démarrage de l'application
   */
  function onAppReady() {
    // Demander les configurations spécifiques
    eventBus.publish(EVENT_TYPES.CONFIG.GET, {
      key: 'auth',
      requestId: 'auth-manager-init'
    });

    // Vérifier l'état d'authentification pour tous les services
    setTimeout(() => {
      checkAllServicesAuth();
    }, 1000); // Petit délai pour permettre le chargement de la configuration

    logInfo('AuthManager prêt');
  }

  /**
   * Gère les mises à jour de configuration
   * @param {Object} data - Données de configuration
   */
  function onConfigUpdated(data) {
    // Vérifier si la configuration contient des informations d'authentification
    if (!data || !data.auth) {
      return;
    }

    const authConfig = data.auth;

    // Mettre à jour la configuration
    if (authConfig.oauthRedirectPort) {
      config.oauthRedirectPort = authConfig.oauthRedirectPort;
    }

    if (authConfig.oauthRedirectPath) {
      config.oauthRedirectPath = authConfig.oauthRedirectPath;
    }

    if (authConfig.oauthTimeoutMs !== undefined) {
      config.oauthTimeoutMs = authConfig.oauthTimeoutMs;
    }

    if (authConfig.autoRefreshTokens !== undefined) {
      config.autoRefreshTokens = authConfig.autoRefreshTokens;
    }

    if (authConfig.secureStorage !== undefined) {
      config.secureStorage = authConfig.secureStorage;
    }

    // Mettre à jour les configurations des services
    if (authConfig.services) {
      for (const [serviceName, serviceConfig] of Object.entries(authConfig.services)) {
        if (!config.services[serviceName]) {
          config.services[serviceName] = {};
        }

        // Fusionner la configuration
        config.services[serviceName] = {
          ...config.services[serviceName],
          ...serviceConfig
        };

        // Mettre à jour l'URI de redirection si le port a changé
        if (config.services[serviceName].redirectUri) {
          const parsedUri = url.parse(config.services[serviceName].redirectUri);
          if (parsedUri.port) {
            parsedUri.port = config.oauthRedirectPort.toString();
            config.services[serviceName].redirectUri = url.format(parsedUri);
          }
        }
      }
    }

    logInfo('Configuration du AuthManager mise à jour');
  }

  /**
   * Gère une demande de connexion à un service
   * @param {Object} data - Données de la demande
   */
  function onLoginRequest(data) {
    if (!data || !data.service) {
      publishError('INVALID_LOGIN_REQUEST', 'Service non spécifié dans la demande de connexion');

      if (data && data.requestId) {
        eventBus.publish(EVENT_TYPES.AUTH.LOGIN_FAILED, {
          requestId: data.requestId,
          error: 'Service non spécifié'
        });
      }

      return;
    }

    const service = data.service;
    const requestId = data.requestId;

    // Vérifier si le service est configuré
    if (!config.services[service]) {
      publishError('SERVICE_NOT_CONFIGURED', `Service non configuré: ${service}`);

      if (requestId) {
        eventBus.publish(EVENT_TYPES.AUTH.LOGIN_FAILED, {
          requestId,
          service,
          error: 'Service non configuré'
        });
      }

      return;
    }

    // Vérifier si le service est activé
    if (!config.services[service].enabled) {
      publishError('SERVICE_DISABLED', `Service désactivé: ${service}`);

      if (requestId) {
        eventBus.publish(EVENT_TYPES.AUTH.LOGIN_FAILED, {
          requestId,
          service,
          error: 'Service désactivé'
        });
      }

      return;
    }

    // Vérifier si une authentification est déjà en cours pour ce service
    if (state.pendingAuth.has(service)) {
      publishError('AUTH_ALREADY_IN_PROGRESS', `Authentification déjà en cours pour: ${service}`);

      if (requestId) {
        eventBus.publish(EVENT_TYPES.AUTH.LOGIN_FAILED, {
          requestId,
          service,
          error: 'Authentification déjà en cours'
        });
      }

      return;
    }

    // Démarrer le processus d'authentification
    logInfo(`Démarrage de l'authentification pour: ${service}`);

    // Publier l'événement de début d'authentification
    eventBus.publish(EVENT_TYPES.AUTH.LOGIN_STARTED, {
      requestId,
      service
    });

    // Déterminer la méthode d'authentification à utiliser
    const serviceConfig = config.services[service];

    // Utiliser le device code flow si configuré ainsi
    if (serviceConfig.useDeviceCode) {
      startDeviceCodeAuth(service, requestId);
    } else {
      // Utiliser le flux d'authentification standard (OAuth 2.0 Authorization Code Flow)
      startOAuthFlow(service, requestId, data.options || {});
    }
  }

  /**
   * Gère une demande de déconnexion d'un service
   * @param {Object} data - Données de la demande
   */
  function onLogoutRequest(data) {
    if (!data || !data.service) {
      publishError('INVALID_LOGOUT_REQUEST', 'Service non spécifié dans la demande de déconnexion');

      if (data && data.requestId) {
        eventBus.publish(EVENT_TYPES.AUTH.LOGOUT_FAILED, {
          requestId: data.requestId,
          error: 'Service non spécifié'
        });
      }

      return;
    }

    const service = data.service;
    const requestId = data.requestId;

    // Vérifier si le service est configuré
    if (!config.services[service]) {
      publishError('SERVICE_NOT_CONFIGURED', `Service non configuré: ${service}`);

      if (requestId) {
        eventBus.publish(EVENT_TYPES.AUTH.LOGOUT_FAILED, {
          requestId,
          service,
          error: 'Service non configuré'
        });
      }

      return;
    }

    logInfo(`Déconnexion du service: ${service}`);

    // Supprimer les tokens
    if (config.secureStorage) {
      // Demander la suppression du token au secure-token-store
      eventBus.publish(EVENT_TYPES.AUTH.DELETE_TOKEN, {
        requestId: `logout-${service}-${Date.now()}`,
        serviceId: service
      });
    }

    // Mettre à jour l'état d'authentification
    state.authStatus[service] = {
      authenticated: false,
      lastCheckTime: Date.now()
    };

    // Publier l'événement de déconnexion réussie
    eventBus.publish(EVENT_TYPES.AUTH.LOGOUT_SUCCESS, {
      requestId,
      service
    });

    // Fermer toute fenêtre d'authentification en cours
    if (state.authWindows.has(service)) {
      const authWindow = state.authWindows.get(service);
      if (!authWindow.isDestroyed()) {
        authWindow.close();
      }
      state.authWindows.delete(service);
    }

    // Supprimer les authentifications en cours
    state.pendingAuth.delete(service);

    // Arrêter le polling des device codes
    if (state.pollingIntervals[service]) {
      clearInterval(state.pollingIntervals[service]);
      delete state.pollingIntervals[service];
    }
  }

  /**
   * Gère une demande de vérification d'état d'authentification
   * @param {Object} data - Données de la demande
   */
  function onCheckStatus(data) {
    if (!data || !data.service) {
      // Si aucun service n'est spécifié, vérifier tous les services
      if (data && data.requestId) {
        const allStatuses = {};

        for (const service of Object.keys(config.services)) {
          allStatuses[service] = state.authStatus[service] || {
            authenticated: false,
            lastCheckTime: 0
          };
        }

        eventBus.publish(EVENT_TYPES.AUTH.STATUS_RESPONSE, {
          requestId: data.requestId,
          allServices: true,
          statuses: allStatuses
        });
      }

      return;
    }

    const service = data.service;
    const requestId = data.requestId;
    const forceCheck = data.forceCheck || false;

    // Vérifier si le service est configuré
    if (!config.services[service]) {
      publishError('SERVICE_NOT_CONFIGURED', `Service non configuré: ${service}`);

      if (requestId) {
        eventBus.publish(EVENT_TYPES.AUTH.STATUS_RESPONSE, {
          requestId,
          service,
          error: 'Service non configuré',
          status: { authenticated: false }
        });
      }

      return;
    }

    // Si un contrôle forcé est demandé ou si l'état n'est pas connu, vérifier le token
    if (forceCheck || !state.authStatus[service]) {
      checkServiceAuth(service, requestId);
    } else {
      // Sinon, renvoyer l'état actuel
      if (requestId) {
        eventBus.publish(EVENT_TYPES.AUTH.STATUS_RESPONSE, {
          requestId,
          service,
          status: state.authStatus[service]
        });
      }
    }
  }

  /**
   * Gère la réception d'un token stocké
   * @param {Object} data - Données du token récupéré
   */
  function onTokenRetrieved(data) {
    if (!data || !data.success || !data.requestId) {
      return;
    }

    // Extraire le service de l'ID de requête (check-auth-{service}-{timestamp})
    const match = data.requestId.match(/^check-auth-([^-]+)/);
    if (!match) {
      return;
    }

    const service = match[1];
    const originalRequestId = data.originalRequestId;

    if (data.success) {
      // Token valide trouvé
      state.authStatus[service] = {
        authenticated: true,
        userId: data.metadata ? data.metadata.userId : 'unknown',
        expiresAt: data.token.expiresAt,
        lastCheckTime: Date.now()
      };

      logInfo(`État d'authentification mis à jour pour ${service}: authentifié`);

      // Si cette vérification était en réponse à une demande spécifique
      if (originalRequestId) {
        eventBus.publish(EVENT_TYPES.AUTH.STATUS_RESPONSE, {
          requestId: originalRequestId,
          service,
          status: state.authStatus[service]
        });
      }
    } else if (data.expired) {
      // Token expiré
      state.authStatus[service] = {
        authenticated: false,
        lastCheckTime: Date.now(),
        error: 'Token expiré'
      };

      logWarning(`Token expiré pour ${service}`);

      // Si le rafraîchissement automatique est activé, essayer de rafraîchir
      if (config.autoRefreshTokens && data.refreshToken) {
        refreshToken(service, data.refreshToken);
      }

      // Si cette vérification était en réponse à une demande spécifique
      if (originalRequestId) {
        eventBus.publish(EVENT_TYPES.AUTH.STATUS_RESPONSE, {
          requestId: originalRequestId,
          service,
          status: state.authStatus[service]
        });
      }
    } else {
      // Aucun token ou erreur
      state.authStatus[service] = {
        authenticated: false,
        lastCheckTime: Date.now(),
        error: data.error || 'Token non trouvé'
      };

      logInfo(`État d'authentification mis à jour pour ${service}: non authentifié`);

      // Si cette vérification était en réponse à une demande spécifique
      if (originalRequestId) {
        eventBus.publish(EVENT_TYPES.AUTH.STATUS_RESPONSE, {
          requestId: originalRequestId,
          service,
          status: state.authStatus[service]
        });
      }
    }
  }

  /**
   * Gère la confirmation de stockage d'un token
   * @param {Object} data - Données de confirmation
   */
  function onTokenStored(data) {
    if (!data || !data.requestId || !data.success) {
      return;
    }

    // Vérifier si c'est une requête que nous avons initiée (store-{service}-{requestId})
    const match = data.requestId.match(/^store-([^-]+)-(.+)$/);
    if (!match) {
      return;
    }

    const service = match[1];
    const originalRequestId = match[2];

    if (data.success) {
      logInfo(`Token pour ${service} stocké avec succès`);

      // Mettre à jour l'état d'authentification
      state.authStatus[service] = {
        authenticated: true,
        lastCheckTime: Date.now(),
        expiresAt: data.expiresAt
      };

      // Vérifier si cette requête était liée à une authentification en cours
      if (state.pendingAuth.has(service)) {
        const pendingAuth = state.pendingAuth.get(service);

        // Publier l'événement de succès de connexion
        eventBus.publish(EVENT_TYPES.AUTH.LOGIN_SUCCESS, {
          requestId: pendingAuth.requestId,
          service,
          expiresAt: data.expiresAt
        });

        // Nettoyer l'authentification en cours
        state.pendingAuth.delete(service);
      }
    } else {
      logError(`Échec du stockage du token pour ${service}: ${data.error}`);

      // Vérifier si cette requête était liée à une authentification en cours
      if (state.pendingAuth.has(service)) {
        const pendingAuth = state.pendingAuth.get(service);

        // Publier l'événement d'échec de connexion
        eventBus.publish(EVENT_TYPES.AUTH.LOGIN_FAILED, {
          requestId: pendingAuth.requestId,
          service,
          error: `Échec du stockage du token: ${data.error}`
        });

        // Nettoyer l'authentification en cours
        state.pendingAuth.delete(service);
      }
    }
  }

  /**
   * Gère l'expiration d'un token
   * @param {Object} data - Données d'expiration du token
   */
  function onTokenExpired(data) {
    if (!data || !data.serviceId) {
      return;
    }

    const service = data.serviceId;

    // Mettre à jour l'état d'authentification
    state.authStatus[service] = {
      authenticated: false,
      lastCheckTime: Date.now(),
      error: 'Token expiré'
    };

    logWarning(`Token expiré pour ${service}`);

    // Si le rafraîchissement automatique est activé
    if (config.autoRefreshTokens) {
      // Récupérer le refresh token et essayer de rafraîchir
      eventBus.publish(EVENT_TYPES.AUTH.RETRIEVE_TOKEN, {
        requestId: `refresh-token-${service}-${Date.now()}`,
        serviceId: service,
        includeRefreshToken: true
      });
    }
  }

  /**
   * Gère les callbacks OAuth reçus
   * @param {Object} data - Données du callback OAuth
   */
  function onOAuthCallback(data) {
    if (!data || !data.service || !data.code) {
      publishError('INVALID_OAUTH_CALLBACK', 'Callback OAuth invalide');
      return;
    }

    const service = data.service;
    const code = data.code;
    const state = data.state;

    // Vérifier si une authentification est en cours pour ce service
    if (!state.pendingAuth.has(service)) {
      publishError('NO_PENDING_AUTH', `Aucune authentification en cours pour ${service}`);
      return;
    }

    const pendingAuth = state.pendingAuth.get(service);

    // Vérifier l'état si présent
    if (pendingAuth.state && state !== pendingAuth.state) {
      publishError('INVALID_STATE', 'État OAuth invalide, possible tentative CSRF');

      // Publier l'événement d'échec de connexion
      eventBus.publish(EVENT_TYPES.AUTH.LOGIN_FAILED, {
        requestId: pendingAuth.requestId,
        service,
        error: 'État OAuth invalide, possible tentative CSRF'
      });

      // Nettoyer l'authentification en cours
      state.pendingAuth.delete(service);

      return;
    }

    // Échanger le code contre un token
    exchangeCodeForToken(service, code, pendingAuth.requestId);
  }

  /**
   * Gère une demande de rafraîchissement de token
   * @param {Object} data - Données de la demande
   */
  function onRefreshToken(data) {
    if (!data || !data.service) {
      publishError('INVALID_REFRESH_REQUEST', 'Service non spécifié dans la demande de rafraîchissement');
      return;
    }

    const service = data.service;
    const requestId = data.requestId;

    // Récupérer le refresh token
    eventBus.publish(EVENT_TYPES.AUTH.RETRIEVE_TOKEN, {
      requestId: `get-refresh-${service}-${requestId || Date.now()}`,
      serviceId: service,
      includeRefreshToken: true
    });
  }

  /**
   * Démarre le processus d'authentification OAuth
   * @param {string} service - Identifiant du service
   * @param {string} requestId - Identifiant de la requête
   * @param {Object} options - Options supplémentaires
   */
  function startOAuthFlow(service, requestId, options = {}) {
    const serviceConfig = config.services[service];

    if (!serviceConfig) {
      publishError('SERVICE_NOT_CONFIGURED', `Service non configuré: ${service}`);
      return;
    }

    // Générer un état aléatoire pour la protection CSRF
    const state = crypto.randomBytes(16).toString('hex');

    // Enregistrer l'authentification en cours
    state.pendingAuth.set(service, {
      requestId,
      startTime: Date.now(),
      state,
      options
    });

    // Construire l'URL d'authentification
    const authParams = {
      client_id: serviceConfig.clientId,
      redirect_uri: serviceConfig.redirectUri,
      response_type: serviceConfig.responseType || 'code',
      scope: serviceConfig.scope || '',
      state: state
    };

    // Ajouter des paramètres spécifiques au service si nécessaire
    if (service === 'spotify' && options.showDialog) {
      authParams.show_dialog = 'true';
    }

    const authUrl = `${serviceConfig.authUrl}?${querystring.stringify(authParams)}`;

    // Démarrer un serveur HTTP temporaire pour recevoir la redirection OAuth
    ensureOAuthServer();

    // Ouvrir l'URL d'authentification
    if (serviceConfig.useExternalBrowser) {
      // Utiliser le navigateur par défaut
      shell.openExternal(authUrl);

      logInfo(`Authentification ${service} ouverte dans le navigateur externe: ${authUrl}`);
    } else {
      // Utiliser une fenêtre Electron
      openAuthWindow(service, authUrl);

      logInfo(`Authentification ${service} ouverte dans une fenêtre Electron`);
    }

    // Configurer un timeout
    setTimeout(() => {
      if (state.pendingAuth.has(service)) {
        const pendingAuth = state.pendingAuth.get(service);

        // Publier l'événement d'échec de connexion
        eventBus.publish(EVENT_TYPES.AUTH.LOGIN_FAILED, {
          requestId: pendingAuth.requestId,
          service,
          error: 'Timeout d\'authentification'
        });

        // Nettoyer l'authentification en cours
        state.pendingAuth.delete(service);

        // Fermer la fenêtre d'authentification si elle existe
        if (state.authWindows.has(service)) {
          const authWindow = state.authWindows.get(service);
          if (!authWindow.isDestroyed()) {
            authWindow.close();
          }
          state.authWindows.delete(service);
        }

        logWarning(`Timeout d'authentification pour ${service}`);
      }
    }, config.oauthTimeoutMs);
  }

  /**
   * Démarre le processus d'authentification avec device code
   * @param {string} service - Identifiant du service
   * @param {string} requestId - Identifiant de la requête
   */
  function startDeviceCodeAuth(service, requestId) {
    const serviceConfig = config.services[service];

    if (!serviceConfig) {
      publishError('SERVICE_NOT_CONFIGURED', `Service non configuré: ${service}`);
      return;
    }

    // Vérifier si le service supporte le device code flow
    if (!serviceConfig.deviceCodeUrl) {
      publishError('DEVICE_CODE_NOT_SUPPORTED', `Device code flow non supporté par ${service}`);

      eventBus.publish(EVENT_TYPES.AUTH.LOGIN_FAILED, {
        requestId,
        service,
        error: 'Device code flow non supporté'
      });

      return;
    }

    // Enregistrer l'authentification en cours
    state.pendingAuth.set(service, {
      requestId,
      startTime: Date.now(),
      type: 'device_code'
    });

    // Demander un device code
    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    };

    // Préparer les données à envoyer
    const postData = querystring.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: serviceConfig.clientId,
      client_secret: serviceConfig.clientSecret || ''
    });

    // Analyser l'URL du token
    const tokenUrlParsed = url.parse(serviceConfig.tokenUrl);

    // Mettre à jour les options avec les détails de l'URL
    requestOptions.hostname = tokenUrlParsed.hostname;
    requestOptions.port = tokenUrlParsed.port || (tokenUrlParsed.protocol === 'https:' ? 443 : 80);
    requestOptions.path = tokenUrlParsed.path;

    // Effectuer la requête HTTP
    const req = https.request(requestOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode !== 200) {
          publishError('TOKEN_REFRESH_FAILED', `Réponse HTTP erreur ${res.statusCode}`, data);
          return;
        }

        try {
          const response = JSON.parse(data);

          // Vérifier si on a un token d'accès
          if (!response.access_token) {
            publishError('INVALID_TOKEN_RESPONSE', 'Réponse de token invalide', response);
            return;
          }

          // Standardiser le format de token
          const tokenData = {
            accessToken: response.access_token,
            refreshToken: response.refresh_token || refreshToken, // Conserver l'ancien si pas de nouveau
            tokenType: response.token_type || 'Bearer',
            scope: response.scope || '',
            expiresIn: response.expires_in || null
          };

          // Publier l'événement de mise à jour des tokens
          eventBus.publish(EVENT_TYPES.AUTH.TOKENS_UPDATED, {
            service,
            tokens: tokenData
          });

          logInfo(`Token rafraîchi avec succès pour ${service}`);

        } catch (error) {
          publishError('TOKEN_PARSE_ERROR', 'Erreur lors du parsing de la réponse du token', error);
        }
      });
    });

    req.on('error', (error) => {
      publishError('TOKEN_REQUEST_ERROR', 'Erreur lors de la requête de rafraîchissement de token', error);
    });

    // Envoyer les données
    req.write(postData);
    req.end();
  }

  /**
   * Vérifie l'état d'authentification de tous les services configurés
   */
  function checkAllServicesAuth() {
    for (const service of Object.keys(config.services)) {
      if (config.services[service].enabled) {
        checkServiceAuth(service);
      }
    }
  }

  /**
   * Vérifie l'état d'authentification d'un service
   * @param {string} service - Identifiant du service
   * @param {string} [originalRequestId] - ID de la requête originale
   */
  function checkServiceAuth(service, originalRequestId = null) {
    if (!config.services[service]) {
      return;
    }

    if (config.secureStorage) {
      // Demander le token au secure-token-store
      eventBus.publish(EVENT_TYPES.AUTH.RETRIEVE_TOKEN, {
        requestId: `check-auth-${service}-${Date.now()}`,
        serviceId: service,
        originalRequestId
      });
    } else {
      // Vérifier l'état local
      const authData = state.authStatus[service];

      if (authData && authData.accessToken) {
        // Vérifier si le token a expiré
        const now = Date.now();

        if (authData.expiresAt && authData.expiresAt < now) {
          // Token expiré
          if (config.autoRefreshTokens && authData.refreshToken) {
            // Essayer de rafraîchir
            refreshToken(service, authData.refreshToken);
          } else {
            // Marquer comme non authentifié
            state.authStatus[service] = {
              authenticated: false,
              lastCheckTime: now,
              error: 'Token expiré'
            };
          }
        } else {
          // Token valide
          state.authStatus[service] = {
            ...authData,
            authenticated: true,
            lastCheckTime: now
          };
        }
      } else {
        // Pas de token
        state.authStatus[service] = {
          authenticated: false,
          lastCheckTime: now
        };
      }

      // Si cette vérification était en réponse à une demande spécifique
      if (originalRequestId) {
        eventBus.publish(EVENT_TYPES.AUTH.STATUS_RESPONSE, {
          requestId: originalRequestId,
          service,
          status: state.authStatus[service]
        });
      }
    }
  }

  /**
   * Publie un message d'information
   * @param {string} message - Message à publier
   * @param {Object} [details] - Détails supplémentaires
   */
  function logInfo(message, details = {}) {
    if (!eventBus) return;

    eventBus.publish(EVENT_TYPES.LOG.INFO, {
      source: 'auth-manager',
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
      source: 'auth-manager',
      message,
      details,
      timestamp: Date.now()
    });
  }

  /**
   * Publie un message d'erreur
   * @param {string} message - Message à publier
   * @param {Object} [details] - Détails supplémentaires
   */
  function logError(message, details = {}) {
    if (!eventBus) return;

    eventBus.publish(EVENT_TYPES.LOG.ERROR, {
      source: 'auth-manager',
      message,
      details,
      timestamp: Date.now()
    });
  }

  /**
   * Publie une erreur sur le bus d'événements
   * @param {string} code - Code d'erreur
   * @param {string} message - Message d'erreur
   * @param {*} [details] - Détails supplémentaires
   */
  function publishError(code, message, details = null) {
    if (!eventBus) return;

    // Utiliser le code d'erreur standardisé si disponible
    const errorCode = ERROR_CODES && ERROR_CODES[code] ? ERROR_CODES[code] : code;

    eventBus.publish(EVENT_TYPES.ERROR.NON_CRITICAL, {
      source: 'auth-manager',
      code: errorCode,
      message,
      details,
      timestamp: Date.now()
    });

    logError(`${code}: ${message}`, details);
  }

  /**
   * Nettoie les ressources avant la fermeture
   */
  function cleanup() {
    // Fermer toutes les fenêtres d'authentification
    for (const [service, window] of state.authWindows.entries()) {
      if (!window.isDestroyed()) {
        window.close();
      }
    }
    state.authWindows.clear();

    // Arrêter tous les pollings de device code
    for (const service in state.pollingIntervals) {
      clearInterval(state.pollingIntervals[service]);
    }
    state.pollingIntervals = {};

    // Fermer le serveur HTTP de redirection OAuth
    if (state.httpServer) {
      state.httpServer.close();
      state.httpServer = null;
    }

    logInfo('Ressources du AuthManager nettoyées');
  }

  // Interface publique (seule la fonction d'initialisation est exposée)
  return {
    initialize
  };
}

// Créer et exporter l'instance
const authManager = AuthManager();
module.exports = authManager;

/**
 * Exemples d'utilisation:
 *
 * // Initialisation du module
 * const eventBus = require('../core/event-bus').getInstance();
 * const EVENT_TYPES = require('../constants/event-types');
 * const ERROR_CODES = require('../constants/error-codes');
 * const authManager = require('./auth-manager');
 *
 * authManager.initialize(eventBus, EVENT_TYPES, ERROR_CODES);
 *
 * // Demander une connexion à un service
 * eventBus.publish(EVENT_TYPES.AUTH.LOGIN_REQUEST, {
 *   requestId: 'login-1',
 *   service: 'tidal'
 * });
 *
 * // Écouter les événements de connexion
 * eventBus.subscribe(EVENT_TYPES.AUTH.LOGIN_SUCCESS, (data) => {
 *   console.log(`Connexion réussie à ${data.service}`);
 *   // Mettre à jour l'interface utilisateur
 * });
 *
 * eventBus.subscribe(EVENT_TYPES.AUTH.LOGIN_FAILED, (data) => {
 *   console.log(`Échec de connexion à ${data.service}: ${data.error}`);
 *   // Afficher un message d'erreur
 * });
 *
 * // Vérifier l'état d'authentification
 * eventBus.publish(EVENT_TYPES.AUTH.CHECK_STATUS, {
 *   requestId: 'check-1',
 *   service: 'tidal',
 *   forceCheck: true
 * });
 *
 * // Écouter la réponse d'état
 * eventBus.subscribe(EVENT_TYPES.AUTH.STATUS_RESPONSE, (data) => {
 *   if (data.status.authenticated) {
 *     console.log(`Authentifié à ${data.service}`);
 *   } else {
 *     console.log(`Non authentifié à ${data.service}`);
 *   }
 * });
 *
 * // Se déconnecter d'un service
 * eventBus.publish(EVENT_TYPES.AUTH.LOGOUT_REQUEST, {
 *   requestId: 'logout-1',
 *   service: 'tidal'
 * });
 *
 * // Écouter l'événement de déconnexion
 * eventBus.subscribe(EVENT_TYPES.AUTH.LOGOUT_SUCCESS, (data) => {
 *   console.log(`Déconnexion réussie de ${data.service}`);
 *   // Mettre à jour l'interface utilisateur
 * });
 */ envoyer
    const postData = querystring.stringify({
      client_id: serviceConfig.clientId,
      scope: serviceConfig.scope || ''
    });

    // Effectuer la requête HTTP
    const req = https.request(serviceConfig.deviceCodeUrl, requestOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode !== 200) {
          handleDeviceCodeError(service, requestId, `Réponse HTTP erreur ${res.statusCode}`, data);
          return;
        }

        try {
          const response = JSON.parse(data);

          if (!response.device_code || !response.user_code || !response.verification_uri) {
            handleDeviceCodeError(service, requestId, 'Réponse device code invalide', response);
            return;
          }

          // Stocker les informations de device code
          const pendingAuth = state.pendingAuth.get(service);
          pendingAuth.deviceCode = response.device_code;
          pendingAuth.userCode = response.user_code;
          pendingAuth.verificationUri = response.verification_uri;
          pendingAuth.expiresIn = response.expires_in || 900; // 15 minutes par défaut
          pendingAuth.interval = response.interval || 5; // 5 secondes par défaut

          state.pendingAuth.set(service, pendingAuth);

          // Publier les informations pour l'interface utilisateur
          eventBus.publish(EVENT_TYPES.AUTH.DEVICE_CODE_GENERATED, {
            requestId,
            service,
            userCode: response.user_code,
            verificationUri: response.verification_uri,
            expiresIn: response.expires_in,
            message: response.message || `Veuillez visiter ${response.verification_uri} et saisir le code ${response.user_code}`
          });

          // Démarrer le polling
          startDeviceCodePolling(service);

          logInfo(`Device code généré pour ${service}: ${response.user_code} à ${response.verification_uri}`);

        } catch (error) {
          handleDeviceCodeError(service, requestId, 'Erreur lors du parsing de la réponse', error);
        }
      });
    });

    req.on('error', (error) => {
      handleDeviceCodeError(service, requestId, 'Erreur de requête device code', error);
    });

    // Envoyer les données
    req.write(postData);
    req.end();
  }

  /**
   * Gère les erreurs du flux device code
   * @param {string} service - Identifiant du service
   * @param {string} requestId - Identifiant de la requête
   * @param {string} message - Message d'erreur
   * @param {*} details - Détails supplémentaires
   */
  function handleDeviceCodeError(service, requestId, message, details) {
    publishError('DEVICE_CODE_ERROR', `Erreur device code pour ${service}: ${message}`, details);

    // Publier l'événement d'échec
    eventBus.publish(EVENT_TYPES.AUTH.LOGIN_FAILED, {
      requestId,
      service,
      error: message
    });

    // Nettoyer l'authentification en cours
    state.pendingAuth.delete(service);

    // Arrêter le polling si actif
    if (state.pollingIntervals[service]) {
      clearInterval(state.pollingIntervals[service]);
      delete state.pollingIntervals[service];
    }
  }

  /**
   * Démarre le polling pour vérifier l'état de l'authentification par device code
   * @param {string} service - Identifiant du service
   */
  function startDeviceCodePolling(service) {
    const pendingAuth = state.pendingAuth.get(service);
    if (!pendingAuth || !pendingAuth.deviceCode) {
      return;
    }

    const serviceConfig = config.services[service];
    const interval = pendingAuth.interval * 1000; // Convertir en millisecondes

    // Arrêter tout polling existant
    if (state.pollingIntervals[service]) {
      clearInterval(state.pollingIntervals[service]);
    }

    // Configurer le polling
    state.pollingIntervals[service] = setInterval(() => {
      pollDeviceCodeStatus(service);
    }, interval);

    // Configurer un timeout
    setTimeout(() => {
      if (state.pollingIntervals[service]) {
        clearInterval(state.pollingIntervals[service]);
        delete state.pollingIntervals[service];

        // Vérifier si l'authentification est toujours en cours
        if (state.pendingAuth.has(service)) {
          const auth = state.pendingAuth.get(service);

          // Publier l'échec
          eventBus.publish(EVENT_TYPES.AUTH.LOGIN_FAILED, {
            requestId: auth.requestId,
            service,
            error: 'Timeout d\'authentification device code'
          });

          // Nettoyer
          state.pendingAuth.delete(service);

          logWarning(`Timeout d'authentification device code pour ${service}`);
        }
      }
    }, pendingAuth.expiresIn * 1000);
  }

  /**
   * Vérifie l'état de l'authentification par device code
   * @param {string} service - Identifiant du service
   */
  function pollDeviceCodeStatus(service) {
    const pendingAuth = state.pendingAuth.get(service);
    if (!pendingAuth || !pendingAuth.deviceCode) {
      // Arrêter le polling si l'authentification n'est plus en cours
      if (state.pollingIntervals[service]) {
        clearInterval(state.pollingIntervals[service]);
        delete state.pollingIntervals[service];
      }
      return;
    }

    const serviceConfig = config.services[service];

    // Préparer la requête
    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    };

    // Ajouter l'authentification client si nécessaire
    if (serviceConfig.clientSecret) {
      const auth = Buffer.from(`${serviceConfig.clientId}:${serviceConfig.clientSecret}`).toString('base64');
      requestOptions.headers['Authorization'] = `Basic ${auth}`;
    }

    // Préparer les données à envoyer
    const postData = querystring.stringify({
      grant_type: 'device_code',
      device_code: pendingAuth.deviceCode,
      client_id: serviceConfig.clientId
    });

    // Effectuer la requête HTTP
    const req = https.request(serviceConfig.tokenUrl, requestOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);

          // Vérifier si l'utilisateur n'a pas encore validé le code
          if (response.error === 'authorization_pending') {
            // Continuer le polling
            return;
          }

          // Vérifier si l'utilisateur a refusé l'accès
          if (response.error === 'access_denied') {
            handleDeviceCodeError(service, pendingAuth.requestId, 'Accès refusé par l\'utilisateur', response);
            return;
          }

          // Vérifier si le device code a expiré
          if (response.error === 'expired_token') {
            handleDeviceCodeError(service, pendingAuth.requestId, 'Device code expiré', response);
            return;
          }

          // Vérifier si on a dépassé la limite de polling
          if (response.error === 'slow_down') {
            // Augmenter l'intervalle de polling
            pendingAuth.interval += 5;
            state.pendingAuth.set(service, pendingAuth);

            // Redémarrer le polling avec le nouvel intervalle
            startDeviceCodePolling(service);
            return;
          }

          // Vérifier si on a un token d'accès
          if (!response.access_token) {
            handleDeviceCodeError(service, pendingAuth.requestId, 'Réponse de token invalide', response);
            return;
          }

          // Arrêter le polling
          clearInterval(state.pollingIntervals[service]);
          delete state.pollingIntervals[service];

          // Traiter le token
          handleTokenResponse(service, response, pendingAuth.requestId);

        } catch (error) {
          // Ignorer les erreurs de parsing, continuer le polling
          logWarning(`Erreur lors du polling device code pour ${service}: ${error.message}`);
        }
      });
    });

    req.on('error', (error) => {
      // Ignorer les erreurs réseau, continuer le polling
      logWarning(`Erreur réseau lors du polling device code pour ${service}: ${error.message}`);
    });

    // Envoyer les données
    req.write(postData);
    req.end();
  }

  /**
   * Ouvre une fenêtre d'authentification Electron
   * @param {string} service - Identifiant du service
   * @param {string} authUrl - URL d'authentification
   */
  function openAuthWindow(service, authUrl) {
    // Fermer toute fenêtre d'authentification existante pour ce service
    if (state.authWindows.has(service)) {
      const existingWindow = state.authWindows.get(service);
      if (!existingWindow.isDestroyed()) {
        existingWindow.close();
      }
    }

    // Créer une nouvelle fenêtre
    const authWindow = new BrowserWindow({
      width: 800,
      height: 600,
      title: `Authentification ${service}`,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    });

    // Stocker la référence à la fenêtre
    state.authWindows.set(service, authWindow);

    // Charger l'URL d'authentification
    authWindow.loadURL(authUrl);

    // Intercepter les redirections pour détecter le callback OAuth
    authWindow.webContents.on('will-redirect', (event, url) => {
      handleAuthWindowRedirect(service, url, authWindow);
    });

    // Gérer les navigations pour intercepter le callback
    authWindow.webContents.on('will-navigate', (event, url) => {
      handleAuthWindowRedirect(service, url, authWindow);
    });

    // Nettoyer à la fermeture
    authWindow.on('closed', () => {
      state.authWindows.delete(service);
    });
  }

  /**
   * Gère les redirections dans la fenêtre d'authentification
   * @param {string} service - Identifiant du service
   * @param {string} urlString - URL de redirection
   * @param {BrowserWindow} authWindow - Fenêtre d'authentification
   */
  function handleAuthWindowRedirect(service, urlString, authWindow) {
    try {
      const parsedUrl = new URL(urlString);
      const redirectUri = config.services[service].redirectUri;
      const parsedRedirect = new URL(redirectUri);

      // Vérifier si l'URL correspond à l'URI de redirection
      if (parsedUrl.origin === parsedRedirect.origin &&
          parsedUrl.pathname === parsedRedirect.pathname) {

        // Extraire les paramètres
        const params = {};
        parsedUrl.searchParams.forEach((value, key) => {
          params[key] = value;
        });

        // Vérifier si on a un code d'autorisation
        if (params.code) {
          // Fermer la fenêtre
          authWindow.close();

          // Traiter le callback OAuth
          processOAuthCallback(service, params.code, params.state);
        }
        // Vérifier si on a une erreur
        else if (params.error) {
          // Fermer la fenêtre
          authWindow.close();

          // Gérer l'erreur
          handleOAuthError(service, params.error, params.error_description);
        }
      }
    } catch (error) {
      // Ignorer les erreurs d'URL invalide
      logWarning(`URL de redirection invalide: ${urlString}`);
    }
  }

  /**
   * S'assure que le serveur HTTP pour les redirections OAuth est démarré
   */
  function ensureOAuthServer() {
    // Si le serveur est déjà en cours d'exécution, ne rien faire
    if (state.httpServer) {
      return;
    }

    // Créer un serveur HTTP minimal pour gérer les redirections OAuth
    const http = require('http');

    state.httpServer = http.createServer((req, res) => {
      try {
        const parsedUrl = url.parse(req.url, true);

        // Vérifier si le chemin correspond au chemin de redirection
        if (parsedUrl.pathname === config.oauthRedirectPath) {
          // Extraire le service de l'URL ou des en-têtes
          let service = '';

          // Si le service est dans les paramètres de requête
          if (parsedUrl.query.service) {
            service = parsedUrl.query.service;
          }
          // Sinon, essayer de déduire du referer ou d'autres moyens
          else {
            // Parcourir les services configurés
            for (const [serviceName, serviceConfig] of Object.entries(config.services)) {
              if (state.pendingAuth.has(serviceName)) {
                service = serviceName;
                break;
              }
            }
          }

          // Si on a pu identifier le service
          if (service) {
            // Extraire le code et l'état
            const code = parsedUrl.query.code;
            const stateParam = parsedUrl.query.state;

            // Traiter le callback OAuth
            processOAuthCallback(service, code, stateParam);

            // Répondre avec une page HTML de succès
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <!DOCTYPE html>
              <html>
                <head>
                  <title>Authentification réussie</title>
                  <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                    h1 { color: #2c3e50; }
                    .success { color: #27ae60; }
                    .error { color: #e74c3c; }
                  </style>
                </head>
                <body>
                  <h1>21 BYTS - Authentification</h1>
                  ${code ?
                    '<p class="success">Authentification réussie! Vous pouvez fermer cette fenêtre.</p>' :
                    '<p class="error">Erreur d\'authentification. Veuillez réessayer.</p>'}
                  <script>window.close();</script>
                </body>
              </html>
            `);
          } else {
            // Service non identifié
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <!DOCTYPE html>
              <html>
                <head>
                  <title>Erreur d'authentification</title>
                  <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                    h1 { color: #2c3e50; }
                    .error { color: #e74c3c; }
                  </style>
                </head>
                <body>
                  <h1>21 BYTS - Authentification</h1>
                  <p class="error">Service non identifié. Veuillez réessayer.</p>
                </body>
              </html>
            `);
          }
        } else {
          // Chemin non reconnu
          res.writeHead(404);
          res.end('Not Found');
        }
      } catch (error) {
        // Erreur lors du traitement de la requête
        res.writeHead(500);
        res.end('Internal Server Error');

        logError(`Erreur lors du traitement de la redirection OAuth: ${error.message}`);
      }
    });

    // Démarrer le serveur sur le port configuré
    state.httpServer.listen(config.oauthRedirectPort, () => {
      logInfo(`Serveur OAuth démarré sur le port ${config.oauthRedirectPort}`);
    });

    // Gérer les erreurs du serveur
    state.httpServer.on('error', (error) => {
      logError(`Erreur du serveur OAuth: ${error.message}`);

      if (error.code === 'EADDRINUSE') {
        logWarning(`Le port ${config.oauthRedirectPort} est déjà utilisé, tentative avec un autre port`);

        // Essayer avec un autre port
        config.oauthRedirectPort++;
        state.httpServer.close();
        state.httpServer = null;
        ensureOAuthServer();
      }
    });
  }

  /**
   * Traite un callback OAuth
   * @param {string} service - Identifiant du service
   * @param {string} code - Code d'autorisation
   * @param {string} stateParam - Paramètre d'état pour la vérification CSRF
   */
  function processOAuthCallback(service, code, stateParam) {
    // Vérifier si une authentification est en cours pour ce service
    if (!state.pendingAuth.has(service)) {
      publishError('NO_PENDING_AUTH', `Aucune authentification en cours pour ${service}`);
      return;
    }

    const pendingAuth = state.pendingAuth.get(service);

    // Vérifier l'état si présent
    if (pendingAuth.state && stateParam !== pendingAuth.state) {
      publishError('INVALID_STATE', 'État OAuth invalide, possible tentative CSRF');

      // Publier l'événement d'échec de connexion
      eventBus.publish(EVENT_TYPES.AUTH.LOGIN_FAILED, {
        requestId: pendingAuth.requestId,
        service,
        error: 'État OAuth invalide, possible tentative CSRF'
      });

      // Nettoyer l'authentification en cours
      state.pendingAuth.delete(service);

      return;
    }

    // Échanger le code contre un token
    exchangeCodeForToken(service, code, pendingAuth.requestId);
  }

  /**
   * Gère une erreur dans le processus OAuth
   * @param {string} service - Identifiant du service
   * @param {string} error - Code d'erreur
   * @param {string} errorDescription - Description de l'erreur
   */
  function handleOAuthError(service, error, errorDescription) {
    // Vérifier si une authentification est en cours pour ce service
    if (!state.pendingAuth.has(service)) {
      return;
    }

    const pendingAuth = state.pendingAuth.get(service);

    // Publier l'événement d'échec de connexion
    eventBus.publish(EVENT_TYPES.AUTH.LOGIN_FAILED, {
      requestId: pendingAuth.requestId,
      service,
      error: errorDescription || error || 'Erreur OAuth non spécifiée'
    });

    // Nettoyer l'authentification en cours
    state.pendingAuth.delete(service);

    logError(`Erreur OAuth pour ${service}: ${error} - ${errorDescription}`);
  }

  /**
   * Échange un code d'autorisation contre un token d'accès
   * @param {string} service - Identifiant du service
   * @param {string} code - Code d'autorisation
   * @param {string} requestId - Identifiant de la requête
   */
  function exchangeCodeForToken(service, code, requestId) {
    const serviceConfig = config.services[service];

    if (!serviceConfig) {
      publishError('SERVICE_NOT_CONFIGURED', `Service non configuré: ${service}`);
      return;
    }

    // Préparer la requête
    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    };

    // Ajouter l'authentification client si nécessaire
    if (serviceConfig.clientSecret) {
      const auth = Buffer.from(`${serviceConfig.clientId}:${serviceConfig.clientSecret}`).toString('base64');
      requestOptions.headers['Authorization'] = `Basic ${auth}`;
    }

    // Préparer les données à envoyer
    const postData = querystring.stringify({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: serviceConfig.redirectUri,
      client_id: serviceConfig.clientId,
      client_secret: serviceConfig.clientSecret || ''
    });

    // Analyser l'URL du token
    const tokenUrlParsed = url.parse(serviceConfig.tokenUrl);

    // Mettre à jour les options avec les détails de l'URL
    requestOptions.hostname = tokenUrlParsed.hostname;
    requestOptions.port = tokenUrlParsed.port || (tokenUrlParsed.protocol === 'https:' ? 443 : 80);
    requestOptions.path = tokenUrlParsed.path;

    // Effectuer la requête HTTP
    const req = https.request(requestOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode !== 200) {
          publishError('TOKEN_EXCHANGE_FAILED', `Réponse HTTP erreur ${res.statusCode}`, data);

          // Publier l'événement d'échec de connexion
          eventBus.publish(EVENT_TYPES.AUTH.LOGIN_FAILED, {
            requestId,
            service,
            error: `Erreur lors de l'échange du code: ${res.statusCode}`
          });

          // Nettoyer l'authentification en cours
          state.pendingAuth.delete(service);

          return;
        }

        try {
          const response = JSON.parse(data);

          // Vérifier si on a un token d'accès
          if (!response.access_token) {
            publishError('INVALID_TOKEN_RESPONSE', 'Réponse de token invalide', response);

            // Publier l'événement d'échec de connexion
            eventBus.publish(EVENT_TYPES.AUTH.LOGIN_FAILED, {
              requestId,
              service,
              error: 'Réponse de token invalide'
            });

            // Nettoyer l'authentification en cours
            state.pendingAuth.delete(service);

            return;
          }

          // Traiter la réponse du token
          handleTokenResponse(service, response, requestId);

        } catch (error) {
          publishError('TOKEN_PARSE_ERROR', 'Erreur lors du parsing de la réponse du token', error);

          // Publier l'événement d'échec de connexion
          eventBus.publish(EVENT_TYPES.AUTH.LOGIN_FAILED, {
            requestId,
            service,
            error: `Erreur lors du parsing de la réponse: ${error.message}`
          });

          // Nettoyer l'authentification en cours
          state.pendingAuth.delete(service);
        }
      });
    });

    req.on('error', (error) => {
      publishError('TOKEN_REQUEST_ERROR', 'Erreur lors de la requête de token', error);

      // Publier l'événement d'échec de connexion
      eventBus.publish(EVENT_TYPES.AUTH.LOGIN_FAILED, {
        requestId,
        service,
        error: `Erreur réseau: ${error.message}`
      });

      // Nettoyer l'authentification en cours
      state.pendingAuth.delete(service);
    });

    // Envoyer les données
    req.write(postData);
    req.end();
  }

  /**
   * Traite la réponse de token d'un service
   * @param {string} service - Identifiant du service
   * @param {Object} response - Réponse du serveur de token
   * @param {string} requestId - Identifiant de la requête
   */
  function handleTokenResponse(service, response, requestId) {
    // Standardiser le format de token
    const tokenData = {
      accessToken: response.access_token,
      refreshToken: response.refresh_token || null,
      tokenType: response.token_type || 'Bearer',
      scope: response.scope || '',
      expiresIn: response.expires_in || null
    };

    // Obtenir l'ID utilisateur si possible
    let userId = response.user_id || '';

    // Si l'ID utilisateur n'est pas dans la réponse, essayer de l'extraire du JWT
    if (!userId && tokenData.accessToken && tokenData.accessToken.split('.').length === 3) {
      try {
        // Décodage du JWT (sans vérification de signature)
        const payload = JSON.parse(
          Buffer.from(tokenData.accessToken.split('.')[1], 'base64').toString('utf8')
        );

        // Rechercher l'ID utilisateur dans les champs courants
        userId = payload.sub || payload.user_id || payload.id || '';
      } catch (error) {
        // Ignorer les erreurs de décodage
      }
    }

    // Mettre à jour les tokens
    const storeTokenRequest = {
      requestId: `store-${service}-${requestId}`,
      serviceId: service,
      token: tokenData,
      metadata: {
        userId,
        service
      }
    };

    if (config.secureStorage) {
      // Stocker le token via le secure-token-store
      eventBus.publish(EVENT_TYPES.AUTH.STORE_TOKEN, storeTokenRequest);
    } else {
      // Stocker localement
      state.authStatus[service] = {
        authenticated: true,
        userId,
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        tokenType: tokenData.tokenType,
        expiresAt: tokenData.expiresIn ? Date.now() + tokenData.expiresIn * 1000 : null,
        lastCheckTime: Date.now()
      };

      // Publier l'événement de succès de connexion
      eventBus.publish(EVENT_TYPES.AUTH.LOGIN_SUCCESS, {
        requestId,
        service,
        userId
      });

      // Nettoyer l'authentification en cours
      state.pendingAuth.delete(service);

      // Publier l'événement de mise à jour des tokens
      eventBus.publish(EVENT_TYPES.AUTH.TOKENS_UPDATED, {
        service,
        userId,
        tokens: tokenData
      });
    }

    logInfo(`Authentification réussie pour ${service}`);
  }

  /**
   * Rafraîchit un token expiré
   * @param {string} service - Identifiant du service
   * @param {string} refreshToken - Token de rafraîchissement
   */
  function refreshToken(service, refreshToken) {
    if (!refreshToken) {
      logWarning(`Impossible de rafraîchir le token pour ${service}: Refresh token manquant`);
      return;
    }

    const serviceConfig = config.services[service];

    if (!serviceConfig) {
      publishError('SERVICE_NOT_CONFIGURED', `Service non configuré: ${service}`);
      return;
    }

    // Préparer la requête
    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    };

    // Ajouter l'authentification client si nécessaire
    if (serviceConfig.clientSecret) {
      const auth = Buffer.from(`${serviceConfig.clientId}:${serviceConfig.clientSecret}`).toString('base64');
      requestOptions.headers['Authorization'] = `Basic ${auth}`;
    }

    // Préparer les données à
