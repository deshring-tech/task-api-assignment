# Bug Report — Task API

**How I found them:** I wrote the unit and integration tests in `task-api/tests/` against the *original* code first. 31 of 62 tests failed. Most of those were real bugs. The rest were tests for the new `assign` feature, which didn't exist yet. Each bug below links back to the test that catches it. Those tests now pass as regression tests.

**Status:** Bugs 1–7 are fixed (the brief asked for at least one; the fixes were small and low-risk, so I did all of them). Bug 8 is a documentation mismatch.

| # | Severity | Area | Fixed |
|---|----------|------|-------|
| 1 | High | Pagination skips the first page | ✅ |
| 2 | Medium | Status filter does substring matching | ✅ |
| 3 | Medium | Completing a task resets its priority | ✅ |
| 4 | High | PUT can overwrite `id` / `createdAt` (mass assignment) | ✅ |
| 5 | Medium | Empty-string values skip validation | ✅ |
| 6 | Low | Invalid `page`/`limit` silently accepted | ✅ |
| 7 | Low | Malformed JSON returns 500 instead of 400 | ✅ |
| 8 | Low | README and ASSIGNMENT disagree on the status values | Documented |

---

## Bug 1 — Pagination is off by one page

- **Where:** `src/services/taskService.js` → `getPaginated`
- **Expected:** `GET /tasks?page=1&limit=10` returns tasks 1–10.
- **Actual:** It returns tasks 11–20. With fewer than 11 tasks, page 1 is empty.
- **Why:** The offset is `page * limit`. But the API is 1-based: the route defaults `page` to `1`. So page 1 starts at offset 10, and the first page can never be fetched.
- **Found by:** `getPaginated › page 1 returns the first limit tasks` and `GET /tasks › page=1 returns the first page`.
- **Fix:** `const offset = (page - 1) * limit;`

## Bug 2 — Status filter matches substrings

- **Where:** `taskService.js` → `getByStatus`
- **Expected:** `?status=do` matches nothing, or is rejected.
- **Actual:** It returns both `todo` and `done` tasks. `?status=in` returns every `in_progress` task.
- **Why:** The code uses `t.status.includes(status)`, which is a substring check on a string. Status is an enum, so it needs an exact comparison.
- **Found by:** `getByStatus › does not do substring matching`.
- **Fix:** `t.status === status`. The route now also returns **400** for unknown statuses, so a typo gives the client an error instead of a confusing empty list. While I was in there, `?status=` combined with `?page=` used to ignore pagination completely. It now filters first, then paginates.

## Bug 3 — Completing a task resets its priority to "medium"

- **Where:** `taskService.js` → `completeTask`
- **Expected:** `PATCH /tasks/:id/complete` changes only `status` and `completedAt`.
- **Actual:** A `high`-priority task comes back with `priority: "medium"`.
- **Why:** The spread object that builds the completed task hard-codes `priority: 'medium'`. It looks like leftover or copy-pasted code. Nothing in the brief says completing a task should touch priority.
- **Found by:** `completeTask › does not change priority`.
- **Fix:** Removed that line. I also made completion idempotent: completing an already-done task keeps its original `completedAt` instead of overwriting it.

## Bug 4 — PUT allows mass assignment of server-owned fields

- **Where:** `taskService.js` → `update` (`{ ...tasks[index], ...fields }`)
- **Expected:** Clients can change `title`, `description`, `status`, `priority` and `dueDate` only.
- **Actual:** `PUT /tasks/:id` with `{ "id": "hijacked" }` changes the task's id. After that, the original id returns 404. `createdAt` and `completedAt` can also be forged.
- **Why:** The whole request body is spread onto the stored task. The validator only checks fields it knows about and lets every other key through.
- **Found by:** `PUT /tasks/:id › cannot overwrite id or createdAt`.
- **Fix:** Added a whitelist (`UPDATABLE_FIELDS`) and copy only those keys. There was also a related consistency bug: moving a task to `done` through PUT left `completedAt: null`, and moving it back out of `done` kept a stale timestamp. `update` now keeps `completedAt` in sync with `status`.

## Bug 5 — Empty-string values bypass validation

- **Where:** `src/utils/validators.js`. Every optional check has the form `if (body.status && ...)`.
- **Expected:** `{ "title": "x", "status": "" }` returns 400.
- **Actual:** It returns 201 and stores `status: ""`. That task then never shows up in any `/stats` bucket or status filter. `priority: ""` and `dueDate: ""` fail the same way. A non-string `description` (for example `5`) was also accepted.
- **Why:** `""` is falsy, so the `&&` short-circuits and validation is skipped. The service's default (`status = 'todo'`) only applies when the value is `undefined`, not `""`.
- **Found by:** `validators.test.js` table cases and `POST /tasks › 400 on empty-string status`.
- **Fix:** Changed the checks to `!== undefined`. `dueDate: null` is still allowed on purpose and means "no due date". Non-object bodies (arrays, `null`) are also rejected now.

## Bug 6 — Invalid pagination parameters are silently accepted

- **Where:** `src/routes/tasks.js`, the `parseInt(page) || 1` pattern.
- **Expected:** `page=abc`, `page=-1`, `limit=0` and `limit=1000000` return 400.
- **Actual:** `abc` and `0` silently become the default. `page=-1` gives a negative offset, and `Array.slice` then returns items from the end of the list. There is no upper bound on `limit`.
- **Fix:** Added strict positive-integer parsing that returns 400 on bad input, plus a `limit` cap of 100.

## Bug 7 — Malformed JSON returns 500

- **Where:** `src/app.js`, the error handler.
- **Expected:** A syntactically broken JSON body returns **400**. It's the client's fault.
- **Actual:** It returns **500 Internal server error** and logs a stack trace.
- **Why:** `express.json()` throws an error with `type: 'entity.parse.failed'` and `status: 400`. The custom error handler ignores that and always sends 500.
- **Found by:** `POST /tasks › 400 (not 500) on malformed JSON`.
- **Fix:** The handler now checks `err.type === 'entity.parse.failed'` and returns 400. I also added a JSON 404 handler for unknown routes. Before, Express returned an HTML page.

## Bug 8 — The docs disagree on the status values (not fixed in code)

- `README.md` lists statuses as `pending | in-progress | completed`.
- `ASSIGNMENT.md` and the code use `todo | in_progress | done`.
- A client following the README gets 400 on every create that sets a status. I followed the code, since it's the actual contract, and updated the README.

---

## Known issues I noticed but left alone

- **`PUT` is a partial update, not a full replace.** HTTP semantics say PUT replaces the resource, but this handler merges fields in, which is PATCH behaviour. Changing it would break existing clients, so I'd ask first (see NOTES.md).
- **Loose date validation.** `Date.parse` accepts formats that aren't ISO 8601, such as `"March 7"`. A strict ISO regex, or a date library, would tighten this.
- **Timezone.** `dueDate` values without an offset are parsed in server-local time, so the overdue count depends on where the server runs.
