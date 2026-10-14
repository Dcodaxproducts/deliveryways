import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  LoyaltyTransaction,
  LoyaltyTransactionType,
  Prisma,
  RestaurantWalletTransaction,
  RestaurantWalletTransactionType,
  WalletTransaction,
  WalletTransactionType,
} from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaTx } from '../../common/types';
import { PrismaService } from '../../database';

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const OPERATION_KEY_DOMAIN = 'feastflow:financial-ledger:v1:';
const ADVISORY_LOCK_SEED = 904_217;

type JsonPrimitive = boolean | number | string | null;
export type CanonicalJson =
  | JsonPrimitive
  | CanonicalJson[]
  | { [key: string]: CanonicalJson | undefined };

export type FinancialAccountKind =
  | 'CUSTOMER_WALLET'
  | 'LOYALTY'
  | 'RESTAURANT_WALLET';

export interface FinancialLedgerScope {
  tenantId: string;
  restaurantId: string;
  customerId?: string;
  accountKind: FinancialAccountKind;
}

interface LedgerOperationBase {
  tenantId: string;
  restaurantId: string;
  operationKey: string;
  requestHash: string;
  allowNegative: boolean;
  source: string;
  branchId?: string;
  orderId?: string;
  paymentTransactionId?: string;
  note?: string;
  metadata?: Prisma.InputJsonObject;
  createdBy?: string;
}

export interface ApplyCustomerWalletDeltaInput extends LedgerOperationBase {
  customerId: string;
  delta: Prisma.Decimal;
  currency: string;
  type: WalletTransactionType;
}

export interface ApplyLoyaltyDeltaInput extends LedgerOperationBase {
  customerId: string;
  delta: number;
  type: LoyaltyTransactionType;
  loyaltyProgramId?: string;
  monetaryValue?: Prisma.Decimal;
  redemptionTarget?: 'WALLET' | 'ORDER_DISCOUNT';
  expiresAt?: Date;
  lifetimeEarnedDelta?: number;
  lifetimeRedeemedDelta?: number;
  manualAdjustedDelta?: number;
}

export interface ApplyRestaurantWalletDeltaInput extends LedgerOperationBase {
  delta: Prisma.Decimal;
  currency: string;
  type: RestaurantWalletTransactionType;
  payoutRequestId?: string;
  subscriptionInvoiceKey?: string;
}

export interface LedgerMutationResult<TTransaction> {
  transaction: TTransaction;
  replayed: boolean;
}

interface CustomerWalletBalanceRow {
  id: string;
  balance: Prisma.Decimal;
  currency: string;
}

interface LoyaltyBalanceRow {
  id: string;
  availablePoints: number;
}

interface RestaurantWalletBalanceRow {
  id: string;
  balance: Prisma.Decimal;
  currency: string;
}

function canonicalize(value: CanonicalJson): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalize).join(',') + ']';
  }
  const entries = Object.entries(value)
    .filter((entry): entry is [string, CanonicalJson] => entry[1] !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return (
    '{' +
    entries
      .map(([key, child]) => JSON.stringify(key) + ':' + canonicalize(child))
      .join(',') +
    '}'
  );
}

function decimalEquals(left: Prisma.Decimal, right: Prisma.Decimal): boolean {
  return new Prisma.Decimal(left).equals(right);
}

function sourceFromMetadata(metadata: Prisma.JsonValue): string | undefined {
  if (
    metadata === null ||
    Array.isArray(metadata) ||
    typeof metadata !== 'object'
  ) {
    return undefined;
  }
  const source = metadata.source;
  return typeof source === 'string' ? source : undefined;
}

@Injectable()
export class FinancialLedgerRepository {
  constructor(private readonly prisma: PrismaService) {}

  static createOperationKey(operationKey: string): string {
    const normalized = operationKey.trim();
    if (!normalized || normalized.length > 2_048) {
      throw new BadRequestException('Financial operation key is invalid');
    }
    return createHash('sha256')
      .update(OPERATION_KEY_DOMAIN)
      .update(normalized)
      .digest('hex');
  }

