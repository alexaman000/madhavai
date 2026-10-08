import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { DatabaseService } from '../database/database.service';
import { EmailService } from '../email/email.service';
import { UsersService } from '../users/users.service';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly emailService: EmailService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  // Helper method for secure SHA-256 OTP hashing
  private hashOtp(otp: string): string {
    const salt = process.env.JWT_SECRET || 'madhav_otp_salt_2026';
    return crypto.createHash('sha256').update(otp + salt).digest('hex');
  }

  async requestOtp(dto: RequestOtpDto) {
    const email = dto.email.toLowerCase().trim();
    const maskedEmail = email.replace(/^(.)(.*)(@.*)$/, (_, p1, p2, p3) => `${p1}***${p3}`);

    this.logger.log(`[AUTH] OTP request received for ${maskedEmail}`);

    // Check optional email domain restriction
    const allowedDomain = process.env.AUTH_ALLOWED_EMAIL_DOMAIN;
    if (allowedDomain && allowedDomain.trim() !== '') {
      const domain = allowedDomain.trim().toLowerCase();
      if (!email.endsWith(`@${domain}`)) {
        throw new BadRequestException(`Only @${domain} email addresses are allowed.`);
      }
    }
    this.logger.log(`[AUTH] Email validation passed`);

    // Check resend cooldown
    const cooldownSeconds = parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS || '60', 10);
    const existingOtp = await this.db.findLatestOtpForEmail(email);

    if (existingOtp && existingOtp.last_sent_at) {
      const lastSentTime = new Date(existingOtp.last_sent_at).getTime();
      const elapsedSeconds = (Date.now() - lastSentTime) / 1000;

      if (elapsedSeconds < cooldownSeconds) {
        const remaining = Math.ceil(cooldownSeconds - elapsedSeconds);
        throw new BadRequestException(
          `Please wait ${remaining} seconds before requesting another verification code.`,
        );
      }
    }

    // Generate cryptographically secure 6-digit OTP
    const rawOtp = crypto.randomInt(100000, 1000000).toString();
    this.logger.log(`[AUTH] OTP generated`);

    const otpHash = this.hashOtp(rawOtp);
    this.logger.log(`[AUTH] OTP hash created`);

    // Call Resend API
    const resendResult = await this.emailService.sendOtpEmail(email, rawOtp);

    if (!resendResult.success) {
      this.logger.error(`[AUTH] Resend API call failed for ${maskedEmail}: ${resendResult.error}`);
      throw new BadRequestException(
        resendResult.error && resendResult.error.includes('testing emails')
          ? `Resend Free Domain Restriction: You can only send testing emails to alexaman000r@gmail.com until a custom domain is verified at resend.com/domains.`
          : 'Unable to send verification code. Please check recipient email or try again.',
      );
    }

    // Calculate expiration & store in DB ONLY after email is accepted by Resend
    const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES || '15', 10);
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    await this.db.createOtpRecord(email, otpHash, expiresAt);
    this.logger.log(`[AUTH] OTP database record created for ${maskedEmail}`);

    return {
      success: true,
      message: 'Verification code has been sent successfully.',
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const email = dto.email.toLowerCase().trim();
    const userOtp = dto.otp.trim();

    const latestOtpRecord = await this.db.findLatestOtpForEmail(email);

    if (!latestOtpRecord) {
      throw new BadRequestException('Invalid or expired verification code.');
    }

    const maxAttempts = parseInt(process.env.MAX_OTP_ATTEMPTS || '5', 10);
    if (latestOtpRecord.attempts >= maxAttempts) {
      await this.db.markOtpInvalidated(latestOtpRecord.id);
      throw new BadRequestException(
        'Too many attempts. Please request a new verification code.',
      );
    }

    const now = new Date();
    const expiresAt = new Date(latestOtpRecord.expires_at);

    if (now > expiresAt) {
      await this.db.markOtpInvalidated(latestOtpRecord.id);
      throw new BadRequestException('Invalid or expired verification code.');
    }

    const inputHash = this.hashOtp(userOtp);
    if (inputHash !== latestOtpRecord.otp_hash) {
      await this.db.incrementOtpAttempts(latestOtpRecord.id);
      throw new BadRequestException('Invalid or expired verification code.');
    }

    // Mark OTP as consumed & verified
    await this.db.markOtpConsumed(latestOtpRecord.id);

    // Find or create user
    let user = await this.usersService.findByEmail(email);
    if (!user) {
      user = await this.usersService.createUser(email);
    } else {
      await this.usersService.updateLastLogin(user.id);
    }

    // Issue JWT Access Token
    const payload = { sub: user.id, email: user.email };
    const accessToken = this.jwtService.sign(payload);

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        isVerified: user.is_verified,
      },
      accessToken,
    };
  }

  async getMe(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found.');
    }
    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isVerified: user.is_verified,
        createdAt: user.created_at,
        lastLoginAt: user.last_login_at,
      },
    };
  }

  async logout() {
    return {
      success: true,
      message: 'Logged out successfully.',
    };
  }
}
