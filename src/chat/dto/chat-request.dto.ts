import { IsNotEmpty, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class ChatRequestDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'message must be a string' })
  @IsNotEmpty({ message: 'message cannot be empty' })
  message: string;
}
