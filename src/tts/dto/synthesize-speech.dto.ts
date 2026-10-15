import { IsNotEmpty, IsOptional, IsString, MaxLength, IsNumber, Min, Max, IsBoolean } from 'class-validator';

export class SynthesizeSpeechDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  text: string;

  @IsString()
  @IsOptional()
  language?: string; // 'hi-IN' | 'en-IN'

  @IsString()
  @IsOptional()
  speaker?: string; // 'shubh' | 'ashutosh' | 'ratan' | 'dev' | 'kabir'

  @IsString()
  @IsOptional()
  model?: string; // 'bulbul:v3'

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

  @IsNumber()
  @IsOptional()
  chunkIndex?: number;

  @IsBoolean()
  @IsOptional()
  prepareOnly?: boolean;
}
