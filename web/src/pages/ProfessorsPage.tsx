import { Link, useParams } from 'react-router';
import { api } from '../api';
import { Loaded } from '../Layout';
import { useLoad } from '../useLoad';
import { criteriaCount } from '../words';

/** DS-pr-admin-professors: professors and a count of student accounts, never students' emails (D-014). */
export function ProfessorsPage() {
  const state = useLoad(async () => {
    const [professors, users] = await Promise.all([api.professors(), api.users()]);
    return { professors, studentCount: users.studentCount };
  }, []);

  return (
    <>
      <h1>Profesori</h1>
      <Loaded state={state}>
        {({ professors, studentCount }) => (
          <>
            <p className="muted">
              Grilele fiecărui profesor, doar citire. Conturi de student: {studentCount} (emailurile lor nu se afișează).
            </p>
            {professors.length === 0 ? (
              <p className="muted">Nu există încă niciun cont de profesor.</p>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Profesor</th>
                      <th>Email</th>
                      <th>Schițe</th>
                      <th>Grile active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {professors.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <Link to={`/profesori/${p.id}`}>{p.fullName}</Link>
                        </td>
                        <td>{p.email}</td>
                        <td>{p.draftCount}</td>
                        <td>{p.activeCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Loaded>
    </>
  );
}

const STATUS = { draft: 'Schiță', active: 'Activă', archived: 'Arhivată' } as const;

/** One professor's rubrics, read only (D-015). */
export function ProfessorRubricsPage() {
  const { id = '' } = useParams();
  const state = useLoad(async () => {
    const [professors, rubrics] = await Promise.all([api.professors(), api.professorRubrics(id)]);
    return { professor: professors.find((p) => p.id === id), rubrics };
  }, [id]);

  return (
    <>
      <p>
        <Link to="/profesori">← Profesori</Link>
      </p>
      <Loaded state={state}>
        {({ professor, rubrics }) => (
          <>
            <h1>Grilele lui {professor?.fullName ?? 'profesor'}</h1>
            {rubrics.length === 0 ? (
              <p className="muted">Profesorul nu are încă nicio grilă.</p>
            ) : (
              <ul className="list">
                {rubrics.map((r) => (
                  <li className="item" key={r.id}>
                    <h2>
                      <Link to={`/admin/grile/${r.id}`}>{r.title}</Link>
                    </h2>
                    <p>
                      <span className="badge">{STATUS[r.status]}</span>{' '}
                      {criteriaCount(r.criteriaCount)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Loaded>
    </>
  );
}
