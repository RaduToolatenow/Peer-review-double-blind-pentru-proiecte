import { posix } from 'node:path';
import { strFromU8, strToU8, zipSync } from 'fflate';
import { newBudget, UnzipBudget, unzipLimited } from './unzip-limited';

const EMPTY_CORE =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
  'xmlns:dc="http://purl.org/dc/elements/1.1/"></cp:coreProperties>';

const EMPTY_APP =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"></Properties>';

/** Every author and initials attribute in Word XML (tracked changes, comments). */
const AUTHOR_ATTRIBUTES = /\b(w:author|w15:author|w:initials)="[^"]*"/g;

/** PowerPoint's comment author lists: legacy `commentAuthors.xml` and modern `authors.xml`. */
const PPT_AUTHOR_FILES = new Set(['ppt/commentAuthors.xml', 'ppt/authors.xml']);
const PPT_AUTHOR_ATTRIBUTES = /\b(name|initials|userId)="[^"]*"/g;

/**
 * Removes who wrote a DOCX or PPTX (D-032): document properties, Word's people list, and the
 * authors of comments and tracked changes. A removed part also loses the relationships and
 * content types that point to it, so Office opens the file without a repair prompt. The text and
 * slides themselves are kept.
 */
export function cleanOffice(file: Buffer, budget: UnzipBudget = newBudget()): Buffer {
  const files = unzipLimited(file, budget);
  const removed = new Set(Object.keys(files).filter((path) => path === 'word/people.xml' || path.startsWith('docProps/custom')));
  const cleaned: Record<string, Uint8Array> = {};

  for (const [path, content] of Object.entries(files)) {
    if (removed.has(path)) {
      continue;
    }
    if (path === '[Content_Types].xml' || path.endsWith('.rels')) {
      cleaned[path] = strToU8(dropReferences(path, strFromU8(content), removed));
      continue;
    }
    if (path === 'docProps/core.xml') {
      cleaned[path] = strToU8(EMPTY_CORE);
    } else if (path === 'docProps/app.xml') {
      cleaned[path] = strToU8(EMPTY_APP);
    } else if (PPT_AUTHOR_FILES.has(path)) {
      const text = strFromU8(content).replace(PPT_AUTHOR_ATTRIBUTES, (_, name: string) =>
        name === 'name' ? `${name}="Anonim"` : `${name}=""`,
      );
      cleaned[path] = strToU8(text);
    } else if (path.endsWith('.xml') || path.endsWith('.rels')) {
      const text = strFromU8(content).replace(AUTHOR_ATTRIBUTES, (_, name: string) =>
        name === 'w:initials' ? `${name}=""` : `${name}="Anonim"`,
      );
      cleaned[path] = strToU8(text);
    } else {
      cleaned[path] = content;
    }
  }

  return Buffer.from(zipSync(cleaned));
}

/** Drops the content-type overrides and relationships that point to a removed part. */
function dropReferences(path: string, xml: string, removed: Set<string>): string {
  if (path === '[Content_Types].xml') {
    return xml.replace(/<Override\b[^>]*PartName="\/([^"]+)"[^>]*\/>/g, (tag, part: string) => (removed.has(part) ? '' : tag));
  }
  const base = path.replace(/_rels\/[^/]*\.rels$/, '');
  return xml.replace(/<Relationship\b[^>]*Target="([^"]+)"[^>]*\/>/g, (tag, target: string) => {
    const part = target.startsWith('/') ? target.slice(1) : posix.normalize(base + target);
    return removed.has(part) ? '' : tag;
  });
}

