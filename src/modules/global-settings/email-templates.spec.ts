import { BadRequestException } from '@nestjs/common';
import {
  DEFAULT_CUSTOMER_EMAIL_TEMPLATES,
  normalizeCustomerEmailTemplates,
  renderEmailTemplateText,
  resolveCustomerEmailLocale,
  validateCustomerEmailTemplates,
} from './email-templates';

describe('customer email templates', () => {
  it('fills missing legacy settings with localized defaults', () => {
    const templates = normalizeCustomerEmailTemplates({
      verification: {
        de: { subject: 'Eigener Betreff', body: 'Code: {{otp}}' },
      },
    });

    expect(templates.verification.de.subject).toBe('Eigener Betreff');
    expect(templates.verification.en).toEqual(
      DEFAULT_CUSTOMER_EMAIL_TEMPLATES.verification.en,
    );
    expect(templates.orderConfirmation.de.subject).toContain('{{orderNumber}}');
  });

  it('rejects placeholders outside the event allowlist', () => {
    const templates = normalizeCustomerEmailTemplates({});
    templates.verification.de.body = 'Hallo {{password}}';

    expect(() => validateCustomerEmailTemplates(templates)).toThrow(
      BadRequestException,
    );
  });

  it('renders known variables and removes missing optional values', () => {
    expect(
      renderEmailTemplateText(
        '{{buyerName}}: {{amount}} {{currency}} {{message}}',
        {
          buyerName: 'Anna',
          amount: '25.00',
          currency: 'EUR',
          message: null,
        },
      ),
    ).toBe('Anna: 25.00 EUR ');
  });

  it('uses requested locale, then platform default, then German', () => {
    expect(resolveCustomerEmailLocale('en', 'de')).toBe('en');
    expect(resolveCustomerEmailLocale('fr', 'en')).toBe('en');
    expect(resolveCustomerEmailLocale(undefined, 'fr')).toBe('de');
  });
});
