import { useState } from 'react';
import { Link } from 'react-router';
import { api, Phase } from '../api';
import { formatShort } from '../dates';
import { Loaded } from '../Layout';
import { useLoad } from '../useLoad';

export const PHASE_LABELS: Record<Phase, string> = {
  submission: 'Predare deschisă',
  review: 'Evaluare în curs',
  disputes: 'Contestații deschise',
  closed: 'Încheiată',
};

/** DS-pr-active-rubrics */
export function ActiveRubricsPage() {
  const [archived, setArchived] = useState(false);
  const state = useLoad(() => api.assignments(archived), [archived]);

  return (
    <>
      <div className="toolbar">
        <h1>Grile active</h1>
        <label className="check">
          <input type="checkbox" checked={archived} onChange={(event) => setArchived(event.target.checked)} /> Arată
          și grilele arhivate
        </label>
      </div>
      <Loaded state={state}>
        {(assignments) =>
          assignments.length === 0 ? (
            <>
              <p className="muted">
                Nu ai trimis încă nicio grilă. Pregătește una în Schițe de grile și trimite-o unei clase.
              </p>
              <Link to="/schite">Mergi la Schițe de grile</Link>
            </>
          ) : (
            <ul className="list">
              {assignments.map((a) => (
                <li className="item" key={a.id}>
                  <h2>
                    <Link to={`/grile-active/${a.id}`}>{a.title}</Link>
                  </h2>
                  <p>
                    Clasa: {a.className} · k = {a.k}
                    {a.appliesTo === 'SELECTED' && ` · doar ${a.evaluatedTeamCount} echipe alese`}
                  </p>
                  <p className="muted">
                    Predare {formatShort(a.submissionDeadline)} · Evaluare {formatShort(a.reviewDeadline)} ·
                    Contestații {formatShort(a.disputeDeadline)}
                  </p>
                  <p>
                    <span className="badge">{a.rubricArchived ? 'Arhivată' : PHASE_LABELS[a.phase]}</span>{' '}
                    {a.reviewsSubmitted} din {a.reviewsExpected} evaluări trimise
                  </p>
                </li>
              ))}
            </ul>
          )
        }
      </Loaded>
    </>
  );
}
