import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';

export class VerifyOtpDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase().trim() : value))
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  @IsNotEmpty({ message: 'email cannot be empty' })
  email: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'OTP must be a string' })
  @Length(6, 6, { message: 'OTP must be 6 digits.' })
  @IsNotEmpty({ message: 'OTP cannot be empty' })
  otp: string;
}
