import { teamIsEvaluated } from '../assignments/assignment-scope';
import { ReviewStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { GradeCriterion, OwnReview, reliabilities, reviewerGrades, SentReview } from './grade';

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
              rating: { select: { rating: true } },
              scores: {
                select: { criterionId: true, feedback: true, level: { select: { score: true, descriptor: true } } },
              },
              disputes: {
                select: {
                  id: true,
                  criterionId: true,
                  status: true,
                  argument: true,
                  createdAt: true,
                  decision: true,
                  decidedAt: true,
                  newLevel: { select: { score: true, descriptor: true } },
                },
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

export type Grading = NonNullable<Awaited<ReturnType<typeof loadGrading>>>;

/**
 * D-028: the grade of every reviewer allocated a peer review on the assignment. An unsent review
 * counts 1 after the review deadline; a withdrawal removes the withdrawn student's (D-022).
 */
export async function loadReviewerGrades(prisma: PrismaService, grading: Grading, now = new Date()) {
  const { assignment, criteria, submissions, reviews } = grading;
  const unsent = await prisma.review.findMany({
    where: { submissionId: { in: submissions.map((s) => s.id) }, status: ReviewStatus.ALLOCATED, isCalibration: false },
    select: { id: true, submissionId: true, reviewerId: true },
  });
  const closed = now >= assignment.reviewDeadline;
  const own: OwnReview[] = [
    ...submissions.flatMap((s) =>
      s.reviews
        .filter((r) => !r.isCalibration)
        .map((r) => ({
          id: r.id,
          submissionId: s.id,
          reviewerId: r.reviewerId,
          sent: true,
          levels: Object.fromEntries(r.scores.map((score) => [score.criterionId, score.level.score])),
          upheld: Object.fromEntries(r.disputes.flatMap((d) => (d.newLevel ? [[d.criterionId, d.newLevel.score]] : []))),
          rating: r.rating?.rating ?? null,
        })),
    ),
    ...unsent.map((r) => ({
      ...r,
      sent: false,
      levels: {},
      upheld: {},
      rating: null,
      counts: closed,
    })),
  ];
  return reviewerGrades(criteria, reviews, own);
}

/** A sent review as the grade functions see it: an upheld dispute's new level replaces the reviewer's (D-027). */
export function sentReview(
  submissionId: string,
  review: {
    reviewerId: string;
    isCalibration: boolean;
    scores: { criterionId: string; level: { score: number } }[];
    disputes: { criterionId: string; newLevel: { score: number } | null }[];
  },
): SentReview {
  const upheld = new Map(review.disputes.flatMap((d) => (d.newLevel ? [[d.criterionId, d.newLevel.score] as const] : [])));
  return {
    submissionId,
    reviewerId: review.reviewerId,
    calibration: review.isCalibration,
    levels: Object.fromEntries(review.scores.map((score) => [score.criterionId, upheld.get(score.criterionId) ?? score.level.score])),
  };
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
