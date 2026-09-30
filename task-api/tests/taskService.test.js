/**
 * Unit tests for src/services/taskService.js — calls the service functions
 * directly, no HTTP. The store is module-level state, so _reset() runs before
 * every test to keep tests independent of each other.
 */
const taskService = require('../src/services/taskService');

beforeEach(() => {
  taskService._reset();
});

const makeTasks = (n) =>
  Array.from({ length: n }, (_, i) => taskService.create({ title: `Task ${i + 1}` }));

describe('create', () => {
  test('applies defaults for optional fields', () => {
    const task = taskService.create({ title: 'Write tests' });

    expect(task).toMatchObject({
      title: 'Write tests',
      description: '',
      status: 'todo',
      priority: 'medium',
      dueDate: null,
      completedAt: null,
      assignee: null,
    });
    expect(task.id).toEqual(expect.any(String));
    expect(Date.parse(task.createdAt)).not.toBeNaN();
  });

  test('keeps provided values', () => {
    const task = taskService.create({
      title: 'Ship',
      description: 'deploy it',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2030-01-01T00:00:00.000Z',
    });
    expect(task).toMatchObject({
      description: 'deploy it',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2030-01-01T00:00:00.000Z',
    });
  });

  test('generates unique ids', () => {
    const [a, b] = makeTasks(2);
    expect(a.id).not.toBe(b.id);
  });
});

describe('getAll / findById', () => {
  test('getAll returns a copy, not the internal array', () => {
    makeTasks(2);
    const list = taskService.getAll();
    list.pop();
    expect(taskService.getAll()).toHaveLength(2);
  });

  test('findById returns the task or undefined', () => {
    const [task] = makeTasks(1);
    expect(taskService.findById(task.id)).toEqual(task);
    expect(taskService.findById('nope')).toBeUndefined();
  });
});

describe('getByStatus', () => {
  test('returns only tasks with exactly that status', () => {
    taskService.create({ title: 'a', status: 'todo' });
    taskService.create({ title: 'b', status: 'done' });
    taskService.create({ title: 'c', status: 'in_progress' });

    expect(taskService.getByStatus('todo').map((t) => t.title)).toEqual(['a']);
  });

  // Regression test for Bug 2: `includes()` made "do" match both "todo" and "done".
  test('does not do substring matching', () => {
    taskService.create({ title: 'a', status: 'todo' });
    taskService.create({ title: 'b', status: 'done' });

    expect(taskService.getByStatus('do')).toEqual([]);
    expect(taskService.getByStatus('in')).toEqual([]);
  });
});

describe('getPaginated', () => {
  // Regression test for Bug 1: page 1 used to return items 11–20.
  test('page 1 returns the first `limit` tasks', () => {
    makeTasks(15);
    const page1 = taskService.getPaginated(1, 10);
    expect(page1).toHaveLength(10);
    expect(page1[0].title).toBe('Task 1');
    expect(page1[9].title).toBe('Task 10');
  });

  test('page 2 returns the remainder', () => {
    makeTasks(15);
    const page2 = taskService.getPaginated(2, 10);
    expect(page2.map((t) => t.title)).toEqual([
      'Task 11', 'Task 12', 'Task 13', 'Task 14', 'Task 15',
    ]);
  });

  test('page beyond the end returns []', () => {
    makeTasks(3);
    expect(taskService.getPaginated(5, 10)).toEqual([]);
  });
});

describe('getStats', () => {
  test('counts by status and zero overdue on empty store', () => {
    expect(taskService.getStats()).toEqual({ todo: 0, in_progress: 0, done: 0, overdue: 0 });
  });

  test('counts overdue only for non-done tasks with a past dueDate', () => {
    const past = '2000-01-01T00:00:00.000Z';
    const future = '2999-01-01T00:00:00.000Z';
    taskService.create({ title: 'overdue', dueDate: past });
    taskService.create({ title: 'overdue in progress', status: 'in_progress', dueDate: past });
    taskService.create({ title: 'done but past', status: 'done', dueDate: past });
    taskService.create({ title: 'future', dueDate: future });
    taskService.create({ title: 'no due date' });

    expect(taskService.getStats()).toEqual({ todo: 3, in_progress: 1, done: 1, overdue: 2 });
  });
});

