import request from 'supertest';
import { Role } from '../src/generated/prisma/enums';
import { MAILER, MemoryMailer } from '../src/mail/mailer';
import { clearDatabase, createTestApp, createUser, TEST_PASSWORD } from './helpers';

const EMAIL = 'ana.pop@ulbsibiu.ro';
const NEW_PASSWORD = 'parola-noua-sigura';

describe('password reset (D-020)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let mailer: MemoryMailer;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await createTestApp();
    mailer = ctx.app.get(MAILER);
  });

  beforeEach(async () => {
    await clearDatabase(ctx.prisma);
    mailer.sent.length = 0;
    await createUser(ctx.prisma, EMAIL, TEST_PASSWORD, Role.STUDENT);
  });

  afterAll(async () => {
    await ctx.close();
  });

  const resetToken = () => /http:\/\/app\.test\/parola-noua\/([A-Za-z0-9_-]+)/.exec(mailer.sent.at(-1)?.text ?? '')?.[1];

  it('answers the same for a known and an unknown address, and emails only the known one', async () => {
    const known = await http().post('/api/auth/forgot-password').send({ email: EMAIL }).expect(202);
    const unknown = await http().post('/api/auth/forgot-password').send({ email: 'nimeni@ulbsibiu.ro' }).expect(202);

    expect(unknown.body).toEqual(known.body);
    expect(mailer.sent.map((m) => m.to)).toEqual([EMAIL]);
  });

  it('sets a new password once, and closes the other sessions', async () => {
    const other = request.agent(ctx.app.getHttpServer());
    await other.post('/api/auth/login').send({ email: EMAIL, password: TEST_PASSWORD }).expect(200);

    await http().post('/api/auth/forgot-password').send({ email: EMAIL }).expect(202);
    const token = resetToken();
    await http().post('/api/auth/reset-password').send({ token, password: NEW_PASSWORD }).expect(200);

    await other.get('/api/auth/me').expect(401);
    await http().post('/api/auth/login').send({ email: EMAIL, password: TEST_PASSWORD }).expect(401);
    await http().post('/api/auth/login').send({ email: EMAIL, password: NEW_PASSWORD }).expect(200);

    const again = await http().post('/api/auth/reset-password').send({ token, password: 'inca-una-noua-1' }).expect(400);
    expect(again.body.message).toBe('Linkul nu mai este valid. Cere unul nou din pagina de autentificare.');
  });

  it('refuses an expired link and a short password', async () => {
    await http().post('/api/auth/forgot-password').send({ email: EMAIL }).expect(202);
    const token = resetToken();

    const short = await http().post('/api/auth/reset-password').send({ token, password: 'scurta' }).expect(400);
    expect(short.body.message).toContain('Parola are cel puțin 10 caractere.');

    await ctx.prisma.emailToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await http().post('/api/auth/reset-password').send({ token, password: NEW_PASSWORD }).expect(400);
  });

  it('confirms an unconfirmed account, since the link proves the address', async () => {
    await ctx.prisma.user.update({ where: { email: EMAIL }, data: { emailVerifiedAt: null } });

    await http().post('/api/auth/forgot-password').send({ email: EMAIL }).expect(202);
    await http().post('/api/auth/reset-password').send({ token: resetToken(), password: NEW_PASSWORD }).expect(200);
    await http().post('/api/auth/login').send({ email: EMAIL, password: NEW_PASSWORD }).expect(200);
  });
});
