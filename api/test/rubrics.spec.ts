import { Role } from '../src/generated/prisma/enums';
import { clearDatabase, createAssignment, createClass, createRubric, createTestApp, createUser, DAY_MS } from './helpers';

describe('rubric constraints (D-011, D-013)', () => {
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

  async function createProfessor() {
    return createUser(ctx.prisma, 'prof@test.example', 'parola', Role.PROFESSOR);
  }

  /** Saves one score on the rubric's first criterion. */
  async function scoreOnce(rubric: Awaited<ReturnType<typeof createRubric>>, assignmentId: string, teamId: string) {
    const reviewer = await createUser(ctx.prisma, 'rev@test.example', 'parola', Role.STUDENT);
    const submission = await ctx.prisma.submission.create({
      data: { assignmentId, teamId, link: 'https://example.com/proiect', fileKey: 'test.pdf', fileType: 'pdf' },
    });
    const review = await ctx.prisma.review.create({
      data: { submissionId: submission.id, reviewerId: reviewer.id },
    });
    const criterion = rubric.criteria[0];
    await ctx.prisma.reviewScore.create({
      data: { reviewId: review.id, criterionId: criterion.id, levelId: criterion.levels[0].id, feedback: 'Bine' },
    });
  }

  it('accepts a criterion at position 100 and rejects one at position 101', async () => {
    const professor = await createProfessor();
    const rubric = await createRubric(ctx.prisma, professor.id);
    const criterion = { rubricId: rubric.id, title: 'Criteriu', weight: 1 };

    await expect(ctx.prisma.rubricCriterion.create({ data: { ...criterion, position: 100 } })).resolves.toBeDefined();
    await expect(ctx.prisma.rubricCriterion.create({ data: { ...criterion, position: 101 } })).rejects.toThrow();
  });

  it('lets the same rubric be sent to two classes', async () => {
    const professor = await createProfessor();
    const rubric = await createRubric(ctx.prisma, professor.id);
    const first = await createClass(ctx.prisma, professor.id, 1, 'Grupa 231');
    const second = await createClass(ctx.prisma, professor.id, 1, 'Grupa 232');

    await createAssignment(ctx.prisma, professor.id, rubric.id, first.id);
    await createAssignment(ctx.prisma, professor.id, rubric.id, second.id);

    expect(await ctx.prisma.assignment.count({ where: { rubricId: rubric.id } })).toBe(2);
  });

  it('locks the rubric when it is sent to a class', async () => {
    const professor = await createProfessor();
    const rubric = await createRubric(ctx.prisma, professor.id);
    const klass = await createClass(ctx.prisma, professor.id);
    expect(rubric.lockedAt).toBeNull();

    await createAssignment(ctx.prisma, professor.id, rubric.id, klass.id);

    const locked = await ctx.prisma.rubric.findUniqueOrThrow({ where: { id: rubric.id } });
    expect(locked.lockedAt).toBeInstanceOf(Date);
  });

  it('rejects any change to the criteria and levels of a locked rubric', async () => {
    const professor = await createProfessor();
    const rubric = await createRubric(ctx.prisma, professor.id);
    const klass = await createClass(ctx.prisma, professor.id);
    await createAssignment(ctx.prisma, professor.id, rubric.id, klass.id);
    const criterion = rubric.criteria[0];
    const level = criterion.levels[1];

    await expect(
      ctx.prisma.rubricCriterion.create({ data: { rubricId: rubric.id, title: 'Nou', weight: 1, position: 2 } }),
    ).rejects.toThrow(/locked/);
    await expect(
      ctx.prisma.rubricCriterion.update({ where: { id: criterion.id }, data: { weight: 5 } }),
    ).rejects.toThrow(/locked/);
    await expect(
      ctx.prisma.criterionLevel.create({ data: { criterionId: criterion.id, score: 3, descriptor: 'Foarte bun' } }),
    ).rejects.toThrow(/locked/);
    await expect(
      ctx.prisma.criterionLevel.update({ where: { id: level.id }, data: { descriptor: 'Altceva' } }),
    ).rejects.toThrow(/locked/);
    await expect(ctx.prisma.criterionLevel.delete({ where: { id: level.id } })).rejects.toThrow(/locked/);
  });

  it('still locks a rubric at its first saved score, as a safety net', async () => {
    const professor = await createProfessor();
    const rubric = await createRubric(ctx.prisma, professor.id);
    const klass = await createClass(ctx.prisma, professor.id);
    const assignment = await createAssignment(ctx.prisma, professor.id, rubric.id, klass.id);
    // Unlock by hand, below the API, to check the score trigger on its own.
    await ctx.prisma.$executeRawUnsafe('ALTER TABLE rubrics DISABLE TRIGGER rubrics_guard_update');
    await ctx.prisma.rubric.update({ where: { id: rubric.id }, data: { lockedAt: null } });
    await ctx.prisma.$executeRawUnsafe('ALTER TABLE rubrics ENABLE TRIGGER rubrics_guard_update');

    await scoreOnce(rubric, assignment.id, klass.teams[0].id);

    const locked = await ctx.prisma.rubric.findUniqueOrThrow({ where: { id: rubric.id } });
    expect(locked.lockedAt).toBeInstanceOf(Date);
  });

  it('does not let a locked rubric be unlocked', async () => {
    const professor = await createProfessor();
    const rubric = await createRubric(ctx.prisma, professor.id);
    const klass = await createClass(ctx.prisma, professor.id);
    await createAssignment(ctx.prisma, professor.id, rubric.id, klass.id);

    await expect(
      ctx.prisma.rubric.update({ where: { id: rubric.id }, data: { lockedAt: null } }),
    ).rejects.toThrow(/locked/);
  });

  it('deletes an unused rubric with its criteria, but never a sent one', async () => {
    const professor = await createProfessor();
    const unused = await createRubric(ctx.prisma, professor.id);
    const sent = await createRubric(ctx.prisma, professor.id);
    const klass = await createClass(ctx.prisma, professor.id);
    await createAssignment(ctx.prisma, professor.id, sent.id, klass.id);

    await ctx.prisma.rubric.delete({ where: { id: unused.id } });
    expect(await ctx.prisma.rubricCriterion.count({ where: { rubricId: unused.id } })).toBe(0);

    await expect(ctx.prisma.rubric.delete({ where: { id: sent.id } })).rejects.toThrow();
  });

  it('archives a sent rubric only 2 days after the latest review deadline', async () => {
    const professor = await createProfessor();
    const early = await createRubric(ctx.prisma, professor.id);
    const ready = await createRubric(ctx.prisma, professor.id);
    const klass = await createClass(ctx.prisma, professor.id);
    // Review deadline 1 day ago: too early. 2 days and 1 minute ago: allowed.
    await createAssignment(ctx.prisma, professor.id, early.id, klass.id, new Date(Date.now() - 1 * DAY_MS));
    await createAssignment(ctx.prisma, professor.id, ready.id, klass.id, new Date(Date.now() - 2 * DAY_MS - 60_000));

    await expect(
      ctx.prisma.rubric.update({ where: { id: early.id }, data: { archivedAt: new Date() } }),
    ).rejects.toThrow(/archive/);
    const archived = await ctx.prisma.rubric.update({ where: { id: ready.id }, data: { archivedAt: new Date() } });
    expect(archived.archivedAt).toBeInstanceOf(Date);
  });

  it('counts the latest review deadline when a rubric was sent to several classes', async () => {
    const professor = await createProfessor();
    const rubric = await createRubric(ctx.prisma, professor.id);
    const first = await createClass(ctx.prisma, professor.id, 1, 'Grupa 231');
    const second = await createClass(ctx.prisma, professor.id, 1, 'Grupa 232');
    await createAssignment(ctx.prisma, professor.id, rubric.id, first.id, new Date(Date.now() - 10 * DAY_MS));
    await createAssignment(ctx.prisma, professor.id, rubric.id, second.id, new Date(Date.now() - 1 * DAY_MS));

    await expect(
      ctx.prisma.rubric.update({ where: { id: rubric.id }, data: { archivedAt: new Date() } }),
    ).rejects.toThrow(/archive/);
  });

  it('does not let an archived rubric be sent', async () => {
    const professor = await createProfessor();
    const rubric = await createRubric(ctx.prisma, professor.id);
    const klass = await createClass(ctx.prisma, professor.id);
    await ctx.prisma.rubric.update({ where: { id: rubric.id }, data: { archivedAt: new Date() } });

    await expect(createAssignment(ctx.prisma, professor.id, rubric.id, klass.id)).rejects.toThrow(/archived/);
  });
});

