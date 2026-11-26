# Decisions superseded — Peer-review-double-blind-pentru-proiecte

<!-- graffino-agentic:begin v1 -->
> Decisions that no longer apply. **Never obeyed**; read only to explain old code or a
> past choice. Each points to the entry that replaced it. `ledger-lint.py --fix`
> keeps this file in sync: superseded entries move here from `DECISIONS.md`, and
> their index lines move here from its index.
<!-- graffino-agentic:end -->

## Index
- D-003 · Cookie sessions, argon2 and invitation-only accounts · _superseded-by D-010_

### [Submissions and reviews](decisions/submissions-and-reviews.md)
- D-016 · Submissions: link and cleaned PDF or DOCX file · _superseded-by D-032_

---

## D-003 · Cookie sessions, argon2 and invitation-only accounts
- **Status:** superseded-by D-010
- **Date:** 2026-11-08
- **Rule:** Login uses server-side sessions in an httpOnly cookie. Passwords are hashed with argon2. Student accounts are created by email invitation, from a list the professor uploads.
- **Why:** Inferred: server-side sessions can be revoked at once, and invitations limit accounts to enrolled students, which protects the reviewer pool.
- **Rejected:** JWT and open self-registration.
- **Evidence:** api/src/auth/, api/src/configure-app.ts, api/test/auth.spec.ts; invitations are not built yet.
- **Source:** user · confidence high
