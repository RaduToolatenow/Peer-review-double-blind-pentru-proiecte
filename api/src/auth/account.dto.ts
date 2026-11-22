import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const email = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

/** Exactly one @ and nothing after ulbsibiu.ro, so look-alike domains do not pass (D-010). */
export const UNIVERSITY_EMAIL = /^[^@\s]+@ulbsibiu\.ro$/;
const UNIVERSITY_MESSAGE = 'Folosește adresa de email de la universitate (@ulbsibiu.ro).';

class PasswordField {
  @IsString({ message: 'Parola are cel puțin 10 caractere.' })
  @MinLength(10, { message: 'Parola are cel puțin 10 caractere.' })
  @MaxLength(200, { message: 'Parola are cel mult 200 de caractere.' })
  password!: string;
}

export class RegisterDto extends PasswordField {
  @Transform(email)
  @IsString({ message: UNIVERSITY_MESSAGE })
  @Matches(UNIVERSITY_EMAIL, { message: UNIVERSITY_MESSAGE })
  @MaxLength(200, { message: UNIVERSITY_MESSAGE })
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  joinCode?: string;
}

export class EmailDto {
  @Transform(email)
  @IsString({ message: 'Introdu adresa de email.' })
  @IsNotEmpty({ message: 'Introdu adresa de email.' })
  @MaxLength(200, { message: 'Introdu adresa de email.' })
  email!: string;
}

export class TokenDto {
  @IsString({ message: 'Linkul nu mai este valid. Cere unul nou din pagina de autentificare.' })
  @IsNotEmpty({ message: 'Linkul nu mai este valid. Cere unul nou din pagina de autentificare.' })
  @MaxLength(200, { message: 'Linkul nu mai este valid. Cere unul nou din pagina de autentificare.' })
  token!: string;
}

export class ResetPasswordDto extends PasswordField {
  @IsString({ message: 'Linkul nu mai este valid. Cere unul nou din pagina de autentificare.' })
  @IsNotEmpty({ message: 'Linkul nu mai este valid. Cere unul nou din pagina de autentificare.' })
  @MaxLength(200, { message: 'Linkul nu mai este valid. Cere unul nou din pagina de autentificare.' })
  token!: string;
}
