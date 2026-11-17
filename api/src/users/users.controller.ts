import { Controller, Get, UseGuards } from '@nestjs/common';
import { Roles, SessionGuard } from '../auth/session.guard';
import { Role } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_USER_SELECT, PublicUser } from './public-user';

@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  /** Staff accounts in full; students only as a count, since their emails are never shown (D-014). */
  @Get()
  @UseGuards(SessionGuard)
  @Roles(Role.ADMIN)
  async list(): Promise<{ staff: PublicUser[]; studentCount: number }> {
    const [staff, studentCount] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: { in: [Role.PROFESSOR, Role.ADMIN] } },
        select: PUBLIC_USER_SELECT,
        orderBy: { email: 'asc' },
      }),
      this.prisma.user.count({ where: { role: Role.STUDENT } }),
    ]);
    return { staff, studentCount };
  }
}
