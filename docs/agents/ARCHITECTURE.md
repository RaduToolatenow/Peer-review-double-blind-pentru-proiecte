# Architecture — Peer-review-double-blind-pentru-proiecte

<!-- graffino-agentic:begin v1 -->
> How this repo is built, generated from the code at backfill and kept current by
> whoever changes the structure. The code wins: when this page is wrong, fix it.
<!-- graffino-agentic:end -->

## Overview
A React page talks to a NestJS API under `/api`. The API stores everything in PostgreSQL.
In production NestJS also serves the React build, so the app has one origin (D-006).
In production every request passes Cloudflare and then Render's proxy, so the API trusts exactly 3 proxy hops to read the visitor's IP (D-018).
Built so far: accounts, classes and teams, rubrics and assignments, submissions, allocation, reviews, notifications, calibration and grades (D-025), the results page (D-026), disputes (D-027), reviewer grades (D-028) and the CSV export (D-029). Grades are computed on read by pure functions in `api/src/grades/grade.ts`, never stored.

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
| Auth | `api/src/auth/` | login, logout, current user, session and role guard, sign-up and password reset, the new-password check (`password-policy.ts`, D-030) | PrismaService |
| Users | `api/src/users/` | admin user list, public user shape, test accounts | PrismaService |
| Allocation | `api/src/allocation/` | pure allocation rules (`allocate.ts`), the service that writes them in a locked transaction, the withdraw route (D-022) | PrismaService |
| Grades | `api/src/grades/` | pure reliability, aggregation and explanation (`grade.ts`), the shared loader (`grading.ts`), the professor's calibration reviews, the grades route (D-025), the results page routes (D-026), disputes (D-027) the professor's feedback ratings (D-028) and the CSV export (`csv.ts`, D-029) | PrismaService |
| Jobs | `api/src/jobs/` | starts pg-boss and runs `allocate-due` every minute (D-021) | AllocationService, PostgreSQL `pgboss` schema |
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
| Domain data | PostgreSQL tables, see `docs/db-schema.md` | Prisma migrations | 20 tables |
| Sessions | PostgreSQL `session` table | connect-pg-simple | 8-hour cookie |
| Job queue | PostgreSQL `pgboss` schema | pg-boss | created by pg-boss on first start |

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
| `JOBS` | `.env`, tests | Jobs | `off` stops pg-boss from starting; tests set it |
<!-- names only, never values -->

## Build, deploy, runtime
`npm run build` builds React, then NestJS. `npm start` runs `api/dist/main.js`.
CI is in `.github/workflows/ci.yml`. Every push to `main` deploys to Render, with the database on Supabase (D-009).

## Boundaries
- Authentication and roles are enforced on the server by `SessionGuard` (D-005, D-010).
- New passwords are checked on the server against common ones, repeats and the email's name (D-030).
- `PUBLIC_USER_SELECT` limits which user fields leave the server.
- Allocation keeps who reviews what inside the server: no route returns another reviewer's id or email (D-014, D-022).
