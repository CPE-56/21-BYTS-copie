// tests/unit/core/config-manager.test.js
const path = require('path');
const fs = require('fs');
const { getInstance } = require('../../../src/core/event-bus');
const { initialize } = require('../../../src/core/config-manager');

const eventBus = getInstance();

describe('config-manager.js', () => {
  beforeAll(() => {
    initialize({ eventBus });
  });

  it('devrait publier CONFIG_LOADED avec une configuration par défaut', done => {
    const sub = eventBus.subscribe('CONFIG_LOADED', (config) => {
      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
      eventBus.unsubscribe(sub);
      done();
    });

    eventBus.publish('CONFIG_GET');
  });

  it('devrait mettre à jour une configuration', done => {
    const sub = eventBus.subscribe('CONFIG_UPDATED', ({ key, value }) => {
      expect(key).toBe('testKey');
      expect(value).toBe('testValue');
      eventBus.unsubscribe(sub);
      done();
    });

    eventBus.publish('CONFIG_SET', { key: 'testKey', value: 'testValue' });
  });

  it('devrait réinitialiser la configuration sans erreur', () => {
    expect(() => {
      eventBus.publish('CONFIG_RESET');
    }).not.toThrow();
  });

  it('devrait exporter et importer une configuration sans erreur', done => {
    const tempExportPath = path.join(__dirname, 'temp-config-export.json');

    const updatedSub = eventBus.subscribe('CONFIG_UPDATED', () => {
      fs.unlinkSync(tempExportPath);
      eventBus.unsubscribe(updatedSub);
      done();
    });

    eventBus.publish('CONFIG_EXPORT', { targetPath: tempExportPath });

    setTimeout(() => {
      eventBus.publish('CONFIG_IMPORT', { sourcePath: tempExportPath });
    }, 100);
  });
});
