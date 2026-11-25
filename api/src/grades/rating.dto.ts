import { IsInt } from 'class-validator';

/** D-028: the professor's 1–5 rating of a review's feedback; the range is checked by the database. */
export class RatingDto {
  @IsInt({ message: 'Alege o notă de la 1 la 5.' })
  rating!: number;
}
