# AGENTS.md — Peer-review-double-blind-pentru-proiecte

<!-- graffino-agentic:begin v1 -->
## How we work here

**Before any work:** `git fetch --all --prune`, then `git pull --ff-only`. Stop on a
non-fast-forward or on uncommitted changes you did not make.

**Always load** (indexes; open the entry, or its topic file, before you rely on it):
`docs/agents/DECISIONS.md`, `docs/agents/PATTERNS.md`,
`docs/agents/CONTRACTS.md`, `docs/agents/OPEN-QUESTIONS.md`, `CONTEXT.md`.

**Load on demand:**

| When | Load |
|---|---|
| You rely on an entry | the entry, or its topic file under `docs/agents/<kind>/` |
| Structural work | `docs/agents/ARCHITECTURE.md` |
| Old code or a past decision needs explaining | `docs/agents/DECISIONS-SUPERSEDED.md`, `PATTERNS-SUPERSEDED.md` (never obeyed) |
| UI work | `docs/design/DESIGN.md`, `docs/design/registry.yaml` |
| You plan a feature or check a requirement | `docs/brief.md` |

**Flow:** a change to more than a few lines, or one with a design choice, starts with
`/plan`. The approved plan runs with `/build`. Small fixes go straight to build, with
tests first where tests exist.

### The gate
Ask yourself: **does this change something already approved?**
- **Do, then report:** add a `candidate` pattern; add or answer an open question
  (only with an answer the user gave); write a `Proposed answer` the evidence
  supports (the question stays `investigating` until the user confirms it); fix a
  typo, link or moved path; code that follows the approved entries.
- **Propose and wait:** change, supersede or delete an `approved` pattern or
  decision; promote `candidate → approved`; add a decision; code that contradicts an
  entry. Use this shape, then stop:

```text
PROPOSAL: <add-decision | change | supersede | promote | delete>
- Existing: <ID and what it says, or "none">
- Proposed: <the new rule>
- Why now: <what changed>
- Impact: <files that follow the old rule>
- If approved: <old ID> → superseded-by <new ID> (kept, not deleted)
```
Before you propose, check `docs/agents/REJECTED.md`: never re-propose a rejected item
without new evidence. A rejected proposal is added there with the reason.

### Hard rules
- Build only from `approved` entries. Unanswered means out of scope: record a Q-,
  never invent a value, a requirement or a behaviour.
- Add nothing nobody asked for. Note it as a suggestion instead.
- Build the smallest change that meets the approved criteria, reusing existing code.
  A new abstraction, dependency, configuration option, extension point or broad
  refactor needs a concrete reason today. Never at the cost of tests or error handling.
- Tests first where the repo has tests. Never change what an existing test asserts
  to make code pass; an assertion you think is wrong goes to the user.
- Never write a secret, token, password or personal data into a file, commit or log.
- Never push, tag, release, or deploy without the user's go for that action.
- When you cite past work, label the intent: **replicate** (only for an `approved`
  pattern) or **for awareness only**. History is not a template.
- The code wins over any document. When they disagree, say so and fix the document.
- Report honestly: a failed check is reported with its output; a skipped step is
  named with its reason.

### Ledger rules
- IDs are one sequence per kind in this repo: `D-`, `PATTERN-`, `C-`, `Q-`. Never renumber.
- A provided contract (C-) lives here only; consumers link to it. Changing one is a
  PROPOSAL, and the plan names the consumer files too.
- Superseded entries stay (`status: superseded-by <ID>`) so old code stays explainable.
  Their index lines live in `DECISIONS-SUPERSEDED.md` / `PATTERNS-SUPERSEDED.md`, not
  in the always-loaded indexes; the lint (`--fix`) moves them.
- After any ledger change: `python3 docs/agents/tools/ledger-lint.py --fix` (next free
  ID: `--next D`). It must pass.
- **Confirmed:** when the user confirms an entry in a plan, set `- **Confirmed:** <date>`
  on it. Any edit to an entry removes its Confirmed line.
- A new reusable practice becomes a `candidate` pattern in the same session.
- A settled constraint becomes a decision PROPOSAL in the same session.
<!-- graffino-agentic:end -->

