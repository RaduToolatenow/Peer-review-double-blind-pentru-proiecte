import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { lock } from '../allocation/allocation.service';
import { DisputeStatus } from '../generated/prisma/enums';
import { isForeignKeyViolation } from '../prisma/db-errors';
import { PrismaService } from '../prisma/prisma.service';
import { DecisionDto } from './dispute.dto';

const NOT_FOUND = 'Nu am găsit contestația.';
const WRONG_LEVEL = 'Alege nivelul corect pentru acest criteriu.';

const DISPUTE_SELECT = {
  id: true,
  status: true,
  argument: true,
  createdAt: true,
  decision: true,
  decidedAt: true,
  criterionId: true,
  criterion: {
    select: { position: true, title: true, levels: { orderBy: { score: 'asc' }, select: { id: true, score: true, descriptor: true } } },
  },
  newLevel: { select: { score: true, descriptor: true } },
  review: {
    select: {
      id: true,
      submission: {
        select: {
          team: { select: { name: true } },
          // PATTERN-005: the same numbering as the results page.
          reviews: { where: { status: 'SUBMITTED' }, orderBy: { id: 'asc' }, select: { id: true } },
        },
      },
      scores: { select: { criterionId: true, feedback: true, level: { select: { score: true, descriptor: true } } } },
    },
  },
} as const;

/**
 * D-027: the professor's disputes. Neither the member who filed nor the reviewer leaves this
 * service, only the team and the reviewer's number (D-014).
 */
@Injectable()
export class DisputesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every dispute of the assignment, open ones first, then the newest. */
  async list(userId: string, assignmentId: string) {
    await this.ownAssignment(userId, assignmentId);
    const disputes = await this.prisma.dispute.findMany({
      where: { review: { submission: { assignmentId } } },
      orderBy: { createdAt: 'desc' },
      select: DISPUTE_SELECT,
    });
    return disputes
      .map((d) => this.view(d))
      .sort((a, b) => Number(b.status === DisputeStatus.OPEN) - Number(a.status === DisputeStatus.OPEN));
  }

  /** Upholds with a new level of the disputed criterion, or rejects; once, at any time (D-027). */
  async decide(userId: string, assignmentId: string, disputeId: string, dto: DecisionDto) {
    await this.ownAssignment(userId, assignmentId);
    if (dto.upheld && !dto.levelId) {
      throw new BadRequestException(WRONG_LEVEL);
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        // PATTERN-004: one decision at a time per assignment.
        await lock(tx, assignmentId);
        const dispute = await tx.dispute.findFirst({
          where: { id: disputeId, review: { submission: { assignmentId } } },
          select: { status: true },
        });
        if (!dispute) {
          throw new NotFoundException(NOT_FOUND);
        }
        if (dispute.status !== DisputeStatus.OPEN) {
          throw new ConflictException('Contestația a fost deja hotărâtă.');
        }
        await tx.dispute.update({
          where: { id: disputeId },
          data: {
            status: dto.upheld ? DisputeStatus.UPHELD : DisputeStatus.REJECTED,
            newLevelId: dto.upheld ? dto.levelId : null,
            decision: dto.decision.trim(),
            decidedById: userId,
            decidedAt: new Date(),
          },
        });
      });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new BadRequestException(WRONG_LEVEL);
      }
      if (error instanceof Error && error.message.includes('disputes_decision_state')) {
        throw new BadRequestException('Scrie o decizie de cel puțin 20 de caractere.');
      }
      throw error;
    }
    const decided = await this.prisma.dispute.findUniqueOrThrow({ where: { id: disputeId }, select: DISPUTE_SELECT });
    return this.view(decided);
  }

  private async ownAssignment(userId: string, assignmentId: string) {
    const found = await this.prisma.assignment.findFirst({ where: { id: assignmentId, createdById: userId }, select: { id: true } });
    if (!found) {
      throw new NotFoundException('Nu am găsit grila activă.');
    }
  }

  private view(d: {
    id: string;
    status: DisputeStatus;
    argument: string;
    createdAt: Date;
    decision: string | null;
    decidedAt: Date | null;
    criterionId: string;
    criterion: { position: number; title: string; levels: { id: string; score: number; descriptor: string }[] };
    newLevel: { score: number; descriptor: string } | null;
    review: {
      id: string;
      submission: { team: { name: string }; reviews: { id: string }[] };
      scores: { criterionId: string; feedback: string; level: { score: number; descriptor: string } }[];
    };
  }) {
    const score = d.review.scores.find((s) => s.criterionId === d.criterionId)!;
    return {
      id: d.id,
      teamName: d.review.submission.team.name,
      reviewer: d.review.submission.reviews.findIndex((r) => r.id === d.review.id) + 1,
      criterion: d.criterion,
      level: score.level,
      feedback: score.feedback,
      argument: d.argument,
      status: d.status,
      createdAt: d.createdAt,
      decision: d.decision,
      decidedAt: d.decidedAt,
      newLevel: d.newLevel,
    };
  }
}
