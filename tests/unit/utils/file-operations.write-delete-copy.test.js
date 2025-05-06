/**
 * @file file-operations.test.js
 * @description Tests des opérations WRITE, DELETE, COPY du module file-operations.js
 */

const { EventEmitter } = require('events');
const path = require('path');
const mock = require('mock-fs');
const fs = require('fs');
const fileOperations = require('../../../src/utils/file-operations');

describe('file-operations - FILE_OPERATION_REQUESTED', () => {
  let eventBus;
  const baseDir = '/mock';
  const writeFilePath = path.join(baseDir, 'to-write.txt');
  const deleteFilePath = path.join(baseDir, 'to-delete.txt');
  const copySourcePath = path.join(baseDir, 'source.txt');
  const copyDestPath = path.join(baseDir, 'destination.txt');

  beforeEach(() => {
    eventBus = new EventEmitter();

    mock({
      [deleteFilePath]: 'delete me',
      [copySourcePath]: 'copy me',
      [baseDir]: {} // ensure base exists
    });
  });

  afterEach(() => {
    mock.restore();
  });

  test("WRITE: devrait écrire un fichier et émettre FILE_OPERATION_COMPLETED", (done) => {
    const requestId = 'write-1';

    eventBus.once('FILE_OPERATION_COMPLETED', (data) => {
      expect(data.requestId).toBe(requestId);
      expect(data.operation).toBe('WRITE');
      expect(fs.readFileSync(writeFilePath, 'utf-8')).toBe('écriture test');
      done();
    });

    eventBus.once('MODULE_INITIALIZED', () => {
      eventBus.emit('FILE_OPERATION_REQUESTED', {
        operation: 'WRITE',
        requestId,
        params: {
          filePath: writeFilePath,
          data: 'écriture test',
          encoding: 'utf8'
        }
      });
    });

    fileOperations.initialize({ eventBus });
  });

  test("DELETE: devrait supprimer un fichier existant", (done) => {
    const requestId = 'delete-1';

    eventBus.once('FILE_OPERATION_COMPLETED', (data) => {
      expect(data.requestId).toBe(requestId);
      expect(data.operation).toBe('DELETE');
      expect(fs.existsSync(deleteFilePath)).toBe(false);
      done();
    });

    eventBus.once('MODULE_INITIALIZED', () => {
      eventBus.emit('FILE_OPERATION_REQUESTED', {
        operation: 'DELETE',
        requestId,
        params: {
          filePath: deleteFilePath
        }
      });
    });

    fileOperations.initialize({ eventBus });
  });

  test("COPY: devrait copier un fichier d'une source vers une destination", (done) => {
    const requestId = 'copy-1';

    eventBus.once('FILE_OPERATION_COMPLETED', (data) => {
      expect(data.requestId).toBe(requestId);
      expect(data.operation).toBe('COPY');
      const content = fs.readFileSync(copyDestPath, 'utf-8');
      expect(content).toBe('copy me');
      done();
    });

    eventBus.once('MODULE_INITIALIZED', () => {
      eventBus.emit('FILE_OPERATION_REQUESTED', {
        operation: 'COPY',
        requestId,
        params: {
          sourcePath: copySourcePath,
          destinationPath: copyDestPath
        }
      });
    });

    fileOperations.initialize({ eventBus });
  });
});
