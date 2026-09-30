# Submission Notes

**Live API:** `<LIVE_URL>`  ·  **Repo:** https://github.com/deshring-tech/task-api-assignment

Quick checks against the live link:
```bash
curl <LIVE_URL>/
curl -X POST <LIVE_URL>/tasks -H "Content-Type: application/json" -d '{"title":"Write tests","priority":"high"}'
curl -X PATCH <LIVE_URL>/tasks/<id>/assign -H "Content-Type: application/json" -d '{"assignee":"Alice"}'
```
> The store is in memory, and free hosting sleeps when idle, so data resets after a cold start. The first request can take a few seconds.

---

## What's in this submission

| Deliverable | Location |
|---|---|
| Unit tests: service | `task-api/tests/taskService.test.js` |
| Unit tests: validators | `task-api/tests/validators.test.js` |
| Integration tests: all routes | `task-api/tests/tasks.api.test.js` |
| Tests for the new endpoint | `task-api/tests/assign.test.js` |
| Bug report | `BUG_REPORT.md` |
| Fixes | `src/services/taskService.js`, `src/utils/validators.js`, `src/routes/tasks.js`, `src/app.js` (each fix is commented with `FIX (Bug N)`) |
| New endpoint | `PATCH /tasks/:id/assign` in `src/routes/tasks.js` + `assignTask` in the service |

## Coverage

```
-----------------|---------|----------|---------|---------|
File             | % Stmts | % Branch | % Funcs | % Lines |
-----------------|---------|----------|---------|---------|
All files        |   99.01 |     98.5 |   97.22 |   98.88 |
 app.js          |   89.47 |    83.33 |      75 |   89.47 |
 routes/tasks.js |     100 |      100 |     100 |     100 |
 taskService.js  |     100 |    97.22 |     100 |     100 |
 validators.js   |     100 |      100 |     100 |     100 |
-----------------|---------|----------|---------|---------|
Tests: 118 passed, 118 total
```
The only uncovered lines in `app.js` are the `app.listen()` block. It runs only when the file is executed directly, never when a test imports it.

**How I approached testing:** I wrote the tests against the original code before changing anything. 31 of 62 failed, and working through those failures is how I found the bugs in `BUG_REPORT.md`. The tests check behaviour (HTTP status codes and response bodies) rather than internal details. The one exception is the `error handler` test, which mocks `getStats` to throw because there's no other way to reach the 500 branch.

---

## Feature: `PATCH /tasks/:id/assign`

```
PATCH /tasks/:id/assign
Body: { "assignee": "Alice" }   → assign
      { "assignee": null }      → unassign
```

| Case | Response |
|---|---|
| Valid name, task unassigned | **200** + updated task |
| Same name as the current assignee | **200** (idempotent) |
| Different name, task already assigned | **409 Conflict** |
| `null` | **200**, `assignee` cleared |
| Task id doesn't exist | **404** |
| Missing key, `""`, whitespace only, non-string, > 100 chars | **400** |

**Design decisions**

1. **Empty string → 400, not "unassign".** An empty name is almost always a client bug, like a blank form field. Unassigning is a deliberate action, so it uses an explicit `null`. That keeps "clear the assignee" and "I sent nothing useful" apart.
2. **Already assigned → 409 instead of silently overwriting.** Two people clicking "assign to me" at the same moment shouldn't quietly steal the task from each other. To reassign, you unassign first, then assign again. Re-assigning to the *same* person returns 200, so client retries are safe. **Tradeoff:** this costs one extra request for a legitimate handover. If the product team would rather allow direct reassignment, it's a one-line change in `assignTask`.
3. **Names are trimmed and capped at 100 characters.** Trimming means `"  Alice "` and `"Alice"` count as the same person, which also makes the idempotency check reliable. The cap stops someone storing megabytes in a name field.
4. **Validation runs before the existence check.** A malformed body gets 400 even when the id is also wrong. `PUT /tasks/:id` already worked this way, so I kept it consistent.
5. **`assignee` is only changed through this endpoint.** Every task is created with `assignee: null` so the response shape is always the same. `PUT` ignores `assignee` (this came out of the Bug 4 whitelist), so all assignment rules live in one place.
6. **The service returns `{ task }` or `{ error }` instead of `null`.** The route has to tell 404 and 409 apart, and a single `null` can't carry that difference.
7. **The assignee is a free-text name, as the brief asks.** In a real system it would be a user id checked against a users table (see questions below).

---

## What I'd test next with more time

- **Concurrency and ordering.** The store is synchronous, so it's safe today. Once it's backed by a real database, two simultaneous `assign` calls need a conditional update or a transaction, and that needs tests.
- **Property-based tests for pagination.** For any N tasks and any valid page/limit, the pages concatenated together should equal the full list, with no gaps or duplicates.
- **Date edge cases for `overdue`:** timezones, a `dueDate` exactly equal to now, and non-ISO strings that `Date.parse` accepts.
- **Contract tests** that generate an OpenAPI spec and validate every response against it, so the docs can't drift from the code again (Bug 8).
- **Load and payload-size tests.** `express.json()` has a 100kb default limit, and nothing checks the length of `title` or `description`.

## What surprised me

- `completeTask` resetting priority to `"medium"` (Bug 3). It's silent data loss hidden inside an otherwise simple function, and it's exactly the kind of bug that only a test catches.
- The README and ASSIGNMENT describe different status values (Bug 8). A client following the README can't create a task with any status at all.
- `PUT` is documented as a "full update" but behaves like a partial PATCH, and it trusted the entire body, so the id could be changed.
- Invalid input tended to fail silently (empty lists, default values) rather than loudly (400). That makes client bugs very hard to spot.

## Questions before shipping to production

1. **Persistence:** all data is lost on every restart or deploy. What database is this going to use?
2. **Auth:** who is allowed to create, delete or assign tasks? Right now anyone can do anything. Should `assignee` be a real user id?
3. **Reassignment policy:** is the 409-then-unassign flow what the product wants, or should managers be able to reassign directly?
4. **PUT semantics:** should PUT really replace the whole task (and require every field), or should it be renamed to PATCH to match how it behaves?
5. **Pagination response shape:** should list endpoints return `{ data, page, limit, total }` so clients know how many pages there are? That's a breaking change, so I didn't make it here.
6. **Operational basics:** rate limiting, request logging, CORS policy, a health check for the load balancer, and a CI pipeline that runs these tests on every PR.
