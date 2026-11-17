import { Role } from '../src/generated/prisma/enums';
import { clearDatabase, createAssignment, createClass, createRubric, createTestApp, createUser } from './helpers';

describe('database constraints', () => {
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

  it('rejects a second review by the same reviewer on the same submission', async () => {
    const professor = await createUser(ctx.prisma, 'prof@test.example', 'parola', Role.PROFESSOR);
    const reviewer = await createUser(ctx.prisma, 'rev@test.example', 'parola', Role.STUDENT);
    const rubric = await createRubric(ctx.prisma, professor.id);
    const klass = await createClass(ctx.prisma, professor.id);
    const assignment = await createAssignment(ctx.prisma, professor.id, rubric.id, klass.id);
    const submission = await ctx.prisma.submission.create({
      data: { assignmentId: assignment.id, teamId: klass.teams[0].id, link: 'https://example.com/proiect', fileKey: 'test.pdf', fileType: 'pdf' },
    });
    const review = { submissionId: submission.id, reviewerId: reviewer.id };
    await ctx.prisma.review.create({ data: review });

    await expect(ctx.prisma.review.create({ data: review })).rejects.toMatchObject({ code: 'P2002' });
  });
});
