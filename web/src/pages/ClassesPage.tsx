import { FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import { ErrorText, Loaded } from '../Layout';
import { useLoad } from '../useLoad';

/** DS-pr-classes */
export function ClassesPage() {
  const state = useLoad(() => api.classes(), []);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function add(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setAdding(true);
    try {
      await api.createClass(name);
      setName('');
      await state.reload();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <>
      <div className="toolbar">
        <h1>Clase profesor</h1>
      </div>
      <form className="row" aria-label="Clasă nouă" onSubmit={add} noValidate>
        <div className="field">
          <label htmlFor="class-name">Numele clasei noi</label>
          <input
            id="class-name"
            placeholder="ex. Web Avansat, grupa 233"
            value={name}
            maxLength={200}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="field end">
          <button className="primary inline" type="submit" disabled={adding}>
            Adaugă clasa
          </button>
        </div>
      </form>
      {error && <ErrorText message={error} />}
      <Loaded state={state}>
        {(classes) =>
          classes.length === 0 ? (
            <p className="muted">Nu ai nicio clasă. Adaug-o mai sus, apoi introdu echipele de pe foaie.</p>
          ) : (
            <ul className="list">
              {classes.map((c) => (
                <li className="item" key={c.id}>
                  <h2>
                    <Link to={`/clase/${c.id}`}>{c.name}</Link>
                  </h2>
                  <p className="muted">
                    {c.teamCount === 1 ? '1 echipă' : `${c.teamCount} echipe`} ·{' '}
                    {c.assignmentCount === 0
                      ? 'nicio grilă trimisă'
                      : c.assignmentCount === 1
                        ? '1 grilă trimisă'
                        : `${c.assignmentCount} grile trimise`}
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
