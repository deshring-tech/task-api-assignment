/**
 * Integration tests: real Express app via Supertest, going through routing,
 * JSON parsing, validation and the service. Setup goes through the HTTP API
 * where practical so the tests exercise behaviour, not internals.
 */
const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');

beforeEach(() => {
  taskService._reset();
});

const createTask = (body = {}) =>
  request(app).post('/tasks').send({ title: 'Task', ...body }).expect(201).then((r) => r.body);

const createMany = async (n) => {
  const out = [];
  // sequential so insertion order is deterministic
  for (let i = 1; i <= n; i++) out.push(await createTask({ title: `Task ${i}` }));
  return out;
};

describe('GET /', () => {
  test('returns a health/landing payload', async () => {
    const res = await request(app).get('/').expect(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('unknown routes', () => {
  test('return JSON 404', async () => {
    const res = await request(app).get('/nope').expect(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });
});

describe('POST /tasks', () => {
  test('201 and returns the created task with defaults', async () => {
    const res = await request(app).post('/tasks').send({ title: 'Write tests' }).expect(201);
    expect(res.body).toMatchObject({
      title: 'Write tests', status: 'todo', priority: 'medium', assignee: null,
    });
    expect(res.body.id).toEqual(expect.any(String));
  });

  test('created task shows up in GET /tasks', async () => {
    const task = await createTask({ title: 'Persisted' });
    const res = await request(app).get('/tasks').expect(200);
    expect(res.body).toEqual([task]);
  });

  test('400 when title is missing', async () => {
    const res = await request(app).post('/tasks').send({ priority: 'high' }).expect(400);
    expect(res.body.error).toMatch(/title/);
  });

  test('400 on invalid status', async () => {
    await request(app).post('/tasks').send({ title: 'x', status: 'completed' }).expect(400);
  });

  test('400 on empty-string status instead of storing it (Bug 5)', async () => {
    await request(app).post('/tasks').send({ title: 'x', status: '' }).expect(400);
  });

  // Bug 7: malformed JSON used to return 500.
  test('400 (not 500) on malformed JSON', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Content-Type', 'application/json')
      .send('{"title": "oops"')
      .expect(400);
    expect(res.body.error).toMatch(/JSON/);
  });

  test('400 on a JSON array body', async () => {
    await request(app).post('/tasks').send([{ title: 'x' }]).expect(400);
  });
});

describe('GET /tasks', () => {
  test('returns [] when empty', async () => {
    const res = await request(app).get('/tasks').expect(200);
    expect(res.body).toEqual([]);
  });

  describe('?status=', () => {
    test('filters by exact status', async () => {
      await createTask({ title: 'a', status: 'todo' });
      await createTask({ title: 'b', status: 'done' });
      const res = await request(app).get('/tasks?status=done').expect(200);
      expect(res.body.map((t) => t.title)).toEqual(['b']);
    });

    test('400 on unknown / partial status (Bug 2)', async () => {
      await createTask({ status: 'todo' });
      await createTask({ status: 'done' });
      await request(app).get('/tasks?status=do').expect(400);
    });

    test('combines with pagination', async () => {
      for (let i = 1; i <= 5; i++) await createTask({ title: `d${i}`, status: 'done' });
      await createTask({ title: 'not done' });
      const res = await request(app).get('/tasks?status=done&page=2&limit=2').expect(200);
      expect(res.body.map((t) => t.title)).toEqual(['d3', 'd4']);
    });
  });

  describe('?page= & ?limit=', () => {
    test('page=1 returns the first page (Bug 1)', async () => {
      await createMany(12);
      const res = await request(app).get('/tasks?page=1&limit=5').expect(200);
      expect(res.body.map((t) => t.title)).toEqual(['Task 1', 'Task 2', 'Task 3', 'Task 4', 'Task 5']);
    });

    test('last partial page', async () => {
      await createMany(12);
      const res = await request(app).get('/tasks?page=3&limit=5').expect(200);
      expect(res.body.map((t) => t.title)).toEqual(['Task 11', 'Task 12']);
    });

    test('limit defaults to 10 when only page is given', async () => {
      await createMany(12);
      const res = await request(app).get('/tasks?page=1').expect(200);
      expect(res.body).toHaveLength(10);
    });

    test('page defaults to 1 when only limit is given', async () => {
      await createMany(3);
      const res = await request(app).get('/tasks?limit=2').expect(200);
      expect(res.body.map((t) => t.title)).toEqual(['Task 1', 'Task 2']);
    });

    test.each(['page=0', 'page=-1', 'page=abc', 'limit=0', 'limit=1.5', 'limit=101'])(
      '400 on invalid pagination: %s',
      async (qs) => {
        await request(app).get(`/tasks?${qs}`).expect(400);
      },
    );
  });
});

describe('GET /tasks/stats', () => {
  test('returns counts and overdue', async () => {
    await createTask({ status: 'todo', dueDate: '2000-01-01T00:00:00.000Z' });
    await createTask({ status: 'in_progress' });
    await createTask({ status: 'done', dueDate: '2000-01-01T00:00:00.000Z' });

    const res = await request(app).get('/tasks/stats').expect(200);
    expect(res.body).toEqual({ todo: 1, in_progress: 1, done: 1, overdue: 1 });
  });

  test('is not captured by /:id-style routes', async () => {
    const res = await request(app).get('/tasks/stats').expect(200);
    expect(res.body).toHaveProperty('overdue');
  });
});

describe('PUT /tasks/:id', () => {
  test('updates fields and returns the task', async () => {
    const task = await createTask({ title: 'old' });
    const res = await request(app)
      .put(`/tasks/${task.id}`)
      .send({ title: 'new', status: 'in_progress' })
      .expect(200);
    expect(res.body).toMatchObject({ id: task.id, title: 'new', status: 'in_progress' });
  });

  test('404 for unknown id', async () => {
    await request(app).put('/tasks/missing').send({ title: 'x' }).expect(404);
  });

  test('400 on invalid body', async () => {
    const task = await createTask();
    await request(app).put(`/tasks/${task.id}`).send({ title: '' }).expect(400);
  });

  // Bug 4: id / createdAt could be overwritten through the body.
  test('cannot overwrite id or createdAt', async () => {
    const task = await createTask();
    const res = await request(app)
      .put(`/tasks/${task.id}`)
      .send({ id: 'hijacked', createdAt: '1999-01-01T00:00:00.000Z' })
      .expect(200);
    expect(res.body.id).toBe(task.id);
    expect(res.body.createdAt).toBe(task.createdAt);
    await request(app).put('/tasks/hijacked').send({ title: 'x' }).expect(404);
  });
});

describe('DELETE /tasks/:id', () => {
  test('204 with empty body, then task is gone', async () => {
    const task = await createTask();
    const res = await request(app).delete(`/tasks/${task.id}`).expect(204);
    expect(res.text).toBe('');
    const list = await request(app).get('/tasks');
    expect(list.body).toEqual([]);
  });

  test('404 for unknown id', async () => {
    await request(app).delete('/tasks/missing').expect(404);
  });

  test('second delete of the same id is 404', async () => {
    const task = await createTask();
    await request(app).delete(`/tasks/${task.id}`).expect(204);
    await request(app).delete(`/tasks/${task.id}`).expect(404);
  });
});

describe('PATCH /tasks/:id/complete', () => {
  test('marks done, sets completedAt, keeps priority (Bug 3)', async () => {
    const task = await createTask({ priority: 'high' });
    const res = await request(app).patch(`/tasks/${task.id}/complete`).expect(200);
    expect(res.body).toMatchObject({ status: 'done', priority: 'high' });
    expect(Date.parse(res.body.completedAt)).not.toBeNaN();
  });

  test('404 for unknown id', async () => {
    await request(app).patch('/tasks/missing/complete').expect(404);
  });
});

describe('error handler', () => {
  test('unexpected errors return a generic 500', async () => {
    const spy = jest.spyOn(taskService, 'getStats').mockImplementation(() => {
      throw new Error('boom');
    });
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app).get('/tasks/stats').expect(500);
    expect(res.body).toEqual({ error: 'Internal server error' });

    spy.mockRestore();
    errSpy.mockRestore();
  });
});
