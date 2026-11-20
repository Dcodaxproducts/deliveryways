import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  AutomaticPayoutTransferState,
  Prisma,
  RestaurantPayoutRequestStatus,
  RestaurantWalletTransactionType,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database';
import { GlobalSettingsService } from '../global-settings/global-settings.service';
import { RestaurantPayoutProvider } from './dto';
import { PayoutCredentialsService } from './payout-credentials.service';
import {
  StripePaymentsService,
  type StripeCheckoutCredentials,
} from './stripe-payments.service';

interface ProviderConfiguration {
  enabled?: boolean;
  approvedAt?: string;
  approvedBy?: string;
  publicDetails?: Prisma.JsonObject;
  encryptedCredentials?: string;
}

@Injectable()
export class AutomaticPayoutDispatcherService {
  private readonly logger = new Logger(AutomaticPayoutDispatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly globalSettingsService: GlobalSettingsService,
    private readonly payoutCredentialsService: PayoutCredentialsService,
    private readonly stripePaymentsService: StripePaymentsService,
  ) {}

  @Cron('7 * * * *')
  async dispatchDuePayouts(now = new Date(), take = 50) {
    await this.recoverExpiredClaims(now, take);
    const due = await this.prisma.automaticPayoutTransfer.findMany({
      where: {
        state: {
          in: [
            AutomaticPayoutTransferState.PENDING,
            AutomaticPayoutTransferState.RETRY_WAIT,
          ],
        },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: Math.min(Math.max(take, 1), 100),
      select: { id: true },
    });
    const result = { succeeded: 0, blocked: 0, retrying: 0, unknown: 0 };
    for (const item of due) {
      try {
        const outcome = await this.dispatchOne(item.id, now);
        result[outcome] += 1;
      } catch (error) {
        result.retrying += 1;
        this.logger.warn(
          'Automatic payout ' +
            item.id +
            ' failed in isolation: ' +
            this.errorMessage(error),
        );
      }
    }
    if (due.length > 0) {
      this.logger.log(
        'Automatic payouts: succeeded=' +
          result.succeeded +
          ', blocked=' +
          result.blocked +
          ', retrying=' +
          result.retrying +
          ', unknown=' +
          result.unknown,
      );
    }
    return result;
  }

  private async dispatchOne(
    id: string,
    now: Date,
  ): Promise<'succeeded' | 'blocked' | 'retrying' | 'unknown'> {
    const claimToken = randomUUID();
    const claimed = await this.prisma.automaticPayoutTransfer.updateMany({
      where: {
        id,
        state: {
          in: [
            AutomaticPayoutTransferState.PENDING,
            AutomaticPayoutTransferState.RETRY_WAIT,
          ],
        },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      data: {
        state: AutomaticPayoutTransferState.PREPARING,
        claimToken,
        claimExpiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        attempts: { increment: 1 },
        lastError: null,
      },
    });
    if (claimed.count !== 1) return 'retrying';

    const transfer =
      await this.prisma.automaticPayoutTransfer.findUniqueOrThrow({
        where: { id },
        include: {
          restaurant: { select: { id: true, settings: true } },
        },
      });
    const configurations = this.readProviderConfigurations(
      transfer.restaurant.settings,
    );
    const stripe = configurations.STRIPE;
    const paypal = configurations.PAYPAL;
    const enabledCount = [stripe, paypal].filter(
      (item) => item?.enabled,
    ).length;
    if (!stripe?.enabled) {
      await this.block(
        id,
        claimToken,
        paypal?.enabled
          ? 'PayPal automatic payouts are disabled until asynchronous provider reconciliation is safe'
          : 'No approved and enabled Stripe payout configuration',
        paypal?.enabled ? RestaurantPayoutProvider.PAYPAL : null,
      );
      return 'blocked';
    }
    if (enabledCount !== 1) {
      await this.block(
        id,
        claimToken,
        'Exactly one payout provider must be enabled for automatic payout',
        RestaurantPayoutProvider.STRIPE,
      );
      return 'blocked';
    }
    const accountId = this.readString(stripe.publicDetails?.accountId);
    if (!accountId) {
      await this.block(
        id,
        claimToken,
        'Approved Stripe account ID is missing',
        RestaurantPayoutProvider.STRIPE,
      );
      return 'blocked';
    }

    let credentials: StripeCheckoutCredentials;
    try {
      credentials = await this.resolveStripeCredentials();
      await this.reserve(id, claimToken, now);
    } catch (error) {
      await this.retryBeforeSubmission(
        id,
        claimToken,
        transfer.attempts,
        error,
        now,
      );
      return 'retrying';
    }

    const sending = await this.prisma.automaticPayoutTransfer.updateMany({
      where: {
        id,
        claimToken,
        state: AutomaticPayoutTransferState.PREPARING,
      },
      data: {
        state: AutomaticPayoutTransferState.SENDING,
        provider: RestaurantPayoutProvider.STRIPE,
        providerSubmittedAt: now,
      },
    });
    if (sending.count !== 1) return 'unknown';

    try {
      const submitted = await this.stripePaymentsService.createTransfer(
        {
          amount: Number(transfer.amount),
          currency: transfer.currency,
          destinationAccountId: accountId,
          description:
            'DeliveryWays automatic payout ' + transfer.generatedInvoiceId,
          idempotencyKey: transfer.idempotencyKey,
          metadata: {
            restaurantId: transfer.restaurantId,
            tenantId: transfer.tenantId,
            generatedInvoiceId: transfer.generatedInvoiceId,
            automaticPayoutTransferId: transfer.id,
          },
        },
        credentials,
      );
      await this.complete(id, claimToken, submitted.id, now);
      return 'succeeded';
    } catch (error) {
      await this.prisma.automaticPayoutTransfer.updateMany({
        where: {
          id,
          claimToken,
          state: AutomaticPayoutTransferState.SENDING,
        },
        data: {
          state: AutomaticPayoutTransferState.UNKNOWN,
          claimToken: null,
          claimExpiresAt: null,
          lastError: this.errorMessage(error),
        },
      });
      return 'unknown';
    }
  }

  private async reserve(id: string, claimToken: string, now: Date) {
    return this.prisma.$transaction(
      async (tx) => {
        const transfer = await tx.automaticPayoutTransfer.findFirstOrThrow({
          where: {
            id,
            claimToken,
            state: AutomaticPayoutTransferState.PREPARING,
          },
        });
        if (transfer.payoutRequestId) return;
        const wallet = await tx.restaurantWalletAccount.findUniqueOrThrow({
          where: { restaurantId: transfer.restaurantId },
        });
        if (
          wallet.currency !== transfer.currency ||
          wallet.balance.lessThan(transfer.amount)
        ) {
          throw new BadRequestException(
            'Restaurant wallet no longer covers the finalized payout amount',
          );
        }
        const request = await tx.restaurantPayoutRequest.create({
          data: {
            walletAccountId: wallet.id,
            tenantId: transfer.tenantId,
            restaurantId: transfer.restaurantId,
            status: RestaurantPayoutRequestStatus.APPROVED,
            amount: transfer.amount,
            currency: transfer.currency,
            bankDetails: {
              provider: RestaurantPayoutProvider.STRIPE,
              automaticPayoutTransferId: transfer.id,
              generatedInvoiceId: transfer.generatedInvoiceId,
              idempotencyKey: transfer.idempotencyKey,
            },
            note: 'Automatic payout reserved from finalized payout invoice',
            approvalNote: 'Approved by configured automatic payout cadence',
            approvedAt: now,
          },
        });
        const balanceAfter = wallet.balance.minus(transfer.amount);
        const debited = await tx.restaurantWalletAccount.updateMany({
          where: { id: wallet.id, balance: wallet.balance },
          data: { balance: balanceAfter },
        });
        if (debited.count !== 1) {
          throw new BadRequestException(
            'Restaurant wallet changed while reserving automatic payout',
          );
        }
        const walletTransaction = await tx.restaurantWalletTransaction.create({
          data: {
            walletAccountId: wallet.id,
            tenantId: transfer.tenantId,
            restaurantId: transfer.restaurantId,
            payoutRequestId: request.id,
            type: RestaurantWalletTransactionType.PAYOUT_DEBIT,
            amount: transfer.amount.negated(),
            balanceAfter,
            currency: transfer.currency,
            note: 'Reserved for automatic Stripe payout',
            metadata: {
              automaticPayoutTransferId: transfer.id,
              generatedInvoiceId: transfer.generatedInvoiceId,
            },
          },
        });
        await tx.restaurantPayoutRequest.update({
          where: { id: request.id },
          data: { walletTransactionId: walletTransaction.id },
        });
        await tx.automaticPayoutTransfer.update({
          where: { id: transfer.id },
          data: { payoutRequestId: request.id },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async complete(
    id: string,
    claimToken: string,
    providerReference: string,
    now: Date,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const transfer = await tx.automaticPayoutTransfer.findFirstOrThrow({
        where: {
          id,
          claimToken,
          state: AutomaticPayoutTransferState.SENDING,
        },
      });
      if (!transfer.payoutRequestId) {
        throw new BadRequestException(
          'Automatic payout reservation is missing',
        );
      }
      await tx.restaurantPayoutRequest.update({
        where: { id: transfer.payoutRequestId },
        data: {
          status: RestaurantPayoutRequestStatus.PAID,
          paymentReference: providerReference,
          paidNote: 'Automatic Stripe payout completed',
          paidAt: now,
        },
      });
      await tx.automaticPayoutTransfer.update({
        where: { id: transfer.id },
        data: {
          state: AutomaticPayoutTransferState.SUCCEEDED,
          providerReference,
          completedAt: now,
          claimToken: null,
          claimExpiresAt: null,
          nextAttemptAt: null,
        },
      });
    });
  }

  private async recoverExpiredClaims(now: Date, take: number) {
    const expired = await this.prisma.automaticPayoutTransfer.findMany({
      where: {
        state: {
          in: [
            AutomaticPayoutTransferState.PREPARING,
            AutomaticPayoutTransferState.SENDING,
          ],
        },
        claimExpiresAt: { lte: now },
      },
      orderBy: { createdAt: 'asc' },
      take: Math.min(Math.max(take, 1), 100),
      select: { id: true, state: true },
    });
    const preparing = expired
      .filter((item) => item.state === AutomaticPayoutTransferState.PREPARING)
      .map((item) => item.id);
    const sending = expired
      .filter((item) => item.state === AutomaticPayoutTransferState.SENDING)
      .map((item) => item.id);
    if (preparing.length > 0) {
      await this.prisma.automaticPayoutTransfer.updateMany({
        where: {
          id: { in: preparing },
          state: AutomaticPayoutTransferState.PREPARING,
        },
        data: {
          state: AutomaticPayoutTransferState.RETRY_WAIT,
          claimToken: null,
          claimExpiresAt: null,
          nextAttemptAt: now,
          lastError: 'Recovered expired pre-submission claim',
        },
      });
    }
    if (sending.length > 0) {
      await this.prisma.automaticPayoutTransfer.updateMany({
        where: {
          id: { in: sending },
          state: AutomaticPayoutTransferState.SENDING,
        },
        data: {
          state: AutomaticPayoutTransferState.UNKNOWN,
          claimToken: null,
          claimExpiresAt: null,
          lastError:
            'Provider submission outcome requires reconciliation; automatic resend is disabled',
        },
      });
    }
  }

  private block(
    id: string,
    claimToken: string,
    reason: string,
    provider: RestaurantPayoutProvider | null,
  ) {
    return this.prisma.automaticPayoutTransfer.updateMany({
      where: {
        id,
        claimToken,
        state: AutomaticPayoutTransferState.PREPARING,
      },
      data: {
        state: AutomaticPayoutTransferState.BLOCKED,
        provider,
        lastError: reason,
        claimToken: null,
        claimExpiresAt: null,
      },
    });
  }

  private retryBeforeSubmission(
    id: string,
    claimToken: string,
    attempts: number,
    error: unknown,
    now: Date,
  ) {
    const exhausted = attempts >= 8;
    const delaySeconds = Math.min(30 * 2 ** Math.max(attempts - 1, 0), 3600);
    return this.prisma.automaticPayoutTransfer.updateMany({
      where: {
        id,
        claimToken,
        state: AutomaticPayoutTransferState.PREPARING,
      },
      data: {
        state: exhausted
          ? AutomaticPayoutTransferState.FAILED
          : AutomaticPayoutTransferState.RETRY_WAIT,
        claimToken: null,
        claimExpiresAt: null,
        nextAttemptAt: exhausted
          ? null
          : new Date(now.getTime() + delaySeconds * 1000),
        lastError: this.errorMessage(error),
      },
    });
  }

  private async resolveStripeCredentials(): Promise<StripeCheckoutCredentials> {
    const settings = this.asObject(
      await this.globalSettingsService.getPayoutProviderSettings(),
    );
    const configurations = this.asObject(settings.configurations);
    const stripe = this.asObject(configurations.STRIPE);
    if (stripe.enabled !== true) {
      throw new BadRequestException(
        'Global Stripe payout provider is disabled',
      );
    }
    const encrypted = this.readString(stripe.encryptedCredentials);
    if (!encrypted) {
      throw new BadRequestException(
        'Global Stripe payout credentials are missing',
      );
    }
    const credentials = this.payoutCredentialsService.decrypt(
      'GLOBAL',
      RestaurantPayoutProvider.STRIPE,
      encrypted,
    );
    const secretKey = this.readString(credentials.secretKey);
    const publishableKey = this.readString(credentials.publishableKey);
    const webhookSecret = this.readString(credentials.webhookSecret);
    if (!secretKey || !publishableKey || !webhookSecret) {
      throw new BadRequestException(
        'Global Stripe payout credentials are incomplete',
      );
    }
    return { secretKey, publishableKey, webhookSecret };
  }

  private readProviderConfigurations(value: Prisma.JsonValue | null) {
    const settings = this.asObject(value);
    const payments = this.asObject(settings.payments);
    const payouts = this.asObject(payments.payoutProviders);
    const configurations = this.asObject(payouts.configurations);
    return {
      STRIPE: this.asProviderConfiguration(configurations.STRIPE),
      PAYPAL: this.asProviderConfiguration(configurations.PAYPAL),
    };
  }

  private asProviderConfiguration(
    value: unknown,
  ): ProviderConfiguration | null {
    const data = this.asObject(value);
    const approvedAt = this.readString(data.approvedAt);
    const approvedBy = this.readString(data.approvedBy);
    return Object.keys(data).length === 0 || !approvedAt || !approvedBy
      ? null
      : {
          enabled: data.enabled === true,
          approvedAt,
          approvedBy,
          publicDetails: this.asObject(data.publicDetails),
          encryptedCredentials:
            this.readString(data.encryptedCredentials) ?? undefined,
        };
  }

  private asObject(value: unknown): Prisma.JsonObject {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Prisma.JsonObject)
      : {};
  }

  private readString(value: unknown) {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : null;
  }

  private errorMessage(error: unknown) {
    return (
      error instanceof Error ? error.message : 'Automatic payout failed'
    ).slice(0, 1000);
  }
}
