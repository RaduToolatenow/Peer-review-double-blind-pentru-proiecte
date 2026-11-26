import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AccountService } from '../auth/account.service';
import { Roles, SessionGuard } from '../auth/session.guard';
import { Role } from '../generated/prisma/enums';
import { isForeignKeyViolation } from '../prisma/db-errors';
import { PrismaService } from '../prisma/prisma.service';
import { RUBRIC_WITH_CRITERIA, rubricStatus, rubricSummary, rubricView } from '../rubrics/rubric-view';
import { ProfessorDto } from './professor.dto';

/** The admin opens each professor's rubrics, read only (D-015), and adds and deletes professors (D-034). */
@Controller('admin')
@UseGuards(SessionGuard)
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountService,
  ) {}

  @Get('professors')
  @Roles(Role.ADMIN)
  async professors() {
    const professors = await this.prisma.user.findMany({
      where: { role: Role.PROFESSOR },
      select: { id: true, fullName: true, email: true, rubrics: { select: { lockedAt: true, archivedAt: true } } },
      orderBy: { fullName: 'asc' },
    });
    return professors.map(({ rubrics, ...professor }) => ({
      ...professor,
      draftCount: rubrics.filter((r) => rubricStatus(r) === 'draft').length,
      activeCount: rubrics.filter((r) => rubricStatus(r) === 'active').length,
    }));
  }

  @Post('professors')
  @Roles(Role.ADMIN)
  addProfessor(@Body() body: ProfessorDto, @Req() request: Request) {
    return this.accounts.inviteProfessor(body.email, body.fullName, request.ip ?? '');
  }

  /**
   * D-034: deletes a professor and their drafts. The database refuses while they have a class or
   * a sent rubric (RESTRICT foreign keys), and the whole transaction is undone.
   */
  @Delete('professors/:id')
  @HttpCode(204)
  @Roles(Role.ADMIN)
  async deleteProfessor(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    const professor = await this.prisma.user.findFirst({ where: { id, role: Role.PROFESSOR }, select: { id: true } });
    if (!professor) {
      throw new NotFoundException('Nu am găsit profesorul.');
    }
    try {
      await this.prisma.$transaction([
        this.prisma.rubric.deleteMany({ where: { createdById: id, assignments: { none: {} } } }),
        this.prisma.user.delete({ where: { id } }),
      ]);
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ConflictException('Profesorul are clase sau grile trimise unei clase, așa că nu poate fi șters.');
      }
      throw error;
    }
    await this.prisma.$executeRaw`DELETE FROM "session" WHERE "sess"->>'userId' = ${id}`;
  }

  @Get('professors/:id/rubrics')
  @Roles(Role.ADMIN)
  async professorRubrics(@Param('id', ParseUUIDPipe) id: string) {
    const rubrics = await this.prisma.rubric.findMany({
      where: { createdById: id },
      include: { _count: { select: { criteria: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rubrics.map(rubricSummary);
  }

  @Get('rubrics/:id')
  @Roles(Role.ADMIN)
  async rubric(@Param('id', ParseUUIDPipe) id: string) {
    const rubric = await this.prisma.rubric.findUnique({ where: { id }, include: RUBRIC_WITH_CRITERIA });
    if (!rubric) {
      throw new NotFoundException('Nu am găsit grila.');
    }
    return rubricView(rubric);
  }
}
