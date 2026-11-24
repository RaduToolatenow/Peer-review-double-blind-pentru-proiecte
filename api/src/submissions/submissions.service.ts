import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { teamIsEvaluated } from '../assignments/assignment-scope';
import { phaseAt } from '../assignments/assignments.service';
import { PrismaService } from '../prisma/prisma.service';
import { cleanDocx } from './clean-docx';
import { cleanPdf } from './clean-pdf';
import { FILE_STORE, FileStore } from './file-store';
import { CONTENT_TYPES, detectFileType, FileType } from './file-type';
import { SubmissionDto, UploadedFileData } from './submission.dto';

const NOT_FOUND = 'Nu am găsit tema.';

interface StoredSubmission {
  id: string;
  link: string;
  description: string | null;
  fileType: string;
  submittedAt: Date;
  updatedAt: Date;
}

/** What may leave the server about a submission: never who submitted it (D-014). */
export function submissionView(submission: StoredSubmission) {
  return {
    id: submission.id,
    link: submission.link,
    description: submission.description,
    fileType: submission.fileType,
    fileUrl: `/api/submissions/${submission.id}/file`,
    submittedAt: submission.submittedAt,
    updatedAt: submission.updatedAt,
  };
}

/** Students hand in a link and a cleaned file for their team (D-016). */
@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(FILE_STORE) private readonly files: FileStore,
  ) {}

  /**
   * The assignments a student's teams are evaluated in, with their team's submission, and those
   * they joined through the link as a reviewer only (`teamName` null, D-022).
   */
  async myAssignments(userId: string) {
    const [memberships, linked, withdrawals] = await Promise.all([
      this.prisma.teamMember.findMany({
        where: { userId },
        select: { classId: true, teamId: true, team: { select: { name: true } } },
      }),
      this.prisma.assignmentReviewer.findMany({ where: { userId }, select: { assignmentId: true } }),
      this.prisma.assignmentWithdrawal.findMany({ where: { userId }, select: { assignmentId: true } }),
    ]);
    const teamByClass = new Map(memberships.map((m) => [m.classId, m]));
    const linkedIds = new Set(linked.map((l) => l.assignmentId));
    const withdrawnIds = new Set(withdrawals.map((w) => w.assignmentId));
    const assignments = await this.prisma.assignment.findMany({
      where: { OR: [{ classId: { in: [...teamByClass.keys()] } }, { id: { in: [...linkedIds] } }] },
      include: {
        class: { select: { name: true } },
        chosenTeams: { select: { teamId: true } },
        submissions: { where: { teamId: { in: memberships.map((m) => m.teamId) } } },
      },
      orderBy: { submissionDeadline: 'asc' },
    });
    const now = new Date();
    return assignments.flatMap((a) => {
      const membership = teamByClass.get(a.classId);
      const evaluated =
        membership !== undefined &&
        teamIsEvaluated({ rubricAppliesTo: a.rubricAppliesTo, chosenTeamIds: a.chosenTeams.map((t) => t.teamId) }, membership.teamId);
      if (!evaluated && !linkedIds.has(a.id)) return [];
      const withdrawn = withdrawnIds.has(a.id);
      return [
        {
          id: a.id,
          title: a.title,
          description: a.description,
          className: a.class.name,
          teamName: evaluated ? membership.team.name : null,
          submissionDeadline: a.submissionDeadline,
          reviewDeadline: a.reviewDeadline,
          disputeDeadline: a.disputeDeadline,
          phase: phaseAt(a, now),
          submission: evaluated && a.submissions[0] ? submissionView(a.submissions[0]) : null,
          withdrawn,
          canWithdraw: !withdrawn && now < a.reviewDeadline,
        },
      ];
    });
  }

  async submit(userId: string, assignmentId: string, dto: SubmissionDto, file: UploadedFileData | undefined) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { chosenTeams: { select: { teamId: true } } },
    });
    const membership = assignment
      ? await this.prisma.teamMember.findUnique({ where: { classId_userId: { classId: assignment.classId, userId } } })
      : null;
    if (!assignment || !membership) {
      throw new NotFoundException(NOT_FOUND);
    }
    const scope = { rubricAppliesTo: assignment.rubricAppliesTo, chosenTeamIds: assignment.chosenTeams.map((t) => t.teamId) };
    if (!teamIsEvaluated(scope, membership.teamId)) {
      throw new ForbiddenException('Echipa ta nu este evaluată la această temă.');
    }
    // The submission deadline is enforced here, on the server.
    if (new Date() >= assignment.submissionDeadline) {
      throw new ConflictException('Termenul de predare a trecut.');
    }
    if (!file || file.size === 0) {
      throw new BadRequestException('Încarcă fișierul proiectului (PDF sau DOCX).');
    }
    const fileType = detectFileType(file.buffer);
    if (!fileType) {
      throw new BadRequestException('Fișierul trebuie să fie PDF sau DOCX.');
    }

    const cleaned = await this.clean(fileType, file.buffer);
    const fileKey = `${randomUUID()}.${fileType}`;
    await this.files.put(fileKey, cleaned, CONTENT_TYPES[fileType]);

    const where = { assignmentId_teamId: { assignmentId, teamId: membership.teamId } };
    const previous = await this.prisma.submission.findUnique({ where });
    const data = { link: dto.link, description: dto.description || null, fileKey, fileType };
    try {
      await this.prisma.submission.upsert({
        where,
        create: { assignmentId, teamId: membership.teamId, ...data },
        update: data,
      });
    } catch (error) {
      await this.files.delete(fileKey);
      throw error;
    }
    if (previous) {
      await this.files.delete(previous.fileKey);
    }
    return (await this.myAssignments(userId)).find((a) => a.id === assignmentId)!;
  }

  /** The cleaned file, for the assignment's professor or a member of the team; 404 for anyone else. */
  async download(userId: string, submissionId: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: { assignment: { select: { createdById: true } }, team: { select: { members: { where: { userId } } } } },
    });
    const allowed = submission && (submission.assignment.createdById === userId || submission.team.members.length > 0);
    const data = allowed ? await this.files.get(submission.fileKey) : null;
    if (!submission || !data) {
      throw new NotFoundException('Nu am găsit fișierul.');
    }
    const fileType = submission.fileType as FileType;
    return {
      data,
      contentType: CONTENT_TYPES[fileType],
      fileName: `predare-${submission.id.slice(0, 8)}.${fileType}`,
    };
  }

  private async clean(fileType: FileType, file: Buffer): Promise<Buffer> {
    try {
      return fileType === 'pdf' ? await cleanPdf(file) : cleanDocx(file);
    } catch {
      throw new BadRequestException('Fișierul nu poate fi citit. Salvează-l din nou ca PDF sau DOCX și reîncearcă.');
    }
  }
}