  static createCanonicalRequestHash(value: CanonicalJson): string {
    return createHash('sha256').update(canonicalize(value)).digest('hex');
  }

  async withFinancialLedgerTransaction<T>(
    scopes: FinancialLedgerScope[],
    work: (tx: PrismaTx) => Promise<T>,
    tx?: PrismaTx,
  ): Promise<T> {
    if (scopes.length === 0 || scopes.length > 64) {
      throw new BadRequestException(
        'Financial ledger transactions require between 1 and 64 scopes',
      );
    }
    if (tx) {
      await this.lockScopes(scopes, tx);
      return work(tx);
    }
    return this.prisma.$transaction(async (transaction) => {
      await this.lockScopes(scopes, transaction);
      return work(transaction);
    });
  }

  async applyCustomerWalletDelta(
    input: ApplyCustomerWalletDeltaInput,
    tx?: PrismaTx,
  ): Promise<LedgerMutationResult<WalletTransaction>> {
    this.validateBaseInput(input);
    if (input.delta.isZero()) {
      throw new BadRequestException('Customer wallet delta must not be zero');
    }
    return this.inTransaction(tx, async (transaction) => {
      await this.lockScopes(
        [this.customerScope(input, 'CUSTOMER_WALLET')],
        transaction,
      );
      const ledgerKey = FinancialLedgerRepository.createOperationKey(
        input.operationKey,
      );
      const existing = await transaction.walletTransaction.findUnique({
        where: { idempotencyKey: ledgerKey },
      });
      if (existing) {
        this.assertWalletReplay(existing, input);
        return { transaction: existing, replayed: true };
      }
      const account = await transaction.walletAccount.upsert({
        where: {
          restaurantId_customerId: {
            restaurantId: input.restaurantId,
            customerId: input.customerId,
          },
        },
        create: {
          tenantId: input.tenantId,
          restaurantId: input.restaurantId,
          customerId: input.customerId,
          currency: input.currency,
        },
        update: {},
      });
      if (
        account.tenantId !== input.tenantId ||
        account.currency !== input.currency
      ) {
        throw new ConflictException(
          'Customer wallet scope or currency conflicts with the operation',
        );
      }
      const rows = await transaction.$queryRaw<CustomerWalletBalanceRow[]>(
        Prisma.sql`
          UPDATE "wallet_accounts"
          SET "balance" = "balance" + ${input.delta},
              "updated_at" = CURRENT_TIMESTAMP
          WHERE "id" = ${account.id}
            AND "tenant_id" = ${input.tenantId}
            AND "restaurant_id" = ${input.restaurantId}
            AND "customer_id" = ${input.customerId}
            AND (${input.allowNegative} OR "balance" + ${input.delta} >= 0)
          RETURNING "id", "balance", "currency"
        `,
      );
      const updated = rows[0];
      if (!updated) {
        throw new BadRequestException('Insufficient customer wallet balance');
      }
      const created = await transaction.walletTransaction.create({
        data: {
          walletAccountId: updated.id,
          tenantId: input.tenantId,
          restaurantId: input.restaurantId,
          customerId: input.customerId,
          branchId: input.branchId,
          orderId: input.orderId,
          paymentTransactionId: input.paymentTransactionId,
          type: input.type,
          amount: input.delta,
          balanceAfter: updated.balance,
          currency: updated.currency,
          note: input.note,
          metadata: this.ledgerMetadata(input),
          createdBy: input.createdBy,
          updatedBy: input.createdBy,
          idempotencyKey: ledgerKey,
          requestHash: input.requestHash,
        },
      });
      return { transaction: created, replayed: false };
    });
  }

