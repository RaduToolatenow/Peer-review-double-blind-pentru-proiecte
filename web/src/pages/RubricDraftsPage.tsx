import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, RubricSummary } from '../api';
import { ErrorText, Loaded } from '../Layout';
import { useLoad } from '../useLoad';
import { criteriaCount } from '../words';

/** DS-pr-rubric-drafts */
export function RubricDraftsPage() {
  const navigate = useNavigate();
  const state = useLoad(() => api.drafts(), []);
  const [confirming, setConfirming] = useState<RubricSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(action: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="toolbar">
        <h1>Schițe de grile</h1>
        <Link className="button-link primary inline" to="/schite/noua">
          Grilă nouă
        </Link>
      </div>
      {error && <ErrorText message={error} />}
      {confirming && (
        <div className="item" role="alertdialog" aria-labelledby="delete-title">
          <p id="delete-title">
            <strong>Ștergi schița „{confirming.title}”?</strong>
          </p>
          <p className="muted">Schița și criteriile ei se șterg definitiv.</p>
          <div className="actions">
            <button
              className="secondary"
              type="button"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await api.deleteRubric(confirming.id);
                  setConfirming(null);
                  await state.reload();
                })
              }
            >
              Șterge schița
            </button>
            <button className="secondary" type="button" onClick={() => setConfirming(null)} autoFocus>
              Renunță
            </button>
          </div>
        </div>
      )}
      <Loaded state={state}>
        {(drafts) =>
          drafts.length === 0 ? (
            <p className="muted">
              Nu ai nicio schiță. O grilă nouă începe aici; după ce o trimiți unei clase, apare în Grile active.
            </p>
          ) : (
            <ul className="list">
              {drafts.map((draft) => (
                <li className="item" key={draft.id}>
                  <h2>
                    <Link to={`/schite/${draft.id}`}>{draft.title}</Link>
                  </h2>
                  <p className="muted">
                    {criteriaCount(draft.criteriaCount)}
                    {draft.criteriaCount === 0 && ' · nu poate fi trimisă până nu are cel puțin un criteriu'}
                  </p>
                  <div className="actions">
                    <Link className="button-link secondary" to={`/schite/${draft.id}`}>
                      Modifică
                    </Link>
                    {draft.criteriaCount > 0 && (
                      <Link className="button-link primary inline" to={`/schite/${draft.id}/trimite`}>
                        Trimite unei clase
                      </Link>
                    )}
                    <button
                      className="secondary"
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          const copy = await api.copyRubric(draft.id);
                          navigate(`/schite/${copy.id}`);
                        })
                      }
                    >
                      Copiază
                    </button>
                    <button className="secondary" type="button" onClick={() => setConfirming(draft)}>
                      Șterge
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )
        }
      </Loaded>
    </>
  );
}
