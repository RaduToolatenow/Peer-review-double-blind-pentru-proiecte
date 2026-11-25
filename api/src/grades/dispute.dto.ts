import { IsBoolean, IsInt, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * D-027: a dispute names the reviewer by their number on the results page and the criterion by
 * its position, never by id (D-014). The argument's length is checked by the database.
 */
export class DisputeDto {
  @IsInt({ message: 'Alege evaluarea contestată.' })
  reviewer!: number;

  @IsInt({ message: 'Alege criteriul contestat.' })
  criterion!: number;

  @IsString({ message: 'Scrie un argument de cel puțin 20 de caractere.' })
  argument!: string;
}

/** D-027: the professor's decision; upheld needs the corrected level of the disputed criterion. */
export class DecisionDto {
  @IsBoolean({ message: 'Alege dacă admiți sau respingi contestația.' })
  upheld!: boolean;

  @IsOptional()
  @IsUUID('all', { message: 'Alege nivelul corect pentru acest criteriu.' })
  levelId?: string;

  @IsString({ message: 'Scrie o decizie de cel puțin 20 de caractere.' })
  decision!: string;
}
