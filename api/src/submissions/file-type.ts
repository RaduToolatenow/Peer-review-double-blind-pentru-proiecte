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

const MARKERS = new Set(['word/document.xml', 'ppt/presentation.xml', 'mimetype']);
const OPEN_DOCUMENT: Record<string, FileType> = {
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/vnd.oasis.opendocument.presentation': 'odp',
};

/**
 * Judged by the bytes and never by the file name; null for anything else (D-032). Inside a
 * ZIP container only the few marker entries are unpacked.
 */
export function detectFileType(file: Buffer): FileType | null {
  if (file.subarray(0, 5).toString('latin1') === '%PDF-') {
    return 'pdf';
  }
  if (!file.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    return null;
  }
  try {
    const found = unzipSync(new Uint8Array(file), { filter: (entry) => MARKERS.has(entry.name) && entry.originalSize < 1024 * 1024 });
    if (found['word/document.xml']) return 'docx';
    if (found['ppt/presentation.xml']) return 'pptx';
    if (found.mimetype) return OPEN_DOCUMENT[strFromU8(found.mimetype).trim()] ?? 'zip';
    return 'zip';
  } catch {
    return null;
  }
}