describe('update', () => {
  test('merges allowed fields and returns the updated task', () => {
    const [task] = makeTasks(1);
    const updated = taskService.update(task.id, { title: 'New', priority: 'high' });

    expect(updated).toMatchObject({ id: task.id, title: 'New', priority: 'high' });
    expect(taskService.findById(task.id)).toEqual(updated);
  });

  test('returns null for unknown id', () => {
    expect(taskService.update('missing', { title: 'x' })).toBeNull();
  });

  // Regression test for Bug 4: body could overwrite server-owned fields.
  test('ignores id, createdAt, completedAt and assignee in the payload', () => {
    const [task] = makeTasks(1);
    const updated = taskService.update(task.id, {
      id: 'hacked',
      createdAt: '1999-01-01T00:00:00.000Z',
      completedAt: '1999-01-01T00:00:00.000Z',
      assignee: 'Mallory',
      title: 'still works',
    });

    expect(updated.id).toBe(task.id);
    expect(updated.createdAt).toBe(task.createdAt);
    expect(updated.completedAt).toBeNull();
    expect(updated.assignee).toBeNull();
    expect(updated.title).toBe('still works');
    expect(taskService.findById('hacked')).toBeUndefined();
  });

  test('sets completedAt when status moves to done, clears it when moving back', () => {
    const [task] = makeTasks(1);

    const done = taskService.update(task.id, { status: 'done' });
    expect(Date.parse(done.completedAt)).not.toBeNaN();

    const reopened = taskService.update(task.id, { status: 'todo' });
    expect(reopened.completedAt).toBeNull();
  });
});

describe('remove', () => {
  test('removes an existing task and returns true', () => {
    const [a, b] = makeTasks(2);
    expect(taskService.remove(a.id)).toBe(true);
    expect(taskService.getAll()).toEqual([b]);
  });

  test('returns false for unknown id', () => {
    expect(taskService.remove('missing')).toBe(false);
  });
});

describe('completeTask', () => {
  test('marks the task done and sets completedAt', () => {
    const [task] = makeTasks(1);
    const done = taskService.completeTask(task.id);

    expect(done.status).toBe('done');
    expect(Date.parse(done.completedAt)).not.toBeNaN();
  });

  // Regression test for Bug 3: priority was reset to "medium".
  test('does not change priority', () => {
    const task = taskService.create({ title: 'urgent', priority: 'high' });
    expect(taskService.completeTask(task.id).priority).toBe('high');
  });

  test('is idempotent: completing twice keeps the first completedAt', () => {
    const [task] = makeTasks(1);
    const first = taskService.completeTask(task.id);
    const second = taskService.completeTask(task.id);
    expect(second.completedAt).toBe(first.completedAt);
  });

  test('returns null for unknown id', () => {
    expect(taskService.completeTask('missing')).toBeNull();
  });
});

describe('assignTask', () => {
  test('assigns an unassigned task', () => {
    const [task] = makeTasks(1);
    const { task: updated, error } = taskService.assignTask(task.id, 'Alice');
    expect(error).toBeUndefined();
    expect(updated.assignee).toBe('Alice');
    expect(taskService.findById(task.id).assignee).toBe('Alice');
  });

  test('re-assigning to the same person is a no-op success', () => {
    const [task] = makeTasks(1);
    taskService.assignTask(task.id, 'Alice');
    expect(taskService.assignTask(task.id, 'Alice').task.assignee).toBe('Alice');
  });

  test('refuses to overwrite a different assignee', () => {
    const [task] = makeTasks(1);
    taskService.assignTask(task.id, 'Alice');
    const result = taskService.assignTask(task.id, 'Bob');
    expect(result.error).toBe('ALREADY_ASSIGNED');
    expect(taskService.findById(task.id).assignee).toBe('Alice');
  });

  test('null unassigns, after which someone else can be assigned', () => {
    const [task] = makeTasks(1);
    taskService.assignTask(task.id, 'Alice');
    expect(taskService.assignTask(task.id, null).task.assignee).toBeNull();
    expect(taskService.assignTask(task.id, 'Bob').task.assignee).toBe('Bob');
  });

  test('returns NOT_FOUND for unknown id', () => {
    expect(taskService.assignTask('missing', 'Alice')).toEqual({ error: 'NOT_FOUND' });
  });
});
