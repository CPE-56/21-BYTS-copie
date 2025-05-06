/**
 * @file file-operations.move-checksize.test.js
 * @description Tests des opérations MOVE, CHECK_EXISTS, GET_FILE_SIZE du module file-operations.js
 */

const { EventEmitter } = require('events');
const path = require('path');
const mock = require('mock-fs');
const fs = require('fs');
const fileOperations = require('../../../src/utils/file-operations');

describe('file-operations - FILE_OPERATION_REQUESTED (MOVE, CHECK_EXISTS, GET_FILE_SIZE)', () => {
  let eventBus;
  const baseDir = '/mock';
  const moveSource = path.join(baseDir, 'move-source.txt');
  const moveDest = path.join(baseDir, 'move-dest.txt');
  const checkFile = path.join(baseDir, 'exists.txt');
  const sizeFile = path.join(baseDir, 'sized.txt');

  beforeEach(() => {
    eventBus = new EventEmitter();

    mock({
      [moveSource]: 'to be moved',
      [checkFile]: 'I exist!',
      [sizeFile]: '1234567890', // 10 bytes
      [baseDir]: {}
    });
  });

  afterEach(() => {
    mock.restore();
  });

  test("MOVE: devrait déplacer un fichier source vers destination", (done) => {
    const requestId = 'move-1';

    eventBus.once('FILE_OPERATION_COMPLETED', (data) => {
      expect(data.requestId).toBe(requestId);
      expect(data.operation).toBe('MOVE');
      expect(fs.existsSync(moveSource)).toBe(false);
      expect(fs.readFileSync(moveDest, 'utf-8')).toBe('to be moved');
      done();
    });

    eventBus.once('MODULE_INITIALIZED', () => {
      eventBus.emit('FILE_OPERATION_REQUESTED', {
        operation: 'MOVE',
        requestId,
        params: {
          sourcePath: moveSource,
          destinationPath: moveDest
        }
      });
    });

    fileOperations.initialize({ eventBus });
  });

  test("CHECK_EXISTS: devrait retourner true si le fichier existe", (done) => {
    const requestId = 'exists-1';

    eventBus.once('FILE_OPERATION_COMPLETED', (data) => {
      expect(data.requestId).toBe(requestId);
      expect(data.operation).toBe('CHECK_EXISTS');
      expect(data.exists).toBe(true);
      done();
    });

    eventBus.once('MODULE_INITIALIZED', () => {
      eventBus.emit('FILE_OPERATION_REQUESTED', {
        operation: 'CHECK_EXISTS',
        requestId,
        params: {
          filePath: checkFile
        }
      });
    });

    fileOperations.initialize({ eventBus });
  });

  test("GET_FILE_SIZE: devrait retourner la taille du fichier", (done) => {
    const requestId = 'size-1';

    eventBus.once('FILE_OPERATION_COMPLETED', (data) => {
      expect(data.requestId).toBe(requestId);
      expect(data.operation).toBe('GET_FILE_SIZE');
      expect(data.size).toBe(10); // 10 bytes
      done();
    });

    eventBus.once('MODULE_INITIALIZED', () => {
      eventBus.emit('FILE_OPERATION_REQUESTED', {
        operation: 'GET_FILE_SIZE',
        requestId,
        params: {
          filePath: sizeFile
        }
      });
    });

    fileOperations.initialize({ eventBus });
  });
});
