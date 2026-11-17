# Open questions — Peer-review-double-blind-pentru-proiecte

<!-- graffino-agentic:begin v1 -->
> Unknowns. Work that depends on an open question is out of scope until it is
> answered. Only the user answers; an agent never answers by guessing. An agent may
> write a `Proposed answer` the evidence supports; the question stays
> `investigating` until the user confirms it.
> Answered entries stay, with the answer and date, and usually become a D- or PATTERN-.
<!-- graffino-agentic:end -->

## Index
- Q-001 · Fastify or NestJS for the API? · _answered_
- Q-002 · What can the pilot review, given that colleagues' P1 projects are due the same day as this one?
- Q-003 · Which professor or teaching assistant is interviewed, and what would make them use the results?
- Q-004 · What are the pilot rubric and the value of k?
- Q-005 · What are the aggregation and reliability methods?
- Q-006 · Where is the app deployed? · _answered_
- Q-007 · How do users authenticate: password accounts, invitations or something else? · _answered_
- Q-008 · Are pilot submissions individual, or do teams exist? · _answered_

---

## Q-001 · Fastify or NestJS for the API?
- **Status:** answered 2026-11-08
- **Blocks:** the project skeleton and every API route.
- **Who answers:** the student
- **Answer:** NestJS.
- **Recorded as:** D-002

## Q-002 · What can the pilot review, given that colleagues' P1 projects are due the same day as this one?
- **Status:** open
- **Blocks:** the pilot date and the minimum of 8 real submissions.
- **Who answers:** the course professor

## Q-003 · Which professor or teaching assistant is interviewed, and what would make them use the results?
- **Status:** open
- **Blocks:** INTERVIEW.md and the personal variable on results use.
- **Who answers:** the student, after the interview

## Q-004 · What are the pilot rubric and the value of k?
- **Status:** open
- **Blocks:** the seed data and the allocation parameters.
- **Who answers:** the student, with the pilot colleagues

## Q-005 · What are the aggregation and reliability methods?
- **Status:** open
- **Blocks:** the aggregation function and the results page.
- **Who answers:** the student

## Q-006 · Where is the app deployed?
- **Status:** answered 2026-11-17
- **Blocks:** the live URL, the file storage choice and the release section of AGENTS.md.
- **Who answers:** the student
- **Answer:** Render free web service for the app, Supabase free project for PostgreSQL through the session pooler, both in Frankfurt. File storage is still open.
- **Recorded as:** D-009

## Q-007 · How do users authenticate: password accounts, invitations or something else?
- **Status:** answered 2026-11-08
- **Blocks:** the users schema and the login page.
- **Who answers:** the student
- **Answer:** Cookie sessions, argon2, and student accounts by email invitation from the professor's list.
- **Recorded as:** D-003

## Q-008 · Are pilot submissions individual, or do teams exist?
- **Status:** answered 2026-11-08
- **Blocks:** the teams schema and the same-team allocation constraint.
- **Who answers:** the student
- **Answer:** Model teams; an individual student is a team with one member.
- **Recorded as:** D-007
