import { strFromU8, strToU8, Zippable, zipSync } from 'fflate';
import { newBudget, UnzipBudget, unzipLimited } from './unzip-limited';

const EMPTY_META =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" office:version="1.3"><office:meta/></office:document-meta>';

/** Who wrote a comment, and who saved the document last, in the content and styles. */
const CREATOR = /<dc:creator>[^<]*<\/dc:creator>/g;
const META_AUTHORS = /<(meta:initial-creator|dc:creator|meta:printed-by)>[^<]*<\/\1>/g;
/** Custom document properties, which may hold a name. */
const USER_DEFINED = /<meta:user-defined\b[^>]*(\/>|>[^<]*<\/meta:user-defined>)/g;
/** The initials LibreOffice writes on each comment. */
const INITIALS = /<meta:creator-initials>[^<]*<\/meta:creator-initials>/g;

/**
 * Removes who wrote an ODT or ODP (D-032): the authors and user-defined properties in `meta.xml`,
 * and the author and initials of every comment. The
 * format needs `mimetype` as the first entry, stored uncompressed, so it is written first.
 */
export function cleanOpenDocument(file: Buffer, budget: UnzipBudget = newBudget()): Buffer {
  const files = unzipLimited(file, budget);
  const cleaned: Zippable = {};
  if (files.mimetype) {
    cleaned.mimetype = [files.mimetype, { level: 0 }];
  }
  for (const [path, content] of Object.entries(files)) {
    if (path === 'mimetype') continue;
    if (path === 'meta.xml') {
      const text = strFromU8(content).replace(META_AUTHORS, '').replace(USER_DEFINED, '');
      cleaned[path] = strToU8(text.includes('<office:document-meta') ? text : EMPTY_META);
    } else if (path.endsWith('.xml')) {
      cleaned[path] = strToU8(
        strFromU8(content).replace(CREATOR, '<dc:creator>Anonim</dc:creator>').replace(INITIALS, '<meta:creator-initials></meta:creator-initials>'),
      );
    } else {
      cleaned[path] = content;
    }
  }
  return Buffer.from(zipSync(cleaned));
}
