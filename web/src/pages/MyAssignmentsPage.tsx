import { FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { api, MyAssignment, ReviewerGrade, submitProject } from '../api';
import { formatShort } from '../dates';
import { ErrorText, Loaded } from '../Layout';
import { useLoad } from '../useLoad';
import { decimal } from './ActiveRubricDetailPage';
import { PHASE_LABELS, PHASE_TONES } from './ActiveRubricsPage';

// D-032: the server judges the type by content; here the name decides only which limit applies.
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ZIP_BYTES = 20 * 1024 * 1024;

/**
 * DS-pr-my-assignments: a student's assignments, their team's submission (D-016), their
 * reviews (D-023) and the withdrawal from reviewing (D-022).
 */
export function MyAssignmentsPage() {
  const state = useLoad(() => api.myAssignments(), []);

  return (
    <>
      <div className="toolbar">
        <h1>Temele mele</h1>
        <Link className="button-link secondary" to="/echipa">
          Intră într-o echipă cu un cod
        </Link>
      </div>
      <Loaded state={state}>
        {(assignments) =>
          assignments.length === 0 ? (
            <p className="muted">
              Nu ai încă nicio temă. Intră în echipa ta cu codul primit de la profesor; temele trimise clasei tale apar
              aici.
            </p>
          ) : (
            <ul className="list">
              {assignments.map((assignment) => (
                <li className="item" key={assignment.id}>
                  <AssignmentCard
                    assignment={assignment}
                    onSubmitted={(updated) =>
                      state.setData(assignments.map((a) => (a.id === updated.id ? updated : a)))
                    }
                    onWithdrawn={() => void state.reload()}
                  />
                </li>
              ))}
            </ul>
          )
        }
      </Loaded>
    </>
  );
}

function AssignmentCard({
  assignment: a,
  onSubmitted,
  onWithdrawn,
}: {
  assignment: MyAssignment;
  onSubmitted: (assignment: MyAssignment) => void;
  onWithdrawn: () => void;
}) {
  const open = new Date(a.submissionDeadline).getTime() > Date.now();
  return (
    <>
      <h2>{a.title}</h2>
      <p>
        Clasa: {a.className} · {a.teamName === null ? 'Doar evaluator la această temă' : `Echipa ta: ${a.teamName}`}
      </p>
      {a.description && <p>{a.description}</p>}
      <p className="muted">
        Predare până pe {formatShort(a.submissionDeadline)} · Evaluare până pe {formatShort(a.reviewDeadline)}
      </p>
      <p>
        <span className={`badge ${PHASE_TONES[a.phase]}`}>{PHASE_LABELS[a.phase]}</span>{' '}
        {a.teamName !== null &&
          (a.submission ? (
            <span className="badge success">Predat pe {formatShort(a.submission.updatedAt)}</span>
          ) : (
            <span className="badge warning">Nu ați predat încă</span>
          ))}{' '}
        {a.withdrawn && <span className="badge warning">Te-ai retras din evaluare</span>}
      </p>
      {a.submission && (
        <dl className="facts">
          <dt>Link</dt>
          <dd>
            <a href={a.submission.link} target="_blank" rel="noreferrer noopener">
              {a.submission.link}
            </a>
          </dd>
          <dt>Fișier</dt>
          <dd>
            <a href={a.submission.fileUrl}>Descarcă fișierul predat ({a.submission.fileType.toUpperCase()})</a>
          </dd>
        </dl>
      )}
      {a.teamName !== null &&
        (open ? (
          <SubmissionForm assignment={a} onSubmitted={onSubmitted} />
        ) : (
          <p className="muted">
            {a.submission
              ? 'Termenul de predare a trecut; predarea nu se mai poate schimba.'
              : 'Termenul de predare a trecut fără o predare a echipei tale.'}
          </p>
        ))}
      {a.reviews.length > 0 && <Reviews assignment={a} />}
      {a.withdrawn && <p className="muted">Nu mai primești proiecte de evaluat la această temă.</p>}
      {a.canWithdraw && <Withdrawal assignment={a} onWithdrawn={onWithdrawn} />}
    </>
  );
}

/** The reviews allocated to me, numbered, never naming a team (D-023). */
function Reviews({ assignment: a }: { assignment: MyAssignment }) {
  return (
    <section className="section" aria-label="Evaluările tale">
      <h2>Evaluările tale</h2>
      <dl className="facts">
        {a.reviews.map((review) => (
          <div key={review.id} className="contents">
            <dt>
              <Link to={`/evaluari/${review.id}`}>Proiectul {review.number}</Link>
            </dt>
            <dd>
              {review.status === 'SUBMITTED' ? (
                <span className="badge success">Trimisă</span>
              ) : (
                <span className="badge warning">Netrimisă</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {a.phase !== 'closed' && a.phase !== 'disputes' && (
        <p className="muted">
          Trimite-le până pe {formatShort(a.reviewDeadline)}. O evaluare trimisă nu se mai poate schimba.
        </p>
      )}
      {a.reviewerGrade ? (
        <ReviewerGradeView grade={a.reviewerGrade} />
      ) : (
        <p className="muted">Nota ta de evaluator apare după termenul de contestații, pe {formatShort(a.disputeDeadline)}.</p>
      )}
    </section>
  );
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** D-028: my reviewer grade and how each of my reviews counted. */
function ReviewerGradeView({ grade: g }: { grade: ReviewerGrade }) {
  return (
    <>
      <h3>Nota ta de evaluator</h3>
      {g.provisional && (
        <p>
          <span className="badge warning">Provizorie: mai sunt contestații nehotărâte</span>
        </p>
      )}
      {g.grade === null ? (
        <p className="lead">Fără notă de evaluator: nu există nimic cu care să-ți comparăm evaluările.</p>
      ) : (
        <p className="lead">
          Nota <strong>{decimal(g.grade)}</strong> din 10
        </p>
      )}
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Evaluare</th>
              <th>Acuratețe</th>
              <th>Calitatea feedback-ului</th>
              <th>Nota</th>
            </tr>
          </thead>
          <tbody>
            {g.reviews.map((r) => (
              <tr key={r.number}>
                <td>Proiectul {r.number}</td>
                <td>{!r.sent ? 'netrimisă' : r.accuracy === null ? 'fără comparație' : percent(r.accuracy)}</td>
                <td>{!r.sent ? '—' : r.rating === null ? 'neevaluată' : `${r.rating} din 5`}</td>
                <td>{r.grade === null ? 'nu se socotește' : decimal(r.grade)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ol className="points">
        <li>
          Acuratețea = 1 − abaterea medie a nivelurilor tale față de calibrarea profesorului sau, unde nu există, față
          de mediana celorlalți evaluatori. La un criteriu cu o contestație admisă, se compară cu nivelul hotărât de
          profesor.
        </li>
        <li>
          Profesorul poate nota calitatea feedback-ului, de la 1 la 5. Nota unei evaluări = 1 + 9 × (70% acuratețe + 30%
          calitate); fără notă de la profesor, 1 + 9 × acuratețea.
        </li>
        <li>O evaluare netrimisă la termen are nota 1. Nota ta de evaluator e media notelor evaluărilor.</li>
      </ol>
    </>
  );
}

/** Withdrawing for good, until the review deadline; unsubmitted reviews go to colleagues (D-022). */
function Withdrawal({ assignment: a, onWithdrawn }: { assignment: MyAssignment; onWithdrawn: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function withdraw() {
    if (!window.confirm(`Te retragi din evaluarea temei „${a.title}”? Nu poți reveni.`)) return;
    setError(null);
    setBusy(true);
    try {
      await api.withdraw(a.id);
      onWithdrawn();
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  }

  return (
    <section className="section" aria-label="Retragerea din evaluare">
      <h2>Retragerea din evaluare</h2>
      <p className="muted">
        Dacă nu mai poți evalua, te poți retrage până la termenul de evaluare. Evaluările pe care nu le-ai trimis trec la
        alți colegi{a.teamName !== null && ', iar predarea echipei tale rămâne'}. Retragerea nu se poate anula.
      </p>
      {error && <ErrorText message={error} />}
      <button className="secondary" type="button" disabled={busy} onClick={() => void withdraw()}>
        {busy ? 'Se trimite…' : 'Mă retrag din evaluare'}
      </button>
    </section>
  );
}

function SubmissionForm({
  assignment: a,
  onSubmitted,
}: {
  assignment: MyAssignment;
  onSubmitted: (assignment: MyAssignment) => void;
}) {
  const [link, setLink] = useState(a.submission?.link ?? '');
  const [description, setDescription] = useState(a.submission?.description ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const id = (name: string) => `${name}-${a.id}`;

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError(null);
    setNotice(null);
    if (!file) {
      setError('Încarcă fișierul proiectului (PDF, DOCX, PPTX, ODT, ODP sau ZIP).');
      return;
    }
    if (file.size > (file.name.toLowerCase().endsWith('.zip') ? MAX_ZIP_BYTES : MAX_FILE_BYTES)) {
      setError('Fișierul are cel mult 10 MB; o arhivă ZIP, cel mult 20 MB.');
      return;
    }
    setSending(true);
    try {
      onSubmitted(await submitProject(a.id, link, description, file));
      setNotice('Proiectul a fost predat.');
      setFile(null);
      form.reset();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="section" aria-label="Predarea echipei" onSubmit={send} noValidate>
      <h2>{a.submission ? 'Înlocuiește predarea' : 'Predarea echipei'}</h2>
      <div className="field">
        <label htmlFor={id('link')}>Linkul proiectului</label>
        <input
          id={id('link')}
          type="url"
          placeholder="https://..."
          value={link}
          maxLength={2000}
          onChange={(event) => setLink(event.target.value)}
        />
      </div>
      <p className="muted">
        Linkul și fișierul ajung la colegi fără numele tău. Nu pune în link numele tău sau al colegilor de echipă (de
        exemplu, un repo pe contul tău personal).
      </p>
      <div className="field">
        <label htmlFor={id('description')}>Descriere (opțional)</label>
        <textarea
          id={id('description')}
          value={description}
          maxLength={2000}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor={id('file')}>Fișierul proiectului (PDF, DOCX, PPTX, ODT, ODP sau ZIP; cel mult 10 MB, ZIP 20 MB)</label>
        <input
          id={id('file')}
          type="file"
          accept=".pdf,.docx,.pptx,.odt,.odp,.zip"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </div>
      <p className="muted">Autorul din fișier se șterge automat înainte să fie salvat.</p>
      {/* D-032: names written inside code cannot be removed automatically. */}
      <p className="muted">La ZIP, șterge numele tău din cod, comentarii și README: din text nu se poate șterge automat.</p>
      {error && <ErrorText message={error} />}
      {notice && <p role="status">{notice}</p>}
      <button className="primary inline" type="submit" disabled={sending}>
        {sending ? 'Se încarcă…' : a.submission ? 'Înlocuiește predarea' : 'Predă proiectul'}
      </button>
    </form>
  );
}
