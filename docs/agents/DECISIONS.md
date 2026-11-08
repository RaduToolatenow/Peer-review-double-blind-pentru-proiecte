# Decisions — Peer-review-double-blind-pentru-proiecte

<!-- graffino-agentic:begin v1 -->
> Constraints the code must obey. Status: `approved` (obey) · `proposed` (do not
> build on it) · `superseded-by <ID>` (kept to explain old code).
> Adding or changing an entry needs the user's OK (AGENTS.md → The gate).
<!-- graffino-agentic:end -->

## Index
- D-001 · TypeScript, React, PostgreSQL and pg-boss
- D-002 · NestJS for the API
- D-003 · Cookie sessions, argon2 and invitation-only accounts

---

## D-001 · TypeScript, React, PostgreSQL and pg-boss
- **Status:** approved
- **Date:** 2026-11-08
- **Rule:** The API is TypeScript on Node, the UI is React, data lives in PostgreSQL, and scheduled jobs use pg-boss.
- **Why:** The user chose this stack. Phase-closing jobs need a queue, and pg-boss provides one without a separate Redis service.
- **Rejected:** Next.js full-stack, Laravel and Django, offered as alternatives during setup.
- **Evidence:** the user's answer in the setup session on 2026-11-08; no code exists yet.
- **Source:** user · confidence high

## D-002 · NestJS for the API
- **Status:** approved
- **Date:** 2026-11-08
- **Rule:** The API is built with NestJS.
- **Why:** The user chose NestJS for its ready-made module structure.
- **Rejected:** Fastify directly, which has less built-in structure.
- **Evidence:** the user's answer in the setup session on 2026-11-08; no code exists yet.
- **Source:** user · confidence high

## D-003 · Cookie sessions, argon2 and invitation-only accounts
- **Status:** approved
- **Date:** 2026-11-08
- **Rule:** Login uses server-side sessions in an httpOnly cookie. Passwords are hashed with argon2. Student accounts are created by email invitation, from a list the professor uploads.
- **Why:** Inferred: server-side sessions can be revoked at once, and invitations limit accounts to enrolled students, which protects the reviewer pool.
- **Rejected:** JWT and open self-registration.
- **Evidence:** the user's approval in the setup session on 2026-11-08; no code exists yet.
- **Source:** user · confidence high
