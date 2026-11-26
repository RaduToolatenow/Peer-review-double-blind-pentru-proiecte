# API

Toate rutele sunt sub `/api` și folosesc JSON, în afară de exporturile CSV (D-029). Sesiunea este un cookie `sid`, `httpOnly`.

Orice rută în afară de `/api/health` poate răspunde `429` cu `{ statusCode: 429, message: "Prea multe cereri. Așteaptă un minut și încearcă din nou." }` și antetul `Retry-After` (secunde): peste 120 de cereri pe minut de la același cont autentificat sau, fără sesiune, de la același IP (D-031).

## `GET /api/health`

Disponibil fără autentificare.

```json
{ "status": "ok" }
```

## `POST /api/auth/login`

Cerere:

```json
{ "email": "student@peer-review.test", "password": "<parola>" }
```

| Cod | Situație | Corp |
|---|---|---|
| 200 | Autentificat; setează cookie-ul `sid` | `{ "id": "<uuid>", "email": "student@peer-review.test", "fullName": "Cont test student", "role": "STUDENT" }` |
| 400 | Date invalide | `{ "statusCode": 400, "message": ["Introdu o adresă de email validă."], "error": "Bad Request" }` |
| 401 | Email sau parolă greșite | `{ "statusCode": 401, "message": "Email sau parolă greșite.", "error": "Unauthorized" }` |
| 429 | Prea multe încercări eșuate (D-017) | `{ "statusCode": 429, "message": "Prea multe încercări nereușite. Încearcă din nou peste 15 minute.", "error": "Too Many Requests" }` |

Limita de încercări (D-017): 5 eșecuri pentru același email și același IP în 15 minute, sau 50 pentru același IP, blochează autentificarea până la 15 minute după ultimul eșec, chiar și cu parola corectă. Un email inexistent se numără la fel și durează cât o parolă greșită. O autentificare reușită șterge eșecurile pentru acel email și IP.

## `POST /api/auth/logout`

Necesită sesiune. Răspunde `204` fără corp și distruge sesiunea. Fără sesiune răspunde `401`.

## `GET /api/auth/me`

Necesită sesiune.

| Cod | Corp |
|---|---|
| 200 | utilizatorul curent, în forma de la login |
| 401 | `{ "statusCode": 401, "message": "Autentifică-te pentru a continua.", "error": "Unauthorized" }` |

## `GET /api/users`

Necesită rolul `ADMIN`. Emailurile studenților nu se afișează niciodată (D-014).

| Cod | Corp |
|---|---|
| 200 | `{ "staff": [<profesori și admini, în forma de la login>], "studentCount": 37 }` |
| 401 | fără sesiune |
| 403 | `{ "statusCode": 403, "message": "Nu ai acces la această pagină.", "error": "Forbidden" }` |

## Reguli comune pentru rutele de mai jos

- Rutele pentru grile, clase și grile active cer rolul `PROFESSOR` sau `ADMIN`. Fiecare vede și modifică **doar ce a creat el** (D-015); orice altceva răspunde `404`.
- Erorile de validare răspund `400` cu un mesaj în română; conflictele cu reguli (grilă trimisă, termen trecut, nume duplicat) răspund `409`.
- Datele sunt ISO 8601 (de exemplu `2026-12-08T21:59:00.000Z`). Interfața le introduce și le afișează în ora României.
- **Niciun răspuns nu conține cine a evaluat sau emailul unui student** (D-014). Se întorc doar numere.

## Schițe de grile (D-011, D-013)

