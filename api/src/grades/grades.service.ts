import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { lock } from '../allocation/allocation.service';
import { DisputeStatus, ReviewStatus } from '../generated/prisma/enums';
import { isInvalidReview, isSentReview } from '../prisma/db-errors';
import { PrismaService } from '../prisma/prisma.service';
import { checkScores, INVALID_REVIEW, ReviewDto } from '../reviews/review.dto';
import { submissionView } from '../submissions/submissions.service';
import { csvDecimal, toCsv } from './csv';
import { aggregate } from './grade';
import { loadGrading, loadReviewerGrades, round2 } from './grading';

const NOT_FOUND = 'Nu am găsit predarea.';
const ALREADY_SENT = 'Ai trimis deja această evaluare; nu se mai poate schimba.';

const CRITERIA = {
  orderBy: { position: 'asc' },
  select: {
    id: true,
    position: true,
    title: true,
    weight: true,
    levels: { orderBy: { score: 'asc' }, select: { id: true, score: true, descriptor: true } },
  },
} as const;

/**
 * D-025: the professor's calibration reviews and the grades of an assignment. Reviewers leave
 * this service only as numbers, never as ids or emails (D-014).
 */
@Injectable()
export class GradesService {
  constructor(private readonly prisma: PrismaService) {}

  async calibration(userId: string, assignmentId: string, submissionId: string) {
    const submission = await this.prisma.submission.findFirst({
      where: { id: submissionId, assignmentId, assignment: { createdById: userId } },
      include: {
        team: { select: { name: true } },
        assignment: {
          select: { title: true, reviewDeadline: true, allocatedAt: true, rubric: { select: { criteria: CRITERIA } } },
        },
        reviews: {
          where: { reviewerId: userId },
          select: { status: true, submittedAt: true, scores: { select: { criterionId: true, levelId: true, feedback: true } } },
        },
      },
    });
    if (!submission) {
      throw new NotFoundException(NOT_FOUND);
    }
    const { assignment } = submission;
    const review = submission.reviews[0];
    const sent = review?.status === ReviewStatus.SUBMITTED;
    return {
      assignmentId,
      assignmentTitle: assignment.title,
      teamName: submission.team.name,
      reviewDeadline: assignment.reviewDeadline,
      status: review?.status ?? ReviewStatus.ALLOCATED,
      submittedAt: review?.submittedAt ?? null,
      canSend: !sent && assignment.allocatedAt !== null && new Date() < assignment.reviewDeadline,
      submission: submissionView(submission),
      criteria: assignment.rubric.criteria,
      scores: review?.scores ?? [],
    };
  }

