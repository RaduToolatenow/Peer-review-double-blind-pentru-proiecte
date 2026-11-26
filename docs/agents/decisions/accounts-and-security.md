# Decisions — Accounts and security

> Part of [DECISIONS.md](../DECISIONS.md), whose index lists every live decision. Status `approved` means obey.

## D-005 · Sessions with express-session and connect-pg-simple
- **Status:** approved
- **Date:** 2026-11-08
- **Rule:** D-010 sessions use express-session, stored in the PostgreSQL `session` table through connect-pg-simple.
- **Why:** Mature libraries avoid custom security code, and sessions survive a server restart.
- **Rejected:** A hand-written session store.
- **Evidence:** api/src/configure-app.ts
- **Source:** user · confidence high
- **Confirmed:** 2026-11-17

## D-010 · Self sign-up through the assignment link with a verified university email
- **Status:** approved
- **Date:** 2026-11-17
- **Rule:** Login keeps server-side sessions in an httpOnly cookie and argon2 hashes (D-005). Anyone with an assignment's link may create an account, but only with an `@ulbsibiu.ro` email, and the account is active only after the email is verified. The person becomes a reviewer for that assignment whether or not they submitted. The system allocates which submissions they review; they never choose. One email is one account, and an account reviews a submission at most once.
- **Why:** The user wants anyone at the university with the link to be able to review, without the professor's list. A verified email stops one person from reviewing the same project twice under several accounts.
- **Rejected:** Invitation-only accounts from the professor's list (D-003). Reviewers choosing which projects to open, which would break the allocation constraints in the brief.
- **Evidence:** api/src/auth/account.service.ts, api/src/auth/join.controller.ts, api/src/auth/account.dto.ts (`UNIVERSITY_EMAIL`), api/prisma/schema.prisma (`users.email` unique, `reviews` unique on submission and reviewer), api/test/register.spec.ts.
- **Source:** user · confidence high
- **Confirmed:** 2026-11-22

## D-017 · Login attempt limit and equal timing
- **Status:** approved
- **Date:** 2026-11-19
- **Rule:** Failed logins are stored in PostgreSQL (`login_failures`). 5 failures for the same email and IP in 15 minutes, or 50 for the same IP, block login with 429 until 15 minutes after the latest failure, even with the correct password. An unknown email runs argon2 verify on a fixed hash and counts as a failure, so neither the time nor the response reveals which emails exist. A successful login deletes the failures for that email and IP.
- **Why:** The login had no limit. Counting per email and IP stops a stranger from locking a student out from another IP; the IP cap catches one address trying many emails. Storing in PostgreSQL keeps counters across restarts and the deploy on every push (D-009).
- **Rejected:** Counting by email only (anyone could lock an account), by IP only (students share the university IP), counters in server memory, and `@nestjs/throttler`.
- **Evidence:** api/src/auth/auth.service.ts, api/src/auth/password.ts, api/prisma/migrations/20261119110137_login_failures/, api/test/auth.spec.ts. First built with the wrong IP and reverted on 2026-11-19; rebuilt on D-018.
- **Source:** user · confidence high
- **Confirmed:** 2026-11-22

## D-018 · Visitor IP behind Cloudflare and Render
- **Status:** approved
- **Date:** 2026-11-19
- **Rule:** In production the visitor IP comes from the source the logged evidence supports, chosen in this order: an exact `trust proxy` hop count, when `X-Forwarded-For` always has the same number of entries with the real public IP at the same position from the right; otherwise `CF-Connecting-IP`, when it is always present, public and never takes a forged value; otherwise nothing is chosen and the user decides. `trust proxy = true` is never used. Logs never contain IP addresses. Chosen on 2026-11-19: `trust proxy` = 3 (rule 1).
- **Why:** `trust proxy = 1` gave Render's private addresses (10.x), which broke D-017. Render keeps a client-sent `X-Forwarded-For` and appends to it, so its leftmost entry can be faked.
- **Rejected:** `trust proxy = true`, which trusts the forgeable leftmost entry.
- **Evidence:** api/src/configure-app.ts. The diagnostic log of 2026-11-19 showed, on every request, `X-Forwarded-For` ending with public visitor, public Cloudflare, private Render; `CF-Connecting-IP` equal to the 3rd entry from the right; a forged `X-Forwarded-For` entry added on the left; a forged `True-Client-IP` overwritten; a forged `CF-Connecting-IP` refused by Cloudflare (403, error 1000).
- **Source:** user · confidence high
- **Confirmed:** 2026-11-22