  async applyLoyaltyDelta(
    input: ApplyLoyaltyDeltaInput,
    tx?: PrismaTx,
  ): Promise<LedgerMutationResult<LoyaltyTransaction>> {
    this.validateBaseInput(input);
    if (!Number.isSafeInteger(input.delta) || input.delta === 0) {
      throw new BadRequestException(
        'Loyalty delta must be a non-zero safe integer',
      );
    }
    const counters = [
      input.lifetimeEarnedDelta ?? 0,
      input.lifetimeRedeemedDelta ?? 0,
      input.manualAdjustedDelta ?? 0,
    ];
    if (counters.some((value) => !Number.isSafeInteger(value))) {
      throw new BadRequestException(
        'Loyalty counter deltas must be safe integers',
      );
    }
    return this.inTransaction(tx, async (transaction) => {
      await this.lockScopes(
        [this.customerScope(input, 'LOYALTY')],
        transaction,
      );
      const ledgerKey = FinancialLedgerRepository.createOperationKey(
        input.operationKey,
      );
      const existing = await transaction.loyaltyTransaction.findUnique({
        where: { idempotencyKey: ledgerKey },
      });
      if (existing) {
        this.assertLoyaltyReplay(existing, input);
        return { transaction: existing, replayed: true };
      }
      const account = await transaction.loyaltyAccount.upsert({
        where: {
          restaurantId_customerId: {
            restaurantId: input.restaurantId,
            customerId: input.customerId,
          },
        },
        create: {
          tenantId: input.tenantId,
          restaurantId: input.restaurantId,
          customerId: input.customerId,
        },
        update: {},
      });
      if (account.tenantId !== input.tenantId) {
        throw new ConflictException(
          'Loyalty account scope conflicts with the operation',
        );
      }
      const rows = await transaction.$queryRaw<LoyaltyBalanceRow[]>(
        Prisma.sql`
          UPDATE "loyalty_accounts"
          SET "available_points" = "available_points" + ${input.delta},
              "lifetime_earned_points" = "lifetime_earned_points" + ${input.lifetimeEarnedDelta ?? 0},
              "lifetime_redeemed_points" = "lifetime_redeemed_points" + ${input.lifetimeRedeemedDelta ?? 0},
              "manual_adjusted_points" = "manual_adjusted_points" + ${input.manualAdjustedDelta ?? 0},
              "updated_at" = CURRENT_TIMESTAMP
          WHERE "id" = ${account.id}
            AND "tenant_id" = ${input.tenantId}
            AND "restaurant_id" = ${input.restaurantId}
            AND "customer_id" = ${input.customerId}
            AND (${input.allowNegative} OR "available_points" + ${input.delta} >= 0)
          RETURNING "id", "available_points" AS "availablePoints"
        `,
      );
      const updated = rows[0];
      if (!updated) {
        throw new BadRequestException('Insufficient loyalty points');
      }
      const created = await transaction.loyaltyTransaction.create({
        data: {
          loyaltyAccountId: updated.id,
          loyaltyProgramId: input.loyaltyProgramId,
          tenantId: input.tenantId,
          restaurantId: input.restaurantId,
          customerId: input.customerId,
          branchId: input.branchId,
          orderId: input.orderId,
          paymentTransactionId: input.paymentTransactionId,
          type: input.type,
          points: input.delta,
          balanceAfter: updated.availablePoints,
          monetaryValue: input.monetaryValue,
          redemptionTarget: input.redemptionTarget,
          note: input.note,
          metadata: this.ledgerMetadata(input),
          expiresAt: input.expiresAt,
          createdBy: input.createdBy,
          updatedBy: input.createdBy,
          idempotencyKey: ledgerKey,
          requestHash: input.requestHash,
        },
      });
      return { transaction: created, replayed: false };
    });
  }

