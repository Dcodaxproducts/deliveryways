import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter = nodemailer.createTransport({
    jsonTransport: true,
  });

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    await this.transporter.sendMail({
      to: email,
      from: 'no-reply@deliveryways.app',
      subject: 'Verify your account',
      text: `Your verification token is: ${token}`,
    });

    this.logger.log(`Verification email queued for ${email}`);
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    await this.transporter.sendMail({
      to: email,
      from: 'no-reply@deliveryways.app',
      subject: 'Reset your password',
      text: `Your password reset token is: ${token}`,
    });

    this.logger.log(`Password reset email queued for ${email}`);
  }
}
