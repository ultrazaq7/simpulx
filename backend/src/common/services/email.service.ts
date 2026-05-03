// ============================================================
// Email Service - Brevo SMTP via Nodemailer
// ============================================================
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get('SMTP_HOST', 'smtp-relay.brevo.com'),
      port: this.config.get<number>('SMTP_PORT', 587),
      secure: false,
      auth: {
        user: this.config.get('SMTP_USER'),
        pass: this.config.get('SMTP_PASS'),
      },
    });
  }

  async sendPasswordReset(email: string, fullName: string, resetToken: string): Promise<void> {
    const appUrl = this.config.get('APP_URL', 'https://app.simpulx.com');
    const resetUrl = `${appUrl}/#/reset-password?token=${resetToken}`;

    await this.send(email, 'Reset Your Password - Simpulx', `
      <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 24px; background: #040F0D; color: #e6f4f0; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #2D8B73; font-size: 28px; font-weight: 700; margin: 0;">Simpulx</h1>
          <p style="color: #8bb8ad; font-size: 14px; margin-top: 4px;">Omnichannel WhatsApp Platform</p>
        </div>
        <h2 style="color: #f0f7f5; font-size: 20px; font-weight: 600; margin-bottom: 8px;">Hi ${fullName},</h2>
        <p style="color: #b8d4cd; line-height: 1.6; font-size: 15px;">We received a request to reset your password. Click the button below to create a new one.</p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #2D8B73, #3AA88D); color: white; text-decoration: none; padding: 14px 40px; border-radius: 10px; font-weight: 600; font-size: 15px;">Reset Password</a>
        </div>
        <p style="color: #7aa096; font-size: 13px; line-height: 1.5;">This link expires in 1 hour. If you did not request this, you can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #12342d; margin: 24px 0;" />
        <p style="color: #5d7f76; font-size: 12px; text-align: center;">&copy; ${new Date().getFullYear()} Simpulx. All rights reserved.</p>
      </div>
    `);
    this.logger.log(`Password reset email sent to ${email}`);
  }

  async sendInvitation(email: string, fullName: string, invitedBy: string, tempPassword: string): Promise<void> {
    const appUrl = this.config.get('APP_URL', 'https://app.simpulx.com');

    await this.send(email, 'You\'re Invited to Simpulx', `
      <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 24px; background: #040F0D; color: #e6f4f0; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #2D8B73; font-size: 28px; font-weight: 700; margin: 0;">Simpulx</h1>
          <p style="color: #8bb8ad; font-size: 14px; margin-top: 4px;">Omnichannel WhatsApp Platform</p>
        </div>
        <h2 style="color: #f0f7f5; font-size: 20px; font-weight: 600; margin-bottom: 8px;">Welcome, ${fullName}!</h2>
        <p style="color: #b8d4cd; line-height: 1.6; font-size: 15px;">${invitedBy} has invited you to join Simpulx. Here are your login credentials:</p>
        <div style="background: #08231e; border-radius: 12px; padding: 20px; margin: 24px 0;">
          <p style="color: #8bb8ad; font-size: 13px; margin: 0 0 8px;">Email</p>
          <p style="color: #f0f7f5; font-size: 15px; font-weight: 500; margin: 0 0 16px;">${email}</p>
          <p style="color: #8bb8ad; font-size: 13px; margin: 0 0 8px;">Temporary Password</p>
          <p style="color: #F5A623; font-size: 15px; font-weight: 600; margin: 0; font-family: monospace;">${tempPassword}</p>
        </div>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${appUrl}" style="display: inline-block; background: linear-gradient(135deg, #2D8B73, #3AA88D); color: white; text-decoration: none; padding: 14px 40px; border-radius: 10px; font-weight: 600; font-size: 15px;">Login to Simpulx</a>
        </div>
        <p style="color: #7aa096; font-size: 13px;">Please change your password after your first login.</p>
        <hr style="border: none; border-top: 1px solid #12342d; margin: 24px 0;" />
        <p style="color: #5d7f76; font-size: 12px; text-align: center;">&copy; ${new Date().getFullYear()} Simpulx. All rights reserved.</p>
      </div>
    `);
    this.logger.log(`Invitation email sent to ${email}`);
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: `"Simpulx" <${this.config.get('SMTP_FROM', 'noreply@simpulx.com')}>`,
        to,
        subject,
        html,
      });
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${error.message}`);
      throw error;
    }
  }
}
