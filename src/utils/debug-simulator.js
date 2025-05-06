/**
 * @fileoverview Simulateur de débogage pour 21 BYTS
 * @description Ce module publie des événements artificiels utiles pour tester
 * le comportement de l'application en mode développement.
 *
 * @module debug-simulator
 */

'use strict';

/**
 * Simule des événements via le bus pour tester les modules indépendamment.
 * Ne doit être activé qu'en mode développement.
 *
 * @param {Object} eventBus - Instance du bus d'événements central
 */
function registerDebugSimulator(eventBus) {
  if (!eventBus || typeof eventBus.publish !== 'function') {
    console.warn("[debug-simulator] Bus d'événements invalide ou non initialisé");
    return;
  }

  if (typeof eventBus.setDebugMode === 'function') {
    eventBus.setDebugMode(true);
  }

  console.info("[debug-simulator] Simulation d'événements déclenchée");

  setTimeout(() => {
    eventBus.publish('CONFIG_LOADED', {
      debug: true,
      downloadFolder: '/tmp/music-test',
      defaultFormat: 'mp3'
    });
  }, 200);

  setTimeout(() => {
    eventBus.publish('APP_CORE_READY');
  }, 400);

  setTimeout(() => {
    eventBus.publish('OPEN_EXTERNAL_URL', {
      url: 'https://21-byts.dev/simulation'
    });
  }, 800);

  setTimeout(() => {
    eventBus.publish('DIALOG_SELECT_DIRECTORY', {
      requestId: 'debug-test-request'
    });
  }, 1200);

  setTimeout(() => {
    eventBus.publish('ERROR', {
      source: 'debug-simulator',
      message: 'Erreur simulée pour test de résilience',
      error: new Error('Simulated test error')
    });
  }, 1600);
}

module.exports = {
  registerDebugSimulator
};
