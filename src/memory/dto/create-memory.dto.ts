import { IsNotEmpty, IsString, MaxLength, IsIn, IsOptional, IsBoolean } from 'class-validator';

export class CreateMemoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  content: string;

  @IsString()
  @IsIn(['PREFERENCE', 'CAREER', 'STUDIES', 'LIFE_GOAL', 'EMOTIONAL_CONTEXT'])
  category: 'PREFERENCE' | 'CAREER' | 'STUDIES' | 'LIFE_GOAL' | 'EMOTIONAL_CONTEXT';

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsBoolean()
  consent?: boolean;
}
