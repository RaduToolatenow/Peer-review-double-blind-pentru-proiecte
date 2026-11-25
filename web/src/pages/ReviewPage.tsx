import { Link, useParams } from 'react-router';
import { api, ApiError } from '../api';
import { formatShort } from '../dates';
import { Loaded } from '../Layout';
import { Project, ReviewForm, SentScores } from '../ReviewForm';
import { useLoad } from '../useLoad';

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
            <Project
              submission={review.submission}
              note={
                review.status !== 'SUBMITTED'
                  ? 'Nu știi al cui e proiectul, iar autorii nu vor ști cine l-a evaluat.'
                  : undefined
              }
            />
            {review.status === 'SUBMITTED' ? (
              <SentScores criteria={review.criteria} scores={review.scores} />
            ) : review.canSend ? (
              <ReviewForm
                criteria={review.criteria}
                noun="evaluarea"
                send={async (scores) => {
                  try {
                    state.setData(await api.sendReview(review.id, scores));
                  } catch (failure) {
                    throw failure instanceof ApiError && failure.status === 404
                      ? new Error('Evaluarea a trecut la alt coleg și nu mai poate fi trimisă de tine.')
                      : failure;
                  }
                }}
              />
            ) : (
              <p className="muted">Termenul de evaluare a trecut; evaluarea nu mai poate fi trimisă.</p>
            )}
          </>
        )}
      </Loaded>
    </>
  );
}
