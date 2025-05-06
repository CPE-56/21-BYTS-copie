const errorCodes = require('../../src/constants/error-codes');

function extractErrorObjects(obj) {
  const errors = [];

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      continue;
    if (key === 'SEVERITY' || key === 'CATEGORY') continue;

    // Parcours des erreurs d'une catégorie
    for (const e of Object.values(value)) {
      if (typeof e === 'object' && e.code && e.name && e.message) {
        errors.push(e);
      }
    }
  }

  return errors;
}

describe('error-codes.js', () => {
  const allErrors = extractErrorObjects(errorCodes);

  it('chaque erreur doit avoir un code, un nom, un message, une sévérité et une catégorie', () => {
    for (const err of allErrors) {
      expect(typeof err.code).toBe('number');
      expect(typeof err.name).toBe('string');
      expect(typeof err.message).toBe('string');
      expect(typeof err.severity).toBe('string');
      expect(typeof err.category).toBe('string');
    }
  });

  it('chaque code numérique doit être unique', () => {
    const codes = allErrors.map((e) => e.code);
    const unique = new Set(codes);
    expect(codes.length).toBe(unique.size);
  });

  it('chaque nom symbolique doit être unique', () => {
    const names = allErrors.map((e) => e.name);
    const unique = new Set(names);
    expect(names.length).toBe(unique.size);
  });

  it('chaque nom doit être en SNAKE_CASE', () => {
    for (const err of allErrors) {
      expect(err.name).toMatch(/^[A-Z0-9_]+$/);
    }
  });
});

describe('createError()', () => {
  it('doit créer une erreur complète à partir d’un nom symbolique', () => {
    const err = errorCodes.createError('DOWNLOAD_FAILED');

    expect(err).toMatchObject({
      code: 200,
      name: 'DOWNLOAD_FAILED',
      message: 'Échec du téléchargement',
      severity: 'ERROR',
      category: 'DOWNLOAD'
    });

    expect(typeof err.timestamp).toBe('string');
  });

  it('doit utiliser UNKNOWN_ERROR si le nom est inconnu', () => {
    const err = errorCodes.createError('DOES_NOT_EXIST');

    expect(err.name).toBe('UNKNOWN_ERROR');
    expect(err.code).toBe(1);
  });

  it('doit permettre l’ajout de message personnalisé et de données', () => {
    const custom = errorCodes.createError(
      'DOWNLOAD_FAILED',
      'Erreur HTTP 403',
      {
        url: 'https://exemple.com/audio.mp3'
      }
    );

    expect(custom.message).toBe('Erreur HTTP 403');
    expect(custom.data).toHaveProperty('url');
  });
});
