# Architecture — Peer-review-double-blind-pentru-proiecte

<!-- graffino-agentic:begin v1 -->
> How this repo is built, generated from the code at backfill and kept current by
> whoever changes the structure. The code wins: when this page is wrong, fix it.
<!-- graffino-agentic:end -->

## Overview
A React page talks to a NestJS API under `/api`. The API stores everything in PostgreSQL.
In production NestJS also serves the React build, so the app has one origin (D-006).
Only authentication exists so far. The full data model is already in the database.

```text
Browser ──> React (web/)
   │
   └── /api, cookie sid ──> NestJS (api/) ──> PostgreSQL
                                              users, session, assignments, ...
```

## Parts
| Part | Path | Responsibility | Talks to |
|---|---|---|---|
| Web | `web/src/` | login page and start page | API through `web/src/api.ts` |
| App setup | `api/src/main.ts`, `api/src/configure-app.ts` | prefix, validation, sessions, static files | PostgreSQL session table |
| Auth | `api/src/auth/` | login, logout, current user, session and role guard | PrismaService |
| Users | `api/src/users/` | admin user list, public user shape, test accounts | PrismaService |
| Database access | `api/src/prisma/` | shared Prisma client | PostgreSQL |
| Schema | `api/prisma/` | schema, migrations, seed | PostgreSQL |

## Data flow
Login:
1. The login page posts the email and password to `/api/auth/login`.
2. `LoginDto` validates the body and `AuthService` checks the argon2 hash.
3. The controller regenerates the session and stores the user id.
4. Each protected request passes `SessionGuard`, which reads the user and role from the database.

## State and storage
| What | Where | Owner | Notes |
|---|---|---|---|
| Domain data | PostgreSQL tables, see `docs/db-schema.md` | Prisma migrations | 11 tables |
| Sessions | PostgreSQL `session` table | connect-pg-simple | 8-hour cookie |

## Configuration
| Name | Where set | Used by | Notes |
|---|---|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | `.env` | Docker Compose | local only |
| `DATABASE_URL` | `.env` | API, Prisma | |
| `TEST_DATABASE_URL` | `.env` | tests | |
| `SESSION_SECRET` | `.env` | session cookie | |
| `PORT` | `.env` | API | default 3000 |
| `SEED_ADMIN_PASSWORD`, `SEED_PROFESSOR_PASSWORD`, `SEED_STUDENT_PASSWORD` | `.env` | seed | |
| `NODE_ENV` | host | API | `production` enables secure cookies |
<!-- names only, never values -->

## Build, deploy, runtime
`npm run build` builds React, then NestJS. `npm start` runs `api/dist/main.js`.
CI is in `.github/workflows/ci.yml`. The deploy target is open (Q-006).

## Boundaries
- Authentication and roles are enforced on the server by `SessionGuard` (D-005, D-010).
- `PUBLIC_USER_SELECT` limits which user fields leave the server.
- The anonymity boundary between authors and reviewers has no routes yet.
