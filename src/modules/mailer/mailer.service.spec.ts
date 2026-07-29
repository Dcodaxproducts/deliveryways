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
});
