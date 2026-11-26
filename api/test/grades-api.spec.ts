import request from 'supertest';
import { AllocationService } from '../src/allocation/allocation.service';
import { ReviewStatus, Role } from '../src/generated/prisma/enums';
import { NotificationsService } from '../src/notifications/notifications.service';
import { FILE_STORE, FileStore } from '../src/submissions/file-store';
import { clearDatabase, createAssignment, createClass, createRubric, createTestApp, DAY_MS, signedIn } from './helpers';

type Agent = ReturnType<typeof request.agent>;

const GOOD = 'Structura e clară, dar lipsesc testele pentru formular.';
const ALREADY_SENT = 'Ai trimis deja această evaluare; nu se mai poate schimba.';

describe('calibration and grades (D-025)', () => {
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
   * criteria of levels 1 and 2, and an assignment (k = 2), allocated unless told otherwise.
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

  /** The same level (0 = lowest, 1 = highest) and good feedback for every criterion. */
  function answer(criteria: { id: string; levels: { id: string }[] }[], level: 0 | 1 = 1) {
    return { scores: criteria.map((c) => ({ criterionId: c.id, levelId: c.levels[level].id, feedback: GOOD })) };
  }

  function calibrationUrl(assignmentId: string, submissionId: string) {
    return `/api/assignments/${assignmentId}/submissions/${submissionId}/calibration`;
  }

  it('shows the calibration form with the submission, the team and the rubric', async () => {
    const { professor, assignment, submissions, criteria, klass } = await setup();

    const res = await professor.get(calibrationUrl(assignment.id, submissions[0].id)).expect(200);
    expect(res.body).toMatchObject({
      assignmentTitle: 'Tema de test',
      teamName: klass.teams[0].name,
      status: 'ALLOCATED',
      submittedAt: null,
      canSend: true,
      scores: [],
      submission: { link: 'https://p0.example', fileUrl: `/api/submissions/${submissions[0].id}/file` },
    });
    expect(res.body.criteria.map((c: { id: string }) => c.id)).toEqual(criteria.map((c) => c.id));
  });

  it('sends a calibration review once, marked as calibration and by the professor', async () => {
    const { professor, prof, assignment, submissions, criteria } = await setup();
    const url = calibrationUrl(assignment.id, submissions[0].id);

    const res = await professor.post(url).send(answer(criteria)).expect(200);
    expect(res.body).toMatchObject({ status: 'SUBMITTED', canSend: false });
    expect(res.body.scores).toHaveLength(2);
    const stored = await ctx.prisma.review.findFirstOrThrow({ where: { reviewerId: prof.id }, include: { scores: true } });
    expect(stored).toMatchObject({ submissionId: submissions[0].id, isCalibration: true, status: ReviewStatus.SUBMITTED });
    expect(stored.scores).toHaveLength(2);

    const again = await professor.post(url).send(answer(criteria)).expect(409);
    expect(again.body.message).toBe(ALREADY_SENT);
  });

  it('refuses an incomplete calibration review and saves nothing', async () => {
    const { professor, prof, assignment, submissions, criteria } = await setup();

    const res = await professor.post(calibrationUrl(assignment.id, submissions[0].id)).send(answer([criteria[0]])).expect(400);
    expect(res.body.message).toBe('Alege un nivel și scrie cel puțin 20 de caractere la fiecare criteriu.');
    expect(await ctx.prisma.review.count({ where: { reviewerId: prof.id } })).toBe(0);
  });

  it('refuses calibration before allocation and after the review deadline', async () => {
    const { professor, assignment, submissions, criteria } = await setup(false);
    const url = calibrationUrl(assignment.id, submissions[0].id);

    const early = await professor.post(url).send(answer(criteria)).expect(409);
    expect(early.body.message).toBe('Calibrarea începe după alocarea evaluatorilor.');
    expect((await professor.get(url).expect(200)).body.canSend).toBe(false);

    await allocation.allocateDue(new Date(Date.now() + 5 * DAY_MS));
    await ctx.prisma.assignment.update({ where: { id: assignment.id }, data: { reviewDeadline: new Date(Date.now() - 1000) } });
    const late = await professor.post(url).send(answer(criteria)).expect(409);
    expect(late.body.message).toBe('Termenul de evaluare a trecut.');
  });

  it("answers 404 to another professor and 403 to a student", async () => {
    const { assignment, submissions, students, criteria } = await setup();
    const { agent: other } = await signedIn(ctx, 'alt-prof@test.example', Role.PROFESSOR);
    const url = calibrationUrl(assignment.id, submissions[0].id);

    await other.get(url).expect(404);
    await other.post(url).send(answer(criteria)).expect(404);
    await other.get(`/api/assignments/${assignment.id}/grades`).expect(404);
    await students[1].agent.get(url).expect(403);
    await students[1].agent.get(`/api/assignments/${assignment.id}/grades`).expect(403);
  });

  it('answers 404 for a submission of another assignment', async () => {
    const { professor, prof, submissions, klass } = await setup();
    const rubric = await createRubric(ctx.prisma, prof.id, 'Altă grilă');
    const otherAssignment = await createAssignment(ctx.prisma, prof.id, rubric.id, klass.id);

    await professor.get(calibrationUrl(otherAssignment.id, submissions[0].id)).expect(404);
  });

  it("refuses in the database a calibration flag on a student's review, or a peer review by the professor", async () => {
    const { prof, students, submissions } = await setup(false);

    await expect(
      ctx.prisma.review.create({ data: { submissionId: submissions[0].id, reviewerId: students[1].id, isCalibration: true } }),
    ).rejects.toThrow(/calibration/);
    await expect(
      ctx.prisma.review.create({ data: { submissionId: submissions[0].id, reviewerId: prof.id, isCalibration: false } }),
    ).rejects.toThrow(/calibration/);
  });

  it('leaves calibration reviews out of review counts and notifications', async () => {
    const { professor, prof, assignment, submissions, criteria } = await setup();
    await professor.post(calibrationUrl(assignment.id, submissions[0].id)).send(answer(criteria)).expect(200);

    const detail = (await professor.get(`/api/assignments/${assignment.id}`).expect(200)).body;
    expect(detail.reviewsSubmitted).toBe(0);
    expect(detail.teams.map((t: { reviewsReceived: number }) => t.reviewsReceived)).toEqual([0, 0, 0]);
    const list = (await professor.get('/api/assignments').expect(200)).body;
    expect(list[0].reviewsSubmitted).toBe(0);

    await ctx.app.get(NotificationsService).recordDue();
    expect(await ctx.prisma.notification.count({ where: { userId: prof.id } })).toBe(0);
  });

  it('shows no grades before allocation', async () => {
    const { professor, assignment } = await setup(false);

    const res = await professor.get(`/api/assignments/${assignment.id}/grades`).expect(200);
    expect(res.body).toEqual({ allocated: false, provisional: true, submissions: [], reviewers: [] });
  });

  it('grades each submission with reliability-weighted reviews and lists reviewers only by number', async () => {
    const { professor, assignment, submissions, students, criteria, klass } = await setup();
    // Every submission is calibrated at the highest level; student 0 answers the lowest level.
    for (const submission of submissions) {
      await professor.post(calibrationUrl(assignment.id, submission.id)).send(answer(criteria)).expect(200);
    }
    for (const [index, student] of students.entries()) {
      const reviews = await ctx.prisma.review.findMany({ where: { reviewerId: student.id } });
      for (const review of reviews) {
        await student.agent.post(`/api/my/reviews/${review.id}`).send(answer(criteria, index === 0 ? 0 : 1)).expect(200);
      }
    }

    const res = await professor.get(`/api/assignments/${assignment.id}/grades`).expect(200);
    expect(res.body.allocated).toBe(true);
    expect(res.body.provisional).toBe(true);
    // Team 0 is reviewed only by students 1 and 2. Teams 1 and 2 have student 0 at reliability 0.2:
    // (0.2 × 1 + 2 + 2) / 2.2 → 0.909 of the range → 9.18.
    expect(res.body.submissions).toEqual(
      klass.teams.map((team, t) => ({
        teamId: team.id,
        teamName: team.name,
        grade: t === 0 ? 10 : 9.18,
        reviewsCounted: 2,
        calibrated: true,
        disputes: { open: 0, upheld: 0, rejected: 0 },
      })),
    );
    expect(res.body.reviewers.map((r: { number: number }) => r.number)).toEqual([1, 2, 3]);
    const flagged = res.body.reviewers.filter((r: { flagged: boolean }) => r.flagged);
    expect(flagged).toEqual([
      { number: expect.any(Number), reliability: 0.2, flagged: true, measured: true, reviewsSent: 2, reviewerGrade: expect.any(Number) },
    ]);
    expect(res.body.reviewers.filter((r: { reliability: number }) => r.reliability === 1)).toHaveLength(2);

    const text = JSON.stringify(res.body);
    for (const student of students) {
      expect(text).not.toContain(student.id);
      expect(text).not.toContain(student.email);
    }
  });

  it('marks grades final after the review deadline', async () => {
    const { professor, assignment } = await setup();
    await ctx.prisma.assignment.update({ where: { id: assignment.id }, data: { reviewDeadline: new Date(Date.now() - 1000) } });

    const res = await professor.get(`/api/assignments/${assignment.id}/grades`).expect(200);
    expect(res.body.provisional).toBe(false);
    expect(res.body.submissions.map((s: { grade: number | null }) => s.grade)).toEqual([null, null, null]);
  });
});
