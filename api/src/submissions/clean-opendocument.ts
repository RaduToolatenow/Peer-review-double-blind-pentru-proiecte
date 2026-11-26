import { strFromU8, strToU8, unzipSync, Zippable, zipSync } from 'fflate';

const EMPTY_META =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" office:version="1.3"><office:meta/></office:document-meta>';

/** Who wrote a comment, and who saved the document last, in the content and styles. */
const CREATOR = /<dc:creator>[^<]*<\/dc:creator>/g;
const META_AUTHORS = /<(meta:initial-creator|dc:creator|meta:printed-by)>[^<]*<\/\1>/g;

/**
 * Removes who wrote an ODT or ODP (D-032): the authors in `meta.xml` and of every comment. The
 * format needs `mimetype` as the first entry, stored uncompressed, so it is written first.
 */
export function cleanOpenDocument(file: Buffer): Buffer {
  const files = unzipSync(new Uint8Array(file));
  const cleaned: Zippable = {};
  if (files.mimetype) {
    cleaned.mimetype = [files.mimetype, { level: 0 }];
  }
  for (const [path, content] of Object.entries(files)) {
    if (path === 'mimetype') continue;
    if (path === 'meta.xml') {
      const text = strFromU8(content).replace(META_AUTHORS, '');
      cleaned[path] = strToU8(text.includes('<office:document-meta') ? text : EMPTY_META);
    } else if (path.endsWith('.xml')) {
      cleaned[path] = strToU8(strFromU8(content).replace(CREATOR, '<dc:creator>Anonim</dc:creator>'));
    } else {
      cleaned[path] = content;
    }
  }
  return Buffer.from(zipSync(cleaned));
}
