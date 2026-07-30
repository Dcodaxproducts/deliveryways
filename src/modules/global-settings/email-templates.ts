import { BadRequestException } from '@nestjs/common';

export const CUSTOMER_EMAIL_TEMPLATE_KEYS = [
  'verification',
  'passwordReset',
  'orderConfirmation',
  'orderStatus',
  'paymentStatus',
  'giftCard',
] as const;

export const CUSTOMER_EMAIL_LOCALES = ['de', 'en'] as const;

export type CustomerEmailTemplateKey =
  (typeof CUSTOMER_EMAIL_TEMPLATE_KEYS)[number];
export type CustomerEmailLocale = (typeof CUSTOMER_EMAIL_LOCALES)[number];

export interface EmailTemplateText {
  subject: string;
  body: string;
}

export type CustomerEmailTemplates = Record<
  CustomerEmailTemplateKey,
  Record<CustomerEmailLocale, EmailTemplateText>
>;

export const CUSTOMER_EMAIL_TEMPLATE_VARIABLES: Record<
  CustomerEmailTemplateKey,
  readonly string[]
> = {
  verification: ['otp', 'expiresMinutes'],
  passwordReset: ['otp', 'expiresMinutes'],
  orderConfirmation: [
    'customerName',
    'orderNumber',
    'branchName',
    'orderType',
    'items',
    'subtotal',
    'taxAmount',
    'deliveryFee',
    'discountAmount',
    'totalAmount',
    'currency',
  ],
  orderStatus: ['customerName', 'orderNumber', 'branchName', 'status'],
  paymentStatus: [
    'customerName',
    'orderNumber',
    'branchName',
    'status',
    'amount',
    'currency',
  ],
  giftCard: [
    'buyerName',
    'buyerEmail',
    'title',
    'amount',
    'currency',
    'code',
    'expiresAt',
    'message',
  ],
};

export const DEFAULT_CUSTOMER_EMAIL_TEMPLATES: CustomerEmailTemplates = {
  verification: {
    de: {
      subject: 'Bestätigen Sie Ihr Konto',
      body: [
        'Ihr Bestätigungscode lautet: {{otp}}.',
        'Der Code ist {{expiresMinutes}} Minuten gültig.',
      ].join('\n'),
    },
    en: {
      subject: 'Verify your account',
      body: [
        'Your verification code is: {{otp}}.',
        'The code expires in {{expiresMinutes}} minutes.',
      ].join('\n'),
    },
  },
  passwordReset: {
    de: {
      subject: 'Passwort zurücksetzen',
      body: [
        'Ihr Code zum Zurücksetzen des Passworts lautet: {{otp}}.',
        'Der Code ist {{expiresMinutes}} Minuten gültig.',
      ].join('\n'),
    },
    en: {
      subject: 'Reset your password',
      body: [
        'Your password reset code is: {{otp}}.',
        'The code expires in {{expiresMinutes}} minutes.',
      ].join('\n'),
    },
  },
  orderConfirmation: {
    de: {
      subject: 'Bestellbestätigung {{orderNumber}}',
      body: [
        'Hallo {{customerName}},',
        '',
        'vielen Dank für Ihre Bestellung bei {{branchName}}.',
        'Bestellnummer: {{orderNumber}}',
        'Bestellart: {{orderType}}',
        '',
        'Bestellte Artikel:',
        '{{items}}',
        '',
        'Zwischensumme: {{subtotal}} {{currency}}',
        'Steuern: {{taxAmount}} {{currency}}',
        'Liefergebühr: {{deliveryFee}} {{currency}}',
        'Rabatt: -{{discountAmount}} {{currency}}',
        'Gesamtbetrag: {{totalAmount}} {{currency}}',
      ].join('\n'),
    },
    en: {
      subject: 'Order confirmation {{orderNumber}}',
      body: [
        'Hello {{customerName}},',
        '',
        'thank you for your order at {{branchName}}.',
        'Order number: {{orderNumber}}',
        'Order type: {{orderType}}',
        '',
        'Items:',
        '{{items}}',
        '',
        'Subtotal: {{subtotal}} {{currency}}',
        'Tax: {{taxAmount}} {{currency}}',
        'Delivery fee: {{deliveryFee}} {{currency}}',
        'Discount: -{{discountAmount}} {{currency}}',
        'Total: {{totalAmount}} {{currency}}',
      ].join('\n'),
    },
  },
  orderStatus: {
    de: {
      subject: 'Bestellstatus {{orderNumber}}: {{status}}',
      body: 'Hallo {{customerName}},\n\nIhre Bestellung {{orderNumber}} bei {{branchName}} hat jetzt den Status: {{status}}.',
    },
    en: {
      subject: 'Order {{orderNumber}} status: {{status}}',
      body: 'Hello {{customerName}},\n\nYour order {{orderNumber}} at {{branchName}} is now: {{status}}.',
    },
  },
  paymentStatus: {
    de: {
      subject: 'Zahlungsstatus für Bestellung {{orderNumber}}',
      body: 'Hallo {{customerName}},\n\nder Zahlungsstatus für Ihre Bestellung {{orderNumber}} bei {{branchName}} lautet {{status}}. Betrag: {{amount}} {{currency}}.',
    },
    en: {
      subject: 'Payment status for order {{orderNumber}}',
      body: 'Hello {{customerName}},\n\nthe payment status for order {{orderNumber}} at {{branchName}} is {{status}}. Amount: {{amount}} {{currency}}.',
    },
  },
  giftCard: {
    de: {
      subject:
        '{{buyerName}} hat Ihnen eine DeliveryWay-Geschenkkarte gesendet',
      body: [
        '{{title}}',
        '',
        '{{buyerName}} ({{buyerEmail}}) hat Ihnen eine Geschenkkarte gesendet.',
        'Wert: {{amount}} {{currency}}',
        'Geschenkkartencode: {{code}}',
        'Gültig bis: {{expiresAt}}',
        '',
        '{{message}}',
        '',
        'Verwenden Sie den Code beim Bezahlen oder in Ihrer DeliveryWay-Wallet.',
      ].join('\n'),
    },
    en: {
      subject: '{{buyerName}} sent you a DeliveryWay gift card',
      body: [
        '{{title}}',
        '',
        '{{buyerName}} ({{buyerEmail}}) sent you a gift card.',
        'Value: {{amount}} {{currency}}',
        'Gift card code: {{code}}',
        'Expires: {{expiresAt}}',
        '',
        '{{message}}',
        '',
        'Use the code at checkout or in your DeliveryWay wallet.',
      ].join('\n'),
    },
  },
};

