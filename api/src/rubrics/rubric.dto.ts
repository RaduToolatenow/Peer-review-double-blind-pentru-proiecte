import { BadRequestException } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const MAX_CRITERIA = 100;
const MAX_LEVELS = 10;

export interface LevelInput {
  score: number;
  descriptor: string;
}

export interface CriterionInput {
  title: string;
  weight: number;
  levels: LevelInput[];
}

export class RubricDto {
  @Transform(trim)
  @IsString({ message: 'Introdu titlul grilei.' })
  @IsNotEmpty({ message: 'Introdu titlul grilei.' })
  @MaxLength(200, { message: 'Titlul grilei are cel mult 200 de caractere.' })
  title!: string;

  // Each criterion is checked by checkCriteria, which names the criterion in its messages.
  @IsArray({ message: 'Criteriile lipsesc.' })
  @ArrayMaxSize(MAX_CRITERIA, { message: `O grilă are cel mult ${MAX_CRITERIA} de criterii.` })
  criteria!: CriterionInput[];
}

function isText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
}

function isIntBetween(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
}

/** Validates the criteria of a rubric and returns them trimmed. Throws 400 with the first problem. */
export function checkCriteria(criteria: unknown[]): CriterionInput[] {
  return criteria.map((raw, index) => {
    const n = index + 1;
    const criterion = (raw ?? {}) as Partial<CriterionInput>;
    if (!isText(criterion.title, 200)) {
      throw new BadRequestException(`Criteriul ${n}: introdu denumirea (cel mult 200 de caractere).`);
    }
    if (!isIntBetween(criterion.weight, 1, 100)) {
      throw new BadRequestException(`Criteriul ${n}: ponderea este un număr întreg între 1 și 100.`);
    }
    const levels = Array.isArray(criterion.levels) ? criterion.levels : [];
    if (levels.length < 2) {
      throw new BadRequestException(`Fiecare criteriu are cel puțin 2 niveluri. Verifică criteriul ${n}.`);
    }
    if (levels.length > MAX_LEVELS) {
      throw new BadRequestException(`Un criteriu are cel mult ${MAX_LEVELS} niveluri. Verifică criteriul ${n}.`);
    }
    for (const level of levels) {
      if (!isIntBetween(level?.score, 0, 100)) {
        throw new BadRequestException(`Criteriul ${n}: nota unui nivel este un număr întreg între 0 și 100.`);
      }
      if (!isText(level?.descriptor, 2000)) {
        throw new BadRequestException(`Criteriul ${n}: descrie fiecare nivel (cel mult 2000 de caractere).`);
      }
    }
    if (new Set(levels.map((level) => level.score)).size !== levels.length) {
      throw new BadRequestException(`Nivelurile unui criteriu au note diferite. Verifică criteriul ${n}.`);
    }
    return {
      title: criterion.title.trim(),
      weight: criterion.weight,
      levels: levels.map((level) => ({ score: level.score, descriptor: level.descriptor.trim() })),
    };
  });
}

export class SendRubricDto {
  @IsUUID('all', { message: 'Alege clasa.' })
  classId!: string;

  @Transform(trim)
  @IsString({ message: 'Introdu titlul temei.' })
  @IsNotEmpty({ message: 'Introdu titlul temei.' })
  @MaxLength(200, { message: 'Titlul temei are cel mult 200 de caractere.' })
  title!: string;

  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'Descrierea este text.' })
  @MaxLength(5000, { message: 'Descrierea are cel mult 5000 de caractere.' })
  description?: string;

  @IsInt({ message: 'Fiecare proiect primește cel puțin o evaluare (k ≥ 1).' })
  @Min(1, { message: 'Fiecare proiect primește cel puțin o evaluare (k ≥ 1).' })
  k!: number;

  @IsISO8601({ strict: true }, { message: 'Introdu termenul de predare.' })
  submissionDeadline!: string;

  @IsISO8601({ strict: true }, { message: 'Introdu termenul de evaluare.' })
  reviewDeadline!: string;

  @IsISO8601({ strict: true }, { message: 'Introdu termenul de contestații.' })
  disputeDeadline!: string;

  @IsIn(['ALL', 'SELECTED'], { message: 'Alege cui se aplică grila.' })
  appliesTo!: 'ALL' | 'SELECTED';

  @IsOptional()
  @IsArray({ message: 'Alege echipele.' })
  @IsUUID('all', { each: true, message: 'Alege echipele.' })
  teamIds?: string[];
}
