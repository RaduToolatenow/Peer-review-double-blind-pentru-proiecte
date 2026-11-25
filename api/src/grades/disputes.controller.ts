import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, Roles, SessionGuard } from '../auth/session.guard';
import { Role } from '../generated/prisma/enums';
import { DecisionDto } from './dispute.dto';
import { DisputesService } from './disputes.service';

/** The professor lists and decides an assignment's disputes (D-027). */
@Controller('assignments/:id/disputes')
@UseGuards(SessionGuard)
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Get()
  @Roles(Role.PROFESSOR, Role.ADMIN)
  list(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.disputes.list(request.user.id, id);
  }

  @Post(':disputeId/decision')
  @HttpCode(200)
  @Roles(Role.PROFESSOR, Role.ADMIN)
  decide(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('disputeId', ParseUUIDPipe) disputeId: string,
    @Body() dto: DecisionDto,
  ) {
    return this.disputes.decide(request.user.id, id, disputeId, dto);
  }
}