const PLACEHOLDER_PATTERN = /{{\s*([A-Za-z0-9_]+)\s*}}/g;

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const readTemplateText = (
  source: unknown,
  fallback: EmailTemplateText,
): EmailTemplateText => {
  const record = asRecord(source);
  const subject =
    typeof record.subject === 'string' && record.subject.trim()
      ? record.subject.trim()
      : fallback.subject;
  const body =
    typeof record.body === 'string' && record.body.trim()
      ? record.body.trim()
      : fallback.body;

  return { subject, body };
};

export const normalizeCustomerEmailTemplates = (
  source: unknown,
): CustomerEmailTemplates => {
  const root = asRecord(source);

  return Object.fromEntries(
    CUSTOMER_EMAIL_TEMPLATE_KEYS.map((key) => {
      const template = asRecord(root[key]);
      return [
        key,
        Object.fromEntries(
          CUSTOMER_EMAIL_LOCALES.map((locale) => [
            locale,
            readTemplateText(
              template[locale],
              DEFAULT_CUSTOMER_EMAIL_TEMPLATES[key][locale],
            ),
          ]),
        ),
      ];
    }),
  ) as CustomerEmailTemplates;
};

export const validateCustomerEmailTemplates = (
  templates: CustomerEmailTemplates,
): void => {
  for (const key of CUSTOMER_EMAIL_TEMPLATE_KEYS) {
    const allowed = new Set(CUSTOMER_EMAIL_TEMPLATE_VARIABLES[key]);

    for (const locale of CUSTOMER_EMAIL_LOCALES) {
      const template = templates[key][locale];
      for (const value of [template.subject, template.body]) {
        for (const match of value.matchAll(PLACEHOLDER_PATTERN)) {
          const variable = match[1];
          if (!allowed.has(variable)) {
            throw new BadRequestException(
              `Unsupported ${key} email template variable: ${variable}`,
            );
          }
        }
      }
    }
  }
};

export const renderEmailTemplateText = (
  template: string,
  variables: Record<string, string | number | null | undefined>,
): string =>
  template.replace(PLACEHOLDER_PATTERN, (_placeholder, variable: string) => {
    const value = variables[variable];
    return value === null || value === undefined ? '' : String(value);
  });

export const resolveCustomerEmailLocale = (
  requestedLocale: unknown,
  defaultLocale: unknown,
): CustomerEmailLocale => {
  for (const candidate of [requestedLocale, defaultLocale, 'de']) {
    if (typeof candidate === 'string') {
      const locale = candidate.trim().toLowerCase().split(',')[0].split('-')[0];
      if (CUSTOMER_EMAIL_LOCALES.includes(locale as CustomerEmailLocale)) {
        return locale as CustomerEmailLocale;
      }
    }
  }

  return 'de';
};
