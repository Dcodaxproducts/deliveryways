import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  CouponApplyMode,
  CouponCampaignKind,
  CouponDiscountType,
  CouponStatus,
  LoyaltyRedemptionTarget,
  LoyaltyTransactionType,
  PaymentStatus,
  Prisma,
  WalletTransactionType,
} from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { QueryDto } from '../../common/dto';
import { PrismaTx } from '../../common/types';
import { PrismaService } from '../../database';
import { AdjustCustomerLoyaltyPointsDto, UpdateLoyaltyProgramDto } from './dto';
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

export interface PurchaseGiftCardInput {
  amount: number;
  branchId?: string;
  title?: string;
  message?: string;
  expiresAt?: string;
}

interface PurchasedGiftCardMetadata {
  giftCardId?: string;
  giftCardCode?: string;
  qrPayload?: string;
}

@Injectable()
export class LoyaltyWalletService {
  constructor(
    private readonly repository: LoyaltyWalletRepository,
    private readonly prisma: PrismaService,
  ) {}

  async getAdminCustomerLoyalty(user: AuthUserContext, customerId: string) {
    const customer = await this.resolveAdminManagedCustomer(user, customerId);
    const data = await this.getLoyaltySummary({
      customerId: customer.id,
      tenantId: customer.tenantId!,
      restaurantId: customer.restaurantId!,
      branchId: customer.branchId,
    });

    return {
      data,
      message: 'Customer loyalty points fetched successfully',
    };
  }

  async adjustCustomerLoyalty(
    user: AuthUserContext,
    customerId: string,
    dto: AdjustCustomerLoyaltyPointsDto,
  ) {
    const customer = await this.resolveAdminManagedCustomer(user, customerId);
    const signedPoints = dto.isCredit === false ? dto.points * -1 : dto.points;

    const data = await this.prisma.$transaction(async (tx) => {
      const program = await this.ensureLoyaltyProgram(
        {
          tenantId: customer.tenantId!,
          restaurantId: customer.restaurantId!,
        },
        tx,
      );
      const account = await this.ensureLoyaltyAccount(
        {
          customerId: customer.id,
          tenantId: customer.tenantId!,
          restaurantId: customer.restaurantId!,
          branchId: customer.branchId,
        },
        tx,
      );
      const nextPoints = account.availablePoints + signedPoints;

      if (nextPoints < 0) {
        throw new BadRequestException('Insufficient loyalty points');
      }

      await this.repository.updateLoyaltyAccount(
        account.id,
        {
          availablePoints: nextPoints,
          manualAdjustedPoints: {
            increment: signedPoints,
          },
        },
        tx,
      );

      await this.repository.createLoyaltyTransaction(
        {
          loyaltyAccount: { connect: { id: account.id } },
          loyaltyProgram: { connect: { id: program.id } },
          tenant: { connect: { id: customer.tenantId! } },
          restaurant: { connect: { id: customer.restaurantId! } },
          branch: customer.branchId
            ? { connect: { id: customer.branchId } }
            : undefined,
          customer: { connect: { id: customer.id } },
          type: LoyaltyTransactionType.ADJUSTMENT,
          points: signedPoints,
          balanceAfter: nextPoints,
          note:
            dto.note?.trim() ||
            (signedPoints > 0
              ? 'Admin credited loyalty points'
              : 'Admin deducted loyalty points'),
          metadata: {
            adjustedByRole: user.role,
            adjustmentMode: signedPoints > 0 ? 'CREDIT' : 'DEBIT',
          },
          createdBy: user.uid,
          updatedBy: user.uid,
        },
        tx,
      );

      return this.getLoyaltySummary({
        customerId: customer.id,
        tenantId: customer.tenantId!,
        restaurantId: customer.restaurantId!,
        branchId: customer.branchId,
      });
    });

    return {
      data,
      message: 'Customer loyalty points updated successfully',
    };
  }

