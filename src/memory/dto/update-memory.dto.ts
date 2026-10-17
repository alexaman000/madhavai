import { IsOptional, IsString, MaxLength, IsIn } from 'class-validator';

export class UpdateMemoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  content?: string;

  @IsOptional()
  @IsString()
  @IsIn(['PREFERENCE', 'CAREER', 'STUDIES', 'LIFE_GOAL', 'EMOTIONAL_CONTEXT'])
  category?: 'PREFERENCE' | 'CAREER' | 'STUDIES' | 'LIFE_GOAL' | 'EMOTIONAL_CONTEXT';
}