  async applyRestaurantWalletDelta(
    input: ApplyRestaurantWalletDeltaInput,
    tx?: PrismaTx,
  ): Promise<LedgerMutationResult<RestaurantWalletTransaction>> {
    this.validateBaseInput(input);
    if (input.delta.isZero()) {
      throw new BadRequestException('Restaurant wallet delta must not be zero');
    }
    return this.inTransaction(tx, async (transaction) => {
      await this.lockScopes([this.restaurantScope(input)], transaction);
      const ledgerKey = FinancialLedgerRepository.createOperationKey(
        input.operationKey,
      );
      const existing = await transaction.restaurantWalletTransaction.findUnique(
        {
          where: { idempotencyKey: ledgerKey },
        },
      );
      if (existing) {
        this.assertRestaurantReplay(existing, input);
        return { transaction: existing, replayed: true };
      }
      const account = await transaction.restaurantWalletAccount.upsert({
        where: { restaurantId: input.restaurantId },
        create: {
          tenantId: input.tenantId,
          restaurantId: input.restaurantId,
          currency: input.currency,
        },
        update: {},
      });
      if (
        account.tenantId !== input.tenantId ||
        account.currency !== input.currency
      ) {
        throw new ConflictException(
          'Restaurant wallet scope or currency conflicts with the operation',
        );
      }
      const rows = await transaction.$queryRaw<RestaurantWalletBalanceRow[]>(
        Prisma.sql`
          UPDATE "restaurant_wallet_accounts"
          SET "balance" = "balance" + ${input.delta},
              "updated_at" = CURRENT_TIMESTAMP
          WHERE "id" = ${account.id}
            AND "tenant_id" = ${input.tenantId}
            AND "restaurant_id" = ${input.restaurantId}
            AND (${input.allowNegative} OR "balance" + ${input.delta} >= 0)
          RETURNING "id", "balance", "currency"
        `,
      );
      const updated = rows[0];
      if (!updated) {
        throw new BadRequestException('Insufficient restaurant wallet balance');
      }
      const created = await transaction.restaurantWalletTransaction.create({
        data: {
          walletAccountId: updated.id,
          tenantId: input.tenantId,
          restaurantId: input.restaurantId,
          branchId: input.branchId,
          orderId: input.orderId,
          paymentTransactionId: input.paymentTransactionId,
          payoutRequestId: input.payoutRequestId,
          subscriptionInvoiceKey: input.subscriptionInvoiceKey,
          type: input.type,
          amount: input.delta,
          balanceAfter: updated.balance,
          currency: updated.currency,
          note: input.note,
          metadata: this.ledgerMetadata(input),
          createdBy: input.createdBy,
          idempotencyKey: ledgerKey,
          requestHash: input.requestHash,
        },
      });
      return { transaction: created, replayed: false };
    });
  }

  private async inTransaction<T>(
    tx: PrismaTx | undefined,
    work: (transaction: PrismaTx) => Promise<T>,
  ): Promise<T> {
    return tx ? work(tx) : this.prisma.$transaction(work);
  }

