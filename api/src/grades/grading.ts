import { teamIsEvaluated } from '../assignments/assignment-scope';
import { ReviewStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { GradeCriterion, reliabilities, SentReview } from './grade';

/**
 * Everything the grade functions need for one assignment (D-025, D-026): the rubric, the
 * evaluated teams' submissions with their sent reviews, and every reviewer's reliability.
 * Null when no assignment matches.
 */
export async function loadGrading(prisma: PrismaService, where: { id: string; createdById?: string }) {
  const assignment = await prisma.assignment.findFirst({
    where,
    include: {
      chosenTeams: { select: { teamId: true } },
      rubric: {
        select: {
          criteria: {
            orderBy: { position: 'asc' },
            select: { id: true, position: true, title: true, weight: true, levels: { select: { score: true } } },
          },
        },
      },
      submissions: {
        orderBy: { team: { name: 'asc' } },
        select: {
          id: true,
          teamId: true,
          team: { select: { name: true } },
          reviews: {
            where: { status: ReviewStatus.SUBMITTED },
            // PATTERN-005: the random review id gives an order that says nothing about the reviewer.
            orderBy: { id: 'asc' },
            select: {
              id: true,
              reviewerId: true,
              isCalibration: true,
              scores: {
                select: { criterionId: true, feedback: true, level: { select: { score: true, descriptor: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!assignment) {
    return null;
  }
  const criteria: (GradeCriterion & { position: number; title: string })[] = assignment.rubric.criteria.map((c) => {
    const scores = c.levels.map((l) => l.score);
    return { id: c.id, position: c.position, title: c.title, weight: c.weight, lowest: Math.min(...scores), highest: Math.max(...scores) };
  });
  const scope = { rubricAppliesTo: assignment.rubricAppliesTo, chosenTeamIds: assignment.chosenTeams.map((t) => t.teamId) };
  const submissions = assignment.submissions.filter((s) => teamIsEvaluated(scope, s.teamId));
  const reviews: SentReview[] = submissions.flatMap((s) => s.reviews.map((r) => sentReview(s.id, r)));
  return { assignment, criteria, submissions, reviews, reliability: reliabilities(criteria, reviews) };
}

export function sentReview(
  submissionId: string,
  review: { reviewerId: string; isCalibration: boolean; scores: { criterionId: string; level: { score: number } }[] },
): SentReview {
  return {
    submissionId,
    reviewerId: review.reviewerId,
    calibration: review.isCalibration,
    levels: Object.fromEntries(review.scores.map((score) => [score.criterionId, score.level.score])),
  };
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