  async getLoyaltyProgramSettings(
    user: AuthUserContext,
    requestedRestaurantId?: string,
  ) {
    const context = await this.resolveAdminProgramContext(
      user,
      requestedRestaurantId,
      true,
    );
    const program = await this.ensureLoyaltyProgram(context);

    return {
      data: this.serializeLoyaltyProgram(program),
      message: 'Loyalty program fetched successfully',
    };
  }

  async updateLoyaltyProgramSettings(
    user: AuthUserContext,
    dto: UpdateLoyaltyProgramDto,
  ) {
    const context = await this.resolveAdminProgramContext(
      user,
      dto.restaurantId,
      false,
    );
    const existing = await this.ensureLoyaltyProgram(context);
    const data = await this.repository.updateLoyaltyProgram(
      context.restaurantId,
      {
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.pointsPerCurrencyUnit !== undefined
          ? {
              pointsPerCurrencyUnit: new Prisma.Decimal(
                dto.pointsPerCurrencyUnit,
              ),
            }
          : {}),
        ...(dto.currencyAmountPerPoint !== undefined
          ? {
              currencyAmountPerPoint: new Prisma.Decimal(
                dto.currencyAmountPerPoint,
              ),
            }
          : {}),
        ...(dto.redemptionValuePerPoint !== undefined
          ? {
              redemptionValuePerPoint: new Prisma.Decimal(
                dto.redemptionValuePerPoint,
              ),
            }
          : {}),
        ...(dto.minimumRedeemPoints !== undefined
          ? { minimumRedeemPoints: dto.minimumRedeemPoints }
          : {}),
        ...(dto.allowWalletConversion !== undefined
          ? { allowWalletConversion: dto.allowWalletConversion }
          : {}),
        ...(dto.allowOrderDiscount !== undefined
          ? { allowOrderDiscount: dto.allowOrderDiscount }
          : {}),
        ...(dto.pointsExpiryDays !== undefined
          ? { pointsExpiryDays: dto.pointsExpiryDays }
          : {}),
        updatedBy: user.uid,
      },
    );

