import { Link, useParams } from 'react-router';
import { api, Results } from '../api';
import { formatShort } from '../dates';
import { Loaded } from '../Layout';
import { useLoad } from '../useLoad';
import { decimal } from './ActiveRubricDetailPage';

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
      <Loaded state={state}>{(results) => <ResultsView results={results} />}</Loaded>
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

/** Every step of the grade (D-026). Reviewers appear only as numbers (D-014). */
function ResultsView({ results: r }: { results: Results }) {
  const totalWeight = r.criteria.reduce((sum, c) => sum + c.weight, 0);
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
                      </tr>
                    </thead>
                    <tbody>
                      {criterion.levels.map((level) => (
                        <tr key={level.number}>
                          <td>Evaluatorul {level.number}</td>
                          <td>
                            Nota {level.score} · {level.descriptor}
                          </td>
                          <td>{level.feedback}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
