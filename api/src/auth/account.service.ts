import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AllocationService } from '../allocation/allocation.service';
import { Email } from '../mail/mailer';
import { EmailTokenPurpose, Role } from '../generated/prisma/enums';
import { appUrl, Mailer, MAILER } from '../mail/mailer';
import { accountExistsEmail, confirmEmail, resetPasswordEmail } from '../mail/messages';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from './password';

const HOUR_MS = 60 * 60 * 1000;
const VERIFY_VALID_MS = 24 * HOUR_MS;
const RESET_VALID_MS = HOUR_MS;
const MAX_EMAILS_PER_ADDRESS = 3;
const MAX_EMAILS_PER_IP = 20;

export const SENT_CONFIRMATION =
  'Ți-am trimis un email. Deschide linkul din el ca să-ți confirmi contul. Verifică și folderul Spam.';
const SENT_RESET =
  'Dacă există un cont cu această adresă, ți-am trimis un link pentru o parolă nouă. Verifică și folderul Spam.';
const INVALID_LINK = 'Linkul nu mai este valid. Cere unul nou din pagina de autentificare.';

const sha256 = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Sign-up, email confirmation and password reset (D-010, D-020). Every answer is the same
 * whatever the address, so these routes never reveal which addresses have accounts.
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly allocation: AllocationService,
  ) {}

  async register(email: string, password: string, joinCode: string | undefined, ip: string) {
    const assignment = joinCode
      ? await this.prisma.assignment.findUnique({ where: { joinCode }, select: { id: true } })
      : null;
    if (joinCode && !assignment) {
      throw new NotFoundException('Linkul temei nu mai este valid. Cere-i profesorului linkul corect.');
    }
    await this.limitEmails(email, ip);
    // Hashed for every address, so a confirmed account takes as long as a new one.
    const passwordHash = await hashPassword(password);

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing?.emailVerifiedAt) {
      const token = await this.newToken(existing.id, EmailTokenPurpose.RESET, RESET_VALID_MS);
      await this.send(accountExistsEmail(email, `${appUrl()}/parola-noua/${token}`));
      return { message: SENT_CONFIRMATION };
    }

    // A new address, or an unconfirmed one signing up again: the latest password wins and
    // older confirmation links stop working.
    const user = existing
      ? await this.prisma.user.update({ where: { id: existing.id }, data: { passwordHash } })
      : await this.prisma.user.create({ data: { email, passwordHash, fullName: '', role: Role.STUDENT } });
    await this.prisma.emailToken.updateMany({
      where: { userId: user.id, purpose: EmailTokenPurpose.VERIFY, usedAt: null },
      data: { usedAt: new Date() },
    });
    const token = await this.newToken(user.id, EmailTokenPurpose.VERIFY, VERIFY_VALID_MS, assignment?.id);
    await this.send(confirmEmail(email, `${appUrl()}/confirmare/${token}`));
    return { message: SENT_CONFIRMATION };
  }

  async verify(token: string) {
    const stored = await this.useToken(token, EmailTokenPurpose.VERIFY);
    await this.prisma.user.update({ where: { id: stored.userId }, data: { emailVerifiedAt: new Date() } });

    let assignmentTitle: string | null = null;
    if (stored.assignmentId) {
      await this.prisma.assignmentReviewer.upsert({
        where: { assignmentId_userId: { assignmentId: stored.assignmentId, userId: stored.userId } },
        create: { assignmentId: stored.assignmentId, userId: stored.userId },
        update: {},
      });
      // After allocation, the new reviewer takes reviews from the busiest (D-022).
      await this.allocation.lateJoin(stored.userId, stored.assignmentId);
      assignmentTitle =
        (await this.prisma.assignment.findUnique({ where: { id: stored.assignmentId }, select: { title: true } }))
          ?.title ?? null;
    }
    return { message: 'Contul este confirmat. Acum te poți autentifica.', assignmentTitle };
  }

  async resendVerification(email: string, ip: string) {
    await this.limitEmails(email, ip);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && !user.emailVerifiedAt) {
      // Keeps the assignment of the latest sign-up link, if there was one.
      const previous = await this.prisma.emailToken.findFirst({
        where: { userId: user.id, purpose: EmailTokenPurpose.VERIFY },
        orderBy: { createdAt: 'desc' },
      });
      await this.prisma.emailToken.updateMany({
        where: { userId: user.id, purpose: EmailTokenPurpose.VERIFY, usedAt: null },
        data: { usedAt: new Date() },
      });
      const token = await this.newToken(user.id, EmailTokenPurpose.VERIFY, VERIFY_VALID_MS, previous?.assignmentId);
      await this.send(confirmEmail(email, `${appUrl()}/confirmare/${token}`));
    }
    return { message: SENT_CONFIRMATION };
  }

  async forgotPassword(email: string, ip: string) {
    await this.limitEmails(email, ip);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user) {
      const token = await this.newToken(user.id, EmailTokenPurpose.RESET, RESET_VALID_MS);
      await this.send(resetPasswordEmail(email, `${appUrl()}/parola-noua/${token}`));
    }
    return { message: SENT_RESET };
  }

  /** Sets the new password, confirms the address the link was sent to, and closes every session. */
  async resetPassword(token: string, password: string) {
    const stored = await this.useToken(token, EmailTokenPurpose.RESET);
    const passwordHash = await hashPassword(password);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: stored.userId } });
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
    });
    await this.prisma.emailToken.updateMany({
      where: { userId: user.id, purpose: EmailTokenPurpose.RESET, usedAt: null },
      data: { usedAt: new Date() },
    });
    await this.prisma.$executeRaw`DELETE FROM "session" WHERE "sess"->>'userId' = ${user.id}`;
    await this.prisma.loginFailure.deleteMany({ where: { email: user.email } });
    return { message: 'Parola a fost schimbată. Acum te poți autentifica.' };
  }

  private async newToken(userId: string, purpose: EmailTokenPurpose, validMs: number, assignmentId?: string | null) {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.emailToken.create({
      data: {
        userId,
        purpose,
        tokenHash: sha256(token),
        assignmentId: assignmentId ?? null,
        expiresAt: new Date(Date.now() + validMs),
      },
    });
    return token;
  }

  /** Marks a valid token used and returns it; one message for unknown, used and expired. */
  private async useToken(token: string, purpose: EmailTokenPurpose) {
    const stored = await this.prisma.emailToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!stored || stored.purpose !== purpose || stored.usedAt || stored.expiresAt <= new Date()) {
      throw new BadRequestException(INVALID_LINK);
    }
    const claimed = await this.prisma.emailToken.updateMany({
      where: { id: stored.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    // Two clicks at once: only the first one wins.
    if (claimed.count === 0) {
      throw new BadRequestException(INVALID_LINK);
    }
    return stored;
  }

  /** Sends one email; a failure answers 503 instead of a raw 500, and the log never holds the link. */
  private async send(email: Email): Promise<void> {
    try {
      await this.mailer.send(email);
    } catch (error) {
      this.logger.error(`Email "${email.subject}" not sent: ${(error as Error).message}`);
      throw new ServiceUnavailableException('Nu am putut trimite emailul acum. Încearcă din nou peste câteva minute.');
    }
  }

  /** At most 3 emails an hour per address and 20 per IP; counted whether or not an account exists. */
  private async limitEmails(email: string, ip: string): Promise<void> {
    const since = new Date(Date.now() - HOUR_MS);
    await this.prisma.emailRequest.deleteMany({ where: { createdAt: { lt: since } } });
    const [forAddress, forIp] = await Promise.all([
      this.prisma.emailRequest.count({ where: { email, createdAt: { gt: since } } }),
      this.prisma.emailRequest.count({ where: { ip, createdAt: { gt: since } } }),
    ]);
    if (forAddress >= MAX_EMAILS_PER_ADDRESS || forIp >= MAX_EMAILS_PER_IP) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Prea multe emailuri cerute. Încearcă din nou peste o oră.',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.prisma.emailRequest.create({ data: { email, ip } });
  }
}
