import { FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, DisputeHistory, DisputeStatus, Results } from '../api';
import { formatShort } from '../dates';
import { ErrorText, Loaded } from '../Layout';
import { counter } from '../ReviewForm';
import { useLoad } from '../useLoad';
import { decimal } from './ActiveRubricDetailPage';

const DISPUTE_BADGES: Record<DisputeStatus, { label: string; tone: string }> = {
  OPEN: { label: 'În așteptare', tone: 'warning' },
  UPHELD: { label: 'Admisă', tone: 'success' },
  REJECTED: { label: 'Respinsă', tone: '' },
};

type FileDispute = (reviewer: number, criterion: number, argument: string) => Promise<void>;

function percent(scaled: number): string {
  return `${Math.round(scaled * 100)}%`;
}

/** DS-pr-results-list: the student's evaluated team assignments with a submission (D-026). */
export function ResultsListPage() {
  const state = useLoad(() => api.myResults(), []);
  return (
    <>
      <h1>Rezultate</h1>
      <Loaded state={state}>
        {(results) =>
          results.length === 0 ? (
            <p className="muted">Aici apar notele temelor la care echipa ta a predat un proiect, după termenul de evaluare.</p>
          ) : (
            <ol className="list">
              {results.map((r) => (
                <li className="item" key={r.assignmentId}>
                  <h2>{r.title}</h2>
                  <p className="muted">
                    {r.className} · {r.teamName}
                  </p>
                  {!r.available ? (
                    <p>
                      <span className="badge warning">Disponibile după {formatShort(r.reviewDeadline)}</span>
                    </p>
                  ) : (
                    <>
                      {r.grade !== null ? (
                        <p>
                          Nota <strong>{decimal(r.grade)}</strong> din 10
                        </p>
                      ) : (
                        <p>Fără notă: proiectul nu a primit nicio evaluare.</p>
                      )}
                      <p>
                        <Link to={`/rezultate/${r.assignmentId}`}>
                          {r.grade !== null ? 'Vezi cum a ieșit nota' : 'Vezi detaliile'}
                        </Link>
                      </p>
                    </>
                  )}
                </li>
              ))}
            </ol>
          )
        }
      </Loaded>
    </>
  );
}

/** DS-pr-results for a team member, after the review deadline. */
export function MyResultPage() {
  const { id = '' } = useParams();
  const state = useLoad(() => api.myResult(id), [id]);
  return (
    <>
      <p>
        <Link className="button-link secondary" to="/rezultate">
          ← Rezultate
        </Link>
      </p>
      <Loaded state={state}>
        {(results) => (
          <ResultsView
            results={results}
            onDispute={async (reviewer, criterion, argument) =>
              state.setData(await api.fileDispute(id, reviewer, criterion, argument))
            }
          />
        )}
      </Loaded>
    </>
  );
}

/** DS-pr-results for the professor, from the active rubric; provisional before the review deadline. */
export function TeamResultsPage() {
  const { id = '', teamId = '' } = useParams();
  const state = useLoad(() => api.teamResults(id, teamId), [id, teamId]);
  return (
    <Loaded state={state}>
      {(results) => (
        <>
          <p>
            <Link className="button-link secondary" to={`/grile-active/${id}`}>
              ← {results.title}
            </Link>
          </p>
          <ResultsView results={results} />
        </>
      )}
    </Loaded>
  );
}

/**
 * Every step of the grade (D-026). Reviewers appear only as numbers (D-014). With `onDispute`
 * (a team member), each level row can be disputed once in the dispute window (D-027).
 */
