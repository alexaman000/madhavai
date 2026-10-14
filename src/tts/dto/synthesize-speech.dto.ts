import { IsNotEmpty, IsOptional, IsString, MaxLength, IsNumber, Min, Max } from 'class-validator';

export class SynthesizeSpeechDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2500)
  text: string;

  @IsString()
  @IsOptional()
  language?: string; // 'hi-IN' | 'en-IN'

  @IsString()
  @IsOptional()
  speaker?: string; // 'advait' | 'kabir' | 'dev' | 'shubh'

  @IsString()
  @IsOptional()
  model?: string; // 'bulbul:v3' | 'bulbul:v4-flash'

  @IsNumber()
  @IsOptional()
  @Min(0.5)
  @Max(2.0)
  pace?: number;

  @IsNumber()
  @IsOptional()
  @Min(0.01)
  @Max(1.0)
  temperature?: number;
}
