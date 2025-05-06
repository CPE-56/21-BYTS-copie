// tests/unit/core/event-bus.test.js
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

const { getInstance } = require('../../../src/core/event-bus');
const eventBus = getInstance();

describe('event-bus.js', () => {
  it('devrait appeler les abonnés lors d’un publish', done => {
    const callback = jest.fn();
    const subId = eventBus.subscribe('TEST_EVENT', callback);
    eventBus.publish('TEST_EVENT', { foo: 'bar' });
    setTimeout(() => {
      expect(callback).toHaveBeenCalledWith({ foo: 'bar' }, expect.any(Object));
      eventBus.unsubscribe(subId);
      done();
    }, 10);
  });

  it('ne devrait pas planter sans abonné', () => {
    expect(() => {
      eventBus.publish('UNHANDLED_EVENT', {});
    }).not.toThrow();
  });

  it('unsubscribe doit empêcher la réception', done => {
    const callback = jest.fn();
    const subId = eventBus.subscribe('TEST_EVENT', callback);
    eventBus.unsubscribe(subId);
    eventBus.publish('TEST_EVENT', {});
    setTimeout(() => {
      expect(callback).not.toHaveBeenCalled();
      done();
    }, 10);
  });

  it('devrait logguer une erreur si un callback plante', done => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const subId = eventBus.subscribe('FAIL_EVENT', () => {
      throw new Error('Erreur simulée');
    });

    eventBus.publish('FAIL_EVENT', {});

    setTimeout(() => {
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('[EventBus] Erreur dans callback pour FAIL_EVENT:'),
        expect.any(Error)
      );
      eventBus.unsubscribe(subId);
      spy.mockRestore();
      done();
    }, 20);
  });
});
