# API

Toate rutele sunt sub `/api` și folosesc JSON. Sesiunea este un cookie `sid`, `httpOnly`.

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

## Admin (D-015)

Necesită rolul `ADMIN`. Doar citire.

| Rută | Ce face |
|---|---|
| `GET /api/admin/professors` | `[{ id, fullName, email, draftCount, activeCount }]` |
| `GET /api/admin/professors/:id/rubrics` | Grilele unui profesor, cu `status` |
| `GET /api/admin/rubrics/:id` | O grilă completă |
