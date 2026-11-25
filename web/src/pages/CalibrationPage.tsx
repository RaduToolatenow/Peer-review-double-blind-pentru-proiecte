import { Link, useParams } from 'react-router';
import { api } from '../api';
import { formatShort } from '../dates';
import { Loaded } from '../Layout';
import { Project, ReviewForm, SentScores } from '../ReviewForm';
import { useLoad } from '../useLoad';

/**
 * DS-pr-calibration: the professor reviews a submission they chose, once, as the reference for
 * its reviewers' reliability (D-025).
 */
export function CalibrationPage() {
  const { id = '', submissionId = '' } = useParams();
  const state = useLoad(() => api.calibration(id, submissionId), [id, submissionId]);

  return (
    <Loaded state={state}>
      {(calibration) => (
        <>
          <p>
            <Link className="button-link secondary" to={`/grile-active/${id}`}>
              ← {calibration.assignmentTitle}
            </Link>
          </p>
          <h1>Calibrare: {calibration.teamName}</h1>
          <p className="muted">
            {calibration.assignmentTitle} · Calibrare până pe {formatShort(calibration.reviewDeadline)}
          </p>
          <p>
            {calibration.status === 'SUBMITTED' ? (
              <span className="badge success">Trimisă pe {formatShort(calibration.submittedAt!)}</span>
            ) : (
              <span className="badge warning">Netrimisă</span>
            )}
          </p>
          <Project
            submission={calibration.submission}
            note={
              calibration.status !== 'SUBMITTED'
                ? 'Evaluarea ta e referința: evaluatorii acestui proiect sunt măsurați față de ea, iar în notă contează ca un evaluator cu fiabilitatea 1. Studenții nu știu ce proiecte ai calibrat.'
                : undefined
            }
          />
          {calibration.status === 'SUBMITTED' ? (
            <SentScores criteria={calibration.criteria} scores={calibration.scores} />
          ) : calibration.canSend ? (
            <ReviewForm
              criteria={calibration.criteria}
              noun="calibrarea"
              send={async (scores) => state.setData(await api.sendCalibration(id, submissionId, scores))}
            />
          ) : (
            <p className="muted">Calibrarea se poate trimite doar după alocarea evaluatorilor și până la termenul de evaluare.</p>
          )}
        </>
      )}
    </Loaded>
  );
}
