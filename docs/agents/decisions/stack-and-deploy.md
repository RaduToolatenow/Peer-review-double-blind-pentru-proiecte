# Decisions — Stack and deploy

> Part of [DECISIONS.md](../DECISIONS.md), whose index lists every live decision. Status `approved` means obey.

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
- **Confirmed:** 2026-11-17

## D-004 · Prisma for schema and migrations
- **Status:** approved
- **Date:** 2026-11-08
- **Rule:** The schema and versioned migrations use Prisma, pinned to a stable 7.x release. Prisma writes each migration as a readable SQL file.
- **Why:** The schema is due at the checkpoint, and SQL migration files can be read and extended with CHECK constraints. The latest npm tag for Prisma is a release candidate, so it is not used.
- **Rejected:** Prisma 8 release candidates.
- **Evidence:** api/prisma/schema.prisma, api/prisma/migrations/
- **Source:** user · confidence high
- **Confirmed:** 2026-11-17

## D-006 · NestJS serves the React build from one origin
- **Status:** approved
- **Date:** 2026-11-08
- **Rule:** In production one NestJS service serves the API under `/api` and the React build. Locally, Vite proxies `/api` to NestJS.
- **Why:** The session cookie works without CORS, and there is one service to deploy.
- **Rejected:** A separately hosted React app, which needs CORS and two services.
- **Evidence:** api/src/main.ts, web/vite.config.ts
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
- **Confirmed:** 2026-11-17

## D-009 · Deploy on Render and Supabase
- **Status:** approved
- **Date:** 2026-11-17
- **Rule:** The app runs as one Render free web service. PostgreSQL is a Supabase free project, reached through the session pooler on port 5432. Both are in Frankfurt. Migrations run in the Render build command, and every push to `main` deploys automatically.
- **Why:** Both plans are free and give HTTPS. The session pooler works over IPv4, which Render needs. Port 5432 keeps Prisma migrations and the session store working, unlike the transaction pooler.
- **Rejected:** Neon, because pg-boss polling would use up its free compute hours. Supabase direct connection (IPv6 only) and transaction pooler.
- **Evidence:** the Render service settings; AGENTS.md section 5.
- **Source:** user · confidence high
- **Confirmed:** 2026-11-17
