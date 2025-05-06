/**
 * @fileoverview Définition des types d'événements liés à la gestion d'état pour 21 BYTS
 *
 * Ce fichier contient tous les types d'événements utilisés par le gestionnaire d'état.
 * Il utilise les constantes définies dans event-types.js.
 */

const EVENT_TYPES = require('./event-types');

/**
 * Types d'événements pour la gestion d'état
 * @namespace
 */
const STATE_EVENT_TYPES = {
  /**
   * Événements liés à la gestion d'état
   */
  STATE_VALUE: EVENT_TYPES.STATE.VALUE,
  STATE_CHANGED: EVENT_TYPES.STATE.CHANGED,
  STATE_SUBSCRIPTION_ADDED: 'STATE:SUBSCRIPTION:ADDED',
  STATE_UNSUBSCRIBE: EVENT_TYPES.STATE.UNSUBSCRIBE,
  APP_SHUTDOWN: EVENT_TYPES.APP.SHUTTING_DOWN
};

// Geler l'objet pour éviter toute modification accidentelle
Object.freeze(STATE_EVENT_TYPES);

// Exporter les événements
module.exports = STATE_EVENT_TYPES;
