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

Necesită rolul `ADMIN`.

| Cod | Corp |
|---|---|
| 200 | listă de utilizatori, în forma de la login, ordonată după email |
| 401 | fără sesiune |
| 403 | `{ "statusCode": 403, "message": "Nu ai acces la această pagină.", "error": "Forbidden" }` |
