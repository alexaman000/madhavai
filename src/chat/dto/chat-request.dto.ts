import { IsNotEmpty, IsString, MaxLength, IsOptional, IsInt, Min, Max, IsArray } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class ChatRequestDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'message must be a string' })
  @IsNotEmpty({ message: 'message cannot be empty' })
  @MaxLength(1000, { message: 'message cannot exceed 1000 characters' })
  message: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be at least 1' })
  @Max(10, { message: 'limit cannot exceed 10' })
  limit?: number;

  @IsOptional()
  @IsString({ message: 'language must be a string' })
  language?: string;

  @IsOptional()
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;

  @IsOptional()
  @IsArray()
  clientMemories?: string[];
}
