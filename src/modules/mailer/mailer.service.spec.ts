import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MailerService } from './mailer.service';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

describe('MailerService', () => {
  const createTransport = jest.mocked(nodemailer.createTransport);

  beforeEach(() => {
    createTransport.mockReset();
    createTransport.mockReturnValue({
      sendMail: jest.fn(),
      verify: jest.fn(),
    } as never);
  });

  it('uses authenticated STARTTLS with bounded SMTP timeouts', () => {
    const config = new ConfigService({
      EMAIL_ENABLED: 'true',
      MAIL_HOST: 'smtp.example.com',
      MAIL_PORT: '587',
      MAIL_USERNAME: 'mailer@example.com',
      MAIL_PASSWORD: 'secret',
      MAIL_ENCRYPTION: 'tls',
      MAIL_FROM_ADDRESS: 'mailer@example.com',
    });

    new MailerService(config);

    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      requireTLS: true,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
      auth: {
        user: 'mailer@example.com',
        pass: 'secret',
      },
    });
  });

  it('keeps disabled email on the non-network JSON transport', () => {
    const config = new ConfigService({
      EMAIL_ENABLED: 'false',
    });

    new MailerService(config);

    expect(createTransport).toHaveBeenCalledWith({
      jsonTransport: true,
    });
  });

  it('renders German transactional email defaults for customers without a locale', async () => {
    const service = new MailerService(
      new ConfigService({ EMAIL_ENABLED: 'false' }),
    );

    const rendered = await service.renderTransactionalEmail({
      template: 'verification',
      variables: { otp: '123456', expiresMinutes: 10 },
    });

    expect(rendered).toEqual({
      locale: 'de',
      subject: 'Bestätigen Sie Ihr Konto',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      body: expect.stringContaining('123456'),
    });
  });

  it('renders an editable English template from global settings', async () => {
    const globalSettingsService = {
      getCustomerEmailConfiguration: jest.fn().mockResolvedValue({
        defaultLanguage: 'de',
        templates: {
          orderStatus: {
            de: { subject: 'Deutsch', body: 'Deutsch' },
            en: {
              subject: 'Order {{orderNumber}}',
              body: '{{status}} at {{branchName}}',
            },
          },
        },
      }),
    };
    const service = new MailerService(
      new ConfigService({ EMAIL_ENABLED: 'false' }),
      globalSettingsService as never,
    );

    const rendered = await service.renderTransactionalEmail({
      template: 'orderStatus',
      locale: 'en-US',
      variables: {
        orderNumber: 'DW-42',
        status: 'Ready',
        branchName: 'Central',
      },
    });

    expect(rendered).toEqual({
      locale: 'en',
      subject: 'Order DW-42',
      body: 'Ready at Central',
    });
  });
});
