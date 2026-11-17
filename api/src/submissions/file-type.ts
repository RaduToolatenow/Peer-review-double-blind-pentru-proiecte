import { unzipSync } from 'fflate';

export type FileType = 'pdf' | 'docx';

export const CONTENT_TYPES: Record<FileType, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/** PDF or DOCX, judged by the bytes and never by the file name; null for anything else. */
export function detectFileType(file: Buffer): FileType | null {
  if (file.subarray(0, 5).toString('latin1') === '%PDF-') {
    return 'pdf';
  }
  if (file.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    try {
      const names = Object.keys(unzipSync(new Uint8Array(file), { filter: (entry) => entry.name === 'word/document.xml' }));
      return names.length > 0 ? 'docx' : null;
    } catch {
      return null;
    }
  }
  return null;
}