| Rută | Ce face | Coduri |
|---|---|---|
| `GET /api/rubrics` | Schițele mele: `[{ id, title, status: "draft", criteriaCount, createdAt }]` | 200 |
| `POST /api/rubrics` | Creează o schiță | 201, 400 |
| `GET /api/rubrics/:id` | O grilă a mea, cu criterii și niveluri | 200, 404 |
| `PUT /api/rubrics/:id` | Înlocuiește titlul și criteriile | 200, 400, 404, 409 dacă grila a fost trimisă |
| `DELETE /api/rubrics/:id` | Șterge o schiță | 204, 404, 409 dacă grila a fost trimisă |
| `POST /api/rubrics/:id/copy` | Copie nouă, ca schiță: „Copie — <titlu>” | 201, 404 |
| `POST /api/rubrics/:id/send` | Trimite grila unei clase și o blochează; corpul e mai jos | 201, 400, 404, 409 dacă e arhivată |
| `POST /api/rubrics/:id/archive` | Arhivează o grilă trimisă, la 2 zile după ultimul termen de evaluare | 200, 404, 409 cu data de la care se poate |

Corpul pentru creare și înlocuire (0–100 de criterii; fiecare criteriu cu pondere 1–100 și 2–10 niveluri cu note întregi diferite între 0 și 100):

```json
{
  "title": "Grilă proiect web",
  "criteria": [
    { "title": "Calitatea codului", "weight": 2, "levels": [{ "score": 1, "descriptor": "Slab" }, { "score": 2, "descriptor": "Bun" }] }
  ]
}
```

Corpul pentru trimitere (o grilă trimisă trebuie să aibă cel puțin un criteriu; termenele sunt în viitor și în ordine):

```json
{
  "classId": "<uuid>", "title": "Proiect P1", "description": "opțional", "k": 3,
  "submissionDeadline": "...", "reviewDeadline": "...", "disputeDeadline": "...",
  "appliesTo": "ALL | SELECTED", "teamIds": ["<uuid>"]
}
```

## Grile active (D-013)

| Rută | Ce face | Coduri |
|---|---|---|
| `GET /api/assignments` | Grilele mele trimise, fără cele arhivate; `?archived=true` le include | 200 |
| `GET /api/assignments/:id` | O grilă activă cu grila completă, echipele clasei și `archivableFrom` | 200, 404 |
| `PATCH /api/assignments/:id` | Schimbă titlul, descrierea sau un termen care nu a trecut | 200, 400, 404, 409 dacă termenul a trecut |

Fiecare grilă activă are `phase` (`submission`, `review`, `disputes`, `closed`), `evaluatedTeamCount`, `reviewsSubmitted` și `reviewsExpected`. Fiecare echipă din detaliu are `evaluated`, `submitted` și `reviewsReceived`.

## Cont, confirmare și parolă (D-010, D-020)

Răspunsurile nu spun niciodată dacă o adresă are cont. Cel mult 3 emailuri pe oră pentru aceeași adresă și 20 de pe același IP (`429`).

| Rută | Corp | Răspuns |
|---|---|---|
| `POST /api/auth/register` | `{ email @ulbsibiu.ro, password ≥ 10, joinCode? }` | `202` „Ți-am trimis un email…”; `400`, și pentru o parolă des folosită, dintr-un singur caracter repetat sau care conține numele din adresă (D-030); `404` cod de temă necunoscut; `429` |
| `POST /api/auth/verify` | `{ token }` din linkul `/confirmare/<token>` (24 h, o singură dată) | `200 { message, assignmentTitle }`; `400` link invalid |
| `POST /api/auth/resend-verification` | `{ email }` | `202`; `429` |
| `POST /api/auth/forgot-password` | `{ email }` | `202`; `429` |
| `POST /api/auth/reset-password` | `{ token, password ≥ 10 }` din `/parola-noua/<token>` (1 h, o singură dată) | `200`; închide toate sesiunile contului; `400`, și pentru o parolă slabă (D-030), caz în care linkul rămâne valabil |
| `GET /api/join/:code` | — (public) | `200 { assignmentTitle, className }`; `404` |
| `POST /api/join/:code` | — (`STUDENT` logat) | `200 { assignmentTitle }`: devine evaluator la temă |

`POST /api/auth/login` răspunde `403` pentru un cont neconfirmat, doar după parola corectă. Detaliul unei grile active are `joinUrl`.

## Clase și echipe (D-012)

