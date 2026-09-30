/**
 * Unit tests for src/utils/validators.js. Validators return an error string
 * or null, so each test just checks which of the two comes back.
 */
const {
  validateCreateTask,
  validateUpdateTask,
  validateAssign,
  MAX_ASSIGNEE_LENGTH,
} = require('../src/utils/validators');

describe('validateCreateTask', () => {
  test('accepts a minimal valid body', () => {
    expect(validateCreateTask({ title: 'ok' })).toBeNull();
  });

  test('accepts a full valid body, including dueDate: null', () => {
    expect(
      validateCreateTask({
        title: 'ok', description: 'd', status: 'done', priority: 'low', dueDate: null,
      }),
    ).toBeNull();
  });

  test.each([
    [{}, /title/],
    [{ title: '' }, /title/],
    [{ title: '   ' }, /title/],
    [{ title: 42 }, /title/],
    [{ title: 'ok', status: 'finished' }, /status/],
    [{ title: 'ok', priority: 'urgent' }, /priority/],
    [{ title: 'ok', dueDate: 'not a date' }, /dueDate/],
    [{ title: 'ok', dueDate: 12345 }, /dueDate/],
    [{ title: 'ok', description: 5 }, /description/],
    // Bug 5: empty strings used to skip validation because "" is falsy.
    [{ title: 'ok', status: '' }, /status/],
    [{ title: 'ok', priority: '' }, /priority/],
    [{ title: 'ok', dueDate: '' }, /dueDate/],
  ])('rejects %j', (body, message) => {
    expect(validateCreateTask(body)).toMatch(message);
  });

  test.each([[null], [[]], ['string']])('rejects non-object body %j', (body) => {
    expect(validateCreateTask(body)).toMatch(/JSON object/);
  });
});

describe('validateUpdateTask', () => {
  test('accepts an empty body (nothing to change)', () => {
    expect(validateUpdateTask({})).toBeNull();
  });

  test('accepts partial updates', () => {
    expect(validateUpdateTask({ priority: 'high' })).toBeNull();
  });

  test.each([
    [{ title: '' }, /title/],
    [{ title: null }, /title/],
    [{ status: 'nope' }, /status/],
    [{ status: '' }, /status/],
    [{ priority: 'nope' }, /priority/],
    [{ dueDate: 'nope' }, /dueDate/],
  ])('rejects %j', (body, message) => {
    expect(validateUpdateTask(body)).toMatch(message);
  });

  test('rejects non-object body', () => {
    expect(validateUpdateTask([])).toMatch(/JSON object/);
  });
});

describe('validateAssign', () => {
  test('accepts a name', () => {
    expect(validateAssign({ assignee: 'Alice' })).toBeNull();
  });

  test('accepts null (unassign)', () => {
    expect(validateAssign({ assignee: null })).toBeNull();
  });

  test('accepts a name exactly at the length limit', () => {
    expect(validateAssign({ assignee: 'a'.repeat(MAX_ASSIGNEE_LENGTH) })).toBeNull();
  });

  test.each([
    [{}, /required/],
    [null, /required/],
    [{ assignee: '' }, /non-empty/],
    [{ assignee: '   ' }, /non-empty/],
    [{ assignee: 123 }, /string/],
    [{ assignee: ['Alice'] }, /string/],
    [{ assignee: { name: 'Alice' } }, /string/],
    [{ assignee: 'a'.repeat(MAX_ASSIGNEE_LENGTH + 1) }, /at most/],
  ])('rejects %j', (body, message) => {
    expect(validateAssign(body)).toMatch(message);
  });
});
