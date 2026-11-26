# Decisions — Grading, results, disputes and export

> Part of [DECISIONS.md](../DECISIONS.md), whose index lists every live decision. Status `approved` means obey.

## D-025 · Calibration, reliability and grade aggregation
- **Status:** approved
- **Date:** 2026-11-25
- **Rule:** After allocation and until the review deadline, the professor who created an assignment may calibrate any submission they choose with one review, sent once and complete like a student's (D-023), marked `is_calibration`; a database trigger allows `is_calibration` exactly when the reviewer is that professor. Calibration reviews do not count in allocation loads, review counts or notifications. A reviewer's reliability is measured per assignment: for every criterion of every review they sent, the deviation is |their level − reference| ÷ (the criterion's highest level − its lowest level), where the reference is the professor's level on a calibrated submission and otherwise the median of the other peer reviewers' levels; the deviations are averaged with the criterion weights. Reliability = max(0.2, 1 − deviation); a reviewer is flagged when 1 − deviation < 0.6; with nothing to compare against, reliability is 1 and the reviewer is shown as not measured. A submission's grade: for each criterion, the reliability-weighted mean of the sent levels, the professor counted at reliability 1, scaled to 0–1 between the criterion's lowest and highest level; grade = 1 + 9 × the weight-averaged result, rounded to 2 decimals; no sent review means no grade. Grades are computed on read by a pure function, never stored, shown to the professor from allocation and marked provisional until the review deadline. Reviewers appear only as numbers (D-014).
- **Why:** The brief requires professor calibration, reliability from calibration and peer medians, and unreliable reviewers counting less, explained rather than hidden. The user answered Q-005 and chose the professor picking submissions, the professor's score counting at reliability 1, the 1–10 scale, the 0.2 floor and the 0.6 flag.
- **Rejected:** The system picking N submissions at random; the professor's score replacing the grade or not counting; a weighted median; a trimmed mean; a percentage or rubric-point scale; a separate calibration table; grades stored by the job.
- **Evidence:** api/src/grades/grade.ts, api/src/grades/grading.ts, api/src/grades/grades.service.ts, api/prisma/migrations/20261125120000_calibration/, web/src/pages/CalibrationPage.tsx, api/test/grade.spec.ts, api/test/grades-api.spec.ts.
- **Source:** user · confidence high
- **Confirmed:** 2026-11-25

## D-026 · Results page that explains the grade
- **Status:** approved
- **Date:** 2026-11-25
- **Rule:** A student's menu has "Rezultate", listing the assignments where their team is evaluated and has a submission, also before the review deadline as "available after <date>" without a grade. After the review deadline a team member, including one who withdrew as a reviewer, opens the full results: the grade, each reviewer's weight, and for every criterion each reviewer's level and feedback, the reliability-weighted mean and its scaled value, computed by the same pure function as the professor's grades (D-025). Reviewers are numbered in the order of their review's random id (D-014); the professor's calibration review is one of them, unlabelled, with weight 1. The professor who created the assignment opens the same view for any team after allocation, marked provisional before the review deadline. Results are not stored.
- **Why:** The brief requires a results page that explains how the grade came out, with the algorithm and weights shown, not hidden. The user chose the full breakdown, the hidden calibration, the professor's view and the menu item.
- **Rejected:** Labelling the professor's calibration; showing only a formula text without the weights; authors only; a link in the student's assignments instead of a menu item; storing results.
- **Evidence:** api/src/grades/results.service.ts, api/src/grades/results.controller.ts, web/src/pages/ResultsPage.tsx, api/test/results-api.spec.ts.
- **Source:** user · confidence high
- **Confirmed:** 2026-11-25

## D-027 · Disputes per criterion, decided by the professor
- **Status:** approved
- **Date:** 2026-11-25
- **Rule:** Between the review deadline and the dispute deadline, enforced on the server, any member of the reviewed team, including one who withdrew as a reviewer, disputes one criterion of a received review from the results page, once per review and criterion, with an argument of at least 20 characters after trimming. The assignment's professor decides at any time: upheld with a new level of that criterion, or rejected, always with a decision of at least 20 characters; a decided dispute never changes. The database enforces the uniqueness, the lengths, the level's criterion, the filer's team and the final decision. An upheld level replaces the reviewer's level in reliability and in the grade (D-025); the review itself and its original level stay. The results page shows each dispute's argument, decision, new level and dates, which is the history. Nobody is told when a dispute is filed; the professor sees open disputes from the active rubric page. Reviewers are never told and never identified, the professor's calibration included (D-014); the professor never sees which member filed.
- **Why:** The brief requires disputes with an argument, decided by the professor, with history. The user chose per-criterion disputes, a new level set by the professor, once per item, and notifying the team of decisions.
- **Rejected:** Excluding the whole review, or ignoring the reviewer's level, when upheld; disputing a whole review; unlimited disputes on one item; notifying the reviewer; a separate history table.
- **Evidence:** api/src/grades/disputes.service.ts, api/src/grades/disputes.controller.ts, api/prisma/migrations/20261125180000_disputes/, web/src/pages/DisputesPage.tsx, api/test/disputes-api.spec.ts.
- **Source:** user · confidence high
- **Confirmed:** 2026-11-26

## D-028 · Reviewer grade from accuracy and the professor's feedback rating
- **Status:** approved
- **Date:** 2026-11-25
- **Rule:** Every student allocated peer reviews on an assignment gets a reviewer grade, computed on read by a pure function, never stored. For each sent peer review, accuracy = 1 − the weight-averaged |level − reference| ÷ (highest − lowest level) of its criteria, with the D-025 reference; for a criterion with an upheld dispute (D-027) the new level is the reference and the reviewer's original level is measured. The assignment's professor may rate the feedback of any sent peer review they choose, never a calibration review, 1 to 5, from allocation until the dispute deadline, and may change the rating in that window; rating is optional. Quality = (rating − 1) ÷ 4. Review grade = 1 + 9 × (0.7 × accuracy + 0.3 × quality), or 1 + 9 × accuracy when unrated, or 1 + 9 × quality when rated with no reference; a review with no reference and no rating is left out. After the review deadline each review still unsent counts 1, except a withdrawn student's review that could not be moved (D-022). Reviewer grade = the mean of the review grades, 1–10, 2 decimals; none counted means no grade. The student sees only their own, with each of their reviews explained, on My assignments after the dispute deadline, provisional while disputes are open. The professor sees reviewer grades only by reviewer number (D-014). The database enforces the rating range, a sent non-calibration review and the assignment's professor as the rater.
- **Why:** The brief requires a reviewer grade from calibration and feedback quality. The user chose the professor's rating on any reviews, the 1–5 scale, the 70/30 split, unsent reviews at the lowest grade, the student seeing only their own after the dispute deadline, and the rating window from allocation.
- **Rejected:** Ratings by the reviewed team; an automatic quality proxy; accuracy only; rating every review or only calibrated ones; scaling by the share sent; ignoring unsent reviews; the professor seeing reviewer grades by email; columns on `reviews`; extending the Rezultate list (D-026).
- **Evidence:** api/src/grades/grade.ts (`reviewerGrades`), api/src/grades/grading.ts (`loadReviewerGrades`), api/prisma/migrations/20261125220000_review_ratings/, api/test/reviewer-grades-api.spec.ts
- **Source:** user · confidence high
- **Confirmed:** 2026-11-25

## D-029 · CSV export of an assignment's results
- **Status:** approved
- **Date:** 2026-11-26
- **Rule:** From allocation on, the professor who created an assignment downloads two files from the assignment's page, computed on read by the same functions as its grades (D-025, D-028) and never stored. `note.csv` has one row per evaluated team with a submission: reviews received, calibrated, grade, disputes open, upheld and rejected (D-027) and status. `evaluatori.csv` has one row per reviewer number (D-014): reliability, flagged, measured, reviews sent, reviewer grade and status. The status is "provizorie" before the review deadline and "finală" after. Format: `;` separator, decimal comma with 2 decimals, UTF-8 with BOM, CRLF line endings, RFC 4180 quoting, yes/no as "da"/"nu", an empty cell for no value; a cell starting with `=`, `+`, `-`, `@`, a tab or a carriage return gets a leading `'`. Before allocation the export answers 409.
- **Why:** The brief requires "Export CSV al tuturor rezultatelor". The user chose two files matching the grades page, the format Excel set to Romanian opens directly, availability from allocation like the grades page, and one export per assignment.
- **Rejected:** A third, detailed file per review and criterion; one detailed file; `,` with decimal points; availability only after the review or dispute deadline; one export across all the professor's assignments; a ZIP of both files.
- **Evidence:** api/src/grades/csv.ts, api/src/grades/grades.service.ts (`exportTeams`, `exportReviewers`), api/src/grades/grades.controller.ts, web/src/pages/ActiveRubricDetailPage.tsx, api/test/csv.spec.ts, api/test/export-api.spec.ts.
- **Source:** user · confidence high
- **Confirmed:** 2026-11-26
