import { FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, Dispute } from '../api';
import { formatShort } from '../dates';
import { ErrorText, Loaded } from '../Layout';
import { useLoad } from '../useLoad';

/**
 * DS-pr-disputes: the professor's disputes for one assignment, open ones first (D-027). Only the
 * team, the criterion and the reviewer's number, never who filed or who reviewed (D-014).
 */
export function DisputesPage() {
  const { id = '' } = useParams();
  const assignment = useLoad(() => api.assignment(id), [id]);
  const state = useLoad(() => api.disputes(id), [id]);

  return (
    <>
      <p>
        <Link className="button-link secondary" to={`/grile-active/${id}`}>
          ← {assignment.data?.title ?? 'Grila activă'}
        </Link>
      </p>
      <h1>Contestații</h1>
      <Loaded state={state}>
        {(disputes) => {
          const open = disputes.filter((d) => d.status === 'OPEN').length;
          const deadline = assignment.data ? formatShort(assignment.data.disputeDeadline) : null;
          return disputes.length === 0 ? (
            <p className="muted">
              Nicio contestație încă. Echipele pot contesta după termenul de evaluare
              {deadline ? `, până pe ${deadline}` : ''}.
            </p>
          ) : (
            <>
              <p className="muted">
                {assignment.data?.title}
                {deadline ? ` · contestații până pe ${deadline}` : ''} · {open} {open === 1 ? 'deschisă' : 'deschise'} din{' '}
                {disputes.length}
              </p>
              <ol className="list">
                {disputes.map((d) => (
                  <DisputeItem
                    key={d.id}
                    dispute={d}
                    onDecide={async (upheld, levelId, decision) => {
                      const decided = await api.decideDispute(id, d.id, upheld, levelId, decision);
                      state.setData(disputes.map((x) => (x.id === decided.id ? decided : x)));
                    }}
                  />
                ))}
              </ol>
            </>
          );
        }}
      </Loaded>
    </>
  );
}

const STATUS: Record<Dispute['status'], { label: string; tone: string }> = {
  OPEN: { label: 'Deschisă', tone: 'warning' },
  UPHELD: { label: 'Admisă', tone: 'success' },
  REJECTED: { label: 'Respinsă', tone: '' },
};

function DisputeItem({
  dispute: d,
  onDecide,
}: {
  dispute: Dispute;
  onDecide: (upheld: boolean, levelId: string | null, decision: string) => Promise<void>;
}) {
  return (
    <li className="item">
      <h2>
        {d.teamName} · {d.criterion.title} · Evaluatorul {d.reviewer}
      </h2>
      <p>
        <span className={`badge ${STATUS[d.status].tone}`}>{STATUS[d.status].label}</span>{' '}
        <span className="muted">
          {d.decidedAt ? `hotărâtă pe ${formatShort(d.decidedAt)}` : `trimisă pe ${formatShort(d.createdAt)}`}
        </span>
      </p>
      <dl className="facts">
        <dt>Nivel dat</dt>
        <dd>
          Nota {d.level.score} · {d.level.descriptor}
        </dd>
        {d.newLevel && (
          <>
            <dt>Nivel nou</dt>
            <dd>
              Nota {d.newLevel.score} · {d.newLevel.descriptor}
            </dd>
          </>
        )}
        <dt>Feedback</dt>
        <dd>{d.feedback}</dd>
        <dt>Argument</dt>
        <dd>{d.argument}</dd>
        {d.decision && (
          <>
            <dt>Decizia</dt>
            <dd>{d.decision}</dd>
          </>
        )}
      </dl>
      {d.status === 'OPEN' && <DecisionForm dispute={d} onDecide={onDecide} />}
    </li>
  );
}

function DecisionForm({
  dispute: d,
  onDecide,
}: {
  dispute: Dispute;
  onDecide: (upheld: boolean, levelId: string | null, decision: string) => Promise<void>;
}) {
  const [upheld, setUpheld] = useState<boolean | null>(null);
  const [levelId, setLevelId] = useState<string | null>(null);
  const [decision, setDecision] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const decisionId = `decision-${d.id}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (upheld === null) {
      setError('Alege dacă admiți sau respingi contestația.');
      return;
    }
    setError(null);
    setSending(true);
    try {
      await onDecide(upheld, levelId, decision);
    } catch (failure) {
      setError((failure as Error).message);
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <fieldset>
        <legend>Decizia</legend>
        <label className="check">
          <input type="radio" name={`upheld-${d.id}`} checked={upheld === true} onChange={() => setUpheld(true)} /> Admit
          contestația, cu nivelul corect:
        </label>
        <div className="indent">
          {d.criterion.levels.map((level) => (
            <label className="check" key={level.id}>
              <input
                type="radio"
                name={`level-${d.id}`}
                checked={levelId === level.id}
                disabled={upheld !== true}
                onChange={() => setLevelId(level.id)}
              />{' '}
              Nota {level.score} · {level.descriptor}
            </label>
          ))}
        </div>
        <label className="check">
          <input type="radio" name={`upheld-${d.id}`} checked={upheld === false} onChange={() => setUpheld(false)} /> Resping
          contestația
        </label>
      </fieldset>
      <div className="field">
        <label htmlFor={decisionId}>Motivarea (cel puțin 20 de caractere)</label>
        <textarea id={decisionId} value={decision} onChange={(event) => setDecision(event.target.value)} />
      </div>
      {error && <ErrorText message={error} />}
      <p className="muted">Decizia nu se mai poate schimba. Echipa primește o notificare.</p>
      <button className="primary inline" type="submit" disabled={sending}>
        {sending ? 'Se trimite…' : 'Trimite decizia'}
      </button>
    </form>
  );
}
