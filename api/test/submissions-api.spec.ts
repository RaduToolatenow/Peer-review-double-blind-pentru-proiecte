import { randomBytes } from 'node:crypto';
import { readdirSync, rmSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import request from 'supertest';
import { Role } from '../src/generated/prisma/enums';
import {
  clearDatabase,
  createAssignment,
  createClass,
  createRubric,
  createTestApp,
  DAY_MS,
  signedIn,
  TEST_FILE_DIR,
} from './helpers';

const LINK = 'https://proiect-anonim.onrender.com';

async function pdf(author = 'Popescu Andrei'): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setAuthor(author);
  doc.addPage();
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

function docx(): Buffer {
  return Buffer.from(
    zipSync({
      '[Content_Types].xml': strToU8('<Types/>'),
      'word/document.xml': strToU8('<w:document xmlns:w="w"><w:body/></w:document>'),
      'docProps/core.xml': strToU8('<cp:coreProperties xmlns:cp="cp" xmlns:dc="dc"><dc:creator>Popescu Andrei</dc:creator></cp:coreProperties>'),
    }),
  );
}

function openDocument(kind: 'text' | 'presentation'): Buffer {
  return Buffer.from(
    zipSync({
      mimetype: [strToU8(`application/vnd.oasis.opendocument.${kind}`), { level: 0 }],
      'content.xml': [strToU8('<office:document-content xmlns:office="o"/>'), {}],
      'meta.xml': [strToU8('<office:document-meta xmlns:office="o" xmlns:dc="dc"><office:meta><dc:creator>Popescu Andrei</dc:creator></office:meta></office:document-meta>'), {}],
    }),
  );
}

describe('submissions API (D-016)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await clearDatabase(ctx.prisma);
    rmSync(TEST_FILE_DIR, { recursive: true, force: true });
  });

  afterAll(async () => {
    await ctx.close();
  });

  /** A professor, a class with two teams, a student in team 1 and an open assignment. */
  async function setup(options: { submissionOpen?: boolean } = {}) {
    const { agent: professor, user: prof } = await signedIn(ctx, 'prof@test.example', Role.PROFESSOR);
    const { agent: student, user: me } = await signedIn(ctx, 'student@test.example', Role.STUDENT);
    const rubric = await createRubric(ctx.prisma, prof.id);
    const klass = await createClass(ctx.prisma, prof.id, 2);
    const reviewDeadline = new Date(Date.now() + (options.submissionOpen === false ? 1 : 14) * DAY_MS);
    const assignment = await createAssignment(ctx.prisma, prof.id, rubric.id, klass.id, reviewDeadline);
    await ctx.prisma.teamMember.create({ data: { teamId: klass.teams[0].id, classId: klass.id, userId: me.id } });
    return { professor, student, me, klass, assignment };
  }

  const submit = (agent: ReturnType<typeof request.agent>, assignmentId: string, file?: Buffer, name = 'proiect.pdf') => {
    const req = agent
      .put(`/api/my/assignments/${assignmentId}/submission`)
      .field('link', LINK)
      .field('description', 'Aplicația noastră');
    return file ? req.attach('file', file, name) : req;
  };

  it("lists the student's assignments with no submission yet", async () => {
    const { student, assignment } = await setup();

    const res = await student.get('/api/my/assignments').expect(200);
    expect(res.body).toEqual([
      expect.objectContaining({ id: assignment.id, teamName: 'Echipa 1', phase: 'submission', submission: null }),
    ]);
  });

  it('stores a cleaned file and serves it under a generic name', async () => {
    const { student, assignment } = await setup();

    const res = await submit(student, assignment.id, await pdf()).expect(200);
    expect(res.body.submission).toMatchObject({ link: LINK, description: 'Aplicația noastră', fileType: 'pdf' });

    const file = await student.get(res.body.submission.fileUrl).buffer(true).expect(200);
    expect(file.headers['content-type']).toBe('application/pdf');
    expect(file.headers['content-disposition']).toMatch(/^attachment; filename="predare-[a-z0-9]{8}\.pdf"$/);
    expect(file.body.toString('latin1')).not.toContain('Popescu');
  });

  it('replaces the submission and deletes the old file', async () => {
    const { student, assignment } = await setup();

    await submit(student, assignment.id, await pdf()).expect(200);
    const second = await submit(student, assignment.id, docx(), 'proiect.docx').expect(200);

    expect(second.body.submission.fileType).toBe('docx');
    expect(await ctx.prisma.submission.count()).toBe(1);
    expect(readdirSync(TEST_FILE_DIR)).toHaveLength(1);
  });

  it('refuses a missing file, a missing or bad link, a wrong type and a file over 10 MB', async () => {
    const { student, assignment } = await setup();
    const url = `/api/my/assignments/${assignment.id}/submission`;

    const noFile = await submit(student, assignment.id).expect(400);
    expect(noFile.body.message).toBe('Încarcă fișierul proiectului (PDF, DOCX, PPTX, ODT, ODP sau ZIP).');

    const noLink = await student.put(url).attach('file', await pdf(), 'p.pdf').expect(400);
    expect(noLink.body.message).toContain('Introdu linkul proiectului.');

    const badLink = await student.put(url).field('link', 'proiect.ro').attach('file', await pdf(), 'p.pdf').expect(400);
    expect(badLink.body.message).toContain('Linkul începe cu http:// sau https://.');

    const fake = await submit(student, assignment.id, Buffer.from('nu sunt pdf'), 'fals.pdf').expect(400);
    expect(fake.body.message).toBe('Fișierul trebuie să fie PDF, DOCX, PPTX, ODT, ODP sau ZIP.');

    const big = await submit(student, assignment.id, Buffer.alloc(10 * 1024 * 1024 + 1), 'mare.pdf').expect(413);
    expect(big.body.message).toBe('Fișierul are cel mult 10 MB.');
  });

  it('refuses a submission after the submission deadline', async () => {
    const { student, assignment } = await setup({ submissionOpen: false });

    const res = await submit(student, assignment.id, await pdf()).expect(409);
    expect(res.body.message).toBe('Termenul de predare a trecut.');
  });

  it('refuses a student outside the class or in a team the assignment leaves out', async () => {
    const { student, assignment, klass } = await setup();
    const { agent: stranger } = await signedIn(ctx, 'altul@test.example', Role.STUDENT);
    await submit(stranger, assignment.id, await pdf()).expect(404);

    await ctx.prisma.assignment.update({ where: { id: assignment.id }, data: { rubricAppliesTo: 'SELECTED' } });
    await ctx.prisma.assignmentTeam.create({
      data: { assignmentId: assignment.id, teamId: klass.teams[1].id, classId: klass.id },
    });
    const left = await submit(student, assignment.id, await pdf()).expect(403);
    expect(left.body.message).toBe('Echipa ta nu este evaluată la această temă.');
    // Q-011: a member of a team left out still reviews, so they see the assignment as a reviewer only.
    const list = (await student.get('/api/my/assignments').expect(200)).body;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: assignment.id, teamName: null, submission: null, canWithdraw: true });
  });

  it('lets the professor and the team download, and nobody else', async () => {
    const { professor, student, assignment } = await setup();
    const res = await submit(student, assignment.id, await pdf()).expect(200);
    const fileUrl = res.body.submission.fileUrl;

    await professor.get(fileUrl).expect(200);
    const { agent: other } = await signedIn(ctx, 'altul@test.example', Role.STUDENT);
    await other.get(fileUrl).expect(404);
    const { agent: otherProf } = await signedIn(ctx, 'alt-prof@test.example', Role.PROFESSOR);
    await otherProf.get(fileUrl).expect(404);
  });

  it('shows the professor the submission but never who submitted it (D-014)', async () => {
    const { professor, student, me, assignment } = await setup();
    await submit(student, assignment.id, await pdf()).expect(200);

    const detail = await professor.get(`/api/assignments/${assignment.id}`).expect(200);
    expect(detail.body.teams[0]).toMatchObject({ submitted: true, link: LINK, description: 'Aplicația noastră' });
    expect(detail.body.teams[0].fileUrl).toMatch(/^\/api\/submissions\/.+\/file$/);
    expect(JSON.stringify(detail.body)).not.toContain(me.id);
    expect(JSON.stringify(detail.body)).not.toContain('student@test.example');
  });

  it('accepts PPTX, ODT, ODP and ZIP, and serves each with its type under a generic name (D-032)', async () => {
    const { professor, student, assignment } = await setup();
    const files = {
      pptx: {
        file: Buffer.from(zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'ppt/presentation.xml': strToU8('<p:presentation xmlns:p="p"/>') })),
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      },
      odt: { file: openDocument('text'), type: 'application/vnd.oasis.opendocument.text' },
      odp: { file: openDocument('presentation'), type: 'application/vnd.oasis.opendocument.presentation' },
      zip: { file: Buffer.from(zipSync({ 'proiect-popescu/index.js': strToU8('console.log(1)') })), type: 'application/zip' },
    };
    for (const [fileType, { file, type }] of Object.entries(files)) {
      const res = await submit(student, assignment.id, file, `proiectul-meu.${fileType}`).expect(200);
      expect(res.body.submission.fileType).toBe(fileType);
      const download = await professor.get(res.body.submission.fileUrl).expect(200);
      expect(download.headers['content-type']).toBe(type);
      expect(download.headers['content-disposition']).toMatch(new RegExp(`^attachment; filename="predare-[0-9a-f]{8}\\.${fileType}"$`));
    }
  });

  it('accepts a ZIP up to 20 MB, other files up to 10 MB, and refuses anything over 20 MB (D-032)', async () => {
    const { student, assignment } = await setup();

    const bigZip = Buffer.from(zipSync({ 'proiect/date.bin': [new Uint8Array(randomBytes(11 * 1024 * 1024)), { level: 0 }] }));
    const ok = await submit(student, assignment.id, bigZip, 'proiect.zip').expect(200);
    expect(ok.body.submission.fileType).toBe('zip');

    const bigPdf = Buffer.concat([await pdf(), Buffer.alloc(10 * 1024 * 1024)]);
    const pdfRes = await submit(student, assignment.id, bigPdf, 'mare.pdf').expect(413);
    expect(pdfRes.body.message).toBe('Fișierul are cel mult 10 MB.');

    const huge = await submit(student, assignment.id, Buffer.alloc(20 * 1024 * 1024 + 1), 'imens.zip').expect(413);
    expect(huge.body.message).toBe('Arhiva ZIP are cel mult 20 MB, celelalte fișiere cel mult 10 MB.');
  });

  it('refuses a ZIP with too many entries and stores nothing (D-032)', async () => {
    const { student, assignment } = await setup();
    const many: Record<string, Uint8Array> = {};
    for (let i = 0; i <= 20_000; i += 1) many[`f${i}.txt`] = new Uint8Array(0);

    const res = await submit(student, assignment.id, Buffer.from(zipSync(many)), 'proiect.zip').expect(400);
    expect(res.body.message).toBe('Arhiva ZIP e prea mare după dezarhivare (cel mult 200 MB și 20.000 de fișiere).');
    expect(await ctx.prisma.submission.count()).toBe(0);
  });

  it('is only for students', async () => {
    const { professor } = await setup();
    await professor.get('/api/my/assignments').expect(403);
  });
});
