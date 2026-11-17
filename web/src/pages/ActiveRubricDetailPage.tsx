import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, AssignmentDetail, Deadlines } from '../api';
import { formatShort, fromLocalInput, toLocalInput } from '../dates';
import { ErrorText, Loaded } from '../Layout';
import { useLoad } from '../useLoad';
import { PHASE_LABELS } from './ActiveRubricsPage';

const FIELDS: { key: keyof Deadlines; label: string }[] = [
  { key: 'submissionDeadline', label: 'Predare' },
  { key: 'reviewDeadline', label: 'Evaluare' },
  { key: 'disputeDeadline', label: 'Contestații' },
];

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
        <span className="badge">{a.rubricArchived ? 'Arhivată' : PHASE_LABELS[a.phase]}</span>{' '}
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
      </dl>

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
        <h2>Echipe</h2>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Echipa</th>
                <th>Predare</th>
                <th>Evaluări primite</th>
              </tr>
            </thead>
            <tbody>
              {a.teams.map((team) => (
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {a.teams.length === 0 && <p className="muted">Clasa nu are încă echipe.</p>}
        <p className="muted">Nu se arată cine a evaluat, doar câte evaluări există.</p>
      </section>

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
