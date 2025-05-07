/**
 * @file file-operations.paths.test.js
 * @description Tests des chemins de fichiers avec vrais répertoires (sans mock-fs).
 */

const { EventEmitter } = require('events');
const path = require('path');
const os = require('os');
const fs = require('fs');
const fileOperations = require('../../../src/utils/file-operations');

describe('file-operations - FILE_PATH_REQUESTED (réel)', () => {
  let eventBus;
  const musicPath = path.join(os.homedir(), 'Music', '21BYTS');
  const tempPath = path.join(os.tmpdir(), '21BYTS', 'downloads-in-progress');

  beforeAll(() => {
    fs.mkdirSync(musicPath, { recursive: true });
    fs.mkdirSync(tempPath, { recursive: true });
  });

  beforeEach(() => {
    eventBus = new EventEmitter();
  });

  test('DOWNLOAD: génère chemin avec artiste et album', (done) => {
    const requestId = 'path-dl-1';

    eventBus.once('FILE_PATH_RESOLVED', (data) => {
      expect(data.filePath).toMatch(/21BYTS[\/].*Artiste[\/].*Album[\/]track.mp3$/);
      done();
    });

    eventBus.once('MODULE_INITIALIZED', () => {
      eventBus.emit('FILE_PATH_REQUESTED', {
        requestId,
        pathType: 'DOWNLOAD',
        filename: 'track.mp3',
        metadata: {
          artist: 'Artiste',
          album: 'Album'
        }
      });
    });

    fileOperations.initialize({ eventBus });
  }, 10000);

  test('TEMP: génère chemin temporaire nettoyé', (done) => {
    const requestId = 'path-temp-1';

    eventBus.once('FILE_PATH_RESOLVED', (data) => {
      expect(data.filePath).toMatch(/downloads-in-progress[\/]temp_file.mp3$/);
      done();
    });

    eventBus.once('MODULE_INITIALIZED', () => {
      eventBus.emit('FILE_PATH_REQUESTED', {
        requestId,
        pathType: 'TEMP',
        filename: 'temp/file.mp3'
      });
    });

    fileOperations.initialize({ eventBus });
  }, 10000);

  test('PLAYLIST: génère chemin .m3u nettoyé', (done) => {
    const requestId = 'path-playlist-1';

    eventBus.once('FILE_PATH_RESOLVED', (data) => {
      expect(data.filePath).toMatch(/Playlists[\/]My_Playlist.m3u$/);
      done();
    });

    eventBus.once('MODULE_INITIALIZED', () => {
      eventBus.emit('FILE_PATH_REQUESTED', {
        requestId,
        pathType: 'PLAYLIST',
        playlistName: 'My/Playlist'
      });
    });

    fileOperations.initialize({ eventBus });
  }, 10000);
});
