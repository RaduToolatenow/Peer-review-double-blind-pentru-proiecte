import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, ClassDetail, Rubric, Scope } from '../api';
import { fromLocalInput } from '../dates';
import { ErrorText, Loaded } from '../Layout';
import { useLoad } from '../useLoad';
import { criteriaCount } from '../words';

/** DS-pr-send-rubric: sending a draft to a class creates the active rubric and locks it (D-013). */
export function SendRubricPage() {
  const { id = '' } = useParams();
  const state = useLoad(async () => {
    const [rubric, classes] = await Promise.all([api.rubric(id), api.classes()]);
    return { rubric, classes: await Promise.all(classes.map((c) => api.klass(c.id))) };
  }, [id]);

  return (
    <>
      <p>
        <Link to="/schite">← Schițe de grile</Link>
      </p>
      <h1>Trimite grila unei clase</h1>
      <Loaded state={state}>{({ rubric, classes }) => <SendForm rubric={rubric} classes={classes} />}</Loaded>
    </>
  );
}

function SendForm({ rubric, classes }: { rubric: Rubric; classes: ClassDetail[] }) {
  const navigate = useNavigate();
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [title, setTitle] = useState(rubric.title);
  const [k, setK] = useState(3);
  const [dates, setDates] = useState({ submissionDeadline: '', reviewDeadline: '', disputeDeadline: '' });
  const [appliesTo, setAppliesTo] = useState<Scope>('ALL');
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  if (rubric.status !== 'draft') {
    return <p className="muted">Grila a fost deja trimisă. Pentru altă clasă, trimite-o din nou de pe o copie.</p>;
  }
  if (classes.length === 0) {
    return (
      <p className="muted">
        Nu ai încă nicio clasă. <Link to="/clase">Adaugă o clasă</Link> și echipele ei, apoi revino aici.
      </p>
    );
  }
  const klass = classes.find((c) => c.id === classId);

  async function send(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (Object.values(dates).some((value) => !value)) {
      setError('Completează toate cele trei termene.');
      return;
    }
    setSending(true);
    try {
      const assignment = await api.sendRubric(rubric.id, {
        classId,
        title,
        k,
        submissionDeadline: fromLocalInput(dates.submissionDeadline),
        reviewDeadline: fromLocalInput(dates.reviewDeadline),
        disputeDeadline: fromLocalInput(dates.disputeDeadline),
        appliesTo,
        teamIds: appliesTo === 'SELECTED' ? teamIds : [],
      });
      navigate(`/grile-active/${assignment.id}`);
    } catch (failure) {
      setError((failure as Error).message);
      setSending(false);
    }
  }

  return (
    <form onSubmit={send} noValidate>
      <p>
        Grila: <strong>{rubric.title}</strong> ({criteriaCount(rubric.criteria.length)})
      </p>
      <p className="muted">După trimitere grila se blochează și apare în Grile active. Pentru alte criterii, faci o copie.</p>
      <div className="field">
        <label htmlFor="class">Clasa</label>
        <select
          id="class"
          value={classId}
          onChange={(event) => {
            setClassId(event.target.value);
            setTeamIds([]);
          }}
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.teams.length} echipe)
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="title">Titlul temei</label>
        <input id="title" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="k">Evaluări per proiect (k)</label>
        <input id="k" type="number" min={1} value={k} onChange={(event) => setK(Number(event.target.value))} />
      </div>
      <fieldset>
        <legend>Termene (ora României)</legend>
        <div className="row">
          {(
            [
              ['submissionDeadline', 'Predare'],
              ['reviewDeadline', 'Evaluare'],
              ['disputeDeadline', 'Contestații'],
            ] as const
          ).map(([key, label]) => (
            <div className="field" key={key}>
              <label htmlFor={key}>{label}</label>
              <input
                id={key}
                type="datetime-local"
                value={dates[key]}
                onChange={(event) => setDates({ ...dates, [key]: event.target.value })}
              />
            </div>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Se aplică</legend>
        <label className="check">
          <input type="radio" name="scope" checked={appliesTo === 'ALL'} onChange={() => setAppliesTo('ALL')} /> Tuturor
          echipelor din clasă
        </label>
        <label className="check">
          <input
            type="radio"
            name="scope"
            checked={appliesTo === 'SELECTED'}
            onChange={() => setAppliesTo('SELECTED')}
          />{' '}
          Doar echipelor alese
        </label>
        {appliesTo === 'SELECTED' && (
          <div className="indent">
            {klass?.teams.length === 0 && <p className="muted">Clasa nu are încă echipe.</p>}
            {klass?.teams.map((team) => (
              <label className="check" key={team.id}>
                <input
                  type="checkbox"
                  checked={teamIds.includes(team.id)}
                  onChange={(event) =>
                    setTeamIds(event.target.checked ? [...teamIds, team.id] : teamIds.filter((t) => t !== team.id))
                  }
                />{' '}
                {team.name}
              </label>
            ))}
          </div>
        )}
        <p className="muted">Echipele nealese nu sunt evaluate cu această grilă. Le poți trimite altă grilă separat.</p>
      </fieldset>
      {error && <ErrorText message={error} />}
      <button className="primary inline" type="submit" disabled={sending}>
        Trimite grila
      </button>
    </form>
  );
}
