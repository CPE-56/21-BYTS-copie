/**
 * @file format-converter.test.js
 */

jest.mock('child_process', () => {
  const { EventEmitter } = require('events');
  return {
    spawn: jest.fn(() => {
      const events = new EventEmitter();
      events.stderr = new EventEmitter();
      events.stdout = new EventEmitter();
      setTimeout(() => events.emit('close', 0), 10);
      return events;
    }),
  };
});

// Mock the fs module to make the file check pass
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  unlinkSync: jest.fn(),
  mkdirSync: jest.fn(),
  accessSync: jest.fn(),
  copyFileSync: jest.fn(),
  readdirSync: jest.fn().mockReturnValue(['output.mp3'])
}));

const EventEmitter = require('events');
const { initFormatConverter } = require('../../src/modules/formats/format-converter.core.js');

describe('🎧 format-converter.js', () => {
  let eventBus;

  beforeEach(() => {
    eventBus = new EventEmitter();
    eventBus.subscribe = (type, handler) => eventBus.on(type, handler);
    eventBus.publish = jest.fn();
    initFormatConverter({ eventBus });
  });

  it('émet FORMAT_CONVERSION_STARTED après demande de conversion', async () => {
    const payload = {
      sourceFile: '/tmp/audio.wav',
      targetFormat: 'mp3',
      requestId: 'test-request-id',
      quality: { bitrate: '320k' }
    };

    eventBus.emit('FORMAT_CONVERSION_REQUESTED', payload);
    expect(eventBus.publish).toHaveBeenCalledWith('FORMAT_CONVERSION_STARTED', expect.any(Object));
  });
});
