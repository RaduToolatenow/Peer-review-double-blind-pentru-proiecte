# Decisions — Scheduled jobs and notifications

> Part of [DECISIONS.md](../DECISIONS.md), whose index lists every live decision. Status `approved` means obey.

## D-021 · pg-boss loaded on demand, one job every minute
- **Status:** approved
- **Date:** 2026-11-24
- **Rule:** pg-boss is pinned to an exact version and loaded with `import()` only when jobs start, never in tests (`JOBS=off`). Its pool has at most 2 connections. One job, `allocate-due`, runs every minute and handles every assignment whose phase is due, instead of one job per assignment at its deadline. If the current ESM-only pg-boss cannot be loaded from the CommonJS API (D-008), the version is 10.4.2, the last CommonJS release.
- **Why:** D-001 chose pg-boss for scheduled jobs. A job every minute needs no rescheduling when a professor changes a deadline, and it catches runs missed during a restart or deploy. Two connections keep the Supabase session pooler free (D-009).
- **Rejected:** One delayed job per assignment at its deadline. Moving the API to ES modules for pg-boss.
- **Evidence:** api/src/jobs/jobs.service.ts, api/src/jobs/jobs.module.ts.
- **Source:** user · confidence high
- **Confirmed:** 2026-11-24

## D-024 · Notifications by email and in the app, from the every-minute job
- **Status:** approved
- **Date:** 2026-11-24
- **Rule:** The every-minute job (D-021) records and emails notifications to confirmed students: reviews allocated (once, when the student first has reviews on an allocated assignment before its review deadline), a review reminder in the 24 hours before the review deadline (to reviewers with unsent reviews who have not withdrawn), a submission reminder in the 24 hours before the submission deadline (to members of evaluated teams without a submission), and a dispute decided (to every member of the disputing team, once per dispute, D-027). There is one row per student, assignment and event, unique in the database; for a dispute decided, one row per student and dispute. An email is retried each minute until it is sent, at most 50 per run. The same rows show in the app on a "Notificări" page, with an unread count in the header; opening the page marks them read. Texts are built when shown, from the event and the assignment, and never name a team or another student.
- **Why:** The brief requires a job that closes phases and sends notifications. The user chose these three events, the 24-hour reminders, and email plus in-app.
- **Rejected:** One delayed job per deadline. Emailing from inside allocation. A notification when reviews move to someone already notified. Email only.
- **Evidence:** api/src/notifications/, api/src/mail/messages.ts, api/prisma/migrations/20261124170000_notifications/, web/src/pages/NotificationsPage.tsx, api/test/notifications.spec.ts.
- **Source:** user · confidence high
- **Confirmed:** 2026-11-25
