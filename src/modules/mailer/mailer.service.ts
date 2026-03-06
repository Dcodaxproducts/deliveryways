import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter = nodemailer.createTransport({
    jsonTransport: true,
  });

  constructor(private readonly configService: ConfigService) {}

  private isEmailEnabled(): boolean {
    return this.configService.get<string>('EMAIL_ENABLED', 'false') === 'true';
  }

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    if (!this.isEmailEnabled()) {
      this.logger.warn(
        `EMAIL_ENABLED=false, skipping verification email to ${email}`,
      );
      return;
    }

    await this.transporter.sendMail({
      to: email,
      from: 'no-reply@deliveryways.app',
      subject: 'Verify your account',
      text: `Your verification token is: ${token}`,
    });

    this.logger.log(`Verification email queued for ${email}`);
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    if (!this.isEmailEnabled()) {
      this.logger.warn(
        `EMAIL_ENABLED=false, skipping password reset email to ${email}`,
      );
      return;
    }

    await this.transporter.sendMail({
      to: email,
      from: 'no-reply@deliveryways.app',
      subject: 'Reset your password',
      text: `Your password reset token is: ${token}`,
    });

    this.logger.log(`Password reset email queued for ${email}`);
  }
}
