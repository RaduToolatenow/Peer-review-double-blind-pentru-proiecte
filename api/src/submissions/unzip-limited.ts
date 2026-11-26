import { unzipSync, Unzipped, UnzipFileInfo } from 'fflate';

export const ZIP_TOO_LARGE = 'Arhiva ZIP e prea mare după dezarhivare (cel mult 200 MB și 20.000 de fișiere).';
export const MAX_UNPACKED_BYTES = 200 * 1024 * 1024;
const MAX_ENTRIES = 20_000;

export class ZipTooLargeError extends Error {
  constructor() {
    super(ZIP_TOO_LARGE);
  }
}

/** What one upload may still unpack: a ZIP and the documents inside it share it (D-032). */
export interface UnzipBudget {
  bytes: number;
  entries: number;
}

export function newBudget(): UnzipBudget {
  return { bytes: MAX_UNPACKED_BYTES, entries: MAX_ENTRIES };
}

/**
 * Unzips only after the sizes the archive's directory announces fit the budget; refused
 * before anything is inflated otherwise. `keep` picks the entries to unpack.
 */
export function unzipLimited(file: Buffer, budget: UnzipBudget, keep: (entry: UnzipFileInfo) => boolean = () => true): Unzipped {
  return unzipSync(new Uint8Array(file), {
    filter: (entry) => {
      budget.bytes -= entry.originalSize;
      budget.entries -= 1;
      if (budget.bytes < 0 || budget.entries < 0) {
        throw new ZipTooLargeError();
      }
      return keep(entry);
    },
  });
}
