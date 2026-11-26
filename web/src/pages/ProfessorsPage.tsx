import { FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, Professor } from '../api';
import { ErrorText, Loaded } from '../Layout';
import { useLoad } from '../useLoad';
import { criteriaCount } from '../words';

/**
 * DS-pr-admin-professors: professors and a count of student accounts, never students' emails (D-014).
 * The admin adds a professor, who sets a password from the emailed link, and deletes one without
 * classes or sent rubrics (D-034).
 */
export function ProfessorsPage() {
  const state = useLoad(async () => {
    const [professors, users] = await Promise.all([api.professors(), api.users()]);
    return { professors, studentCount: users.studentCount };
  }, []);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(action: () => Promise<void>, setError: (message: string | null) => void) {
    setNotice(null);
    setAddError(null);
    setDeleteError(null);
    setBusy(true);
    try {
      await action();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function add(event: FormEvent) {
    event.preventDefault();
    void act(async () => {
      const professor = await api.addProfessor(email, fullName);
      setEmail('');
      setFullName('');
      setNotice(`Am trimis un email la ${professor.email}. Profesorul își alege parola din linkul primit, valabil 24 de ore.`);
      await state.reload();
    }, setAddError);
  }

  function remove(professor: Professor) {
    if (!window.confirm(`Ștergi contul profesorului ${professor.fullName}? Schițele lui se șterg și ele.`)) return;
    void act(async () => {
      await api.deleteProfessor(professor.id);
      await state.reload();
    }, setDeleteError);
  }

  return (
    <>
      <h1>Profesori</h1>
      <Loaded state={state}>
        {({ professors, studentCount }) => (
          <>
            <p className="muted">
              Grilele fiecărui profesor, doar citire. Conturi de student: {studentCount} (emailurile lor nu se afișează).
            </p>
            <form onSubmit={add} noValidate>
              <fieldset>
                <legend>Profesor nou</legend>
                <div className="row">
                  <div className="field">
                    <label htmlFor="professor-email">Email</label>
                    <input
                      id="professor-email"
                      type="email"
                      placeholder="ex. nume.prenume@ulbsibiu.ro"
                      value={email}
                      maxLength={200}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="professor-name">Nume complet</label>
                    <input
                      id="professor-name"
                      placeholder="ex. Ana Popescu"
                      value={fullName}
                      maxLength={100}
                      onChange={(event) => setFullName(event.target.value)}
                    />
                  </div>
                </div>
                <button className="primary inline" type="submit" disabled={busy}>
                  Adaugă profesorul
                </button>
              </fieldset>
            </form>
            {addError && <ErrorText message={addError} />}
            {notice && (
              <p className="notice" role="status">
                {notice}
              </p>
            )}
            {professors.length === 0 ? (
              <p className="muted">Nu există încă niciun cont de profesor. Adaugă-l pe primul mai sus.</p>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Profesor</th>
                      <th>Email</th>
                      <th>Schițe</th>
                      <th>Grile active</th>
                      <th>Acțiuni</th>
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
                        <td>
                          <button
                            className="secondary"
                            type="button"
                            aria-label={`Șterge ${p.fullName}`}
                            disabled={busy}
                            onClick={() => remove(p)}
                          >
                            Șterge
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {deleteError && <ErrorText message={deleteError} />}
            <p className="muted">
              Un profesor se poate șterge doar dacă nu are nicio clasă și nicio grilă trimisă; schițele lui se șterg odată
              cu contul.
            </p>
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
