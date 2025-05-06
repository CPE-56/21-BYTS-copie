const { EventEmitter } = require('events');
const createEventThrottler = require('../../../src/utils/event-throttler');

describe('EventThrottler - stratégies throttle, debounce, batch, unregister', () => {
  let bus;
  let emittedEvents = [];

  beforeEach(() => {
    bus = new EventEmitter();
    bus.publish = (type, payload) => bus.emit(type, payload);
    bus.subscribe = (type, handler) => bus.on(type, handler);
    bus.unsubscribe = (type, handler) => bus.off(type, handler);

    emittedEvents = [];

    eventThrottler = createEventThrottler(); // ✅ crée une vraie instance
    eventThrottler.initialize(bus);
  });

  afterEach(() => {
    if (eventThrottler.cleanup) eventThrottler.cleanup();
    bus.removeAllListeners();
  });

  test('throttle: ne doit émettre qu’un seul événement pendant la période', async () => {
    bus.subscribe('MY_EVENT_THROTTLED', (data) => emittedEvents.push(data));

    bus.publish('THROTTLER:REGISTER', {
      sourceEvent: 'MY_EVENT',
      targetEvent: 'MY_EVENT_THROTTLED',
      strategy: 'throttle',
      options: { interval: 200, leading: true, trailing: false }
    });

    for (let i = 0; i < 5; i++) {
      bus.publish('MY_EVENT', { index: i });
    }

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(emittedEvents.length).toBe(1);
    expect(emittedEvents[0].index).toBe(0);
  });

  test('debounce: doit émettre un seul événement après inactivité', async () => {
    bus.subscribe('MY_EVENT_DEBOUNCED', (data) => emittedEvents.push(data));

    bus.publish('THROTTLER:REGISTER', {
      sourceEvent: 'MY_EVENT',
      targetEvent: 'MY_EVENT_DEBOUNCED',
      strategy: 'debounce',
      options: { delay: 200 }
    });

    for (let i = 0; i < 3; i++) {
      bus.publish('MY_EVENT', { index: i });
      await new Promise((r) => setTimeout(r, 50));
    }

    await new Promise((r) => setTimeout(r, 300));

    expect(emittedEvents.length).toBe(1);
    expect(emittedEvents[0].index).toBe(2);
  });

  test('batch: doit regrouper les événements en un batch', async () => {
    bus.subscribe('MY_EVENT_BATCHED', (data) => emittedEvents.push(data));

    bus.publish('THROTTLER:REGISTER', {
      sourceEvent: 'MY_EVENT',
      targetEvent: 'MY_EVENT_BATCHED',
      strategy: 'batch',
      options: { maxSize: 5, maxInterval: 300 }
    });

    for (let i = 0; i < 4; i++) {
      bus.publish('MY_EVENT', { index: i });
    }

    await new Promise((r) => setTimeout(r, 350));

    expect(emittedEvents.length).toBe(1);
    expect(emittedEvents[0].items.length).toBe(4);
  });

  test('unregister: ne doit plus émettre après désenregistrement', async () => {
    let event1, event2;

    bus.subscribe('MY_EVENT_THROTTLED', (data) => {
      console.log('[TEST] Événement reçu :', data);
      if (!event1) event1 = data;
      else event2 = data;
    });

    // Confirmer enregistrement
    const registered = new Promise((resolve) => {
      bus.subscribe('THROTTLER:REGISTERED', resolve);
    });

    bus.publish('THROTTLER:REGISTER', {
      sourceEvent: 'MY_EVENT',
      targetEvent: 'MY_EVENT_THROTTLED',
      strategy: 'throttle',
      options: { interval: 100, leading: true, trailing: false }
    });

    await registered;

    // Publier l'événement
    console.log('[TEST] Envoi du 1er événement');
    bus.publish('MY_EVENT', { foo: 'bar' });

    // Attendre un court instant
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Désenregistrement
    console.log('[TEST] Désenregistrement');
    bus.publish('THROTTLER:UNREGISTER', {
      sourceEvent: 'MY_EVENT',
      targetEvent: 'MY_EVENT_THROTTLED'
    });

    // 2e événement (doit être ignoré)
    bus.publish('MY_EVENT', { foo: 'bar2' });

    await new Promise((resolve) => setTimeout(resolve, 200));

    console.log('[TEST] Résultat final :', emittedEvents);

    expect(event1).toEqual({ foo: 'bar' });
    expect(event2).toBeUndefined();
  });
});
