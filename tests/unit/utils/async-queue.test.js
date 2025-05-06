const { EventEmitter } = require('events');
const asyncQueueModule = require('../../../src/utils/async-queue');

describe('AsyncQueue - ajout et exécution de tâche', () => {
  let bus;
  let asyncQueue;
  let eventsReceived = [];

  beforeEach(() => {
    bus = new EventEmitter();
    bus.publish = (type, payload) => bus.emit(type, payload);
    bus.subscribe = (type, handler) => bus.on(type, handler);
    bus.unsubscribe = (type, handler) => bus.off(type, handler);

    // Réinitialiser la réception d'événements
    eventsReceived = [];

    // Capturer les événements émis pour vérification
    bus.subscribe('QUEUE:TASK_COMPLETED', (data) =>
      eventsReceived.push({ type: 'QUEUE:TASK_COMPLETED', data })
    );
    bus.subscribe('QUEUE:TASK_STARTED', (data) =>
      eventsReceived.push({ type: 'QUEUE:TASK_STARTED', data })
    );
    bus.subscribe('QUEUE:TASK_ADDED', (data) =>
      eventsReceived.push({ type: 'QUEUE:TASK_ADDED', data })
    );

    asyncQueue = asyncQueueModule;
    asyncQueue.initialize(bus);
  });

  afterEach(() => {
    // Nettoyer l'AsyncQueue pour arrêter les timers et se désabonner des événements
    asyncQueue.cleanup();
    bus.removeAllListeners();
  });

  test('devrait exécuter une tâche asynchrone avec succès', async () => {
    const mockTaskId = 'task-1';
    const mockResult = 'résultat OK';

    const asyncFunction = async () => {
      return new Promise((resolve) =>
        setTimeout(() => resolve(mockResult), 50)
      );
    };

    // Publier l'ajout de la tâche
    bus.publish('QUEUE:ADD_TASK', {
      id: mockTaskId,
      task: asyncFunction,
      priority: 1
    });

    // Attendre la fin de la tâche (max 200ms)
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Vérifier que les bons événements ont été émis
    const started = eventsReceived.find((e) => e.type === 'QUEUE:TASK_STARTED');
    const completed = eventsReceived.find(
      (e) => e.type === 'QUEUE:TASK_COMPLETED'
    );

    expect(started).toBeDefined();
    expect(completed).toBeDefined();
    expect(completed.data.taskId).toBe(mockTaskId);
    expect(completed.data.result).toBe(mockResult);
  });
});
