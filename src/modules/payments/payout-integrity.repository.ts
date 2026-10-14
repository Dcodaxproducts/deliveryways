import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  RestaurantPayoutRequest,
  RestaurantPayoutRequestStatus,
  RestaurantWalletTransactionType,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaTx } from '../../common/types';
import { PrismaService } from '../../database';
import { FinancialLedgerRepository } from '../financial-ledger';

const PAYOUT_LEASE_MS = 60_000;

export interface ReservePayoutInput {
  tenantId: string;
  restaurantId: string;
  walletAccountId: string;
  branchId?: string;
  actorId: string;
  amount: Prisma.Decimal;
  entitlementAmount: Prisma.Decimal;
  currency: string;
  operationIdentity: string;
  requestHash: string;
  provider?: string;
  bankDetails: Prisma.InputJsonValue;
  note?: string;
  autoApprove?: boolean;
}

export interface PayoutClaim {
  request: RestaurantPayoutRequest;
  claimToken: string | null;
}

@Injectable()
export class PayoutIntegrityRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: FinancialLedgerRepository,
  ) {}

  async reserve(input: ReservePayoutInput): Promise<{
    request: RestaurantPayoutRequest;
    replayed: boolean;
  }> {
    const operationKey = FinancialLedgerRepository.createOperationKey(
      input.operationIdentity,
    );
    const currency = input.currency.trim().toUpperCase();
    return this.ledger.withFinancialLedgerTransaction(
      [
        {
          tenantId: input.tenantId,
          restaurantId: input.restaurantId,
          accountKind: 'RESTAURANT_WALLET',
        },
      ],
      async (tx) => {
        const existing = await tx.restaurantPayoutRequest.findUnique({
          where: { operationKey },
        });
        if (existing) {
          this.assertReplay(existing, input.requestHash);
          return { request: existing, replayed: true };
        }
        const wallet = await tx.restaurantWalletAccount.findUniqueOrThrow({
          where: { id: input.walletAccountId },
          select: {
            id: true,
            tenantId: true,
            restaurantId: true,
            currency: true,
            balance: true,
          },
        });
        if (
          wallet.tenantId !== input.tenantId ||
          wallet.restaurantId !== input.restaurantId ||
          wallet.currency.trim().toUpperCase() !== currency
        ) {
          throw new ConflictException(
            'Payout wallet scope does not match request',
          );
        }
        const [outstanding] = await tx.$queryRaw<
          Array<{ amount: Prisma.Decimal }>
        >(Prisma.sql`
          SELECT COALESCE(SUM(p."amount"), 0)::numeric AS amount
          FROM "restaurant_payout_requests" p
          WHERE p."wallet_account_id" = ${input.walletAccountId}
            AND p."tenant_id" = ${input.tenantId}
            AND p."restaurant_id" = ${input.restaurantId}
            AND upper(p."currency") = ${currency}
            AND p."status" IN (
              'RESERVED', 'PROCESSING', 'PROVIDER_SUCCEEDED', 'COMPLETED',
              'APPROVED', 'PAID', 'NEEDS_RECONCILIATION'
            )
            AND NOT EXISTS (
              SELECT 1 FROM "generated_invoices" gi
              WHERE gi."kind" = 'WEEKLY_PAYOUT'
                AND gi."restaurant_id" = p."restaurant_id"
                AND gi."source_key" = p."restaurant_id" || ':special:' || p."id"
            )
        `);
        const remainingEntitlement = Prisma.Decimal.max(
          input.entitlementAmount.minus(outstanding?.amount ?? 0),
          new Prisma.Decimal(0),
        );
        const serializedAvailable = Prisma.Decimal.min(
          new Prisma.Decimal(wallet.balance),
          remainingEntitlement,
        ).toDecimalPlaces(2);
        if (input.amount.greaterThan(serializedAvailable)) {
          throw new BadRequestException(
            'Requested amount exceeds available payout balance after deductions',
          );
        }
        const request = await tx.restaurantPayoutRequest.create({
          data: {
            walletAccountId: input.walletAccountId,
            tenantId: input.tenantId,
            restaurantId: input.restaurantId,
            branchId: input.branchId,
            requestedBy: input.actorId,
            reviewedBy: input.autoApprove ? input.actorId : undefined,
            status: RestaurantPayoutRequestStatus.RESERVED,
            amount: input.amount,
            currency,
            bankDetails: input.bankDetails,
            note: input.note,
            approvalNote: input.autoApprove
              ? 'Approved provider payout initiated by super admin'
              : undefined,
            approvedAt: input.autoApprove ? new Date() : undefined,
            operationKey,
            requestHash: input.requestHash,
            provider: input.provider,
            providerIdempotencyKey: input.provider
              ? this.providerKey(operationKey)
              : undefined,
          },
        });
        const reservation = await this.ledger.applyRestaurantWalletDelta(
          {
            tenantId: input.tenantId,
            restaurantId: input.restaurantId,
            branchId: input.branchId,
            operationKey: 'payout:reserve:' + operationKey,
            requestHash: input.requestHash,
            allowNegative: false,
            source: 'PAYOUT_RESERVATION',
            delta: input.amount.negated(),
            currency,
            type: RestaurantWalletTransactionType.PAYOUT_DEBIT,
            payoutRequestId: request.id,
            note: 'Payout funds reserved',
            metadata: {
              payoutRequestId: request.id,
              provider: input.provider ?? null,
              lifecycle: 'RESERVATION',
            },
            createdBy: input.actorId,
          },
          tx,
        );
        const updated = await tx.restaurantPayoutRequest.update({
          where: { id: request.id },
          data: { walletTransactionId: reservation.transaction.id },
        });
        return { request: updated, replayed: false };
      },
    );
  }

  async claim(id: string): Promise<PayoutClaim> {
    return this.prisma.$transaction(async (tx) => {
      const request = await this.getForUpdate(id, tx);
      if (this.isCompleted(request.status)) {
        return { request, claimToken: null };
      }
      const now = new Date();
      if (
        request.status === RestaurantPayoutRequestStatus.PROCESSING &&
        request.leaseExpiresAt &&
        request.leaseExpiresAt > now
      ) {
        throw new ConflictException(
          'Payout is already owned by an active worker',
        );
      }
      if (
        request.status !== RestaurantPayoutRequestStatus.RESERVED &&
        request.status !== RestaurantPayoutRequestStatus.NEEDS_RECONCILIATION &&
        request.status !== RestaurantPayoutRequestStatus.PROCESSING
      ) {
        throw new BadRequestException('Payout cannot be sent to the provider');
      }
      const claimToken = randomUUID();
      const updated = await tx.restaurantPayoutRequest.update({
        where: { id: request.id },
        data: {
          status: RestaurantPayoutRequestStatus.PROCESSING,
          claimToken,
          leaseExpiresAt: new Date(now.getTime() + PAYOUT_LEASE_MS),
          attempts: { increment: 1 },
          lastError: null,
        },
      });
      return { request: updated, claimToken };
    });
  }

  async recordProviderSuccess(
    id: string,
    claimToken: string,
    providerReference: string,
    providerStatus: string,
  ): Promise<RestaurantPayoutRequest> {
    const result = await this.prisma.restaurantPayoutRequest.updateMany({
      where: {
        id,
        claimToken,
        status: RestaurantPayoutRequestStatus.PROCESSING,
      },
      data: {
        status: RestaurantPayoutRequestStatus.PROVIDER_SUCCEEDED,
        providerReference,
        paymentReference: providerReference,
        providerStatus,
        providerSucceededAt: new Date(),
        leaseExpiresAt: null,
      },
    });
    if (result.count !== 1) {
      const recovered = await this.prisma.restaurantPayoutRequest.findUnique({
        where: { id },
      });
      if (
        recovered &&
        this.isCompleted(recovered.status) &&
        recovered.providerReference === providerReference
      ) {
        return recovered;
      }
      throw new ConflictException('Payout worker ownership is stale');
    }
    return this.complete(id, claimToken);
  }

  async complete(
    id: string,
    claimToken?: string,
    actorId?: string,
    note?: string,
  ): Promise<RestaurantPayoutRequest> {
    return this.prisma.$transaction(async (tx) => {
      const request = await this.getForUpdate(id, tx);
      if (this.isCompleted(request.status)) return request;
      if (request.status !== RestaurantPayoutRequestStatus.PROVIDER_SUCCEEDED) {
        throw new BadRequestException(
          'Provider success must be durable before completion',
        );
      }
      if (claimToken && request.claimToken !== claimToken) {
        throw new ConflictException('Payout worker ownership is stale');
      }
      return tx.restaurantPayoutRequest.update({
        where: { id },
        data: {
          status: RestaurantPayoutRequestStatus.COMPLETED,
          paidBy: actorId ?? request.paidBy,
          paidAt: request.paidAt ?? new Date(),
          paidNote: note ?? request.paidNote,
          claimToken: null,
          leaseExpiresAt: null,
          lastError: null,
        },
      });
    });
  }

  async completeManual(
    id: string,
    actorId: string,
    paymentReference: string | null,
    note: string,
  ): Promise<RestaurantPayoutRequest> {
    return this.prisma.$transaction(async (tx) => {
      const request = await this.getForUpdate(id, tx);
      if (this.isCompleted(request.status)) return request;
      if (!request.walletTransactionId) {
        throw new ConflictException('Payout reservation is missing');
      }
      if (
        request.status !== RestaurantPayoutRequestStatus.RESERVED &&
        request.status !== RestaurantPayoutRequestStatus.APPROVED
      ) {
        throw new BadRequestException('Payout cannot be completed manually');
      }
      return tx.restaurantPayoutRequest.update({
        where: { id },
        data: {
          status: RestaurantPayoutRequestStatus.COMPLETED,
          paidBy: actorId,
          paidAt: new Date(),
          paidNote: note,
          paymentReference: paymentReference ?? undefined,
          providerSucceededAt: new Date(),
          providerStatus: 'MANUALLY_CONFIRMED',
          claimToken: null,
          leaseExpiresAt: null,
        },
      });
    });
  }

  async recordAmbiguousFailure(
    id: string,
    claimToken: string,
    message: string,
  ): Promise<void> {
    await this.fencedFailureUpdate(
      id,
      claimToken,
      RestaurantPayoutRequestStatus.NEEDS_RECONCILIATION,
      message,
    );
  }

  async recordProviderPending(
    id: string,
    claimToken: string,
    providerReference: string,
    providerStatus: string,
  ): Promise<RestaurantPayoutRequest> {
    const result = await this.prisma.restaurantPayoutRequest.updateMany({
      where: {
        id,
        claimToken,
        status: RestaurantPayoutRequestStatus.PROCESSING,
      },
      data: {
        status: RestaurantPayoutRequestStatus.NEEDS_RECONCILIATION,
        providerReference,
        paymentReference: providerReference,
        providerStatus,
        claimToken: null,
        leaseExpiresAt: null,
      },
    });
    if (result.count !== 1) {
      throw new ConflictException('Payout worker ownership is stale');
    }
    return this.prisma.restaurantPayoutRequest.findUniqueOrThrow({
      where: { id },
    });
  }

  async reconcileSuccess(
    id: string,
    providerReference: string,
    providerStatus: string,
  ): Promise<RestaurantPayoutRequest> {
    await this.prisma.$transaction(async (tx) => {
      const request = await this.getForUpdate(id, tx);
      if (this.isCompleted(request.status)) return;
      if (
        request.status === RestaurantPayoutRequestStatus.RELEASED ||
        request.status === RestaurantPayoutRequestStatus.CANCELLED
      ) {
        throw new ConflictException(
          'Provider success conflicts with a released reservation',
        );
      }
      if (
        request.providerReference &&
        request.providerReference !== providerReference
      ) {
        throw new ConflictException('Provider payout identity mismatch');
      }
      await tx.restaurantPayoutRequest.update({
        where: { id },
        data: {
          status: RestaurantPayoutRequestStatus.PROVIDER_SUCCEEDED,
          providerReference,
          paymentReference: providerReference,
          providerStatus,
          providerSucceededAt: request.providerSucceededAt ?? new Date(),
          claimToken: null,
          leaseExpiresAt: null,
        },
      });
    });
    return this.complete(id);
  }

  async release(
    id: string,
    actorId: string,
    message: string,
    claimToken?: string,
    cancelled = false,
  ): Promise<RestaurantPayoutRequest> {
    return this.prisma.$transaction(async (tx) => {
      const request = await this.getForUpdate(id, tx);
      if (
        request.status === RestaurantPayoutRequestStatus.RELEASED ||
        request.status === RestaurantPayoutRequestStatus.CANCELLED
      ) {
        return request;
      }
      if (this.isCompleted(request.status) || request.providerSucceededAt) {
        throw new ConflictException(
          'Committed payout funds cannot be released',
        );
      }
      if (claimToken && request.claimToken !== claimToken) {
        throw new ConflictException('Payout worker ownership is stale');
      }
      if (
        cancelled &&
        request.status !== RestaurantPayoutRequestStatus.RESERVED &&
        request.status !== RestaurantPayoutRequestStatus.APPROVED
      ) {
        throw new ConflictException(
          'Payout can only be cancelled before provider commitment',
        );
      }
      if (!request.walletTransactionId) {
        return tx.restaurantPayoutRequest.update({
          where: { id },
          data: {
            status: cancelled
              ? RestaurantPayoutRequestStatus.CANCELLED
              : RestaurantPayoutRequestStatus.REJECTED,
            rejectionReason: cancelled ? undefined : message,
            cancelledAt: cancelled ? new Date() : undefined,
            lastError: message,
            claimToken: null,
            leaseExpiresAt: null,
          },
        });
      }
      const releaseHash = FinancialLedgerRepository.createCanonicalRequestHash({
        payoutRequestId: request.id,
        reservationTransactionId: request.walletTransactionId,
        amount: request.amount.toFixed(2),
        currency: request.currency,
      });
      const released = await this.ledger.applyRestaurantWalletDelta(
        {
          tenantId: request.tenantId,
          restaurantId: request.restaurantId,
          branchId: request.branchId ?? undefined,
          operationKey:
            'payout:release:' + (request.operationKey ?? request.id),
          requestHash: releaseHash,
          allowNegative: false,
          source: 'PAYOUT_RELEASE',
          delta: request.amount,
          currency: request.currency,
          type: RestaurantWalletTransactionType.PAYOUT_RELEASE,
          payoutRequestId: request.id,
          note: message,
          metadata: { payoutRequestId: request.id, lifecycle: 'RELEASE' },
          createdBy: actorId,
        },
        tx,
      );
      return tx.restaurantPayoutRequest.update({
        where: { id },
        data: {
          status: cancelled
            ? RestaurantPayoutRequestStatus.CANCELLED
            : RestaurantPayoutRequestStatus.RELEASED,
          releaseTransactionId: released.transaction.id,
          releasedAt: new Date(),
          cancelledAt: cancelled ? new Date() : undefined,
          claimToken: null,
          leaseExpiresAt: null,
          lastError: message,
        },
      });
    });
  }

  async adoptAndReserveLegacy(
    id: string,
    actorId: string,
  ): Promise<RestaurantPayoutRequest> {
    const snapshot = await this.prisma.restaurantPayoutRequest.findUnique({
      where: { id },
    });
    if (!snapshot) {
      throw new NotFoundException('Restaurant payout request not found');
    }
    if (snapshot.walletTransactionId) return snapshot;
    const adoption = await this.ledger.withFinancialLedgerTransaction(
      [
        {
          tenantId: snapshot.tenantId,
          restaurantId: snapshot.restaurantId,
          accountKind: 'RESTAURANT_WALLET',
        },
      ],
      async (tx) => {
        const request = await this.getForUpdate(id, tx);
        if (request.walletTransactionId) {
          return { request, quarantineReason: null };
        }
        const candidates = await tx.restaurantWalletTransaction.findMany({
          where: {
            payoutRequestId: request.id,
            type: RestaurantWalletTransactionType.PAYOUT_DEBIT,
          },
          select: {
            id: true,
            walletAccountId: true,
            tenantId: true,
            restaurantId: true,
            currency: true,
            amount: true,
          },
          take: 2,
        });
        const expectedCurrency = request.currency.trim().toUpperCase();
        const validCandidates = candidates.filter(
          (candidate) =>
            request.amount.greaterThan(0) &&
            candidate.amount.isNegative() &&
            candidate.walletAccountId === request.walletAccountId &&
            candidate.tenantId === request.tenantId &&
            candidate.restaurantId === request.restaurantId &&
            candidate.currency.trim().toUpperCase() === expectedCurrency &&
            candidate.amount.equals(request.amount.negated()),
        );
        if (candidates.length !== 1 || validCandidates.length !== 1) {
          const reason =
            candidates.length === 0
              ? 'Legacy payout has no wallet debit and is quarantined'
              : candidates.length > 1
                ? 'Legacy payout has ambiguous wallet transactions and is quarantined'
                : 'Legacy payout wallet transaction scope or amount is mismatched and is quarantined';
          const quarantined = await tx.restaurantPayoutRequest.update({
            where: { id: request.id },
            data: {
              status: RestaurantPayoutRequestStatus.NEEDS_RECONCILIATION,
              reviewedBy: actorId,
              lastError: reason,
            },
          });
          return { request: quarantined, quarantineReason: reason };
        }
        const requestHash =
          request.requestHash ??
          FinancialLedgerRepository.createCanonicalRequestHash({
            tenantId: request.tenantId,
            restaurantId: request.restaurantId,
            amount: request.amount.toFixed(2),
            currency: request.currency,
            legacyPayoutRequestId: request.id,
          });
        const transactionId = validCandidates[0].id;
        const adopted = await tx.restaurantPayoutRequest.update({
          where: { id: request.id },
          data: {
            walletTransactionId: transactionId,
            operationKey:
              request.operationKey ??
              FinancialLedgerRepository.createOperationKey(
                'payout:legacy:' + request.id,
              ),
            requestHash,
            status:
              request.status === RestaurantPayoutRequestStatus.REQUESTED
                ? RestaurantPayoutRequestStatus.APPROVED
                : request.status,
          },
        });
        return { request: adopted, quarantineReason: null };
      },
    );
    if (adoption.quarantineReason) {
      throw new ConflictException(adoption.quarantineReason);
    }
    return adoption.request;
  }

  private async fencedFailureUpdate(
    id: string,
    claimToken: string,
    status: RestaurantPayoutRequestStatus,
    message: string,
  ): Promise<void> {
    const result = await this.prisma.restaurantPayoutRequest.updateMany({
      where: {
        id,
        claimToken,
        status: RestaurantPayoutRequestStatus.PROCESSING,
      },
      data: {
        status,
        lastError: message.slice(0, 1000),
        claimToken: null,
        leaseExpiresAt: null,
      },
    });
    if (result.count !== 1) {
      throw new ConflictException('Payout worker ownership is stale');
    }
  }

  private async getForUpdate(
    id: string,
    tx: PrismaTx,
  ): Promise<RestaurantPayoutRequest> {
    const locked = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT "id" FROM "restaurant_payout_requests" WHERE "id" = ${id} FOR UPDATE`,
    );
    if (!locked[0]) {
      throw new NotFoundException('Restaurant payout request not found');
    }
    return tx.restaurantPayoutRequest.findUniqueOrThrow({ where: { id } });
  }

  private assertReplay(
    request: RestaurantPayoutRequest,
    requestHash: string,
  ): void {
    if (request.requestHash !== requestHash) {
      throw new ConflictException(
        'Payout idempotency key was reused with different input',
      );
    }
  }

  private providerKey(operationKey: string): string {
    return 'ff-payout-' + operationKey;
  }

  private isCompleted(status: RestaurantPayoutRequestStatus): boolean {
    return (
      status === RestaurantPayoutRequestStatus.COMPLETED ||
      status === RestaurantPayoutRequestStatus.PAID
    );
  }
}
