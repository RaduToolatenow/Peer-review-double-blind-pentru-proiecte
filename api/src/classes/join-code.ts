import { randomInt } from 'node:crypto';

// No 0/O or 1/I, so a code read aloud or copied from paper is not mistaken.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A team join code such as K7P-4QX (D-012). */
export function newJoinCode(): string {
  const pick = () => ALPHABET[randomInt(ALPHABET.length)];
  const part = () => pick() + pick() + pick();
  return `${part()}-${part()}`;
}
