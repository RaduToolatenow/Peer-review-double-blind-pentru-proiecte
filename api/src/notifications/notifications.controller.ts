import { Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, Roles, SessionGuard } from '../auth/session.guard';
import { Role } from '../generated/prisma/enums';
import { NotificationsService } from './notifications.service';

/** A student's notifications in the app (D-024). */
@Controller('my/notifications')
@UseGuards(SessionGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @Roles(Role.STUDENT)
  list(@Req() request: AuthenticatedRequest) {
    return this.notifications.list(request.user.id);
  }

  @Post('read')
  @HttpCode(204)
  @Roles(Role.STUDENT)
  async markRead(@Req() request: AuthenticatedRequest): Promise<void> {
    await this.notifications.markRead(request.user.id);
  }
}