## D-020 · Email, sign-up, confirmation and password reset
- **Status:** approved
- **Date:** 2026-11-22
- **Rule:** Email goes out over SMTP, through Brevo in production. Sign-up asks only for an `@ulbsibiu.ro` email and a password of at least 10 characters, no name. An account is confirmed through an emailed link valid 24 hours; a password is reset through an emailed link valid one hour. Both tokens are stored only as a hash and work once. Sign-up, resending the confirmation and password reset answer the same whatever the address, so they never reveal which addresses have accounts. At most 3 emails an hour per address and 20 per IP. An unconfirmed account cannot log in. A password reset closes the account's other sessions. The reviewers of an assignment are the members of its class's teams plus anyone who joined through the assignment's link.
- **Why:** D-010 needs a verified university email. Brevo sends from a confirmed address without owning a domain, which Resend's free plan cannot. Hashed single-use tokens and equal answers protect accounts and the list of students.
- **Rejected:** Resend (free plan sends only to the account owner without a verified domain); Gmail SMTP (sends from a personal account, which Google may throttle); a 6-digit code instead of a link; asking for a name.
- **Evidence:** api/src/auth/account.service.ts, api/src/mail/, api/prisma/migrations/20261122120000_sign_up_and_email/, web/src/pages/AccountPages.tsx, api/test/register.spec.ts, api/test/password-reset.spec.ts.
- **Source:** user · confidence high
- **Confirmed:** 2026-11-22

## D-030 · New passwords checked against common ones
- **Status:** approved
- **Date:** 2026-11-26
- **Rule:** At sign-up and password reset the server refuses with 400, ignoring case, a password on the common-password list, a password of one repeated character, or a password that contains the email's name part or one of its pieces, split on `.`, `_` and `-`, of at least 4 characters. The list is the NCSC 100k list from SecLists (MIT licence), cut to entries of at least 10 characters, lowercased and kept in the repo. The answer depends only on the password and the address typed, so D-020's equal answers stay. Existing passwords are not checked. The sign-up and reset forms show the rule under the password field.
- **Why:** Colleagues' feedback asked for a password security check (Q-012). The user chose a local list, which needs no outside service and sends no data out, new passwords only, and a hint on the forms.
- **Rejected:** Have I Been Pwned (an outside service on every sign-up); composition rules (NIST advises against them); a zxcvbn strength score (a new dependency); checking passwords at login.
- **Evidence:** api/src/auth/password-policy.ts, api/src/auth/common-passwords.ts, api/src/auth/account.service.ts, web/src/pages/AccountPages.tsx, api/test/password-policy.spec.ts, api/test/register.spec.ts, api/test/password-reset.spec.ts.
- **Source:** user · colleagues' feedback · confidence high
- **Confirmed:** 2026-11-26

## D-031 · Request limit against refresh spam
- **Status:** approved
- **Date:** 2026-11-26
- **Rule:** Every `/api` request except `/api/health` counts per signed-in account, or per IP (D-018) without a session, in fixed one-minute windows kept in server memory. Over 120 requests a minute the API answers 429 with "Prea multe cereri. Așteaptă un minut și încearcă din nou." and `Retry-After`, until the window ends. Counters are lost on restart, which is acceptable for a one-minute window. The login limit stays as D-017.
- **Why:** Colleagues' feedback: anyone could hold F5 on any page (Q-013). Counting per account keeps students behind the shared university IP from blocking each other; memory avoids a database write on every request on the free plan.
- **Rejected:** A Cloudflare rule (per IP only); counters in PostgreSQL (a write per request); `@nestjs/throttler`; 60 or 300 requests a minute.
- **Evidence:** api/src/rate-limit.ts, api/src/configure-app.ts, api/test/rate-limit.spec.ts, api/test/rate-limit-api.spec.ts.
- **Source:** user · colleagues' feedback · confidence high
- **Confirmed:** 2026-11-26

