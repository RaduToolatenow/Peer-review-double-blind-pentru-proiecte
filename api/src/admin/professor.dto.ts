import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const email = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);
const EMAIL_MESSAGE = 'Introdu o adresă de email validă.';

/** D-034: a professor the admin adds; any email domain, unlike a student's sign-up (D-010). */
export class ProfessorDto {
  @Transform(email)
  @IsString({ message: EMAIL_MESSAGE })
  @IsEmail({}, { message: EMAIL_MESSAGE })
  @MaxLength(200, { message: EMAIL_MESSAGE })
  email!: string;

  @Transform(trim)
  @IsString({ message: 'Introdu numele profesorului.' })
  @IsNotEmpty({ message: 'Introdu numele profesorului.' })
  @MaxLength(100, { message: 'Numele are cel mult 100 de caractere.' })
  fullName!: string;
}
