# Patterns — Peer-review-double-blind-pentru-proiecte

<!-- graffino-agentic:begin v1 -->
> How we build things here. Copy only `approved` entries. `candidate` = seen once or
> not yet confirmed; agents add these freely. Promotion needs the user's OK.
<!-- graffino-agentic:end -->

## Index
- PATTERN-001 · Protect a route with SessionGuard and Roles · approved
- PATTERN-002 · Rules in the database, 409 from the API · approved
- PATTERN-003 · Page data with useLoad and Loaded · approved

---

## PATTERN-001 · Protect a route with SessionGuard and Roles
- **Status:** approved
- **Use when:** A route needs a signed-in user or a specific role.
- **How:** Add `@UseGuards(SessionGuard)`, and `@Roles(...)` when only some roles may call it.
- **Example:** api/src/users/users.controller.ts
- **Why:** The check runs on the server and reads the current role from the database.
- **Source:** code · confidence high
- **Confirmed:** 2026-11-17

## PATTERN-002 · Rules in the database, 409 from the API
- **Status:** approved
- **Use when:** A rule must hold whatever route or script writes the data, such as a locked rubric.
- **How:** Enforce it with a CHECK, a foreign key or a trigger in the migration SQL that raises a recognisable message. In the service, catch the error with a helper from `api/src/prisma/db-errors.ts` and answer 409 with a Romanian message. Do not repeat the rule in TypeScript.
- **Example:** api/prisma/migrations/20261117120000_reusable_rubrics/migration.sql, api/src/rubrics/rubrics.service.ts
- **Why:** One copy of the rule, which no future route can bypass.
- **Source:** code · confidence high
- **Confirmed:** 2026-11-17

## PATTERN-003 · Page data with useLoad and Loaded
- **Status:** approved
- **Use when:** A page loads data from the API.
- **How:** `const state = useLoad(() => api.x(id), [id])`, then `<Loaded state={state}>{(data) => ...}</Loaded>`, which shows loading and the server's error message. Actions keep their own error state and call `state.reload()`.
- **Example:** web/src/pages/ClassesPage.tsx
- **Why:** Every page covers the loading and error states the same way.
- **Source:** code · confidence high
- **Confirmed:** 2026-11-17
