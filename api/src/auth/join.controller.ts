import { Controller, Get, HttpCode, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Role } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedRequest, Roles, SessionGuard } from './session.guard';

const UNKNOWN = 'Linkul temei nu mai este valid. Cere-i profesorului linkul corect.';

/** An assignment's sign-up link, /inscriere/<code> (D-010, D-020). */
@Controller('join')
export class JoinController {
  constructor(private readonly prisma: PrismaService) {}

  /** Public: the sign-up page shows which assignment the link is for. */
  @Get(':code')
  async info(@Param('code') code: string) {
    const assignment = await this.find(code);
    return { assignmentTitle: assignment.title, className: assignment.class.name };
  }

  /** A signed-in student becomes a reviewer of the assignment; doing it twice changes nothing. */
  @Post(':code')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  @Roles(Role.STUDENT)
  async join(@Param('code') code: string, @Req() request: AuthenticatedRequest) {
    const assignment = await this.find(code);
    await this.prisma.assignmentReviewer.upsert({
      where: { assignmentId_userId: { assignmentId: assignment.id, userId: request.user.id } },
      create: { assignmentId: assignment.id, userId: request.user.id },
      update: {},
    });
    return { assignmentTitle: assignment.title };
  }

  private async find(code: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { joinCode: code.slice(0, 64) },
      select: { id: true, title: true, class: { select: { name: true } } },
    });
    if (!assignment) {
      throw new NotFoundException(UNKNOWN);
    }
    return assignment;
  }
}