function ResultsView({ results: r, onDispute }: { results: Results; onDispute?: FileDispute }) {
  const totalWeight = r.criteria.reduce((sum, c) => sum + c.weight, 0);
  const [disputing, setDisputing] = useState<{ criterion: number; reviewer: number } | null>(null);
  const canDispute = onDispute !== undefined && r.canDispute;
  return (
    <>
      <h1>{r.title}</h1>
      <p className="muted">
        {r.teamName} · {r.provisional ? 'Evaluare până pe' : 'Evaluare încheiată pe'} {formatShort(r.reviewDeadline)}
      </p>
      {r.provisional && (
        <p>
          <span className="badge warning">Notă provizorie până la termenul de evaluare</span>
        </p>
      )}
      {r.grade === null ? (
        <p className="lead">Fără notă: proiectul nu a primit {r.provisional ? 'încă ' : ''}nicio evaluare.</p>
      ) : (
        <>
          <p className="lead">
            Nota <strong>{decimal(r.grade)}</strong> din 10
          </p>
          {canDispute && (
            <p className="muted">
              Poți contesta nivelul dat de un evaluator la un criteriu, o singură dată, cu un argument, până pe{' '}
              {formatShort(r.disputeDeadline)}. Profesorul hotărăște, iar nota se recalculează dacă admite.
            </p>
          )}

          <section className="section">
            <h2>Cum a ieșit nota</h2>
            <ol className="points">
              <li>
                Fiecare evaluator are o pondere, fiabilitatea lui: 1 − abaterea medie față de calibrarea profesorului
                sau, unde nu există, față de mediana celorlalți evaluatori. Nu scade sub 0,2. O calibrare a profesorului
                poate fi printre evaluări și are ponderea 1.
              </li>
              <li>
                La fiecare criteriu se face media nivelurilor, ponderată cu ponderile evaluatorilor, și se aduce pe o
                scară de la 0% (cel mai mic nivel) la 100% (cel mai mare).
              </li>
              <li>Nota = 1 + 9 × media acestor procente, ponderată cu ponderile criteriilor.</li>
            </ol>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Evaluator</th>
                    <th>Pondere</th>
                  </tr>
                </thead>
                <tbody>
                  {r.reviewers.map((reviewer) => (
                    <tr key={reviewer.number}>
                      <td>Evaluatorul {reviewer.number}</td>
                      <td>{decimal(reviewer.weight)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted">
              Nota = 1 + 9 × ({r.criteria.map((c) => `${c.weight} × ${percent(c.scaled ?? 0)}`).join(' + ')}) ÷{' '}
              {totalWeight} = {decimal(r.grade)}
            </p>
          </section>

          <ol className="list">
            {r.criteria.map((criterion) => (
              <li className="item" key={criterion.position}>
                <h2>
                  {criterion.position}. {criterion.title}
                </h2>
                <p className="muted">
                  Pondere {criterion.weight} · niveluri de la {criterion.lowest} la {criterion.highest}
                </p>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Evaluator</th>
                        <th>Nivel</th>
                        <th>Feedback</th>
                        <th>Contestație</th>
                      </tr>
                    </thead>
                    <tbody>
                      {criterion.levels.map((level) => (
                        <tr key={level.number}>
                          <td>Evaluatorul {level.number}</td>
                          <td>
                            {level.dispute?.newScore != null ? (
                              <>
                                <s>
                                  Nota {level.score} · {level.descriptor}
                                </s>
                                <br />
                                Nota {level.dispute.newScore} · {level.dispute.newDescriptor}, după contestație
                              </>
                            ) : (
                              <>
                                Nota {level.score} · {level.descriptor}
                              </>
                            )}
                          </td>
                          <td>{level.feedback}</td>
                          <td>
                            {level.dispute ? (
                              <span className={`badge ${DISPUTE_BADGES[level.dispute.status].tone}`}>
                                {DISPUTE_BADGES[level.dispute.status].label}
                              </span>
                            ) : canDispute ? (
                              <button
                                className="secondary"
                                type="button"
                                aria-label={`Contestă nivelul dat de Evaluatorul ${level.number} la ${criterion.title}`}
                                onClick={() => setDisputing({ criterion: criterion.position, reviewer: level.number })}
                              >
                                Contestă
                              </button>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {onDispute && disputing?.criterion === criterion.position && (
                  <DisputeForm
                    reviewer={disputing.reviewer}
                    onCancel={() => setDisputing(null)}
                    onSend={async (argument) => {
                      await onDispute(disputing.reviewer, criterion.position, argument);
                      setDisputing(null);
                    }}
                  />
                )}
                <DisputeHistoryList
                  disputes={criterion.levels.flatMap((l) => (l.dispute ? [{ reviewer: l.number, dispute: l.dispute }] : []))}
                />
                {criterion.mean !== null && criterion.scaled !== null && (
                  <p>
                    Media ponderată {decimal(criterion.mean)} → <strong>{percent(criterion.scaled)}</strong> din scară
                  </p>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  );
}

/** D-027: the argument for one level row, sent once. */
function DisputeForm({
  reviewer,
  onSend,
  onCancel,
}: {
  reviewer: number;
  onSend: (argument: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [argument, setArgument] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSending(true);
    try {
      await onSend(argument);
    } catch (failure) {
      setError((failure as Error).message);
      setSending(false);
    }
  }

  return (
    <form className="section" onSubmit={submit} noValidate>
      <h3>Contestă nivelul dat de Evaluatorul {reviewer}</h3>
      <div className="field">
        <label htmlFor="dispute-argument">Argumentul (cel puțin 20 de caractere)</label>
        <textarea
          id="dispute-argument"
          value={argument}
          autoFocus
          aria-describedby="dispute-argument-count"
          onChange={(event) => setArgument(event.target.value)}
        />
      </div>
      <p className="muted" id="dispute-argument-count">
        {counter(argument)} · O contestație nu se mai poate schimba.
      </p>
      {error && <ErrorText message={error} />}
      <div className="actions">
        <button className="primary inline" type="submit" disabled={sending}>
          {sending ? 'Se trimite…' : 'Trimite contestația'}
        </button>
        <button className="secondary" type="button" onClick={onCancel} disabled={sending}>
          Renunță
        </button>
      </div>
    </form>
  );
}

/** D-027: each dispute's argument, decision and dates; this is the dispute's history. */
function DisputeHistoryList({ disputes }: { disputes: { reviewer: number; dispute: DisputeHistory }[] }) {
  if (disputes.length === 0) {
    return null;
  }
  return (
    <dl className="facts">
      {disputes.map(({ reviewer, dispute }) => (
        <DisputeFacts key={reviewer} reviewer={reviewer} dispute={dispute} />
      ))}
    </dl>
  );
}

function DisputeFacts({ reviewer, dispute }: { reviewer: number; dispute: DisputeHistory }) {
  const outcome =
    dispute.status === 'OPEN'
      ? 'în așteptare'
      : `${dispute.status === 'UPHELD' ? 'admisă' : 'respinsă'} pe ${formatShort(dispute.decidedAt!)}`;
  return (
    <>
      <dt>Contestație</dt>
      <dd>
        Evaluatorul {reviewer} · trimisă pe {formatShort(dispute.createdAt)} · {outcome}
      </dd>
      <dt>Argument</dt>
      <dd>{dispute.argument}</dd>
      {dispute.decision && (
        <>
          <dt>Decizia</dt>
          <dd>{dispute.decision}</dd>
        </>
      )}
    </>
  );
}
