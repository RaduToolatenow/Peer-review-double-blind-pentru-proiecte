import { strFromU8, unzipSync } from 'fflate';

export type FileType = 'pdf' | 'docx' | 'pptx' | 'odt' | 'odp' | 'zip';

export const CONTENT_TYPES: Record<FileType, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  odp: 'application/vnd.oasis.opendocument.presentation',
  zip: 'application/zip',
};

/** D-032: at most 10 MB, a ZIP at most 20 MB. */
export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_ZIP_BYTES = 20 * 1024 * 1024;

const OPEN_DOCUMENT: Record<string, FileType> = {
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/vnd.oasis.opendocument.presentation': 'odp',
};

/**
 * Judged by the bytes and never by the file name; null for anything else (D-032). Inside a
 * ZIP container the entry names decide, and only a small `mimetype` entry is ever unpacked.
 */
export function detectFileType(file: Buffer): FileType | null {
  if (file.subarray(0, 5).toString('latin1') === '%PDF-') {
    return 'pdf';
  }
  if (!file.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    return null;
  }
  try {
    const names = new Set<string>();
    const found = unzipSync(new Uint8Array(file), {
      filter: (entry) => {
        names.add(entry.name);
        return entry.name === 'mimetype' && entry.originalSize < 1024;
      },
    });
    if (names.has('word/document.xml')) return 'docx';
    if (names.has('ppt/presentation.xml')) return 'pptx';
    if (found.mimetype) return OPEN_DOCUMENT[strFromU8(found.mimetype).trim()] ?? 'zip';
    return 'zip';
  } catch {
    return null;
  }
}
