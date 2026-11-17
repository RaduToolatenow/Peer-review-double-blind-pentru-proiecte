/**
 * The database enforces the rubric and class rules (D-011 to D-013) with constraints and
 * triggers. These helpers recognise those errors so routes can answer 409 with a clear message.
 */

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function codeOf(error: unknown): string | undefined {
  const code = (error as { code?: unknown })?.code;
  return typeof code === 'string' ? code : undefined;
}

export function isUniqueViolation(error: unknown): boolean {
  return codeOf(error) === 'P2002' || messageOf(error).includes('duplicate key');
}

export function isForeignKeyViolation(error: unknown): boolean {
  return codeOf(error) === 'P2003' || messageOf(error).includes('violates foreign key constraint');
}

export function isLockedRubric(error: unknown): boolean {
  return messageOf(error).includes('rubric is locked');
}

export function isArchivedRubric(error: unknown): boolean {
  return messageOf(error).includes('rubric is archived');
}

/** The date from "cannot archive rubric before <timestamp>", or null for any other error. */
export function archiveAllowedFrom(error: unknown): Date | null {
  const match = /cannot archive rubric before (\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d+)?)([+-]\d\d)(?::?(\d\d))?/.exec(
    messageOf(error),
  );
  if (!match) {
    return null;
  }
  const [, local, hours, minutes = '00'] = match;
  return new Date(`${local.replace(' ', 'T')}${hours}:${minutes}`);
}
