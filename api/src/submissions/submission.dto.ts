import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** The text fields of the multipart upload; the file comes separately. */
export class SubmissionDto {
  @Transform(trim)
  @IsString({ message: 'Introdu linkul proiectului.' })
  @IsNotEmpty({ message: 'Introdu linkul proiectului.' })
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { message: 'Linkul începe cu http:// sau https://.' })
  @MaxLength(2000, { message: 'Linkul are cel mult 2000 de caractere.' })
  link!: string;

  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'Descrierea este text.' })
  @MaxLength(2000, { message: 'Descrierea are cel mult 2000 de caractere.' })
  description?: string;
}

/** The uploaded file as multer keeps it in memory. */
export interface UploadedFileData {
  buffer: Buffer;
  size: number;
}
