import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, CriterionInput, Rubric } from '../api';
import { ErrorText, Loaded } from '../Layout';
import { useLoad } from '../useLoad';

const MAX_CRITERIA = 100;

interface Draft {
  title: string;
  criteria: CriterionInput[];
}

const newCriterion = (): CriterionInput => ({
  title: '',
  weight: 1,
  levels: [
    { score: 1, descriptor: '' },
    { score: 2, descriptor: '' },
  ],
});

function fromRubric(rubric: Rubric): Draft {
  return {
    title: rubric.title,
    criteria: rubric.criteria.map((c) => ({
      title: c.title,
      weight: c.weight,
      levels: c.levels.map((l) => ({ score: l.score, descriptor: l.descriptor })),
    })),
  };
}

/** DS-pr-rubric-editor, for a new draft (no id) or an existing one. */
export function RubricEditorPage() {
  const { id } = useParams();
  const state = useLoad(async () => (id ? fromRubric(await api.rubric(id)) : { title: '', criteria: [newCriterion()] }), [id]);
  return (
    <>
      <p>
        <Link to="/schite">← Schițe de grile</Link>
      </p>
      <Loaded state={state}>{(draft) => <Editor key={id ?? 'new'} id={id} initial={draft} />}</Loaded>
    </>
  );
}

function Editor({ id, initial }: { id?: string; initial: Draft }) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const setCriterion = (index: number, change: Partial<CriterionInput>) =>
    setDraft({ ...draft, criteria: draft.criteria.map((c, i) => (i === index ? { ...c, ...change } : c)) });

  function move(index: number, by: number) {
    const criteria = [...draft.criteria];
    [criteria[index], criteria[index + by]] = [criteria[index + by], criteria[index]];
    setDraft({ ...draft, criteria });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      if (id) {
        setDraft(fromRubric(await api.saveRubric(id, draft.title, draft.criteria)));
        setNotice('Schița a fost salvată.');
      } else {
        const created = await api.createRubric(draft.title, draft.criteria);
        navigate(`/schite/${created.id}`, { replace: true });
      }
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} noValidate>
      <h1>{id ? 'Modifică grila' : 'Grilă nouă'}</h1>
      <div className="field">
        <label htmlFor="rubric-title">Titlul grilei</label>
        <input
          id="rubric-title"
          value={draft.title}
          maxLength={200}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        />
      </div>
      <p className="muted">
        {draft.criteria.length} din maximum {MAX_CRITERIA} de criterii. Fiecare criteriu are o pondere și cel puțin 2
        niveluri.
      </p>

      {draft.criteria.map((criterion, index) => {
        const n = index + 1;
        return (
          <fieldset key={index}>
            <legend>Criteriul {n}</legend>
            <div className="row">
              <div className="field">
                <label htmlFor={`c${n}`}>Denumire</label>
                <input
                  id={`c${n}`}
                  value={criterion.title}
                  maxLength={200}
                  onChange={(event) => setCriterion(index, { title: event.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor={`w${n}`}>Pondere</label>
                <input
                  id={`w${n}`}
                  type="number"
                  min={1}
                  max={100}
                  value={criterion.weight}
                  onChange={(event) => setCriterion(index, { weight: Number(event.target.value) })}
                />
              </div>
            </div>
            {criterion.levels.map((level, levelIndex) => {
              const m = levelIndex + 1;
              const setLevel = (change: Partial<typeof level>) =>
                setCriterion(index, {
                  levels: criterion.levels.map((l, i) => (i === levelIndex ? { ...l, ...change } : l)),
                });
              return (
                <div className="level" key={levelIndex}>
                  <div className="level-head">
                    <div className="field">
                      <label htmlFor={`c${n}l${m}`}>Nivelul {m}: notă</label>
                      <input
                        id={`c${n}l${m}`}
                        type="number"
                        min={0}
                        max={100}
                        value={level.score}
                        onChange={(event) => setLevel({ score: Number(event.target.value) })}
                      />
                    </div>
                    <button
                      className="secondary"
                      type="button"
                      aria-label={`Șterge nivelul ${m} al criteriului ${n}`}
                      onClick={() => setCriterion(index, { levels: criterion.levels.filter((_, i) => i !== levelIndex) })}
                    >
                      Șterge nivelul
                    </button>
                  </div>
                  <div className="field">
                    <label htmlFor={`c${n}d${m}`}>Descriere</label>
                    <textarea
                      id={`c${n}d${m}`}
                      value={level.descriptor}
                      maxLength={2000}
                      onChange={(event) => setLevel({ descriptor: event.target.value })}
                    />
                  </div>
                </div>
              );
            })}
            {criterion.levels.length < 2 && (
              <p className="error" role="alert">
                ! Criteriul are {criterion.levels.length === 1 ? 'un singur nivel' : 'niciun nivel'}. Adaugă cel puțin
                încă unul.
              </p>
            )}
            <div className="actions">
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  const top = Math.max(0, ...criterion.levels.map((l) => l.score));
                  setCriterion(index, { levels: [...criterion.levels, { score: top + 1, descriptor: '' }] });
                }}
              >
                Adaugă nivel
              </button>
              {index > 0 && (
                <button className="secondary" type="button" aria-label={`Mută criteriul ${n} mai sus`} onClick={() => move(index, -1)}>
                  Mută mai sus
                </button>
              )}
              {index < draft.criteria.length - 1 && (
                <button className="secondary" type="button" aria-label={`Mută criteriul ${n} mai jos`} onClick={() => move(index, 1)}>
                  Mută mai jos
                </button>
              )}
              <button
                className="secondary"
                type="button"
                aria-label={`Șterge criteriul ${n}`}
                onClick={() => setDraft({ ...draft, criteria: draft.criteria.filter((_, i) => i !== index) })}
              >
                Șterge criteriul
              </button>
            </div>
          </fieldset>
        );
      })}

      {draft.criteria.length === 0 && (
        <p className="muted">Grila nu are încă niciun criteriu. Poți salva schița și să revii mai târziu.</p>
      )}
      {error && <ErrorText message={error} />}
      {notice && <p role="status">{notice}</p>}
      <div className="actions">
        <button
          className="secondary"
          type="button"
          disabled={draft.criteria.length >= MAX_CRITERIA}
          onClick={() => setDraft({ ...draft, criteria: [...draft.criteria, newCriterion()] })}
        >
          Adaugă criteriu
        </button>
        <button className="primary inline" type="submit" disabled={saving}>
          Salvează schița
        </button>
      </div>
    </form>
  );
}
