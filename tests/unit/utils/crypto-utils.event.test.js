const cryptoUtils = require('../../../src/utils/crypto-utils');

// Simule un bus d'événements
function createMockEventBus() {
  const listeners = {};
  return {
    publish(eventType, payload) {
      if (listeners[eventType]) {
        listeners[eventType].forEach((cb) => cb(payload));
      }
    },
    subscribe(eventType, callback) {
      if (!listeners[eventType]) listeners[eventType] = [];
      listeners[eventType].push(callback);
    }
  };
}

// Événements simulés
const EVENT_TYPES = {
  CONFIG: { LOADED: 'CONFIG_LOADED', CHANGE_REQUEST: 'CONFIG_CHANGE_REQUEST' },
  ENCRYPT_DATA: 'ENCRYPT_DATA',
  DECRYPT_DATA: 'DECRYPT_DATA',
  GENERATE_KEY: 'GENERATE_KEY',
  HASH_DATA: 'HASH_DATA',
  VERIFY_HASH: 'VERIFY_HASH',
  GENERATE_TOKEN: 'GENERATE_TOKEN',
  ENCRYPT_DATA_RESULT: 'ENCRYPT_DATA_RESULT',
  DECRYPT_DATA_RESULT: 'DECRYPT_DATA_RESULT',
  GENERATE_KEY_RESULT: 'GENERATE_KEY_RESULT',
  HASH_DATA_RESULT: 'HASH_DATA_RESULT',
  VERIFY_HASH_RESULT: 'VERIFY_HASH_RESULT',
  GENERATE_TOKEN_RESULT: 'GENERATE_TOKEN_RESULT',
  ERROR: { NON_CRITICAL: 'ERROR_OCCURRED' },
  LOG: { INFO: 'LOG_INFO', ERROR: 'LOG_ERROR' }
};

describe('crypto-utils (événementiel)', () => {
  let mockBus;

  beforeEach(() => {
    mockBus = createMockEventBus();
    cryptoUtils.initialize(mockBus, EVENT_TYPES);
  });

  test('doit retourner un HASH_DATA_RESULT correct', (done) => {
    const payload = 'motDePasse123';

    mockBus.subscribe(EVENT_TYPES.HASH_DATA_RESULT, (result) => {
      try {
        expect(result.success).toBe(true);
        expect(result.hash).toBeDefined();
        expect(result.salt).toBeDefined();
        expect(result.algorithm).toBe('sha256');
        done();
      } catch (err) {
        done(err);
      }
    });

    mockBus.publish(EVENT_TYPES.HASH_DATA, {
      requestId: 'test-hash-001',
      payload,
      password: true
    });
  });

  test('doit hacher puis vérifier un mot de passe avec VERIFY_HASH_RESULT', (done) => {
    const password = 'secret42';

    mockBus.subscribe(EVENT_TYPES.HASH_DATA_RESULT, (hashResult) => {
      expect(hashResult.success).toBe(true);

      mockBus.subscribe(EVENT_TYPES.VERIFY_HASH_RESULT, (verifyResult) => {
        try {
          expect(verifyResult.success).toBe(true);
          expect(verifyResult.isValid).toBe(true);
          done();
        } catch (err) {
          done(err);
        }
      });

      mockBus.publish(EVENT_TYPES.VERIFY_HASH, {
        requestId: 'verify-test-001',
        payload: password,
        hash: hashResult.hash,
        salt: hashResult.salt,
        password: true,
        algorithm: hashResult.algorithm
      });
    });

    mockBus.publish(EVENT_TYPES.HASH_DATA, {
      requestId: 'hash-verify-test',
      payload: password,
      password: true
    });
  });
});
