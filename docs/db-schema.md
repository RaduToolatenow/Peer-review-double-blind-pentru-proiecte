# Schema bazei de date

Sursa este [api/prisma/schema.prisma](../api/prisma/schema.prisma). Migrările versionate sunt în [api/prisma/migrations](../api/prisma/migrations).

```mermaid
erDiagram
    users ||--o{ assignments : "creează"
    assignments ||--o{ rubric_criteria : "are"
    rubric_criteria ||--o{ criterion_levels : "are"
    assignments ||--o{ teams : "are"
    teams ||--o{ team_members : "are"
    users ||--o{ team_members : "este în"
    teams ||--o| submissions : "predă"
    submissions ||--o{ reviews : "primește"
    users ||--o{ reviews : "evaluează"
    reviews ||--o{ review_scores : "conține"
    rubric_criteria ||--o{ review_scores : "notat prin"
    criterion_levels ||--o{ review_scores : "ales în"
    reviews ||--o{ disputes : "contestată prin"
    users ||--o{ disputes : "depune sau decide"

    users {
        uuid id PK
        text email UK
        text password_hash
        text full_name
        enum role
    }
    assignments {
        uuid id PK
        text title
        int k
        timestamptz submission_deadline
        timestamptz review_deadline
        timestamptz dispute_deadline
        uuid created_by_id FK
    }
    rubric_criteria {
        uuid id PK
        uuid assignment_id FK
        text title
        int weight
        int position
    }
    criterion_levels {
        uuid id PK
        uuid criterion_id FK
        int score
        text descriptor
    }
    teams {
        uuid id PK
        uuid assignment_id FK
    }
    team_members {
        uuid team_id PK
        uuid user_id PK
        uuid assignment_id FK
    }
    submissions {
        uuid id PK
        uuid team_id FK
        text link
        text file_key
    }
    reviews {
        uuid id PK
        uuid submission_id FK
        uuid reviewer_id FK
        bool is_calibration
        enum status
    }
    review_scores {
        uuid review_id PK
        uuid criterion_id PK
        uuid level_id FK
        text feedback
    }
    disputes {
        uuid id PK
        uuid review_id FK
        uuid author_id FK
        text argument
        enum status
        uuid decided_by_id FK
    }
    session {
        varchar sid PK
        json sess
        timestamp expire
    }
```

Tabela `session` aparține bibliotecii `connect-pg-simple` și nu are relații cu celelalte tabele.

## Reguli impuse de baza de date

| Regulă | Constrângere |
|---|---|
| Un email aparține unui singur cont | `users.email` unic |
| Un evaluator evaluează o predare o singură dată | `reviews (submission_id, reviewer_id)` unic |
| Un student este într-o singură echipă per temă | `team_members (assignment_id, user_id)` unic |
| Membrul și echipa aparțin aceleiași teme | cheie străină compusă pe `teams (id, assignment_id)` |
| O echipă are o singură predare | `submissions.team_id` unic |
| Un criteriu are un singur scor per evaluare | cheie primară `review_scores (review_id, criterion_id)` |
| `k` este cel puțin 1 | `CHECK` în migrare |
| Termenele sunt în ordine: predare, evaluare, contestații | `CHECK` în migrare |
| Ponderea unui criteriu este pozitivă | `CHECK` în migrare |
