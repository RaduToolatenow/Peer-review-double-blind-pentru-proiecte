import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, Roles, SessionGuard } from '../auth/session.guard';
import { Role } from '../generated/prisma/enums';
import { ReviewDto } from '../reviews/review.dto';
import { GradesService } from './grades.service';

/** The professor's calibration reviews and an assignment's grades (D-025). */
@Controller('assignments/:id')
@UseGuards(SessionGuard)
export class GradesController {
  constructor(private readonly grades: GradesService) {}

  @Get('grades')
  @Roles(Role.PROFESSOR, Role.ADMIN)
  list(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.grades.grades(request.user.id, id);
  }

  @Get('submissions/:submissionId/calibration')
  @Roles(Role.PROFESSOR, Role.ADMIN)
  calibration(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
  ) {
    return this.grades.calibration(request.user.id, id, submissionId);
  }

  @Post('submissions/:submissionId/calibration')
  @HttpCode(200)
  @Roles(Role.PROFESSOR, Role.ADMIN)
  calibrate(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @Body() dto: ReviewDto,
  ) {
    return this.grades.calibrate(request.user.id, id, submissionId, dto);
  }
}
