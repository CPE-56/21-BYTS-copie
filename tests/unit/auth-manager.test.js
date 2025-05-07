/**
 * @file auth-manager.test.js
 */

const { initialize } = require('../../src/modules/auth/auth-manager.js');
const { AUTH } = require('../../src/constants/event-types.js');
const EventEmitter = require('events');

describe('🔐 auth-manager.js', () => {
  let eventBus;

  beforeEach(() => {
    eventBus = new EventEmitter();
    eventBus.subscribe = (event, handler) => eventBus.on(event, handler);
    eventBus.publish = jest.fn();
    const ERROR_CODES = require('../../src/constants/error-codes');
    const EVENT_TYPES = require('../../src/constants/event-types');
    initialize(eventBus, EVENT_TYPES, ERROR_CODES);
  });

  it('devrait initialiser et ne pas planter', () => {
    expect(typeof eventBus.publish).toBe('function');
  });
});
