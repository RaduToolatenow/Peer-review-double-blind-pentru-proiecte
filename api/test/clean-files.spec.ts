import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { cleanDocx } from '../src/submissions/clean-docx';
import { cleanPdf } from '../src/submissions/clean-pdf';
import { detectFileType } from '../src/submissions/file-type';

const NAME = 'Popescu Andrei';

async function pdfWithAuthor(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setAuthor(NAME);
  pdf.setTitle(`Proiectul lui ${NAME}`);
  pdf.setSubject(NAME);
  pdf.setKeywords([NAME]);
  pdf.setCreator(NAME);
  pdf.setProducer(NAME);
  const page = pdf.addPage();
  page.drawText('Continutul proiectului');

  const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><dc:creator>${NAME}</dc:creator></x:xmpmeta>`;
  const metadata = pdf.context.stream(xmp, { Type: 'Metadata', Subtype: 'XML' });
  pdf.catalog.set(PDFName.of('Metadata'), pdf.context.register(metadata));

  const note = pdf.context.obj({
    Type: 'Annot',
    Subtype: 'Text',
    Rect: [10, 10, 30, 30],
    T: PDFString.of(NAME),
    Contents: PDFString.of('Comentariu'),
  });
  page.node.set(PDFName.of('Annots'), pdf.context.obj([pdf.context.register(note)]));
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

function docxWithAuthor(): Buffer {
  const files: Record<string, string> = {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    'word/document.xml': `<w:document xmlns:w="w"><w:body><w:p><w:ins w:id="1" w:author="${NAME}" w:date="2026-11-01T10:00:00Z"><w:r><w:t>Text</w:t></w:r></w:ins><w:del w:id="2" w:author="${NAME}"><w:r><w:delText>vechi</w:delText></w:r></w:del></w:p></w:body></w:document>`,
    'word/comments.xml': `<w:comments xmlns:w="w"><w:comment w:id="0" w:author="${NAME}" w:initials="PA"><w:p><w:r><w:t>Bun</w:t></w:r></w:p></w:comment></w:comments>`,
    'word/people.xml': `<w15:people xmlns:w15="w15"><w15:person w15:author="${NAME}"/></w15:people>`,
    'docProps/core.xml': `<cp:coreProperties xmlns:cp="cp" xmlns:dc="dc"><dc:creator>${NAME}</dc:creator><cp:lastModifiedBy>${NAME}</cp:lastModifiedBy><dc:title>Proiect</dc:title></cp:coreProperties>`,
    'docProps/app.xml': `<Properties xmlns="app"><Company>${NAME} SRL</Company><Manager>${NAME}</Manager><Pages>1</Pages></Properties>`,
  };
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([path, text]) => [path, strToU8(text)]))));
}

describe('file type detection (D-016)', () => {
  it('recognises PDF and DOCX by content, not by name', async () => {
    expect(detectFileType(await pdfWithAuthor())).toBe('pdf');
    expect(detectFileType(docxWithAuthor())).toBe('docx');
    expect(detectFileType(Buffer.from('nu sunt un pdf'))).toBeNull();
    const otherZip = Buffer.from(zipSync({ 'readme.txt': strToU8('salut') }));
    expect(detectFileType(otherZip)).toBeNull();
  });
});

describe('cleanPdf (D-016)', () => {
  it('removes the author from the info, XMP metadata and annotations', async () => {
    const cleaned = await cleanPdf(await pdfWithAuthor());

    expect(cleaned.toString('latin1')).not.toContain('Popescu');
    const reopened = await PDFDocument.load(cleaned);
    expect(reopened.getAuthor() ?? '').toBe('');
    expect(reopened.catalog.get(PDFName.of('Metadata'))).toBeUndefined();
    expect(reopened.getPageCount()).toBe(1);
  });
});

describe('cleanDocx (D-016)', () => {
  it('removes the author from properties, comments and tracked changes', () => {
    const cleaned = cleanDocx(docxWithAuthor());

    const files = unzipSync(new Uint8Array(cleaned));
    for (const [path, content] of Object.entries(files)) {
      expect(`${path}: ${strFromU8(content)}`).not.toContain('Popescu');
    }
    expect(files['word/people.xml']).toBeUndefined();
    expect(strFromU8(files['word/document.xml'])).toContain('<w:t>Text</w:t>');
    expect(strFromU8(files['word/comments.xml'])).toContain('w:author="Anonim"');
    expect(detectFileType(cleaned)).toBe('docx');
  });
});
