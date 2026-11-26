import request from 'supertest';
import { Role } from '../src/generated/prisma/enums';
import { MAILER, MemoryMailer } from '../src/mail/mailer';
import {
  clearDatabase,
  createAssignment,
  createClass,
  createRubric,
  createTestApp,
  createUser,
  DAY_MS,
  signedIn,
  TEST_PASSWORD,
} from './helpers';

describe('admin API (D-014, D-015)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await clearDatabase(ctx.prisma);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it("lists professors and opens each one's rubrics read only", async () => {
    const { agent } = await signedIn(ctx, 'admin@test.example', Role.ADMIN);
    const professor = await createUser(ctx.prisma, 'prof@test.example', 'parola', Role.PROFESSOR);
    const draft = await createRubric(ctx.prisma, professor.id, 'Schiță');
    const sent = await createRubric(ctx.prisma, professor.id, 'Trimisă');
    const klass = await createClass(ctx.prisma, professor.id);
    await createAssignment(ctx.prisma, professor.id, sent.id, klass.id);

    const professors = await agent.get('/api/admin/professors').expect(200);
    expect(professors.body).toEqual([
      expect.objectContaining({ id: professor.id, email: 'prof@test.example', draftCount: 1, activeCount: 1 }),
    ]);

    const rubrics = await agent.get(`/api/admin/professors/${professor.id}/rubrics`).expect(200);
    expect(rubrics.body.map((r: { title: string; status: string }) => [r.title, r.status]).sort()).toEqual([
      ['Schiță', 'draft'],
      ['Trimisă', 'active'],
    ]);
    const one = await agent.get(`/api/admin/rubrics/${draft.id}`).expect(200);
    expect(one.body.criteria).toHaveLength(1);

    // Read only: the professor routes still hide other people's rubrics from the admin.
    await agent.put(`/api/rubrics/${draft.id}`).send({ title: 'X', criteria: [] }).expect(404);
  });

  it('is only for admins', async () => {
    const { agent } = await signedIn(ctx, 'prof@test.example', Role.PROFESSOR);
    await agent.get('/api/admin/professors').expect(403);
  });

  it('lists staff emails and only a count of student accounts', async () => {
    const { agent } = await signedIn(ctx, 'admin@test.example', Role.ADMIN);
    await createUser(ctx.prisma, 'prof@test.example', 'parola', Role.PROFESSOR);
    await createUser(ctx.prisma, 'student1@test.example', 'parola', Role.STUDENT);
    await createUser(ctx.prisma, 'student2@test.example', 'parola', Role.STUDENT);

    const res = await agent.get('/api/users').expect(200);
    expect(res.body.studentCount).toBe(2);
    expect(res.body.staff.map((u: { email: string }) => u.email)).toEqual(['admin@test.example', 'prof@test.example']);
    expect(JSON.stringify(res.body)).not.toContain('student1@test.example');
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });
});

