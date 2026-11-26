# Decisions — Submissions, allocation and reviews

> Part of [DECISIONS.md](../DECISIONS.md), whose index lists every live decision. Status `approved` means obey.

## D-014 · Nobody can see who reviewed
- **Status:** approved
- **Date:** 2026-11-17
- **Rule:** No page or route shows who submitted a review, to anyone, the professor and admin included; only how many reviewed. Reviewers appear as numbered anonymous reviewers. The system keeps the link between account and review internally, for allocation, duplicate checks and reliability. A student's email is used only for login, the `@ulbsibiu.ro` check and the app's own emails (account confirmation and password reset, D-020, and notifications, D-024), and is never shown; the admin sees emails of professors and admins only, and a count of student accounts.
- **Why:** The user wants the email to be only a check that the person is from the university, and answers to stay anonymous.
- **Rejected:** Double-blind only between students, with the professor seeing reviewers.
- **Evidence:** api/src/users/users.controller.ts (staff only, students as a count), api/src/users/public-user.ts, api/src/grades/ (reviewers only as numbers), api/test/results-api.spec.ts, api/test/admin-api.spec.ts.
- **Source:** user · confidence high
- **Confirmed:** 2026-11-26

## D-016 · Submissions: link and cleaned PDF or DOCX file
- **Status:** superseded-by D-032
- **Date:** 2026-11-17
- **Rule:** A submission has a link and a PDF or DOCX file of at most 10 MB, both required, plus an optional description. Any member who joined a team that the assignment evaluates may submit, once per team, and may replace it until the submission deadline; after it the server refuses. The file is cleaned of author metadata before it is stored in a private Supabase Storage bucket, and is only served through the server under a generic name. The student is warned not to put their name in the link; the link is not checked further, since the account already has a verified university email (D-010).
- **Why:** The brief requires link plus file, metadata cleaning and a proxy. Only PDF and DOCX can be cleaned reliably.
- **Rejected:** Real Google Forms, which would take answers out of the app's control (D-014). Refusing links that contain a member's name.
- **Evidence:** api/src/submissions/ (`clean-pdf.ts`, `clean-docx.ts`, `file-store.ts`), api/prisma/migrations/20261117220000_submission_files/, api/test/clean-files.spec.ts, api/test/submissions-api.spec.ts.
- **Source:** user · confidence high

## D-022 · Reviewer allocation, withdrawals and late arrivals
- **Status:** approved
- **Date:** 2026-11-24
- **Rule:** When the submission deadline passes, the system allocates once. The reviewers are the members of the class's teams plus those who joined through the assignment's link, minus those who withdrew. Only submissions of evaluated teams are allocated. Every submission gets k different reviewers, never from its own team, which a database trigger also enforces. Loads are balanced and at most k+1, a limit relaxed only when a submission would otherwise get fewer than k. A submission with fewer than k eligible reviewers gets all of them. The order is random. A student may withdraw from an assignment until the review deadline, and the withdrawal is final. Their unstarted (`ALLOCATED`) reviews move one by one to the eligible reviewer with the lowest load. Their submitted reviews and their team's submission stay. Someone who joins after allocation takes unstarted reviews from the busiest reviewers, up to the average load. Nothing else moves. Joining the team whose submission you are allocated moves that review to someone else; if you already submitted it, the join is refused with 409. Reviewers who joined only through the link see the assignment in their list.
- **Why:** The brief requires automatic allocation with k reviews per submission, at most k+1 per reviewer, no review of your own team, balanced loads, and handling of late arrivals and withdrawals without redoing everything. The user chose the job trigger, student withdrawal, taking from the busiest and relaxing the k+1 limit.
- **Rejected:** A professor's allocation button. The professor removing a team as the withdrawal. Late arrivals getting nothing. Allocating nothing when reviewers are short.
- **Evidence:** api/src/allocation/allocate.ts, api/src/allocation/allocation.service.ts, api/prisma/migrations/20261124082026_allocation/, api/test/allocate.spec.ts, api/test/allocation-api.spec.ts.
- **Source:** user · confidence high
- **Confirmed:** 2026-11-24

