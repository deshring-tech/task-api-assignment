/**
 * Integration tests for the new PATCH /tasks/:id/assign endpoint.
 * Written alongside the implementation; each describe block maps to one of
 * the questions in the brief (validation, 404, already-assigned).
 */
const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');

beforeEach(() => {
  taskService._reset();
});

const createTask = () =>
  request(app).post('/tasks').send({ title: 'Assign me' }).expect(201).then((r) => r.body);

const assign = (id, body) => request(app).patch(`/tasks/${id}/assign`).send(body);

describe('PATCH /tasks/:id/assign — happy path', () => {
  test('assigns and returns the updated task', async () => {
    const task = await createTask();
    const res = await assign(task.id, { assignee: 'Alice' }).expect(200);

    expect(res.body).toMatchObject({ id: task.id, title: 'Assign me', assignee: 'Alice' });
  });

  test('assignment is persisted', async () => {
    const task = await createTask();
    await assign(task.id, { assignee: 'Alice' }).expect(200);

    const list = await request(app).get('/tasks');
    expect(list.body[0].assignee).toBe('Alice');
  });

  test('trims surrounding whitespace', async () => {
    const task = await createTask();
    const res = await assign(task.id, { assignee: '  Alice  ' }).expect(200);
    expect(res.body.assignee).toBe('Alice');
  });

  test('does not touch other fields', async () => {
    const task = await createTask();
    const res = await assign(task.id, { assignee: 'Alice' }).expect(200);
    const { assignee, ...rest } = res.body;
    const { assignee: _before, ...original } = task;
    expect(rest).toEqual(original);
  });
});

describe('PATCH /tasks/:id/assign — 404', () => {
  test('unknown id', async () => {
    const res = await assign('does-not-exist', { assignee: 'Alice' }).expect(404);
    expect(res.body).toEqual({ error: 'Task not found' });
  });
});

describe('PATCH /tasks/:id/assign — validation (400)', () => {
  test.each([
    ['missing assignee', {}],
    ['empty string', { assignee: '' }],
    ['whitespace only', { assignee: '   ' }],
    ['number', { assignee: 42 }],
    ['boolean', { assignee: true }],
    ['array', { assignee: ['Alice'] }],
    ['too long', { assignee: 'x'.repeat(101) }],
  ])('%s', async (_label, body) => {
    const task = await createTask();
    const res = await assign(task.id, body).expect(400);
    expect(res.body.error).toEqual(expect.any(String));

    // and nothing was stored
    const list = await request(app).get('/tasks');
    expect(list.body[0].assignee).toBeNull();
  });

  test('malformed JSON is 400', async () => {
    const task = await createTask();
    await request(app)
      .patch(`/tasks/${task.id}/assign`)
      .set('Content-Type', 'application/json')
      .send('{"assignee":')
      .expect(400);
  });
});

describe('PATCH /tasks/:id/assign — already assigned', () => {
  test('same person again is idempotent (200)', async () => {
    const task = await createTask();
    await assign(task.id, { assignee: 'Alice' }).expect(200);
    const res = await assign(task.id, { assignee: 'Alice' }).expect(200);
    expect(res.body.assignee).toBe('Alice');
  });

  test('different person is 409 Conflict and does not overwrite', async () => {
    const task = await createTask();
    await assign(task.id, { assignee: 'Alice' }).expect(200);

    const res = await assign(task.id, { assignee: 'Bob' }).expect(409);
    expect(res.body.error).toMatch(/already assigned to Alice/);

    const list = await request(app).get('/tasks');
    expect(list.body[0].assignee).toBe('Alice');
  });

  test('unassign with null, then reassign works', async () => {
    const task = await createTask();
    await assign(task.id, { assignee: 'Alice' }).expect(200);

    const cleared = await assign(task.id, { assignee: null }).expect(200);
    expect(cleared.body.assignee).toBeNull();

    const res = await assign(task.id, { assignee: 'Bob' }).expect(200);
    expect(res.body.assignee).toBe('Bob');
  });

  test('unassigning an unassigned task is a harmless 200', async () => {
    const task = await createTask();
    const res = await assign(task.id, { assignee: null }).expect(200);
    expect(res.body.assignee).toBeNull();
  });
});

describe('interaction with other endpoints', () => {
  test('PUT cannot change assignee (only /assign can)', async () => {
    const task = await createTask();
    await assign(task.id, { assignee: 'Alice' }).expect(200);
    const res = await request(app).put(`/tasks/${task.id}`).send({ assignee: 'Bob' }).expect(200);
    expect(res.body.assignee).toBe('Alice');
  });

  test('completing a task keeps its assignee', async () => {
    const task = await createTask();
    await assign(task.id, { assignee: 'Alice' }).expect(200);
    const res = await request(app).patch(`/tasks/${task.id}/complete`).expect(200);
    expect(res.body.assignee).toBe('Alice');
  });
});
