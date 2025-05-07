/**
 * @fileoverview Wrapper léger pour initialiser le gestionnaire de téléchargement (download-manager)
 * Ce fichier se charge d’initialiser le module métier et de s'enregistrer via le système DOM/event
 */

const { initDownloadManager } = require('./download-manager.core');

// Attente de l’événement d’initialisation
window.addEventListener('MODULE_INITIALIZED', (event) => {
  if (event.detail && event.detail.module === 'download-manager') {
    const { eventBus } = event.detail;

    initDownloadManager({ eventBus });

    eventBus.publish('MODULE_READY', {
      module: 'download-manager'
    });
  }
});

// Demande d’enregistrement automatique
window.dispatchEvent(
  new CustomEvent('MODULE_REGISTRATION_REQUESTED', {
    detail: { module: 'download-manager' }
  })
);
