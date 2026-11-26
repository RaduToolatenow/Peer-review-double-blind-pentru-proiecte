import { COMMON_PASSWORDS } from './common-passwords';

export const WEAK_PASSWORD = 'Alege o parolă mai greu de ghicit: nu una des folosită și nu numele din adresa ta de email.';

const COMMON = new Set(COMMON_PASSWORDS.split('\n'));

/**
 * D-030: the message for a new password that is easy to guess, or null. Ignoring case: a common
 * password, one repeated character, or the email's name part or one of its pieces (split on . _ -),
 * each counted only when it has at least 4 characters. It depends only on what was typed, so it reveals no account (D-020).
 */
export function weakPassword(password: string, email: string): string | null {
  const lower = password.toLowerCase();
  const name = email.toLowerCase().split('@')[0];
  const pieces = [name, ...name.split(/[._-]/)].filter((piece) => piece.length >= 4);
  if (COMMON.has(lower) || /^(.)\1*$/su.test(lower) || pieces.some((piece) => lower.includes(piece))) {
    return WEAK_PASSWORD;
  }
  return null;
}
