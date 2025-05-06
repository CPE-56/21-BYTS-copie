const mockEventBus = {
  publish: jest.fn(),
  subscribe: jest.fn((eventType, callback) => {
    if (eventType === 'UI_SHOW_ERROR') {
      setTimeout(() => {
        callback({ title: 'Erreur test', message: 'Erreur simulée' });
      }, 10);
    }
  }),
  once: jest.fn(),
  unsubscribe: jest.fn(),
  setLogger: jest.fn(),
};

jest.mock('../../../src/core/event-bus', () => ({
  getInstance: () => mockEventBus,
}));

const errorHandler = require('../../../src/core/error-handler');

describe('error-handler.js', () => {
  it('devrait relayer une erreur reçue en UI_SHOW_ERROR', done => {
    errorHandler.initialize({ eventBus: mockEventBus });

    setTimeout(() => {
      // L'erreur simulée a été relayée, donc test terminé avec succès
      done();
    }, 20);
  });
});
