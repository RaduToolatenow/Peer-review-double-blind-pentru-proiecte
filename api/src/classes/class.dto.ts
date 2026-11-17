import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ClassDto {
  @Transform(trim)
  @IsString({ message: 'Introdu numele clasei.' })
  @IsNotEmpty({ message: 'Introdu numele clasei.' })
  @MaxLength(200, { message: 'Numele clasei are cel mult 200 de caractere.' })
  name!: string;
}

export class TeamDto {
  @Transform(trim)
  @IsString({ message: 'Introdu numele echipei.' })
  @IsNotEmpty({ message: 'Introdu numele echipei.' })
  @MaxLength(200, { message: 'Numele echipei are cel mult 200 de caractere.' })
  name!: string;

  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'Membrii se scriu ca text.' })
  @MaxLength(1000, { message: 'Lista de membri are cel mult 1000 de caractere.' })
  memberNames?: string;
}

export class UpdateTeamDto {
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'Introdu numele echipei.' })
  @IsNotEmpty({ message: 'Introdu numele echipei.' })
  @MaxLength(200, { message: 'Numele echipei are cel mult 200 de caractere.' })
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'Membrii se scriu ca text.' })
  @MaxLength(1000, { message: 'Lista de membri are cel mult 1000 de caractere.' })
  memberNames?: string;
}

export class JoinTeamDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString({ message: 'Introdu codul echipei.' })
  @IsNotEmpty({ message: 'Introdu codul echipei.' })
  @MaxLength(20, { message: 'Codul nu există. Verifică-l sau cere-i profesorului unul nou.' })
  code!: string;
}
