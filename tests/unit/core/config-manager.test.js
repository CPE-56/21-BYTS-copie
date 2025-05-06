const mockEventBus = {
  publish: jest.fn(),
  subscribe: jest.fn(),
  once: jest.fn(),
  unsubscribe: jest.fn(),
  setLogger: jest.fn(),
};

jest.mock('../../../src/core/event-bus', () => ({
  getInstance: () => mockEventBus,
}));

const configManager = require('../../../src/core/config-manager');

describe('config-manager.js', () => {
  beforeEach(() => {
    configManager.initialize(mockEventBus);
  });

  it('devrait mettre à jour une configuration', () => {
    configManager.set('theme', 'dark');
    expect(configManager.get('theme')).toBe('dark');
  });

  it('devrait réinitialiser la configuration sans erreur', () => {
    configManager.set('volume', 80);
    configManager.reset();
    expect(configManager.get('volume')).toBeUndefined();
  });

  it('devrait exporter et importer une configuration sans erreur', () => {
    configManager.set('theme', 'light');
    const exported = configManager.export();
    configManager.reset();
    configManager.import(exported);
    expect(configManager.get('theme')).toBe('light');
  });
});
