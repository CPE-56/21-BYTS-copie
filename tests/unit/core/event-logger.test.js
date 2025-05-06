// tests/unit/core/event-logger.test.js
jest.mock('electron', () => ({
  ipcRenderer: { on: jest.fn(), send: jest.fn() },
  app: { getPath: jest.fn(() => '/tmp/mock-user-data') }
}));

global.window = {
  addEventListener: jest.fn()
};

const { register } = require('../../../src/core/event-logger');
const { getInstance } = require('../../../src/core/event-bus');
const eventBus = getInstance();

describe('event-logger.js', () => {
  beforeAll(() => {
    register({ getBus: () => eventBus });

    // Active log level 'debug' avant les tests
    eventBus.publish('CONFIG_UPDATED', {
      logger: {
        logLevel: 'debug',
        logToConsole: true,
        logToFile: false
      }
    });
  });

  it('devrait logger un événement LOG_INFO', done => {
    const spy = jest.spyOn(console, 'info').mockImplementation(() => {});
    eventBus.publish('LOG_INFO', {
      source: 'TEST_MODULE',
      message: 'Ceci est un test'
    });
    setTimeout(() => {
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('TEST_MODULE'));
      spy.mockRestore();
      done();
    }, 20);
  });

  it('devrait logger un warning', done => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    eventBus.publish('LOG_WARNING', {
      source: 'TEST',
      message: 'Warning test'
    });
    setTimeout(() => {
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Warning test'));
      spy.mockRestore();
      done();
    }, 20);
  });

  it('devrait logger une erreur', done => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    eventBus.publish('LOG_ERROR', {
      source: 'TEST',
      message: 'Erreur test'
    });
    setTimeout(() => {
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Erreur test'));
      spy.mockRestore();
      done();
    }, 20);
  });

  it('devrait logger un debug', done => {
    const spy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    eventBus.publish('LOG_DEBUG', {
      source: 'TEST',
      message: 'Debug test'
    });
    setTimeout(() => {
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Debug test'));
      spy.mockRestore();
      done();
    }, 30);
  });
});
