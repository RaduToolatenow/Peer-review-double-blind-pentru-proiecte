import request from 'supertest';
import { Role } from '../src/generated/prisma/enums';
import { clearDatabase, createAssignment, createClass, createRubric, createTestApp, DAY_MS, inDays, signedIn } from './helpers';

const CRITERION = {
  title: 'Calitatea codului',
  weight: 2,
  levels: [
    { score: 1, descriptor: 'Slab' },
    { score: 2, descriptor: 'Bun' },
  ],
};

describe('rubrics API (D-011, D-013, D-015)', () => {
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

  it('asks for a session and refuses students', async () => {
    await request(ctx.app.getHttpServer()).get('/api/rubrics').expect(401);
    const { agent } = await signedIn(ctx, 'student@test.example', Role.STUDENT);
    await agent.get('/api/rubrics').expect(403);
    await agent.post('/api/rubrics').send({ title: 'X', criteria: [] }).expect(403);
  });

  it('creates a draft, reads it back and replaces its criteria', async () => {
    const { agent } = await signedIn(ctx, 'prof@test.example', Role.PROFESSOR);

    const created = await agent.post('/api/rubrics').send({ title: 'Grilă web', criteria: [CRITERION] }).expect(201);
    expect(created.body).toMatchObject({ title: 'Grilă web', status: 'draft' });
    expect(created.body.criteria[0]).toMatchObject({ title: 'Calitatea codului', weight: 2, position: 1 });
    expect(created.body.criteria[0].levels).toHaveLength(2);

    const second = { ...CRITERION, title: 'Interfața' };
    const updated = await agent
      .put(`/api/rubrics/${created.body.id}`)
      .send({ title: 'Grilă web 2', criteria: [second, CRITERION] })
      .expect(200);
    expect(updated.body.title).toBe('Grilă web 2');
    expect(updated.body.criteria.map((c: { title: string }) => c.title)).toEqual(['Interfața', 'Calitatea codului']);

    const list = await agent.get('/api/rubrics').expect(200);
    expect(list.body).toEqual([expect.objectContaining({ id: created.body.id, criteriaCount: 2, status: 'draft' })]);
  });

  it('accepts a draft with no criteria, but not more than 100 or a criterion with one level', async () => {
    const { agent } = await signedIn(ctx, 'prof@test.example', Role.PROFESSOR);

    await agent.post('/api/rubrics').send({ title: 'Goală', criteria: [] }).expect(201);

    const tooMany = Array.from({ length: 101 }, () => CRITERION);
    const many = await agent.post('/api/rubrics').send({ title: 'Prea multe', criteria: tooMany }).expect(400);
    expect(many.body.message).toContain('O grilă are cel mult 100 de criterii.');

    const oneLevel = { ...CRITERION, levels: [{ score: 1, descriptor: 'Doar unul' }] };
    const single = await agent.post('/api/rubrics').send({ title: 'Un nivel', criteria: [oneLevel] }).expect(400);
    expect(single.body.message).toContain('Fiecare criteriu are cel puțin 2 niveluri.');

    const sameScore = { ...CRITERION, levels: [{ score: 1, descriptor: 'A' }, { score: 1, descriptor: 'B' }] };
    const duplicate = await agent.post('/api/rubrics').send({ title: 'Note egale', criteria: [sameScore] }).expect(400);
    expect(duplicate.body.message).toContain('Nivelurile unui criteriu au note diferite.');
  });

  it('allows exactly 100 criteria', async () => {
    const { agent } = await signedIn(ctx, 'prof@test.example', Role.PROFESSOR);
    const criteria = Array.from({ length: 100 }, (_, i) => ({ ...CRITERION, title: `Criteriul ${i + 1}` }));

    const res = await agent.post('/api/rubrics').send({ title: 'O sută', criteria }).expect(201);
    expect(res.body.criteria).toHaveLength(100);
  });

  it('copies a rubric into a new draft', async () => {
    const { agent, user } = await signedIn(ctx, 'prof@test.example', Role.PROFESSOR);
    const rubric = await createRubric(ctx.prisma, user.id, 'Originală');
    const klass = await createClass(ctx.prisma, user.id);
    await createAssignment(ctx.prisma, user.id, rubric.id, klass.id);

    const copy = await agent.post(`/api/rubrics/${rubric.id}/copy`).expect(201);
    expect(copy.body).toMatchObject({ title: 'Copie — Originală', status: 'draft' });
    expect(copy.body.id).not.toBe(rubric.id);
    expect(copy.body.criteria).toHaveLength(1);
  });

  it('refuses to change or delete a sent rubric, and deletes a draft', async () => {
    const { agent, user } = await signedIn(ctx, 'prof@test.example', Role.PROFESSOR);
    const sent = await createRubric(ctx.prisma, user.id);
    const draft = await createRubric(ctx.prisma, user.id);
    const klass = await createClass(ctx.prisma, user.id);
    await createAssignment(ctx.prisma, user.id, sent.id, klass.id);

    const put = await agent.put(`/api/rubrics/${sent.id}`).send({ title: 'Nou', criteria: [CRITERION] }).expect(409);
    expect(put.body.message).toBe('Grila a fost trimisă și nu se mai modifică. Fă o copie.');
    const del = await agent.delete(`/api/rubrics/${sent.id}`).expect(409);
    expect(del.body.message).toBe('Grila a fost trimisă și nu se poate șterge.');

    await agent.delete(`/api/rubrics/${draft.id}`).expect(204);
    expect(await ctx.prisma.rubric.count({ where: { id: draft.id } })).toBe(0);
  });

  it('archives a sent rubric only 2 days after the review deadline, with the date in the message', async () => {
    const { agent, user } = await signedIn(ctx, 'prof@test.example', Role.PROFESSOR);
    const early = await createRubric(ctx.prisma, user.id);
    const ready = await createRubric(ctx.prisma, user.id);
    const klass = await createClass(ctx.prisma, user.id);
    await createAssignment(ctx.prisma, user.id, early.id, klass.id, new Date(Date.now() - 1 * DAY_MS));
    await createAssignment(ctx.prisma, user.id, ready.id, klass.id, new Date(Date.now() - 3 * DAY_MS));

    const tooEarly = await agent.post(`/api/rubrics/${early.id}/archive`).expect(409);
    expect(tooEarly.body.message).toMatch(/^Grila poate fi arhivată după \d+ \S+ \d{4}/);

    const archived = await agent.post(`/api/rubrics/${ready.id}/archive`).expect(200);
    expect(archived.body.status).toBe('archived');
  });

  it('archives only sent rubrics', async () => {
    const { agent, user } = await signedIn(ctx, 'prof@test.example', Role.PROFESSOR);
    const draft = await createRubric(ctx.prisma, user.id);

    const res = await agent.post(`/api/rubrics/${draft.id}/archive`).expect(409);
    expect(res.body.message).toBe('Doar o grilă trimisă se arhivează. O schiță se șterge.');
  });

  it("hides another professor's rubrics", async () => {
    const { agent } = await signedIn(ctx, 'prof@test.example', Role.PROFESSOR);
    const { user: other } = await signedIn(ctx, 'alt@test.example', Role.PROFESSOR);
    const theirs = await createRubric(ctx.prisma, other.id);

    expect((await agent.get('/api/rubrics').expect(200)).body).toEqual([]);
    await agent.get(`/api/rubrics/${theirs.id}`).expect(404);
    await agent.put(`/api/rubrics/${theirs.id}`).send({ title: 'X', criteria: [] }).expect(404);
    await agent.post(`/api/rubrics/${theirs.id}/copy`).expect(404);
    await agent.delete(`/api/rubrics/${theirs.id}`).expect(404);
  });

  describe('sending a rubric to a class', () => {
    const deadlines = () => ({
      submissionDeadline: inDays(7),
      reviewDeadline: inDays(14),
      disputeDeadline: inDays(21),
    });

    it('creates the assignment, locks the rubric and evaluates every team by default', async () => {
      const { agent, user } = await signedIn(ctx, 'prof@test.example', Role.PROFESSOR);
      const rubric = await createRubric(ctx.prisma, user.id);
      const klass = await createClass(ctx.prisma, user.id, 2);

      const res = await agent
        .post(`/api/rubrics/${rubric.id}/send`)
        .send({ classId: klass.id, title: 'Proiect P1', k: 2, appliesTo: 'ALL', ...deadlines() })
        .expect(201);

      expect(res.body).toMatchObject({ title: 'Proiect P1', k: 2, appliesTo: 'ALL', className: 'Grupa 231' });
      expect(res.body.teams.every((t: { evaluated: boolean }) => t.evaluated)).toBe(true);
      const stored = await ctx.prisma.rubric.findUniqueOrThrow({ where: { id: rubric.id } });
      expect(stored.lockedAt).toBeInstanceOf(Date);
      expect((await agent.get('/api/rubrics').expect(200)).body).toEqual([]);
    });

    it('evaluates only the chosen teams', async () => {
      const { agent, user } = await signedIn(ctx, 'prof@test.example', Role.PROFESSOR);
      const rubric = await createRubric(ctx.prisma, user.id);
      const klass = await createClass(ctx.prisma, user.id, 2);
      const [chosen, left] = klass.teams;

      const res = await agent
        .post(`/api/rubrics/${rubric.id}/send`)
        .send({ classId: klass.id, title: 'P1', k: 1, appliesTo: 'SELECTED', teamIds: [chosen.id], ...deadlines() })
        .expect(201);

      const evaluated = Object.fromEntries(
        res.body.teams.map((t: { id: string; evaluated: boolean }) => [t.id, t.evaluated]),
      );
      expect(evaluated).toEqual({ [chosen.id]: true, [left.id]: false });
    });

    it('refuses a rubric with no criteria, bad deadlines, k below 1, or teams from another class', async () => {
      const { agent, user } = await signedIn(ctx, 'prof@test.example', Role.PROFESSOR);
      const empty = await ctx.prisma.rubric.create({ data: { title: 'Goală', createdById: user.id } });
      const rubric = await createRubric(ctx.prisma, user.id);
      const klass = await createClass(ctx.prisma, user.id, 1, 'Grupa 231');
      const other = await createClass(ctx.prisma, user.id, 1, 'Grupa 232');
      const base = { classId: klass.id, title: 'P1', k: 2, appliesTo: 'ALL', ...deadlines() };

      const noCriteria = await agent.post(`/api/rubrics/${empty.id}/send`).send(base).expect(400);
      expect(noCriteria.body.message).toBe('Grila trebuie să aibă cel puțin un criteriu.');

      const past = await agent
        .post(`/api/rubrics/${rubric.id}/send`)
        .send({ ...base, submissionDeadline: inDays(-1) })
        .expect(400);
      expect(past.body.message).toBe('Termenele trebuie să fie în viitor.');

      const order = await agent
        .post(`/api/rubrics/${rubric.id}/send`)
        .send({ ...base, reviewDeadline: inDays(5) })
        .expect(400);
      expect(order.body.message).toBe('Termenele sunt în ordinea: predare, evaluare, contestații.');

      const lowK = await agent.post(`/api/rubrics/${rubric.id}/send`).send({ ...base, k: 0 }).expect(400);
      expect(lowK.body.message).toContain('Fiecare proiect primește cel puțin o evaluare (k ≥ 1).');

      const foreign = await agent
        .post(`/api/rubrics/${rubric.id}/send`)
        .send({ ...base, appliesTo: 'SELECTED', teamIds: [other.teams[0].id] })
        .expect(400);
      expect(foreign.body.message).toBe('Alege doar echipe din clasa căreia îi trimiți grila.');

      const none = await agent
        .post(`/api/rubrics/${rubric.id}/send`)
        .send({ ...base, appliesTo: 'SELECTED', teamIds: [] })
        .expect(400);
      expect(none.body.message).toBe('Alege cel puțin o echipă.');

      const stored = await ctx.prisma.rubric.findUniqueOrThrow({ where: { id: rubric.id } });
      expect(stored.lockedAt).toBeNull();
    });

    it("refuses another professor's class", async () => {
      const { agent, user } = await signedIn(ctx, 'prof@test.example', Role.PROFESSOR);
      const { user: other } = await signedIn(ctx, 'alt@test.example', Role.PROFESSOR);
      const rubric = await createRubric(ctx.prisma, user.id);
      const theirs = await createClass(ctx.prisma, other.id);

      await agent
        .post(`/api/rubrics/${rubric.id}/send`)
        .send({ classId: theirs.id, title: 'P1', k: 2, appliesTo: 'ALL', ...deadlines() })
        .expect(404);
    });
  });
});
