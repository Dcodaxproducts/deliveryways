import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  AutomaticPayoutTransferState,
  Prisma,
  RestaurantPayoutRequestStatus,
  RestaurantWalletTransactionType,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../database';
import { GlobalSettingsService } from '../global-settings/global-settings.service';
import {
  PaypalPayoutEnvironment,
  PayoutReconciliationAction,
  RestaurantPayoutProvider,
} from './dto';
import { PaypalPayoutsService } from './paypal-payouts.service';
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

interface PaypalCredentials {
  clientId: string;
  clientSecret: string;
  recipientEmail: string;
  environment: PaypalPayoutEnvironment;
}

export interface ManualPayoutInput {
  tenantId: string;
  restaurantId: string;
  actorId: string;
  provider: RestaurantPayoutProvider;
  amount: Prisma.Decimal;
  currency: string;
  idempotencyKey: string;
  description: string;
}

@Injectable()
export class AutomaticPayoutDispatcherService {
  private readonly logger = new Logger(AutomaticPayoutDispatcherService.name);
  private readonly maxAttempts = 8;

  constructor(
    private readonly prisma: PrismaService,
    private readonly globalSettingsService: GlobalSettingsService,
    private readonly payoutCredentialsService: PayoutCredentialsService,
    private readonly stripePaymentsService: StripePaymentsService,
    private readonly paypalPayoutsService: PaypalPayoutsService,
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
        result[await this.dispatchOne(item.id, now)] += 1;
      } catch (error) {
        result.retrying += 1;
        this.logger.warn(
          'Payout ' +
            item.id +
            ' failed in isolation: ' +
            this.errorMessage(error),
        );
      }
    }
    return result;
  }

  async executeManualPayout(input: ManualPayoutInput) {
    const providerKey = this.manualProviderKey(input);
    let transfer = await this.prisma.automaticPayoutTransfer.findUnique({
      where: { idempotencyKey: providerKey },
    });
    if (!transfer) {
      try {
        transfer = await this.prisma.automaticPayoutTransfer.create({
          data: {
            tenantId: input.tenantId,
            restaurantId: input.restaurantId,
            requestedBy: input.actorId,
            provider: input.provider,
            amount: input.amount,
            currency: input.currency,
            idempotencyKey: providerKey,
            description: input.description,
          },
        });
      } catch (error) {
        if (!this.isPrismaError(error, 'P2002')) throw error;
        transfer = await this.prisma.automaticPayoutTransfer.findUniqueOrThrow({
          where: { idempotencyKey: providerKey },
        });
      }
    }
    if (
      transfer.restaurantId !== input.restaurantId ||
      transfer.provider !== input.provider ||
      !transfer.amount.equals(input.amount) ||
      transfer.currency !== input.currency
    ) {
      throw new ConflictException(
        'Idempotency key was already used for a different payout',
      );
    }
    if (
      transfer.state !== AutomaticPayoutTransferState.SUCCEEDED &&
      transfer.state !== AutomaticPayoutTransferState.UNKNOWN &&
      transfer.state !== AutomaticPayoutTransferState.FAILED
    ) {
      await this.dispatchOne(transfer.id, new Date());
    }
    const current = await this.prisma.automaticPayoutTransfer.findUniqueOrThrow(
      {
        where: { id: transfer.id },
        include: { payoutRequest: true },
      },
    );
    if (current.state === AutomaticPayoutTransferState.SUCCEEDED) {
      return current.payoutRequest;
    }
    if (current.state === AutomaticPayoutTransferState.UNKNOWN) {
      throw new ServiceUnavailableException(
        'Payout submission outcome is unknown and requires reconciliation: ' +
          current.id,
      );
    }
    throw new BadRequestException(
      current.lastError ?? 'Payout could not be submitted',
    );
  }

  async listUnknownPayouts() {
    return this.prisma.automaticPayoutTransfer.findMany({
      where: { state: AutomaticPayoutTransferState.UNKNOWN },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 100,
      include: { payoutRequest: true },
    });
  }

  async reconcileUnknownPayout(input: {
    id: string;
    action: PayoutReconciliationAction;
    actorId: string;
    note: string;
    providerReference?: string;
    providerConfirmedNotSubmitted?: boolean;
  }) {
    const now = new Date();
    if (input.action === PayoutReconciliationAction.DELIVERED) {
      if (!input.providerReference?.trim()) {
        throw new BadRequestException(
          'Provider reference is required for delivered reconciliation',
        );
      }
      await this.complete(
        input.id,
        null,
        input.providerReference.trim(),
        now,
        AutomaticPayoutTransferState.UNKNOWN,
        input.actorId,
        input.note,
      );
    } else {
      if (!input.providerConfirmedNotSubmitted) {
        throw new BadRequestException(
          'Provider confirmation that the payout was not submitted is required',
        );
      }
      await this.releaseReservation(
        input.id,
        input.action === PayoutReconciliationAction.RESEND
          ? AutomaticPayoutTransferState.RETRY_WAIT
          : AutomaticPayoutTransferState.FAILED,
        now,
        input.actorId,
        input.note,
      );
    }
    return this.prisma.automaticPayoutTransfer.findUniqueOrThrow({
      where: { id: input.id },
      include: { payoutRequest: true },
    });
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

    let transfer = await this.prisma.automaticPayoutTransfer.findUniqueOrThrow({
      where: { id },
      include: { restaurant: { select: { settings: true } } },
    });
    const configurations = this.readProviderConfigurations(
      transfer.restaurant.settings,
    );
    let provider = transfer.provider as RestaurantPayoutProvider | null;
    if (!provider) {
      const enabled = Object.values(RestaurantPayoutProvider).filter(
        (candidate) => configurations[candidate]?.enabled,
      );
      if (
        enabled.length !== 1 ||
        enabled[0] !== RestaurantPayoutProvider.STRIPE
      ) {
        await this.block(
          id,
          claimToken,
          enabled.length === 1 && enabled[0] === RestaurantPayoutProvider.PAYPAL
            ? 'PayPal automatic payouts require explicit manual submission'
            : 'Exactly one approved Stripe payout provider must be enabled',
          enabled[0] ?? null,
        );
        return 'blocked';
      }
      provider = enabled[0];
    }
    const configuration = configurations[provider];
    if (!configuration?.enabled) {
      await this.block(
        id,
        claimToken,
        provider + ' payout configuration is not enabled',
        provider,
      );
      return 'blocked';
    }

    try {
      await this.reserve(id, claimToken, now, provider);
      transfer = await this.prisma.automaticPayoutTransfer.findUniqueOrThrow({
        where: { id },
        include: { restaurant: { select: { settings: true } } },
      });
      const credentials =
        provider === RestaurantPayoutProvider.STRIPE
          ? await this.resolveStripeCredentials()
          : this.resolvePaypalCredentials(transfer.restaurantId, configuration);
      if (
        provider === RestaurantPayoutProvider.STRIPE &&
        !this.readString(configuration.publicDetails?.accountId)
      ) {
        throw new BadRequestException('Approved Stripe account ID is missing');
      }
      const sending = await this.prisma.automaticPayoutTransfer.updateMany({
        where: {
          id,
          claimToken,
          state: AutomaticPayoutTransferState.PREPARING,
        },
        data: {
          state: AutomaticPayoutTransferState.SENDING,
          provider,
          providerSubmittedAt: now,
        },
      });
      if (sending.count !== 1) return 'unknown';

      let providerReference: string;
      try {
        providerReference = await this.submitToProvider(
          transfer,
          provider,
          configuration,
          credentials,
        );
      } catch (error) {
        await this.markUnknown(id, claimToken, error, null);
        return 'unknown';
      }
      try {
        await this.complete(
          id,
          claimToken,
          providerReference,
          now,
          AutomaticPayoutTransferState.SENDING,
        );
        return 'succeeded';
      } catch (error) {
        await this.markUnknown(id, claimToken, error, providerReference);
        return 'unknown';
      }
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
  }

  private async submitToProvider(
    transfer: {
      id: string;
      tenantId: string;
      restaurantId: string;
      generatedInvoiceId: string | null;
      payoutRequestId: string | null;
      amount: Prisma.Decimal;
      currency: string;
      idempotencyKey: string;
      description: string | null;
    },
    provider: RestaurantPayoutProvider,
    configuration: ProviderConfiguration,
    credentials: StripeCheckoutCredentials | PaypalCredentials,
  ) {
    const description =
      transfer.description ??
      'DeliveryWays automatic payout ' +
        (transfer.generatedInvoiceId ?? transfer.id);
    if (provider === RestaurantPayoutProvider.STRIPE) {
      const accountId = this.readString(configuration.publicDetails?.accountId);
      if (!accountId) {
        throw new BadRequestException('Approved Stripe account ID is missing');
      }
      const submitted = await this.stripePaymentsService.createTransfer(
        {
          amount: Number(transfer.amount),
          currency: transfer.currency,
          destinationAccountId: accountId,
          description,
          idempotencyKey: transfer.idempotencyKey,
          metadata: {
            restaurantId: transfer.restaurantId,
            tenantId: transfer.tenantId,
            payoutRequestId: transfer.payoutRequestId ?? '',
            automaticPayoutTransferId: transfer.id,
          },
        },
        credentials as StripeCheckoutCredentials,
      );
      return submitted.id;
    }
    const submitted = await this.paypalPayoutsService.createPayout({
      credentials: credentials as PaypalCredentials,
      amount: Number(transfer.amount),
      currency: transfer.currency,
      description,
      idempotencyKey: transfer.idempotencyKey,
    });
    return submitted.id;
  }

  private async reserve(
    id: string,
    claimToken: string,
    now: Date,
    provider: RestaurantPayoutProvider,
  ) {
    return this.serializable(async (tx) => {
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
      const available = wallet.balance.minus(wallet.reservedPayoutBalance);
      if (
        wallet.currency !== transfer.currency ||
        available.lessThan(transfer.amount)
      ) {
        throw new BadRequestException(
          'Restaurant wallet no longer covers the payout reservation',
        );
      }
      const reserved = await tx.restaurantWalletAccount.updateMany({
        where: {
          id: wallet.id,
          balance: wallet.balance,
          reservedPayoutBalance: wallet.reservedPayoutBalance,
        },
        data: { reservedPayoutBalance: { increment: transfer.amount } },
      });
      if (reserved.count !== 1) {
        throw new ConflictException(
          'Restaurant wallet changed while reserving payout',
        );
      }
      const request = await tx.restaurantPayoutRequest.create({
        data: {
          walletAccountId: wallet.id,
          tenantId: transfer.tenantId,
          restaurantId: transfer.restaurantId,
          requestedBy: transfer.requestedBy,
          reviewedBy: transfer.requestedBy,
          status: RestaurantPayoutRequestStatus.APPROVED,
          amount: transfer.amount,
          currency: transfer.currency,
          bankDetails: {
            provider,
            automaticPayoutTransferId: transfer.id,
            generatedInvoiceId: transfer.generatedInvoiceId,
            idempotencyKey: transfer.idempotencyKey,
          },
          note: transfer.description ?? 'Automatic payout reservation',
          approvalNote: 'Reserved by durable payout executor',
          approvedAt: now,
        },
      });
      await tx.automaticPayoutTransfer.update({
        where: { id: transfer.id },
        data: { payoutRequestId: request.id, provider },
      });
    });
  }

  private async complete(
    id: string,
    claimToken: string | null,
    providerReference: string,
    now: Date,
    expectedState: AutomaticPayoutTransferState,
    reconciledBy?: string,
    reconciliationNote?: string,
  ) {
    await this.serializable(async (tx) => {
      const transfer = await tx.automaticPayoutTransfer.findFirst({
        where: {
          id,
          state: expectedState,
          ...(claimToken ? { claimToken } : {}),
        },
      });
      if (!transfer) {
        const existing = await tx.automaticPayoutTransfer.findUnique({
          where: { id },
        });
        if (
          existing?.state === AutomaticPayoutTransferState.SUCCEEDED &&
          existing.providerReference === providerReference
        )
          return;
        throw new ConflictException('Payout state changed before completion');
      }
      if (!transfer.payoutRequestId) {
        throw new BadRequestException('Payout reservation is missing');
      }
      const request = await tx.restaurantPayoutRequest.findUniqueOrThrow({
        where: { id: transfer.payoutRequestId },
      });
      const wallet = await tx.restaurantWalletAccount.findUniqueOrThrow({
        where: { id: request.walletAccountId },
      });
      if (
        wallet.reservedPayoutBalance.lessThan(transfer.amount) ||
        wallet.balance.lessThan(transfer.amount)
      ) {
        throw new ConflictException(
          'Payout reservation balance is inconsistent',
        );
      }
      const balanceAfter = wallet.balance.minus(transfer.amount);
      const debited = await tx.restaurantWalletAccount.updateMany({
        where: {
          id: wallet.id,
          balance: wallet.balance,
          reservedPayoutBalance: wallet.reservedPayoutBalance,
        },
        data: {
          balance: { decrement: transfer.amount },
          reservedPayoutBalance: { decrement: transfer.amount },
        },
      });
      if (debited.count !== 1) {
        throw new ConflictException(
          'Restaurant wallet changed during payout completion',
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
          note: 'Provider payout delivered',
          metadata: {
            automaticPayoutTransferId: transfer.id,
            providerReference,
          },
          createdBy: transfer.requestedBy ?? reconciledBy,
        },
      });
      await tx.restaurantPayoutRequest.update({
        where: { id: request.id },
        data: {
          status: RestaurantPayoutRequestStatus.PAID,
          paymentReference: providerReference,
          paidBy: transfer.requestedBy ?? reconciledBy,
          paidNote: 'Provider payout completed',
          paidAt: now,
          walletTransactionId: walletTransaction.id,
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
          reconciledAt: reconciledBy ? now : null,
          reconciledBy,
          reconciliationNote,
        },
      });
    });
  }

  private async releaseReservation(
    id: string,
    nextState: AutomaticPayoutTransferState,
    now: Date,
    actorId: string,
    note: string,
  ) {
    await this.serializable(async (tx) => {
      const transfer = await tx.automaticPayoutTransfer.findFirst({
        where: { id, state: AutomaticPayoutTransferState.UNKNOWN },
      });
      if (!transfer) {
        const existing = await tx.automaticPayoutTransfer.findUnique({
          where: { id },
        });
        if (existing?.reconciledAt) return;
        throw new NotFoundException(
          'Unknown payout requiring reconciliation was not found',
        );
      }
      if (!transfer.payoutRequestId) {
        throw new ConflictException('Payout reservation is missing');
      }
      const request = await tx.restaurantPayoutRequest.findUniqueOrThrow({
        where: { id: transfer.payoutRequestId },
      });
      const released = await tx.restaurantWalletAccount.updateMany({
        where: {
          id: request.walletAccountId,
          reservedPayoutBalance: { gte: transfer.amount },
        },
        data: { reservedPayoutBalance: { decrement: transfer.amount } },
      });
      if (released.count !== 1) {
        throw new ConflictException('Payout reservation was already released');
      }
      await tx.restaurantPayoutRequest.update({
        where: { id: request.id },
        data: {
          status: RestaurantPayoutRequestStatus.CANCELLED,
          rejectionReason: note,
          rejectedAt: now,
        },
      });
      await tx.automaticPayoutTransfer.update({
        where: { id: transfer.id },
        data: {
          state: nextState,
          payoutRequestId: null,
          providerSubmittedAt: null,
          providerReference: null,
          nextAttemptAt:
            nextState === AutomaticPayoutTransferState.RETRY_WAIT ? now : null,
          reconciledAt: now,
          reconciledBy: actorId,
          reconciliationNote: note,
          lastError:
            nextState === AutomaticPayoutTransferState.RETRY_WAIT
              ? 'Provider proved payout was not submitted; explicit resend approved'
              : 'Provider proved payout was not delivered',
        },
      });
    });
  }

  private async retryBeforeSubmission(
    id: string,
    claimToken: string,
    attempts: number,
    error: unknown,
    now: Date,
  ) {
    const exhausted = attempts >= this.maxAttempts;
    if (exhausted) {
      await this.failAndRelease(id, claimToken, error, now);
      return;
    }
    const delaySeconds = Math.min(30 * 2 ** Math.max(attempts - 1, 0), 3600);
    await this.prisma.automaticPayoutTransfer.updateMany({
      where: { id, claimToken, state: AutomaticPayoutTransferState.PREPARING },
      data: {
        state: AutomaticPayoutTransferState.RETRY_WAIT,
        claimToken: null,
        claimExpiresAt: null,
        nextAttemptAt: new Date(now.getTime() + delaySeconds * 1000),
        lastError: this.errorMessage(error),
      },
    });
  }

  private async failAndRelease(
    id: string,
    claimToken: string,
    error: unknown,
    now: Date,
  ) {
    await this.serializable(async (tx) => {
      const transfer = await tx.automaticPayoutTransfer.findFirst({
        where: {
          id,
          claimToken,
          state: AutomaticPayoutTransferState.PREPARING,
        },
      });
      if (!transfer) return;
      if (transfer.payoutRequestId) {
        const request = await tx.restaurantPayoutRequest.findUniqueOrThrow({
          where: { id: transfer.payoutRequestId },
        });
        const released = await tx.restaurantWalletAccount.updateMany({
          where: {
            id: request.walletAccountId,
            reservedPayoutBalance: { gte: transfer.amount },
          },
          data: { reservedPayoutBalance: { decrement: transfer.amount } },
        });
        if (released.count !== 1) {
          throw new ConflictException('Payout reservation release failed');
        }
        await tx.restaurantPayoutRequest.update({
          where: { id: request.id },
          data: {
            status: RestaurantPayoutRequestStatus.REJECTED,
            rejectionReason: this.errorMessage(error),
            rejectedAt: now,
          },
        });
      }
      await tx.automaticPayoutTransfer.update({
        where: { id: transfer.id },
        data: {
          state: AutomaticPayoutTransferState.FAILED,
          claimToken: null,
          claimExpiresAt: null,
          nextAttemptAt: null,
          lastError: this.errorMessage(error),
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
      select: { id: true, state: true, claimToken: true, claimExpiresAt: true },
    });
    for (const item of expired) {
      if (!item.claimToken || !item.claimExpiresAt) continue;
      await this.prisma.automaticPayoutTransfer.updateMany({
        where: {
          id: item.id,
          state: item.state,
          claimToken: item.claimToken,
          claimExpiresAt: item.claimExpiresAt,
        },
        data:
          item.state === AutomaticPayoutTransferState.PREPARING
            ? {
                state: AutomaticPayoutTransferState.RETRY_WAIT,
                claimToken: null,
                claimExpiresAt: null,
                nextAttemptAt: now,
                lastError: 'Recovered expired pre-submission claim',
              }
            : {
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
      where: { id, claimToken, state: AutomaticPayoutTransferState.PREPARING },
      data: {
        state: AutomaticPayoutTransferState.BLOCKED,
        provider,
        lastError: reason,
        claimToken: null,
        claimExpiresAt: null,
      },
    });
  }

  private markUnknown(
    id: string,
    claimToken: string,
    error: unknown,
    providerReference: string | null,
  ) {
    return this.prisma.automaticPayoutTransfer.updateMany({
      where: { id, claimToken, state: AutomaticPayoutTransferState.SENDING },
      data: {
        state: AutomaticPayoutTransferState.UNKNOWN,
        claimToken: null,
        claimExpiresAt: null,
        providerReference,
        lastError: this.errorMessage(error),
      },
    });
  }

  private async resolveStripeCredentials(): Promise<StripeCheckoutCredentials> {
    const settings = this.asObject(
      await this.globalSettingsService.getPayoutProviderSettings(),
    );
    const stripe = this.asObject(this.asObject(settings.configurations).STRIPE);
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

  private resolvePaypalCredentials(
    restaurantId: string,
    configuration: ProviderConfiguration,
  ) {
    if (!configuration.encryptedCredentials) {
      throw new BadRequestException('Approved PayPal credentials are missing');
    }
    const credentials = this.payoutCredentialsService.decrypt(
      restaurantId,
      RestaurantPayoutProvider.PAYPAL,
      configuration.encryptedCredentials,
    );
    const clientId = this.readString(credentials.clientId);
    const clientSecret = this.readString(credentials.clientSecret);
    const recipientEmail = this.readString(credentials.recipientEmail);
    const environment = this.readString(credentials.environment);
    if (
      !clientId ||
      !clientSecret ||
      !recipientEmail ||
      !environment ||
      !Object.values(PaypalPayoutEnvironment).includes(
        environment as PaypalPayoutEnvironment,
      )
    ) {
      throw new BadRequestException(
        'Approved PayPal credentials are incomplete',
      );
    }
    return {
      clientId,
      clientSecret,
      recipientEmail,
      environment: environment as PaypalPayoutEnvironment,
    };
  }

  private readProviderConfigurations(value: Prisma.JsonValue | null) {
    const settings = this.asObject(value);
    const configurations = this.asObject(
      this.asObject(this.asObject(settings.payments).payoutProviders)
        .configurations,
    );
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

  private manualProviderKey(input: ManualPayoutInput) {
    return (
      'manual-' +
      createHash('sha256')
        .update(
          [
            input.restaurantId,
            input.provider,
            input.idempotencyKey.trim(),
          ].join(':'),
        )
        .digest('hex')
    );
  }

  private async serializable<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (attempt < 2 && this.isPrismaError(error, 'P2034')) continue;
        throw error;
      }
    }
    throw new ConflictException('Payout transaction could not be serialized');
  }

  private isPrismaError(error: unknown, code: string) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === code
    );
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
    return (error instanceof Error ? error.message : 'Payout failed').slice(
      0,
      1000,
    );
  }
}
