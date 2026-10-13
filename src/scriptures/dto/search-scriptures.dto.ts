import { IsNotEmpty, IsString, IsOptional, IsInt, Min, Max, MinLength, MaxLength } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class SearchScripturesDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'query must be a string' })
  @IsNotEmpty({ message: 'query cannot be empty' })
  @MinLength(2, { message: 'query must be at least 2 characters long' })
  @MaxLength(500, { message: 'query cannot exceed 500 characters' })
  query: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be at least 1' })
  @Max(10, { message: 'limit cannot exceed 10' })
  limit?: number = 5;

  @IsOptional()
  @IsString({ message: 'language must be a string (e.g. "en")' })
  language?: string;
}
