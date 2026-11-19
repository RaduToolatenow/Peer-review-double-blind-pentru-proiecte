import * as argon2 from 'argon2';

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

let unknownUserHash: Promise<string> | undefined;

/** A hash no password matches, checked for unknown emails so they take as long as a wrong password (D-017). */
export function hashForUnknownUser(): Promise<string> {
  unknownUserHash ??= hashPassword(crypto.randomUUID());
  return unknownUserHash;
}
