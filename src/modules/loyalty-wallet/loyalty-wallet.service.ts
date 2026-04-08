import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  LoyaltyRedemptionTarget,
  LoyaltyTransactionType,
  PaymentStatus,
  Prisma,
  WalletTransactionType,
} from '@prisma/client';
import { PrismaTx } from '../../common/types';
import { PrismaService } from '../../database';
import { LoyaltyWalletRepository } from './loyalty-wallet.repository';

export interface CustomerWalletLoyaltyContext {
  customerId: string;
  tenantId: string;
  restaurantId: string;
  branchId?: string | null;
}

export interface QuoteBenefitsInput extends CustomerWalletLoyaltyContext {
  branchId: string;
  subtotal: Prisma.Decimal;
  totalBeforeBenefits: Prisma.Decimal;
  requestedWalletAmount?: number;
  requestedLoyaltyPoints?: number;
}

export interface QuoteBenefitsResult {
  walletAppliedAmount: Prisma.Decimal;
  loyaltyDiscountAmount: Prisma.Decimal;
  loyaltyPointsRedeemed: number;
  totalAmount: Prisma.Decimal;
}

@Injectable()
export class LoyaltyWalletService {
  constructor(
    private readonly repository: LoyaltyWalletRepository,
    private readonly prisma: PrismaService,
  ) {}

  async getWalletSummary(context: CustomerWalletLoyaltyContext) {
    const walletAccount = await this.ensureWalletAccount(context);
    const history = await this.repository.listWalletTransactions(walletAccount.id);

    return {
      customerId: context.customerId,
      balance: Number(walletAccount.balance),
      currency: walletAccount.currency,
      history: history.map((entry) => ({
        id: entry.id,
        type: entry.type,
        amount: Number(entry.amount),
        balanceAfter: Number(entry.balanceAfter),
        currency: entry.currency,
        orderId: entry.orderId,
        paymentTransactionId: entry.paymentTransactionId,
        note: entry.note,
        metadata: entry.metadata,
        createdAt: entry.createdAt,
      })),
    };
  }

  async getLoyaltySummary(context: CustomerWalletLoyaltyContext) {
    const loyaltyAccount = await this.ensureLoyaltyAccount(context);
    const program = await this.ensureLoyaltyProgram(context);
    const history = await this.repository.listLoyaltyTransactions(loyaltyAccount.id);

    return {
      customerId: context.customerId,
      availablePoints: loyaltyAccount.availablePoints,
      redeemedPoints: loyaltyAccount.lifetimeRedeemedPoints,
      earnedPoints: loyaltyAccount.lifetimeEarnedPoints,
      minimumRedeemPoints: program.minimumRedeemPoints,
      redemptionValuePerPoint: Number(program.redemptionValuePerPoint),
      history: history.map((entry) => ({
        id: entry.id,
        type: entry.type,
        points: entry.points,
        balanceAfter: entry.balanceAfter,
        monetaryValue: entry.monetaryValue ? Number(entry.monetaryValue) : null,
        redemptionTarget: entry.redemptionTarget,
        orderId: entry.orderId,
        paymentTransactionId: entry.paymentTransactionId,
        note: entry.note,
        metadata: entry.metadata,
        createdAt: entry.createdAt,
        expiresAt: entry.expiresAt,
      })),
    };
  }

