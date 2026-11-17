import { BadRequestException, ConflictException } from '@nestjs/common';

export interface Deadlines {
  submissionDeadline: Date;
  reviewDeadline: Date;
  disputeDeadline: Date;
}

const LABELS: Record<keyof Deadlines, string> = {
  submissionDeadline: 'predare',
  reviewDeadline: 'evaluare',
  disputeDeadline: 'contestații',
};

export const DEADLINE_KEYS = Object.keys(LABELS) as (keyof Deadlines)[];

/** Romanian date and time in the professor's time zone, for messages. */
export function formatRo(date: Date): string {
  return new Intl.DateTimeFormat('ro-RO', {
    timeZone: 'Europe/Bucharest',
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(date);
}

/** New deadlines are in the future and in order: submission, review, disputes. */
export function checkNewDeadlines(deadlines: Deadlines, changed: readonly (keyof Deadlines)[], now: Date): void {
  if (changed.some((key) => deadlines[key] <= now)) {
    throw new BadRequestException('Termenele trebuie să fie în viitor.');
  }
  if (!(deadlines.submissionDeadline < deadlines.reviewDeadline && deadlines.reviewDeadline < deadlines.disputeDeadline)) {
    throw new BadRequestException('Termenele sunt în ordinea: predare, evaluare, contestații.');
  }
}

/** A deadline that has passed can no longer be changed. */
export function checkDeadlinesStillOpen(current: Deadlines, changed: readonly (keyof Deadlines)[], now: Date): void {
  const passed = changed.find((key) => current[key] <= now);
  if (passed) {
    throw new ConflictException(`Termenul de ${LABELS[passed]} a trecut și nu se mai poate schimba.`);
  }
}
