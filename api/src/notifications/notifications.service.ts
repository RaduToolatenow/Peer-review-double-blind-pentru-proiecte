import { Inject, Injectable, Logger } from '@nestjs/common';
import { teamIsEvaluated } from '../assignments/assignment-scope';
import { NotificationKind, ReviewStatus } from '../generated/prisma/enums';
import { appUrl, MAILER, Mailer } from '../mail/mailer';
import { notificationEmail, notificationMessage } from '../mail/messages';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Emails sent in one run of the every-minute job; the rest wait for the next run (D-024). */
const EMAILS_PER_RUN = 50;

interface Due {
  userId: string;
  assignmentId: string;
  kind: NotificationKind;
  disputeId?: string;
}

/**
 * Notifications by email and in the app (D-024). The every-minute job records the due ones,
 * one row per student, assignment and event, then emails those not emailed yet.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  /** Records every notification due at `now`; one already recorded is skipped by the database. */
  async recordDue(now = new Date()): Promise<void> {
    const confirmed = { emailVerifiedAt: { not: null } };
    const soon = new Date(now.getTime() + DAY_MS);
    const due: Due[] = [];

    // Reviews allocated: every reviewer with a review on an allocated assignment still in review.
    const allocated = await this.prisma.review.findMany({
      where: {
        // D-025: the professor's calibration reviews are not allocated to them.
        isCalibration: false,
        reviewer: confirmed,
        submission: { assignment: { allocatedAt: { not: null }, reviewDeadline: { gt: now } } },
      },
      select: { reviewerId: true, submission: { select: { assignmentId: true } } },
    });
    for (const r of allocated) {
      due.push({ userId: r.reviewerId, assignmentId: r.submission.assignmentId, kind: NotificationKind.REVIEWS_ALLOCATED });
    }

    // Review reminder: unsent reviews in the 24 hours before the review deadline, not after a withdrawal.
    const owing = await this.prisma.review.findMany({
      where: {
        status: ReviewStatus.ALLOCATED,
        reviewer: confirmed,
        submission: { assignment: { reviewDeadline: { gt: now, lte: soon } } },
      },
      select: {
        reviewerId: true,
        reviewer: { select: { withdrawals: { select: { assignmentId: true } } } },
        submission: { select: { assignmentId: true } },
      },
    });
    for (const r of owing) {
      const assignmentId = r.submission.assignmentId;
      if (r.reviewer.withdrawals.some((w) => w.assignmentId === assignmentId)) continue;
      due.push({ userId: r.reviewerId, assignmentId, kind: NotificationKind.REVIEW_REMINDER });
    }

    // Submission reminder: members of evaluated teams without a submission, in the last 24 hours.
    const closing = await this.prisma.assignment.findMany({
      where: { submissionDeadline: { gt: now, lte: soon } },
      select: {
        id: true,
        rubricAppliesTo: true,
        chosenTeams: { select: { teamId: true } },
        submissions: { select: { teamId: true } },
        class: { select: { teams: { select: { id: true, members: { where: { user: confirmed }, select: { userId: true } } } } } },
      },
    });
    for (const a of closing) {
      const scope = { rubricAppliesTo: a.rubricAppliesTo, chosenTeamIds: a.chosenTeams.map((t) => t.teamId) };
      const submitted = new Set(a.submissions.map((s) => s.teamId));
      for (const team of a.class.teams) {
        if (!teamIsEvaluated(scope, team.id) || submitted.has(team.id)) continue;
        for (const m of team.members) {
          due.push({ userId: m.userId, assignmentId: a.id, kind: NotificationKind.SUBMISSION_REMINDER });
        }
      }
    }

    // D-027: a dispute decided, to every confirmed member of the disputing team, once per dispute.
    const decided = await this.prisma.dispute.findMany({
      where: { decidedAt: { not: null } },
      select: {
        id: true,
        review: {
          select: {
            submission: {
              select: { assignmentId: true, team: { select: { members: { where: { user: confirmed }, select: { userId: true } } } } },
            },
          },
        },
      },
    });
    for (const d of decided) {
      const { assignmentId, team } = d.review.submission;
      for (const m of team.members) {
        due.push({ userId: m.userId, assignmentId, kind: NotificationKind.DISPUTE_DECIDED, disputeId: d.id });
      }
    }

    if (due.length > 0) {
      await this.prisma.notification.createMany({ data: due, skipDuplicates: true });
    }
  }

  /** Emails the notifications not emailed yet. A failed send stops the run; the next run tries again. */
  async sendPending(): Promise<void> {
    const pending = await this.prisma.notification.findMany({
      where: { emailedAt: null },
      orderBy: { createdAt: 'asc' },
      take: EMAILS_PER_RUN,
      select: { id: true, userId: true, user: { select: { email: true } } },
    });
    for (const row of pending) {
      const [view] = await this.views(row.userId, { id: row.id });
      try {
        await this.mailer.send(notificationEmail(row.user.email, view, `${appUrl()}/`));
      } catch (error) {
        this.logger.error(`Notification ${row.id} not emailed: ${(error as Error).message}`);
        return;
      }
      await this.prisma.notification.update({ where: { id: row.id }, data: { emailedAt: new Date() } });
    }
  }

  /** A student's notifications, newest first, with how many are unread. */
  async list(userId: string) {
    const notifications = await this.views(userId);
    return { unread: notifications.filter((n) => !n.read).length, notifications };
  }

  async markRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  }

  /** Notifications as shown: their text is built now, from the assignment and the student's reviews. */
  private async views(userId: string, where: { id?: string } = {}) {
    const [rows, reviews] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId, ...where },
        orderBy: { createdAt: 'desc' },
        include: {
          assignment: { select: { title: true, submissionDeadline: true, reviewDeadline: true } },
          dispute: { select: { status: true, criterion: { select: { title: true } } } },
        },
      }),
      this.prisma.review.findMany({
        where: { reviewerId: userId },
        select: { status: true, submission: { select: { assignmentId: true } } },
      }),
    ]);
    return rows.map((n) => {
      const mine = reviews.filter((r) => r.submission.assignmentId === n.assignmentId);
      const message = notificationMessage({
        kind: n.kind,
        assignmentTitle: n.assignment.title,
        submissionDeadline: n.assignment.submissionDeadline,
        reviewDeadline: n.assignment.reviewDeadline,
        reviewCount: mine.length,
        unsentCount: mine.filter((r) => r.status === ReviewStatus.ALLOCATED).length,
        dispute: n.dispute ? { criterionTitle: n.dispute.criterion.title, upheld: n.dispute.status === 'UPHELD' } : undefined,
      });
      return {
        id: n.id,
        kind: n.kind,
        assignmentId: n.assignmentId,
        title: message.title,
        text: message.text,
        createdAt: n.createdAt,
        read: n.readAt !== null,
      };
    });
  }
}
