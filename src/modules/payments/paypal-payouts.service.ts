import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { PaypalPayoutEnvironment } from './dto';

interface PaypalCredentials {
  clientId: string;
  clientSecret: string;
  recipientEmail: string;
  environment: PaypalPayoutEnvironment;
}

@Injectable()
export class PaypalPayoutsService {
  async verifyCredentials(credentials: PaypalCredentials) {
    const baseUrl =
      credentials.environment === PaypalPayoutEnvironment.SANDBOX
        ? 'https://api-m.sandbox.paypal.com'
        : 'https://api-m.paypal.com';
    await this.getAccessToken(baseUrl, credentials);
  }

  async createPayout(input: {
    credentials: PaypalCredentials;
    amount: number;
    currency: string;
    description: string;
    idempotencyKey: string;
  }) {
    const baseUrl =
      input.credentials.environment === PaypalPayoutEnvironment.SANDBOX
        ? 'https://api-m.sandbox.paypal.com'
        : 'https://api-m.paypal.com';
    const token = await this.getAccessToken(baseUrl, input.credentials);
    const response = await fetch(`${baseUrl}/v1/payments/payouts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender_batch_header: {
          sender_batch_id: input.idempotencyKey,
          email_subject: 'DeliveryWays restaurant payout',
          email_message: input.description,
        },
        items: [
          {
            recipient_type: 'EMAIL',
            receiver: input.credentials.recipientEmail,
            amount: {
              value: input.amount.toFixed(2),
              currency: input.currency.toUpperCase(),
            },
            note: input.description,
            sender_item_id: input.idempotencyKey,
          },
        ],
      }),
    });
    const payload: unknown = await response.json();

    if (!response.ok) {
      throw new BadGatewayException(
        this.readProviderError(payload, 'PayPal payout failed'),
      );
    }

    const batchId = this.readNestedString(payload, [
      'batch_header',
      'payout_batch_id',
    ]);
    if (!batchId) {
      throw new BadGatewayException(
        'PayPal payout response did not include a batch ID',
      );
    }

    return { id: batchId };
  }

  private async getAccessToken(
    baseUrl: string,
    credentials: PaypalCredentials,
  ) {
    if (!credentials.clientId || !credentials.clientSecret) {
      throw new BadRequestException('PayPal client credentials are incomplete');
    }

    const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${credentials.clientId}:${credentials.clientSecret}`,
        ).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const payload: unknown = await response.json();

    if (!response.ok) {
      throw new BadGatewayException(
        this.readProviderError(payload, 'PayPal authentication failed'),
      );
    }

    const token = this.readNestedString(payload, ['access_token']);
    if (!token) {
      throw new BadGatewayException(
        'PayPal authentication response did not include an access token',
      );
    }

    return token;
  }

  private readNestedString(value: unknown, path: string[]) {
    let current = value;
    for (const key of path) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return null;
      }
      current = (current as Record<string, unknown>)[key];
    }

    return typeof current === 'string' && current.trim()
      ? current.trim()
      : null;
  }

  private readProviderError(value: unknown, fallback: string) {
    return (
      this.readNestedString(value, ['message']) ??
      this.readNestedString(value, ['error_description']) ??
      fallback
    );
  }
}
