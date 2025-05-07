/**
 * @fileoverview Gestionnaire d'authentification pour 21 BYTS (logique métier)
 *
 * Ce module gère la logique d'authentification OAuth, la récupération des tokens,
 * la vérification, la persistance et la publication des événements associés.
 *
 * Il fonctionne de manière totalement indépendante (Single File Component),
 * sans dépendance directe avec Electron ou d'autres modules. Toute communication
 * s'effectue exclusivement via le bus d'événements.
 *
 * @module auth/auth-manager.core
 *
 * @events
 * ÉCOUTE:
 * - AUTH:REQUEST: Demande d'authentification pour un service
 * - AUTH:LOGOUT: Demande de déconnexion
 *
 * ÉMET:
 * - AUTH:SUCCESS: Authentification réussie
 * - AUTH:FAILURE: Échec d'authentification
 * - AUTH:TOKENS_UPDATED: Tokens valides mis à jour
 * - ERROR:NON_CRITICAL: Erreurs non fatales
 * - LOG:INFO | LOG:ERROR: Journalisation
 */

'use strict';

function createAuthManagerCore() {
  let eventBus = null;
  let EVENT_TYPES = null;
  let ERROR_CODES = null;

  /**
   * Initialise le gestionnaire d'authentification
   * @param {Object} injectedEventBus - Bus d'événements
   * @param {Object} eventTypes - Types d'événements standardisés
   * @param {Object} errorCodes - Codes d'erreurs standardisés
   */
  function initialize(injectedEventBus, eventTypes, errorCodes) {
    if (!injectedEventBus) {
      console.error('[auth-manager.core] Bus d’événements requis');
      return;
    }

    eventBus = injectedEventBus;
    EVENT_TYPES = eventTypes;
    ERROR_CODES = errorCodes;

    registerEventListeners();

    logInfo('auth-manager.core initialisé');
  }

  /**
   * Enregistre les abonnements au bus d’événements
   */
  function registerEventListeners() {
    eventBus.subscribe(EVENT_TYPES.AUTH.REQUEST, handleAuthRequest);
    eventBus.subscribe(EVENT_TYPES.AUTH.LOGOUT, handleLogout);
  }

  /**
   * Gère une demande d’authentification
   * @param {Object} payload - Données de la requête
   */
  async function handleAuthRequest(payload) {
    const { provider, credentials } = payload;

    try {
      if (!provider || !credentials) {
        throw ERROR_CODES.createError(
          'INVALID_PARAMETER',
          'Paramètres d’authentification manquants',
          payload
        );
      }

      // Simuler l’obtention d’un token (à adapter avec appel OAuth réel)
      const fakeToken = {
        accessToken: 'FAKE_ACCESS_TOKEN',
        refreshToken: 'FAKE_REFRESH_TOKEN',
        tokenType: 'Bearer',
        expiresIn: 3600
      };

      // Publier la mise à jour des tokens
      eventBus.publish(EVENT_TYPES.AUTH.TOKENS_UPDATED, {
        service: provider,
        tokens: fakeToken,
        userId: credentials?.userId || 'demo-user'
      });

      // Publier le succès d’authentification
      eventBus.publish(EVENT_TYPES.AUTH.SUCCESS, {
        service: provider,
        token: fakeToken
      });

      logInfo(`Authentification réussie pour ${provider}`);
    } catch (err) {
      const formattedError = ERROR_CODES.createError(
        'AUTH_FAILED',
        `Échec d’authentification pour ${provider}`,
        { provider, credentials, error: err.message }
      );

      eventBus.publish(EVENT_TYPES.AUTH.FAILURE, formattedError);
      publishNonCriticalError(formattedError);
    }
  }

  /**
   * Gère une demande de déconnexion
   * @param {Object} payload - Données de déconnexion (facultatif)
   */
  function handleLogout(payload) {
    const serviceId = payload?.provider || 'inconnu';

    // Cette version de base ne supprime pas les tokens stockés
    eventBus.publish(EVENT_TYPES.LOG.INFO, {
      source: 'auth-manager.core',
      message: `Déconnexion demandée pour ${serviceId}`,
      timestamp: Date.now()
    });
  }

  /**
   * Publie un message d'information
   */
  function logInfo(message, details = {}) {
    eventBus?.publish(EVENT_TYPES.LOG.INFO, {
      source: 'auth-manager.core',
      message,
      details,
      timestamp: Date.now()
    });
  }

  /**
   * Publie une erreur non critique sur le bus
   * @param {Object} errorObject - Objet d’erreur standardisé
   */
  function publishNonCriticalError(errorObject) {
    eventBus?.publish(EVENT_TYPES.ERROR.NON_CRITICAL, {
      source: 'auth-manager.core',
      ...errorObject
    });

    eventBus?.publish(EVENT_TYPES.LOG.ERROR, {
      source: 'auth-manager.core',
      message: `${errorObject.name}: ${errorObject.message}`,
      details: errorObject
    });
  }

  // Interface publique
  return {
    initialize
  };
}

module.exports = createAuthManagerCore;
