const express = require('express');
const router = express.Router();
const taskService = require('../services/taskService');
const {
  validateCreateTask,
  validateUpdateTask,
  validateAssign,
  VALID_STATUSES,
} = require('../utils/validators');

const MAX_LIMIT = 100;

// Parses a pagination query param. Returns the default when absent,
// a positive integer when valid, or NaN when the client sent garbage.
// (Previously `parseInt(x) || 1` silently turned "abc" into 1 and allowed
// negatives like page=-1, which produced a negative slice offset — Bug 6.)
const parsePositiveInt = (value, fallback) => {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(String(value))) return NaN;
  const n = Number(value);
  return n >= 1 ? n : NaN;
};

router.get('/stats', (req, res) => {
  const stats = taskService.getStats();
  res.json(stats);
});

router.get('/', (req, res) => {
  const { status, page, limit } = req.query;

  // Reject unknown statuses instead of silently returning [] so typos
  // (e.g. ?status=completed from the old README) are visible to the client.
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  const paginate = page !== undefined || limit !== undefined;
  const pageNum = parsePositiveInt(page, 1);
  const limitNum = parsePositiveInt(limit, 10);

  if (paginate && (Number.isNaN(pageNum) || Number.isNaN(limitNum))) {
    return res.status(400).json({ error: 'page and limit must be positive integers' });
  }
  if (paginate && limitNum > MAX_LIMIT) {
    return res.status(400).json({ error: `limit must be at most ${MAX_LIMIT}` });
  }

  if (status) {
    // Previously ?status=...&page=... ignored pagination entirely.
    // Filter first, then paginate the filtered list.
    const filtered = taskService.getByStatus(status);
    if (!paginate) return res.json(filtered);
    const offset = (pageNum - 1) * limitNum;
    return res.json(filtered.slice(offset, offset + limitNum));
  }

  if (paginate) {
    return res.json(taskService.getPaginated(pageNum, limitNum));
  }

  res.json(taskService.getAll());
});

router.post('/', (req, res) => {
  const error = validateCreateTask(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const task = taskService.create(req.body);
  res.status(201).json(task);
});

router.put('/:id', (req, res) => {
  const error = validateUpdateTask(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const task = taskService.update(req.params.id, req.body);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.json(task);
});

router.delete('/:id', (req, res) => {
  const deleted = taskService.remove(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.status(204).send();
});

router.patch('/:id/complete', (req, res) => {
  const task = taskService.completeTask(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.json(task);
});

/**
 * PATCH /tasks/:id/assign   body: { "assignee": "Alice" | null }
 *
 * 200 → updated task (assign, idempotent re-assign to same person, or unassign with null)
 * 400 → missing / non-string / blank / too-long assignee
 * 404 → task does not exist
 * 409 → task is already assigned to someone else (unassign first)
 *
 * Validation runs before the existence check on purpose: a malformed request
 * is a 400 regardless of whether the id exists, same as PUT /tasks/:id.
 */
router.patch('/:id/assign', (req, res) => {
  const error = validateAssign(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  // Store the trimmed name so "  Alice " and "Alice" are the same assignee.
  const assignee = req.body.assignee === null ? null : req.body.assignee.trim();
  const result = taskService.assignTask(req.params.id, assignee);

  if (result.error === 'NOT_FOUND') {
    return res.status(404).json({ error: 'Task not found' });
  }
  if (result.error === 'ALREADY_ASSIGNED') {
    return res.status(409).json({
      error: `Task is already assigned to ${result.task.assignee}. Unassign it first by sending { "assignee": null }.`,
    });
  }

  res.json(result.task);
});

module.exports = router;
