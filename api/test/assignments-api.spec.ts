import { Role } from '../src/generated/prisma/enums';
import {
  clearDatabase,
  createAssignment,
  createClass,
  createRubric,
  createTestApp,
  createUser,
  DAY_MS,
  inDays,
  signedIn,
} from './helpers';

describe('assignments API, the active rubrics (D-013, D-014)', () => {
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

  it('lists active rubrics with counts only, and hides archived ones unless asked', async () => {
    const { agent, user } = await signedIn(ctx, 'prof@test.example', Role.PROFESSOR);
    const rubric = await createRubric(ctx.prisma, user.id, 'Grilă activă');
    const old = await createRubric(ctx.prisma, user.id, 'Grilă veche');
    const klass = await createClass(ctx.prisma, user.id, 2);
    const assignment = await createAssignment(ctx.prisma, user.id, rubric.id, klass.id);
    await createAssignment(ctx.prisma, user.id, old.id, klass.id, new Date(Date.now() - 3 * DAY_MS));
    await ctx.prisma.rubric.update({ where: { id: old.id }, data: { archivedAt: new Date() } });

    // One submitted review on team 1.
    const reviewer = await createUser(ctx.prisma, 'rev@test.example', 'parola', Role.STUDENT);
    const submission = await ctx.prisma.submission.create({
      data: { assignmentId: assignment.id, teamId: klass.teams[0].id, link: 'https://example.com' },
    });
    await ctx.prisma.review.create({
      data: { submissionId: submission.id, reviewerId: reviewer.id, status: 'SUBMITTED', submittedAt: new Date() },
    });

    const list = await agent.get('/api/assignments').expect(200);
    expect(list.body).toEqual([
      expect.objectContaining({
        id: assignment.id,
        rubricTitle: 'Grilă activă',
        className: 'Grupa 231',
        evaluatedTeamCount: 2,
        reviewsSubmitted: 1,
        reviewsExpected: 4,
        phase: 'submission',
      }),
    ]);

    const withArchived = await agent.get('/api/assignments?archived=true').expect(200);
    expect(withArchived.body).toHaveLength(2);

    const detail = await agent.get(`/api/assignments/${assignment.id}`).expect(200);
    expect(detail.body.teams[0]).toMatchObject({ name: 'Echipa 1', submitted: true, reviewsReceived: 1 });
    expect(detail.body.rubric).toMatchObject({ id: rubric.id, status: 'active' });
    expect(detail.body.archivableFrom).toBe(new Date(assignment.reviewDeadline.getTime() + 2 * DAY_MS).toISOString());
    expect(JSON.stringify(detail.body)).not.toContain(reviewer.id);
    expect(JSON.stringify(detail.body)).not.toContain('rev@test.example');
  });

  it('changes a deadline that has not passed, and refuses one that has', async () => {
    const { agent, user } = await signedIn(ctx, 'prof@test.example', Role.PROFESSOR);
    const rubric = await createRubric(ctx.prisma, user.id);
    const klass = await createClass(ctx.prisma, user.id);
    const open = await createAssignment(ctx.prisma, user.id, rubric.id, klass.id);
    const started = await createAssignment(ctx.prisma, user.id, rubric.id, klass.id, new Date(Date.now() + 2 * DAY_MS));

    const later = inDays(16);
    const res = await agent.patch(`/api/assignments/${open.id}`).send({ reviewDeadline: later }).expect(200);
    expect(res.body.reviewDeadline).toBe(later);

    // started: submission deadline was 5 days ago.
    const passed = await agent
      .patch(`/api/assignments/${started.id}`)
      .send({ submissionDeadline: inDays(1) })
      .expect(409);
    expect(passed.body.message).toBe('Termenul de predare a trecut și nu se mai poate schimba.');

    const intoPast = await agent
      .patch(`/api/assignments/${open.id}`)
      .send({ disputeDeadline: inDays(-1) })
      .expect(400);
    expect(intoPast.body.message).toBe('Termenele trebuie să fie în viitor.');

    const order = await agent
      .patch(`/api/assignments/${open.id}`)
      .send({ disputeDeadline: inDays(10) })
      .expect(400);
    expect(order.body.message).toBe('Termenele sunt în ordinea: predare, evaluare, contestații.');
  });

  it("hides another professor's assignments", async () => {
    const { agent } = await signedIn(ctx, 'prof@test.example', Role.PROFESSOR);
    const { user: other } = await signedIn(ctx, 'alt@test.example', Role.PROFESSOR);
    const rubric = await createRubric(ctx.prisma, other.id);
    const klass = await createClass(ctx.prisma, other.id);
    const theirs = await createAssignment(ctx.prisma, other.id, rubric.id, klass.id);

    expect((await agent.get('/api/assignments').expect(200)).body).toEqual([]);
    await agent.get(`/api/assignments/${theirs.id}`).expect(404);
    await agent.patch(`/api/assignments/${theirs.id}`).send({ title: 'X' }).expect(404);
  });

  it('refuses students', async () => {
    const { agent } = await signedIn(ctx, 'student@test.example', Role.STUDENT);
    await agent.get('/api/assignments').expect(403);
  });
});
