import { Global, Logger, Module } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { requireEnv } from '../env';

export interface Email {
  to: string;
  subject: string;
  text: string;
}

/** Sends the app's emails (D-020). */
export interface Mailer {
  send(email: Email): Promise<void>;
}

export const MAILER = Symbol('MAILER');

/** SMTP, through Brevo in production. */
export class SmtpMailer implements Mailer {
  private readonly transport: Transporter;

  constructor(private readonly from: string) {
    this.transport = createTransport({
      host: requireEnv('SMTP_HOST'),
      port: Number(process.env.SMTP_PORT ?? 587),
      auth: { user: requireEnv('SMTP_USER'), pass: requireEnv('SMTP_PASS') },
    });
  }

  async send(email: Email): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...email });
  }
}

/** Development only: prints the email, links included, to the server console. */
export class ConsoleMailer implements Mailer {
  private readonly logger = new Logger('Email');

  async send(email: Email): Promise<void> {
    this.logger.log(`To ${email.to}: ${email.subject}\n${email.text}`);
  }
}

/** Tests: keeps emails in memory so a test can read the link. */
export class MemoryMailer implements Mailer {
  readonly sent: Email[] = [];

  async send(email: Email): Promise<void> {
    this.sent.push(email);
  }
}

/** MAIL_TRANSPORT=smtp in production (required there), console or memory otherwise. */
export function createMailer(): Mailer {
  const kind = process.env.MAIL_TRANSPORT ?? 'console';
  if (process.env.NODE_ENV === 'production' && kind !== 'smtp') {
    throw new Error('MAIL_TRANSPORT must be smtp in production. See .env.example.');
  }
  if (kind === 'smtp') {
    return new SmtpMailer(requireEnv('MAIL_FROM'));
  }
  return kind === 'memory' ? new MemoryMailer() : new ConsoleMailer();
}

/** The address the links in emails point to. */
export function appUrl(): string {
  if (process.env.NODE_ENV === 'production') {
    return requireEnv('APP_URL').replace(/\/$/, '');
  }
  return (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

@Global()
@Module({ providers: [{ provide: MAILER, useFactory: createMailer }], exports: [MAILER] })
export class MailModule {}
