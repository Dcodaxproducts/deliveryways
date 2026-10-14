import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { PaypalPayoutEnvironment } from './dto';
import { PayoutProviderError } from './payout-provider.error';

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
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v1/payments/payouts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender_batch_header: {
            sender_batch_id: input.idempotencyKey,
            email_subject: 'FeastFlow restaurant payout',
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
    } catch (error) {
      throw new PayoutProviderError(
        error instanceof Error ? error.message : 'PayPal payout request failed',
        false,
      );
    }
    const payload: unknown = await response.json();

    if (!response.ok) {
      throw new PayoutProviderError(
        this.readProviderError(payload, 'PayPal payout failed'),
        response.status >= 400 &&
          response.status < 500 &&
          ![408, 409, 425, 429].includes(response.status),
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

  async retrievePayout(
    payoutId: string,
    credentials: PaypalCredentials,
  ): Promise<{
    id: string;
    status: string;
    amount: string | null;
    currency: string | null;
    recipient: string | null;
  }> {
    const baseUrl =
      credentials.environment === PaypalPayoutEnvironment.SANDBOX
        ? 'https://api-m.sandbox.paypal.com'
        : 'https://api-m.paypal.com';
    const token = await this.getAccessToken(baseUrl, credentials);
    let response: Response;
    try {
      response = await fetch(
        `${baseUrl}/v1/payments/payouts/${encodeURIComponent(payoutId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
    } catch (error) {
      throw new PayoutProviderError(
        error instanceof Error ? error.message : 'PayPal payout lookup failed',
        false,
      );
    }
    const payload: unknown = await response.json();
    if (!response.ok) {
      throw new PayoutProviderError(
        this.readProviderError(payload, 'PayPal payout lookup failed'),
        response.status === 404,
      );
    }
    const firstItem = this.readFirstObject(payload, 'items');
    return {
      id:
        this.readNestedString(payload, ['batch_header', 'payout_batch_id']) ??
        payoutId,
      status:
        this.readNestedString(payload, ['batch_header', 'batch_status']) ??
        'UNKNOWN',
      amount: firstItem
        ? this.readNestedString(firstItem, ['payout_item', 'amount', 'value'])
        : null,
      currency: firstItem
        ? this.readNestedString(firstItem, [
            'payout_item',
            'amount',
            'currency',
          ])
        : null,
      recipient: firstItem
        ? this.readNestedString(firstItem, ['payout_item', 'receiver'])
        : null,
    };
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

  private readFirstObject(
    value: unknown,
    key: string,
  ): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null;
    const items = (value as Record<string, unknown>)[key];
    const first: unknown = Array.isArray(items) ? items.at(0) : null;
    return first && typeof first === 'object' && !Array.isArray(first)
      ? (first as Record<string, unknown>)
      : null;
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
