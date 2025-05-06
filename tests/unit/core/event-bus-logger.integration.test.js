// tests/integration/core/event-bus-logger.integration.test.js
jest.mock('electron', () => ({
  ipcRenderer: {
    on: jest.fn(),
    send: jest.fn()
  },
  app: {
    getPath: jest.fn(() => '/tmp/mock-user-data')
  }
}));

global.window = {
  addEventListener: jest.fn()
};

const { register } = require('../../../src/core/event-logger');
const { getInstance } = require('../../../src/core/event-bus');
const eventBus = getInstance();

describe('intégration: event-bus <-> event-logger', () => {
  beforeAll(() => {
    register({ getBus: () => eventBus });
  });

  it('devrait enregistrer automatiquement un événement émis par un module', done => {
    const logSpy = jest.spyOn(console, 'info').mockImplementation(() => {});

    eventBus.publish('LOG_INFO', {
      source: 'MOCK_MODULE',
      message: 'Test d’intégration réussi',
      details: { step: 1 }
    });

    setTimeout(() => {
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('MOCK_MODULE'));
      logSpy.mockRestore();
      done();
    }, 20);
  });

  it('devrait logger une erreur avec un objet Error en détail', done => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const testError = new Error('Erreur simulée');
    eventBus.publish('LOG_ERROR', {
      source: 'FAKE_MODULE',
      message: 'Quelque chose a mal tourné',
      details: testError
    });

    setTimeout(() => {
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[ERROR]'));
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('FAKE_MODULE'));
      errorSpy.mockRestore();
      done();
    }, 20);
  });
});
