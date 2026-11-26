import request from 'supertest';
import { AllocationService } from '../src/allocation/allocation.service';
import { Role } from '../src/generated/prisma/enums';
import { FILE_STORE, FileStore } from '../src/submissions/file-store';
import { clearDatabase, createAssignment, createClass, createRubric, createTestApp, DAY_MS, signedIn } from './helpers';

type Agent = ReturnType<typeof request.agent>;

const GOOD = 'Structura e clară, dar lipsesc testele pentru formular.';
const ARGUMENT = 'Testele există în folderul tests, evaluatorul nu le-a văzut.';
const DECISION = 'Am verificat: testele există și acoperă formularul.';
const BOM = '﻿';
const TEAMS_HEADER =
  'Echipa;Evaluări primite;Calibrată;Nota (1–10);Contestații deschise;Contestații admise;Contestații respinse;Stare';
const REVIEWERS_HEADER = 'Evaluator (nr.);Fiabilitate;Semnalat;Măsurată;Evaluări trimise;Nota de evaluator (1–10);Stare';

interface GradesBody {
  provisional: boolean;
  submissions: {
    teamName: string;
    grade: number | null;
    reviewsCounted: number;
    calibrated: boolean;
    disputes: { open: number; upheld: number; rejected: number };
  }[];
  reviewers: {
    number: number;
    reliability: number;
    flagged: boolean;
    measured: boolean;
    reviewsSent: number;
    reviewerGrade: number | null;
  }[];
}

const yes = (value: boolean) => (value ? 'da' : 'nu');
const decimal = (value: number | null) => (value === null ? '' : value.toFixed(2).replace('.', ','));

