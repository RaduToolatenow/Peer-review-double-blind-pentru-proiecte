# Decisions — Classes, rubrics and assignments

> Part of [DECISIONS.md](../DECISIONS.md), whose index lists every live decision. Status `approved` means obey.

## D-007 · A submission belongs to a team
- **Status:** approved
- **Date:** 2026-11-08
- **Rule:** Submissions belong to teams. An individual student is a team with one member.
- **Why:** The brief requires the same-team allocation constraint, and this model also fits an individual pilot.
- **Rejected:** Separate individual and team submission paths.
- **Evidence:** api/prisma/schema.prisma
- **Source:** user · confidence high
- **Confirmed:** 2026-11-17

## D-011 · Rubrics are reusable and apply to all or chosen teams
- **Status:** approved
- **Date:** 2026-11-17
- **Rule:** A rubric is its own record, created by a professor, with 1 to 100 criteria, checked on the server. One rubric may be used by several assignments. An assignment's rubric applies either to all its teams or only to the teams the professor chooses. A team may be given a different rubric. A team with no rubric is not evaluated: its submission is left out of allocation and gets no grade, but its members may still review. A rubric is locked when it is sent to a class (D-013), and at the latest when the first score on it is saved; a change is made on a copy. A rubric never used may be deleted at any time. A used rubric is never deleted: 2 days after the latest review deadline of the assignments that use it, the professor may archive it, which hides it and stops it being chosen, while its scores and results stay.
- **Why:** The user wants a rubric per assignment, reuse across assignments, and rubrics for chosen teams only. Locking keeps submitted scores tied to the criteria they were given against.
- **Rejected:** One rubric fixed to one assignment, the current schema. Editing a rubric after reviews exist.
- **Evidence:** api/src/rubrics/, api/src/assignments/assignment-scope.ts, api/prisma/migrations/20261117120000_reusable_rubrics/, api/test/rubrics-api.spec.ts, api/test/assignment-scope.spec.ts.
- **Source:** user · confidence high
- **Confirmed:** 2026-11-17

## D-012 · Classes and teams entered by the professor, joined by team code
- **Status:** approved
- **Date:** 2026-11-17
- **Rule:** A professor creates classes and enters their teams from paper, with members as plain text and no emails. A student working alone is a team of one (D-007). Each team gets a short generated code that the professor hands out; a signed-in student enters it once to join the team. The professor sees how many accounts joined a team, never which.
- **Why:** The professor keeps teams on paper and must not see students' emails (D-014). The system still needs each account's team so nobody reviews their own team, as the brief requires.
- **Rejected:** Teams built from student emails. Students choosing their team from a list, which anyone could fake.
- **Evidence:** api/src/classes/ (`join-code.ts`), api/prisma/migrations/20261117180000_classes_and_sent_rubrics/, web/src/pages/ClassDetailPage.tsx, web/src/pages/JoinTeamPage.tsx, api/test/classes-api.spec.ts.
- **Source:** user · confidence high
- **Confirmed:** 2026-11-17

## D-013 · A rubric sent to a class is the assignment
- **Status:** approved
- **Date:** 2026-11-17
- **Rule:** A rubric draft is sent to a class with deadlines and k; from then on it is an active rubric, which is the assignment, and it is locked. Other criteria mean a copy, which starts as a draft. A student sees only the active rubric sent to them, for the submissions allocated to them, and answers it.
- **Why:** The user's model has no separate assignment screen: sending a rubric to a class is the assignment, and every student must answer the same rubric.
- **Rejected:** Editing a rubric after it was sent.
- **Evidence:** api/src/rubrics/rubrics.service.ts (sending), api/src/assignments/, api/prisma/migrations/20261117180000_classes_and_sent_rubrics/, web/src/pages/SendRubricPage.tsx, api/test/assignments-api.spec.ts.
- **Source:** user · confidence high
- **Confirmed:** 2026-11-17

## D-015 · Professor and admin menu
- **Status:** approved
- **Date:** 2026-11-17
- **Rule:** A professor's menu has Active rubrics, Rubric drafts and Classes, each showing only that professor's own records. An admin has the same menu and can also open each professor's rubrics, read only.
- **Why:** The user's chosen layout; rubrics are private to their professor.
- **Rejected:** Shared rubrics between professors, and copying another professor's rubric.
- **Evidence:** web/src/App.tsx (menu), api/src/admin/admin.controller.ts, web/src/pages/ProfessorsPage.tsx, api/test/admin-api.spec.ts.
- **Source:** user · confidence high
- **Confirmed:** 2026-11-26

## D-034 · The admin adds and deletes professors
- **Status:** approved
- **Date:** 2026-11-26
- **Rule:** The admin adds a professor with an email of any domain and a full name. The account stays unconfirmed until the professor sets a password through an emailed link (a RESET token valid 24 hours, opening the existing new-password page); an email that already has an account gets 409. The admin deletes a professor only when the professor has no class and no rubric sent to a class; their drafts are deleted with the account and their sessions are closed. The database's RESTRICT foreign keys enforce this, and the API answers 409. Only professor accounts are added or deleted this way.
- **Why:** The user wants the admin to manage professors; until now professor accounts came only from the seed. Blocking on classes and sent rubrics keeps students' teams, submissions and grades.
- **Rejected:** The admin setting the first password; deleting a professor's classes, assignments and grades with the account; deactivating instead of deleting; making an existing student account a professor; only `@ulbsibiu.ro` addresses for professors.
- **Evidence:** api/src/admin/admin.controller.ts (`addProfessor`, `deleteProfessor`), api/src/admin/professor.dto.ts, api/src/auth/account.service.ts (`inviteProfessor`), api/src/mail/messages.ts (`professorInviteEmail`), web/src/pages/ProfessorsPage.tsx, api/test/admin-api.spec.ts.
- **Source:** user · confidence high
- **Confirmed:** 2026-11-26
