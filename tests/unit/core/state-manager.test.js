// tests/unit/core/state-manager.test.js
const { getInstance } = require('../../../src/core/event-bus');
const { initialize } = require('../../../src/core/state-manager');

const eventBus = getInstance();

describe('state-manager.js', () => {
  beforeAll(() => {
    initialize({ eventBus });
  });

  it('devrait définir une valeur dans le state', done => {
    const key = 'testKey';
    const value = { foo: 'bar' };

    eventBus.publish('STATE:SET', { key, value });

    eventBus.publish('STATE:GET', {
      key,
      callback: (val) => {
        expect(val).toEqual(value);
        done();
      }
    });
  });

  it('devrait fusionner une mise à jour', done => {
    eventBus.publish('STATE:UPDATE', {
      key: 'testKey',
      value: { bar: 'baz' }
    });

    eventBus.publish('STATE:GET', {
      key: 'testKey',
      callback: (val) => {
        expect(val).toEqual({ foo: 'bar', bar: 'baz' });
        done();
      }
    });
  });

  it('devrait réinitialiser tout le state', done => {
    eventBus.publish('STATE:RESET');

    eventBus.publish('STATE:GET', {
      key: 'testKey',
      callback: (val) => {
        expect(val).toBeUndefined();
        done();
      }
    });
  });

  it('devrait notifier les abonnés du changement de state', done => {
    const subscriptionId = eventBus.subscribe('STATE:CHANGED', ({ key, value }) => {
      expect(key).toBe('notifyKey');
      expect(value).toBe('hello');
      eventBus.unsubscribe(subscriptionId);
      done();
    });

    eventBus.publish('STATE:SET', { key: 'notifyKey', value: 'hello' });
  });
});
