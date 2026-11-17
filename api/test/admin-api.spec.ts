import { Role } from '../src/generated/prisma/enums';
import { clearDatabase, createAssignment, createClass, createRubric, createTestApp, createUser, signedIn } from './helpers';

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
