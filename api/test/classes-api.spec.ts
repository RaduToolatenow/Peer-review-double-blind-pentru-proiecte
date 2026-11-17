import { Role } from '../src/generated/prisma/enums';
import { clearDatabase, createAssignment, createClass, createRubric, createTestApp, signedIn } from './helpers';

describe('classes and teams API (D-012)', () => {
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

  it('refuses students on the professor routes', async () => {
    const { agent } = await signedIn(ctx, 'student@test.example', Role.STUDENT);
    await agent.get('/api/classes').expect(403);
    await agent.post('/api/classes').send({ name: 'X' }).expect(403);
  });

  it('creates a class and teams with generated codes', async () => {
    const { agent } = await signedIn(ctx, 'prof@test.example', Role.PROFESSOR);

    const klass = await agent.post('/api/classes').send({ name: 'Web Avansat, grupa 231' }).expect(201);
    const team = await agent
      .post(`/api/classes/${klass.body.id}/teams`)
      .send({ name: 'Echipa 1', memberNames: 'Popescu A., Ionescu M.' })
      .expect(201);
    expect(team.body).toMatchObject({ name: 'Echipa 1', memberNames: 'Popescu A., Ionescu M.', joinedCount: 0 });
    expect(team.body.joinCode).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);

    const detail = await agent.get(`/api/classes/${klass.body.id}`).expect(200);
    expect(detail.body).toMatchObject({ name: 'Web Avansat, grupa 231', assignmentCount: 0 });
    expect(detail.body.teams).toHaveLength(1);

    const list = await agent.get('/api/classes').expect(200);
    expect(list.body).toEqual([expect.objectContaining({ name: 'Web Avansat, grupa 231', teamCount: 1 })]);
  });

  it('refuses an empty name and a duplicate team name in the same class', async () => {
    const { agent } = await signedIn(ctx, 'prof@test.example', Role.PROFESSOR);
    const klass = await agent.post('/api/classes').send({ name: 'Grupa 231' }).expect(201);

    const empty = await agent.post('/api/classes').send({ name: '  ' }).expect(400);
    expect(empty.body.message).toContain('Introdu numele clasei.');

    await agent.post(`/api/classes/${klass.body.id}/teams`).send({ name: 'Echipa 1' }).expect(201);
    const duplicate = await agent.post(`/api/classes/${klass.body.id}/teams`).send({ name: 'Echipa 1' }).expect(409);
    expect(duplicate.body.message).toBe('Există deja o echipă cu acest nume în clasă.');
  });

  it('renames and deletes teams and classes', async () => {
    const { agent } = await signedIn(ctx, 'prof@test.example', Role.PROFESSOR);
    const klass = await agent.post('/api/classes').send({ name: 'Grupa 231' }).expect(201);
    const team = await agent.post(`/api/classes/${klass.body.id}/teams`).send({ name: 'Echipa 1' }).expect(201);

    const renamed = await agent.patch(`/api/teams/${team.body.id}`).send({ name: 'Echipa A' }).expect(200);
    expect(renamed.body.name).toBe('Echipa A');
    await agent.patch(`/api/classes/${klass.body.id}`).send({ name: 'Grupa 232' }).expect(200);

    await agent.delete(`/api/teams/${team.body.id}`).expect(204);
    await agent.delete(`/api/classes/${klass.body.id}`).expect(204);
  });

  it('refuses to delete a class that has a sent rubric', async () => {
    const { agent, user } = await signedIn(ctx, 'prof@test.example', Role.PROFESSOR);
    const rubric = await createRubric(ctx.prisma, user.id);
    const klass = await createClass(ctx.prisma, user.id);
    await createAssignment(ctx.prisma, user.id, rubric.id, klass.id);

    const res = await agent.delete(`/api/classes/${klass.id}`).expect(409);
    expect(res.body.message).toBe('Clasei i-ai trimis deja o grilă, așa că nu se poate șterge.');
  });

  it("hides another professor's classes and teams", async () => {
    const { agent } = await signedIn(ctx, 'prof@test.example', Role.PROFESSOR);
    const { user: other } = await signedIn(ctx, 'alt@test.example', Role.PROFESSOR);
    const theirs = await createClass(ctx.prisma, other.id);

    expect((await agent.get('/api/classes').expect(200)).body).toEqual([]);
    await agent.get(`/api/classes/${theirs.id}`).expect(404);
    await agent.post(`/api/classes/${theirs.id}/teams`).send({ name: 'X' }).expect(404);
    await agent.patch(`/api/teams/${theirs.teams[0].id}`).send({ name: 'X' }).expect(404);
    await agent.post(`/api/teams/${theirs.teams[0].id}/code`).expect(404);
  });

  describe('joining a team with its code', () => {
    it('lets a student join once and shows the professor only a count', async () => {
      const { agent: professor } = await signedIn(ctx, 'prof@test.example', Role.PROFESSOR);
      const { agent: student } = await signedIn(ctx, 'student@test.example', Role.STUDENT);
      const klass = await professor.post('/api/classes').send({ name: 'Grupa 231' }).expect(201);
      const team = await professor.post(`/api/classes/${klass.body.id}/teams`).send({ name: 'Echipa 1' }).expect(201);

      const joined = await student
        .post('/api/teams/join')
        .send({ code: ` ${team.body.joinCode.toLowerCase()} ` })
        .expect(200);
      expect(joined.body).toEqual({ className: 'Grupa 231', teamName: 'Echipa 1' });

      const again = await student.post('/api/teams/join').send({ code: team.body.joinCode }).expect(409);
      expect(again.body.message).toBe('Ești deja într-o echipă din această clasă.');

      const detail = await professor.get(`/api/classes/${klass.body.id}`).expect(200);
      expect(detail.body.teams[0].joinedCount).toBe(1);
      expect(JSON.stringify(detail.body)).not.toContain('student@test.example');
    });

    it('refuses an unknown code and a new code replaces the old one', async () => {
      const { agent: professor } = await signedIn(ctx, 'prof@test.example', Role.PROFESSOR);
      const { agent: student } = await signedIn(ctx, 'student@test.example', Role.STUDENT);
      const klass = await professor.post('/api/classes').send({ name: 'Grupa 231' }).expect(201);
      const team = await professor.post(`/api/classes/${klass.body.id}/teams`).send({ name: 'Echipa 1' }).expect(201);

      const unknown = await student.post('/api/teams/join').send({ code: 'AAA-AAA' }).expect(404);
      expect(unknown.body.message).toBe('Codul nu există. Verifică-l sau cere-i profesorului unul nou.');

      const fresh = await professor.post(`/api/teams/${team.body.id}/code`).expect(200);
      expect(fresh.body.joinCode).not.toBe(team.body.joinCode);
      await student.post('/api/teams/join').send({ code: team.body.joinCode }).expect(404);
      await student.post('/api/teams/join').send({ code: fresh.body.joinCode }).expect(200);
    });

    it('is only for students', async () => {
      const { agent: professor } = await signedIn(ctx, 'prof@test.example', Role.PROFESSOR);
      await professor.post('/api/teams/join').send({ code: 'AAA-AAA' }).expect(403);
    });
  });
});
