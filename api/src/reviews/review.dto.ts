import { BadRequestException } from '@nestjs/common';
import { IsArray, isUUID } from 'class-validator';

/** The one message for any incomplete or invalid answer; the database holds the rules (D-023). */
export const INVALID_REVIEW = 'Alege un nivel și scrie cel puțin 20 de caractere la fiecare criteriu.';

export interface ScoreInput {
  criterionId: string;
  levelId: string;
  feedback: string;
}

/** A whole review, sent once (D-023). */
export class ReviewDto {
  // Each score is checked by checkScores, like the criteria of a rubric.
  @IsArray({ message: INVALID_REVIEW })
  scores!: ScoreInput[];
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && isUUID(value);
}

/** Keeps only the score fields, trimmed; anything that is not a score answers 400 with the one message. */
export function checkScores(scores: unknown[]): ScoreInput[] {
  return scores.map((raw) => {
    const { criterionId, levelId, feedback } = (raw ?? {}) as Partial<ScoreInput>;
    if (!isId(criterionId) || !isId(levelId) || typeof feedback !== 'string') {
      throw new BadRequestException(INVALID_REVIEW);
    }
    return { criterionId, levelId, feedback: feedback.trim() };
  });
}
