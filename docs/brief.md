# P12 · Peer review double-blind pentru proiecte

> Fișa proiectului, copiată din „Catalog de proiecte · Web Avansat · Anul 3”.

Categoria C · Universitate · Dificultate ★★★★ · Efort estimat ~36h · Runda 1 · 1 student

**Pe scurt:** platformă în care studenții își evaluează reciproc proiectele, anonim în ambele sensuri, pe o grilă definită de profesor, cu alocare automată a evaluatorilor, calibrare și agregare inteligentă a notelor.

## Input uman obligatoriu

**Pilot real:** minim 8 colegi din anul tău folosesc platforma ta pentru a-și evalua reciproc proiectele P1 (sunt deja făcute!), pe o grilă pe care o stabilești cu ei. Colectezi feedback-ul lor structurat (ce a fost confuz, ce a lipsit) și îl atașezi. Vorbești cu un cadru didactic despre cum ar folosi rezultatele și ce îl sperie la peer review. INTERVIEW.md + PILOT.md cu rezultatele.

## Context real

Peer review-ul scalează feedback-ul, dar se strică ușor: prieteni care își dau 10, evaluatori care dau tuturor 5, anonimat spart de numele din fișier. Profesorul vrea să știe cât să se încreadă în note.

## Cerințe funcționale (must)

- Profesorul creează o temă cu **grilă de evaluare** (criterii, descriptori pe niveluri, ponderi) și termene (predare, evaluare, contestații).
- Studenții predau (link + fișier); după termen, sistemul **alocă automat** evaluatori: fiecare predare primește k evaluări, nimeni nu se evaluează singur sau pe cineva din echipa lui, încărcarea e echilibrată.
- Evaluare double-blind: evaluatorul nu știe al cui e proiectul, autorul nu știe cine l-a evaluat; feedback text obligatoriu per criteriu.
- Calibrare: profesorul evaluează un subset; evaluatorii care deviază sistematic sunt semnalați și ponderați mai puțin.
- Agregare: nota finală per predare din evaluările primite, cu metoda documentată (medie ponderată cu excluderea outlier-ilor); profesorul vede dispersia și poate suprascrie.
- Contestații: autorul poate contesta o evaluare cu argument; profesorul decide; totul cu istoric.
- Fiecare student primește și o **notă de evaluator** (cât de bine a evaluat, după calibrare și după calitatea feedback-ului).
- Export CSV al tuturor rezultatelor; roluri: student, profesor, admin.

## Cerințe tehnice specifice

- Alocarea e un algoritm testat (și cu cazul „un student s-a retras după alocare”: realocare minimală).
- Fișierele încărcate sunt **curățate de metadate** (autor în PDF / DOCX) și servite printr-un proxy, nu cu numele original.
- Toate termenele sunt aplicate pe server; job programat care închide fazele și trimite notificări.
- Agregarea e o funcție pură, testată pe seturi de note construite manual (inclusiv cu un evaluator „toți 10”).

## Twist: alocare cu constrângeri și fiabilitatea evaluatorului

Alocarea trebuie să satisfacă: k evaluări per predare, maxim k+1 evaluări per evaluator, fără auto-evaluare, fără aceeași echipă, fără aceeași pereche de două ori dacă tema e în mai multe runde, și să gestioneze **sosiri târzii și retrageri** fără să refacă totul. Fiabilitatea evaluatorului se calculează din abaterea față de notele de calibrare ale profesorului și față de medianele celorlalți; notele unui evaluator nefiabil contează mai puțin, dar algoritmul și ponderile sunt **explicate pe pagina rezultatelor**, nu ascunse. Un evaluator nu trebuie să-și poată deduce autorul din nimic ce îi arăți.

## Variabilele tale

- Grila folosită în pilot (stabilită cu colegii) și k.
- Metoda de agregare și de calcul al fiabilității (documentate și justificate).
- Ce a spus cadrul didactic că l-ar face să folosească rezultatele.

## Definition of Done

- Pilotul real a rulat pe live: minim 8 predări, fiecare cu minim 2 evaluări, rezultate în PILOT.md.
- Alocarea respectă toate constrângerile (teste), inclusiv la retragere.
- Fișierele descărcate de evaluatori nu conțin autorul în metadate (test).
- Pagina de rezultate explică cum a ieșit nota.
- Feedback-ul colegilor a dus la minim 3 modificări documentate în DECISIONS.md.

## La susținere te întrebăm

- Cum aloci evaluatorii când 2 studenți se retrag după ce au fost alocați?
- Cum calculezi fiabilitatea și ce se întâmplă cu notele unui evaluator care dă tuturor 10?
- Pe unde s-ar putea sparge anonimatul în aplicația ta?
