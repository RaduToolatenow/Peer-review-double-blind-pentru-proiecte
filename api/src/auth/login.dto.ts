import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Introdu o adresă de email validă.' })
  email!: string;

  @IsString({ message: 'Introdu parola.' })
  @IsNotEmpty({ message: 'Introdu parola.' })
  @MaxLength(200, { message: 'Parola are cel mult 200 de caractere.' })
  password!: string;
}
