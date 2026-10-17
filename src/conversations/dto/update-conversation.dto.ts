import { IsOptional, IsString, MaxLength, IsBoolean } from 'class-validator';

export class UpdateConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsBoolean()
  is_pinned?: boolean;
}
