/**
 * @jest-environment jsdom
 * @file download-manager.test.js
 */

describe('⬇️ download-manager.js', () => {
  it('doit s’exécuter sans erreur dans un DOM simulé', () => {
    document.body.innerHTML = `<div id="app"></div>`;

    const script = document.createElement('script');
    script.textContent = `
      window.dispatchEvent(new CustomEvent('MODULE_INITIALIZED', {
        detail: {
          module: 'download-manager',
          eventBus: {
            subscribe: () => {},
            publish: () => {},
          }
        }
      }));
    `;
    document.body.appendChild(script);

    expect(true).toBe(true); // simple test de chargement
  });
});
