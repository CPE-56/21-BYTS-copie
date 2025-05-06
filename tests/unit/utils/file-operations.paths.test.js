/**
 * @file file-operations.paths.test.js
 * @description Tests pour les fonctions de génération de chemins et de nettoyage de nom de fichier.
 */

const { EventEmitter } = require('events');
const path = require('path');
const fileOperations = require('../../../src/utils/file-operations');

describe('file-operations - FILE_PATH_REQUESTED (DOWNLOAD, TEMP, PLAYLIST)', () => {
  let eventBus;

  beforeEach(() => {
    eventBus = new EventEmitter();
  });

  test('DOWNLOAD: devrait générer un chemin structuré avec artiste et album', (done) => {
    const requestId = 'download-path-1';

    eventBus.once('FILE_PATH_RESOLVED', (data) => {
      expect(data.requestId).toBe(requestId);
      expect(data.pathType).toBe('DOWNLOAD');
      expect(data.filePath).toMatch(/21BYTS[\/].*Artiste[\/].*Album[\/]track.mp3$/);
      done();
    });

    fileOperations.initialize({ eventBus });

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

  test('TEMP: devrait générer un chemin temporaire avec nom de fichier nettoyé', (done) => {
    const requestId = 'temp-path-1';

    eventBus.once('FILE_PATH_RESOLVED', (data) => {
      expect(data.requestId).toBe(requestId);
      expect(data.pathType).toBe('TEMP');
      expect(data.filePath).toMatch(/downloads-in-progress[\/]temp_file.mp3$/);
      done();
    });

    fileOperations.initialize({ eventBus });

    eventBus.emit('FILE_PATH_REQUESTED', {
      requestId,
      pathType: 'TEMP',
      filename: 'temp/file.mp3'
    });
  });

  test('PLAYLIST: devrait générer un chemin de playlist avec .m3u', (done) => {
    const requestId = 'playlist-path-1';

    eventBus.once('FILE_PATH_RESOLVED', (data) => {
      expect(data.requestId).toBe(requestId);
      expect(data.pathType).toBe('PLAYLIST');
      expect(data.filePath).toMatch(/Playlists[\/]My_Playlist.m3u$/);
      done();
    });

    fileOperations.initialize({ eventBus });

    eventBus.emit('FILE_PATH_REQUESTED', {
      requestId,
      pathType: 'PLAYLIST',
      playlistName: 'My/Playlist'
    });
  });
});
