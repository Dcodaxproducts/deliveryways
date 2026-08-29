import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaypalPayoutEnvironment } from './dto';

export interface PaypalOrderCredentials {
  clientId: string;
  clientSecret: string;
  environment: PaypalPayoutEnvironment;
}

@Injectable()
export class PaypalOrdersService {
  constructor(private readonly configService: ConfigService) {}

  isConfigured(credentials?: PaypalOrderCredentials) {
    return Boolean(credentials ?? this.readGlobalCredentials());
  }

  getReturnUrl(paymentTransactionId: string) {
    return this.callbackUrl(
      `/payments/paypal/return?paymentId=${encodeURIComponent(paymentTransactionId)}`,
    );
  }

  getCancelUrl(paymentTransactionId: string) {
    return this.callbackUrl(
      `/payments/paypal/cancel?paymentId=${encodeURIComponent(paymentTransactionId)}`,
    );
  }

  async createOrder(input: {
    amount: number;
    currency: string;
    paymentTransactionId: string;
    orderId: string;
    collectShippingAddress: boolean;
    returnUrl: string;
    cancelUrl: string;
    credentials?: PaypalOrderCredentials;
  }) {
    const credentials = this.requireCredentials(input.credentials);
    const response = await this.request(credentials, '/v2/checkout/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `create-${input.paymentTransactionId}`,
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: input.orderId,
            custom_id: input.paymentTransactionId,
            invoice_id: input.orderId,
            amount: {
              currency_code: input.currency.toUpperCase(),
              value: input.amount.toFixed(2),
            },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              user_action: 'PAY_NOW',
              shipping_preference: input.collectShippingAddress
                ? 'GET_FROM_FILE'
                : 'NO_SHIPPING',
              return_url: input.returnUrl,
              cancel_url: input.cancelUrl,
            },
          },
        },
      }),
    });
    const id = this.readString(response, ['id']);
    const approvalUrl = this.readApprovalUrl(response);

    if (!id || !approvalUrl) {
      throw new BadGatewayException(
        'PayPal order response is missing its ID or approval URL',
      );
    }

    return { id, approvalUrl };
  }

  async captureOrder(input: {
    paypalOrderId: string;
    paymentTransactionId: string;
    credentials?: PaypalOrderCredentials;
  }) {
    const credentials = this.requireCredentials(input.credentials);
    let payload: unknown;
    try {
      payload = await this.request(
        credentials,
        `/v2/checkout/orders/${encodeURIComponent(input.paypalOrderId)}/capture`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'PayPal-Request-Id': `capture-${input.paymentTransactionId}`,
          },
        },
      );
    } catch (captureError: unknown) {
      const recovered = await this.request(
        credentials,
        `/v2/checkout/orders/${encodeURIComponent(input.paypalOrderId)}`,
        { method: 'GET' },
      ).catch(() => null);
      if (this.readString(recovered, ['status']) !== 'COMPLETED') {
        throw captureError;
      }
      payload = recovered;
    }

    return this.readCaptureResult(payload);
  }

  async refundCapture(input: {
    captureId: string;
    amount: number;
    currency: string;
    idempotencyKey: string;
    credentials?: PaypalOrderCredentials;
  }) {
    const credentials = this.requireCredentials(input.credentials);
    const payload = await this.request(
      credentials,
      `/v2/payments/captures/${encodeURIComponent(input.captureId)}/refund`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'PayPal-Request-Id': input.idempotencyKey,
        },
        body: JSON.stringify({
          amount: {
            currency_code: input.currency.toUpperCase(),
            value: input.amount.toFixed(2),
          },
        }),
      },
    );
    const id = this.readString(payload, ['id']);
    const status = this.readString(payload, ['status']);

    if (!id || status !== 'COMPLETED') {
      throw new BadGatewayException(
        'PayPal did not confirm the refund as completed',
      );
    }

    return { id, status, payload };
  }

  private readCaptureResult(payload: unknown) {
    const purchaseUnits = this.readValue(payload, ['purchase_units']);
    const purchaseUnit = Array.isArray(purchaseUnits)
      ? (purchaseUnits as unknown[])[0]
      : null;
    const captures = this.readValue(purchaseUnit, ['payments', 'captures']);
    const capture = Array.isArray(captures) ? (captures as unknown[])[0] : null;

    return {
      status: this.readString(payload, ['status']),
      customId:
        this.readString(purchaseUnit, ['custom_id']) ??
        this.readString(capture, ['custom_id']),
      captureId: this.readString(capture, ['id']),
      amount: this.readString(capture, ['amount', 'value']),
      currency: this.readString(capture, ['amount', 'currency_code']),
      payload,
    };
  }

  private async request(
    credentials: PaypalOrderCredentials,
    path: string,
    init: RequestInit,
  ): Promise<unknown> {
    const baseUrl = this.baseUrl(credentials.environment);
    const token = await this.getAccessToken(baseUrl, credentials);
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
    });
    const payload: unknown = await response.json();

    if (!response.ok) {
      throw new BadGatewayException(
        this.readString(payload, ['message']) ?? 'PayPal request failed',
      );
    }

    return payload;
  }

  private async getAccessToken(
    baseUrl: string,
    credentials: PaypalOrderCredentials,
  ) {
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
    const token = this.readString(payload, ['access_token']);

    if (!response.ok || !token) {
      throw new BadGatewayException(
        this.readString(payload, ['error_description']) ??
          'PayPal authentication failed',
      );
    }

    return token;
  }

  private requireCredentials(credentials?: PaypalOrderCredentials) {
    const resolved = credentials ?? this.readGlobalCredentials();
    if (!resolved) {
      throw new InternalServerErrorException(
        'PayPal checkout is not configured. Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET',
      );
    }
    return resolved;
  }

  private readGlobalCredentials(): PaypalOrderCredentials | null {
    const clientId = this.configService.get<string>('PAYPAL_CLIENT_ID')?.trim();
    const clientSecret = this.configService
      .get<string>('PAYPAL_CLIENT_SECRET')
      ?.trim();
    const rawEnvironment = this.configService
      .get<string>('PAYPAL_ENVIRONMENT', PaypalPayoutEnvironment.LIVE)
      .trim()
      .toUpperCase();

    if (!clientId || !clientSecret) return null;
    if (
      !Object.values(PaypalPayoutEnvironment).includes(
        rawEnvironment as PaypalPayoutEnvironment,
      )
    ) {
      throw new BadRequestException('PAYPAL_ENVIRONMENT is invalid');
    }

    return {
      clientId,
      clientSecret,
      environment: rawEnvironment as PaypalPayoutEnvironment,
    };
  }

  private baseUrl(environment: PaypalPayoutEnvironment) {
    return environment === PaypalPayoutEnvironment.SANDBOX
      ? 'https://api-m.sandbox.paypal.com'
      : 'https://api-m.paypal.com';
  }

  private callbackUrl(path: string) {
    const apiUrl = this.configService
      .get<string>('PUBLIC_API_BASE_URL')
      ?.trim()
      .replace(/\/$/, '');
    if (!apiUrl) {
      throw new InternalServerErrorException(
        'PayPal checkout is not configured. Missing PUBLIC_API_BASE_URL',
      );
    }
    return `${apiUrl}${path}`;
  }

  private readApprovalUrl(value: unknown) {
    const links = this.readValue(value, ['links']);
    if (!Array.isArray(links)) return null;
    const approval = (links as unknown[]).find((link) => {
      const record =
        link && typeof link === 'object' && !Array.isArray(link)
          ? (link as Record<string, unknown>)
          : {};
      return record.rel === 'payer-action' || record.rel === 'approve';
    });
    return this.readString(approval, ['href']);
  }

  private readString(value: unknown, path: string[]) {
    const resolved = this.readValue(value, path);
    return typeof resolved === 'string' && resolved.trim()
      ? resolved.trim()
      : null;
  }

  private readValue(value: unknown, path: string[]) {
    let current = value;
    for (const key of path) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return null;
      }
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  }
}
