import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { teamIsEvaluated } from '../assignments/assignment-scope';
import { isRatingOutOfRange, isUnratableReview, isUniqueViolation } from '../prisma/db-errors';
import { PrismaService } from '../prisma/prisma.service';
import { DisputeDto } from './dispute.dto';
import { explain } from './grade';
import { Grading, loadGrading, round2 } from './grading';
import { RatingDto } from './rating.dto';

const NOT_FOUND = 'Nu am găsit rezultatele.';
const WINDOW = 'Contestațiile se pot trimite între termenul de evaluare și termenul de contestații.';
const SHORT_ARGUMENT = 'Scrie un argument de cel puțin 20 de caractere.';
const RATING_WINDOW = 'Calitatea feedback-ului se notează între alocare și termenul de contestații.';

type GradedSubmission = Grading['submissions'][number];

/** D-027: the argument's length is checked by the database (PATTERN-002). */
function isShortArgument(error: unknown): boolean {
  return error instanceof Error && error.message.includes('disputes_argument_length');
}

/**
 * D-026: every step of one submission's grade, the reviewers only as numbers in the order of
 * their review ids; the professor's calibration is one of them, unlabelled. D-027: each level
 * row carries its dispute's history, never who filed it.
 */
function view({ assignment, criteria, reviews, reliability }: Grading, submission: GradedSubmission) {
  const sent = reviews.filter((r) => r.submissionId === submission.id);
  const explained = explain(criteria, sent, reliability);
  const now = new Date();
  return {
    assignmentId: assignment.id,
    title: assignment.title,
    teamName: submission.team.name,
    reviewDeadline: assignment.reviewDeadline,
    provisional: now < assignment.reviewDeadline,
    disputeDeadline: assignment.disputeDeadline,
    canDispute: now >= assignment.reviewDeadline && now < assignment.disputeDeadline,
    grade: explained.grade,
    reviewers: explained.weights.map((weight, index) => ({ number: index + 1, weight: round2(weight) })),
    criteria: criteria.map((criterion, c) => {
      const step = explained.criteria[c];
      return {
        position: criterion.position,
        title: criterion.title,
        weight: criterion.weight,
        lowest: criterion.lowest,
        highest: criterion.highest,
        mean: step.mean === null ? null : round2(step.mean),
        scaled: step.scaled === null ? null : round2(step.scaled),
        levels: submission.reviews.map((review, index) => {
          const score = review.scores.find((s) => s.criterionId === criterion.id)!;
          const dispute = review.disputes.find((d) => d.criterionId === criterion.id);
          return {
            number: index + 1,
            score: score.level.score,
            descriptor: score.level.descriptor,
            feedback: score.feedback,
            dispute: dispute
              ? {
                  status: dispute.status,
                  argument: dispute.argument,
                  createdAt: dispute.createdAt,
                  decision: dispute.decision,
                  decidedAt: dispute.decidedAt,
                  newScore: dispute.newLevel?.score ?? null,
                  newDescriptor: dispute.newLevel?.descriptor ?? null,
                }
              : null,
          };
        }),
      };
    }),
  };
}

/** D-028: ratings are open from allocation until the dispute deadline. */
function canRate({ assignment }: Grading): boolean {
  return assignment.allocatedAt !== null && new Date() < assignment.disputeDeadline;
}

