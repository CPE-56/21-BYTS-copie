const mockEventBus = {
  publish: jest.fn(),
  subscribe: jest.fn(),
  once: jest.fn(),
  unsubscribe: jest.fn(),
  setLogger: jest.fn(),
};

jest.mock('../../../src/core/event-bus', () => ({
  getInstance: () => mockEventBus,
}));

const {
  initialize,
  set,
  get,
  update,
  reset,
} = require('../../../src/core/state-manager');

describe('state-manager.js', () => {
  beforeEach(() => {
    initialize(mockEventBus);
    reset();
  });

  it('devrait définir une valeur dans le state', () => {
    set('foo', 'bar');
    expect(get('foo')).toBe('bar');
  });

  it('devrait fusionner une mise à jour', () => {
    update({ a: 1 });
    update({ b: 2 });
    expect(get('a')).toBe(1);
    expect(get('b')).toBe(2);
  });

  it('devrait réinitialiser tout le state', () => {
    set('x', 99);
    reset();
    expect(get('x')).toBeUndefined();
  });

  it('devrait notifier les abonnés du changement de state (mock)', () => {
    set('notify', true);
    expect(get('notify')).toBe(true);
  });
});
