import { useNavigate, useParams } from 'react-router';
import { api, Rubric } from '../api';
import { Loaded } from '../Layout';
import { useLoad } from '../useLoad';
import { criteriaCount } from '../words';

const STATUS_LABELS: Record<Rubric['status'], string> = {
  draft: 'Schiță',
  active: 'Trimisă: nu se mai modifică',
  archived: 'Arhivată',
};

/** A rubric, read only: a professor's sent rubric, or any rubric for the admin (D-015). */
export function RubricViewPage({ admin = false }: { admin?: boolean }) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const state = useLoad(() => (admin ? api.adminRubric(id) : api.rubric(id)), [id, admin]);

  return (
    <>
      <p>
        <button className="secondary" type="button" onClick={() => navigate(-1)}>
          ← Înapoi
        </button>
      </p>
      <Loaded state={state}>
        {(rubric) => (
          <>
            <h1>{rubric.title}</h1>
            <p>
              <span className="badge">{STATUS_LABELS[rubric.status]}</span> {criteriaCount(rubric.criteria.length)}
            </p>
            <ol className="list">
              {rubric.criteria.map((criterion) => (
                <li className="item" key={criterion.id}>
                  <h2>
                    {criterion.position}. {criterion.title}
                  </h2>
                  <p className="muted">Pondere {criterion.weight}</p>
                  <dl className="facts">
                    {criterion.levels.map((level) => (
                      <div key={level.id} className="contents">
                        <dt>Nota {level.score}</dt>
                        <dd>{level.descriptor}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ol>
          </>
        )}
      </Loaded>
    </>
  );
}