describe('admin adds and deletes professors (D-034)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let mailer: MemoryMailer;
  const http = () => request(ctx.app.getHttpServer());
  const PROFESSOR = 'ana.popescu@ulbsibiu.ro';
  const NEW_PASSWORD = 'parola-noua-sigura';
  const IN_USE = 'Există deja un cont cu acest email.';
  const HAS_DATA = 'Profesorul are clase sau grile trimise unei clase, așa că nu poate fi șters.';

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

  const linkToken = () => /http:\/\/app\.test\/parola-noua\/([A-Za-z0-9_-]+)/.exec(mailer.sent.at(-1)?.text ?? '')?.[1];
  const sessionsOf = async (userId: string) =>
    Number(
      (await ctx.prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "session" WHERE "sess"->>'userId' = ${userId}`)[0]
        .n,
    );

  it('adds an unconfirmed professor and emails a link valid 24 hours', async () => {
    const { agent } = await signedIn(ctx, 'admin@test.example', Role.ADMIN);
    const res = await agent.post('/api/admin/professors').send({ email: ' Ana.Popescu@ulbsibiu.ro ', fullName: 'Ana Popescu' }).expect(201);

    expect(res.body).toEqual({ id: expect.any(String), email: PROFESSOR, fullName: 'Ana Popescu', role: 'PROFESSOR' });
    expect(mailer.sent.map((m) => m.to)).toEqual([PROFESSOR]);
    expect(linkToken()).toBeDefined();
    const token = await ctx.prisma.emailToken.findFirstOrThrow({ where: { userId: res.body.id } });
    expect(token.purpose).toBe('RESET');
    expect(Math.abs(token.expiresAt.getTime() - Date.now() - DAY_MS)).toBeLessThan(60_000);
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(user.emailVerifiedAt).toBeNull();
  });

  it('lets the professor set a password from the link, then log in as a professor', async () => {
    const { agent } = await signedIn(ctx, 'admin@test.example', Role.ADMIN);
    await agent.post('/api/admin/professors').send({ email: PROFESSOR, fullName: 'Ana Popescu' }).expect(201);
    await http().post('/api/auth/login').send({ email: PROFESSOR, password: NEW_PASSWORD }).expect(401);

    await http().post('/api/auth/reset-password').send({ token: linkToken(), password: NEW_PASSWORD }).expect(200);
    const professor = request.agent(ctx.app.getHttpServer());
    await professor.post('/api/auth/login').send({ email: PROFESSOR, password: NEW_PASSWORD }).expect(200);
    const me = await professor.get('/api/auth/me').expect(200);
    expect(me.body).toMatchObject({ email: PROFESSOR, fullName: 'Ana Popescu', role: 'PROFESSOR' });
  });

  it('refuses an email that already has an account, even a student one, and leaves it unchanged', async () => {
    const { agent } = await signedIn(ctx, 'admin@test.example', Role.ADMIN);
    const student = await createUser(ctx.prisma, PROFESSOR, TEST_PASSWORD, Role.STUDENT);

    const res = await agent.post('/api/admin/professors').send({ email: PROFESSOR, fullName: 'Ana Popescu' }).expect(409);
    expect(res.body.message).toBe(IN_USE);
    expect(mailer.sent).toHaveLength(0);
    const after = await ctx.prisma.user.findUniqueOrThrow({ where: { id: student.id } });
    expect(after.role).toBe(Role.STUDENT);
    expect(after.fullName).toBe(student.fullName);
  });

  it('accepts any email domain and refuses an invalid email or name', async () => {
    const { agent } = await signedIn(ctx, 'admin@test.example', Role.ADMIN);
    await agent.post('/api/admin/professors').send({ email: 'invitat@exemplu.com', fullName: 'Profesor Invitat' }).expect(201);

    await agent.post('/api/admin/professors').send({ email: 'nu-e-email', fullName: 'X' }).expect(400);
    await agent.post('/api/admin/professors').send({ email: 'altul@exemplu.com', fullName: '   ' }).expect(400);
    await agent.post('/api/admin/professors').send({ email: 'altul@exemplu.com', fullName: 'x'.repeat(101) }).expect(400);
    await agent.post('/api/admin/professors').send({ fullName: 'Fără email' }).expect(400);
  });

  it('is only for admins', async () => {
    const professor = await createUser(ctx.prisma, 'prof2@test.example', TEST_PASSWORD, Role.PROFESSOR);
    for (const role of [Role.PROFESSOR, Role.STUDENT]) {
      const { agent } = await signedIn(ctx, `${role.toLowerCase()}@test.example`, role);
      await agent.post('/api/admin/professors').send({ email: 'nou@exemplu.com', fullName: 'Nou' }).expect(403);
      await agent.delete(`/api/admin/professors/${professor.id}`).expect(403);
    }
    expect(await ctx.prisma.user.count({ where: { email: 'nou@exemplu.com' } })).toBe(0);
  });

  it('deletes a professor with only drafts, with the drafts, and closes their sessions', async () => {
    const { agent } = await signedIn(ctx, 'admin@test.example', Role.ADMIN);
    const { user: professor } = await signedIn(ctx, 'prof@test.example', Role.PROFESSOR);
    const draft = await createRubric(ctx.prisma, professor.id, 'Schiță');
    expect(await sessionsOf(professor.id)).toBe(1);

    await agent.delete(`/api/admin/professors/${professor.id}`).expect(204);

    expect(await ctx.prisma.user.findUnique({ where: { id: professor.id } })).toBeNull();
    expect(await ctx.prisma.rubric.findUnique({ where: { id: draft.id } })).toBeNull();
    expect(await sessionsOf(professor.id)).toBe(0);
  });

  it('refuses to delete a professor with a class or a sent rubric, and deletes nothing', async () => {
    const { agent } = await signedIn(ctx, 'admin@test.example', Role.ADMIN);
    const withClass = await createUser(ctx.prisma, 'clasa@test.example', TEST_PASSWORD, Role.PROFESSOR);
    const draft = await createRubric(ctx.prisma, withClass.id, 'Schiță');
    await createClass(ctx.prisma, withClass.id);
    const withSent = await createUser(ctx.prisma, 'trimisa@test.example', TEST_PASSWORD, Role.PROFESSOR);
    const sent = await createRubric(ctx.prisma, withSent.id, 'Trimisă');
    const klass = await createClass(ctx.prisma, withSent.id);
    await createAssignment(ctx.prisma, withSent.id, sent.id, klass.id);

    for (const professor of [withClass, withSent]) {
      const res = await agent.delete(`/api/admin/professors/${professor.id}`).expect(409);
      expect(res.body.message).toBe(HAS_DATA);
      expect(await ctx.prisma.user.findUnique({ where: { id: professor.id } })).not.toBeNull();
    }
    expect(await ctx.prisma.rubric.findUnique({ where: { id: draft.id } })).not.toBeNull();
    expect(await ctx.prisma.rubric.findUnique({ where: { id: sent.id } })).not.toBeNull();
  });

  it('deletes only professors: 404 for an admin, a student or an unknown id', async () => {
    const { agent, user: admin } = await signedIn(ctx, 'admin@test.example', Role.ADMIN);
    const student = await createUser(ctx.prisma, 'student@test.example', TEST_PASSWORD, Role.STUDENT);

    for (const id of [admin.id, student.id, '00000000-0000-4000-8000-000000000000']) {
      await agent.delete(`/api/admin/professors/${id}`).expect(404);
    }
    expect(await ctx.prisma.user.count()).toBe(2);
  });
});
