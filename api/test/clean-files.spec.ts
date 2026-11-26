import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { cleanOffice as cleanDocx, cleanOffice } from '../src/submissions/clean-office';
import { cleanOpenDocument } from '../src/submissions/clean-opendocument';
import { cleanPdf } from '../src/submissions/clean-pdf';
import { cleanZip, ZIP_TOO_LARGE } from '../src/submissions/clean-zip';
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

function pptxWithAuthor(): Buffer {
  const files: Record<string, string> = {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    'ppt/presentation.xml': '<p:presentation xmlns:p="p"/>',
    'ppt/slides/slide1.xml': '<p:sld xmlns:p="p" xmlns:a="a"><a:t>Diapozitivul unu</a:t></p:sld>',
    'ppt/commentAuthors.xml': `<p:cmAuthorLst xmlns:p="p"><p:cmAuthor id="0" name="${NAME}" initials="PA" lastIdx="1" clrIdx="0"/></p:cmAuthorLst>`,
    'ppt/authors.xml': `<p188:authorLst xmlns:p188="p188"><p188:author id="{1}" name="${NAME}" initials="PA" userId="${NAME}" providerId="None"/></p188:authorLst>`,
    'docProps/core.xml': `<cp:coreProperties xmlns:cp="cp" xmlns:dc="dc"><dc:creator>${NAME}</dc:creator><cp:lastModifiedBy>${NAME}</cp:lastModifiedBy></cp:coreProperties>`,
    'docProps/app.xml': `<Properties xmlns="app"><Company>${NAME} SRL</Company></Properties>`,
  };
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([path, text]) => [path, strToU8(text)]))));
}

/** An ODT or ODP: `mimetype` first and stored, as the format requires. */
function openDocumentWithAuthor(kind: 'text' | 'presentation'): Buffer {
  return Buffer.from(
    zipSync({
      mimetype: [strToU8(`application/vnd.oasis.opendocument.${kind}`), { level: 0 }],
      'content.xml': [
        strToU8(
          `<office:document-content xmlns:office="o" xmlns:dc="dc" xmlns:text="t"><office:body><text:p>Continutul proiectului</text:p><office:annotation><dc:creator>${NAME}</dc:creator><dc:date>2026-11-01T10:00:00</dc:date><text:p>Bun</text:p></office:annotation></office:body></office:document-content>`,
        ),
        {},
      ],
      'meta.xml': [
        strToU8(
          `<office:document-meta xmlns:office="o" xmlns:meta="m" xmlns:dc="dc"><office:meta><meta:initial-creator>${NAME}</meta:initial-creator><dc:creator>${NAME}</dc:creator><dc:title>Proiect</dc:title></office:meta></office:document-meta>`,
        ),
        {},
      ],
    }),
  );
}

/** Name, compression method, DOS time and date of every entry, from the ZIP's central directory. */
function zipEntries(file: Buffer): { name: string; method: number; time: number; date: number }[] {
  let end = file.length - 22;
  while (file.readUInt32LE(end) !== 0x06054b50) end -= 1;
  const count = file.readUInt16LE(end + 10);
  let at = file.readUInt32LE(end + 16);
  const entries = [];
  for (let i = 0; i < count; i += 1) {
    const nameLength = file.readUInt16LE(at + 28);
    entries.push({
      name: file.toString('utf8', at + 46, at + 46 + nameLength),
      method: file.readUInt16LE(at + 10),
      time: file.readUInt16LE(at + 12),
      date: file.readUInt16LE(at + 14),
    });
    at += 46 + nameLength + file.readUInt16LE(at + 30) + file.readUInt16LE(at + 32);
  }
  return entries;
}

