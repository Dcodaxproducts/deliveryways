import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import Stripe = require('stripe');

export interface StripePaymentIntentMetadata {
  [key: string]: string | number | null;
  paymentTransactionId: string;
  orderId: string | null;
  customerId: string;
  restaurantId: string;
}

export interface StripeCheckoutCredentials {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
}

@Injectable()
export class StripePaymentsService {
  private readonly stripeSecretKey?: string;
  private readonly stripePublishableKey?: string;
  private readonly webhookSecret?: string;
  private readonly defaultCurrency: string;
  private readonly stripe?: InstanceType<typeof Stripe>;

  constructor(private readonly configService: ConfigService) {
    this.stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.stripePublishableKey = this.configService.get<string>(
      'STRIPE_PUBLISHABLE_KEY',
    );
    this.webhookSecret = this.configService.get<string>(
      'STRIPE_WEBHOOK_SECRET',
    );
    this.defaultCurrency = this.configService.get<string>(
      'STRIPE_CURRENCY',
      'PKR',
    );

    if (this.stripeSecretKey) {
      this.stripe = new Stripe(this.stripeSecretKey, {
        apiVersion: '2026-03-25.dahlia',
      });
    }
  }

  isConfigured() {
    return Boolean(this.stripe && this.stripePublishableKey);
  }

  getPublishableKey(credentials?: StripeCheckoutCredentials) {
    return credentials?.publishableKey ?? this.stripePublishableKey;
  }

  getWebhookSecret() {
    return this.webhookSecret;
  }

  getDefaultCurrency() {
    return this.defaultCurrency.toUpperCase();
  }

  async verifyCredentials(credentials: StripeCheckoutCredentials) {
    const stripe = this.requireStripe(credentials);
    await stripe.accounts.retrieveCurrent();
  }

  async createPaymentIntent(
    input: {
      amount: number;
      currency?: string;
      metadata: StripePaymentIntentMetadata;
      description: string;
    },
    credentials?: StripeCheckoutCredentials,
  ) {
    const stripe = this.requireStripe(credentials);
    const currency = (input.currency ?? this.defaultCurrency).toLowerCase();

    return stripe.paymentIntents.create({
      amount: this.toMinorUnitAmount(input.amount),
      currency,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: input.metadata,
      description: input.description,
    });
  }

  async cancelPaymentIntent(
    paymentIntentId: string,
    credentials?: StripeCheckoutCredentials,
  ) {
    const stripe = this.requireStripe(credentials);
    return stripe.paymentIntents.cancel(paymentIntentId);
  }

  async retrievePaymentIntent(
    paymentIntentId: string,
    credentials?: StripeCheckoutCredentials,
  ) {
    const stripe = this.requireStripe(credentials);
    return stripe.paymentIntents.retrieve(paymentIntentId);
  }

  async refundPaymentIntent(
    paymentIntentId: string,
    amount?: number,
    credentials?: StripeCheckoutCredentials,
  ) {
    const stripe = this.requireStripe(credentials);

    return stripe.refunds.create({
      payment_intent: paymentIntentId,
      ...(amount !== undefined
        ? { amount: this.toMinorUnitAmount(amount) }
        : {}),
    });
  }

  async createTransfer(
    input: {
      amount: number;
      currency?: string;
      destinationAccountId: string;
      description?: string;
      metadata: Record<string, string>;
      idempotencyKey?: string;
    },
    credentials?: StripeCheckoutCredentials,
  ) {
    const stripe = this.requireStripe(credentials);
    const currency = (input.currency ?? this.defaultCurrency).toLowerCase();

    return stripe.transfers.create(
      {
        amount: this.toMinorUnitAmount(input.amount),
        currency,
        destination: input.destinationAccountId,
        description: input.description,
        metadata: input.metadata,
      },
      input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {},
    );
  }

  constructWebhookEvent(
    payload: Buffer | string,
    signature?: string,
    credentials?: StripeCheckoutCredentials,
  ) {
    const stripe = this.requireStripe(credentials);
    if (!signature) {
      throw new BadRequestException('Missing Stripe signature header');
    }

    const webhookSecret = credentials?.webhookSecret ?? this.webhookSecret;
    if (!webhookSecret) {
      throw new InternalServerErrorException(
        'Stripe webhook secret is not configured',
      );
    }

    return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  }

  private requireStripe(credentials?: StripeCheckoutCredentials) {
    if (credentials) {
      return new Stripe(credentials.secretKey, {
        apiVersion: '2026-03-25.dahlia',
      });
    }

    if (!this.stripe || !this.stripePublishableKey) {
      throw new InternalServerErrorException(
        'Stripe is not configured. Missing STRIPE_SECRET_KEY or STRIPE_PUBLISHABLE_KEY',
      );
    }

    return this.stripe;
  }

  private toMinorUnitAmount(amount: number) {
    const normalized = Number(amount);
    if (!Number.isFinite(normalized) || normalized <= 0) {
      throw new BadRequestException('Stripe amount must be greater than zero');
    }

    return Math.round(normalized * 100);
  }
}
