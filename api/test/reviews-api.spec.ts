import request from 'supertest';
import { AllocationService } from '../src/allocation/allocation.service';
import { ReviewStatus, Role } from '../src/generated/prisma/enums';
import { FILE_STORE, FileStore } from '../src/submissions/file-store';
import { clearDatabase, createAssignment, createClass, createRubric, createTestApp, DAY_MS, signedIn } from './helpers';

type Agent = ReturnType<typeof request.agent>;

const GOOD = 'Structura e clară, dar lipsesc testele pentru formular.';

describe('double-blind reviews (D-023)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let allocation: AllocationService;
  let files: FileStore;

  beforeAll(async () => {
    ctx = await createTestApp();
    allocation = ctx.app.get(AllocationService);
    files = ctx.app.get(FILE_STORE);
  });

  beforeEach(async () => {
    await clearDatabase(ctx.prisma);
  });

  afterAll(async () => {
    await ctx.close();
  });

  /**
   * Three solo teams with a signed-in student and a submission each, a rubric with two
   * criteria, and an assignment (k = 2) allocated after its submission deadline.
   */
  async function setup() {
    const { agent: professor, user: prof } = await signedIn(ctx, 'prof@test.example', Role.PROFESSOR);
    const rubric = await createRubric(ctx.prisma, prof.id);
    const second = await ctx.prisma.rubricCriterion.create({
      data: {
        rubricId: rubric.id,
        title: 'Documentația',
        weight: 1,
        position: 2,
        levels: { create: [{ score: 1, descriptor: 'Lipsește' }, { score: 2, descriptor: 'README complet' }] },
      },
      include: { levels: true },
    });
    const criteria = [rubric.criteria[0], second];
    const klass = await createClass(ctx.prisma, prof.id, 3);
    const assignment = await createAssignment(ctx.prisma, prof.id, rubric.id, klass.id, new Date(Date.now() + 3 * DAY_MS));
    const students: { agent: Agent; id: string }[] = [];
    for (let t = 0; t < 3; t += 1) {
      const team = klass.teams[t];
      const { agent, user } = await signedIn(ctx, `s${t}@test.example`, Role.STUDENT);
      await ctx.prisma.teamMember.create({ data: { teamId: team.id, classId: klass.id, userId: user.id } });
      const fileKey = `f${t}.pdf`;
      await files.put(fileKey, Buffer.from('%PDF-1.4 test'), 'application/pdf');
      await ctx.prisma.submission.create({
        data: { assignmentId: assignment.id, teamId: team.id, link: `https://p${t}.example`, fileKey, fileType: 'pdf' },
      });
      students.push({ agent, id: user.id });
    }
    await allocation.allocateDue(new Date(Date.now() + 5 * DAY_MS));
    const me = students[0];
    const mine = await ctx.prisma.review.findMany({ where: { reviewerId: me.id }, orderBy: { id: 'asc' } });
    return { professor, prof, rubric, criteria, klass, assignment, students, me, mine };
  }

  /** A complete answer: the first level and good feedback for every criterion. */
  function answer(criteria: { id: string; levels: { id: string }[] }[]) {
    return { scores: criteria.map((c) => ({ criterionId: c.id, levelId: c.levels[0].id, feedback: GOOD })) };
  }

  it("lists my reviews in my assignments, numbered, without teams or other reviewers", async () => {
    const { me, mine, students } = await setup();

    const list = (await me.agent.get('/api/my/assignments').expect(200)).body;
    expect(list[0].reviews).toEqual(mine.map((r, i) => ({ id: r.id, number: i + 1, status: 'ALLOCATED' })));
    const text = JSON.stringify(list);
    for (const other of students.slice(1)) {
      expect(text).not.toContain(other.id);
    }
  });

  it('shows a review with the submission and the rubric, never the team', async () => {
    const { me, mine, criteria, klass } = await setup();
    const review = mine[0];
    const submission = await ctx.prisma.submission.findUniqueOrThrow({ where: { id: review.submissionId } });

    const res = await me.agent.get(`/api/my/reviews/${review.id}`).expect(200);
    expect(res.body).toMatchObject({
      id: review.id,
      number: 1,
      status: 'ALLOCATED',
      canSend: true,
      scores: [],
      submission: { link: submission.link, fileType: 'pdf', fileUrl: `/api/submissions/${submission.id}/file` },
    });
    expect(res.body.criteria.map((c: { id: string }) => c.id)).toEqual(criteria.map((c) => c.id));
    expect(res.body.criteria[0].levels).toHaveLength(2);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(submission.teamId);
    for (const team of klass.teams) {
      expect(text).not.toContain(team.name);
    }
  });

  it("answers 404 for someone else's review", async () => {
    const { students, mine } = await setup();
    const stranger = students.find((s) => s.id !== mine[0].reviewerId && s.id !== students[0].id)!;
    const notMine = await ctx.prisma.review.findFirstOrThrow({ where: { reviewerId: { not: stranger.id } } });

    await stranger.agent.get(`/api/my/reviews/${notMine.id}`).expect(404);
    await stranger.agent.post(`/api/my/reviews/${notMine.id}`).send(answer([])).expect(404);
  });

  it('sends a complete review once, saves the scores and locks the rubric', async () => {
    const { me, mine, criteria, rubric } = await setup();
    const review = mine[0];

    const res = await me.agent.post(`/api/my/reviews/${review.id}`).send(answer(criteria)).expect(200);
    expect(res.body).toMatchObject({ status: 'SUBMITTED', canSend: false });
    expect(res.body.scores).toHaveLength(2);
    const stored = await ctx.prisma.review.findUniqueOrThrow({ where: { id: review.id }, include: { scores: true } });
    expect(stored.status).toBe(ReviewStatus.SUBMITTED);
    expect(stored.submittedAt).not.toBeNull();
    expect(stored.scores.map((s) => s.feedback)).toEqual([GOOD, GOOD]);
    expect((await ctx.prisma.rubric.findUniqueOrThrow({ where: { id: rubric.id } })).lockedAt).not.toBeNull();

    const again = await me.agent.post(`/api/my/reviews/${review.id}`).send(answer(criteria)).expect(409);
    expect(again.body.message).toBe('Ai trimis deja această evaluare; nu se mai poate schimba.');
  });

  it('refuses a missing criterion, short feedback or a level of another criterion, and saves nothing', async () => {
    const { me, mine, criteria } = await setup();
    const url = `/api/my/reviews/${mine[0].id}`;
    const message = 'Alege un nivel și scrie cel puțin 20 de caractere la fiecare criteriu.';

    const missing = await me.agent.post(url).send(answer([criteria[0]])).expect(400);
    expect(missing.body.message).toBe(message);

    const short = answer(criteria);
    short.scores[1].feedback = `   ${'a'.repeat(19)}   `;
    expect((await me.agent.post(url).send(short).expect(400)).body.message).toBe(message);

    const wrongLevel = answer(criteria);
    wrongLevel.scores[0].levelId = criteria[1].levels[0].id;
    expect((await me.agent.post(url).send(wrongLevel).expect(400)).body.message).toBe(message);

    expect(await ctx.prisma.reviewScore.count()).toBe(0);
    expect((await ctx.prisma.review.findUniqueOrThrow({ where: { id: mine[0].id } })).status).toBe(ReviewStatus.ALLOCATED);
  });

  it('refuses a review after the review deadline', async () => {
    const { me, mine, criteria, assignment } = await setup();
    await ctx.prisma.assignment.update({ where: { id: assignment.id }, data: { reviewDeadline: new Date(Date.now() - 1000) } });

    const res = await me.agent.post(`/api/my/reviews/${mine[0].id}`).send(answer(criteria)).expect(409);
    expect(res.body.message).toBe('Termenul de evaluare a trecut.');
    expect((await me.agent.get(`/api/my/reviews/${mine[0].id}`).expect(200)).body.canSend).toBe(false);
  });

  it('lets a reviewer download the file they review, and still no stranger', async () => {
    const { me, mine } = await setup();
    const url = `/api/submissions/${mine[0].submissionId}/file`;

    await me.agent.get(url).expect(200);
    const { agent: stranger } = await signedIn(ctx, 'altul@test.example', Role.STUDENT);
    await stranger.get(url).expect(404);
  });
});
