import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, Roles, SessionGuard } from '../auth/session.guard';
import { Role } from '../generated/prisma/enums';
import { DisputeDto } from './dispute.dto';
import { RatingDto } from './rating.dto';
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

  /** D-027: a team member disputes one criterion of a received review. */
  @Post('my/results/:id/disputes')
  @HttpCode(200)
  @Roles(Role.STUDENT)
  dispute(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DisputeDto) {
    return this.results.dispute(request.user.id, id, dto);
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

  /** D-028: the professor rates the feedback of a team's review, by its number. */
  @Put('assignments/:id/teams/:teamId/reviews/:number/rating')
  @Roles(Role.PROFESSOR, Role.ADMIN)
  rate(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('number', ParseIntPipe) number: number,
    @Body() dto: RatingDto,
  ) {
    return this.results.rate(request.user.id, id, teamId, number, dto);
  }
}
