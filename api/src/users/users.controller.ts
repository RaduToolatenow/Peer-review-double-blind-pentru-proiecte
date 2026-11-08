import { Controller, Get, UseGuards } from '@nestjs/common';
import { Roles, SessionGuard } from '../auth/session.guard';
import { Role } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_USER_SELECT, PublicUser } from './public-user';

@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @UseGuards(SessionGuard)
  @Roles(Role.ADMIN)
  list(): Promise<PublicUser[]> {
    return this.prisma.user.findMany({ select: PUBLIC_USER_SELECT, orderBy: { email: 'asc' } });
  }
}
