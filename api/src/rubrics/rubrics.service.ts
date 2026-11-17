import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AssignmentsService } from '../assignments/assignments.service';
import { checkNewDeadlines, DEADLINE_KEYS, formatRo } from '../assignments/deadlines';
import { RubricScope } from '../generated/prisma/enums';
import {
  archiveAllowedFrom,
  isArchivedRubric,
  isForeignKeyViolation,
  isLockedRubric,
} from '../prisma/db-errors';
import { PrismaService } from '../prisma/prisma.service';
import { checkCriteria, CriterionInput, RubricDto, SendRubricDto } from './rubric.dto';
import { RUBRIC_WITH_CRITERIA, rubricSummary, rubricView } from './rubric-view';

const LOCKED = 'Grila a fost trimisă și nu se mai modifică. Fă o copie.';

function criteriaCreate(criteria: CriterionInput[]) {
  return criteria.map((criterion, index) => ({
    title: criterion.title,
    weight: criterion.weight,
    position: index + 1,
    levels: { create: criterion.levels },
  }));
}

/** A professor's own rubrics (D-011, D-013, D-015). Locking and archiving rules live in the database. */
@Injectable()
export class RubricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assignments: AssignmentsService,
  ) {}

  async listDrafts(userId: string) {
    const rubrics = await this.prisma.rubric.findMany({
      where: { createdById: userId, lockedAt: null },
      include: { _count: { select: { criteria: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rubrics.map(rubricSummary);
  }

  async get(userId: string, id: string) {
    return rubricView(await this.findOwn(userId, id));
  }

  async create(userId: string, dto: RubricDto) {
    const criteria = checkCriteria(dto.criteria);
    const rubric = await this.prisma.rubric.create({
      data: { title: dto.title, createdById: userId, criteria: { create: criteriaCreate(criteria) } },
      include: RUBRIC_WITH_CRITERIA,
    });
    return rubricView(rubric);
  }

  async replace(userId: string, id: string, dto: RubricDto) {
    await this.findOwn(userId, id);
    const criteria = checkCriteria(dto.criteria);
    try {
      const rubric = await this.prisma.$transaction(async (tx) => {
        await tx.rubricCriterion.deleteMany({ where: { rubricId: id } });
        return tx.rubric.update({
          where: { id },
          data: { title: dto.title, criteria: { create: criteriaCreate(criteria) } },
          include: RUBRIC_WITH_CRITERIA,
        });
      });
      return rubricView(rubric);
    } catch (error) {
      if (isLockedRubric(error)) throw new ConflictException(LOCKED);
      throw error;
    }
  }

  async copy(userId: string, id: string) {
    const original = await this.findOwn(userId, id);
    const rubric = await this.prisma.rubric.create({
      data: {
        title: `Copie — ${original.title}`.slice(0, 200),
        createdById: userId,
        criteria: {
          create: criteriaCreate(
            original.criteria.map((c) => ({
              title: c.title,
              weight: c.weight,
              levels: c.levels.map((l) => ({ score: l.score, descriptor: l.descriptor })),
            })),
          ),
        },
      },
      include: RUBRIC_WITH_CRITERIA,
    });
    return rubricView(rubric);
  }

  async remove(userId: string, id: string) {
    await this.findOwn(userId, id);
    try {
      await this.prisma.rubric.delete({ where: { id } });
    } catch (error) {
      if (isForeignKeyViolation(error) || isLockedRubric(error)) {
        throw new ConflictException('Grila a fost trimisă și nu se poate șterge.');
      }
      throw error;
    }
  }

  async archive(userId: string, id: string) {
    const rubric = await this.findOwn(userId, id);
    if (!rubric.lockedAt) {
      throw new ConflictException('Doar o grilă trimisă se arhivează. O schiță se șterge.');
    }
    try {
      await this.prisma.rubric.update({ where: { id }, data: { archivedAt: new Date() } });
    } catch (error) {
      const from = archiveAllowedFrom(error);
      if (from) throw new ConflictException(`Grila poate fi arhivată după ${formatRo(from)}.`);
      throw error;
    }
    return this.get(userId, id);
  }

  /** Sends a draft to a class: creates the assignment, which locks the rubric (D-013). */
  async send(userId: string, id: string, dto: SendRubricDto) {
    const rubric = await this.findOwn(userId, id);
    const klass = await this.prisma.class.findFirst({
      where: { id: dto.classId, createdById: userId },
      include: { teams: { select: { id: true } } },
    });
    if (!klass) {
      throw new NotFoundException('Nu am găsit clasa.');
    }
    if (rubric.criteria.length === 0) {
      throw new BadRequestException('Grila trebuie să aibă cel puțin un criteriu.');
    }
    const deadlines = {
      submissionDeadline: new Date(dto.submissionDeadline),
      reviewDeadline: new Date(dto.reviewDeadline),
      disputeDeadline: new Date(dto.disputeDeadline),
    };
    checkNewDeadlines(deadlines, DEADLINE_KEYS, new Date());

    const teamIds = dto.appliesTo === RubricScope.SELECTED ? [...new Set(dto.teamIds ?? [])] : [];
    if (dto.appliesTo === RubricScope.SELECTED) {
      if (teamIds.length === 0) {
        throw new BadRequestException('Alege cel puțin o echipă.');
      }
      const classTeams = new Set(klass.teams.map((t) => t.id));
      if (!teamIds.every((teamId) => classTeams.has(teamId))) {
        throw new BadRequestException('Alege doar echipe din clasa căreia îi trimiți grila.');
      }
    }

    try {
      const assignment = await this.prisma.$transaction(async (tx) => {
        const created = await tx.assignment.create({
          data: {
            title: dto.title,
            description: dto.description,
            k: dto.k,
            ...deadlines,
            rubricId: id,
            classId: klass.id,
            rubricAppliesTo: dto.appliesTo,
            createdById: userId,
          },
        });
        await tx.assignmentTeam.createMany({
          data: teamIds.map((teamId) => ({ assignmentId: created.id, teamId, classId: klass.id })),
        });
        return created;
      });
      return this.assignments.detail(userId, assignment.id);
    } catch (error) {
      if (isArchivedRubric(error)) throw new ConflictException('Grila este arhivată și nu mai poate fi trimisă.');
      throw error;
    }
  }

  private async findOwn(userId: string, id: string) {
    const rubric = await this.prisma.rubric.findFirst({
      where: { id, createdById: userId },
      include: RUBRIC_WITH_CRITERIA,
    });
    if (!rubric) {
      throw new NotFoundException('Nu am găsit grila.');
    }
    return rubric;
  }
}
