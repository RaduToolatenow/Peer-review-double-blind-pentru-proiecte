# TODO

Întrebările deschise sunt în [docs/agents/OPEN-QUESTIONS.md](docs/agents/OPEN-QUESTIONS.md).

## S1: checkpoint

- [x] Setup agentic și registru
- [x] Schema bazei de date, diagramă și migrări
- [x] Docker Compose
- [x] Schelet cu autentificare și roluri
- [x] CI cu teste și `ledger-lint.py`
- [x] README și listă de task-uri
- [ ] Discuția cu cadrul didactic și `INTERVIEW.md` început
- [x] Deploy pe un URL public cu HTTPS (D-009)
- [ ] Repo public și push (push-ul e făcut; repo-ul e încă privat)
- [ ] Clarificat cu profesorul materialul pilotului (Q-002)

## S2: build

- [x] Înscriere prin linkul temei, doar cu email `@ulbsibiu.ro` verificat, și „Am uitat parola” (D-010, D-020)
- [x] Limitarea încercărilor de autentificare (D-017, D-018)
- [x] Timp de răspuns egal la login pentru email existent și inexistent (D-017)
- [x] Clase și echipe cu cod, schițe de grile (1–100 criterii), trimiterea către o clasă, grile active cu termene (D-011–D-015)
- [x] Termenele aplicate la predare, evaluare și contestații (cu jobul programat) (D-027)
- [x] Job programat cu pg-boss pentru închiderea fazelor și notificări (D-021, D-024)
- [x] Predări cu link și fișier, în Supabase Storage (D-016, D-032)
- [x] Curățarea metadatelor din PDF, DOCX, PPTX, ODT, ODP și ZIP (D-032); servire prin proxy, fără numele original
- [x] Alocarea evaluatorilor cu toate constrângerile (D-021, D-022)
- [x] Sosiri târzii și retrageri, cu realocare minimală (D-022)
- [x] Evaluare double-blind cu feedback obligatoriu per criteriu (D-023)
- [x] Calibrare și fiabilitatea evaluatorului (D-025)
- [x] Agregarea notelor ca funcție pură (D-025)
- [x] Contestații cu istoric (D-027)
- [x] Nota de evaluator (D-028)
- [x] Pagina de rezultate care explică nota (D-026)
- [x] Export CSV (D-029)

## S3: finalizare

- [ ] Pilot real: minim 8 predări, fiecare cu minim 2 evaluări; `PILOT.md`
- [x] Minim 3 modificări din feedback-ul colegilor, în `docs/agents/DECISIONS.md` (D-030, D-031, D-033)
  - [x] Verificarea securității parolelor: parole des folosite, repetate sau cu numele din adresă refuzate (D-030, Q-012)
  - [x] Protecție anti-spam la refresh repetat: 120 de cereri pe minut per cont sau IP, apoi 429 (D-031, Q-013)
  - [x] Limita de emailuri pe 15 minute în loc de o oră (D-033)
- [ ] Minim 8 decizii, minim 10 intrări în `AI_LOG.md`, `SUBMISSION.md` (33 de decizii; `AI_LOG.md` și `SUBMISSION.md` nu există încă)
- [ ] Minim 25 de commit-uri pe minim 8 zile diferite (pe 26 nov., pe ramura `feat/email-limit-15min`: 134 commit-uri, pe 8 zile; contează după push)
- [ ] Video demo de 3–5 minute
