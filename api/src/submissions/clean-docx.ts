import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

const EMPTY_CORE =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
  'xmlns:dc="http://purl.org/dc/elements/1.1/"></cp:coreProperties>';

const EMPTY_APP =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"></Properties>';

/** Every author and initials attribute in Word XML (tracked changes, comments). */
const AUTHOR_ATTRIBUTES = /\b(w:author|w15:author|w:initials)="[^"]*"/g;

/**
 * Removes who wrote a DOCX (D-016): document properties, the people list and the
 * authors of comments and tracked changes. The text itself is kept.
 */
export function cleanDocx(file: Buffer): Buffer {
  const files = unzipSync(new Uint8Array(file));
  const cleaned: Record<string, Uint8Array> = {};

  for (const [path, content] of Object.entries(files)) {
    if (path === 'word/people.xml' || path.startsWith('docProps/custom')) {
      continue;
    }
    if (path === 'docProps/core.xml') {
      cleaned[path] = strToU8(EMPTY_CORE);
    } else if (path === 'docProps/app.xml') {
      cleaned[path] = strToU8(EMPTY_APP);
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
