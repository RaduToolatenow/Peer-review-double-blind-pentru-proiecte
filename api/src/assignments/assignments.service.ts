import { Injectable, NotFoundException } from '@nestjs/common';
import { ReviewStatus, RubricScope } from '../generated/prisma/enums';
import { appUrl } from '../mail/mailer';
import { PrismaService } from '../prisma/prisma.service';
import { RUBRIC_WITH_CRITERIA, rubricView } from '../rubrics/rubric-view';
import { teamIsEvaluated } from './assignment-scope';
import { checkDeadlinesStillOpen, checkNewDeadlines, DEADLINE_KEYS, Deadlines } from './deadlines';
import { UpdateAssignmentDto } from './update-assignment.dto';

/** The link, description and file URL of a team's submission; never who submitted it (D-014). */
function submissionFields(submission?: { id: string; link: string; description: string | null }) {
  return submission
    ? { link: submission.link, description: submission.description, fileUrl: `/api/submissions/${submission.id}/file` }
    : { link: null, description: null, fileUrl: null };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const ARCHIVE_DELAY_MS = 2 * DAY_MS;

export type Phase = 'submission' | 'review' | 'disputes' | 'closed';

export function phaseAt(deadlines: Deadlines, now: Date): Phase {
  if (now < deadlines.submissionDeadline) return 'submission';
  if (now < deadlines.reviewDeadline) return 'review';
  if (now < deadlines.disputeDeadline) return 'disputes';
  return 'closed';
}

const ASSIGNMENT_INCLUDE = {
  class: { select: { name: true, _count: { select: { teams: true } } } },
  rubric: { select: { title: true, archivedAt: true } },
  chosenTeams: { select: { teamId: true } },
} as const;

/**
 * Active rubrics: rubrics sent to a class (D-013). Only counts leave this service, never
 * who reviewed (D-014).
 */
@Injectable()
export class AssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, includeArchived: boolean) {
    const assignments = await this.prisma.assignment.findMany({
      where: { createdById: userId, ...(includeArchived ? {} : { rubric: { archivedAt: null } }) },
      include: ASSIGNMENT_INCLUDE,
      orderBy: { reviewDeadline: 'desc' },
    });
    const submissions = await this.prisma.submission.findMany({
      where: { assignmentId: { in: assignments.map((a) => a.id) } },
      select: { assignmentId: true, _count: { select: { reviews: { where: { status: ReviewStatus.SUBMITTED, isCalibration: false } } } } },
    });
    const counts = new Map<string, number>();
    for (const submission of submissions) {
      counts.set(submission.assignmentId, (counts.get(submission.assignmentId) ?? 0) + submission._count.reviews);
    }
    const now = new Date();
    return assignments.map((assignment) => this.summary(assignment, counts.get(assignment.id) ?? 0, now));
  }

  async detail(userId: string, id: string) {
    const assignment = await this.prisma.assignment.findFirst({
      where: { id, createdById: userId },
      include: {
        ...ASSIGNMENT_INCLUDE,
        rubric: { include: RUBRIC_WITH_CRITERIA },
        class: {
          select: {
            name: true,
            _count: { select: { teams: true } },
            teams: { orderBy: { name: 'asc' }, select: { id: true, name: true, memberNames: true } },
          },
        },
        submissions: {
          include: { _count: { select: { reviews: { where: { status: ReviewStatus.SUBMITTED, isCalibration: false } } } } },
        },
      },
    });
    if (!assignment) {
      throw new NotFoundException('Nu am găsit grila activă.');
    }

    const chosenTeamIds = assignment.chosenTeams.map((t) => t.teamId);
    const scope = { rubricAppliesTo: assignment.rubricAppliesTo, chosenTeamIds };
    const submissionByTeam = new Map(assignment.submissions.map((s) => [s.teamId, s]));
    const reviewsSubmitted = assignment.submissions.reduce((sum, s) => sum + s._count.reviews, 0);

    return {
      ...this.summary(
        { ...assignment, rubric: { title: assignment.rubric.title, archivedAt: assignment.rubric.archivedAt } },
        reviewsSubmitted,
        new Date(),
      ),
      rubric: rubricView(assignment.rubric),
      archivableFrom: new Date(assignment.reviewDeadline.getTime() + ARCHIVE_DELAY_MS),
      joinUrl: `${appUrl()}/inscriere/${assignment.joinCode}`,
      teams: assignment.class.teams.map((team) => ({
        id: team.id,
        name: team.name,
        memberNames: team.memberNames,
        evaluated: teamIsEvaluated(scope, team.id),
        submitted: submissionByTeam.has(team.id),
        reviewsReceived: submissionByTeam.get(team.id)?._count.reviews ?? 0,
        ...submissionFields(submissionByTeam.get(team.id)),
      })),
    };
  }

  async update(userId: string, id: string, dto: UpdateAssignmentDto) {
    const current = await this.prisma.assignment.findFirst({ where: { id, createdById: userId } });
    if (!current) {
      throw new NotFoundException('Nu am găsit grila activă.');
    }
    const changed = DEADLINE_KEYS.filter((key) => dto[key] !== undefined);
    const now = new Date();
    checkDeadlinesStillOpen(current, changed, now);
    const next: Deadlines = {
      submissionDeadline: dto.submissionDeadline ? new Date(dto.submissionDeadline) : current.submissionDeadline,
      reviewDeadline: dto.reviewDeadline ? new Date(dto.reviewDeadline) : current.reviewDeadline,
      disputeDeadline: dto.disputeDeadline ? new Date(dto.disputeDeadline) : current.disputeDeadline,
    };
    checkNewDeadlines(next, changed, now);

    await this.prisma.assignment.update({
      where: { id },
      data: { title: dto.title, description: dto.description, ...next },
    });
    return this.detail(userId, id);
  }

  private summary(
    assignment: Deadlines & {
      id: string;
      title: string;
      description: string | null;
      k: number;
      classId: string;
      rubricId: string;
      rubricAppliesTo: RubricScope;
      class: { name: string; _count: { teams: number } };
      rubric: { title: string; archivedAt: Date | null };
      chosenTeams: { teamId: string }[];
    },
    reviewsSubmitted: number,
    now: Date,
  ) {
    const evaluatedTeamCount =
      assignment.rubricAppliesTo === RubricScope.ALL ? assignment.class._count.teams : assignment.chosenTeams.length;
    return {
      id: assignment.id,
      title: assignment.title,
      description: assignment.description,
      k: assignment.k,
      submissionDeadline: assignment.submissionDeadline,
      reviewDeadline: assignment.reviewDeadline,
      disputeDeadline: assignment.disputeDeadline,
      appliesTo: assignment.rubricAppliesTo,
      classId: assignment.classId,
      className: assignment.class.name,
      rubricId: assignment.rubricId,
      rubricTitle: assignment.rubric.title,
      rubricArchived: assignment.rubric.archivedAt !== null,
      evaluatedTeamCount,
      reviewsSubmitted,
      reviewsExpected: evaluatedTeamCount * assignment.k,
      phase: phaseAt(assignment, now),
    };
  }
}
