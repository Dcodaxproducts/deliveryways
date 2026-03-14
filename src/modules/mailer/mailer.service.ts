import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: Transporter;
  private readonly fromAddress: string;

  constructor(private readonly configService: ConfigService) {
    this.fromAddress = this.configService.get<string>(
      'MAIL_FROM_ADDRESS',
      'no-reply@deliveryways.app',
    );

    const emailEnabled = this.isEmailEnabled();

    if (!emailEnabled) {
      this.transporter = nodemailer.createTransport({
        jsonTransport: true,
      });
      return;
    }

    const host = this.configService.get<string>('MAIL_HOST');
    const port = Number(this.configService.get<string>('MAIL_PORT', '465'));
    const username = this.configService.get<string>('MAIL_USERNAME');
    const password = this.configService.get<string>('MAIL_PASSWORD');
    const encryption = this.configService.get<string>('MAIL_ENCRYPTION', 'ssl');

    if (!host || !username || !password) {
      this.logger.error(
        'EMAIL_ENABLED=true but MAIL_HOST / MAIL_USERNAME / MAIL_PASSWORD is missing',
      );
      this.transporter = nodemailer.createTransport({
        jsonTransport: true,
      });
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: encryption.toLowerCase() === 'ssl' || port === 465,
      auth: {
        user: username,
        pass: password,
      },
    });

    this.logger.log(
      `Email service enabled via SMTP (${host}:${port}, encryption=${encryption})`,
    );
  }

  private isEmailEnabled(): boolean {
    return this.configService.get<string>('EMAIL_ENABLED', 'false') === 'true';
  }

  async sendEmail(to: string, subject: string, text: string): Promise<void> {
    if (!this.isEmailEnabled()) {
      this.logger.warn(
        `EMAIL_ENABLED=false, using json transport for email to ${to}`,
      );
    }

    await this.transporter.sendMail({
      to,
      from: this.fromAddress,
      subject,
      text,
    });

    this.logger.log(`Email queued for ${to} with subject "${subject}"`);
  }

  async sendVerificationEmail(email: string, otp: string): Promise<void> {
    await this.sendEmail(
      email,
      'Verify your account',
      `Your OTP code is: ${otp}. It expires in 10 minutes.`,
    );
  }

  async sendPasswordResetEmail(email: string, otp: string): Promise<void> {
    await this.sendEmail(
      email,
      'Reset your password',
      `Your password reset OTP is: ${otp}. It expires in 10 minutes.`,
    );
  }
}
