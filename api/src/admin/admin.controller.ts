import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { Roles, SessionGuard } from '../auth/session.guard';
import { Role } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { RUBRIC_WITH_CRITERIA, rubricStatus, rubricSummary, rubricView } from '../rubrics/rubric-view';

/** The admin opens each professor's rubrics, read only (D-015). */
@Controller('admin')
@UseGuards(SessionGuard)
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

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