## D-023 · A review is sent once, complete and final
- **Status:** approved
- **Date:** 2026-11-24
- **Rule:** A reviewer sends a review once, with a level and at least 20 characters of feedback (after trimming) for every criterion of the assignment's rubric; after that it cannot change. The database enforces the feedback length, that the level belongs to the criterion and the criterion to the rubric, that a review is `SUBMITTED` only with every criterion scored, and that a sent review never changes. Only its reviewer sends it, between allocation and the review deadline. The reviewer sees the submission's link, description and cleaned file and the rubric, never the team. The author's team sees received reviews only on the results page, after the review deadline.
- **Why:** The brief requires double-blind reviews with text feedback for every criterion. The user chose final-on-send, the 20-character minimum and the author view on the results page.
- **Rejected:** Drafts saved on the server. Changing a sent review until the deadline. Authors seeing reviews as they arrive.
- **Evidence:** api/src/reviews/, api/prisma/migrations/20261124140000_reviews/, web/src/pages/ReviewPage.tsx, api/test/reviews-api.spec.ts.
- **Source:** user · confidence high
- **Confirmed:** 2026-11-25

## D-032 · Submissions: link and a cleaned PDF, DOCX, PPTX, ODT, ODP or ZIP file
- **Status:** approved
- **Date:** 2026-11-26
- **Rule:** A submission has a link and a file, both required, plus an optional description. Any member who joined a team that the assignment evaluates may submit, once per team, and may replace it until the submission deadline; after it the server refuses. The file is PDF, DOCX, PPTX, ODT, ODP or a ZIP, judged by its bytes, never its name; at most 10 MB, a ZIP at most 20 MB. It is cleaned before it is stored in a private Supabase Storage bucket and is only served through the server under a generic name. PDF, DOCX and PPTX lose their document properties and the authors of comments, annotations and tracked changes; the DOCX and PPTX parts that held names (`word/people.xml`, custom properties) are removed together with the relationships and content-type entries that point to them, so Office opens the file without a repair prompt. ODT and ODP lose `meta.xml`'s authors and user-defined properties, and the authors and initials of comments. A ZIP is refused over 200 MB unpacked or 20,000 entries, the documents inside it counted within the same 200 MB; a DOCX, PPTX, ODT or ODP on its own is refused over 200 MB unpacked too. Entry names written with `\` are read as `/`. Otherwise a ZIP loses, at any depth, `.git/`, `.svn/`, `__MACOSX/`, `.idea/`, `.vscode/`, `node_modules/`, `vendor/`, `dist/`, `build/`, `.DS_Store` and `Thumbs.db`, the `author`, `contributors`, `maintainers`, `authors`, `repository`, `homepage`, `bugs`, `funding` and `support` of `package.json` and `composer.json`, and the authors of every PDF, DOCX, PPTX, ODT or ODP inside it; every entry gets the date 1 January 1980 and a single top folder is renamed `proiect/`. A ZIP inside the ZIP is left as it is. Names written in code, comments or README text stay: the student is warned to remove them. The student is also warned not to put their name in the link.
- **Why:** The user wants presentations, LibreOffice documents and source code accepted, each cleaned as far as it can be reliably.
- **Rejected:** Removing names from code text automatically (not reliable); cleaning a ZIP inside a ZIP; RAR and 7z; images; a new ZIP library (fflate already does it); refusing a ZIP that holds `.git/` or `node_modules/` instead of removing them.
- **Evidence:** api/src/submissions/file-type.ts, api/src/submissions/clean-office.ts, api/src/submissions/clean-opendocument.ts, api/src/submissions/clean-zip.ts, api/src/submissions/submissions.service.ts, api/prisma/migrations/20261126120000_more_file_types/, web/src/pages/MyAssignmentsPage.tsx, api/test/clean-files.spec.ts, api/test/submissions-api.spec.ts. api/src/submissions/unzip-limited.ts holds the shared unpack limit.
- **Source:** user · confidence high
- **Confirmed:** 2026-11-26

