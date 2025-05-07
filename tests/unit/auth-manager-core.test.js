const EventEmitter = require('events');
const createAuthManagerCore = require('../../src/modules/auth/auth-manager.core');
const EVENT_TYPES = require('../../src/constants/event-types');
const ERROR_CODES = require('../../src/constants/error-codes');

describe('🔐 auth-manager.core.js', () => {
  let mockEventBus;
  let publishedEvents;
  let authManager;

  beforeEach(() => {
    publishedEvents = [];
    mockEventBus = new EventEmitter();

    // Spies pour les événements publiés
    mockEventBus.publish = (event, payload) => {
      publishedEvents.push({ event, payload });
      mockEventBus.emit(event, payload);
    };

    mockEventBus.subscribe = (event, handler) => {
      mockEventBus.on(event, handler);
    };

    authManager = createAuthManagerCore();
    authManager.initialize(mockEventBus, EVENT_TYPES, ERROR_CODES);
  });

  it('émet AUTH:SUCCESS et AUTH:TOKENS_UPDATED lors d’une authentification réussie', async () => {
    const successSpy = jest.fn();
    const tokensSpy = jest.fn();

    mockEventBus.subscribe(EVENT_TYPES.AUTH.SUCCESS, successSpy);
    mockEventBus.subscribe(EVENT_TYPES.AUTH.TOKENS_UPDATED, tokensSpy);

    mockEventBus.publish(EVENT_TYPES.AUTH.REQUEST, {
      provider: 'tidal',
      credentials: { clientId: 'abc', secret: 'xyz' }
    });

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(successSpy).toHaveBeenCalledTimes(1);
    expect(tokensSpy).toHaveBeenCalledTimes(1);

    const tokenPayload = successSpy.mock.calls[0][0];
    expect(tokenPayload).toHaveProperty('token.accessToken');
    expect(tokenPayload.service).toBe('tidal');
  });

  it('émet AUTH:FAILURE si une erreur survient', async () => {
    const failureSpy = jest.fn();

    mockEventBus.subscribe(EVENT_TYPES.AUTH.FAILURE, failureSpy);

    // Simuler une erreur en envoyant des paramètres invalides
    mockEventBus.publish(EVENT_TYPES.AUTH.REQUEST, {
      provider: null,
      credentials: null
    });

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(failureSpy).toHaveBeenCalledTimes(1);
    const error = failureSpy.mock.calls[0][0];

    expect(error).toHaveProperty('code');
    expect(error).toHaveProperty('name');
    expect(error.name).toBe('AUTH_FAILED');
  });
});