  async redeemPointsToWallet(
    context: CustomerWalletLoyaltyContext,
    points: number,
    note?: string,
    actorId?: string,
  ) {
    const program = await this.ensureLoyaltyProgram(context);
    if (!program.isActive) {
      throw new BadRequestException('Loyalty program is inactive');
    }

    if (!program.allowWalletConversion) {
      throw new BadRequestException('Wallet redemption is not enabled');
    }

    if (points < program.minimumRedeemPoints) {
      throw new BadRequestException(
        `Minimum redeemable points are ${program.minimumRedeemPoints}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const loyaltyAccount = await this.ensureLoyaltyAccount(context, tx);
      if (loyaltyAccount.availablePoints < points) {
        throw new BadRequestException('Insufficient loyalty points');
      }

      const walletAccount = await this.ensureWalletAccount(context, tx);
      const redeemedAmount = new Prisma.Decimal(points).mul(
        program.redemptionValuePerPoint,
      );
      const nextPoints = loyaltyAccount.availablePoints - points;
      const nextWalletBalance = walletAccount.balance.plus(redeemedAmount);

      await this.repository.updateLoyaltyAccount(
        loyaltyAccount.id,
        {
          availablePoints: nextPoints,
          lifetimeRedeemedPoints: {
            increment: points,
          },
        },
        tx,
      );

      await this.repository.createLoyaltyTransaction(
        {
          loyaltyAccount: { connect: { id: loyaltyAccount.id } },
          loyaltyProgram: { connect: { id: program.id } },
          tenant: { connect: { id: context.tenantId } },
          restaurant: { connect: { id: context.restaurantId } },
          branch: context.branchId
            ? { connect: { id: context.branchId } }
            : undefined,
          customer: { connect: { id: context.customerId } },
          type: LoyaltyTransactionType.REDEEM,
          points: -points,
          balanceAfter: nextPoints,
          monetaryValue: redeemedAmount,
          redemptionTarget: LoyaltyRedemptionTarget.WALLET,
          note: note?.trim() || 'Loyalty points redeemed to wallet',
          createdBy: actorId,
          updatedBy: actorId,
        },
        tx,
      );

      await this.repository.updateWalletAccount(
        walletAccount.id,
        {
          balance: nextWalletBalance,
        },
        tx,
      );

      await this.repository.createWalletTransaction(
        {
          walletAccount: { connect: { id: walletAccount.id } },
          tenant: { connect: { id: context.tenantId } },
          restaurant: { connect: { id: context.restaurantId } },
          branch: context.branchId
            ? { connect: { id: context.branchId } }
            : undefined,
          customer: { connect: { id: context.customerId } },
          type: WalletTransactionType.LOYALTY_REDEMPTION,
          amount: redeemedAmount,
          balanceAfter: nextWalletBalance,
          currency: walletAccount.currency,
          note: note?.trim() || 'Wallet credited from loyalty redemption',
          metadata: {
            pointsRedeemed: points,
          },
          createdBy: actorId,
          updatedBy: actorId,
        },
        tx,
      );

      return {
        customerId: context.customerId,
        redeemedPoints: points,
        redeemedAmount: Number(redeemedAmount),
        remainingPoints: nextPoints,
        walletBalance: Number(nextWalletBalance),
        currency: walletAccount.currency,
      };
    });
  }

  async calculateQuoteBenefits(input: QuoteBenefitsInput): Promise<QuoteBenefitsResult> {
    const totalBeforeBenefits = input.totalBeforeBenefits;
    let runningTotal = totalBeforeBenefits;
    let walletAppliedAmount = new Prisma.Decimal(0);
    let loyaltyDiscountAmount = new Prisma.Decimal(0);
    let loyaltyPointsRedeemed = 0;

    if (input.requestedLoyaltyPoints && input.requestedLoyaltyPoints > 0) {
      const program = await this.ensureLoyaltyProgram(input);
      const loyaltyAccount = await this.ensureLoyaltyAccount(input);

      if (!program.isActive || !program.allowOrderDiscount) {
        throw new BadRequestException('Loyalty order discount is not enabled');
      }

      if (input.requestedLoyaltyPoints < program.minimumRedeemPoints) {
        throw new BadRequestException(
          `Minimum redeemable points are ${program.minimumRedeemPoints}`,
        );
      }

      if (loyaltyAccount.availablePoints < input.requestedLoyaltyPoints) {
        throw new BadRequestException('Insufficient loyalty points');
      }

      loyaltyDiscountAmount = new Prisma.Decimal(input.requestedLoyaltyPoints)
        .mul(program.redemptionValuePerPoint)
        .toDecimalPlaces(2);

      if (loyaltyDiscountAmount.greaterThan(runningTotal)) {
        loyaltyDiscountAmount = runningTotal;
      }

      loyaltyPointsRedeemed = input.requestedLoyaltyPoints;
      runningTotal = runningTotal.minus(loyaltyDiscountAmount);
    }

    if (input.requestedWalletAmount && input.requestedWalletAmount > 0) {
      const walletAccount = await this.ensureWalletAccount(input);
      const requestedWalletAmount = new Prisma.Decimal(input.requestedWalletAmount);

      if (requestedWalletAmount.greaterThan(walletAccount.balance)) {
        throw new BadRequestException('Insufficient wallet balance');
      }

      walletAppliedAmount = requestedWalletAmount.greaterThan(runningTotal)
        ? runningTotal
        : requestedWalletAmount;
      runningTotal = runningTotal.minus(walletAppliedAmount);
    }

    if (runningTotal.lessThan(0)) {
      runningTotal = new Prisma.Decimal(0);
    }

    return {
      walletAppliedAmount: walletAppliedAmount.toDecimalPlaces(2),
      loyaltyDiscountAmount: loyaltyDiscountAmount.toDecimalPlaces(2),
      loyaltyPointsRedeemed,
      totalAmount: runningTotal.toDecimalPlaces(2),
    };
  }

  async applyOrderBenefits(
    tx: PrismaTx,
    context: CustomerWalletLoyaltyContext,
    order: {
      id: string;
      walletAppliedAmount: Prisma.Decimal;
      loyaltyDiscountAmount: Prisma.Decimal;
      loyaltyPointsRedeemed: number;
    },
    actorId?: string,
  ) {
    if (order.walletAppliedAmount.greaterThan(0)) {
      const walletAccount = await this.ensureWalletAccount(context, tx);
      const nextBalance = walletAccount.balance.minus(order.walletAppliedAmount);
      if (nextBalance.lessThan(0)) {
        throw new BadRequestException('Insufficient wallet balance');
      }

      await this.repository.updateWalletAccount(
        walletAccount.id,
        { balance: nextBalance },
        tx,
      );

      await this.repository.createWalletTransaction(
        {
          walletAccount: { connect: { id: walletAccount.id } },
          tenant: { connect: { id: context.tenantId } },
          restaurant: { connect: { id: context.restaurantId } },
          branch: { connect: { id: context.branchId! } },
          customer: { connect: { id: context.customerId } },
          order: { connect: { id: order.id } },
          type: WalletTransactionType.DEBIT,
          amount: order.walletAppliedAmount.mul(-1),
          balanceAfter: nextBalance,
          currency: walletAccount.currency,
          note: 'Wallet applied on order checkout',
          metadata: {
            loyaltyDiscountAmount: Number(order.loyaltyDiscountAmount),
          },
          createdBy: actorId,
          updatedBy: actorId,
        },
        tx,
      );
    }

    if (order.loyaltyPointsRedeemed > 0) {
      const loyaltyAccount = await this.ensureLoyaltyAccount(context, tx);
      const program = await this.ensureLoyaltyProgram(context, tx);
      const nextPoints = loyaltyAccount.availablePoints - order.loyaltyPointsRedeemed;
      if (nextPoints < 0) {
        throw new BadRequestException('Insufficient loyalty points');
      }

      await this.repository.updateLoyaltyAccount(
        loyaltyAccount.id,
        {
          availablePoints: nextPoints,
          lifetimeRedeemedPoints: {
            increment: order.loyaltyPointsRedeemed,
          },
        },
        tx,
      );

      await this.repository.createLoyaltyTransaction(
        {
          loyaltyAccount: { connect: { id: loyaltyAccount.id } },
          loyaltyProgram: { connect: { id: program.id } },
          tenant: { connect: { id: context.tenantId } },
          restaurant: { connect: { id: context.restaurantId } },
          branch: { connect: { id: context.branchId! } },
          customer: { connect: { id: context.customerId } },
          order: { connect: { id: order.id } },
          type: LoyaltyTransactionType.REDEEM,
          points: -order.loyaltyPointsRedeemed,
          balanceAfter: nextPoints,
          monetaryValue: order.loyaltyDiscountAmount,
          redemptionTarget: LoyaltyRedemptionTarget.ORDER_DISCOUNT,
          note: 'Loyalty points applied as order discount',
          createdBy: actorId,
          updatedBy: actorId,
        },
        tx,
      );
    }
  }

  async awardPointsForPaidOrder(
    orderId: string,
    paymentTransactionId?: string,
    actorId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.repository.findOrderWithBenefits(orderId, tx);
      if (!order) {
        throw new NotFoundException('Order not found');
      }

      if (order.paymentStatus !== PaymentStatus.PAID) {
        return null;
      }

      const existingEarns = await this.repository.countLoyaltyEarnTransactions(
        orderId,
        tx,
      );
      if (existingEarns > 0 || order.loyaltyPointsAwarded > 0) {
        return null;
      }

      const context = {
        customerId: order.customerId,
        tenantId: order.tenantId,
        restaurantId: order.restaurantId,
        branchId: order.branchId,
      };
      const program = await this.ensureLoyaltyProgram(context, tx);
      if (!program.isActive || program.pointsPerCurrencyUnit.lessThanOrEqualTo(0)) {
        return null;
      }

      const qualifyingAmount = order.totalAmount.plus(order.walletAppliedAmount);
      const pointsAwarded = Math.floor(
        Number(qualifyingAmount.mul(program.pointsPerCurrencyUnit)),
      );
      if (pointsAwarded <= 0) {
        return null;
      }

      const loyaltyAccount = await this.ensureLoyaltyAccount(context, tx);
      const nextPoints = loyaltyAccount.availablePoints + pointsAwarded;
      const expiresAt =
        program.pointsExpiryDays && program.pointsExpiryDays > 0
          ? new Date(Date.now() + program.pointsExpiryDays * 24 * 60 * 60 * 1000)
          : null;

      await this.repository.updateLoyaltyAccount(
        loyaltyAccount.id,
        {
          availablePoints: nextPoints,
          lifetimeEarnedPoints: { increment: pointsAwarded },
        },
        tx,
      );

      await this.repository.createLoyaltyTransaction(
        {
          loyaltyAccount: { connect: { id: loyaltyAccount.id } },
          loyaltyProgram: { connect: { id: program.id } },
          tenant: { connect: { id: context.tenantId } },
          restaurant: { connect: { id: context.restaurantId } },
          branch: { connect: { id: context.branchId } },
          customer: { connect: { id: context.customerId } },
          order: { connect: { id: order.id } },
          paymentTransaction: paymentTransactionId
            ? { connect: { id: paymentTransactionId } }
            : undefined,
          type: LoyaltyTransactionType.EARN,
          points: pointsAwarded,
          balanceAfter: nextPoints,
          monetaryValue: qualifyingAmount,
          note: 'Loyalty points earned on paid order',
          expiresAt,
          createdBy: actorId,
          updatedBy: actorId,
        },
        tx,
      );

      await this.repository.updateOrderBenefits(
        order.id,
        { loyaltyPointsAwarded: pointsAwarded },
        tx,
      );

      return pointsAwarded;
    });
  }

  async restoreOrderBenefits(
    orderId: string,
    reason: 'REFUND' | 'PAYMENT_REVERSAL',
    actorId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.repository.findOrderWithBenefits(orderId, tx);
      if (!order) {
        throw new NotFoundException('Order not found');
      }

      const context = {
        customerId: order.customerId,
        tenantId: order.tenantId,
        restaurantId: order.restaurantId,
        branchId: order.branchId,
      };

      if (order.walletAppliedAmount.greaterThan(0)) {
        const walletRestoreCount = await this.repository.countWalletRestoreTransactions(
          order.id,
          tx,
        );
        if (!walletRestoreCount) {
          const walletAccount = await this.ensureWalletAccount(context, tx);
          const nextBalance = walletAccount.balance.plus(order.walletAppliedAmount);
          await this.repository.updateWalletAccount(
            walletAccount.id,
            { balance: nextBalance },
            tx,
          );
          await this.repository.createWalletTransaction(
            {
              walletAccount: { connect: { id: walletAccount.id } },
              tenant: { connect: { id: context.tenantId } },
              restaurant: { connect: { id: context.restaurantId } },
              branch: { connect: { id: context.branchId } },
              customer: { connect: { id: context.customerId } },
              order: { connect: { id: order.id } },
              type:
                reason === 'REFUND'
                  ? WalletTransactionType.REFUND
                  : WalletTransactionType.PAYMENT_REVERSAL,
              amount: order.walletAppliedAmount,
              balanceAfter: nextBalance,
              currency: 'PKR',
              note: 'Wallet amount restored from order reversal',
              createdBy: actorId,
              updatedBy: actorId,
            },
            tx,
          );
        }
      }

      if (order.loyaltyPointsRedeemed > 0) {
        const loyaltyRestoreCount = await this.repository.countLoyaltyRestoreTransactions(
          order.id,
          tx,
        );
        if (!loyaltyRestoreCount) {
          const loyaltyAccount = await this.ensureLoyaltyAccount(context, tx);
          const program = await this.ensureLoyaltyProgram(context, tx);
          const nextPoints = loyaltyAccount.availablePoints + order.loyaltyPointsRedeemed;
          await this.repository.updateLoyaltyAccount(
            loyaltyAccount.id,
            {
              availablePoints: nextPoints,
              lifetimeRedeemedPoints: {
                decrement: order.loyaltyPointsRedeemed,
              },
            },
            tx,
          );
          await this.repository.createLoyaltyTransaction(
            {
              loyaltyAccount: { connect: { id: loyaltyAccount.id } },
              loyaltyProgram: { connect: { id: program.id } },
              tenant: { connect: { id: context.tenantId } },
              restaurant: { connect: { id: context.restaurantId } },
              branch: { connect: { id: context.branchId } },
              customer: { connect: { id: context.customerId } },
              order: { connect: { id: order.id } },
              type: LoyaltyTransactionType.RESTORE,
              points: order.loyaltyPointsRedeemed,
              balanceAfter: nextPoints,
              monetaryValue: order.loyaltyDiscountAmount,
              redemptionTarget: LoyaltyRedemptionTarget.ORDER_DISCOUNT,
              note: 'Loyalty points restored from order reversal',
              createdBy: actorId,
              updatedBy: actorId,
            },
            tx,
          );
        }
      }
    });
  }

  async ensureWalletAccount(
    context: CustomerWalletLoyaltyContext,
    tx?: PrismaTx,
  ) {
    const existing = await this.repository.findWalletAccount(
      context.restaurantId,
      context.customerId,
      tx,
    );
    if (existing) {
      return existing;
    }

    const metadata = await this.readLegacyMetadata(context.customerId);
    const legacyBalance = this.readNumber(metadata, [
      ['customerApp', 'wallet', 'balance'],
      ['wallet', 'balance'],
    ]);
    const legacyCurrency =
      this.readString(metadata, [
        ['customerApp', 'wallet', 'currency'],
        ['wallet', 'currency'],
      ]) ?? 'PKR';

    return this.repository.createWalletAccount(
      {
        tenant: { connect: { id: context.tenantId } },
        restaurant: { connect: { id: context.restaurantId } },
        customer: { connect: { id: context.customerId } },
        balance: new Prisma.Decimal(legacyBalance),
        currency: legacyCurrency,
      },
      tx,
    );
  }

  async ensureLoyaltyAccount(
    context: CustomerWalletLoyaltyContext,
    tx?: PrismaTx,
  ) {
    const existing = await this.repository.findLoyaltyAccount(
      context.restaurantId,
      context.customerId,
      tx,
    );
    if (existing) {
      return existing;
    }

    const metadata = await this.readLegacyMetadata(context.customerId);
    const availablePoints = this.readNumber(metadata, [
      ['customerApp', 'loyaltyPoints'],
      ['loyaltyPoints'],
    ]);
    const redeemedPoints = this.readNumber(metadata, [
      ['customerApp', 'loyaltyRedeemedPoints'],
      ['loyaltyRedeemedPoints'],
    ]);

    return this.repository.createLoyaltyAccount(
      {
        tenant: { connect: { id: context.tenantId } },
        restaurant: { connect: { id: context.restaurantId } },
        customer: { connect: { id: context.customerId } },
        availablePoints,
        lifetimeEarnedPoints: availablePoints + redeemedPoints,
        lifetimeRedeemedPoints: redeemedPoints,
        manualAdjustedPoints: 0,
      },
      tx,
    );
  }

  async ensureLoyaltyProgram(
    context: Pick<CustomerWalletLoyaltyContext, 'tenantId' | 'restaurantId'>,
    tx?: PrismaTx,
  ) {
    const existing = await this.repository.findLoyaltyProgram(
      context.restaurantId,
      tx,
    );
    if (existing) {
      return existing;
    }

    return this.repository.createLoyaltyProgram(
      {
        tenant: { connect: { id: context.tenantId } },
        restaurant: { connect: { id: context.restaurantId } },
        isActive: true,
        pointsPerCurrencyUnit: new Prisma.Decimal(0.05),
        currencyAmountPerPoint: new Prisma.Decimal(1),
        redemptionValuePerPoint: new Prisma.Decimal(1),
        minimumRedeemPoints: 50,
        allowWalletConversion: true,
        allowOrderDiscount: true,
      },
      tx,
    );
  }

  private async readLegacyMetadata(customerId: string) {
    const profile = await this.repository.findProfileMetadata(customerId);
    return profile?.metadata;
  }

  private readPath(
    value: unknown,
    path: readonly string[],
  ): unknown {
    let current = value;
    for (const key of path) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  }

  private readNumber(
    value: unknown,
    paths: ReadonlyArray<readonly string[]>,
  ) {
    for (const path of paths) {
      const found = this.readPath(value, path);
      if (typeof found === 'number' && Number.isFinite(found)) {
        return found;
      }
      if (typeof found === 'string') {
        const parsed = Number(found);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }
    return 0;
  }

  private readString(
    value: unknown,
    paths: ReadonlyArray<readonly string[]>,
  ) {
    for (const path of paths) {
      const found = this.readPath(value, path);
      if (typeof found === 'string' && found.trim().length) {
        return found.trim();
      }
    }
    return undefined;
  }
}
