# Patterns — Peer-review-double-blind-pentru-proiecte

<!-- graffino-agentic:begin v1 -->
> How we build things here. Copy only `approved` entries. `candidate` = seen once or
> not yet confirmed; agents add these freely. Promotion needs the user's OK.
<!-- graffino-agentic:end -->

## Index
- PATTERN-001 · Protect a route with SessionGuard and Roles · approved

---

## PATTERN-001 · Protect a route with SessionGuard and Roles
- **Status:** approved
- **Use when:** A route needs a signed-in user or a specific role.
- **How:** Add `@UseGuards(SessionGuard)`, and `@Roles(...)` when only some roles may call it.
- **Example:** api/src/users/users.controller.ts
- **Why:** The check runs on the server and reads the current role from the database.
- **Source:** code · confidence high
- **Confirmed:** 2026-11-17
