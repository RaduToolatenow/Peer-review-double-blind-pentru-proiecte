import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PublicUser } from '../users/public-user';
import { verifyPassword } from './password';

const BAD_CREDENTIALS = 'Email sau parolă greșite.';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async validateCredentials(email: string, password: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // One message for both cases, so the response does not reveal which emails exist.
    if (!user || !(await verifyPassword(user.passwordHash, password))) {
      throw new UnauthorizedException(BAD_CREDENTIALS);
    }
    return { id: user.id, email: user.email, fullName: user.fullName, role: user.role };
  }
}
