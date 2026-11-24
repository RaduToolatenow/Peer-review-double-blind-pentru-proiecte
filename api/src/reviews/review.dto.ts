import { Transform, Type } from 'class-transformer';
import { IsArray, IsString, IsUUID, ValidateNested } from 'class-validator';

/** The one message for any incomplete or invalid answer; the database holds the rules (D-023). */
export const INVALID_REVIEW = 'Alege un nivel și scrie cel puțin 20 de caractere la fiecare criteriu.';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ScoreDto {
  @IsUUID('all', { message: INVALID_REVIEW })
  criterionId!: string;

  @IsUUID('all', { message: INVALID_REVIEW })
  levelId!: string;

  @Transform(trim)
  @IsString({ message: INVALID_REVIEW })
  feedback!: string;
}

/** A whole review, sent once (D-023). */
export class ReviewDto {
  @IsArray({ message: INVALID_REVIEW })
  @ValidateNested({ each: true })
  @Type(() => ScoreDto)
  scores!: ScoreDto[];
}
