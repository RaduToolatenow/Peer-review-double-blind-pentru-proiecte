import request from 'supertest';
import { Role } from '../src/generated/prisma/enums';
import { MAILER, MemoryMailer } from '../src/mail/mailer';
import { clearDatabase, createAssignment, createClass, createRubric, createTestApp, createUser, signedIn } from './helpers';

const EMAIL = 'ana.pop@ulbsibiu.ro';
const PASSWORD = 'o-parola-buna-10';
const SENT = 'Ți-am trimis un email. Deschide linkul din el ca să-ți confirmi contul. Verifică și folderul Spam.';

describe('sign-up and email confirmation (D-010, D-020)', () => {
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
  });

  afterAll(async () => {
    await ctx.close();
  });

  const linkToken = (path: string) => {
    const match = new RegExp(`http://app\\.test/${path}/([A-Za-z0-9_-]+)`).exec(mailer.sent.at(-1)?.text ?? '');
    return match?.[1];
  };

  it('accepts only @ulbsibiu.ro addresses and passwords of at least 10 characters', async () => {
    for (const email of ['ana@gmail.com', 'ana@ulbsibiu.ro.evil.com', 'ana@student.ulbsibiu.ro', 'ana@ulbsibiu.ro@x.ro']) {
      const res = await http().post('/api/auth/register').send({ email, password: PASSWORD }).expect(400);
      expect(res.body.message).toContain('Folosește adresa de email de la universitate (@ulbsibiu.ro).');
    }
    const short = await http().post('/api/auth/register').send({ email: EMAIL, password: 'scurta' }).expect(400);
    expect(short.body.message).toContain('Parola are cel puțin 10 caractere.');
    expect(mailer.sent).toHaveLength(0);
  });

  it('creates an unconfirmed account, which cannot log in until the emailed link is opened', async () => {
    const res = await http().post('/api/auth/register').send({ email: ' Ana.Pop@ULBSIBIU.ro ', password: PASSWORD }).expect(202);
    expect(res.body.message).toBe(SENT);
    expect(mailer.sent[0].to).toBe(EMAIL);

    const refused = await http().post('/api/auth/login').send({ email: EMAIL, password: PASSWORD }).expect(403);
    expect(refused.body.message).toBe('Confirmă-ți emailul înainte să intri. Linkul e în emailul de la înscriere.');

    await http().post('/api/auth/verify').send({ token: linkToken('confirmare') }).expect(200);
    const login = await http().post('/api/auth/login').send({ email: EMAIL, password: PASSWORD }).expect(200);
    expect(login.body).toMatchObject({ email: EMAIL, role: 'STUDENT', fullName: '' });
  });

  it('refuses a used, unknown or expired confirmation link', async () => {
    await http().post('/api/auth/register').send({ email: EMAIL, password: PASSWORD }).expect(202);
    const token = linkToken('confirmare');
    await http().post('/api/auth/verify').send({ token }).expect(200);

    const used = await http().post('/api/auth/verify').send({ token }).expect(400);
    expect(used.body.message).toBe('Linkul nu mai este valid. Cere unul nou din pagina de autentificare.');
    await http().post('/api/auth/verify').send({ token: 'inventat' }).expect(400);

    await http().post('/api/auth/register').send({ email: 'alt@ulbsibiu.ro', password: PASSWORD }).expect(202);
    await ctx.prisma.emailToken.updateMany({ where: { usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await http().post('/api/auth/verify').send({ token: linkToken('confirmare') }).expect(400);
  });

  it('answers the same for a new, an unconfirmed and a confirmed address', async () => {
    await createUser(ctx.prisma, 'confirmat@ulbsibiu.ro', PASSWORD, Role.STUDENT);
    await http().post('/api/auth/register').send({ email: 'neconfirmat@ulbsibiu.ro', password: PASSWORD }).expect(202);

    const answers = [];
    for (const email of ['nou@ulbsibiu.ro', 'neconfirmat@ulbsibiu.ro', 'confirmat@ulbsibiu.ro']) {
      const res = await http().post('/api/auth/register').send({ email, password: PASSWORD });
      answers.push([res.status, res.body]);
    }
    expect(answers[1]).toEqual(answers[0]);
    expect(answers[2]).toEqual(answers[0]);

    // The confirmed account gets a different email and keeps its password.
    expect(mailer.sent.at(-1)?.text).toContain('Ai deja un cont');
    await http().post('/api/auth/login').send({ email: 'confirmat@ulbsibiu.ro', password: PASSWORD }).expect(200);
  });

  it('resends the confirmation with the same answer for any address', async () => {
    await http().post('/api/auth/register').send({ email: EMAIL, password: PASSWORD }).expect(202);
    const sentBefore = mailer.sent.length;

    const known = await http().post('/api/auth/resend-verification').send({ email: EMAIL }).expect(202);
    const unknown = await http().post('/api/auth/resend-verification').send({ email: 'nimeni@ulbsibiu.ro' }).expect(202);
    expect(unknown.body).toEqual(known.body);
    expect(mailer.sent.length).toBe(sentBefore + 1);
    await http().post('/api/auth/verify').send({ token: linkToken('confirmare') }).expect(200);
  });

  it('sends at most 3 emails an hour to one address and 20 from one IP', async () => {
    for (let i = 0; i < 3; i++) {
      await http().post('/api/auth/resend-verification').send({ email: EMAIL }).expect(202);
    }
    const tooMany = await http().post('/api/auth/resend-verification').send({ email: EMAIL }).expect(429);
    expect(tooMany.body.message).toBe('Prea multe emailuri cerute. Încearcă din nou peste o oră.');

    for (let i = 3; i < 20; i++) {
      await http().post('/api/auth/register').send({ email: `student${i}@ulbsibiu.ro`, password: PASSWORD }).expect(202);
    }
    await http().post('/api/auth/register').send({ email: 'ultimul@ulbsibiu.ro', password: PASSWORD }).expect(429);
  });

  it('answers 503 with a clear message when the email cannot be sent', async () => {
    mailer.failing = true;
    try {
      const res = await http().post('/api/auth/register').send({ email: EMAIL, password: PASSWORD }).expect(503);
      expect(res.body.message).toBe('Nu am putut trimite emailul acum. Încearcă din nou peste câteva minute.');
      const forgot = await http().post('/api/auth/forgot-password').send({ email: EMAIL }).expect(503);
      expect(forgot.body.message).toBe(res.body.message);
    } finally {
      mailer.failing = false;
    }
  });

  it('stores only a hash of the token', async () => {
    await http().post('/api/auth/register').send({ email: EMAIL, password: PASSWORD }).expect(202);
    const token = linkToken('confirmare')!;
    const stored = await ctx.prisma.emailToken.findFirstOrThrow();
    expect(stored.tokenHash).not.toContain(token);
    expect(stored.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  describe("an assignment's sign-up link", () => {
    async function assignment() {
      const professor = await createUser(ctx.prisma, 'prof@test.example', PASSWORD, Role.PROFESSOR);
      const rubric = await createRubric(ctx.prisma, professor.id);
      const klass = await createClass(ctx.prisma, professor.id);
      return createAssignment(ctx.prisma, professor.id, rubric.id, klass.id);
    }

    it('shows the assignment, and a sign-up through it makes the account a reviewer once confirmed', async () => {
      const a = await assignment();

      const info = await http().get(`/api/join/${a.joinCode}`).expect(200);
      expect(info.body).toEqual({ assignmentTitle: 'Tema de test', className: 'Grupa 231' });
      await http().get('/api/join/necunoscut').expect(404);

      await http().post('/api/auth/register').send({ email: EMAIL, password: PASSWORD, joinCode: a.joinCode }).expect(202);
      expect(await ctx.prisma.assignmentReviewer.count()).toBe(0);
      const verified = await http().post('/api/auth/verify').send({ token: linkToken('confirmare') }).expect(200);
      expect(verified.body.assignmentTitle).toBe('Tema de test');
      expect(await ctx.prisma.assignmentReviewer.count({ where: { assignmentId: a.id } })).toBe(1);
    });

    it('lets a signed-in student become a reviewer, once', async () => {
      const a = await assignment();
      const { agent } = await signedIn(ctx, 'student@test.example', Role.STUDENT);

      await agent.post(`/api/join/${a.joinCode}`).expect(200);
      await agent.post(`/api/join/${a.joinCode}`).expect(200);
      expect(await ctx.prisma.assignmentReviewer.count({ where: { assignmentId: a.id } })).toBe(1);
      await request(ctx.app.getHttpServer()).post(`/api/join/${a.joinCode}`).expect(401);
    });

    it('gives the professor the link in the assignment detail', async () => {
      const { agent, user } = await signedIn(ctx, 'prof2@test.example', Role.PROFESSOR);
      const rubric = await createRubric(ctx.prisma, user.id);
      const klass = await createClass(ctx.prisma, user.id);
      const a = await createAssignment(ctx.prisma, user.id, rubric.id, klass.id);

      const detail = await agent.get(`/api/assignments/${a.id}`).expect(200);
      expect(detail.body.joinUrl).toBe(`http://app.test/inscriere/${a.joinCode}`);
    });
  });
});
