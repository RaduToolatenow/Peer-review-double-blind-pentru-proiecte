import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, Roles, SessionGuard } from '../auth/session.guard';
import { Role } from '../generated/prisma/enums';
import { AssignmentsService } from './assignments.service';
import { UpdateAssignmentDto } from './update-assignment.dto';

/** Active rubrics, the rubrics a professor sent to a class (D-013, D-015). */
@Controller('assignments')
@UseGuards(SessionGuard)
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get()
  @Roles(Role.PROFESSOR, Role.ADMIN)
  list(@Req() request: AuthenticatedRequest, @Query('archived') archived?: string) {
    return this.assignments.list(request.user.id, archived === 'true');
  }

  @Get(':id')
  @Roles(Role.PROFESSOR, Role.ADMIN)
  detail(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.assignments.detail(request.user.id, id);
  }

  @Patch(':id')
  @Roles(Role.PROFESSOR, Role.ADMIN)
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateAssignmentDto,
  ) {
    return this.assignments.update(request.user.id, id, body);
  }
}
