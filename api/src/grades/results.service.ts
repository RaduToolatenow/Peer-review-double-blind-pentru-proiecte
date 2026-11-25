import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { teamIsEvaluated } from '../assignments/assignment-scope';
import { PrismaService } from '../prisma/prisma.service';
import { explain } from './grade';
import { loadGrading, round2 } from './grading';

const NOT_FOUND = 'Nu am găsit rezultatele.';

type Grading = NonNullable<Awaited<ReturnType<typeof loadGrading>>>;

/**
 * D-026: the results page. Every step of the grade is shown, the reviewers only as numbers
 * in the order of their review ids; the professor's calibration is one of them, unlabelled.
 */
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
        const results = available ? await this.results(a.id, teamByClass.get(a.classId)!) : null;
        return {
          assignmentId: a.id,
          title: a.title,
          className: a.class.name,
          teamName: a.submissions[0].team.name,
          reviewDeadline: a.reviewDeadline,
          available,
          grade: results?.grade ?? null,
        };
      }),
    );
  }

  /** A team member's results, after the review deadline. */
  async forStudent(userId: string, assignmentId: string) {
    const assignment = await this.prisma.assignment.findUnique({ where: { id: assignmentId }, select: { classId: true } });
    const membership = assignment
      ? await this.prisma.teamMember.findUnique({ where: { classId_userId: { classId: assignment.classId, userId } } })
      : null;
    const results = membership ? await this.results(assignmentId, membership.teamId) : null;
    if (!results) {
      throw new NotFoundException(NOT_FOUND);
    }
    if (results.provisional) {
      throw new ConflictException('Rezultatele apar după termenul de evaluare.');
    }
    return results;
  }

  /** The professor's view of one team, provisional before the review deadline. */
  async forProfessor(userId: string, assignmentId: string, teamId: string) {
    const grading = await loadGrading(this.prisma, { id: assignmentId, createdById: userId });
    if (!grading) {
      throw new NotFoundException('Nu am găsit grila activă.');
    }
    if (grading.assignment.allocatedAt === null) {
      throw new ConflictException('Rezultatele apar după alocarea evaluatorilor.');
    }
    const results = this.view(grading, teamId);
    if (!results) {
      throw new NotFoundException(NOT_FOUND);
    }
    return results;
  }

  private async results(assignmentId: string, teamId: string) {
    const grading = await loadGrading(this.prisma, { id: assignmentId });
    return grading ? this.view(grading, teamId) : null;
  }

  /** Null when the team is not evaluated or has no submission. */
  private view({ assignment, criteria, submissions, reviews, reliability }: Grading, teamId: string) {
    const submission = submissions.find((s) => s.teamId === teamId);
    if (!submission) {
      return null;
    }
    const sent = reviews.filter((r) => r.submissionId === submission.id);
    const explained = explain(criteria, sent, reliability);
    return {
      assignmentId: assignment.id,
      title: assignment.title,
      teamName: submission.team.name,
      reviewDeadline: assignment.reviewDeadline,
      provisional: new Date() < assignment.reviewDeadline,
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
            return { number: index + 1, score: score.level.score, descriptor: score.level.descriptor, feedback: score.feedback };
          }),
        };
      }),
    };
  }
}