    return {
      data: this.serializeLoyaltyProgram({
        ...existing,
        ...data,
      }),
      message: 'Loyalty program updated successfully',
    };
  }

  async getWalletSummary(context: CustomerWalletLoyaltyContext) {
    const walletAccount = await this.ensureWalletAccount(context);
    const history = await this.repository.listWalletTransactions(
      walletAccount.id,
    );

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

  async listWalletHistory(
    context: CustomerWalletLoyaltyContext,
    query: QueryDto,
  ) {
    const walletAccount = await this.ensureWalletAccount(context);
    const result = await this.repository.listWalletTransactionsPaginated(
      walletAccount.id,
      query,
    );

    return {
      items: result.items.map((entry) => ({
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
      total: result.total,
    };
  }

  async applyWalletTopUp(
    context: CustomerWalletLoyaltyContext,
    amount: number,
    paymentTransactionId: string,
    note?: string,
    actorId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing =
        await this.repository.findWalletTransactionByPaymentTransactionId(
          paymentTransactionId,
          tx,
        );

      if (existing) {
        const walletAccount = await this.ensureWalletAccount(context, tx);

        return {
          customerId: context.customerId,
          walletBalance: Number(walletAccount.balance),
          creditedAmount: Number(existing.amount),
          currency: existing.currency,
        };
      }

      const walletAccount = await this.ensureWalletAccount(context, tx);
      const creditedAmount = new Prisma.Decimal(amount).toDecimalPlaces(2);
      const nextBalance = walletAccount.balance.plus(creditedAmount);
      const payment = await this.repository.findPaymentTransaction(
        paymentTransactionId,
        tx,
      );

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
          branch: context.branchId
            ? { connect: { id: context.branchId } }
            : undefined,
          customer: { connect: { id: context.customerId } },
          paymentTransaction: { connect: { id: paymentTransactionId } },
          type: WalletTransactionType.CREDIT,
          amount: creditedAmount,
          balanceAfter: nextBalance,
          currency: payment?.currency ?? walletAccount.currency,
          note: note?.trim() || 'Wallet top-up credited successfully',
          metadata: {
            source: 'STRIPE_TOP_UP',
          },
          createdBy: actorId,
          updatedBy: actorId,
        },
        tx,
      );

      return {
        customerId: context.customerId,
        walletBalance: Number(nextBalance),
        creditedAmount: Number(creditedAmount),
        currency: payment?.currency ?? walletAccount.currency,
      };
    });
  }

  async redeemGiftCardToWallet(
    context: CustomerWalletLoyaltyContext,
    code: string,
    actorId?: string,
  ) {
    const normalizedCode = this.normalizeGiftCardCode(code);
    if (!normalizedCode) {
      throw new BadRequestException('Gift card code is required');
    }

    return this.prisma.$transaction(async (tx) => {
      const giftCard = await tx.coupon.findFirst({
        where: {
          restaurantId: context.restaurantId,
          code: normalizedCode,
          kind: CouponCampaignKind.GIFT_CARD,
          deletedAt: null,
        },
      });

      if (!giftCard) {
        throw new BadRequestException('Gift card not found');
      }

      const now = new Date();
      if (
        !giftCard.isActive ||
        giftCard.status !== CouponStatus.ACTIVE ||
        (giftCard.startsAt !== null && giftCard.startsAt > now) ||
        (giftCard.expiresAt !== null && giftCard.expiresAt < now)
      ) {
        throw new BadRequestException('Gift card is not active');
      }

      if (giftCard.branchId && giftCard.branchId !== context.branchId) {
        throw new BadRequestException('Gift card is not valid for this branch');
      }

      if (giftCard.maxUses !== null && giftCard.usedCount >= giftCard.maxUses) {
        throw new BadRequestException('Gift card usage limit reached');
      }

      if (giftCard.maxUsesPerCustomer !== null) {
        const customerUsage = await tx.couponUsage.count({
          where: {
            couponId: giftCard.id,
            customerId: context.customerId,
          },
        });

        if (customerUsage >= giftCard.maxUsesPerCustomer) {
          throw new BadRequestException('Gift card per-customer limit reached');
        }
      }

      const creditedAmount = giftCard.discountValue.toDecimalPlaces(2);
      if (creditedAmount.lessThanOrEqualTo(0)) {
        throw new BadRequestException(
          'Gift card amount must be greater than 0',
        );
      }

      const walletAccount = await this.ensureWalletAccount(context, tx);
      const nextBalance = walletAccount.balance.plus(creditedAmount);
      const purchaseTransaction = await tx.walletTransaction.findFirst({
        where: {
          restaurantId: context.restaurantId,
          type: WalletTransactionType.DEBIT,
          metadata: {
            path: ['giftCardCode'],
            equals: giftCard.code,
          },
        },
        select: {
          id: true,
          customerId: true,
        },
      });

      if (purchaseTransaction?.customerId === context.customerId) {
        throw new BadRequestException('Gift card cannot be redeemed by buyer');
      }

      const usage = await tx.couponUsage.create({
        data: {
          couponId: giftCard.id,
          customerId: context.customerId,
        },
      });

      if (giftCard.maxUses !== null) {
        const usageUpdate = await tx.coupon.updateMany({
          where: {
            id: giftCard.id,
            usedCount: { lt: giftCard.maxUses },
          },
          data: { usedCount: { increment: 1 } },
        });

        if (usageUpdate.count !== 1) {
          throw new BadRequestException('Gift card usage limit reached');
        }
      } else {
        await tx.coupon.update({
          where: { id: giftCard.id },
          data: { usedCount: { increment: 1 } },
        });
      }

      await this.repository.updateWalletAccount(
        walletAccount.id,
        { balance: nextBalance },
        tx,
      );

      const transaction = await this.repository.createWalletTransaction(
        {
          walletAccount: { connect: { id: walletAccount.id } },
          tenant: { connect: { id: context.tenantId } },
          restaurant: { connect: { id: context.restaurantId } },
          branch: context.branchId
            ? { connect: { id: context.branchId } }
            : undefined,
          customer: { connect: { id: context.customerId } },
          type: WalletTransactionType.CREDIT,
          amount: creditedAmount,
          balanceAfter: nextBalance,
          currency: walletAccount.currency,
          note: `Gift card ${giftCard.code} redeemed`,
          metadata: {
            source: 'GIFT_CARD',
            couponId: giftCard.id,
            couponUsageId: usage.id,
            code: giftCard.code,
          },
          createdBy: actorId,
          updatedBy: actorId,
        },
        tx,
      );

      return {
        customerId: context.customerId,
        giftCardId: giftCard.id,
        code: giftCard.code,
        purchaseWalletTransactionId: purchaseTransaction?.id ?? null,
        walletTransactionId: transaction.id,
        creditedAmount: Number(creditedAmount),
        walletBalance: Number(nextBalance),
        currency: walletAccount.currency,
      };
    });
  }

  async purchaseGiftCardFromWallet(
    context: CustomerWalletLoyaltyContext,
    input: PurchaseGiftCardInput,
    actorId?: string,
  ) {
    const amount = new Prisma.Decimal(input.amount).toDecimalPlaces(2);

    if (amount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Gift card amount must be greater than 0');
    }

    return this.prisma.$transaction(async (tx) => {
      const walletAccount = await this.ensureWalletAccount(context, tx);
      const nextBalance = walletAccount.balance.minus(amount);

      if (nextBalance.lessThan(0)) {
        throw new BadRequestException('Insufficient wallet balance');
      }

      const code = await this.generateUniqueGiftCardCode(
        context.restaurantId,
        tx,
      );
      const now = new Date();
      const expiresAt = input.expiresAt
        ? new Date(input.expiresAt)
        : this.addDays(now, 365);

      if (expiresAt <= now) {
        throw new BadRequestException('Gift card expiry must be in the future');
      }

      const giftCard = await tx.coupon.create({
        data: {
          tenantId: context.tenantId,
          restaurantId: context.restaurantId,
          branchId: input.branchId ?? null,
          code,
          title: input.title?.trim() || 'Gift Card',
          description: input.message?.trim() || null,
          kind: CouponCampaignKind.GIFT_CARD,
          status: CouponStatus.ACTIVE,
          applyMode: CouponApplyMode.ORDER_TOTAL,
          autoApply: false,
          discountType: CouponDiscountType.FLAT,
          discountValue: amount,
          maxUses: 1,
          maxUsesPerCustomer: 1,
          startsAt: now,
          expiresAt,
          isActive: true,
        },
      });

      await this.repository.updateWalletAccount(
        walletAccount.id,
        { balance: nextBalance },
        tx,
      );

      const walletTransaction = await this.repository.createWalletTransaction(
        {
          walletAccount: { connect: { id: walletAccount.id } },
          tenant: { connect: { id: context.tenantId } },
          restaurant: { connect: { id: context.restaurantId } },
          branch: context.branchId
            ? { connect: { id: context.branchId } }
            : undefined,
          customer: { connect: { id: context.customerId } },
          type: WalletTransactionType.DEBIT,
          amount: amount.mul(-1),
          balanceAfter: nextBalance,
          currency: walletAccount.currency,
          note: `Gift card ${code} purchased from wallet`,
          metadata: {
            source: 'CUSTOMER_GIFT_CARD_PURCHASE',
            giftCardId: giftCard.id,
            giftCardCode: code,
            qrPayload: this.buildGiftCardQrPayload(code),
          },
          createdBy: actorId,
          updatedBy: actorId,
        },
        tx,
      );

      return {
        customerId: context.customerId,
        giftCardId: giftCard.id,
        code,
        qrPayload: this.buildGiftCardQrPayload(code),
        amount: Number(amount),
        walletTransactionId: walletTransaction.id,
        walletBalance: Number(nextBalance),
        currency: walletAccount.currency,
        expiresAt,
      };
    });
  }

  async listPurchasedGiftCards(
    context: CustomerWalletLoyaltyContext,
    query: QueryDto,
  ) {
    const result = await this.repository.listPurchasedGiftCardTransactions(
      {
        restaurantId: context.restaurantId,
        customerId: context.customerId,
      },
      query,
    );
    const giftCardIds = result.items
      .map((transaction) => this.readPurchasedGiftCardMetadata(transaction))
      .filter(
        (
          metadata,
        ): metadata is PurchasedGiftCardMetadata & {
          giftCardId: string;
        } => {
          if (!metadata.giftCardId) {
            return false;
          }

          return true;
        },
      )
      .map((metadata) => metadata.giftCardId);
    const giftCards = await this.repository.findGiftCardsByIds(
      context.restaurantId,
      giftCardIds,
    );
    const giftCardsById = new Map(giftCards.map((card) => [card.id, card]));

    return {
      items: result.items
        .map((transaction) => {
          const metadata = this.readPurchasedGiftCardMetadata(transaction);
          if (!metadata.giftCardId) {
            return null;
          }

          const giftCard = giftCardsById.get(metadata.giftCardId);
          if (!giftCard) {
            return null;
          }

          const code = metadata.giftCardCode ?? giftCard.code;
          const maxUses = giftCard.maxUses ?? null;

          return {
            id: giftCard.id,
            code,
            qrPayload: metadata.qrPayload ?? this.buildGiftCardQrPayload(code),
            title: giftCard.title,
            description: giftCard.description,
            amount: Number(giftCard.discountValue),
            currency: transaction.currency,
            branchId: giftCard.branchId,
            startsAt: giftCard.startsAt,
            expiresAt: giftCard.expiresAt,
            isActive: giftCard.isActive,
            status: giftCard.status,
            maxUses,
            maxUsesPerCustomer: giftCard.maxUsesPerCustomer,
            usedCount: giftCard.usedCount,
            isRedeemed: maxUses !== null && giftCard.usedCount >= maxUses,
            purchaseWalletTransactionId: transaction.id,
            purchasedAt: transaction.createdAt,
            createdAt: giftCard.createdAt,
            updatedAt: giftCard.updatedAt,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null),
      total: result.total,
    };
  }

  async getLoyaltySummary(context: CustomerWalletLoyaltyContext) {
    const loyaltyAccount = await this.ensureLoyaltyAccount(context);
    const program = await this.ensureLoyaltyProgram(context);
    const history = await this.repository.listLoyaltyTransactions(
      loyaltyAccount.id,
    );

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

  async calculateQuoteBenefits(
    input: QuoteBenefitsInput,
  ): Promise<QuoteBenefitsResult> {
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
      const requestedWalletAmount = new Prisma.Decimal(
        input.requestedWalletAmount,
      );

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
      const nextBalance = walletAccount.balance.minus(
        order.walletAppliedAmount,
      );
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
      const nextPoints =
        loyaltyAccount.availablePoints - order.loyaltyPointsRedeemed;
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
      if (
        !program.isActive ||
        program.pointsPerCurrencyUnit.lessThanOrEqualTo(0)
      ) {
        return null;
      }

      const qualifyingAmount = order.totalAmount.plus(
        order.walletAppliedAmount,
      );
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
          ? new Date(
              Date.now() + program.pointsExpiryDays * 24 * 60 * 60 * 1000,
            )
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
        const walletRestoreCount =
          await this.repository.countWalletRestoreTransactions(order.id, tx);
        if (!walletRestoreCount) {
          const walletAccount = await this.ensureWalletAccount(context, tx);
          const nextBalance = walletAccount.balance.plus(
            order.walletAppliedAmount,
          );
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
              currency: walletAccount.currency,
              note: 'Wallet amount restored from order reversal',
              createdBy: actorId,
              updatedBy: actorId,
            },
            tx,
          );
        }
      }

      if (order.loyaltyPointsRedeemed > 0) {
        const loyaltyRestoreCount =
          await this.repository.countLoyaltyRestoreTransactions(order.id, tx);
        if (!loyaltyRestoreCount) {
          const loyaltyAccount = await this.ensureLoyaltyAccount(context, tx);
          const program = await this.ensureLoyaltyProgram(context, tx);
          const nextPoints =
            loyaltyAccount.availablePoints + order.loyaltyPointsRedeemed;
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
    const restaurantCurrency = await this.resolveRestaurantCurrency(
      context.restaurantId,
      tx,
    );
    const legacyCurrency =
      this.readString(metadata, [
        ['customerApp', 'wallet', 'currency'],
        ['wallet', 'currency'],
      ]) ??
      restaurantCurrency ??
      'PKR';

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

  private async resolveRestaurantCurrency(restaurantId: string, tx?: PrismaTx) {
    const restaurant = await this.repository.findRestaurantSettings(
      restaurantId,
      tx,
    );

    return (
      this.readString(restaurant?.settings, [
        ['currency'],
        ['customerApp', 'currency'],
        ['checkout', 'currency'],
        ['payments', 'currency'],
        ['defaultCurrency'],
      ])?.toUpperCase() ?? null
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

  private serializeLoyaltyProgram(program: {
    restaurantId: string;
    isActive: boolean;
    pointsPerCurrencyUnit: Prisma.Decimal;
    currencyAmountPerPoint: Prisma.Decimal;
    redemptionValuePerPoint: Prisma.Decimal;
    minimumRedeemPoints: number;
    allowWalletConversion: boolean;
    allowOrderDiscount: boolean;
    pointsExpiryDays: number | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      restaurantId: program.restaurantId,
      isActive: program.isActive,
      pointsPerCurrencyUnit: Number(program.pointsPerCurrencyUnit),
      currencyAmountPerPoint: Number(program.currencyAmountPerPoint),
      redemptionValuePerPoint: Number(program.redemptionValuePerPoint),
      minimumRedeemPoints: program.minimumRedeemPoints,
      allowWalletConversion: program.allowWalletConversion,
      allowOrderDiscount: program.allowOrderDiscount,
      pointsExpiryDays: program.pointsExpiryDays,
      createdAt: program.createdAt,
      updatedAt: program.updatedAt,
    };
  }

  private async resolveAdminManagedCustomer(
    user: AuthUserContext,
    customerId: string,
  ) {
    if (
      user.role !== UserRoleEnum.SUPER_ADMIN &&
      user.role !== UserRoleEnum.BUSINESS_ADMIN &&
      user.role !== UserRoleEnum.BRANCH_ADMIN
    ) {
      throw new ForbiddenException(
        'Insufficient permissions for loyalty management',
      );
    }

    const customer = await this.repository.findCustomer(customerId);

    if (
      !customer ||
      customer.deletedAt ||
      !customer.isActive ||
      customer.role !== 'CUSTOMER' ||
      !customer.tenantId ||
      !customer.restaurantId
    ) {
      throw new NotFoundException('Customer not found');
    }

    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return customer;
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      if (!user.tid) {
        throw new ForbiddenException('Tenant context is required');
      }

      if (customer.tenantId !== user.tid) {
        throw new ForbiddenException(
          'You cannot access resources outside your tenant restaurants',
        );
      }

      return customer;
    }

    if (!user.rid) {
      throw new ForbiddenException('Restaurant context is required');
    }

    if (customer.restaurantId !== user.rid) {
      throw new ForbiddenException(
        'You cannot access resources outside your restaurant',
      );
    }

    if (user.bid && customer.branchId && customer.branchId !== user.bid) {
      throw new ForbiddenException(
        'You cannot access resources outside your branch',
      );
    }

    return customer;
  }

  private async resolveAdminProgramContext(
    user: AuthUserContext,
    requestedRestaurantId?: string,
    allowBranchAdmin = false,
  ): Promise<Pick<CustomerWalletLoyaltyContext, 'tenantId' | 'restaurantId'>> {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      if (!requestedRestaurantId) {
        throw new BadRequestException('restaurantId is required');
      }

      const restaurant = await this.prisma.restaurant.findFirst({
        where: { id: requestedRestaurantId, deletedAt: null },
        select: { id: true, tenantId: true },
      });

      if (!restaurant) {
        throw new NotFoundException('Restaurant not found');
      }

      return { tenantId: restaurant.tenantId, restaurantId: restaurant.id };
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      if (!user.tid) {
        throw new ForbiddenException('Tenant context is required');
      }

      if (user.rid) {
        return { tenantId: user.tid, restaurantId: user.rid };
      }

      if (!requestedRestaurantId) {
        throw new BadRequestException('restaurantId is required');
      }

      const restaurant = await this.prisma.restaurant.findFirst({
        where: {
          id: requestedRestaurantId,
          tenantId: user.tid,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!restaurant) {
        throw new ForbiddenException(
          'You cannot access resources outside your tenant restaurants',
        );
      }

      return { tenantId: user.tid, restaurantId: restaurant.id };
    }

    if (!(allowBranchAdmin && user.role === UserRoleEnum.BRANCH_ADMIN)) {
      throw new ForbiddenException(
        'Insufficient permissions for loyalty management',
      );
    }

    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    if (!user.rid) {
      throw new ForbiddenException('Restaurant context is required');
    }

    if (requestedRestaurantId && requestedRestaurantId !== user.rid) {
      throw new ForbiddenException(
        'You cannot access resources outside your restaurant',
      );
    }

    return { tenantId: user.tid, restaurantId: user.rid };
  }

  private async generateUniqueGiftCardCode(restaurantId: string, tx: PrismaTx) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = `GIFT-${randomBytes(5).toString('hex').toUpperCase()}`;
      const existing = await tx.coupon.findUnique({
        where: {
          restaurantId_code: {
            restaurantId,
            code,
          },
        },
        select: { id: true },
      });

      if (!existing) {
        return code;
      }
    }

    throw new BadRequestException('Could not generate gift card code');
  }

  private normalizeGiftCardCode(code: string) {
    const normalized = code.trim().toUpperCase();
    return normalized.startsWith('DWGC:') ? normalized.slice(5) : normalized;
  }

  private buildGiftCardQrPayload(code: string) {
    return `DWGC:${code}`;
  }

  private readPurchasedGiftCardMetadata(transaction: {
    metadata: Prisma.JsonValue;
  }): PurchasedGiftCardMetadata {
    if (!transaction.metadata || typeof transaction.metadata !== 'object') {
      return {};
    }

    if (Array.isArray(transaction.metadata)) {
      return {};
    }

    const source = transaction.metadata as Record<string, unknown>;

    return {
      giftCardId:
        typeof source.giftCardId === 'string' ? source.giftCardId : undefined,
      giftCardCode:
        typeof source.giftCardCode === 'string'
          ? source.giftCardCode
          : undefined,
      qrPayload:
        typeof source.qrPayload === 'string' ? source.qrPayload : undefined,
    };
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  private async readLegacyMetadata(customerId: string) {
    const profile = await this.repository.findProfileMetadata(customerId);
    return profile?.metadata;
  }

  private readPath(value: unknown, path: readonly string[]): unknown {
    let current = value;
    for (const key of path) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  }

  private readNumber(value: unknown, paths: ReadonlyArray<readonly string[]>) {
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

  private readString(value: unknown, paths: ReadonlyArray<readonly string[]>) {
    for (const path of paths) {
      const found = this.readPath(value, path);
      if (typeof found === 'string' && found.trim().length) {
        return found.trim();
      }
    }
    return undefined;
  }
}
