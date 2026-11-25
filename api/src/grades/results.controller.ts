import { Controller, Get, Param, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, Roles, SessionGuard } from '../auth/session.guard';
import { Role } from '../generated/prisma/enums';
import { ResultsService } from './results.service';

/** The results page that explains the grade (D-026). */
@Controller()
@UseGuards(SessionGuard)
export class ResultsController {
  constructor(private readonly results: ResultsService) {}

  @Get('my/results')
  @Roles(Role.STUDENT)
  mine(@Req() request: AuthenticatedRequest) {
    return this.results.mine(request.user.id);
  }

  @Get('my/results/:id')
  @Roles(Role.STUDENT)
  forStudent(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.results.forStudent(request.user.id, id);
  }

  @Get('assignments/:id/teams/:teamId/results')
  @Roles(Role.PROFESSOR, Role.ADMIN)
  forProfessor(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('teamId', ParseUUIDPipe) teamId: string,
  ) {
    return this.results.forProfessor(request.user.id, id, teamId);
  }
}
