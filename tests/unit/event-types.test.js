const eventTypes = require('../../src/constants/event-types');

/**
 * Récupère toutes les chaînes depuis un objet imbriqué récursivement
 */
function extractStrings(obj) {
  const result = [];

  function recurse(value) {
    if (typeof value === 'string') {
      result.push(value);
    } else if (typeof value === 'object' && value !== null) {
      Object.values(value).forEach(recurse);
    }
  }

  recurse(obj);
  return result;
}

describe('event-types.js', () => {
  const flatEventList = extractStrings(eventTypes);

  it('toutes les valeurs doivent être des chaînes non vides', () => {
    for (const val of flatEventList) {
      expect(typeof val).toBe('string');
      expect(val.length).toBeGreaterThan(0);
    }
  });

  it('les valeurs doivent être uniques', () => {
    const unique = new Set(flatEventList);
    expect(flatEventList.length).toBe(unique.size);
  });
});