  /** Sends the professor's calibration review at once; afterwards it never changes (D-023, D-025). */
  async calibrate(userId: string, assignmentId: string, submissionId: string, dto: ReviewDto) {
    const scores = checkScores(dto.scores);
    const found = await this.prisma.submission.findFirst({
      where: { id: submissionId, assignmentId, assignment: { createdById: userId } },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException(NOT_FOUND);
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        // PATTERN-004: one review per submission and reviewer, checked under the assignment's lock.
        const assignment = await lock(tx, assignmentId);
        if (assignment.allocatedAt === null) {
          throw new ConflictException('Calibrarea începe după alocarea evaluatorilor.');
        }
        if (new Date() >= assignment.reviewDeadline) {
          throw new ConflictException('Termenul de evaluare a trecut.');
        }
        if (await tx.review.findUnique({ where: { submissionId_reviewerId: { submissionId, reviewerId: userId } } })) {
          throw new ConflictException(ALREADY_SENT);
        }
        const review = await tx.review.create({ data: { submissionId, reviewerId: userId, isCalibration: true } });
        await tx.reviewScore.createMany({ data: scores.map((s) => ({ reviewId: review.id, ...s })) });
        await tx.review.update({
          where: { id: review.id },
          data: { status: ReviewStatus.SUBMITTED, submittedAt: new Date() },
        });
      });
    } catch (error) {
      if (isInvalidReview(error)) {
        throw new BadRequestException(INVALID_REVIEW);
      }
      if (isSentReview(error)) {
        throw new ConflictException(ALREADY_SENT);
      }
      throw error;
    }
    return this.calibration(userId, assignmentId, submissionId);
  }

  /** The grade of every evaluated team's submission and each reviewer's reliability, by number. */
  async grades(userId: string, assignmentId: string) {
    const grading = await loadGrading(this.prisma, { id: assignmentId, createdById: userId });
    if (!grading) {
      throw new NotFoundException('Nu am găsit grila activă.');
    }
    const { assignment, criteria, submissions, reviews, reliability } = grading;
    const provisional = new Date() < assignment.reviewDeadline;
    if (assignment.allocatedAt === null) {
      return { allocated: false, provisional, submissions: [], reviewers: [] };
    }
    const grades = aggregate(criteria, reviews, reliability, submissions.map((s) => s.id));
    // D-028: every reviewer allocated a peer review, including one who has sent nothing yet.
    const reviewerGrades = await loadReviewerGrades(this.prisma, grading);

    return {
      allocated: true,
      provisional,
      submissions: submissions.map((s) => ({
        teamId: s.teamId,
        teamName: s.team.name,
        grade: grades.get(s.id) ?? null,
        reviewsCounted: s.reviews.filter((r) => !r.isCalibration).length,
        calibrated: s.reviews.some((r) => r.isCalibration),
        disputes: disputeCounts(s.reviews.flatMap((r) => r.disputes)),
      })),
      // D-014: numbered in the order of their random ids, which says nothing about who they are.
      reviewers: [...reviewerGrades.keys()]
        .sort()
        .map((reviewerId, index) => {
          const r = reliability.get(reviewerId) ?? { reliability: 1, flagged: false, measured: false };
          return {
            number: index + 1,
            reliability: round2(r.reliability),
            flagged: r.flagged,
            measured: r.measured,
            reviewsSent: reviews.filter((review) => !review.calibration && review.reviewerId === reviewerId).length,
            reviewerGrade: reviewerGrades.get(reviewerId)!.grade,
          };
        }),
    };
  }

  /** D-029: note.csv, one row per evaluated team with a submission, as the grades show them. */
  async exportTeams(userId: string, assignmentId: string) {
    const grades = await this.allocatedGrades(userId, assignmentId);
    const status = grades.provisional ? 'provizorie' : 'finală';
    return toCsv(
      ['Echipa', 'Evaluări primite', 'Calibrată', 'Nota (1–10)', 'Contestații deschise', 'Contestații admise', 'Contestații respinse', 'Stare'],
      grades.submissions.map((s) => [
        s.teamName,
        s.reviewsCounted,
        s.calibrated,
        csvDecimal(s.grade),
        s.disputes.open,
        s.disputes.upheld,
        s.disputes.rejected,
        status,
      ]),
    );
  }

  /** D-029: evaluatori.csv, one row per reviewer number (D-014), as the grades show them. */
  async exportReviewers(userId: string, assignmentId: string) {
    const grades = await this.allocatedGrades(userId, assignmentId);
    const status = grades.provisional ? 'provizorie' : 'finală';
    return toCsv(
      ['Evaluator (nr.)', 'Fiabilitate', 'Semnalat', 'Măsurată', 'Evaluări trimise', 'Nota de evaluator (1–10)', 'Stare'],
      grades.reviewers.map((r) => [
        r.number,
        csvDecimal(r.reliability),
        r.flagged,
        r.measured,
        r.reviewsSent,
        csvDecimal(r.reviewerGrade),
        status,
      ]),
    );
  }

  private async allocatedGrades(userId: string, assignmentId: string) {
    const grades = await this.grades(userId, assignmentId);
    if (!grades.allocated) {
      throw new ConflictException('Exportul e disponibil după alocarea evaluatorilor.');
    }
    return grades;
  }
}

function disputeCounts(disputes: { status: DisputeStatus }[]) {
  const count = (status: DisputeStatus) => disputes.filter((d) => d.status === status).length;
  return { open: count(DisputeStatus.OPEN), upheld: count(DisputeStatus.UPHELD), rejected: count(DisputeStatus.REJECTED) };
}
