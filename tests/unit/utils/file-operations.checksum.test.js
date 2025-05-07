/**
 * @file file-operations.checksum.test.js
 * @description Test de la vérification de checksum sans mock-fs, avec vrais fichiers temporaires.
 */

const { EventEmitter } = require('events');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const fileOperations = require('../../../src/utils/file-operations');

describe('file-operations - FILE_CHECKSUM_VERIFICATION_REQUESTED (réel)', () => {
  let eventBus;
  const testDir = path.join(os.tmpdir(), '21BYTS', 'downloads-in-progress');
  const testFilePath = path.join(testDir, 'check.txt');
  const testContent = 'test checksum content';
  const expectedChecksum = crypto.createHash('sha256').update(testContent).digest('hex');

  beforeAll(() => {
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(testFilePath, testContent);
  });

  beforeEach(() => {
    eventBus = new EventEmitter();
  });

  afterAll(() => {
    if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);
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

    eventBus.once('MODULE_INITIALIZED', () => {
      eventBus.emit('FILE_CHECKSUM_VERIFICATION_REQUESTED', {
        requestId,
        filePath: testFilePath,
        expectedChecksum,
        algorithm: 'sha256'
      });
    });

    fileOperations.initialize({ eventBus });
  }, 10000);
});
