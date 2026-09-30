const { v4: uuidv4 } = require('uuid');

let tasks = [];

// Fields a client is allowed to change through PUT /tasks/:id.
// Everything else (id, createdAt, completedAt, assignee) is owned by the server
// or by a dedicated endpoint. See BUG_REPORT.md → Bug 4.
const UPDATABLE_FIELDS = ['title', 'description', 'status', 'priority', 'dueDate'];

const getAll = () => [...tasks];

const findById = (id) => tasks.find((t) => t.id === id);

// FIX (Bug 2): was `t.status.includes(status)`, a substring match, so
// `?status=do` returned both `todo` and `done` tasks. Status is an enum, so
// it must be compared exactly.
const getByStatus = (status) => tasks.filter((t) => t.status === status);

// FIX (Bug 1): pages are 1-based at the API layer (the route defaults page to 1),
// but the offset was computed as `page * limit`, which skipped the whole first page.
const getPaginated = (page, limit) => {
  const offset = (page - 1) * limit;
  return tasks.slice(offset, offset + limit);
};

const getStats = () => {
  const now = new Date();
  const counts = { todo: 0, in_progress: 0, done: 0 };
  let overdue = 0;

  tasks.forEach((t) => {
    if (counts[t.status] !== undefined) counts[t.status]++;
    if (t.dueDate && t.status !== 'done' && new Date(t.dueDate) < now) {
      overdue++;
    }
  });

  return { ...counts, overdue };
};

const create = ({ title, description = '', status = 'todo', priority = 'medium', dueDate = null }) => {
  const task = {
    id: uuidv4(),
    title,
    description,
    status,
    priority,
    dueDate,
    completedAt: null,
    // New field for PATCH /tasks/:id/assign. Initialised to null so every task
    // has the same shape and clients can rely on the key being present.
    assignee: null,
    createdAt: new Date().toISOString(),
  };
  tasks.push(task);
  return task;
};

const update = (id, fields) => {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return null;

  // FIX (Bug 4): previously `{ ...tasks[index], ...fields }` let the request body
  // overwrite anything, including `id` and `createdAt`. Only copy whitelisted keys.
  const changes = {};
  UPDATABLE_FIELDS.forEach((key) => {
    if (fields[key] !== undefined) changes[key] = fields[key];
  });

  const updated = { ...tasks[index], ...changes };

  // Keep completedAt consistent with status when status changes through PUT
  // (the old code left completedAt null for tasks moved to `done` via PUT, and
  // left a stale timestamp on tasks moved back out of `done`).
  if (changes.status && changes.status !== tasks[index].status) {
    updated.completedAt = changes.status === 'done' ? new Date().toISOString() : null;
  }

  tasks[index] = updated;
  return updated;
};

const remove = (id) => {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return false;

  tasks.splice(index, 1);
  return true;
};

const completeTask = (id) => {
  const task = findById(id);
  if (!task) return null;

  // FIX (Bug 3): this used to also set `priority: 'medium'`, silently wiping the
  // task's real priority. Completing a task should only touch status/completedAt.
  // Completing an already-completed task keeps the original completedAt so the
  // endpoint is idempotent.
  const updated = {
    ...task,
    status: 'done',
    completedAt: task.status === 'done' && task.completedAt ? task.completedAt : new Date().toISOString(),
  };

  const index = tasks.findIndex((t) => t.id === id);
  tasks[index] = updated;
  return updated;
};

/**
 * Assign (or unassign) a task.
 *
 * @param {string} id
 * @param {string|null} assignee  already validated + trimmed by the route; null = unassign
 * @returns {{ task?: object, error?: 'NOT_FOUND' | 'ALREADY_ASSIGNED' }}
 *
 * Returns a result object instead of null/false because the route needs to tell
 * two different failure cases apart (404 vs 409).
 */
const assignTask = (id, assignee) => {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return { error: 'NOT_FOUND' };

  const current = tasks[index].assignee;

  // Reassigning to someone else must be explicit: unassign first (assignee: null),
  // then assign. This stops two people silently overwriting each other's claim.
  if (assignee !== null && current && current !== assignee) {
    return { error: 'ALREADY_ASSIGNED', task: tasks[index] };
  }

  const updated = { ...tasks[index], assignee };
  tasks[index] = updated;
  return { task: updated };
};

const _reset = () => {
  tasks = [];
};

module.exports = {
  getAll,
  findById,
  getByStatus,
  getPaginated,
  getStats,
  create,
  update,
  remove,
  completeTask,
  assignTask,
  _reset,
};