| Rută | Ce face | Coduri |
|---|---|---|
| `GET /api/classes` | Clasele mele: `[{ id, name, teamCount, assignmentCount }]` | 200 |
| `POST /api/classes` | `{ "name": "..." }` | 201, 400 |
| `GET /api/classes/:id` | Clasa cu echipele: `{ id, name, memberNames, joinCode, joinedCount }` | 200, 404 |
| `PATCH /api/classes/:id` | Redenumește | 200, 400, 404 |
| `DELETE /api/classes/:id` | Șterge o clasă căreia nu i s-a trimis o grilă | 204, 404, 409 |
| `POST /api/classes/:id/teams` | `{ "name": "...", "memberNames": "text liber" }`; codul se generează | 201, 400, 404, 409 nume duplicat |
| `PATCH /api/teams/:id` | Schimbă numele sau membrii | 200, 400, 404, 409 |
| `DELETE /api/teams/:id` | Șterge o echipă fără predări | 204, 404, 409 |
| `POST /api/teams/:id/code` | Cod nou; cel vechi nu mai funcționează | 200, 404 |
| `POST /api/teams/join` | Doar `STUDENT`: `{ "code": "K7P-4QX" }` → `{ className, teamName }`; o singură echipă per clasă | 200, 403, 404, 409 |

`joinedCount` spune câte conturi au intrat în echipă, nu care.

## Predări (D-016)

| Rută | Cine | Ce face | Coduri |
|---|---|---|---|
| `GET /api/my/assignments` | `STUDENT` | Temele claselor mele și cele în care am intrat prin linkul temei, cu `teamName` (`null` când sunt doar evaluator: prin link sau într-o echipă pe care grila nu o evaluează, Q-011), termene, `phase`, `submission` (sau `null`), `withdrawn`, `canWithdraw` `reviews: [{ id, number, status }]`, evaluările mele numerotate (D-023), și `reviewerGrade` (D-028): după termenul de contestații `{ grade, provisional, reviews: [{ number, sent, accuracy, rating, grade, counted }] }`, altfel `null`; `provisional` cât timp tema mai are contestații deschise | 200 |
| `PUT /api/my/assignments/:id/submission` | `STUDENT` | `multipart/form-data`: `link` (http/https), `description` (opțional), `file` (PDF sau DOCX, cel mult 10 MB). Prima predare sau înlocuirea ei, doar până la termenul de predare | 200, 400, 403 echipa nu e evaluată, 404, 409 termen trecut, 413 fișier prea mare |
| `POST /api/my/assignments/:id/withdraw` | `STUDENT`, evaluator al temei | Retragere definitivă din evaluare (D-022): evaluările netrimise trec la alți colegi. A doua oară nu schimbă nimic. Răspunde `{ withdrawn: true }` | 200, 404, 409 termenul de evaluare a trecut |
| `GET /api/submissions/:id/file` | profesorul temei, membrii echipei, evaluatorii predării (D-023) | Fișierul curățat de metadate, ca atașament `predare-<cod>.pdf` sau `.docx` | 200, 404 |

Predarea are forma `{ id, link, description, fileType, fileUrl, submittedAt, updatedAt }` și nu spune cine a predat. Detaliul unei grile active conține la fiecare echipă `submissionId`, `link`, `description` și `fileUrl`.

## Evaluări (D-023)

| Rută | Cine | Ce face | Coduri |
|---|---|---|---|
| `GET /api/my/reviews/:id` | `STUDENT`, evaluatorul ei | `{ id, number, assignmentTitle, reviewDeadline, status, submittedAt, canSend, submission, criteria: [{ id, position, title, weight, levels: [{ id, score, descriptor }] }], scores: [{ criterionId, levelId, feedback }] }` | 200, 404 |
| `POST /api/my/reviews/:id` | `STUDENT`, evaluatorul ei | `{ scores: [{ criterionId, levelId, feedback }] }`, câte unul pentru fiecare criteriu, feedback de cel puțin 20 de caractere. Se trimite o singură dată și nu se mai schimbă. Răspunde ca `GET` | 200, 400 incompletă sau nivel greșit, 404, 409 trimisă deja sau termenul de evaluare a trecut |

