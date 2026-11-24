import { FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api, ApiError, MyReview, ScoreInput } from '../api';
import { formatShort } from '../dates';
import { ErrorText, Loaded } from '../Layout';
import { useLoad } from '../useLoad';

const MIN_FEEDBACK = 20;

/**
 * DS-pr-review: a reviewer answers the rubric for one allocated submission, once (D-023).
 * The page shows the submission and the rubric, never the team (D-014).
 */
export function ReviewPage() {
  const { id = '' } = useParams();
  const state = useLoad(() => api.review(id), [id]);

  return (
    <>
      <p>
        <Link className="button-link secondary" to="/">
          ← Temele mele
        </Link>
      </p>
      <Loaded state={state}>
        {(review) => (
          <>
            <h1>Evaluarea proiectului {review.number}</h1>
            <p className="muted">
              {review.assignmentTitle} · Evaluare până pe {formatShort(review.reviewDeadline)}
            </p>
            <p>
              {review.status === 'SUBMITTED' ? (
                <span className="badge success">Trimisă pe {formatShort(review.submittedAt!)}</span>
              ) : (
                <span className="badge warning">Netrimisă</span>
              )}
            </p>
            <Project review={review} />
            {review.status === 'SUBMITTED' ? (
              <SentReview review={review} />
            ) : review.canSend ? (
              <ReviewForm review={review} onSent={state.setData} />
            ) : (
              <p className="muted">Termenul de evaluare a trecut; evaluarea nu mai poate fi trimisă.</p>
            )}
          </>
        )}
      </Loaded>
    </>
  );
}

function Project({ review }: { review: MyReview }) {
  const { submission } = review;
  return (
    <section className="item" aria-label="Proiectul de evaluat">
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
      {review.status !== 'SUBMITTED' && (
        <p className="muted">Nu știi al cui e proiectul, iar autorii nu vor ști cine l-a evaluat.</p>
      )}
    </section>
  );
}

function SentReview({ review }: { review: MyReview }) {
  const scoreOf = new Map(review.scores.map((s) => [s.criterionId, s]));
  return (
    <ol className="list">
      {review.criteria.map((criterion) => {
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

function ReviewForm({ review, onSent }: { review: MyReview; onSent: (review: MyReview) => void }) {
  const [answers, setAnswers] = useState<Record<string, ScoreInput>>(() =>
    Object.fromEntries(review.criteria.map((c) => [c.id, { criterionId: c.id, levelId: '', feedback: '' }])),
  );
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  function change(criterionId: string, patch: Partial<ScoreInput>) {
    setAnswers((current) => ({ ...current, [criterionId]: { ...current[criterionId], ...patch } }));
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSending(true);
    try {
      onSent(await api.sendReview(review.id, Object.values(answers)));
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.status === 404
          ? 'Evaluarea a trecut la alt coleg și nu mai poate fi trimisă de tine.'
          : (failure as Error).message,
      );
      setSending(false);
    }
  }

  return (
    <form onSubmit={send} noValidate>
      <ol className="list">
        {review.criteria.map((criterion) => {
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
      <p className="muted">După trimitere, evaluarea nu se mai poate schimba.</p>
      <button className="primary inline" type="submit" disabled={sending}>
        {sending ? 'Se trimite…' : 'Trimite evaluarea'}
      </button>
    </form>
  );
}
