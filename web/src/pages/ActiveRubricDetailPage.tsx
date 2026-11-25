import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, AssignmentDetail, Deadlines, Grades } from '../api';
import { formatShort, fromLocalInput, toLocalInput } from '../dates';
import { ErrorText, Loaded } from '../Layout';
import { useLoad } from '../useLoad';
import { PHASE_LABELS, PHASE_TONES } from './ActiveRubricsPage';

const FIELDS: { key: keyof Deadlines; label: string }[] = [
  { key: 'submissionDeadline', label: 'Predare' },
  { key: 'reviewDeadline', label: 'Evaluare' },
  { key: 'disputeDeadline', label: 'Contestații' },
];

/** 8,47 — a grade or a reliability with two decimals, as written in Romanian. */
export function decimal(value: number): string {
  return value.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** DS-pr-active-rubric-detail */
export function ActiveRubricDetailPage() {
  const { id = '' } = useParams();
  const state = useLoad(() => api.assignment(id), [id]);
  return (
    <>
      <p>
        <Link to="/grile-active">← Grile active</Link>
      </p>
      <Loaded state={state}>{(a) => <Detail assignment={a} onChange={state.setData} />}</Loaded>
    </>
  );
}

function Detail({ assignment: a, onChange }: { assignment: AssignmentDetail; onChange: (a: AssignmentDetail) => void }) {
  const navigate = useNavigate();
  const now = Date.now();
  const [values, setValues] = useState(() =>
    Object.fromEntries(FIELDS.map(({ key }) => [key, toLocalInput(a[key])])) as Record<keyof Deadlines, string>,
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // D-025: grades and reliability, computed by the server on every load.
  const grades = useLoad(() => api.grades(a.id), [a.id]);
  // D-027: how many disputes are still open.
  const disputes = useLoad(() => api.disputes(a.id), [a.id]);
  const graded = grades.data?.allocated ? grades.data : null;
  const gradeOf = new Map(graded?.submissions.map((s) => [s.teamId, s]) ?? []);
  const passed = (key: keyof Deadlines) => new Date(a[key]).getTime() <= now;
  const archivable = new Date(a.archivableFrom).getTime() <= now;

  async function act(action: () => Promise<void>) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await action();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function saveDeadlines(event: FormEvent) {
    event.preventDefault();
    const changes: Partial<Deadlines> = {};
    for (const { key } of FIELDS) {
      if (!passed(key) && values[key] !== toLocalInput(a[key])) {
        changes[key] = fromLocalInput(values[key]);
      }
    }
    void act(async () => {
      onChange(await api.updateAssignment(a.id, changes));
      setNotice('Termenele au fost salvate.');
    });
  }

  return (
    <>
      <h1>{a.title}</h1>
      <p>
        <span className={`badge ${a.rubricArchived ? '' : PHASE_TONES[a.phase]}`}>
          {a.rubricArchived ? 'Arhivată' : PHASE_LABELS[a.phase]}
        </span>{' '}
        <span className="badge">Blocată: nu se mai modifică</span>
      </p>
      {error && <ErrorText message={error} />}
      {notice && <p role="status">{notice}</p>}
      <dl className="facts">
        <dt>Clasa</dt>
        <dd>{a.className}</dd>
        <dt>Evaluări per proiect (k)</dt>
        <dd>{a.k}</dd>
        <dt>Se aplică</dt>
        <dd>
          {a.appliesTo === 'ALL'
            ? `tuturor echipelor (${a.evaluatedTeamCount})`
            : `doar echipelor alese (${a.evaluatedTeamCount})`}
        </dd>
        <dt>Răspunsuri</dt>
        <dd>
          {a.reviewsSubmitted} din {a.reviewsExpected} evaluări trimise
        </dd>
        <dt>Contestații</dt>
        <dd>
          <Link to={`/grile-active/${a.id}/contestatii`}>
            {disputes.data
              ? `${disputes.data.filter((d) => d.status === 'OPEN').length} ${
                  disputes.data.filter((d) => d.status === 'OPEN').length === 1 ? 'deschisă' : 'deschise'
                } din ${disputes.data.length}`
              : 'Vezi contestațiile'}
          </Link>
        </dd>
      </dl>

      <section className="section">
        <h2>Linkul temei</h2>
        <p className="muted">
          Trimite-l colegilor care evaluează. Cine își face cont prin el, cu email @ulbsibiu.ro, devine evaluator la
          această temă.
        </p>
        <div className="join-link">
          <input aria-label="Linkul temei" readOnly value={a.joinUrl} onFocus={(event) => event.target.select()} />
          <button
            className="secondary"
            type="button"
            onClick={() =>
              void navigator.clipboard
                .writeText(a.joinUrl)
                .then(() => setNotice('Linkul a fost copiat.'))
                .catch(() => setError('Nu am putut copia linkul. Selectează-l și copiază-l manual.'))
            }
          >
            Copiază linkul
          </button>
        </div>
      </section>

      <form className="section" onSubmit={saveDeadlines}>
        <h2>Termene (ora României)</h2>
        <div className="row">
          {FIELDS.map(({ key, label }) => (
            <div className="field" key={key}>
              <label htmlFor={key}>{label}</label>
              <input
                id={key}
                type="datetime-local"
                value={values[key]}
                disabled={passed(key)}
                onChange={(event) => setValues({ ...values, [key]: event.target.value })}
              />
            </div>
          ))}
        </div>
        {FIELDS.filter(({ key }) => passed(key)).map(({ key, label }) => (
          <p className="muted" key={key}>
            Termenul de {label.toLowerCase()} a trecut și nu se mai poate schimba.
          </p>
        ))}
        {FIELDS.some(({ key }) => !passed(key)) && (
          <button className="primary inline" type="submit" disabled={busy}>
            Salvează termenele
          </button>
        )}
      </form>

      <section className="section">
        <h2>Echipe și note</h2>
        {graded?.provisional && (
          <p>
            <span className="badge warning">Note provizorii până la termenul de evaluare</span>
          </p>
        )}
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Echipa</th>
                <th>Predare</th>
                <th>Evaluări primite</th>
                {graded && (
                  <>
                    <th>Nota (1–10)</th>
                    <th>Calibrare</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {a.teams.map((team) => {
                const grade = gradeOf.get(team.id);
                return (
                  <tr key={team.id}>
                    <td>{team.name}</td>
                    <td>
                      {!team.evaluated ? (
                        'nu e evaluată'
                      ) : team.link && team.fileUrl ? (
                        <>
                          <a href={team.link} target="_blank" rel="noreferrer noopener">
                            Link
                          </a>{' '}
                          · <a href={team.fileUrl}>Descarcă fișierul</a>
                        </>
                      ) : (
                        'nepredat'
                      )}
                    </td>
                    <td>{team.evaluated && team.submitted ? `${team.reviewsReceived} din ${a.k}` : '—'}</td>
                    {graded && (
                      <>
                        <td>
                          {grade ? (
                            <Link to={`/grile-active/${a.id}/rezultate/${team.id}`}>
                              {grade.grade !== null ? decimal(grade.grade) : 'fără notă'}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          {grade && team.submissionId ? (
                            <Link to={`/grile-active/${a.id}/calibrare/${team.submissionId}`}>
                              {grade.calibrated ? 'Calibrată · vezi' : 'Calibrează'}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {a.teams.length === 0 && <p className="muted">Clasa nu are încă echipe.</p>}
        {grades.error && <ErrorText message={grades.error} />}
        <p className="muted">
          Nu se arată cine a evaluat, doar câte evaluări există.
          {graded && ' Calibrarea ta nu intră în evaluările primite. Nota deschide rezultatele echipei, așa cum le vede ea.'}
        </p>
        {graded ? (
          <p className="muted">
            Nota: la fiecare criteriu, media nivelurilor ponderată cu fiabilitatea evaluatorilor (calibrarea ta contează
            cu 1), adusă între cel mai mic și cel mai mare nivel; apoi media criteriilor după pondere, pe scara 1–10.
          </p>
        ) : (
          grades.data && <p className="muted">Notele și calibrarea apar după alocarea evaluatorilor, la termenul de predare.</p>
        )}
      </section>

      {graded && <Reviewers grades={graded} />}

      <section className="section">
        <h2>Grila</h2>
        <p>
          <Link to={`/grile/${a.rubricId}`}>Vezi criteriile (doar citire)</Link>
        </p>
        <div className="actions">
          <button
            className="secondary"
            type="button"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                const copy = await api.copyRubric(a.rubricId);
                navigate(`/schite/${copy.id}`);
              })
            }
          >
            Copiază ca schiță nouă
          </button>
          {!a.rubricArchived && archivable && (
            <button
              className="secondary"
              type="button"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await api.archiveRubric(a.rubricId);
                  onChange(await api.assignment(a.id));
                  setNotice('Grila a fost arhivată.');
                })
              }
            >
              Arhivează grila
            </button>
          )}
        </div>
        {!a.rubricArchived && !archivable && (
          <p className="muted">
            Arhivarea devine posibilă pe {formatShort(a.archivableFrom)}, la 2 zile după termenul de evaluare.
          </p>
        )}
      </section>
    </>
  );
}

/** D-025: reviewers only by number, with their reliability (D-014). */
function Reviewers({ grades }: { grades: Grades }) {
  return (
    <section className="section">
      <h2>Evaluatori</h2>
      {grades.reviewers.length === 0 ? (
        <p className="muted">Niciun evaluator nu a trimis încă o evaluare.</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Evaluator</th>
                <th>Evaluări trimise</th>
                <th>Fiabilitate</th>
                <th>Stare</th>
              </tr>
            </thead>
            <tbody>
              {grades.reviewers.map((r) => (
                <tr key={r.number}>
                  <td>Evaluatorul {r.number}</td>
                  <td>{r.reviewsSent}</td>
                  <td>{decimal(r.reliability)}</td>
                  <td>
                    {!r.measured ? (
                      <span className="badge">Nemăsurat</span>
                    ) : r.flagged ? (
                      <span className="badge warning">Semnalat</span>
                    ) : (
                      <span className="badge success">În regulă</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted">
        Fiabilitatea = 1 − abaterea medie față de calibrarea ta sau, unde nu ai calibrat, față de mediana celorlalți
        evaluatori. Nu scade sub 0,2; sub 0,6 evaluatorul e semnalat. Fără nimic de comparat, rămâne 1. Evaluatorii apar
        doar ca numere.
      </p>
    </section>
  );
}
