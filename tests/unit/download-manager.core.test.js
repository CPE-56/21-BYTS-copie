/**
 * @file download-manager.core.test.js
 */

jest.mock('child_process', () => {
  const { EventEmitter } = require('events');
  return {
    spawn: jest.fn(() => {
      const e = new EventEmitter();
      process.nextTick(() => e.emit('close', 0));
      return e;
    }),
  };
});

const { initDownloadManager } = require('../../src/modules/download/download-manager.core.js');
const EventEmitter = require('events');
const fs = require('fs');

describe('⬇️ download-manager.core.js', () => {
  let eventBus;

  beforeEach(() => {
    eventBus = new EventEmitter();
    eventBus.subscribe = (event, handler) => eventBus.on(event, handler);
    eventBus.publish = jest.fn();
    initDownloadManager({ eventBus });
  });

  it('devrait pouvoir être initialisé sans erreur', () => {
    expect(typeof eventBus.publish).toBe('function');
  });
});
