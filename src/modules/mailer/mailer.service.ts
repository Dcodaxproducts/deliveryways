import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { SendMailOptions, Transporter } from 'nodemailer';
import { GlobalSettingsService } from '../global-settings/global-settings.service';
import {
  CustomerEmailLocale,
  CustomerEmailTemplateKey,
  DEFAULT_CUSTOMER_EMAIL_TEMPLATES,
  renderEmailTemplateText,
  resolveCustomerEmailLocale,
} from '../global-settings/email-templates';

export interface TransactionalEmailInput {
  template: CustomerEmailTemplateKey;
  locale?: string | null;
  variables: Record<string, string | number | null | undefined>;
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: Transporter;
  private readonly fromAddress: string;

  constructor(
    private readonly configService: ConfigService,
    @Optional()
    private readonly globalSettingsService?: GlobalSettingsService,
  ) {
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
    const normalizedEncryption = encryption.toLowerCase();

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
      secure: normalizedEncryption === 'ssl' || port === 465,
      requireTLS: normalizedEncryption === 'tls',
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
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

  async verifyConnection(): Promise<void> {
    if (!this.isEmailEnabled()) {
      return;
    }

    await this.transporter.verify();
  }

  async sendEmail(
    to: string,
    subject: string,
    text: string,
    options?: Pick<SendMailOptions, 'attachments'>,
  ): Promise<void> {
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
      attachments: options?.attachments,
    });

    this.logger.log(`Email queued for ${to} with subject "${subject}"`);
  }

  async sendVerificationEmail(
    email: string,
    otp: string,
    locale?: string | null,
  ): Promise<void> {
    await this.sendTransactionalEmail(email, {
      template: 'verification',
      locale,
      variables: { otp, expiresMinutes: 10 },
    });
  }

  async sendPasswordResetEmail(
    email: string,
    otp: string,
    locale?: string | null,
  ): Promise<void> {
    await this.sendTransactionalEmail(email, {
      template: 'passwordReset',
      locale,
      variables: { otp, expiresMinutes: 10 },
    });
  }

  async renderTransactionalEmail(input: TransactionalEmailInput): Promise<{
    locale: CustomerEmailLocale;
    subject: string;
    body: string;
  }> {
    const configuration =
      await this.globalSettingsService?.getCustomerEmailConfiguration();
    const locale = resolveCustomerEmailLocale(
      input.locale,
      configuration?.defaultLanguage,
    );
    const template =
      configuration?.templates[input.template][locale] ??
      DEFAULT_CUSTOMER_EMAIL_TEMPLATES[input.template][locale];

    return {
      locale,
      subject: renderEmailTemplateText(template.subject, input.variables),
      body: renderEmailTemplateText(template.body, input.variables),
    };
  }

  async resolveTransactionalLocale(
    requestedLocale?: string | null,
  ): Promise<CustomerEmailLocale> {
    const configuration =
      await this.globalSettingsService?.getCustomerEmailConfiguration();
    return resolveCustomerEmailLocale(
      requestedLocale,
      configuration?.defaultLanguage,
    );
  }

  async sendTransactionalEmail(
    to: string,
    input: TransactionalEmailInput,
    options?: Pick<SendMailOptions, 'attachments'>,
  ): Promise<void> {
    const rendered = await this.renderTransactionalEmail(input);
    await this.sendEmail(to, rendered.subject, rendered.body, options);
  }

  resolveProfileLocale(metadata: unknown): string | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return null;
    }

    const locale = (metadata as Record<string, unknown>).locale;
    return typeof locale === 'string' ? locale : null;
  }
}