## 1. What this repo is
A platform where students review each other's projects, anonymous in both directions.
A professor defines the rubric. The system allocates reviewers, calibrates them and
aggregates grades. Users are students, professors and admins at the student's faculty.
The full brief is in `docs/brief.md`. Built so far: login with an attempt limit, roles,
classes and teams with join codes, rubric drafts sent to classes, submissions with
cleaned files, reviewer allocation with withdrawals and late arrivals, double-blind reviews
sent once with feedback per criterion, and notifications by email and in the app, all run by
a pg-boss job every minute. Calibration, aggregation, results and disputes are not built yet.

## 2. Stack and commands
TypeScript with NestJS 11 (D-002, D-008), React and Vite (D-001), PostgreSQL 17 with Prisma 7 (D-004).

```bash
docker compose up -d --wait   # PostgreSQL; needs .env, copied from .env.example
npm ci                        # install
npm run db:migrate            # apply migrations
npm run db:seed               # test accounts
npm run typecheck             # type-check api and web
npm test                      # 132 tests; needs PostgreSQL running
npm run build                 # build web, then api
npm start                     # http://localhost:3000
npm run dev:api               # API in watch mode
npm run dev:web               # http://localhost:5173, proxies /api
python3 docs/agents/tools/ledger-lint.py   # on Windows PowerShell set PYTHONUTF8=1 first
npx playwright@1.56.1 screenshot -b chromium --color-scheme=dark --viewport-size=1280,800 --wait-for-selector=h1 http://localhost:3000/ out.png
```

## 3. Layout
- `api/`: NestJS API, Prisma schema, migrations and tests.
- `web/`: React interface.
- `docker/`, `docker-compose.yml`: local PostgreSQL.
- `docs/brief.md`: the project brief. `docs/db-schema.md`, `docs/API.md`: schema and routes.
- `docs/agents/`: the decisions, patterns, contracts and questions ledger.
- `docs/design/`: UI rules, screen registry, mocks and screenshots.
- `.claude/`: the `/plan` and `/build` skills and their agents.
- `.github/workflows/ci.yml`: tests, build and ledger lint on every push.

## 4. Rules for this repo
- `INTERVIEW.md` and `PILOT.md` record only events that really happened, as the user reports them.
- Every technical decision is the user's. The user must be able to explain each line without AI.
- Commits use real dates and descriptive messages. Never backdate or make empty commits.
- Never add a route that returns a user without `PUBLIC_USER_SELECT` or an equally narrow shape.

## 5. Release
Render web service with a Supabase database (D-009), live at
https://peer-review-double-blind-pentru-proiecte.onrender.com. Every push to `main`
deploys, so the user says go for every push.
- Build command: `npm ci --include=dev && npm run build && npm run db:migrate`
- Start command: `npm start`. Health check path: `/api/health`.
- Variables, set in the Render dashboard only: `DATABASE_URL` (Supabase session pooler,
  port 5432), `SESSION_SECRET`, `NODE_ENV=production`, `NODE_VERSION=24`, and for files
  (D-016) `FILE_STORE=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_BUCKET`.
  The app refuses to start in production without `FILE_STORE=supabase`.
- Email (D-020): `MAIL_TRANSPORT=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
  `MAIL_FROM` (an address confirmed in Brevo) and `APP_URL`; the app refuses to start in
  production without `MAIL_TRANSPORT=smtp`. Use `SMTP_PORT=2525`: Render's free plan blocks
  outbound 25, 465 and 587. Brevo accepts only authorised sending IPs, so Render's outbound
  ranges (service → Connect → Outbound) must be listed in Brevo → Security → Authorized IPs.
- Seed accounts are created from the user's PC (`npm run db:seed` with the variables set in
  the shell), never from the build.
- Keep-alive: a cron-job.org job, on the user's account, opens `/api/health` every 10
  minutes so the free Render service never sleeps. Its 750 free hours a month cover one
  always-on service only, so no second free Render service.

## 6. Definition of done
- `npm test` passes.
- `npm run typecheck` and `npm run build` pass.
- Screenshots of every changed screen, light and dark, compared with `docs/design/DESIGN.md`.
- New practices recorded as candidate patterns; open points recorded as Q- entries.
