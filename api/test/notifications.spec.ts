import request from 'supertest';
import { AllocationService } from '../src/allocation/allocation.service';
import { ReviewStatus, Role } from '../src/generated/prisma/enums';
import { MAILER, MemoryMailer } from '../src/mail/mailer';
import { NotificationsService } from '../src/notifications/notifications.service';
import { clearDatabase, createAssignment, createClass, createRubric, createTestApp, createUser, DAY_MS, signedIn } from './helpers';

type Agent = ReturnType<typeof request.agent>;

const HOUR_MS = 60 * 60 * 1000;

describe('notifications (D-024)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let allocation: AllocationService;
  let notifications: NotificationsService;
  let mailer: MemoryMailer;

  beforeAll(async () => {
    ctx = await createTestApp();
    allocation = ctx.app.get(AllocationService);
    notifications = ctx.app.get(NotificationsService);
    mailer = ctx.app.get(MAILER);
  });

  beforeEach(async () => {
    await clearDatabase(ctx.prisma);
    mailer.sent.length = 0;
    mailer.failing = false;
  });

  afterAll(async () => {
    await ctx.close();
  });

  /** Runs the job's notification steps, as the every-minute job does after allocation. */
  async function runJob(now = new Date()) {
    await notifications.recordDue(now);
    await notifications.sendPending();
  }

  /**
   * Four solo teams with a signed-in student and a submission each, and an assignment (k = 2)
   * whose review deadline is `reviewHours` away, allocated.
   */
  async function allocated(reviewHours = 3 * 24) {
    const { agent: professor, user: prof } = await signedIn(ctx, 'prof@test.example', Role.PROFESSOR);
    const rubric = await createRubric(ctx.prisma, prof.id);
    const klass = await createClass(ctx.prisma, prof.id, 4);
    const assignment = await createAssignment(ctx.prisma, prof.id, rubric.id, klass.id, new Date(Date.now() + reviewHours * HOUR_MS));
    const students: { agent: Agent; id: string; email: string }[] = [];
    for (let t = 0; t < 4; t += 1) {
      const email = `s${t}@test.example`;
      const { agent, user } = await signedIn(ctx, email, Role.STUDENT);
      await ctx.prisma.teamMember.create({ data: { teamId: klass.teams[t].id, classId: klass.id, userId: user.id } });
      await ctx.prisma.submission.create({
        data: { assignmentId: assignment.id, teamId: klass.teams[t].id, link: 'https://p.example', fileKey: `k${t}`, fileType: 'pdf' },
      });
      students.push({ agent, id: user.id, email });
    }
    await allocation.allocateDue();
    return { professor, prof, rubric, klass, assignment, students };
  }

  const rowsOf = (kind: string) => ctx.prisma.notification.findMany({ where: { kind: kind as never } });

  /** Sends every review of a reviewer the way the database allows it (D-023). */
  async function sendAll(reviewerId: string) {
    const reviews = await ctx.prisma.review.findMany({
      where: { reviewerId },
      include: { submission: { include: { assignment: { include: { rubric: { include: { criteria: { include: { levels: true } } } } } } } } },
    });
    for (const review of reviews) {
      await ctx.prisma.reviewScore.createMany({
        data: review.submission.assignment.rubric.criteria.map((c) => ({
          reviewId: review.id,
          criterionId: c.id,
          levelId: c.levels[0].id,
          feedback: 'Un feedback suficient de lung.',
        })),
      });
      await ctx.prisma.review.update({ where: { id: review.id }, data: { status: ReviewStatus.SUBMITTED, submittedAt: new Date() } });
    }
  }

  it('tells every reviewer once that they have reviews, by email and in the app', async () => {
    const { students } = await allocated();

    await runJob();
    const rows = await rowsOf('REVIEWS_ALLOCATED');
    expect(rows.map((r) => r.userId).sort()).toEqual(students.map((s) => s.id).sort());
    expect(rows.every((r) => r.emailedAt !== null)).toBe(true);
    expect(mailer.sent.map((e) => e.to).sort()).toEqual(students.map((s) => s.email).sort());
    expect(mailer.sent[0].subject).toBe('Ai proiecte de evaluat');

    await runJob();
    expect(await ctx.prisma.notification.count()).toBe(4);
    expect(mailer.sent).toHaveLength(4);
  });

  it('reminds, in the 24 hours before the review deadline, only reviewers with unsent reviews who stayed', async () => {
    const { students, assignment } = await allocated(12);
    await runJob(new Date(Date.now() - 2 * DAY_MS)); // before the window: allocation notices only
    expect(await rowsOf('REVIEW_REMINDER')).toHaveLength(0);

    const [done, left, ...waiting] = students;
    // Withdraw first: a withdrawal moves unsent reviews, which could give `done` a new one.
    await left.agent.post(`/api/my/assignments/${assignment.id}/withdraw`).expect(200);
    await sendAll(done.id);
    await runJob();

    const reminded = (await rowsOf('REVIEW_REMINDER')).map((r) => r.userId).sort();
    const stillOwing = [];
    for (const s of waiting) {
      if ((await ctx.prisma.review.count({ where: { reviewerId: s.id, status: ReviewStatus.ALLOCATED } })) > 0) stillOwing.push(s.id);
    }
    expect(reminded).toEqual(stillOwing.sort());
    expect(reminded).not.toContain(done.id);
    expect(reminded).not.toContain(left.id);
  });

  it('reminds, in the 24 hours before the submission deadline, the members of evaluated teams without a submission', async () => {
    const { user: prof } = await signedIn(ctx, 'prof@test.example', Role.PROFESSOR);
    const rubric = await createRubric(ctx.prisma, prof.id);
    const klass = await createClass(ctx.prisma, prof.id, 3);
    const assignment = await ctx.prisma.assignment.create({
      data: {
        title: 'Tema de test',
        k: 2,
        submissionDeadline: new Date(Date.now() + 12 * HOUR_MS),
        reviewDeadline: new Date(Date.now() + 7 * DAY_MS),
        disputeDeadline: new Date(Date.now() + 14 * DAY_MS),
        createdById: prof.id,
        rubricId: rubric.id,
        classId: klass.id,
        rubricAppliesTo: 'SELECTED',
      },
    });
    await ctx.prisma.assignmentTeam.createMany({
      data: [0, 1].map((t) => ({ assignmentId: assignment.id, teamId: klass.teams[t].id, classId: klass.id })),
    });
    const member = async (email: string, team: number, confirmed = true) => {
      const user = await createUser(ctx.prisma, email, 'o-parola-lunga', Role.STUDENT);
      if (!confirmed) await ctx.prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: null } });
      await ctx.prisma.teamMember.create({ data: { teamId: klass.teams[team].id, classId: klass.id, userId: user.id } });
      return user;
    };
    const submitted = await member('a@test.example', 0);
    await ctx.prisma.submission.create({
      data: { assignmentId: assignment.id, teamId: klass.teams[0].id, link: 'https://p.example', fileKey: 'k', fileType: 'pdf' },
    });
    const owing = await member('b@test.example', 1);
    const unconfirmed = await member('c@test.example', 1, false);
    const notEvaluated = await member('d@test.example', 2);

    await runJob(new Date(Date.now() - DAY_MS)); // before the window
    expect(await ctx.prisma.notification.count()).toBe(0);
    await runJob();

    const rows = await rowsOf('SUBMISSION_REMINDER');
    expect(rows.map((r) => r.userId)).toEqual([owing.id]);
    expect(mailer.sent.map((e) => e.to)).toEqual(['b@test.example']);
    for (const user of [submitted, unconfirmed, notEvaluated]) {
      expect(rows.map((r) => r.userId)).not.toContain(user.id);
    }
  });

  it('keeps an email that could not be sent and sends it on the next run', async () => {
    await allocated();
    mailer.failing = true;
    await runJob();
    expect((await rowsOf('REVIEWS_ALLOCATED')).every((r) => r.emailedAt === null)).toBe(true);

    mailer.failing = false;
    await runJob();
    expect((await rowsOf('REVIEWS_ALLOCATED')).every((r) => r.emailedAt !== null)).toBe(true);
    expect(mailer.sent).toHaveLength(4);
  });

  it('never names a team or another student, in the email or in the app (D-014)', async () => {
    const { students, klass } = await allocated();
    await runJob();

    const [me, ...others] = students;
    const page = (await me.agent.get('/api/my/notifications').expect(200)).body;
    const texts = JSON.stringify(mailer.sent) + JSON.stringify(page);
    for (const team of klass.teams) expect(texts).not.toContain(team.name);
    for (const other of others) expect(JSON.stringify(page)).not.toContain(other.email);
  });

  it('lists only my notifications with the unread count, marks them read, and is only for students', async () => {
    const { students, professor, assignment } = await allocated();
    await runJob();
    const [me] = students;

    const before = (await me.agent.get('/api/my/notifications').expect(200)).body;
    expect(before.unread).toBe(1);
    expect(before.notifications).toHaveLength(1);
    expect(before.notifications[0]).toMatchObject({ kind: 'REVIEWS_ALLOCATED', assignmentId: assignment.id, read: false });
    expect(before.notifications[0].title).toBe('Ai proiecte de evaluat');

    await me.agent.post('/api/my/notifications/read').expect(204);
    const after = (await me.agent.get('/api/my/notifications').expect(200)).body;
    expect(after.unread).toBe(0);
    expect(after.notifications[0].read).toBe(true);
    expect((await students[1].agent.get('/api/my/notifications').expect(200)).body.unread).toBe(1);

    await professor.get('/api/my/notifications').expect(403);
  });
});
