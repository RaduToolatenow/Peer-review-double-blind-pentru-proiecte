import { Role } from '../src/generated/prisma/enums';
import { clearDatabase, createTestApp, createUser } from './helpers';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('rubric constraints (D-011)', () => {
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

  async function createRubric(createdById: string) {
    return ctx.prisma.rubric.create({
      data: {
        title: 'Grilă de test',
        createdById,
        criteria: {
          create: {
            title: 'Calitatea codului',
            weight: 1,
            position: 1,
            levels: { create: [{ score: 1, descriptor: 'Slab' }, { score: 2, descriptor: 'Bun' }] },
          },
        },
      },
      include: { criteria: { include: { levels: true } } },
    });
  }

  async function createAssignment(createdById: string, rubricId: string | null, reviewDeadline: Date) {
    return ctx.prisma.assignment.create({
      data: {
        title: 'Tema de test',
        k: 2,
        submissionDeadline: new Date(reviewDeadline.getTime() - 7 * DAY_MS),
        reviewDeadline,
        disputeDeadline: new Date(reviewDeadline.getTime() + 7 * DAY_MS),
        createdById,
        rubricId,
      },
    });
  }

  /** Saves one score on the rubric's first criterion, which locks the rubric. */
  async function scoreOnce(rubric: Awaited<ReturnType<typeof createRubric>>, assignmentId: string) {
    const reviewer = await createUser(ctx.prisma, 'rev@test.example', 'parola', Role.STUDENT);
    const team = await ctx.prisma.team.create({ data: { assignmentId } });
    const submission = await ctx.prisma.submission.create({
      data: { teamId: team.id, link: 'https://example.com/proiect' },
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
    const rubric = await createRubric(professor.id);
    const criterion = { rubricId: rubric.id, title: 'Criteriu', weight: 1 };

    await expect(ctx.prisma.rubricCriterion.create({ data: { ...criterion, position: 100 } })).resolves.toBeDefined();
    await expect(ctx.prisma.rubricCriterion.create({ data: { ...criterion, position: 101 } })).rejects.toThrow();
  });

  it('lets two assignments use the same rubric', async () => {
    const professor = await createProfessor();
    const rubric = await createRubric(professor.id);
    const deadline = new Date(Date.now() + 14 * DAY_MS);

    await createAssignment(professor.id, rubric.id, deadline);
    await createAssignment(professor.id, rubric.id, deadline);

    expect(await ctx.prisma.assignment.count({ where: { rubricId: rubric.id } })).toBe(2);
  });

  it('locks the rubric when the first score on it is saved', async () => {
    const professor = await createProfessor();
    const rubric = await createRubric(professor.id);
    const assignment = await createAssignment(professor.id, rubric.id, new Date(Date.now() + 14 * DAY_MS));
    expect(rubric.lockedAt).toBeNull();

    await scoreOnce(rubric, assignment.id);

    const locked = await ctx.prisma.rubric.findUniqueOrThrow({ where: { id: rubric.id } });
    expect(locked.lockedAt).toBeInstanceOf(Date);
  });

  it('rejects any change to the criteria and levels of a locked rubric', async () => {
    const professor = await createProfessor();
    const rubric = await createRubric(professor.id);
    const assignment = await createAssignment(professor.id, rubric.id, new Date(Date.now() + 14 * DAY_MS));
    await scoreOnce(rubric, assignment.id);
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

  it('does not let a locked rubric be unlocked', async () => {
    const professor = await createProfessor();
    const rubric = await createRubric(professor.id);
    const assignment = await createAssignment(professor.id, rubric.id, new Date(Date.now() + 14 * DAY_MS));
    await scoreOnce(rubric, assignment.id);

    await expect(
      ctx.prisma.rubric.update({ where: { id: rubric.id }, data: { lockedAt: null } }),
    ).rejects.toThrow(/locked/);
  });

  it('deletes an unused rubric with its criteria, but never a used one', async () => {
    const professor = await createProfessor();
    const unused = await createRubric(professor.id);
    const usedByAssignment = await createRubric(professor.id);
    const usedByTeam = await createRubric(professor.id);
    const assignment = await createAssignment(professor.id, usedByAssignment.id, new Date(Date.now() + 14 * DAY_MS));
    await ctx.prisma.team.create({ data: { assignmentId: assignment.id, rubricId: usedByTeam.id } });

    await ctx.prisma.rubric.delete({ where: { id: unused.id } });
    expect(await ctx.prisma.rubricCriterion.count({ where: { rubricId: unused.id } })).toBe(0);

    await expect(ctx.prisma.rubric.delete({ where: { id: usedByAssignment.id } })).rejects.toThrow();
    await expect(ctx.prisma.rubric.delete({ where: { id: usedByTeam.id } })).rejects.toThrow();
  });

  it('archives a used rubric only 2 days after the latest review deadline', async () => {
    const professor = await createProfessor();
    const early = await createRubric(professor.id);
    const ready = await createRubric(professor.id);
    // Review deadline 1 day ago: too early. 2 days and 1 minute ago: allowed.
    await createAssignment(professor.id, early.id, new Date(Date.now() - 1 * DAY_MS));
    await createAssignment(professor.id, ready.id, new Date(Date.now() - 2 * DAY_MS - 60_000));

    await expect(
      ctx.prisma.rubric.update({ where: { id: early.id }, data: { archivedAt: new Date() } }),
    ).rejects.toThrow(/archive/);
    const archived = await ctx.prisma.rubric.update({ where: { id: ready.id }, data: { archivedAt: new Date() } });
    expect(archived.archivedAt).toBeInstanceOf(Date);
  });

  it('counts the review deadline of an assignment where the rubric is given only to a team', async () => {
    const professor = await createProfessor();
    const rubric = await createRubric(professor.id);
    const assignment = await createAssignment(professor.id, null, new Date(Date.now() - 1 * DAY_MS));
    await ctx.prisma.team.create({ data: { assignmentId: assignment.id, rubricId: rubric.id } });

    await expect(
      ctx.prisma.rubric.update({ where: { id: rubric.id }, data: { archivedAt: new Date() } }),
    ).rejects.toThrow(/archive/);
  });

  it('does not let an archived rubric be chosen for an assignment or a team', async () => {
    const professor = await createProfessor();
    const rubric = await createRubric(professor.id);
    await ctx.prisma.rubric.update({ where: { id: rubric.id }, data: { archivedAt: new Date() } });
    const assignment = await createAssignment(professor.id, null, new Date(Date.now() + 14 * DAY_MS));

    await expect(createAssignment(professor.id, rubric.id, new Date(Date.now() + 14 * DAY_MS))).rejects.toThrow(
      /archived/,
    );
    await expect(
      ctx.prisma.team.create({ data: { assignmentId: assignment.id, rubricId: rubric.id } }),
    ).rejects.toThrow(/archived/);
  });
});
