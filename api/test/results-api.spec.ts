import request from 'supertest';
import { AllocationService } from '../src/allocation/allocation.service';
import { Role } from '../src/generated/prisma/enums';
import { FILE_STORE, FileStore } from '../src/submissions/file-store';
import { clearDatabase, createAssignment, createClass, createRubric, createTestApp, DAY_MS, signedIn } from './helpers';

type Agent = ReturnType<typeof request.agent>;

const GOOD = 'Structura e clară, dar lipsesc testele pentru formular.';

describe('results page (D-026)', () => {
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
   * criteria of levels 1 and 2, and an assignment (k = 2), allocated: each student reviews
   * the other two submissions.
   */
  async function setup(allocate = true) {
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
    const criteria = [rubric.criteria[0], second].map((c) => ({ ...c, levels: [...c.levels].sort((a, b) => a.score - b.score) }));
    const klass = await createClass(ctx.prisma, prof.id, 3);
    const assignment = await createAssignment(ctx.prisma, prof.id, rubric.id, klass.id, new Date(Date.now() + 3 * DAY_MS));
    const students: { agent: Agent; id: string; email: string }[] = [];
    const submissions: { id: string; teamId: string }[] = [];
    for (let t = 0; t < 3; t += 1) {
      const team = klass.teams[t];
      const email = `s${t}@test.example`;
      const { agent, user } = await signedIn(ctx, email, Role.STUDENT);
      await ctx.prisma.teamMember.create({ data: { teamId: team.id, classId: klass.id, userId: user.id } });
      const fileKey = `f${t}.pdf`;
      await files.put(fileKey, Buffer.from('%PDF-1.4 test'), 'application/pdf');
      submissions.push(
        await ctx.prisma.submission.create({
          data: { assignmentId: assignment.id, teamId: team.id, link: `https://p${t}.example`, fileKey, fileType: 'pdf' },
        }),
      );
      students.push({ agent, id: user.id, email });
    }
    if (allocate) {
      await allocation.allocateDue(new Date(Date.now() + 5 * DAY_MS));
    }
    return { professor, prof, criteria, klass, assignment, students, submissions };
  }

  function answer(criteria: { id: string; levels: { id: string }[] }[], level: 0 | 1 = 1) {
    return { scores: criteria.map((c) => ({ criterionId: c.id, levelId: c.levels[level].id, feedback: GOOD })) };
  }

  /**
   * The professor calibrates team 0's submission at the highest level; student 0 answers the
   * lowest level, the others the highest. Reliability: student 0 → 0.2, students 1 and 2 → 0.5.
   */
  async function review(s: Awaited<ReturnType<typeof setup>>) {
    await s.professor
      .post(`/api/assignments/${s.assignment.id}/submissions/${s.submissions[0].id}/calibration`)
      .send(answer(s.criteria))
      .expect(200);
    for (const [index, student] of s.students.entries()) {
      const reviews = await ctx.prisma.review.findMany({ where: { reviewerId: student.id } });
      for (const r of reviews) {
        await student.agent.post(`/api/my/reviews/${r.id}`).send(answer(s.criteria, index === 0 ? 0 : 1)).expect(200);
      }
    }
  }

  async function closeReviews(assignmentId: string) {
    await ctx.prisma.assignment.update({ where: { id: assignmentId }, data: { reviewDeadline: new Date(Date.now() - 1000) } });
  }

  it('lists my team assignments, unavailable and without a grade before the review deadline', async () => {
    const s = await setup();
    await review(s);

    const before = (await s.students[0].agent.get('/api/my/results').expect(200)).body;
    expect(before).toEqual([
      {
        assignmentId: s.assignment.id,
        title: 'Tema de test',
        className: s.klass.name,
        teamName: s.klass.teams[0].name,
        reviewDeadline: expect.any(String),
        available: false,
        grade: null,
      },
    ]);
    const early = await s.students[0].agent.get(`/api/my/results/${s.assignment.id}`).expect(409);
    expect(early.body.message).toBe('Rezultatele apar după termenul de evaluare.');

    await closeReviews(s.assignment.id);
    const after = (await s.students[0].agent.get('/api/my/results').expect(200)).body;
    expect(after[0]).toMatchObject({ available: true, grade: 10 });
  });

  it('explains the grade with every review, numbered, the calibration among them', async () => {
    const s = await setup();
    await review(s);
    await closeReviews(s.assignment.id);

    const res = await s.students[0].agent.get(`/api/my/results/${s.assignment.id}`).expect(200);
    expect(res.body).toMatchObject({
      assignmentId: s.assignment.id,
      title: 'Tema de test',
      teamName: s.klass.teams[0].name,
      provisional: false,
      grade: 10,
    });
    // Students 1 and 2 (0.5 each) and the professor's calibration (1), unlabelled.
    expect(res.body.reviewers.map((r: { number: number }) => r.number)).toEqual([1, 2, 3]);
    expect(res.body.reviewers.map((r: { weight: number }) => r.weight).sort()).toEqual([0.5, 0.5, 1]);
    expect(res.body.criteria).toHaveLength(2);
    expect(res.body.criteria[0]).toMatchObject({ position: 1, title: 'Calitatea codului', weight: 1, lowest: 1, highest: 2, mean: 2, scaled: 1 });
    expect(res.body.criteria[0].levels).toEqual(
      [1, 2, 3].map((number) => ({ number, score: 2, descriptor: 'Bun', feedback: GOOD, dispute: null })),
    );

    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/calibr/i);
    expect(text).not.toContain(s.prof.id);
    for (const student of s.students) {
      expect(text).not.toContain(student.id);
      expect(text).not.toContain(student.email);
    }
    const reviewIds = await ctx.prisma.review.findMany({ select: { id: true } });
    for (const { id } of reviewIds) {
      expect(text).not.toContain(id);
    }
  });

  it('weights an unreliable reviewer less', async () => {
    const s = await setup();
    await review(s);
    await closeReviews(s.assignment.id);

    // Team 1: student 0 (0.2) gave 1, student 2 (0.5) gave 2: (0.2 + 1) / 0.7 → 0.714 of the range.
    const res = await s.students[1].agent.get(`/api/my/results/${s.assignment.id}`).expect(200);
    expect(res.body.grade).toBe(7.43);
    expect(res.body.criteria[0]).toMatchObject({ mean: 1.71, scaled: 0.71 });
    expect(res.body.reviewers.map((r: { weight: number }) => r.weight).sort()).toEqual([0.2, 0.5]);
  });

  it('answers 404 to a non-member and leaves a team without a submission out', async () => {
    const s = await setup(false);
    await ctx.prisma.submission.delete({ where: { id: s.submissions[2].id } });
    const { agent: linked, user } = await signedIn(ctx, 'link@test.example', Role.STUDENT);
    await ctx.prisma.assignmentReviewer.create({ data: { assignmentId: s.assignment.id, userId: user.id } });
    await allocation.allocateDue(new Date(Date.now() + 5 * DAY_MS));
    await closeReviews(s.assignment.id);

    expect((await linked.get('/api/my/results').expect(200)).body).toEqual([]);
    await linked.get(`/api/my/results/${s.assignment.id}`).expect(404);
    expect((await s.students[2].agent.get('/api/my/results').expect(200)).body).toEqual([]);
    await s.students[2].agent.get(`/api/my/results/${s.assignment.id}`).expect(404);
  });

  it('gives no grade to a submission without sent reviews', async () => {
    const s = await setup();
    await closeReviews(s.assignment.id);

    const res = await s.students[0].agent.get(`/api/my/results/${s.assignment.id}`).expect(200);
    expect(res.body).toMatchObject({ grade: null, reviewers: [] });
    expect(res.body.criteria[0]).toMatchObject({ mean: null, scaled: null, levels: [] });
  });

  it('shows a withdrawn member their team results', async () => {
    const s = await setup();
    await review(s);
    await s.students[0].agent.post(`/api/my/assignments/${s.assignment.id}/withdraw`).expect(200);
    await closeReviews(s.assignment.id);

    await s.students[0].agent.get(`/api/my/results/${s.assignment.id}`).expect(200);
  });

  it("lets the professor open a team's results, provisional before the review deadline", async () => {
    const s = await setup();
    await review(s);
    const url = `/api/assignments/${s.assignment.id}/teams/${s.klass.teams[1].id}/results`;

    const res = await s.professor.get(url).expect(200);
    expect(res.body).toMatchObject({ teamName: s.klass.teams[1].name, provisional: true, grade: 7.43 });

    const { agent: other } = await signedIn(ctx, 'alt-prof@test.example', Role.PROFESSOR);
    await other.get(url).expect(404);
    await s.students[0].agent.get(url).expect(403);
  });

  it('answers 409 to the professor before allocation', async () => {
    const s = await setup(false);

    const res = await s.professor.get(`/api/assignments/${s.assignment.id}/teams/${s.klass.teams[0].id}/results`).expect(409);
    expect(res.body.message).toBe('Rezultatele apar după alocarea evaluatorilor.');
  });
});
