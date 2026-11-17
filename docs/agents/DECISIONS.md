# Decisions — Peer-review-double-blind-pentru-proiecte

<!-- graffino-agentic:begin v1 -->
> Constraints the code must obey. Status: `approved` (obey) · `proposed` (do not
> build on it) · `superseded-by <ID>` (kept to explain old code).
> Adding or changing an entry needs the user's OK (AGENTS.md → The gate).
<!-- graffino-agentic:end -->

## Index
- D-001 · TypeScript, React, PostgreSQL and pg-boss
- D-002 · NestJS for the API
- D-004 · Prisma for schema and migrations
- D-005 · Sessions with express-session and connect-pg-simple
- D-006 · NestJS serves the React build from one origin
- D-007 · A submission belongs to a team
- D-008 · NestJS stays on major version 11
- D-009 · Deploy on Render and Supabase
- D-010 · Self sign-up through the assignment link with a verified university email
- D-011 · Rubrics are reusable and apply to all or chosen teams

---

## D-001 · TypeScript, React, PostgreSQL and pg-boss
- **Status:** approved
- **Date:** 2026-11-08
- **Rule:** The API is TypeScript on Node, the UI is React, data lives in PostgreSQL, and scheduled jobs use pg-boss.
- **Why:** The user chose this stack. Phase-closing jobs need a queue, and pg-boss provides one without a separate Redis service.
- **Rejected:** Next.js full-stack, Laravel and Django, offered as alternatives during setup.
- **Evidence:** api/package.json, web/package.json; pg-boss is added with the first job.
- **Source:** user · confidence high
- **Confirmed:** 2026-11-17

## D-002 · NestJS for the API
- **Status:** approved
- **Date:** 2026-11-08
- **Rule:** The API is built with NestJS.
- **Why:** The user chose NestJS for its ready-made module structure.
- **Rejected:** Fastify directly, which has less built-in structure.
- **Evidence:** api/package.json, api/src/app.module.ts
- **Source:** user · confidence high

## D-004 · Prisma for schema and migrations
- **Status:** approved
- **Date:** 2026-11-08
- **Rule:** The schema and versioned migrations use Prisma, pinned to a stable 7.x release. Prisma writes each migration as a readable SQL file.
- **Why:** The schema is due at the checkpoint, and SQL migration files can be read and extended with CHECK constraints. The latest npm tag for Prisma is a release candidate, so it is not used.
- **Rejected:** Prisma 8 release candidates.
- **Evidence:** api/prisma/schema.prisma, api/prisma/migrations/
- **Source:** user · confidence high
- **Confirmed:** 2026-11-17

## D-005 · Sessions with express-session and connect-pg-simple
- **Status:** approved
- **Date:** 2026-11-08
- **Rule:** D-010 sessions use express-session, stored in the PostgreSQL `session` table through connect-pg-simple.
- **Why:** Mature libraries avoid custom security code, and sessions survive a server restart.
- **Rejected:** A hand-written session store.
- **Evidence:** api/src/configure-app.ts
- **Source:** user · confidence high

## D-006 · NestJS serves the React build from one origin
- **Status:** approved
- **Date:** 2026-11-08
- **Rule:** In production one NestJS service serves the API under `/api` and the React build. Locally, Vite proxies `/api` to NestJS.
- **Why:** The session cookie works without CORS, and there is one service to deploy.
- **Rejected:** A separately hosted React app, which needs CORS and two services.
- **Evidence:** api/src/main.ts, web/vite.config.ts
- **Source:** user · confidence high

## D-007 · A submission belongs to a team
- **Status:** approved
- **Date:** 2026-11-08
- **Rule:** Submissions belong to teams. An individual student is a team with one member.
- **Why:** The brief requires the same-team allocation constraint, and this model also fits an individual pilot.
- **Rejected:** Separate individual and team submission paths.
- **Evidence:** api/prisma/schema.prisma
- **Source:** user · confidence high
- **Confirmed:** 2026-11-17

## D-008 · NestJS stays on major version 11
- **Status:** approved
- **Date:** 2026-11-17
- **Rule:** The API uses NestJS 11 and is compiled as CommonJS. Moving to NestJS 12 needs a new decision.
- **Why:** NestJS 12 is ESM-only. The API, Jest with ts-jest and the Prisma client (`moduleFormat = "cjs"`) are set up as CommonJS.
- **Rejected:** NestJS 12 with a switch of the whole API to ES modules.
- **Evidence:** api/package.json, api/tsconfig.json, api/prisma/schema.prisma
- **Source:** user · confidence high

## D-009 · Deploy on Render and Supabase
- **Status:** approved
- **Date:** 2026-11-17
- **Rule:** The app runs as one Render free web service. PostgreSQL is a Supabase free project, reached through the session pooler on port 5432. Both are in Frankfurt. Migrations run in the Render build command, and every push to `main` deploys automatically.
- **Why:** Both plans are free and give HTTPS. The session pooler works over IPv4, which Render needs. Port 5432 keeps Prisma migrations and the session store working, unlike the transaction pooler.
- **Rejected:** Neon, because pg-boss polling would use up its free compute hours. Supabase direct connection (IPv6 only) and transaction pooler.
- **Evidence:** the Render service settings; AGENTS.md section 5.
- **Source:** user · confidence high

## D-010 · Self sign-up through the assignment link with a verified university email
- **Status:** approved
- **Date:** 2026-11-17
- **Rule:** Login keeps server-side sessions in an httpOnly cookie and argon2 hashes (D-005). Anyone with an assignment's link may create an account, but only with an `@ulbsibiu.ro` email, and the account is active only after the email is verified. The person becomes a reviewer for that assignment whether or not they submitted. The system allocates which submissions they review; they never choose. One email is one account, and an account reviews a submission at most once.
- **Why:** The user wants anyone at the university with the link to be able to review, without the professor's list. A verified email stops one person from reviewing the same project twice under several accounts.
- **Rejected:** Invitation-only accounts from the professor's list (D-003). Reviewers choosing which projects to open, which would break the allocation constraints in the brief.
- **Evidence:** api/prisma/schema.prisma (`users.email` unique, `reviews` unique on submission and reviewer); sign-up and verification are not built yet.
- **Source:** user · confidence high
- **Confirmed:** 2026-11-17

## D-011 · Rubrics are reusable and apply to all or chosen teams
- **Status:** approved
- **Date:** 2026-11-17
- **Rule:** A rubric is its own record, created by a professor, with 1 to 100 criteria, checked on the server. One rubric may be used by several assignments. An assignment's rubric applies either to all its teams or only to the teams the professor chooses. A team may be given a different rubric. A team with no rubric is not evaluated: its submission is left out of allocation and gets no grade, but its members may still review. Once the first score on a rubric is saved, the rubric is locked; a change is made on a copy. A rubric never used may be deleted at any time. A used rubric is never deleted: 2 days after the latest review deadline of the assignments that use it, the professor may archive it, which hides it and stops it being chosen, while its scores and results stay.
- **Why:** The user wants a rubric per assignment, reuse across assignments, and rubrics for chosen teams only. Locking keeps submitted scores tied to the criteria they were given against.
- **Rejected:** One rubric fixed to one assignment, the current schema. Editing a rubric after reviews exist.
- **Evidence:** not built yet; the schema change goes through /plan.
- **Source:** user · confidence high
- **Confirmed:** 2026-11-17
