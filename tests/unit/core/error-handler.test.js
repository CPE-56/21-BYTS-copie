// tests/unit/core/error-handler.test.js
const { getInstance } = require('../../../src/core/event-bus');
const { initialize } = require('../../../src/core/error-handler');

const eventBus = getInstance();

describe('error-handler.js', () => {
  beforeAll(() => {
    initialize({ eventBus });
  });

  it('devrait relayer une erreur reçue en UI_SHOW_ERROR', done => {
    const sub = eventBus.subscribe('UI_SHOW_ERROR', (payload) => {
      expect(payload).toHaveProperty('title');
      expect(payload.message).toContain('Erreur simulée');
      expect(payload.details).toContain('Simulated error');
      eventBus.unsubscribe(sub);
      done();
    });

    eventBus.publish('ERROR', {
      source: 'TEST_MODULE',
      message: 'Erreur simulée',
      error: new Error('Simulated error')
    });
  });
});