describe('file type detection (D-016)', () => {
  it('recognises PDF and DOCX by content, not by name', async () => {
    expect(detectFileType(await pdfWithAuthor())).toBe('pdf');
    expect(detectFileType(docxWithAuthor())).toBe('docx');
    expect(detectFileType(Buffer.from('nu sunt un pdf'))).toBeNull();
    const otherZip = Buffer.from(zipSync({ 'readme.txt': strToU8('salut') }));
    expect(detectFileType(otherZip)).toBe('zip');
  });

  it('recognises PPTX, ODT, ODP and any other ZIP by content (D-032)', () => {
    expect(detectFileType(pptxWithAuthor())).toBe('pptx');
    expect(detectFileType(openDocumentWithAuthor('text'))).toBe('odt');
    expect(detectFileType(openDocumentWithAuthor('presentation'))).toBe('odp');
    expect(detectFileType(Buffer.from(zipSync({ 'src/index.js': strToU8('console.log(1)') })))).toBe('zip');
    expect(detectFileType(Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).toBeNull();
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

describe('cleanOffice on PPTX (D-032)', () => {
  it('removes the author from properties and comment authors, and keeps the slides', () => {
    const cleaned = cleanOffice(pptxWithAuthor());

    const files = unzipSync(new Uint8Array(cleaned));
    for (const [path, content] of Object.entries(files)) {
      expect(`${path}: ${strFromU8(content)}`).not.toContain('Popescu');
    }
    expect(strFromU8(files['ppt/commentAuthors.xml'])).toContain('name="Anonim" initials=""');
    expect(strFromU8(files['ppt/authors.xml'])).toContain('userId=""');
    expect(strFromU8(files['ppt/slides/slide1.xml'])).toContain('Diapozitivul unu');
    expect(detectFileType(cleaned)).toBe('pptx');
  });
});

describe('cleanOpenDocument (D-032)', () => {
  it.each(['text', 'presentation'] as const)('removes the author of an OpenDocument %s and keeps mimetype first and stored', (kind) => {
    const cleaned = cleanOpenDocument(openDocumentWithAuthor(kind));

    const files = unzipSync(new Uint8Array(cleaned));
    for (const [path, content] of Object.entries(files)) {
      expect(`${path}: ${strFromU8(content)}`).not.toContain('Popescu');
    }
    expect(strFromU8(files['content.xml'])).toContain('<dc:creator>Anonim</dc:creator>');
    expect(strFromU8(files['content.xml'])).toContain('Continutul proiectului');
    expect(strFromU8(files['meta.xml'])).toContain('<dc:title>Proiect</dc:title>');
    const [first] = zipEntries(cleaned);
    expect(first).toMatchObject({ name: 'mimetype', method: 0 });
    expect(detectFileType(cleaned)).toBe(kind === 'text' ? 'odt' : 'odp');
  });
});

describe('cleanZip (D-032)', () => {
  async function project(): Promise<Buffer> {
    const top = 'proiect-popescu-andrei/';
    const inner = Buffer.from(zipSync({ 'autor.txt': strToU8(NAME) }));
    const text = (value: string) => strToU8(value);
    return Buffer.from(
      zipSync({
        [`${top}index.js`]: text('console.log("salut");'),
        [`${top}README.md`]: text('# Aplicatia noastra'),
        [`${top}package.json`]: text(
          JSON.stringify({ name: 'app', version: '1.0.0', author: NAME, contributors: [NAME], maintainers: [NAME], scripts: { start: 'node index.js' } }),
        ),
        [`${top}api/composer.json`]: text(JSON.stringify({ name: 'echipa/api', authors: [{ name: NAME }], require: { php: '>=8.2' } })),
        [`${top}docs/raport.docx`]: new Uint8Array(docxWithAuthor()),
        [`${top}docs/slides.pdf`]: new Uint8Array(await pdfWithAuthor()),
        [`${top}docs/prezentare.pptx`]: new Uint8Array(pptxWithAuthor()),
        [`${top}docs/nota.odt`]: new Uint8Array(openDocumentWithAuthor('text')),
        [`${top}arhiva-veche.zip`]: new Uint8Array(inner),
        [`${top}.git/config`]: text(`[user]\n  name = ${NAME}`),
        [`${top}.git/logs/HEAD`]: text(`0000 1111 ${NAME} <popescu@ulbsibiu.ro>`),
        [`${top}.svn/entries`]: text(NAME),
        [`${top}node_modules/lib/index.js`]: text('module.exports = 1;'),
        [`${top}web/node_modules/x/package.json`]: text(JSON.stringify({ author: NAME })),
        [`${top}vendor/autoload.php`]: text('<?php'),
        [`${top}web/dist/app.js`]: text('/* build */'),
        [`${top}build/out.js`]: text('/* build */'),
        [`${top}.idea/workspace.xml`]: text(NAME),
        [`${top}.vscode/settings.json`]: text('{}'),
        [`${top}.DS_Store`]: text(NAME),
        [`${top}web/Thumbs.db`]: text(NAME),
        [`__MACOSX/${top}._index.js`]: text(NAME),
      }),
    );
  }

  it('removes version control, editor, dependency and build folders and system files at any depth', async () => {
    const names = zipEntries(await cleanZip(await project())).map((e) => e.name);

    expect(names.sort()).toEqual(
      [
        'proiect/README.md',
        'proiect/api/composer.json',
        'proiect/arhiva-veche.zip',
        'proiect/docs/nota.odt',
        'proiect/docs/prezentare.pptx',
        'proiect/docs/raport.docx',
        'proiect/docs/slides.pdf',
        'proiect/index.js',
        'proiect/package.json',
      ].sort(),
    );
  });

  it('removes authors from package.json and composer.json, keeping the other fields', async () => {
    const files = unzipSync(new Uint8Array(await cleanZip(await project())));

    expect(JSON.parse(strFromU8(files['proiect/package.json']))).toEqual({ name: 'app', version: '1.0.0', scripts: { start: 'node index.js' } });
    expect(JSON.parse(strFromU8(files['proiect/api/composer.json']))).toEqual({ name: 'echipa/api', require: { php: '>=8.2' } });
  });

  it('cleans the documents inside, leaves an inner ZIP as it is, and sets every date to 1 January 1980', async () => {
    const original = await project();
    const cleaned = await cleanZip(original);
    const files = unzipSync(new Uint8Array(cleaned));

    for (const path of ['proiect/docs/raport.docx', 'proiect/docs/prezentare.pptx', 'proiect/docs/nota.odt']) {
      for (const [inner, content] of Object.entries(unzipSync(files[path]))) {
        expect(`${path}/${inner}: ${strFromU8(content)}`).not.toContain('Popescu');
      }
    }
    const pdf = await PDFDocument.load(files['proiect/docs/slides.pdf']);
    expect(pdf.getAuthor() ?? '').toBe('');
    const before = unzipSync(new Uint8Array(original));
    expect(Buffer.from(files['proiect/arhiva-veche.zip']).equals(Buffer.from(before['proiect-popescu-andrei/arhiva-veche.zip']))).toBe(true);
    for (const entry of zipEntries(cleaned)) {
      expect(entry).toMatchObject({ date: (0 << 9) | (1 << 5) | 1, time: 0 });
    }
  });

  it('keeps the folders as they are when there is no single top folder', async () => {
    const zip = Buffer.from(zipSync({ 'src/a.js': strToU8('1'), 'README.md': strToU8('# x') }));

    expect(zipEntries(await cleanZip(zip)).map((e) => e.name).sort()).toEqual(['README.md', 'src/a.js']);
  });

  it('refuses an archive over 20,000 entries or 200 MB unpacked, without unpacking it', async () => {
    const many: Record<string, Uint8Array> = {};
    for (let i = 0; i <= 20_000; i += 1) many[`f${i}.txt`] = new Uint8Array(0);
    await expect(cleanZip(Buffer.from(zipSync(many)))).rejects.toThrow(ZIP_TOO_LARGE);

    // One small entry whose central directory claims 250 MB.
    const forged = Buffer.from(zipSync({ 'mare.bin': strToU8('x') }));
    let end = forged.length - 22;
    while (forged.readUInt32LE(end) !== 0x06054b50) end -= 1;
    forged.writeUInt32LE(250 * 1024 * 1024, forged.readUInt32LE(end + 16) + 24);
    await expect(cleanZip(forged)).rejects.toThrow(ZIP_TOO_LARGE);
    // Building 20,001 entries is slow on the CI runner.
  }, 30_000);
});

/** The same file with one entry's unpacked size in the central directory set to `size`. */
function claimSize(file: Buffer, name: string, size: number): Buffer {
  const forged = Buffer.from(file);
  let end = forged.length - 22;
  while (forged.readUInt32LE(end) !== 0x06054b50) end -= 1;
  let at = forged.readUInt32LE(end + 16);
  for (let i = 0; i < forged.readUInt16LE(end + 10); i += 1) {
    const nameLength = forged.readUInt16LE(at + 28);
    if (forged.toString('utf8', at + 46, at + 46 + nameLength) === name) forged.writeUInt32LE(size, at + 24);
    at += 46 + nameLength + forged.readUInt16LE(at + 30) + forged.readUInt16LE(at + 32);
  }
  return forged;
}

describe('fixes from the code review of 2026-11-26', () => {
  it('refuses a DOCX, PPTX, ODT or ODP that unpacks to over 200 MB, on its own or inside a ZIP (D-032)', async () => {
    const huge = 250 * 1024 * 1024;
    const docx = claimSize(docxWithAuthor(), 'word/document.xml', huge);
    expect(() => cleanOffice(docx)).toThrow(ZIP_TOO_LARGE);
    expect(() => cleanOffice(claimSize(pptxWithAuthor(), 'ppt/slides/slide1.xml', huge))).toThrow(ZIP_TOO_LARGE);
    expect(() => cleanOpenDocument(claimSize(openDocumentWithAuthor('text'), 'content.xml', huge))).toThrow(ZIP_TOO_LARGE);
    const outer = Buffer.from(zipSync({ 'proiect/raport.docx': [new Uint8Array(docx), { level: 0 }] }));
    await expect(cleanZip(outer)).rejects.toThrow(ZIP_TOO_LARGE);
  });

  it('reads backslashes in ZIP entry names as folders (D-032)', async () => {
    const zip = Buffer.from(
      zipSync({
        'Popescu_Ion\\index.js': strToU8('1'),
        'Popescu_Ion\\.git\\config': strToU8(`name = ${NAME}`),
        'Popescu_Ion\\node_modules\\x\\index.js': strToU8('1'),
      }),
    );

    expect(zipEntries(await cleanZip(zip)).map((e) => e.name)).toEqual(['proiect/index.js']);
  });

  it('removes Word people and custom properties together with what points to them (D-032)', () => {
    const files: Record<string, string> = {
      '[Content_Types].xml':
        '<Types xmlns="t"><Override PartName="/word/document.xml" ContentType="d"/><Override PartName="/word/people.xml" ContentType="p"/><Override PartName="/docProps/custom.xml" ContentType="c"/></Types>',
      '_rels/.rels':
        '<Relationships xmlns="r"><Relationship Id="rId1" Type="office" Target="word/document.xml"/><Relationship Id="rId9" Type="custom" Target="docProps/custom.xml"/></Relationships>',
      'word/_rels/document.xml.rels':
        '<Relationships xmlns="r"><Relationship Id="rId5" Type="people" Target="people.xml"/><Relationship Id="rId6" Type="styles" Target="styles.xml"/></Relationships>',
      'word/document.xml': '<w:document xmlns:w="w"><w:body/></w:document>',
      'word/styles.xml': '<w:styles xmlns:w="w"/>',
      'word/people.xml': `<w15:people xmlns:w15="w15"><w15:person w15:author="${NAME}"/></w15:people>`,
      'docProps/custom.xml': `<Properties xmlns="c"><property name="Autor"><vt:lpwstr>${NAME}</vt:lpwstr></property></Properties>`,
    };
    const docx = Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([path, text]) => [path, strToU8(text)]))));

    const cleaned = unzipSync(new Uint8Array(cleanOffice(docx)));
    expect(cleaned['word/people.xml']).toBeUndefined();
    expect(cleaned['docProps/custom.xml']).toBeUndefined();
    const types = strFromU8(cleaned['[Content_Types].xml']);
    expect(types).not.toContain('people.xml');
    expect(types).not.toContain('custom.xml');
    expect(types).toContain('/word/document.xml');
    expect(strFromU8(cleaned['_rels/.rels'])).not.toContain('custom.xml');
    expect(strFromU8(cleaned['_rels/.rels'])).toContain('word/document.xml');
    expect(strFromU8(cleaned['word/_rels/document.xml.rels'])).not.toContain('people.xml');
    expect(strFromU8(cleaned['word/_rels/document.xml.rels'])).toContain('styles.xml');
  });

  it('removes repository, homepage, bugs, funding and support from manifests (D-032)', async () => {
    const zip = Buffer.from(
      zipSync({
        'proiect/package.json': strToU8(
          JSON.stringify({ name: 'app', repository: 'github:ionpopescu/app', homepage: 'https://ionpopescu.dev', bugs: { url: 'x' }, funding: 'y', private: true }),
        ),
        'proiect/composer.json': strToU8(JSON.stringify({ name: 'a/b', support: { email: 'ion@example.com' }, type: 'project' })),
      }),
    );

    const files = unzipSync(new Uint8Array(await cleanZip(zip)));
    expect(JSON.parse(strFromU8(files['proiect/package.json']))).toEqual({ name: 'app', private: true });
    expect(JSON.parse(strFromU8(files['proiect/composer.json']))).toEqual({ name: 'a/b', type: 'project' });
  });

  it('removes comment initials and user-defined properties from an ODT (D-032)', () => {
    const odt = Buffer.from(
      zipSync({
        mimetype: [strToU8('application/vnd.oasis.opendocument.text'), { level: 0 }],
        'content.xml': [
          strToU8(
            '<office:document-content xmlns:office="o" xmlns:dc="dc" xmlns:meta="m"><office:annotation><dc:creator>Ion Popescu</dc:creator><meta:creator-initials>IP</meta:creator-initials></office:annotation></office:document-content>',
          ),
          {},
        ],
        'meta.xml': [
          strToU8(
            '<office:document-meta xmlns:office="o" xmlns:meta="m"><office:meta><meta:user-defined meta:name="Echipa">Popescu si Ionescu</meta:user-defined><meta:generator>LibreOffice</meta:generator></office:meta></office:document-meta>',
          ),
          {},
        ],
      }),
    );

    const files = unzipSync(new Uint8Array(cleanOpenDocument(odt)));
    expect(strFromU8(files['content.xml'])).not.toContain('IP<');
    expect(strFromU8(files['meta.xml'])).not.toContain('Popescu');
    expect(strFromU8(files['meta.xml'])).toContain('LibreOffice');
  });
});
