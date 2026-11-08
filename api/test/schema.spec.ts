import { Role } from '../src/generated/prisma/enums';
import { clearDatabase, createTestApp, createUser } from './helpers';

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
    const assignment = await ctx.prisma.assignment.create({
      data: {
        title: 'Tema de test',
        k: 2,
        submissionDeadline: new Date('2026-12-01T10:00:00Z'),
        reviewDeadline: new Date('2026-12-08T10:00:00Z'),
        disputeDeadline: new Date('2026-12-15T10:00:00Z'),
        createdById: professor.id,
      },
    });
    const team = await ctx.prisma.team.create({ data: { assignmentId: assignment.id } });
    const submission = await ctx.prisma.submission.create({
      data: { teamId: team.id, link: 'https://example.com/proiect' },
    });
    const review = { submissionId: submission.id, reviewerId: reviewer.id };
    await ctx.prisma.review.create({ data: review });

    await expect(ctx.prisma.review.create({ data: review })).rejects.toMatchObject({ code: 'P2002' });
  });
});