  private async lockScopes(
    scopes: FinancialLedgerScope[],
    tx: PrismaTx,
  ): Promise<void> {
    const keys = [
      ...new Set(scopes.map((scope) => this.scopeKey(scope))),
    ].sort();
    for (const key of keys) {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, ${ADVISORY_LOCK_SEED}))`,
      );
    }
  }

  private scopeKey(scope: FinancialLedgerScope): string {
    if (
      !scope.tenantId ||
      !scope.restaurantId ||
      (scope.accountKind !== 'RESTAURANT_WALLET' && !scope.customerId)
    ) {
      throw new BadRequestException(
        'Financial ledger lock scope is incomplete',
      );
    }
    const customer = scope.customerId ?? '-';
    return [scope.tenantId, scope.restaurantId, customer, scope.accountKind]
      .map((part) => part.length + ':' + part)
      .join('|');
  }

  private customerScope(
    input: { tenantId: string; restaurantId: string; customerId: string },
    accountKind: 'CUSTOMER_WALLET' | 'LOYALTY',
  ): FinancialLedgerScope {
    return {
      tenantId: input.tenantId,
      restaurantId: input.restaurantId,
      customerId: input.customerId,
      accountKind,
    };
  }

  private restaurantScope(input: {
    tenantId: string;
    restaurantId: string;
  }): FinancialLedgerScope {
    return {
      tenantId: input.tenantId,
      restaurantId: input.restaurantId,
      accountKind: 'RESTAURANT_WALLET',
    };
  }

  private validateBaseInput(input: LedgerOperationBase): void {
    if (!input.tenantId || !input.restaurantId || !input.source.trim()) {
      throw new BadRequestException(
        'Financial ledger scope and source are required',
      );
    }
    if (!HASH_PATTERN.test(input.requestHash)) {
      throw new BadRequestException(
        'Financial request hash must be a lowercase SHA-256 digest',
      );
    }
    FinancialLedgerRepository.createOperationKey(input.operationKey);
  }

  private ledgerMetadata(input: LedgerOperationBase): Prisma.InputJsonObject {
    return { ...(input.metadata ?? {}), source: input.source };
  }

  private assertRequestIdentity(
    existingHash: string | null,
    expectedHash: string,
    legacyMatches: boolean,
  ): void {
    const matches =
      existingHash === null ? legacyMatches : existingHash === expectedHash;
    if (!matches) {
      throw new ConflictException(
        'Financial operation key conflicts with an existing ledger entry',
      );
    }
  }

  private assertWalletReplay(
    existing: WalletTransaction,
    input: ApplyCustomerWalletDeltaInput,
  ): void {
    const scopeMatches =
      existing.tenantId === input.tenantId &&
      existing.restaurantId === input.restaurantId &&
      existing.customerId === input.customerId;
    const legacyMatches =
      scopeMatches &&
      existing.type === input.type &&
      decimalEquals(existing.amount, input.delta) &&
      sourceFromMetadata(existing.metadata) === input.source &&
      existing.branchId === (input.branchId ?? null) &&
      existing.orderId === (input.orderId ?? null) &&
      existing.paymentTransactionId === (input.paymentTransactionId ?? null);
    this.assertRequestIdentity(
      existing.requestHash,
      input.requestHash,
      legacyMatches,
    );
    if (!scopeMatches) {
      throw new ConflictException(
        'Financial operation key conflicts with another customer wallet scope',
      );
    }
  }

  private assertLoyaltyReplay(
    existing: LoyaltyTransaction,
    input: ApplyLoyaltyDeltaInput,
  ): void {
    const scopeMatches =
      existing.tenantId === input.tenantId &&
      existing.restaurantId === input.restaurantId &&
      existing.customerId === input.customerId;
    const legacyMatches =
      scopeMatches &&
      existing.type === input.type &&
      existing.points === input.delta &&
      sourceFromMetadata(existing.metadata) === input.source &&
      existing.branchId === (input.branchId ?? null) &&
      existing.orderId === (input.orderId ?? null) &&
      existing.paymentTransactionId === (input.paymentTransactionId ?? null);
    this.assertRequestIdentity(
      existing.requestHash,
      input.requestHash,
      legacyMatches,
    );
    if (!scopeMatches) {
      throw new ConflictException(
        'Financial operation key conflicts with another loyalty scope',
      );
    }
  }

  private assertRestaurantReplay(
    existing: RestaurantWalletTransaction,
    input: ApplyRestaurantWalletDeltaInput,
  ): void {
    const scopeMatches =
      existing.tenantId === input.tenantId &&
      existing.restaurantId === input.restaurantId;
    const legacyMatches =
      scopeMatches &&
      existing.type === input.type &&
      decimalEquals(existing.amount, input.delta) &&
      sourceFromMetadata(existing.metadata) === input.source &&
      existing.branchId === (input.branchId ?? null) &&
      existing.orderId === (input.orderId ?? null) &&
      existing.paymentTransactionId === (input.paymentTransactionId ?? null);
    this.assertRequestIdentity(
      existing.requestHash,
      input.requestHash,
      legacyMatches,
    );
    if (!scopeMatches) {
      throw new ConflictException(
        'Financial operation key conflicts with another restaurant wallet scope',
      );
    }
  }
}
