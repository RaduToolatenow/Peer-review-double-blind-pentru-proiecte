import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { lock } from '../allocation/allocation.service';
import { ReviewStatus } from '../generated/prisma/enums';
import { isInvalidReview, isSentReview } from '../prisma/db-errors';
import { PrismaService } from '../prisma/prisma.service';
import { submissionView } from '../submissions/submissions.service';
import { INVALID_REVIEW, ReviewDto } from './review.dto';

const NOT_FOUND = 'Nu am găsit evaluarea.';
const ALREADY_SENT = 'Ai trimis deja această evaluare; nu se mai poate schimba.';

/**
 * A reviewer's own reviews (D-023). Only the submission and the rubric leave this service,
 * never the team or another reviewer (D-014).
 */
@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string, reviewId: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      include: {
        scores: { select: { criterionId: true, levelId: true, feedback: true } },
        submission: {
          include: {
            assignment: {
              select: {
                id: true,
                title: true,
                reviewDeadline: true,
                rubric: {
                  select: {
                    criteria: {
                      orderBy: { position: 'asc' },
                      select: {
                        id: true,
                        position: true,
                        title: true,
                        weight: true,
                        levels: { orderBy: { score: 'asc' }, select: { id: true, score: true, descriptor: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!review || review.reviewerId !== userId) {
      throw new NotFoundException(NOT_FOUND);
    }
    const { assignment } = review.submission;
    const mine = await this.prisma.review.findMany({
      where: { reviewerId: userId, submission: { assignmentId: assignment.id } },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    const sent = review.status === ReviewStatus.SUBMITTED;
    return {
      id: review.id,
      number: mine.findIndex((r) => r.id === review.id) + 1,
      assignmentTitle: assignment.title,
      reviewDeadline: assignment.reviewDeadline,
      status: review.status,
      submittedAt: review.submittedAt,
      canSend: !sent && new Date() < assignment.reviewDeadline,
      submission: submissionView(review.submission),
      criteria: assignment.rubric.criteria,
      scores: review.scores,
    };
  }

  /** Sends the whole review at once; afterwards it never changes (D-023). */
  async send(userId: string, reviewId: string, dto: ReviewDto) {
    const found = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: { reviewerId: true, submission: { select: { assignmentId: true } } },
    });
    if (!found || found.reviewerId !== userId) {
      throw new NotFoundException(NOT_FOUND);
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        // PATTERN-004: a withdrawal or a late join may move this review at the same time.
        const assignment = await lock(tx, found.submission.assignmentId);
        const review = await tx.review.findUnique({ where: { id: reviewId } });
        if (!review || review.reviewerId !== userId) {
          throw new NotFoundException(NOT_FOUND);
        }
        if (review.status === ReviewStatus.SUBMITTED) {
          throw new ConflictException(ALREADY_SENT);
        }
        if (new Date() >= assignment.reviewDeadline) {
          throw new ConflictException('Termenul de evaluare a trecut.');
        }
        await tx.reviewScore.createMany({ data: dto.scores.map((s) => ({ reviewId, ...s })) });
        await tx.review.update({
          where: { id: reviewId },
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
    return this.get(userId, reviewId);
  }
}
