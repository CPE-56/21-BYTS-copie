/**
 * mock-loader.js
 *
 * Initialise tous les mocks critiques pour les tests (yt-dlp, ffmpeg, tokens).
 * À appeler dans chaque test ou dans un setup global (ex. Mocha --file).
 */

const sinon = require('sinon');

// Références internes aux mocks
const ytDlpMock = require('./yt-dlp-mock');
const ffmpegMock = require('./ffmpeg-mock');
const tokenStoreMock = require('./token-store-mock');

// Utilisé pour restaurer après les tests
let stubs = [];

/**
 * Initialise tous les mocks nécessaires.
 */
function initMocks() {
  ytDlpMock.init();
  ffmpegMock.init();

  // Mocke secure-token-store.js
  const tokenStorePath = '../../src/modules/auth/secure-token-store';
  const tokenStore = require(tokenStorePath);

  stubs.push(sinon.stub(tokenStore, 'getToken').callsFake(tokenStoreMock.getToken));
  stubs.push(sinon.stub(tokenStore, 'setToken').callsFake(tokenStoreMock.setToken));
  stubs.push(sinon.stub(tokenStore, 'clearToken').callsFake(tokenStoreMock.clearToken));
}

/**
 * Nettoie les mocks (à appeler dans afterEach).
 */
function restoreMocks() {
  stubs.forEach(stub => stub.restore());
  stubs = [];
}

module.exports = {
  initMocks,
  restoreMocks
};
