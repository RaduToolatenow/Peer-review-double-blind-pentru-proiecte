import { FormEvent, useState } from 'react';
import { ScoreInput, StoredCriterion, Submission } from './api';
import { ErrorText } from './Layout';

const MIN_FEEDBACK = 20;

/** The submission being reviewed: link, file and description, never the authors (D-014). */
export function Project({ submission, note }: { submission: Submission; note?: string }) {
  return (
    <section className="item" aria-label="Proiectul">
      <h2>Proiectul</h2>
      <dl className="facts">
        <dt>Link</dt>
        <dd>
          <a href={submission.link} target="_blank" rel="noreferrer noopener">
            {submission.link}
          </a>
        </dd>
        <dt>Fișier</dt>
        <dd>
          <a href={submission.fileUrl}>Descarcă fișierul predat ({submission.fileType.toUpperCase()})</a>
        </dd>
        {submission.description && (
          <>
            <dt>Descriere</dt>
            <dd>{submission.description}</dd>
          </>
        )}
      </dl>
      {note && <p className="muted">{note}</p>}
    </section>
  );
}

/** A sent review or calibration, read-only (D-023). */
export function SentScores({ criteria, scores }: { criteria: StoredCriterion[]; scores: ScoreInput[] }) {
  const scoreOf = new Map(scores.map((s) => [s.criterionId, s]));
  return (
    <ol className="list">
      {criteria.map((criterion) => {
        const score = scoreOf.get(criterion.id);
        const level = criterion.levels.find((l) => l.id === score?.levelId);
        return (
          <li className="item" key={criterion.id}>
            <h2>
              {criterion.position}. {criterion.title}
            </h2>
            <dl className="facts">
              <dt>Nivel</dt>
              <dd>{level ? `Nota ${level.score} · ${level.descriptor}` : '—'}</dd>
              <dt>Feedback</dt>
              <dd>{score?.feedback ?? '—'}</dd>
            </dl>
          </li>
        );
      })}
    </ol>
  );
}

/** "86 de caractere", or what is still missing below the minimum. */
function counter(text: string): string {
  const n = text.trim().length;
  const count = n === 1 ? '1 caracter' : n >= 20 ? `${n} de caractere` : `${n} caractere`;
  return n >= MIN_FEEDBACK ? count : `${count} · mai scrie cel puțin ${MIN_FEEDBACK - n}`;
}

/**
 * A level and feedback for every criterion, sent once (D-023). Used by reviewers and by the
 * professor's calibration (D-025); `send` throws an Error whose message is shown.
 */
export function ReviewForm({
  criteria,
  send,
  noun,
}: {
  criteria: StoredCriterion[];
  send: (scores: ScoreInput[]) => Promise<void>;
  /** "evaluarea" or "calibrarea". */
  noun: string;
}) {
  const [answers, setAnswers] = useState<Record<string, ScoreInput>>(() =>
    Object.fromEntries(criteria.map((c) => [c.id, { criterionId: c.id, levelId: '', feedback: '' }])),
  );
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  function change(criterionId: string, patch: Partial<ScoreInput>) {
    setAnswers((current) => ({ ...current, [criterionId]: { ...current[criterionId], ...patch } }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSending(true);
    try {
      await send(Object.values(answers));
    } catch (failure) {
      setError((failure as Error).message);
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <ol className="list">
        {criteria.map((criterion) => {
          const answer = answers[criterion.id];
          const feedbackId = `feedback-${criterion.id}`;
          return (
            <li className="item" key={criterion.id}>
              <h2>
                {criterion.position}. {criterion.title}
              </h2>
              <p className="muted">Pondere {criterion.weight}</p>
              <fieldset>
                <legend>Nivelul</legend>
                {criterion.levels.map((level) => (
                  <label className="check" key={level.id}>
                    <input
                      type="radio"
                      name={`level-${criterion.id}`}
                      checked={answer.levelId === level.id}
                      onChange={() => change(criterion.id, { levelId: level.id })}
                    />
                    Nota {level.score} · {level.descriptor}
                  </label>
                ))}
              </fieldset>
              <div className="field">
                <label htmlFor={feedbackId}>Feedback (cel puțin {MIN_FEEDBACK} de caractere)</label>
                <textarea
                  id={feedbackId}
                  value={answer.feedback}
                  aria-describedby={`${feedbackId}-count`}
                  onChange={(event) => change(criterion.id, { feedback: event.target.value })}
                />
              </div>
              <p className="muted" id={`${feedbackId}-count`}>
                {counter(answer.feedback)}
              </p>
            </li>
          );
        })}
      </ol>
      {error && <ErrorText message={error} />}
      <p className="muted">După trimitere, {noun} nu se mai poate schimba.</p>
      <button className="primary inline" type="submit" disabled={sending}>
        {sending ? 'Se trimite…' : `Trimite ${noun}`}
      </button>
    </form>
  );
}
