import { Controller, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, Roles, SessionGuard } from '../auth/session.guard';
import { Role } from '../generated/prisma/enums';
import { AllocationService } from './allocation.service';

/** A student withdraws from an assignment (D-022). */
@Controller('my/assignments')
@UseGuards(SessionGuard)
export class AllocationController {
  constructor(private readonly allocation: AllocationService) {}

  @Post(':id/withdraw')
  @HttpCode(200)
  @Roles(Role.STUDENT)
  withdraw(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.allocation.withdraw(request.user.id, id);
  }
}
