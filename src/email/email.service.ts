import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resendClient: Resend | null = null;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    const isApiKeyConfigured = Boolean(apiKey && apiKey.startsWith('re_'));
    const isFromEmailConfigured = Boolean(process.env.RESEND_FROM_EMAIL);

    this.logger.log(`[EMAIL_CONFIG] RESEND_API_KEY configured: ${isApiKeyConfigured}`);
    this.logger.log(`[EMAIL_CONFIG] RESEND_FROM_EMAIL configured: ${isFromEmailConfigured}`);

    if (isApiKeyConfigured) {
      try {
        this.resendClient = new Resend(apiKey);
        this.logger.log(`📧 Resend Email Service initialized.`);
      } catch (err: any) {
        this.logger.error(`[RESEND INIT ERROR] Failed to initialize Resend client: ${err.message}`);
      }
    } else {
      this.logger.warn(`⚠️ RESEND_API_KEY missing or invalid.`);
    }
  }

  async sendOtpEmail(toEmail: string, otp: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const from = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
    const subject = 'Your Madhav.ai verification code';
    const expiryMinutes = process.env.OTP_EXPIRY_MINUTES || '15';

    // Mask recipient email for safe logging (e.g. a***@gmail.com)
    const maskedEmail = toEmail.replace(/^(.)(.*)(@.*)$/, (_, p1, p2, p3) => `${p1}***${p3}`);

    this.logger.log(`[AUTH] Attempting Resend API call for ${maskedEmail}`);

    if (!this.resendClient) {
      this.logger.error(`[RESEND ERROR] Resend client is not initialized.`);
      return { success: false, error: 'Resend client not configured.' };
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Madhav.ai Verification Code</title>
      </head>
      <body style="font-family: Arial, sans-serif; background-color: #0e1320; color: #fdfbf7; margin: 0; padding: 24px;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #141c2e; border: 1px solid rgba(246,177,88,0.3); border-radius: 16px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #f6b158; font-size: 28px; margin: 0; font-weight: 800;">madhav.ai</h1>
            <p style="color: #94a3b8; font-size: 14px; margin-top: 4px;">AI Spiritual Companion</p>
          </div>

          <h2 style="font-size: 20px; font-weight: 700; color: #ffffff; text-align: center;">Verification Code</h2>
          <p style="color: #cbd5e1; font-size: 14px; text-align: center;">Use the code below to complete your sign-in to Madhav.ai:</p>

          <div style="background-color: #0e1320; border: 2px dashed #f6b158; border-radius: 12px; padding: 18px; text-align: center; margin: 24px 0;">
            <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #f6b158; font-family: monospace;">${otp}</span>
          </div>

          <p style="color: #94a3b8; font-size: 13px; text-align: center;">This code expires in <strong>${expiryMinutes} minutes</strong>.</p>
          <hr style="border: 0; border-top: 1px solid #1e293b; margin: 24px 0;">
          <p style="color: #64748b; font-size: 12px; text-align: center; margin: 0;">
            If you did not request this code, you can safely ignore this email.<br>
            Do not share this code with anyone.
          </p>
        </div>
      </body>
      </html>
    `;

    try {
      const result = await this.resendClient.emails.send({
        from,
        to: toEmail,
        subject,
        html: htmlContent,
      });

      this.logger.log(`[AUTH] Resend API response received for ${maskedEmail}`);

      if (result.error) {
        this.logger.error(`[RESEND ERROR] status: ${result.error.name}, message: ${result.error.message}`);
        return { success: false, error: result.error.message };
      }

      if (result.data && result.data.id) {
        this.logger.log(`[RESEND] Email accepted. Message ID: ${result.data.id}`);
        return { success: true, messageId: result.data.id };
      }

      return { success: false, error: 'No message ID returned by Resend.' };
    } catch (err: any) {
      this.logger.error(`[RESEND EXCEPTION] ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}
