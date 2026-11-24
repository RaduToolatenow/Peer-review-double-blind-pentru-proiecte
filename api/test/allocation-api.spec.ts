import request from 'supertest';
import { AllocationService } from '../src/allocation/allocation.service';
import { ReviewStatus, Role } from '../src/generated/prisma/enums';
import { MAILER, MemoryMailer } from '../src/mail/mailer';
import { clearDatabase, createAssignment, createClass, createRubric, createTestApp, DAY_MS, signedIn } from './helpers';

type Agent = ReturnType<typeof request.agent>;

describe('allocation, withdrawal and late arrival (D-022)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let allocation: AllocationService;

  beforeAll(async () => {
    ctx = await createTestApp();
    allocation = ctx.app.get(AllocationService);
  });

  beforeEach(async () => {
    await clearDatabase(ctx.prisma);
  });

  afterAll(async () => {
    await ctx.close();
  });

  /**
   * A class of solo teams, each with a signed-in student and a submission, and an assignment
   * (k = 2) whose submission deadline has passed. `reviewDays` sets the review deadline.
   */
  async function setup(teamCount = 5, reviewDays = 3) {
    const { agent: professor, user: prof } = await signedIn(ctx, 'prof@test.example', Role.PROFESSOR);
    const rubric = await createRubric(ctx.prisma, prof.id);
    const klass = await createClass(ctx.prisma, prof.id, teamCount + 1);
    const assignment = await createAssignment(
      ctx.prisma,
      prof.id,
      rubric.id,
      klass.id,
      new Date(Date.now() + reviewDays * DAY_MS),
    );
    const students: { agent: Agent; id: string; teamId: string; submissionId: string }[] = [];
    for (let t = 0; t < teamCount; t += 1) {
      const team = klass.teams[t];
      const { agent, user } = await signedIn(ctx, `s${t}@test.example`, Role.STUDENT);
      await ctx.prisma.teamMember.create({ data: { teamId: team.id, classId: klass.id, userId: user.id } });
      const submission = await ctx.prisma.submission.create({
        data: { assignmentId: assignment.id, teamId: team.id, link: 'https://p.example', fileKey: `k${t}`, fileType: 'pdf' },
      });
      students.push({ agent, id: user.id, teamId: team.id, submissionId: submission.id });
    }
    // The last team has no member and no submission yet: someone may still join it.
    return { professor, prof, klass, assignment, students, emptyTeam: klass.teams[teamCount] };
  }

  const reviewsOf = (reviewerId: string) => ctx.prisma.review.findMany({ where: { reviewerId } });

  /** Sends a review the way the database allows it (D-023): every criterion scored first. */
  async function markSent(reviewId: string) {
    const review = await ctx.prisma.review.findUniqueOrThrow({
      where: { id: reviewId },
      include: { submission: { include: { assignment: { include: { rubric: { include: { criteria: { include: { levels: true } } } } } } } } },
    });
    await ctx.prisma.reviewScore.createMany({
      data: review.submission.assignment.rubric.criteria.map((c) => ({
        reviewId,
        criterionId: c.id,
        levelId: c.levels[0].id,
        feedback: 'Un feedback suficient de lung.',
      })),
    });
    await ctx.prisma.review.update({ where: { id: reviewId }, data: { status: ReviewStatus.SUBMITTED, submittedAt: new Date() } });
  }

  it('allocates an assignment past its submission deadline exactly once', async () => {
    const { assignment, students } = await setup();

    await allocation.allocateDue();
    const first = await ctx.prisma.review.findMany({ orderBy: [{ submissionId: 'asc' }, { reviewerId: 'asc' }] });
    expect(first).toHaveLength(10);
    expect((await ctx.prisma.assignment.findUniqueOrThrow({ where: { id: assignment.id } })).allocatedAt).not.toBeNull();
    for (const student of students) {
      expect(first.filter((r) => r.submissionId === student.submissionId)).toHaveLength(2);
      expect(first.some((r) => r.submissionId === student.submissionId && r.reviewerId === student.id)).toBe(false);
    }

    await allocation.allocateDue();
    const second = await ctx.prisma.review.findMany({ orderBy: [{ submissionId: 'asc' }, { reviewerId: 'asc' }] });
    expect(second).toEqual(first);
  });

  it('does not allocate an assignment still in its submission phase', async () => {
    const { user: prof } = await signedIn(ctx, 'p2@test.example', Role.PROFESSOR);
    const klass = await createClass(ctx.prisma, prof.id, 2);
    const rubric = await createRubric(ctx.prisma, prof.id);
    const open = await createAssignment(ctx.prisma, prof.id, rubric.id, klass.id, new Date(Date.now() + 14 * DAY_MS));

    await allocation.allocateDue();

    expect((await ctx.prisma.assignment.findUniqueOrThrow({ where: { id: open.id } })).allocatedAt).toBeNull();
  });

  it('allocates to link reviewers too, and not to those who withdrew', async () => {
    const { assignment, students } = await setup(4);
    const { agent: linkAgent, user: linkUser } = await signedIn(ctx, 'link@test.example', Role.STUDENT);
    await linkAgent.post(`/api/join/${assignment.joinCode}`).expect(200);
    await students[0].agent.post(`/api/my/assignments/${assignment.id}/withdraw`).expect(200);

    await allocation.allocateDue();

    expect((await reviewsOf(linkUser.id)).length).toBeGreaterThan(0);
    expect(await reviewsOf(students[0].id)).toHaveLength(0);
    // The withdrawn student's team keeps its submission and is still reviewed.
    expect(await ctx.prisma.review.count({ where: { submissionId: students[0].submissionId } })).toBe(2);
  });

  it("moves a withdrawn reviewer's unstarted reviews and keeps the submitted ones", async () => {
    const { assignment, students } = await setup(6);
    await allocation.allocateDue();
    const [me] = students;
    const mine = await reviewsOf(me.id);
    await markSent(mine[0].id);

    await me.agent.post(`/api/my/assignments/${assignment.id}/withdraw`).expect(200);

    const after = await reviewsOf(me.id);
    expect(after.map((r) => r.id)).toEqual([mine[0].id]);
    expect(await ctx.prisma.review.count()).toBe(12);
    for (const review of mine.slice(1)) {
      expect(await ctx.prisma.review.count({ where: { submissionId: review.submissionId } })).toBe(2);
    }

    // A second withdrawal changes nothing.
    await me.agent.post(`/api/my/assignments/${assignment.id}/withdraw`).expect(200);
    expect(await ctx.prisma.review.count()).toBe(12);
    expect(await ctx.prisma.assignmentWithdrawal.count()).toBe(1);
  });

  it('refuses a withdrawal from someone who is not a reviewer, or after the review deadline', async () => {
    const { assignment, students } = await setup(3);
    const { agent: stranger } = await signedIn(ctx, 'stranger@test.example', Role.STUDENT);
    const notFound = await stranger.post(`/api/my/assignments/${assignment.id}/withdraw`).expect(404);
    expect(notFound.body.message).toBe('Nu am găsit tema.');

    await ctx.prisma.assignment.update({
      where: { id: assignment.id },
      data: { reviewDeadline: new Date(Date.now() - DAY_MS), submissionDeadline: new Date(Date.now() - 2 * DAY_MS) },
    });
    const agent = students[0].agent;
    const late = await agent.post(`/api/my/assignments/${assignment.id}/withdraw`).expect(409);
    expect(late.body.message).toBe('Termenul de evaluare a trecut, deci nu te mai poți retrage.');
  });

  it('gives a reviewer who joins through the link after allocation reviews from the busiest', async () => {
    const { assignment } = await setup(5);
    await allocation.allocateDue();
    const { agent, user } = await signedIn(ctx, 'late@test.example', Role.STUDENT);

    await agent.post(`/api/join/${assignment.joinCode}`).expect(200);

    expect(await reviewsOf(user.id)).toHaveLength(Math.floor(10 / 6));
    expect(await ctx.prisma.review.count()).toBe(10);
  });

  it('gives reviews to someone who confirms a sign-up through the assignment link after allocation', async () => {
    const { assignment } = await setup(5);
    await allocation.allocateDue();
    const mailer = ctx.app.get<MemoryMailer>(MAILER);
    const http = request(ctx.app.getHttpServer());

    await http
      .post('/api/auth/register')
      .send({ email: 'nou@ulbsibiu.ro', password: 'o-parola-buna-10', joinCode: assignment.joinCode })
      .expect(202);
    const token = /\/confirmare\/([A-Za-z0-9_-]+)/.exec(mailer.sent.at(-1)!.text)![1];
    await request(ctx.app.getHttpServer()).post('/api/auth/verify').send({ token }).expect(200);

    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'nou@ulbsibiu.ro' } });
    expect((await reviewsOf(user.id)).length).toBeGreaterThan(0);
  });

  it('gives reviews to someone who joins a team after allocation, never of their own team', async () => {
    const { emptyTeam } = await setup(5);
    await allocation.allocateDue();
    const { agent, user } = await signedIn(ctx, 'late@test.example', Role.STUDENT);

    await agent.post('/api/teams/join').send({ code: emptyTeam.joinCode }).expect(200);

    const mine = await reviewsOf(user.id);
    expect(mine.length).toBeGreaterThan(0);
    expect(await ctx.prisma.review.count()).toBe(10);
  });

  it("moves a review when its reviewer joins the submission's team, and refuses the join after a submitted one", async () => {
    const { assignment, klass } = await setup(6);
    const { agent, user } = await signedIn(ctx, 'link@test.example', Role.STUDENT);
    await agent.post(`/api/join/${assignment.joinCode}`).expect(200);
    // k = 3: 18 reviews over 7 reviewers, so the link reviewer gets at least 2.
    await ctx.prisma.assignment.update({ where: { id: assignment.id }, data: { k: 3 } });
    await allocation.allocateDue();
    const [first, second] = await ctx.prisma.review.findMany({
      where: { reviewerId: user.id },
      include: { submission: { select: { teamId: true } } },
    });
    expect(second).toBeDefined();

    // A submitted review of the second team blocks joining it.
    await markSent(second.id);
    const secondTeam = klass.teams.find((t) => t.id === second.submission.teamId)!;
    const refused = await agent.post('/api/teams/join').send({ code: secondTeam.joinCode }).expect(409);
    expect(refused.body.message).toBe('Ai evaluat deja proiectul acestei echipe, deci nu te poți alătura ei.');

    // Joining the first team moves the unstarted review of its submission to someone else.
    const firstTeam = klass.teams.find((t) => t.id === first.submission.teamId)!;
    await agent.post('/api/teams/join').send({ code: firstTeam.joinCode }).expect(200);
    expect(await ctx.prisma.review.findUnique({ where: { id: first.id } })).toBeNull();
    expect(await ctx.prisma.review.count({ where: { submissionId: first.submissionId } })).toBe(3);
  });

  it("refuses, in the database, a review of the reviewer's own team", async () => {
    const { students } = await setup(2);

    await expect(
      ctx.prisma.review.create({ data: { submissionId: students[0].submissionId, reviewerId: students[0].id } }),
    ).rejects.toThrow(/reviewer is in the submission's team/);
  });

  it('lists the assignment for a link reviewer, who can withdraw, and never names a reviewer', async () => {
    const { assignment, students } = await setup(3);
    const { agent } = await signedIn(ctx, 'link@test.example', Role.STUDENT);
    await agent.post(`/api/join/${assignment.joinCode}`).expect(200);
    await allocation.allocateDue();

    const before = await agent.get('/api/my/assignments').expect(200);
    expect(before.body).toEqual([
      expect.objectContaining({ id: assignment.id, teamName: null, submission: null, withdrawn: false, canWithdraw: true }),
    ]);

    const withdrawal = await agent.post(`/api/my/assignments/${assignment.id}/withdraw`).expect(200);
    const after = await agent.get('/api/my/assignments').expect(200);
    expect(after.body[0]).toMatchObject({ withdrawn: true, canWithdraw: false });

    const member = await students[0].agent.get('/api/my/assignments').expect(200);
    const everything = JSON.stringify([before.body, withdrawal.body, after.body, member.body]);
    const users = await ctx.prisma.user.findMany();
    for (const user of users) {
      expect(everything).not.toContain(user.id);
      expect(everything).not.toContain(user.email);
    }
  });
});
