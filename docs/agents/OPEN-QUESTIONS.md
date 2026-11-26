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
- Q-005 · What are the aggregation and reliability methods? · _answered_
- Q-006 · Where is the app deployed? · _answered_
- Q-007 · How do users authenticate: password accounts, invitations or something else? · _answered_
- Q-008 · Are pilot submissions individual, or do teams exist? · _answered_
- Q-009 · What is the maximum number of criteria in a rubric, and what does a rubric apply to? · _answered_
- Q-010 · What is a "round", and should a reviewer avoid a team they already reviewed? · _answered_
- Q-011 · Should members of a team the rubric does not apply to see the assignment in their list? · _answered_
- Q-012 · What password security check should be added, after colleagues' feedback? · _answered_
- Q-013 · What protection against refresh spam should be added, after colleagues' feedback?

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
- **Status:** answered 2026-11-25
- **Blocks:** the aggregation function and the results page.
- **Who answers:** the student
- **User answers (2026-11-25):** Aggregation is a reliability-weighted mean of the reviewers' levels per criterion, then combined with the rubric's criterion weights. Reliability comes from the mean absolute deviation, normalised to 0–1, from the professor's calibration scores where the professor reviewed the same submission, and from the other reviewers' median elsewhere; reliability = 1 − deviation, with a floor so nobody counts zero, and reviewers above a threshold are flagged. Calibration and aggregation are planned first.
- **Answer:** Reliability-weighted mean; reliability from calibration plus peer median. Floor 0.2, flag below 0.6, grade on 1–10 with 2 decimals; the professor picks the calibrated submissions and counts at reliability 1.
- **Recorded as:** D-025

## Q-006 · Where is the app deployed?
- **Status:** answered 2026-11-17
- **Blocks:** the live URL, the file storage choice and the release section of AGENTS.md.
- **Who answers:** the student
- **Answer:** Render free web service for the app, Supabase free project for PostgreSQL through the session pooler, both in Frankfurt. Files go to a private Supabase Storage bucket (answered 2026-11-17).
- **Recorded as:** D-009, D-016

## Q-007 · How do users authenticate: password accounts, invitations or something else?
- **Status:** answered 2026-11-08
- **Blocks:** the users schema and the login page.
- **Who answers:** the student
- **Answer:** Cookie sessions, argon2, and student accounts by email invitation from the professor's list.
- **Recorded as:** D-003, later superseded-by D-010

## Q-008 · Are pilot submissions individual, or do teams exist?
- **Status:** answered 2026-11-08
- **Blocks:** the teams schema and the same-team allocation constraint.
- **Who answers:** the student
- **Answer:** Model teams; an individual student is a team with one member.
- **Recorded as:** D-007

## Q-009 · What is the maximum number of criteria in a rubric, and what does a rubric apply to?
- **Status:** answered 2026-11-17
- **Blocks:** the rubric validation and the assignment routes.
- **Who answers:** the student
- **Known:** The professor sets the subject, the rubric and its criteria, and which projects the rubric applies to. A rubric has at least one criterion, and the app must allow at least 30.
- **User answers (2026-11-17):** At most 100 criteria per rubric. The user wants all three uses: a rubric for every team of an assignment, the same rubric reused across assignments, and a rubric applied only to chosen teams within an assignment. The requirements are the user's own, not from the teacher interview.
- **Answer:** Teams not chosen are not evaluated, unless the professor gives them another rubric.
- **Recorded as:** D-011

## Q-010 · What is a "round", and should a reviewer avoid a team they already reviewed?
- **Status:** answered 2026-11-24
- **Blocks:** the brief's rule "never the same pair twice if the assignment has several rounds"; the model has no rounds yet.
- **Who answers:** the student
- **Known:** Within one assignment a reviewer reviews a submission at most once (`reviews` unique on submission and reviewer).
- **User answers (2026-11-24):** There are no rounds; one assignment is one round, and the rule above already covers it.
- **Answer:** No rounds. The brief's "same pair twice" rule is met by the unique review per submission and reviewer.

## Q-011 · Should members of a team the rubric does not apply to see the assignment in their list?
- **Status:** answered 2026-11-24
- **Blocks:** withdrawing, and later reviewing, from the student's list for those members.
- **Who answers:** the student
- **Known:** D-011 says their submission is not evaluated but they may still review, and D-022 counts them as reviewers. `GET /api/my/assignments` lists an assignment only when the student's team is evaluated or the student joined through the link, so these members are allocated reviews but cannot see the assignment.
- **User answers (2026-11-24):** Yes, as reviewers only.
- **Answer:** `GET /api/my/assignments` also lists an assignment where the student is a member of a team in the class that the rubric does not apply to; the student sees no submission section, only their reviews, and can withdraw.

## Q-012 · What password security check should be added, after colleagues' feedback?
- **Status:** answered 2026-11-26
- **Raised:** 2026-11-26, by the user, from colleagues' feedback: "verificare securitate parole, posibilă îmbunătățire".
- **Today:** a password needs at least 10 characters (D-020), is hashed with argon2, and login has an attempt limit (D-017).
- **Blocks:** a change to sign-up and password reset; it counts toward the 3 changes from feedback.
- **Who answers:** the user
- **Answer:** A local common-password list (NCSC 100k from SecLists, entries of at least 10 characters), no single repeated character, nothing containing the email's name; new passwords only; a hint under the field.
- **Recorded as:** D-030

## Q-013 · What protection against refresh spam should be added, after colleagues' feedback?
- **Status:** open
- **Raised:** 2026-11-26, by the user, from colleagues' feedback: "protecție anti spam de refresh spam".
- **Today:** only failed logins are limited (D-017); other routes have no request limit.
- **Blocks:** a request limit on the API; it counts toward the 3 changes from feedback.
- **Who answers:** the user

