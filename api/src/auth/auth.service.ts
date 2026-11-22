import { ForbiddenException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PublicUser } from '../users/public-user';
import { hashForUnknownUser, verifyPassword } from './password';

const BAD_CREDENTIALS = 'Email sau parolă greșite.';

// Attempt limit (D-017): failures in the window block login until the window has passed
// since the latest failure.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_EMAIL_AND_IP = 5;
const MAX_FAILURES_PER_IP = 50;

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async validateCredentials(email: string, password: string, ip: string): Promise<PublicUser> {
    // Checked before the user is looked up, so a block looks the same for every email.
    await this.refuseIfBlocked(email, ip);

    const user = await this.prisma.user.findUnique({ where: { email } });
    // An unknown email is checked against a fixed hash, so it takes as long as a wrong password.
    const valid = await verifyPassword(user?.passwordHash ?? (await hashForUnknownUser()), password);
    // One message for both cases, so the response does not reveal which emails exist.
    if (!user || !valid) {
      await this.recordFailure(email, ip);
      throw new UnauthorizedException(BAD_CREDENTIALS);
    }

    await this.prisma.loginFailure.deleteMany({ where: { email, ip } });
    // D-020: only a confirmed account logs in. Said only after the right password.
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException('Confirmă-ți emailul înainte să intri. Linkul e în emailul de la înscriere.');
    }
    return { id: user.id, email: user.email, fullName: user.fullName, role: user.role };
  }

  private async refuseIfBlocked(email: string, ip: string): Promise<void> {
    const since = new Date(Date.now() - WINDOW_MS);
    const [forPair, forIp] = await Promise.all([
      this.prisma.loginFailure.aggregate({
        where: { email, ip, createdAt: { gt: since } },
        _count: true,
        _max: { createdAt: true },
      }),
      this.prisma.loginFailure.aggregate({
        where: { ip, createdAt: { gt: since } },
        _count: true,
        _max: { createdAt: true },
      }),
    ]);

    const latestBlocking = [
      forPair._count >= MAX_FAILURES_PER_EMAIL_AND_IP ? forPair._max.createdAt : null,
      forIp._count >= MAX_FAILURES_PER_IP ? forIp._max.createdAt : null,
    ].filter((date): date is Date => date !== null);
    if (latestBlocking.length === 0) {
      return;
    }

    const latest = Math.max(...latestBlocking.map((date) => date.getTime()));
    const minutes = Math.max(1, Math.ceil((latest + WINDOW_MS - Date.now()) / 60_000));
    const wait = minutes === 1 ? 'un minut' : `${minutes} minute`;
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: `Prea multe încercări nereușite. Încearcă din nou peste ${wait}.`,
        error: 'Too Many Requests',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private async recordFailure(email: string, ip: string): Promise<void> {
    // Failures older than the window no longer count, so they are removed here.
    await this.prisma.loginFailure.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - WINDOW_MS) } } });
    await this.prisma.loginFailure.create({ data: { email, ip } });
  }
}
