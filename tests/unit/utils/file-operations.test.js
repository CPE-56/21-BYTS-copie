const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');
const fileOperations = require('../../../src/utils/file-operations');

describe('file-operations - FILE_OPERATION_REQUESTED (READ)', () => {
  let eventBus;
  const testFilePath = path.join(__dirname, 'mock-file.txt');

  beforeAll(() => {
    fs.writeFileSync(testFilePath, 'Contenu de test');
  });

  afterAll(() => {
    fs.unlinkSync(testFilePath);
  });

  beforeEach(() => {
    eventBus = new EventEmitter();
  });

  test("devrait lire un fichier existant et 'émettre FILE_OPERATION_COMPLETED", (done) => {
    const requestId = 'test-read-1';

    eventBus.once('FILE_OPERATION_COMPLETED', (data) => {
      expect(data.requestId).toBe(requestId);
      expect(data.operation).toBe('READ');
      expect(data.result.toString()).toBe('Contenu de test');
      done();
    });

    eventBus.once('MODULE_INITIALIZED', () => {
      eventBus.emit('FILE_OPERATION_REQUESTED', {
        operation: 'READ',
        requestId,
        params: {
          filePath: testFilePath,
          encoding: 'utf8'
        }
      });
    });

    fileOperations.initialize({ eventBus });
  }, 10000);

  test("devrait 'émettre FILE_OPERATION_FAILED si le fichier est introuvable", (done) => {
    const requestId = 'test-read-2';
    const fakePath = path.join(__dirname, 'non-existent.txt');

    eventBus.once('FILE_OPERATION_FAILED', (data) => {
      expect(data.requestId).toBe(requestId);
      expect(data.operation).toBe('READ');
      expect(data.error).toMatch(/Erreur lors de la lecture/);
      done();
    });

    eventBus.once('MODULE_INITIALIZED', () => {
      eventBus.emit('FILE_OPERATION_REQUESTED', {
        operation: 'READ',
        requestId,
        params: {
          filePath: fakePath,
          encoding: 'utf8'
        }
      });
    });

    fileOperations.initialize({ eventBus });
  }, 10000);
});