Evaluarea nu spune niciodată echipa sau autorul predării; `submission` are forma de mai sus. O evaluare mutată la alt coleg (D-022) răspunde 404 fostului evaluator.

## Calibrare și note (D-025)

| Rută | Cine | Ce face | Coduri |
|---|---|---|---|
| `GET /api/assignments/:id/submissions/:submissionId/calibration` | `PROFESSOR`, `ADMIN`, autorul temei | `{ assignmentId, assignmentTitle, teamName, reviewDeadline, status, submittedAt, canSend, submission, criteria, scores }`, ca o evaluare, plus numele echipei | 200, 404 |
| `POST /api/assignments/:id/submissions/:submissionId/calibration` | `PROFESSOR`, `ADMIN`, autorul temei | Evaluarea de calibrare, cu același corp ca `POST /api/my/reviews/:id`, trimisă o singură dată, între alocare și termenul de evaluare. Răspunde ca `GET` | 200, 400 incompletă, 404, 409 înainte de alocare, termen trecut sau trimisă deja |
| `GET /api/assignments/:id/grades` | `PROFESSOR`, `ADMIN`, autorul temei | `{ allocated, provisional, submissions: [{ teamId, teamName, grade, reviewsCounted, calibrated, disputes: { open, upheld, rejected } }], reviewers: [{ number, reliability, flagged, measured, reviewsSent, reviewerGrade }] }`. `reviewers` are toți evaluatorii cu evaluări alocate, și pe cei care n-au trimis nimic; `reviewerGrade` pe 1–10 sau `null` (D-028). Înainte de alocare listele sunt goale; `provisional` până la termenul de evaluare; `grade` pe 1–10 cu 2 zecimale sau `null` fără evaluări | 200, 404 |
| `GET /api/assignments/:id/export/note.csv` | `PROFESSOR`, `ADMIN`, autorul temei | `text/csv`, descărcat ca `note.csv`: un rând per echipă evaluată cu predare (echipa, evaluări primite, calibrată, nota, contestații deschise, admise, respinse, stare `provizorie`/`finală`), din aceleași date ca `/grades`. Separator `;`, zecimale cu virgulă, UTF-8 cu BOM, CRLF; o celulă care începe cu `=`, `+`, `-` sau `@` primește `'` în față (D-029). 409 înainte de alocare | 200, 404, 409 |
| `GET /api/assignments/:id/export/evaluatori.csv` | `PROFESSOR`, `ADMIN`, autorul temei | `text/csv`, descărcat ca `evaluatori.csv`: un rând per număr de evaluator (fiabilitate, semnalat, măsurată, evaluări trimise, nota de evaluator, stare), în același format (D-029) | 200, 404, 409 |

Evaluatorii apar doar ca numere, în ordinea id-urilor lor aleatoare (D-014). Evaluarea de calibrare nu intră în alocare, în numărul de evaluări primite și nici în notificări.

## Rezultate (D-026)

| Rută | Cine | Ce face | Coduri |
|---|---|---|---|
| `GET /api/my/results` | `STUDENT` | Temele la care echipa mea e evaluată și a predat: `[{ assignmentId, title, className, teamName, reviewDeadline, available, grade }]`. Înainte de termenul de evaluare `available: false` și `grade: null` | 200 |
| `GET /api/my/results/:id` | `STUDENT`, membru al echipei | Rezultatele, doar după termenul de evaluare (forma de mai jos) | 200, 404 fără echipă evaluată sau predare, 409 înainte de termen |
| `GET /api/assignments/:id/teams/:teamId/results` | `PROFESSOR`, `ADMIN`, autorul temei | Aceleași rezultate pentru o echipă, oricând după alocare, cu `provisional` până la termenul de evaluare | 200, 404, 409 înainte de alocare |