describe('class and team constraints (D-012)', () => {
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

  it('only lets an assignment choose teams from its own class', async () => {
    const professor = await createUser(ctx.prisma, 'prof@test.example', 'parola', Role.PROFESSOR);
    const rubric = await createRubric(ctx.prisma, professor.id);
    const own = await createClass(ctx.prisma, professor.id, 1, 'Grupa 231');
    const other = await createClass(ctx.prisma, professor.id, 1, 'Grupa 232');
    const assignment = await createAssignment(ctx.prisma, professor.id, rubric.id, own.id);

    await expect(
      ctx.prisma.assignmentTeam.create({
        data: { assignmentId: assignment.id, teamId: own.teams[0].id, classId: own.id },
      }),
    ).resolves.toBeDefined();
    await expect(
      ctx.prisma.assignmentTeam.create({
        data: { assignmentId: assignment.id, teamId: other.teams[0].id, classId: own.id },
      }),
    ).rejects.toThrow();
  });

  it('keeps a student in one team per class', async () => {
    const professor = await createUser(ctx.prisma, 'prof@test.example', 'parola', Role.PROFESSOR);
    const student = await createUser(ctx.prisma, 'student@test.example', 'parola', Role.STUDENT);
    const klass = await createClass(ctx.prisma, professor.id, 2);
    const [first, second] = klass.teams;

    await ctx.prisma.teamMember.create({ data: { teamId: first.id, classId: klass.id, userId: student.id } });

    await expect(
      ctx.prisma.teamMember.create({ data: { teamId: second.id, classId: klass.id, userId: student.id } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('does not delete a class that has a sent rubric', async () => {
    const professor = await createUser(ctx.prisma, 'prof@test.example', 'parola', Role.PROFESSOR);
    const rubric = await createRubric(ctx.prisma, professor.id);
    const klass = await createClass(ctx.prisma, professor.id);
    await createAssignment(ctx.prisma, professor.id, rubric.id, klass.id);

    await expect(ctx.prisma.class.delete({ where: { id: klass.id } })).rejects.toThrow();
  });
});
