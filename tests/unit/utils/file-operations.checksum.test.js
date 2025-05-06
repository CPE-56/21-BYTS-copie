/**
 * @file file-operations.checksum.test.js
 * @description Test de la vérification de checksum (sha256) via verifyFileChecksum
 */

const { EventEmitter } = require('events');
const path = require('path');
const mock = require('mock-fs');
const crypto = require('crypto');
const fs = require('fs');
const fileOperations = require('../../../src/utils/file-operations');

describe('file-operations - FILE_CHECKSUM_VERIFICATION_REQUESTED', () => {
  let eventBus;
  const testFilePath = '/mock/check.txt';
  const testContent = 'test checksum content';
  const expectedChecksum = crypto.createHash('sha256').update(testContent).digest('hex');

  beforeEach(() => {
    eventBus = new EventEmitter();

    mock({
      [testFilePath]: testContent
    });
  });

  afterEach(() => {
    mock.restore();
  });

  test('devrait vérifier que le checksum SHA256 est correct', (done) => {
    const requestId = 'checksum-1';

    eventBus.once('FILE_CHECKSUM_VERIFIED', (data) => {
      expect(data.requestId).toBe(requestId);
      expect(data.filePath).toBe(testFilePath);
      expect(data.verified).toBe(true);
      expect(data.checksum).toBe(expectedChecksum);
      done();
    });

    fileOperations.initialize({ eventBus });

    eventBus.emit('FILE_CHECKSUM_VERIFICATION_REQUESTED', {
      requestId,
      filePath: testFilePath,
      expectedChecksum,
      algorithm: 'sha256'
    });
  });

  test('devrait échouer si le checksum est incorrect', (done) => {
    const requestId = 'checksum-2';
    const wrongChecksum = '0000000000000000000000000000000000000000000000000000000000000000';

    eventBus.once('FILE_CHECKSUM_VERIFIED', (data) => {
      expect(data.requestId).toBe(requestId);
      expect(data.verified).toBe(false);
      expect(data.checksum).toBe(expectedChecksum);
      done();
    });

    fileOperations.initialize({ eventBus });

    eventBus.emit('FILE_CHECKSUM_VERIFICATION_REQUESTED', {
      requestId,
      filePath: testFilePath,
      expectedChecksum: wrongChecksum,
      algorithm: 'sha256'
    });
  });
});