Forma: `{ assignmentId, title, teamName, reviewDeadline, provisional, grade, reviewers: [{ number, weight }], criteria: [{ position, title, weight, lowest, highest, mean, scaled, levels: [{ number, score, descriptor, feedback }] }] }`. Evaluatorii sunt numerotați în ordinea id-urilor aleatoare ale evaluărilor (PATTERN-005); calibrarea profesorului e unul dintre ei, fără etichetă, cu ponderea 1. `mean` și `scaled` sunt `null` fără evaluări.

## Contestații (D-027)

| Rută | Cine | Ce face | Coduri |
|---|---|---|---|
| `POST /api/my/results/:id/disputes` | `STUDENT`, membru al echipei | `{ reviewer, criterion, argument }`: numărul evaluatorului de pe pagina de rezultate și poziția criteriului; argument de cel puțin 20 de caractere. O singură dată per evaluare și criteriu, între termenul de evaluare și cel de contestații. Răspunde cu rezultatele | 200, 400 argument scurt, 404, 409 în afara intervalului sau contestat deja |
| `GET /api/assignments/:id/disputes` | `PROFESSOR`, `ADMIN`, autorul temei | `[{ id, teamName, reviewer, criterion: { position, title, levels: [{ id, score, descriptor }] }, level: { score, descriptor }, feedback, argument, status, createdAt, decision, decidedAt, newLevel }]`, cele deschise primele. Nu spune cine a contestat și nici cine a evaluat | 200, 404 |
| `POST /api/assignments/:id/disputes/:disputeId/decision` | `PROFESSOR`, `ADMIN`, autorul temei | `{ upheld, levelId?, decision }`: admisă cu nivelul corect al criteriului sau respinsă, cu o decizie de cel puțin 20 de caractere; oricând, o singură dată. Răspunde cu contestația | 200, 400, 404, 409 hotărâtă deja |

Rezultatele (`GET /api/my/results/:id` și ruta profesorului) au și `disputeDeadline`, `canDispute`, iar fiecare rând din `levels` are `dispute: { status, argument, createdAt, decision, decidedAt, newScore, newDescriptor }` sau `null`. Un nivel nou admis înlocuiește nivelul evaluatorului în fiabilitate și în notă; nivelul inițial rămâne afișat.

## Nota de evaluator (D-028)

| Rută | Cine | Ce face | Coduri |
|---|---|---|---|
| `PUT /api/assignments/:id/teams/:teamId/reviews/:number/rating` | `PROFESSOR`, `ADMIN`, autorul temei | `{ rating }`, de la 1 la 5: calitatea feedback-ului evaluării cu acel număr pe pagina de rezultate a echipei; între alocare și termenul de contestații; o notă nouă o înlocuiește pe cea veche. Răspunde cu rezultatele echipei | 200, 400 în afara 1–5, 404, 409 în afara intervalului sau calibrarea profesorului |

Rezultatele echipei văzute de profesor au și `canRate`, iar fiecare evaluator din `reviewers` are `rating` (sau `null`) și `rateable` (`false` pentru calibrarea profesorului). Studentul își vede nota de evaluator în `GET /api/my/assignments`; profesorul vede notele doar după numărul evaluatorului, în `GET /api/assignments/:id/grades`.

## Notificări (D-024)

| Rută | Cine | Ce face | Coduri |
|---|---|---|---|
| `GET /api/my/notifications` | `STUDENT` | `{ unread, notifications: [{ id, kind, assignmentId, title, text, createdAt, read }] }`, cele mai noi primele | 200 |
| `POST /api/my/notifications/read` | `STUDENT` | Le marchează pe toate citite | 204 |

`kind` e `REVIEWS_ALLOCATED`, `REVIEW_REMINDER` sau `SUBMISSION_REMINDER`. Textul nu numește niciodată o echipă sau un coleg (D-014).

## Admin (D-015)

Necesită rolul `ADMIN`. Doar citire.

| Rută | Ce face |
|---|---|
| `GET /api/admin/professors` | `[{ id, fullName, email, draftCount, activeCount }]` |
| `GET /api/admin/professors/:id/rubrics` | Grilele unui profesor, cu `status` |
| `GET /api/admin/rubrics/:id` | O grilă completă |
