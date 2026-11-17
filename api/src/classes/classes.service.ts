import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { isForeignKeyViolation, isUniqueViolation } from '../prisma/db-errors';
import { PrismaService } from '../prisma/prisma.service';
import { ClassDto, TeamDto, UpdateTeamDto } from './class.dto';
import { newJoinCode } from './join-code';

const DUPLICATE_TEAM = 'Există deja o echipă cu acest nume în clasă.';
const UNKNOWN_CODE = 'Codul nu există. Verifică-l sau cere-i profesorului unul nou.';

interface StoredTeam {
  id: string;
  name: string;
  memberNames: string;
  joinCode: string;
  _count: { members: number };
}

/** Only how many accounts joined leaves the server, never which (D-012, D-014). */
function teamView(team: StoredTeam) {
  return {
    id: team.id,
    name: team.name,
    memberNames: team.memberNames,
    joinCode: team.joinCode,
    joinedCount: team._count.members,
  };
}

const TEAM_COUNT = { _count: { select: { members: true } } } as const;

/** A professor's classes and their teams, entered from paper (D-012). */
@Injectable()
export class ClassesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const classes = await this.prisma.class.findMany({
      where: { createdById: userId },
      include: { _count: { select: { teams: true, assignments: true } } },
      orderBy: { name: 'asc' },
    });
    return classes.map((c) => ({
      id: c.id,
      name: c.name,
      teamCount: c._count.teams,
      assignmentCount: c._count.assignments,
    }));
  }

  async create(userId: string, dto: ClassDto) {
    const created = await this.prisma.class.create({ data: { name: dto.name, createdById: userId } });
    return this.detail(userId, created.id);
  }

  async detail(userId: string, id: string) {
    const klass = await this.prisma.class.findFirst({
      where: { id, createdById: userId },
      include: {
        _count: { select: { assignments: true } },
        teams: { orderBy: { name: 'asc' }, include: TEAM_COUNT },
      },
    });
    if (!klass) {
      throw new NotFoundException('Nu am găsit clasa.');
    }
    return {
      id: klass.id,
      name: klass.name,
      assignmentCount: klass._count.assignments,
      teams: klass.teams.map(teamView),
    };
  }

  async rename(userId: string, id: string, dto: ClassDto) {
    await this.detail(userId, id);
    await this.prisma.class.update({ where: { id }, data: { name: dto.name } });
    return this.detail(userId, id);
  }

  async remove(userId: string, id: string) {
    await this.detail(userId, id);
    try {
      await this.prisma.class.delete({ where: { id } });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ConflictException('Clasei i-ai trimis deja o grilă, așa că nu se poate șterge.');
      }
      throw error;
    }
  }

  async addTeam(userId: string, classId: string, dto: TeamDto) {
    await this.detail(userId, classId);
    try {
      const team = await this.prisma.team.create({
        data: { classId, name: dto.name, memberNames: dto.memberNames ?? '', joinCode: await this.freeCode() },
        include: TEAM_COUNT,
      });
      return teamView(team);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(DUPLICATE_TEAM);
      throw error;
    }
  }

  async updateTeam(userId: string, teamId: string, dto: UpdateTeamDto) {
    await this.findOwnTeam(userId, teamId);
    try {
      const team = await this.prisma.team.update({
        where: { id: teamId },
        data: { name: dto.name, memberNames: dto.memberNames },
        include: TEAM_COUNT,
      });
      return teamView(team);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(DUPLICATE_TEAM);
      throw error;
    }
  }

  async removeTeam(userId: string, teamId: string) {
    await this.findOwnTeam(userId, teamId);
    // Deleting a team would cascade to its submissions and the reviews of them.
    if ((await this.prisma.submission.count({ where: { teamId } })) > 0) {
      throw new ConflictException('Echipa are deja o predare și nu se poate șterge.');
    }
    await this.prisma.team.delete({ where: { id: teamId } });
  }

  /** A new code replaces the old one; accounts that already joined stay in the team. */
  async newCode(userId: string, teamId: string) {
    await this.findOwnTeam(userId, teamId);
    const team = await this.prisma.team.update({
      where: { id: teamId },
      data: { joinCode: await this.freeCode() },
      include: TEAM_COUNT,
    });
    return teamView(team);
  }

  async join(userId: string, code: string) {
    const team = await this.prisma.team.findUnique({
      where: { joinCode: code },
      include: { class: { select: { name: true } } },
    });
    if (!team) {
      throw new NotFoundException(UNKNOWN_CODE);
    }
    try {
      await this.prisma.teamMember.create({ data: { teamId: team.id, classId: team.classId, userId } });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Ești deja într-o echipă din această clasă.');
      throw error;
    }
    return { className: team.class.name, teamName: team.name };
  }

  private async findOwnTeam(userId: string, teamId: string) {
    const team = await this.prisma.team.findFirst({ where: { id: teamId, class: { createdById: userId } } });
    if (!team) {
      throw new NotFoundException('Nu am găsit echipa.');
    }
    return team;
  }

  private async freeCode(): Promise<string> {
    for (;;) {
      const code = newJoinCode();
      if (!(await this.prisma.team.findUnique({ where: { joinCode: code }, select: { id: true } }))) {
        return code;
      }
    }
  }
}
