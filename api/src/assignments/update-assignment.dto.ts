import { Transform } from 'class-transformer';
import { IsISO8601, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpdateAssignmentDto {
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'Introdu titlul temei.' })
  @IsNotEmpty({ message: 'Introdu titlul temei.' })
  @MaxLength(200, { message: 'Titlul temei are cel mult 200 de caractere.' })
  title?: string;

  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'Descrierea este text.' })
  @MaxLength(5000, { message: 'Descrierea are cel mult 5000 de caractere.' })
  description?: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Introdu termenul de predare.' })
  submissionDeadline?: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Introdu termenul de evaluare.' })
  reviewDeadline?: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Introdu termenul de contestații.' })
  disputeDeadline?: string;
}
