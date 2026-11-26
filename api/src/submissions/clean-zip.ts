import { strFromU8, strToU8, Zippable, zipSync } from 'fflate';
import { cleanOffice } from './clean-office';
import { cleanOpenDocument } from './clean-opendocument';
import { cleanPdf } from './clean-pdf';
import { detectFileType } from './file-type';
import { newBudget, UnzipBudget, unzipLimited, ZipTooLargeError } from './unzip-limited';

export { ZIP_TOO_LARGE, ZipTooLargeError } from './unzip-limited';

/** Version control, editor settings, dependencies and builds: not the student's work, and they may hold names. */
const DROPPED_FOLDERS = new Set(['.git', '.svn', '__MACOSX', '.idea', '.vscode', 'node_modules', 'vendor', 'dist', 'build']);
const DROPPED_FILES = new Set(['.DS_Store', 'Thumbs.db']);
const MANIFESTS = new Set(['package.json', 'composer.json']);
/** Who wrote it, and the links and contacts that usually carry their account name. */
const AUTHOR_FIELDS = ['author', 'contributors', 'maintainers', 'authors', 'repository', 'homepage', 'bugs', 'funding', 'support'];
/** 1 January 1980, the earliest date a ZIP can hold, so no entry tells when it was written. */
const NO_DATE = new Date(1980, 0, 1);

/**
 * Cleans a ZIP of source code (D-032). Refused before unpacking when its directory, or that of a
 * document inside it, announces more than 200 MB or 20,000 entries in all. Names written inside the code stay: the student is warned.
 */
export async function cleanZip(file: Buffer): Promise<Buffer> {
  // The documents inside are unpacked from the same budget as the archive itself.
  const budget = newBudget();
  const unpacked = unzipLimited(file, budget, (entry) => {
    const parts = slashes(entry.name).split('/');
    return !parts.slice(0, -1).some((part) => DROPPED_FOLDERS.has(part)) && !DROPPED_FILES.has(parts.at(-1)!) && !entry.name.match(/[/\\]$/);
  });
  // Archives made on Windows may separate folders with a backslash.
  const files = Object.fromEntries(Object.entries(unpacked).map(([name, content]) => [slashes(name), content]));

  const paths = Object.keys(files);
  const tops = new Set(paths.map((path) => path.split('/')[0]));
  const top = tops.size === 1 && paths.every((path) => path.includes('/')) ? [...tops][0] : null;

  const cleaned: Zippable = {};
  for (const path of paths) {
    const name = top ? `proiect/${path.slice(top.length + 1)}` : path;
    cleaned[name] = [await cleanEntry(path, files[path], budget), { mtime: NO_DATE }];
  }
  return Buffer.from(zipSync(cleaned));
}

function slashes(name: string): string {
  return name.replace(/\\/g, '/');
}

async function cleanEntry(path: string, content: Uint8Array, budget: UnzipBudget): Promise<Uint8Array> {
  if (MANIFESTS.has(path.split('/').at(-1)!)) {
    try {
      const manifest = JSON.parse(strFromU8(content)) as Record<string, unknown>;
      for (const field of AUTHOR_FIELDS) delete manifest[field];
      return strToU8(JSON.stringify(manifest, null, 2));
    } catch {
      return content;
    }
  }
  const buffer = Buffer.from(content);
  const type = detectFileType(buffer);
  try {
    if (type === 'pdf') return new Uint8Array(await cleanPdf(buffer));
    if (type === 'docx' || type === 'pptx') return new Uint8Array(cleanOffice(buffer, budget));
    if (type === 'odt' || type === 'odp') return new Uint8Array(cleanOpenDocument(buffer, budget));
  } catch (error) {
    if (error instanceof ZipTooLargeError) throw error;
    // A document inside that cannot be read is kept as it is, like any other file.
  }
  return content;
}
