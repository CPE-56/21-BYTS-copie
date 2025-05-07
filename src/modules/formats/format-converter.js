/**
 * @fileoverview Wrapper DOM pour le module format-converter
 * Initialise le module core uniquement quand le bus est disponible via un événement DOM
 */

const { initFormatConverter } = require('./format-converter.core');

window.addEventListener('MODULE_INITIALIZED', (event) => {
  if (event.detail?.module === 'format-converter') {
    const { eventBus } = event.detail;

    // Initialiser le module de conversion
    initFormatConverter({ eventBus });

    // Publier que le module est prêt
    eventBus.publish('MODULE_READY', {
      module: 'format-converter',
      capabilities: {
        input: ['mp3', 'wav', 'flac', 'aiff', 'ogg', 'm4a', 'wma'],
        output: ['mp3', 'wav', 'flac', 'aiff'],
        quality: {
          mp3: ['128kbps', '192kbps', '256kbps', '320kbps'],
          wav: ['16bit', '24bit', '32bit'],
          flac: ['level0', 'level5', 'level8'],
          aiff: ['16bit', '24bit']
        }
      }
    });
  }
});

// Déclencher l’enregistrement depuis l’interface
window.dispatchEvent(
  new CustomEvent('MODULE_REGISTRATION_REQUESTED', {
    detail: { module: 'format-converter' }
  })
);
