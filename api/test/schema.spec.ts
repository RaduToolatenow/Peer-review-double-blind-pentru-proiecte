import { ReviewStatus, Role } from '../src/generated/prisma/enums';
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

  /** A review of team 1's submission by a student of team 2, on a rubric with one criterion. */
  async function reviewSetup() {
    const professor = await createUser(ctx.prisma, 'prof@test.example', 'parola', Role.PROFESSOR);
    const reviewer = await createUser(ctx.prisma, 'rev@test.example', 'parola', Role.STUDENT);
    const rubric = await createRubric(ctx.prisma, professor.id);
    const other = await createRubric(ctx.prisma, professor.id, 'Altă grilă');
    const klass = await createClass(ctx.prisma, professor.id, 2);
    const assignment = await createAssignment(ctx.prisma, professor.id, rubric.id, klass.id);
    const submission = await ctx.prisma.submission.create({
      data: { assignmentId: assignment.id, teamId: klass.teams[0].id, link: 'https://example.com/proiect', fileKey: 'test.pdf', fileType: 'pdf' },
    });
    const review = await ctx.prisma.review.create({ data: { submissionId: submission.id, reviewerId: reviewer.id } });
    const criterion = rubric.criteria[0];
    const score = { reviewId: review.id, criterionId: criterion.id, levelId: criterion.levels[0].id, feedback: 'Un feedback suficient de lung.' };
    return { review, criterion, other: other.criteria[0], score };
  }

  it('refuses feedback shorter than 20 characters after trimming (D-023)', async () => {
    const { score } = await reviewSetup();
    await expect(ctx.prisma.reviewScore.create({ data: { ...score, feedback: `  ${'x'.repeat(19)}  ` } })).rejects.toThrow(
      /review_scores_feedback_length/,
    );
  });

  it("refuses a level of another criterion and a criterion outside the review's rubric (D-023)", async () => {
    const { score, other } = await reviewSetup();
    await expect(ctx.prisma.reviewScore.create({ data: { ...score, levelId: other.levels[0].id } })).rejects.toThrow();
    await expect(
      ctx.prisma.reviewScore.create({ data: { ...score, criterionId: other.id, levelId: other.levels[0].id } }),
    ).rejects.toThrow(/criterion is not in the review rubric/);
  });

  it('sends a review only with every criterion scored, and never changes a sent one (D-023)', async () => {
    const { review, score } = await reviewSetup();
    const send = () => ctx.prisma.review.update({ where: { id: review.id }, data: { status: ReviewStatus.SUBMITTED, submittedAt: new Date() } });
    await expect(send()).rejects.toThrow(/review is incomplete/);

    await ctx.prisma.reviewScore.create({ data: score });
    await send();

    await expect(
      ctx.prisma.reviewScore.update({ where: { reviewId_criterionId: { reviewId: review.id, criterionId: score.criterionId } }, data: { feedback: 'Alt feedback, la fel de lung.' } }),
    ).rejects.toThrow(/review is already sent/);
    await expect(ctx.prisma.review.update({ where: { id: review.id }, data: { status: ReviewStatus.ALLOCATED } })).rejects.toThrow(
      /review is already sent/,
    );
  });
});
