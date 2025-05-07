/**
 * @fileoverview Wrapper Electron pour auth-manager.core.js
 * Initialise la logique principale avec le bus d'événements et les constantes.
 * Gère uniquement les interactions spécifiques à Electron (fenêtres, redirections, etc.)
 */

const createAuthManagerCore = require('./auth-manager.core');

let coreInstance = null;

function initializeAuthManagerWrapper(eventBus, EVENT_TYPES, ERROR_CODES) {
  if (!coreInstance) {
    coreInstance = createAuthManagerCore();
    coreInstance.initialize(eventBus, EVENT_TYPES, ERROR_CODES);
  }

  // TODO: Ajouter ici la gestion de BrowserWindow, shell.openExternal, etc.
}

module.exports = {
  initialize: initializeAuthManagerWrapper
};
