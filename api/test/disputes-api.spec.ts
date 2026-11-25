import request from 'supertest';
import { AllocationService } from '../src/allocation/allocation.service';
import { NotificationKind, Role } from '../src/generated/prisma/enums';
import { MAILER, MemoryMailer } from '../src/mail/mailer';
import { NotificationsService } from '../src/notifications/notifications.service';
import { FILE_STORE, FileStore } from '../src/submissions/file-store';
import { clearDatabase, createAssignment, createClass, createRubric, createTestApp, DAY_MS, signedIn } from './helpers';

type Agent = ReturnType<typeof request.agent>;

const GOOD = 'Structura e clară, dar lipsesc testele pentru formular.';
const ARGUMENT = 'Testele există în folderul tests, evaluatorul nu le-a văzut.';
const DECISION = 'Am verificat: testele există și acoperă formularul.';
const WINDOW = 'Contestațiile se pot trimite între termenul de evaluare și termenul de contestații.';

describe('disputes (D-027)', () => {
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
   * Three solo teams, a rubric with two criteria of levels 1 and 2, an assignment (k = 2)
   * allocated. The professor calibrates team 0 at the highest level; student 0 answers the
   * lowest level, the others the highest. Team 1's grade: 7.43. The review deadline then passes.
   */
  async function setup(closeReviews = true) {
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
    await allocation.allocateDue(new Date(Date.now() + 5 * DAY_MS));
    const answer = (level: 0 | 1) => ({
      scores: criteria.map((c) => ({ criterionId: c.id, levelId: c.levels[level].id, feedback: GOOD })),
    });
    await professor
      .post(`/api/assignments/${assignment.id}/submissions/${submissions[0].id}/calibration`)
      .send(answer(1))
      .expect(200);
    for (const [index, student] of students.entries()) {
      const reviews = await ctx.prisma.review.findMany({ where: { reviewerId: student.id } });
      for (const r of reviews) {
        await student.agent.post(`/api/my/reviews/${r.id}`).send(answer(index === 0 ? 0 : 1)).expect(200);
      }
    }
    if (closeReviews) {
      await ctx.prisma.assignment.update({ where: { id: assignment.id }, data: { reviewDeadline: new Date(Date.now() - 1000) } });
    }
    return { professor, prof, criteria, klass, assignment, students, submissions };
  }

  /** The reviewer number, in team 1's results, of student 0 (who gave the lowest level). */
  async function lowNumber(s: Awaited<ReturnType<typeof setup>>) {
    const res = await s.students[1].agent.get(`/api/my/results/${s.assignment.id}`).expect(200);
    return res.body.criteria[0].levels.find((l: { score: number }) => l.score === 1).number as number;
  }

  function disputeUrl(assignmentId: string) {
    return `/api/my/results/${assignmentId}/disputes`;
  }

  it('lets a team member dispute one criterion of a review once, with an argument', async () => {
    const s = await setup();
    const url = disputeUrl(s.assignment.id);

    const before = (await s.students[1].agent.get(`/api/my/results/${s.assignment.id}`).expect(200)).body;
    expect(before).toMatchObject({ canDispute: true, disputeDeadline: expect.any(String) });
    expect(before.criteria[0].levels.every((l: { dispute: unknown }) => l.dispute === null)).toBe(true);

    const res = await s.students[1].agent.post(url).send({ reviewer: 1, criterion: 1, argument: `  ${ARGUMENT}  ` }).expect(200);
    expect(res.body.criteria[0].levels[0].dispute).toMatchObject({
      status: 'OPEN',
      argument: ARGUMENT,
      createdAt: expect.any(String),
      decision: null,
      decidedAt: null,
      newScore: null,
      newDescriptor: null,
    });
    expect(res.body.criteria[1].levels[0].dispute).toBeNull();

    const again = await s.students[1].agent.post(url).send({ reviewer: 1, criterion: 1, argument: ARGUMENT }).expect(409);
    expect(again.body.message).toBe('Ai contestat deja acest criteriu al acestei evaluări.');
  });

  it('refuses a short argument, an unknown reviewer or criterion, and a non-member', async () => {
    const s = await setup();
    const url = disputeUrl(s.assignment.id);

    const short = await s.students[1].agent.post(url).send({ reviewer: 1, criterion: 1, argument: 'a'.repeat(19) }).expect(400);
    expect(short.body.message).toBe('Scrie un argument de cel puțin 20 de caractere.');
    await s.students[1].agent.post(url).send({ reviewer: 9, criterion: 1, argument: ARGUMENT }).expect(404);
    await s.students[1].agent.post(url).send({ reviewer: 1, criterion: 9, argument: ARGUMENT }).expect(404);
    const { agent: stranger } = await signedIn(ctx, 'altul@test.example', Role.STUDENT);
    await stranger.post(url).send({ reviewer: 1, criterion: 1, argument: ARGUMENT }).expect(404);
    expect(await ctx.prisma.dispute.count()).toBe(0);
  });

  it('accepts disputes only between the review deadline and the dispute deadline', async () => {
    const s = await setup(false);
    const url = disputeUrl(s.assignment.id);

    // Before the review deadline the results are not open yet.
    await s.students[1].agent.post(url).send({ reviewer: 1, criterion: 1, argument: ARGUMENT }).expect(409);

    await ctx.prisma.assignment.update({
      where: { id: s.assignment.id },
      data: { reviewDeadline: new Date(Date.now() - 2000), disputeDeadline: new Date(Date.now() - 1000) },
    });
    const late = await s.students[1].agent.post(url).send({ reviewer: 1, criterion: 1, argument: ARGUMENT }).expect(409);
    expect(late.body.message).toBe(WINDOW);
    expect((await s.students[1].agent.get(`/api/my/results/${s.assignment.id}`).expect(200)).body.canDispute).toBe(false);
  });

  it("refuses in the database a dispute by someone outside the reviewed team, and a duplicate", async () => {
    const s = await setup();
    const review = await ctx.prisma.review.findFirstOrThrow({ where: { submissionId: s.submissions[1].id } });
    const criterionId = s.criteria[0].id;

    await expect(
      ctx.prisma.dispute.create({ data: { reviewId: review.id, criterionId, authorId: s.students[2].id, argument: ARGUMENT } }),
    ).rejects.toThrow(/team/);
    await ctx.prisma.dispute.create({ data: { reviewId: review.id, criterionId, authorId: s.students[1].id, argument: ARGUMENT } });
    await expect(
      ctx.prisma.dispute.create({ data: { reviewId: review.id, criterionId, authorId: s.students[1].id, argument: ARGUMENT } }),
    ).rejects.toThrow();
  });

  it('lists disputes to the professor without the member who filed or any reviewer identity', async () => {
    const s = await setup();
    // Team 0 disputes every reviewer on criterion 1; the professor's calibration is one of them.
    for (const reviewer of [1, 2, 3]) {
      await s.students[0].agent.post(disputeUrl(s.assignment.id)).send({ reviewer, criterion: 1, argument: ARGUMENT }).expect(200);
    }

    const res = await s.professor.get(`/api/assignments/${s.assignment.id}/disputes`).expect(200);
    expect(res.body).toHaveLength(3);
    expect(res.body.map((d: { reviewer: number }) => d.reviewer).sort()).toEqual([1, 2, 3]);
    expect(res.body[0]).toMatchObject({
      id: expect.any(String),
      teamName: s.klass.teams[0].name,
      criterion: { position: 1, title: 'Calitatea codului' },
      level: { score: 2, descriptor: 'Bun' },
      feedback: GOOD,
      argument: ARGUMENT,
      status: 'OPEN',
      decision: null,
      newLevel: null,
      decidedAt: null,
    });
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/calibr/i);
    for (const student of s.students) {
      expect(text).not.toContain(student.id);
      expect(text).not.toContain(student.email);
    }
    expect(text).not.toContain(s.prof.id);
    const reviewIds = await ctx.prisma.review.findMany({ select: { id: true } });
    for (const { id } of reviewIds) {
      expect(text).not.toContain(id);
    }
  });

  it('upholds a dispute with a new level, which the grade then uses; the original stays', async () => {
    const s = await setup();
    const number = await lowNumber(s);
    await s.students[1].agent.post(disputeUrl(s.assignment.id)).send({ reviewer: number, criterion: 1, argument: ARGUMENT }).expect(200);
    const [dispute] = (await s.professor.get(`/api/assignments/${s.assignment.id}/disputes`).expect(200)).body;

    const decided = await s.professor
      .post(`/api/assignments/${s.assignment.id}/disputes/${dispute.id}/decision`)
      .send({ upheld: true, levelId: s.criteria[0].levels[1].id, decision: DECISION })
      .expect(200);
    expect(decided.body).toMatchObject({ status: 'UPHELD', decision: DECISION, newLevel: { score: 2, descriptor: 'Bun' } });

    const results = (await s.students[1].agent.get(`/api/my/results/${s.assignment.id}`).expect(200)).body;
    const row = results.criteria[0].levels.find((l: { number: number }) => l.number === number);
    expect(row).toMatchObject({ score: 1, dispute: { status: 'UPHELD', decision: DECISION, newScore: 2, newDescriptor: 'Bun' } });
    expect(row.dispute.decidedAt).toEqual(expect.any(String));
    // Both reviewers now give 2 on criterion 1.
    expect(results.criteria[0]).toMatchObject({ mean: 2, scaled: 1 });
    expect(results.grade).toBeGreaterThan(7.43);
    const stored = await ctx.prisma.reviewScore.findMany({ where: { criterionId: s.criteria[0].id, level: { score: 1 } } });
    expect(stored.length).toBeGreaterThan(0);
  });

  it('rejects a dispute and leaves the grade as it was', async () => {
    const s = await setup();
    const number = await lowNumber(s);
    await s.students[1].agent.post(disputeUrl(s.assignment.id)).send({ reviewer: number, criterion: 1, argument: ARGUMENT }).expect(200);
    const [dispute] = (await s.professor.get(`/api/assignments/${s.assignment.id}/disputes`).expect(200)).body;

    await s.professor
      .post(`/api/assignments/${s.assignment.id}/disputes/${dispute.id}/decision`)
      .send({ upheld: false, decision: DECISION })
      .expect(200);

    const results = (await s.students[1].agent.get(`/api/my/results/${s.assignment.id}`).expect(200)).body;
    expect(results.grade).toBe(7.43);
    const row = results.criteria[0].levels.find((l: { number: number }) => l.number === number);
    expect(row.dispute).toMatchObject({ status: 'REJECTED', decision: DECISION, newScore: null });
  });

  it('checks the decision, decides once, and only for the assignment professor', async () => {
    const s = await setup();
    await s.students[1].agent.post(disputeUrl(s.assignment.id)).send({ reviewer: 1, criterion: 1, argument: ARGUMENT }).expect(200);
    const [dispute] = (await s.professor.get(`/api/assignments/${s.assignment.id}/disputes`).expect(200)).body;
    const url = `/api/assignments/${s.assignment.id}/disputes/${dispute.id}/decision`;

    const short = await s.professor.post(url).send({ upheld: false, decision: 'prea scurt' }).expect(400);
    expect(short.body.message).toBe('Scrie o decizie de cel puțin 20 de caractere.');
    const noLevel = await s.professor.post(url).send({ upheld: true, decision: DECISION }).expect(400);
    expect(noLevel.body.message).toBe('Alege nivelul corect pentru acest criteriu.');
    const otherCriterion = await s.professor
      .post(url)
      .send({ upheld: true, levelId: s.criteria[1].levels[1].id, decision: DECISION })
      .expect(400);
    expect(otherCriterion.body.message).toBe('Alege nivelul corect pentru acest criteriu.');

    const { agent: other } = await signedIn(ctx, 'alt-prof@test.example', Role.PROFESSOR);
    await other.get(`/api/assignments/${s.assignment.id}/disputes`).expect(404);
    await other.post(url).send({ upheld: false, decision: DECISION }).expect(404);
    await s.students[1].agent.post(url).send({ upheld: false, decision: DECISION }).expect(403);

    await s.professor.post(url).send({ upheld: false, decision: DECISION }).expect(200);
    const again = await s.professor.post(url).send({ upheld: false, decision: DECISION }).expect(409);
    expect(again.body.message).toBe('Contestația a fost deja hotărâtă.');
    await expect(ctx.prisma.dispute.update({ where: { id: dispute.id }, data: { decision: `${DECISION} Altfel.` } })).rejects.toThrow(
      /already decided/,
    );
  });

  it('lets the professor decide after the dispute deadline', async () => {
    const s = await setup();
    await s.students[1].agent.post(disputeUrl(s.assignment.id)).send({ reviewer: 1, criterion: 1, argument: ARGUMENT }).expect(200);
    await ctx.prisma.assignment.update({ where: { id: s.assignment.id }, data: { disputeDeadline: new Date(Date.now() - 500) } });
    const [dispute] = (await s.professor.get(`/api/assignments/${s.assignment.id}/disputes`).expect(200)).body;

    await s.professor
      .post(`/api/assignments/${s.assignment.id}/disputes/${dispute.id}/decision`)
      .send({ upheld: false, decision: DECISION })
      .expect(200);
  });

  it('notifies and emails the team once per decided dispute', async () => {
    const s = await setup();
    const notifications = ctx.app.get(NotificationsService);
    const mailer = ctx.app.get<MemoryMailer>(MAILER);
    for (const criterion of [1, 2]) {
      await s.students[1].agent.post(disputeUrl(s.assignment.id)).send({ reviewer: 1, criterion, argument: ARGUMENT }).expect(200);
    }
    const disputes = (await s.professor.get(`/api/assignments/${s.assignment.id}/disputes`).expect(200)).body;

    await notifications.recordDue();
    expect(await ctx.prisma.notification.count({ where: { kind: NotificationKind.DISPUTE_DECIDED } })).toBe(0);

    for (const d of disputes) {
      await s.professor
        .post(`/api/assignments/${s.assignment.id}/disputes/${d.id}/decision`)
        .send({ upheld: false, decision: DECISION })
        .expect(200);
    }
    await notifications.recordDue();
    await notifications.recordDue();
    const rows = await ctx.prisma.notification.findMany({ where: { kind: NotificationKind.DISPUTE_DECIDED } });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.userId === s.students[1].id)).toBe(true);

    mailer.sent.length = 0;
    await notifications.sendPending();
    expect(mailer.sent.filter((m) => m.to === s.students[1].email && m.subject.includes('Contestați'))).toHaveLength(2);

    const list = (await s.students[1].agent.get('/api/my/notifications').expect(200)).body.notifications;
    const decided = list.filter((n: { kind: string }) => n.kind === 'DISPUTE_DECIDED');
    expect(decided).toHaveLength(2);
    expect(decided.map((n: { text: string }) => n.text).join(' ')).toContain('Calitatea codului');
    expect(decided[0].text).toContain('Tema de test');
    expect(decided[0].text).toContain('respinsă');
  });
});