describe('CSV export of an assignment (D-029)', () => {
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
   * Three solo teams, a rubric with two criteria of levels 1 and 2, an assignment (k = 2),
   * allocated unless told otherwise. The professor calibrates team 0 at the highest level;
   * student 0 answers the lowest level, the others the highest.
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
    const students: { agent: Agent; id: string }[] = [];
    const submissions: { id: string }[] = [];
    for (let t = 0; t < 3; t += 1) {
      const team = klass.teams[t];
      const { agent, user } = await signedIn(ctx, `s${t}@test.example`, Role.STUDENT);
      await ctx.prisma.teamMember.create({ data: { teamId: team.id, classId: klass.id, userId: user.id } });
      const fileKey = `f${t}.pdf`;
      await files.put(fileKey, Buffer.from('%PDF-1.4 test'), 'application/pdf');
      submissions.push(
        await ctx.prisma.submission.create({
          data: { assignmentId: assignment.id, teamId: team.id, link: `https://p${t}.example`, fileKey, fileType: 'pdf' },
        }),
      );
      students.push({ agent, id: user.id });
    }
    if (allocate) {
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
    }
    return { professor, prof, criteria, klass, assignment, students };
  }

  function exportUrl(assignmentId: string, file: 'note' | 'evaluatori') {
    return `/api/assignments/${assignmentId}/export/${file}.csv`;
  }

  /** Closes reviews; team 1 has one upheld and one rejected dispute, team 2 one open dispute. */
  async function dispute(s: Awaited<ReturnType<typeof setup>>) {
    await ctx.prisma.assignment.update({ where: { id: s.assignment.id }, data: { reviewDeadline: new Date(Date.now() - 1000) } });
    const lowNumber = async (student: Agent) => {
      const res = await student.get(`/api/my/results/${s.assignment.id}`).expect(200);
      return res.body.criteria[0].levels.find((l: { score: number }) => l.score === 1).number as number;
    };
    const url = `/api/my/results/${s.assignment.id}/disputes`;
    const one = await lowNumber(s.students[1].agent);
    await s.students[1].agent.post(url).send({ reviewer: one, criterion: 1, argument: ARGUMENT }).expect(200);
    await s.students[1].agent.post(url).send({ reviewer: one, criterion: 2, argument: ARGUMENT }).expect(200);
    const two = await lowNumber(s.students[2].agent);
    await s.students[2].agent.post(url).send({ reviewer: two, criterion: 1, argument: ARGUMENT }).expect(200);

    const filed = await ctx.prisma.dispute.findMany({ where: { authorId: s.students[1].id }, include: { criterion: true } });
    for (const d of filed) {
      const upheld = d.criterionId === s.criteria[0].id;
      await s.professor
        .post(`/api/assignments/${s.assignment.id}/disputes/${d.id}/decision`)
        .send(upheld ? { upheld, levelId: s.criteria[0].levels[1].id, decision: DECISION } : { upheld, decision: DECISION })
        .expect(200);
    }
  }

  it('counts the disputes of each submission in the grades', async () => {
    const s = await setup();
    await dispute(s);

    const body: GradesBody = (await s.professor.get(`/api/assignments/${s.assignment.id}/grades`).expect(200)).body;
    expect(body.submissions.map((x) => x.disputes)).toEqual([
      { open: 0, upheld: 0, rejected: 0 },
      { open: 0, upheld: 1, rejected: 1 },
      { open: 1, upheld: 0, rejected: 0 },
    ]);
  });

  it('exports one row per team, as the grades show them, with the disputes and the final status', async () => {
    const s = await setup();
    await dispute(s);
    const grades: GradesBody = (await s.professor.get(`/api/assignments/${s.assignment.id}/grades`).expect(200)).body;

    const res = await s.professor.get(exportUrl(s.assignment.id, 'note')).expect(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe('attachment; filename="note.csv"');
    const rows = grades.submissions.map((x) =>
      [
        x.teamName,
        x.reviewsCounted,
        yes(x.calibrated),
        decimal(x.grade),
        x.disputes.open,
        x.disputes.upheld,
        x.disputes.rejected,
        'finală',
      ].join(';'),
    );
    expect(res.text).toBe(`${BOM}${[TEAMS_HEADER, ...rows].join('\r\n')}\r\n`);
    expect(res.text).toContain('Echipa 1;2;da;');
  });

  it('exports one row per reviewer number, as the grades show them, without ids or emails', async () => {
    const s = await setup();
    await dispute(s);
    const grades: GradesBody = (await s.professor.get(`/api/assignments/${s.assignment.id}/grades`).expect(200)).body;

    const res = await s.professor.get(exportUrl(s.assignment.id, 'evaluatori')).expect(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe('attachment; filename="evaluatori.csv"');
    const rows = grades.reviewers.map((r) =>
      [r.number, decimal(r.reliability), yes(r.flagged), yes(r.measured), r.reviewsSent, decimal(r.reviewerGrade), 'finală'].join(
        ';',
      ),
    );
    expect(rows).toHaveLength(3);
    expect(res.text).toBe(`${BOM}${[REVIEWERS_HEADER, ...rows].join('\r\n')}\r\n`);
    for (const student of s.students) {
      expect(res.text).not.toContain(student.id);
    }
    expect(res.text).not.toContain('@test.example');
  });

  it('marks the rows provisional before the review deadline', async () => {
    const s = await setup();

    const teams = (await s.professor.get(exportUrl(s.assignment.id, 'note')).expect(200)).text.trimEnd().split('\r\n');
    const reviewers = (await s.professor.get(exportUrl(s.assignment.id, 'evaluatori')).expect(200)).text.trimEnd().split('\r\n');
    for (const line of [...teams.slice(1), ...reviewers.slice(1)]) {
      expect(line.endsWith(';provizorie')).toBe(true);
    }
  });

  it('refuses the export before allocation', async () => {
    const s = await setup(false);

    for (const file of ['note', 'evaluatori'] as const) {
      const res = await s.professor.get(exportUrl(s.assignment.id, file)).expect(409);
      expect(res.body.message).toBe('Exportul e disponibil după alocarea evaluatorilor.');
    }
  });

  it('answers 401 without a session, 403 to a student and 404 to another professor', async () => {
    const s = await setup();
    const { agent: other } = await signedIn(ctx, 'alt-prof@test.example', Role.PROFESSOR);

    for (const file of ['note', 'evaluatori'] as const) {
      await request(ctx.app.getHttpServer()).get(exportUrl(s.assignment.id, file)).expect(401);
      await s.students[1].agent.get(exportUrl(s.assignment.id, file)).expect(403);
      await other.get(exportUrl(s.assignment.id, file)).expect(404);
    }
  });
});
