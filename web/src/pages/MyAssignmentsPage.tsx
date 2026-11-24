import { FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { api, MyAssignment, submitProject } from '../api';
import { formatShort } from '../dates';
import { ErrorText, Loaded } from '../Layout';
import { useLoad } from '../useLoad';
import { PHASE_LABELS, PHASE_TONES } from './ActiveRubricsPage';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * DS-pr-my-assignments: a student's assignments, their team's submission (D-016) and the
 * withdrawal from reviewing (D-022).
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
        Clasa: {a.className} · {a.teamName === null ? 'Evaluator prin linkul temei' : `Echipa ta: ${a.teamName}`}
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
      {a.withdrawn && <p className="muted">Nu mai primești proiecte de evaluat la această temă.</p>}
      {a.canWithdraw && <Withdrawal assignment={a} onWithdrawn={onWithdrawn} />}
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
      setError('Încarcă fișierul proiectului (PDF sau DOCX).');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('Fișierul are cel mult 10 MB.');
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
        <label htmlFor={id('file')}>Fișierul proiectului (PDF sau DOCX, cel mult 10 MB)</label>
        <input
          id={id('file')}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </div>
      <p className="muted">Autorul din fișier se șterge automat înainte să fie salvat.</p>
      {error && <ErrorText message={error} />}
      {notice && <p role="status">{notice}</p>}
      <button className="primary inline" type="submit" disabled={sending}>
        {sending ? 'Se încarcă…' : a.submission ? 'Înlocuiește predarea' : 'Predă proiectul'}
      </button>
    </form>
  );
}
