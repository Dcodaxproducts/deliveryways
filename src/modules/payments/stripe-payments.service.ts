import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

export interface StripePaymentIntentMetadata {
  [key: string]: string | number | null;
  paymentTransactionId: string;
  orderId: string | null;
  customerId: string;
  restaurantId: string;
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

  getPublishableKey() {
    return this.stripePublishableKey;
  }

  getWebhookSecret() {
    return this.webhookSecret;
  }

  getDefaultCurrency() {
    return this.defaultCurrency.toUpperCase();
  }

  async createPaymentIntent(input: {
    amount: number;
    currency?: string;
    metadata: StripePaymentIntentMetadata;
    description: string;
  }) {
    const stripe = this.requireStripe();
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

  async cancelPaymentIntent(paymentIntentId: string) {
    const stripe = this.requireStripe();
    return stripe.paymentIntents.cancel(paymentIntentId);
  }

  async refundPaymentIntent(paymentIntentId: string, amount?: number) {
    const stripe = this.requireStripe();

    return stripe.refunds.create({
      payment_intent: paymentIntentId,
      ...(amount !== undefined
        ? { amount: this.toMinorUnitAmount(amount) }
        : {}),
    });
  }

  constructWebhookEvent(payload: Buffer | string, signature?: string) {
    const stripe = this.requireStripe();
    if (!signature) {
      throw new BadRequestException('Missing Stripe signature header');
    }

    if (!this.webhookSecret) {
      throw new InternalServerErrorException(
        'Stripe webhook secret is not configured',
      );
    }

    return stripe.webhooks.constructEvent(
      payload,
      signature,
      this.webhookSecret,
    );
  }

  private requireStripe() {
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
