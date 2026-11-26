# Decisions — Peer-review-double-blind-pentru-proiecte

<!-- graffino-agentic:begin v1 -->
> Constraints the code must obey. Status: `approved` (obey) · `proposed` (do not
> build on it) · `superseded-by <ID>` (kept to explain old code).
> Adding or changing an entry needs the user's OK (AGENTS.md → The gate).
<!-- graffino-agentic:end -->

## Index
### [Accounts and security](decisions/accounts-and-security.md)
- D-005 · Sessions with express-session and connect-pg-simple
- D-010 · Self sign-up through the assignment link with a verified university email
- D-017 · Login attempt limit and equal timing
- D-018 · Visitor IP behind Cloudflare and Render
- D-020 · Email, sign-up, confirmation and password reset
- D-030 · New passwords checked against common ones
- D-031 · Request limit against refresh spam

### [Classes and assignments](decisions/classes-and-assignments.md)
- D-007 · A submission belongs to a team
- D-011 · Rubrics are reusable and apply to all or chosen teams
- D-012 · Classes and teams entered by the professor, joined by team code
- D-013 · A rubric sent to a class is the assignment
- D-015 · Professor and admin menu

### [Design](decisions/design.md)
- D-019 · Visual design inspired by smartportal, without university branding

### [Grading and results](decisions/grading-and-results.md)
- D-025 · Calibration, reliability and grade aggregation
- D-026 · Results page that explains the grade
- D-027 · Disputes per criterion, decided by the professor
- D-028 · Reviewer grade from accuracy and the professor's feedback rating
- D-029 · CSV export of an assignment's results

### [Jobs and notifications](decisions/jobs-and-notifications.md)
- D-021 · pg-boss loaded on demand, one job every minute
- D-024 · Notifications by email and in the app, from the every-minute job

### [Stack and deploy](decisions/stack-and-deploy.md)
- D-001 · TypeScript, React, PostgreSQL and pg-boss
- D-002 · NestJS for the API
- D-004 · Prisma for schema and migrations
- D-006 · NestJS serves the React build from one origin
- D-008 · NestJS stays on major version 11
- D-009 · Deploy on Render and Supabase

### [Submissions and reviews](decisions/submissions-and-reviews.md)
- D-014 · Nobody can see who reviewed
- D-022 · Reviewer allocation, withdrawals and late arrivals
- D-023 · A review is sent once, complete and final
- D-032 · Submissions: link and a cleaned PDF, DOCX, PPTX, ODT, ODP or ZIP file