/** The results page (D-026) and disputes filed from it (D-027). */
@Injectable()
export class ResultsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The assignments where the student's team is evaluated and has a submission. */
  async mine(userId: string) {
    const memberships = await this.prisma.teamMember.findMany({ where: { userId }, select: { classId: true, teamId: true } });
    const teamByClass = new Map(memberships.map((m) => [m.classId, m.teamId]));
    const assignments = await this.prisma.assignment.findMany({
      where: { classId: { in: [...teamByClass.keys()] } },
      include: {
        class: { select: { name: true } },
        chosenTeams: { select: { teamId: true } },
        submissions: { where: { teamId: { in: memberships.map((m) => m.teamId) } }, select: { team: { select: { name: true } } } },
      },
      orderBy: { reviewDeadline: 'desc' },
    });
    const now = new Date();
    const mine = assignments.filter((a) => {
      const scope = { rubricAppliesTo: a.rubricAppliesTo, chosenTeamIds: a.chosenTeams.map((t) => t.teamId) };
      return teamIsEvaluated(scope, teamByClass.get(a.classId)!) && a.submissions.length > 0;
    });
    return Promise.all(
      mine.map(async (a) => {
        const available = now >= a.reviewDeadline;
        const found = available ? await this.find(a.id, teamByClass.get(a.classId)!) : null;
        return {
          assignmentId: a.id,
          title: a.title,
          className: a.class.name,
          teamName: a.submissions[0].team.name,
          reviewDeadline: a.reviewDeadline,
          available,
          grade: found ? view(found.grading, found.submission).grade : null,
        };
      }),
    );
  }

  /** A team member's results, after the review deadline. */
  async forStudent(userId: string, assignmentId: string) {
    const { grading, submission } = await this.findForMember(userId, assignmentId);
    const results = view(grading, submission);
    if (results.provisional) {
      throw new ConflictException('Rezultatele apar după termenul de evaluare.');
    }
    return results;
  }

  /**
   * D-027: a team member disputes one criterion of a received review, chosen by its number on
   * the results page and the criterion's position, between the review and dispute deadlines.
   */
  async dispute(userId: string, assignmentId: string, dto: DisputeDto) {
    const { grading, submission } = await this.findForMember(userId, assignmentId);
    if (!view(grading, submission).canDispute) {
      throw new ConflictException(WINDOW);
    }
    const criterion = grading.criteria.find((c) => c.position === dto.criterion);
    const review = submission.reviews[dto.reviewer - 1];
    if (!criterion || !review) {
      throw new NotFoundException('Nu am găsit evaluarea sau criteriul.');
    }
    try {
      await this.prisma.dispute.create({
        data: { reviewId: review.id, criterionId: criterion.id, authorId: userId, argument: dto.argument.trim() },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Ai contestat deja acest criteriu al acestei evaluări.');
      }
      if (isShortArgument(error)) {
        throw new BadRequestException(SHORT_ARGUMENT);
      }
      throw error;
    }
    return this.forStudent(userId, assignmentId);
  }

  /**
   * The professor's view of one team, provisional before the review deadline, with their rating of
   * each review's feedback (D-028); their own calibration review is never rated.
   */
  async forProfessor(userId: string, assignmentId: string, teamId: string) {
    const grading = await this.professorGrading(userId, assignmentId);
    if (grading.assignment.allocatedAt === null) {
      throw new ConflictException('Rezultatele apar după alocarea evaluatorilor.');
    }
    const submission = this.teamSubmission(grading, teamId);
    const results = view(grading, submission);
    return {
      ...results,
      canRate: canRate(grading),
      reviewers: results.reviewers.map((reviewer, index) => ({
        ...reviewer,
        rating: submission.reviews[index].rating?.rating ?? null,
        rateable: !submission.reviews[index].isCalibration,
      })),
    };
  }

  /**
   * D-028: the professor rates the feedback of a team's review, chosen by its number, from
   * allocation until the dispute deadline; a new rating replaces the old one.
   */
  async rate(userId: string, assignmentId: string, teamId: string, number: number, dto: RatingDto) {
    const grading = await this.professorGrading(userId, assignmentId);
    if (!canRate(grading)) {
      throw new ConflictException(RATING_WINDOW);
    }
    const review = this.teamSubmission(grading, teamId).reviews[number - 1];
    if (!review) {
      throw new NotFoundException('Nu am găsit evaluarea.');
    }
    const data = { rating: dto.rating, ratedById: userId, ratedAt: new Date() };
    try {
      await this.prisma.reviewRating.upsert({ where: { reviewId: review.id }, create: { reviewId: review.id, ...data }, update: data });
    } catch (error) {
      if (isRatingOutOfRange(error)) {
        throw new BadRequestException('Alege o notă de la 1 la 5.');
      }
      if (isUnratableReview(error)) {
        throw new ConflictException('Evaluarea ta de calibrare nu se notează.');
      }
      throw error;
    }
    return this.forProfessor(userId, assignmentId, teamId);
  }

  private async professorGrading(userId: string, assignmentId: string) {
    const grading = await loadGrading(this.prisma, { id: assignmentId, createdById: userId });
    if (!grading) {
      throw new NotFoundException('Nu am găsit grila activă.');
    }
    return grading;
  }

  private teamSubmission(grading: Grading, teamId: string) {
    const submission = grading.submissions.find((s) => s.teamId === teamId);
    if (!submission) {
      throw new NotFoundException(NOT_FOUND);
    }
    return submission;
  }

  /** The member's team submission and its grading data; 404 without an evaluated team submission. */
  private async findForMember(userId: string, assignmentId: string) {
    const assignment = await this.prisma.assignment.findUnique({ where: { id: assignmentId }, select: { classId: true } });
    const membership = assignment
      ? await this.prisma.teamMember.findUnique({ where: { classId_userId: { classId: assignment.classId, userId } } })
      : null;
    const found = membership ? await this.find(assignmentId, membership.teamId) : null;
    if (!found) {
      throw new NotFoundException(NOT_FOUND);
    }
    return found;
  }

  /** Null when the team is not evaluated or has no submission. */
  private async find(assignmentId: string, teamId: string) {
    const grading = await loadGrading(this.prisma, { id: assignmentId });
    const submission = grading?.submissions.find((s) => s.teamId === teamId);
    return grading && submission ? { grading, submission } : null;
  }
}
