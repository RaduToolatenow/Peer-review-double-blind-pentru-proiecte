import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { teamIsEvaluated } from '../assignments/assignment-scope';
import { Prisma } from '../generated/prisma/client';
import { ReviewStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { addLateReviewer, allocate, AllocationState, Change, reassign } from './allocate';

type Tx = Prisma.TransactionClient;

const NOT_FOUND = 'Nu am găsit tema.';

/**
 * Writes the allocation (D-022). Every change runs in one transaction that first locks the
 * assignment row, so the job, a withdrawal and a join never change the same assignment at once.
 * Only counts and the caller's own state leave this service, never who reviews what (D-014).
 */
@Injectable()
export class AllocationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Allocates every assignment whose submission deadline has passed and that is not allocated yet. */
  async allocateDue(now = new Date()): Promise<void> {
    const due = await this.prisma.assignment.findMany({
      where: { allocatedAt: null, submissionDeadline: { lte: now } },
      select: { id: true },
    });
    for (const { id } of due) {
      await this.prisma.$transaction(async (tx) => {
        const assignment = await lock(tx, id);
        if (assignment.allocatedAt) return;
        const state = await loadState(tx, id);
        const pairs = allocate(state.submissions, state.reviewers, assignment.k, Math.random);
        await tx.review.createMany({ data: pairs });
        await tx.assignment.update({ where: { id }, data: { allocatedAt: now } });
      });
    }
  }

  /** A student withdraws for good; their unstarted reviews move to others. Doing it twice changes nothing. */
  async withdraw(userId: string, assignmentId: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: { classId: true, reviewDeadline: true },
    });
    if (!assignment || !(await this.isReviewer(userId, assignmentId, assignment.classId))) {
      throw new NotFoundException(NOT_FOUND);
    }
    const already = await this.prisma.assignmentWithdrawal.findUnique({
      where: { assignmentId_userId: { assignmentId, userId } },
    });
    if (already) return { withdrawn: true };
    if (new Date() >= assignment.reviewDeadline) {
      throw new ConflictException('Termenul de evaluare a trecut, deci nu te mai poți retrage.');
    }

    await this.prisma.$transaction(async (tx) => {
      const locked = await lock(tx, assignmentId);
      await tx.assignmentWithdrawal.createMany({ data: [{ assignmentId, userId }], skipDuplicates: true });
      if (!locked.allocatedAt) return;
      const state = await loadState(tx, assignmentId);
      const unstarted = state.reviews.filter((p) => p.reviewerId === userId && !p.started);
      await apply(tx, reassign(state, unstarted, Math.random));
    });
    return { withdrawn: true };
  }

  /**
   * Someone became a reviewer after allocation, through the link or a team. Their unstarted
   * reviews of their own team move to others, then they take reviews from the busiest.
   */
  async lateJoin(userId: string, assignmentId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const assignment = await lock(tx, assignmentId);
      if (!assignment.allocatedAt || new Date() >= assignment.reviewDeadline) return;
      let state = await loadState(tx, assignmentId);
      const me = state.reviewers.find((r) => r.id === userId);
      if (!me) return; // withdrew earlier

      const teamOf = new Map(state.submissions.map((s) => [s.id, s.teamId]));
      const ownTeam = state.reviews.filter(
        (p) => p.reviewerId === userId && !p.started && me.teamId !== null && teamOf.get(p.submissionId) === me.teamId,
      );
      if (ownTeam.length > 0) {
        await apply(tx, reassign(state, ownTeam, Math.random));
        state = await loadState(tx, assignmentId);
      }
      await apply(tx, addLateReviewer(state, userId, Math.random));
    });
  }

  /** Joining a team is refused when the student already submitted a review of its submission. */
  async checkCanJoinTeam(userId: string, teamId: string): Promise<void> {
    const submitted = await this.prisma.review.count({
      where: { reviewerId: userId, status: ReviewStatus.SUBMITTED, submission: { teamId } },
    });
    if (submitted > 0) {
      throw new ConflictException('Ai evaluat deja proiectul acestei echipe, deci nu te poți alătura ei.');
    }
  }

  /** After a student joins a team, every allocated assignment of its class takes them in. */
  async afterTeamJoin(userId: string, classId: string): Promise<void> {
    const assignments = await this.prisma.assignment.findMany({
      where: { classId, allocatedAt: { not: null }, reviewDeadline: { gt: new Date() } },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    for (const { id } of assignments) {
      await this.lateJoin(userId, id);
    }
  }

  private async isReviewer(userId: string, assignmentId: string, classId: string): Promise<boolean> {
    const [member, linked] = await Promise.all([
      this.prisma.teamMember.count({ where: { userId, classId } }),
      this.prisma.assignmentReviewer.count({ where: { userId, assignmentId } }),
    ]);
    return member + linked > 0;
  }
}

async function lock(tx: Tx, assignmentId: string) {
  await tx.$queryRaw`SELECT 1 FROM "assignments" WHERE "id" = ${assignmentId}::uuid FOR UPDATE`;
  return tx.assignment.findUniqueOrThrow({
    where: { id: assignmentId },
    select: { k: true, allocatedAt: true, reviewDeadline: true },
  });
}

/**
 * The reviewers (members of the class's teams and link reviewers, minus those who withdrew),
 * the submissions of evaluated teams and the existing peer reviews of an assignment.
 */
async function loadState(tx: Tx, assignmentId: string): Promise<AllocationState> {
  const assignment = await tx.assignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: {
      chosenTeams: { select: { teamId: true } },
      submissions: { select: { id: true, teamId: true } },
      reviewers: { select: { userId: true } },
      withdrawals: { select: { userId: true } },
    },
  });
  const members = await tx.teamMember.findMany({
    where: { classId: assignment.classId },
    select: { userId: true, teamId: true },
  });
  const teamOf = new Map(members.map((m) => [m.userId, m.teamId]));
  const withdrawn = new Set(assignment.withdrawals.map((w) => w.userId));
  const ids = new Set([...members.map((m) => m.userId), ...assignment.reviewers.map((r) => r.userId)]);
  const scope = { rubricAppliesTo: assignment.rubricAppliesTo, chosenTeamIds: assignment.chosenTeams.map((t) => t.teamId) };
  const reviews = await tx.review.findMany({
    where: { submission: { assignmentId }, isCalibration: false },
    select: { submissionId: true, reviewerId: true, status: true },
  });

  return {
    submissions: assignment.submissions.filter((s) => teamIsEvaluated(scope, s.teamId)),
    reviewers: [...ids].filter((id) => !withdrawn.has(id)).map((id) => ({ id, teamId: teamOf.get(id) ?? null })),
    reviews: reviews.map((r) => ({
      submissionId: r.submissionId,
      reviewerId: r.reviewerId,
      started: r.status === ReviewStatus.SUBMITTED,
    })),
  };
}

async function apply(tx: Tx, change: Change): Promise<void> {
  if (change.remove.length > 0) {
    await tx.review.deleteMany({
      where: {
        status: ReviewStatus.ALLOCATED,
        OR: change.remove.map((p) => ({ submissionId: p.submissionId, reviewerId: p.reviewerId })),
      },
    });
  }
  if (change.add.length > 0) {
    await tx.review.createMany({ data: change.add });
  }
}
