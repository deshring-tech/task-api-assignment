const VALID_STATUSES = ['todo', 'in_progress', 'done'];
const VALID_PRIORITIES = ['low', 'medium', 'high'];
const MAX_ASSIGNEE_LENGTH = 100;

// FIX (Bug 5): the old checks were `if (body.status && ...)`, so falsy-but-present
// values such as `""` skipped validation and were stored as-is (a task with
// status "" is then invisible to /stats). Checking `!== undefined` closes that.
// `dueDate: null` stays allowed, it means "no due date".
const validateCommonFields = (body) => {
  if (body.description !== undefined && typeof body.description !== 'string') {
    return 'description must be a string';
  }
  if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    return `status must be one of: ${VALID_STATUSES.join(', ')}`;
  }
  if (body.priority !== undefined && !VALID_PRIORITIES.includes(body.priority)) {
    return `priority must be one of: ${VALID_PRIORITIES.join(', ')}`;
  }
  if (
    body.dueDate !== undefined &&
    body.dueDate !== null &&
    (typeof body.dueDate !== 'string' || isNaN(Date.parse(body.dueDate)))
  ) {
    return 'dueDate must be a valid ISO date string or null';
  }
  return null;
};

const isPlainObject = (body) => body !== null && typeof body === 'object' && !Array.isArray(body);

const validateCreateTask = (body) => {
  if (!isPlainObject(body)) return 'request body must be a JSON object';
  if (!body.title || typeof body.title !== 'string' || body.title.trim() === '') {
    return 'title is required and must be a non-empty string';
  }
  return validateCommonFields(body);
};

const validateUpdateTask = (body) => {
  if (!isPlainObject(body)) return 'request body must be a JSON object';
  if (body.title !== undefined && (typeof body.title !== 'string' || body.title.trim() === '')) {
    return 'title must be a non-empty string';
  }
  return validateCommonFields(body);
};

/**
 * Validation for PATCH /tasks/:id/assign.
 * - `assignee` key must be present (a missing key is almost always a client bug)
 * - `null` is accepted and means "unassign"
 * - otherwise it must be a string that is non-empty after trimming, max 100 chars
 */
const validateAssign = (body) => {
  if (!isPlainObject(body) || !Object.prototype.hasOwnProperty.call(body, 'assignee')) {
    return 'assignee is required';
  }
  const { assignee } = body;
  if (assignee === null) return null;
  if (typeof assignee !== 'string') return 'assignee must be a string or null';
  if (assignee.trim() === '') return 'assignee must be a non-empty string';
  if (assignee.trim().length > MAX_ASSIGNEE_LENGTH) {
    return `assignee must be at most ${MAX_ASSIGNEE_LENGTH} characters`;
  }
  return null;
};

module.exports = {
  validateCreateTask,
  validateUpdateTask,
  validateAssign,
  VALID_STATUSES,
  MAX_ASSIGNEE_LENGTH,
};
