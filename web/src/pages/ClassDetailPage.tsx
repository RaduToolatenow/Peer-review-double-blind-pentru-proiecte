import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, ClassDetail, Team } from '../api';
import { ErrorText, Loaded } from '../Layout';
import { useLoad } from '../useLoad';

/** DS-pr-class-detail: teams entered from paper, with their codes (D-012). */
export function ClassDetailPage() {
  const { id = '' } = useParams();
  const state = useLoad(() => api.klass(id), [id]);
  return (
    <>
      <p>
        <Link to="/clase">← Clase profesor</Link>
      </p>
      <Loaded state={state}>{(klass) => <Detail klass={klass} reload={state.reload} />}</Loaded>
    </>
  );
}

function Detail({ klass, reload }: { klass: ClassDetail; reload: () => Promise<void> }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [members, setMembers] = useState('');
  const [editing, setEditing] = useState<Team | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Team | null>(null);
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

  function addTeam(event: FormEvent) {
    event.preventDefault();
    void act(async () => {
      await api.addTeam(klass.id, name, members);
      setName('');
      setMembers('');
      await reload();
    });
  }

  return (
    <>
      <h1>{klass.name}</h1>
      <p className="muted">
        Dă fiecărei echipe codul ei. Studentul îl introduce o singură dată după ce se loghează. Vezi doar câte persoane
        au intrat, nu cine.
      </p>
      <form onSubmit={addTeam} noValidate>
        <fieldset>
          <legend>Echipă nouă</legend>
          <div className="row">
            <div className="field">
              <label htmlFor="team-name">Numele echipei</label>
              <input
                id="team-name"
                placeholder="ex. Echipa 9 sau numele studentului"
                value={name}
                maxLength={200}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="team-members">Membri (text, cum sunt pe foaie)</label>
              <input
                id="team-members"
                placeholder="ex. Popescu A., Ionescu M."
                value={members}
                maxLength={1000}
                onChange={(event) => setMembers(event.target.value)}
              />
            </div>
          </div>
          <button className="primary inline" type="submit" disabled={busy}>
            Adaugă echipa
          </button>
        </fieldset>
      </form>
      {error && <ErrorText message={error} />}

      {klass.teams.length === 0 ? (
        <p className="muted">Clasa nu are încă echipe. Adaug-o pe prima mai sus.</p>
      ) : (
        <ul className="list">
          {klass.teams.map((team) =>
            editing?.id === team.id ? (
              <li className="item" key={team.id}>
                <TeamEditor
                  team={editing}
                  busy={busy}
                  onCancel={() => setEditing(null)}
                  onSave={(teamName, memberNames) =>
                    void act(async () => {
                      await api.updateTeam(team.id, teamName, memberNames);
                      setEditing(null);
                      await reload();
                    })
                  }
                />
              </li>
            ) : (
              <li className="item" key={team.id}>
                <h2>{team.name}</h2>
                {team.memberNames && <p>{team.memberNames}</p>}
                <dl className="facts">
                  <dt>Cod</dt>
                  <dd className="code">{team.joinCode}</dd>
                  <dt>Au intrat</dt>
                  <dd>
                    {team.joinedCount === 0
                      ? 'nimeni încă'
                      : team.joinedCount === 1
                        ? '1 persoană'
                        : `${team.joinedCount} persoane`}
                  </dd>
                </dl>
                {confirmDelete?.id === team.id ? (
                  <div role="alertdialog" aria-labelledby={`delete-${team.id}`}>
                    <p id={`delete-${team.id}`}>
                      <strong>Ștergi echipa „{team.name}”?</strong>
                    </p>
                    <div className="actions">
                      <button
                        className="secondary"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            await api.deleteTeam(team.id);
                            setConfirmDelete(null);
                            await reload();
                          })
                        }
                      >
                        Șterge echipa
                      </button>
                      <button className="secondary" type="button" autoFocus onClick={() => setConfirmDelete(null)}>
                        Renunță
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="actions">
                    <button
                      className="secondary"
                      type="button"
                      disabled={busy}
                      aria-label={`Cod nou pentru ${team.name}`}
                      onClick={() =>
                        void act(async () => {
                          await api.newTeamCode(team.id);
                          await reload();
                        })
                      }
                    >
                      Cod nou
                    </button>
                    <button className="secondary" type="button" aria-label={`Modifică ${team.name}`} onClick={() => setEditing(team)}>
                      Modifică
                    </button>
                    <button className="secondary" type="button" aria-label={`Șterge ${team.name}`} onClick={() => setConfirmDelete(team)}>
                      Șterge
                    </button>
                  </div>
                )}
              </li>
            ),
          )}
        </ul>
      )}
      <p className="muted">„Cod nou” anulează codul vechi; cine a intrat deja rămâne în echipă.</p>

      <section className="section">
        <h2>Ștergerea clasei</h2>
        {klass.assignmentCount > 0 ? (
          <p className="muted">O clasă căreia i-ai trimis o grilă nu se poate șterge.</p>
        ) : (
          <button
            className="secondary"
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`Ștergi clasa „${klass.name}” și echipele ei?`)) {
                void act(async () => {
                  await api.deleteClass(klass.id);
                  navigate('/clase');
                });
              }
            }}
          >
            Șterge clasa
          </button>
        )}
      </section>
    </>
  );
}

function TeamEditor({
  team,
  busy,
  onSave,
  onCancel,
}: {
  team: Team;
  busy: boolean;
  onSave: (name: string, memberNames: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(team.name);
  const [members, setMembers] = useState(team.memberNames);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave(name, members);
      }}
      noValidate
    >
      <div className="row">
        <div className="field">
          <label htmlFor={`edit-name-${team.id}`}>Numele echipei</label>
          <input id={`edit-name-${team.id}`} value={name} maxLength={200} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`edit-members-${team.id}`}>Membri</label>
          <input
            id={`edit-members-${team.id}`}
            value={members}
            maxLength={1000}
            onChange={(event) => setMembers(event.target.value)}
          />
        </div>
      </div>
      <div className="actions">
        <button className="primary inline" type="submit" disabled={busy}>
          Salvează echipa
        </button>
        <button className="secondary" type="button" onClick={onCancel}>
          Renunță
        </button>
      </div>
    </form>
  );
}
