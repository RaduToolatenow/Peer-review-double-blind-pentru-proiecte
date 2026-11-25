import request from 'supertest';
import { AllocationService } from '../src/allocation/allocation.service';
import { ReviewStatus, Role } from '../src/generated/prisma/enums';
import { FILE_STORE, FileStore } from '../src/submissions/file-store';
import { clearDatabase, createAssignment, createClass, createRubric, createTestApp, DAY_MS, signedIn } from './helpers';

type Agent = ReturnType<typeof request.agent>;

const GOOD = 'Structura e clară, dar lipsesc testele pentru formular.';
const WINDOW = 'Calitatea feedback-ului se notează între alocare și termenul de contestații.';

describe('reviewer grades (D-028)', () => {
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
   * Three solo teams, a rubric with two criteria of levels 1 and 2, an assignment (k = 2), so each
   * student reviews the two other submissions. The professor calibrates team 0 at the highest
   * level; student 0 answers the lowest level, the others the highest; student 2 sends only the
   * review of team 0 unless `allSent`. Expected reviewer grades: student 0 → 1 (team 1 has no
   * reference, team 2's reference is 2), student 1 → (10 + 1) / 2, student 2 → (10 + 1 unsent) / 2.
   */
  async function setup({ allocate = true, send = true } = {}) {
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
    const answer = (level: 0 | 1) => ({
      scores: criteria.map((c) => ({ criterionId: c.id, levelId: c.levels[level].id, feedback: GOOD })),
    });
    if (allocate) {
      await allocation.allocateDue(new Date(Date.now() + 5 * DAY_MS));
    }
    if (allocate && send) {
      await professor
        .post(`/api/assignments/${assignment.id}/submissions/${submissions[0].id}/calibration`)
        .send(answer(1))
        .expect(200);
      for (const [index, student] of students.entries()) {
        const reviews = await ctx.prisma.review.findMany({ where: { reviewerId: student.id }, include: { submission: true } });
        for (const r of reviews) {
          if (index === 2 && r.submission.teamId !== klass.teams[0].id) continue;
          await student.agent.post(`/api/my/reviews/${r.id}`).send(answer(index === 0 ? 0 : 1)).expect(200);
        }
      }
    }
    return { professor, prof, criteria, klass, assignment, students, submissions };
  }

  type Setup = Awaited<ReturnType<typeof setup>>;

  /** Moves the deadlines into the past: the review deadline, and the dispute deadline too unless told otherwise. */
  async function close(s: Setup, disputes = true) {
    await ctx.prisma.assignment.update({
      where: { id: s.assignment.id },
      data: {
        reviewDeadline: new Date(Date.now() - 2000),
        disputeDeadline: disputes ? new Date(Date.now() - 1000) : new Date(Date.now() + DAY_MS),
      },
    });
  }

  /** The number, on the team's results page, of the given reviewer's review (PATTERN-005). */
  async function numberOf(s: Setup, team: number, reviewerId: string) {
    const reviews = await ctx.prisma.review.findMany({
      where: { submissionId: s.submissions[team].id, status: ReviewStatus.SUBMITTED },
      orderBy: { id: 'asc' },
    });
    return reviews.findIndex((r) => r.reviewerId === reviewerId) + 1;
  }

  function ratingUrl(s: Setup, team: number, number: number) {
    return `/api/assignments/${s.assignment.id}/teams/${s.klass.teams[team].id}/reviews/${number}/rating`;
  }

  async function mine(agent: Agent, assignmentId: string) {
    const res = await agent.get('/api/my/assignments').expect(200);
    return res.body.find((a: { id: string }) => a.id === assignmentId);
  }

  it("lets the professor rate a peer review's feedback 1–5 and change it, and shows which reviews can be rated", async () => {
    const s = await setup();
    const number = await numberOf(s, 0, s.students[1].id);
    const calibration = await numberOf(s, 0, s.prof.id);

    const view = (await s.professor.get(`/api/assignments/${s.assignment.id}/teams/${s.klass.teams[0].id}/results`).expect(200)).body;
    expect(view.canRate).toBe(true);
    expect(view.reviewers[calibration - 1]).toMatchObject({ number: calibration, rating: null, rateable: false });
    expect(view.reviewers[number - 1]).toMatchObject({ number, rating: null, rateable: true });

    const rated = await s.professor.put(ratingUrl(s, 0, number)).send({ rating: 2 }).expect(200);
    expect(rated.body.reviewers[number - 1].rating).toBe(2);
    const changed = await s.professor.put(ratingUrl(s, 0, number)).send({ rating: 4 }).expect(200);
    expect(changed.body.reviewers[number - 1].rating).toBe(4);
    expect(await ctx.prisma.reviewRating.count()).toBe(1);
  });

  it('refuses a rating outside 1–5, the calibration review, an unknown number, a student and another professor', async () => {
    const s = await setup();
    const number = await numberOf(s, 0, s.students[1].id);
    const calibration = await numberOf(s, 0, s.prof.id);

    await s.professor.put(ratingUrl(s, 0, number)).send({ rating: 0 }).expect(400);
    await s.professor.put(ratingUrl(s, 0, number)).send({ rating: 6 }).expect(400);
    await s.professor.put(ratingUrl(s, 0, number)).send({ rating: 2.5 }).expect(400);
    const own = await s.professor.put(ratingUrl(s, 0, calibration)).send({ rating: 3 }).expect(409);
    expect(own.body.message).toBe('Evaluarea ta de calibrare nu se notează.');
    await s.professor.put(ratingUrl(s, 0, 9)).send({ rating: 3 }).expect(404);
    await s.students[1].agent.put(ratingUrl(s, 0, number)).send({ rating: 3 }).expect(403);
    const { agent: other } = await signedIn(ctx, 'alt-prof@test.example', Role.PROFESSOR);
    await other.put(ratingUrl(s, 0, number)).send({ rating: 3 }).expect(404);
    expect(await ctx.prisma.reviewRating.count()).toBe(0);
  });

  it('accepts ratings only from allocation until the dispute deadline', async () => {
    const before = await setup({ allocate: false });
    const early = await before.professor.put(ratingUrl(before, 0, 1)).send({ rating: 3 }).expect(409);
    expect(early.body.message).toBe(WINDOW);

    await clearDatabase(ctx.prisma);
    const s = await setup();
    const number = await numberOf(s, 0, s.students[1].id);
    await close(s, false);
    await s.professor.put(ratingUrl(s, 0, number)).send({ rating: 3 }).expect(200);
    await close(s);
    const late = await s.professor.put(ratingUrl(s, 0, number)).send({ rating: 5 }).expect(409);
    expect(late.body.message).toBe(WINDOW);
    const view = (await s.professor.get(`/api/assignments/${s.assignment.id}/teams/${s.klass.teams[0].id}/results`).expect(200)).body;
    expect(view.canRate).toBe(false);
    expect(view.reviewers[number - 1].rating).toBe(3);
  });

  it('shows a student only their own reviewer grade, after the dispute deadline, with each review explained', async () => {
    const s = await setup();
    expect((await mine(s.students[1].agent, s.assignment.id)).reviewerGrade).toBeNull();
    await close(s, false);
    expect((await mine(s.students[1].agent, s.assignment.id)).reviewerGrade).toBeNull();
    // The professor rates student 1's review of team 0 with 1, and student 0's review of team 1
    // (which has no reference) with 5.
    await s.professor.put(ratingUrl(s, 0, await numberOf(s, 0, s.students[1].id))).send({ rating: 1 }).expect(200);
    await s.professor.put(ratingUrl(s, 1, await numberOf(s, 1, s.students[0].id))).send({ rating: 5 }).expect(200);
    await close(s);

    const one = await mine(s.students[1].agent, s.assignment.id);
    // (1 + 9 × 0.7) and 1, averaged.
    expect(one.reviewerGrade).toMatchObject({ grade: 4.15, provisional: false });
    expect(one.reviewerGrade.reviews).toHaveLength(2);
    expect(one.reviewerGrade.reviews.map((r: { number: number }) => r.number)).toEqual(one.reviews.map((r: { number: number }) => r.number));
    expect(one.reviewerGrade.reviews).toEqual(
      expect.arrayContaining([
        { number: expect.any(Number), sent: true, accuracy: 1, rating: 1, grade: 7.3, counted: true },
        { number: expect.any(Number), sent: true, accuracy: 0, rating: null, grade: 1, counted: true },
      ]),
    );
    // Student 0: the rated review with no reference gives 10, the other 1.
    expect((await mine(s.students[0].agent, s.assignment.id)).reviewerGrade.grade).toBe(5.5);
    // Student 2: 10 and the unsent review at 1.
    const two = await mine(s.students[2].agent, s.assignment.id);
    expect(two.reviewerGrade.grade).toBe(5.5);
    expect(two.reviewerGrade.reviews).toEqual(
      expect.arrayContaining([{ number: expect.any(Number), sent: false, accuracy: null, rating: null, grade: 1, counted: true }]),
    );

    const body = JSON.stringify(await s.students[1].agent.get('/api/my/assignments').expect(200).then((r) => r.body));
    for (const student of s.students) {
      expect(body).not.toContain(student.email);
      if (student.id !== s.students[1].id) expect(body).not.toContain(student.id);
    }
    expect(body).not.toContain(s.prof.id);
  });

  it('marks the reviewer grade provisional while a dispute is open', async () => {
    const s = await setup();
    await close(s, false);
    await s.students[1].agent
      .post(`/api/my/results/${s.assignment.id}/disputes`)
      .send({ reviewer: 1, criterion: 1, argument: 'Testele există în folderul tests, evaluatorul nu le-a văzut.' })
      .expect(200);
    await close(s);
    expect((await mine(s.students[2].agent, s.assignment.id)).reviewerGrade.provisional).toBe(true);
  });

  it("does not count the unsent review a withdrawn student kept because nobody could take it (D-022)", async () => {
    const s = await setup();
    await s.students[2].agent.post(`/api/my/assignments/${s.assignment.id}/withdraw`).expect(200);
    expect(await ctx.prisma.review.count({ where: { reviewerId: s.students[2].id, status: ReviewStatus.ALLOCATED } })).toBe(1);
    await close(s);

    const two = await mine(s.students[2].agent, s.assignment.id);
    expect(two.reviewerGrade.grade).toBe(10);
    expect(two.reviewerGrade.reviews).toEqual(
      expect.arrayContaining([{ number: expect.any(Number), sent: false, accuracy: null, rating: null, grade: null, counted: false }]),
    );
  });

  it('shows the professor every reviewer grade by number, a reviewer who sent nothing at 1 after the review deadline', async () => {
    const s = await setup({ send: false });
    const before = (await s.professor.get(`/api/assignments/${s.assignment.id}/grades`).expect(200)).body;
    expect(before.reviewers).toHaveLength(3);
    expect(before.reviewers.every((r: { reviewerGrade: unknown; reviewsSent: number }) => r.reviewerGrade === null && r.reviewsSent === 0)).toBe(
      true,
    );
    await close(s, false);

    const after = (await s.professor.get(`/api/assignments/${s.assignment.id}/grades`).expect(200)).body;
    expect(after.reviewers.map((r: { number: number; reviewerGrade: number }) => [r.number, r.reviewerGrade])).toEqual([
      [1, 1],
      [2, 1],
      [3, 1],
    ]);
    const body = JSON.stringify(after);
    for (const student of s.students) {
      expect(body).not.toContain(student.email);
      expect(body).not.toContain(student.id);
    }
  });
});
