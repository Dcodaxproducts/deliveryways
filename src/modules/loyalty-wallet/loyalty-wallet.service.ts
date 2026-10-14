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
import { GlobalSettingsService } from '../global-settings/global-settings.service';
import {
  CanonicalJson,
  FinancialAccountKind,
  FinancialLedgerRepository,
  FinancialLedgerScope,
} from '../financial-ledger';
import {
  AdjustCustomerLoyaltyPointsDto,
  AdjustCustomerWalletDto,
  UpdateLoyaltyProgramDto,
} from './dto';
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
  idempotencyKey?: string;
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
    private readonly financialLedger: FinancialLedgerRepository,
    private readonly globalSettingsService?: GlobalSettingsService,
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
    const signedPoints = dto.isCredit === false ? -dto.points : dto.points;
    const note =
      dto.note?.trim() ||
      (signedPoints > 0
        ? 'Admin credited loyalty points'
        : 'Admin deducted loyalty points');
    const operationKey = this.clientOperationKey(
      'admin-loyalty-adjustment',
      dto.idempotencyKey,
    );
    const requestHash = this.requestHash({
      actorId: user.uid,
      customerId: customer.id,
      delta: signedPoints,
      note,
      restaurantId: customer.restaurantId!,
      tenantId: customer.tenantId!,
    });

    await this.financialLedger.withFinancialLedgerTransaction(
      [
        this.customerLedgerScope(
          {
            tenantId: customer.tenantId!,
            restaurantId: customer.restaurantId!,
            customerId: customer.id,
          },
          'LOYALTY',
        ),
      ],
      async (tx) => {
        const program = await this.ensureLoyaltyProgram(
          {
            tenantId: customer.tenantId!,
            restaurantId: customer.restaurantId!,
          },
          tx,
        );
        await this.ensureLoyaltyAccount(
          {
            customerId: customer.id,
            tenantId: customer.tenantId!,
            restaurantId: customer.restaurantId!,
            branchId: customer.branchId,
          },
          tx,
        );
        await this.financialLedger.applyLoyaltyDelta(
          {
            tenantId: customer.tenantId!,
            restaurantId: customer.restaurantId!,
            customerId: customer.id,
            branchId: customer.branchId ?? undefined,
            operationKey,
            requestHash,
            allowNegative: false,
            source: 'ADMIN_LOYALTY_ADJUSTMENT',
            delta: signedPoints,
            type: LoyaltyTransactionType.ADJUSTMENT,
            loyaltyProgramId: program.id,
            manualAdjustedDelta: signedPoints,
            note,
            metadata: {
              adjustedByRole: user.role,
              adjustmentMode: signedPoints > 0 ? 'CREDIT' : 'DEBIT',
            },
            createdBy: user.uid,
          },
          tx,
        );
      },
    );

    const data = await this.getLoyaltySummary({
      customerId: customer.id,
      tenantId: customer.tenantId!,
      restaurantId: customer.restaurantId!,
      branchId: customer.branchId,
    });
    return {
      data,
      message: 'Customer loyalty points updated successfully',
    };
  }

  async getAdminCustomerWallet(user: AuthUserContext, customerId: string) {
    const customer = await this.resolveAdminManagedCustomer(user, customerId);
    const data = await this.getWalletSummary({
      customerId: customer.id,
      tenantId: customer.tenantId!,
      restaurantId: customer.restaurantId!,
      branchId: customer.branchId,
    });

    return {
      data,
      message: 'Customer wallet fetched successfully',
    };
  }

  async listAdminCustomerWalletHistory(
    user: AuthUserContext,
    customerId: string,
    query: QueryDto,
  ) {
    const customer = await this.resolveAdminManagedCustomer(user, customerId);
    const data = await this.listWalletHistory(
      {
        customerId: customer.id,
        tenantId: customer.tenantId!,
        restaurantId: customer.restaurantId!,
        branchId: customer.branchId,
      },
      query,
    );

    return {
      data,
      message: 'Customer wallet history fetched successfully',
    };
  }

  async adjustCustomerWallet(
    user: AuthUserContext,
    customerId: string,
    dto: AdjustCustomerWalletDto,
  ) {
    const customer = await this.resolveAdminManagedCustomer(user, customerId);
    const amount = new Prisma.Decimal(dto.amount).toDecimalPlaces(2);
    const signedAmount = dto.isCredit === false ? amount.negated() : amount;
    const note =
      dto.note?.trim() ||
      (dto.isCredit === false
        ? 'Admin debited wallet balance'
        : 'Admin credited wallet balance');
    const operationKey = this.clientOperationKey(
      'admin-wallet-adjustment',
      dto.idempotencyKey,
    );
    const requestHash = this.requestHash({
      actorId: user.uid,
      amount: signedAmount.toFixed(2),
      customerId: customer.id,
      note,
      restaurantId: customer.restaurantId!,
      tenantId: customer.tenantId!,
    });

    await this.financialLedger.withFinancialLedgerTransaction(
      [
        this.customerLedgerScope(
          {
            tenantId: customer.tenantId!,
            restaurantId: customer.restaurantId!,
            customerId: customer.id,
          },
          'CUSTOMER_WALLET',
        ),
      ],
      async (tx) => {
        const account = await this.ensureWalletAccount(
          {
            customerId: customer.id,
            tenantId: customer.tenantId!,
            restaurantId: customer.restaurantId!,
            branchId: customer.branchId,
          },
          tx,
        );
        await this.financialLedger.applyCustomerWalletDelta(
          {
            tenantId: customer.tenantId!,
            restaurantId: customer.restaurantId!,
            customerId: customer.id,
            branchId: customer.branchId ?? undefined,
            operationKey,
            requestHash,
            allowNegative: false,
            source: 'ADMIN_WALLET_ADJUSTMENT',
            delta: signedAmount,
            currency: account.currency,
            type:
              dto.isCredit === false
                ? WalletTransactionType.ADJUSTMENT
                : WalletTransactionType.CREDIT,
            note,
            metadata: {
              adjustedByRole: user.role,
              adjustmentMode: dto.isCredit === false ? 'DEBIT' : 'CREDIT',
            },
            createdBy: user.uid,
          },
          tx,
        );
      },
    );

    const data = await this.getWalletSummary({
      customerId: customer.id,
      tenantId: customer.tenantId!,
      restaurantId: customer.restaurantId!,
      branchId: customer.branchId,
    });
    return {
      data,
      message: 'Customer wallet updated successfully',
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
    const creditedAmount = new Prisma.Decimal(amount).toDecimalPlaces(2);
    const normalizedNote =
      note?.trim() || 'Wallet top-up credited successfully';
    const requestHash = this.requestHash({
      amount: creditedAmount.toFixed(2),
      customerId: context.customerId,
      paymentTransactionId,
      restaurantId: context.restaurantId,
      tenantId: context.tenantId,
    });

    return this.financialLedger.withFinancialLedgerTransaction(
      [this.customerLedgerScope(context, 'CUSTOMER_WALLET')],
      async (tx) => {
        const walletAccount = await this.ensureWalletAccount(context, tx);
        const payment = await this.repository.findPaymentTransaction(
          paymentTransactionId,
          tx,
        );
        const result = await this.financialLedger.applyCustomerWalletDelta(
          {
            tenantId: context.tenantId,
            restaurantId: context.restaurantId,
            customerId: context.customerId,
            branchId: context.branchId ?? undefined,
            paymentTransactionId,
            operationKey: `wallet-top-up:${paymentTransactionId}`,
            requestHash,
            allowNegative: false,
            source: 'STRIPE_TOP_UP',
            delta: creditedAmount,
            currency: payment?.currency ?? walletAccount.currency,
            type: WalletTransactionType.CREDIT,
            note: normalizedNote,
            createdBy: actorId,
          },
          tx,
        );
        return {
          customerId: context.customerId,
          walletBalance: Number(result.transaction.balanceAfter),
          creditedAmount: Number(result.transaction.amount),
          currency: result.transaction.currency,
        };
      },
    );
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
    const locatedGiftCard = await this.prisma.coupon.findFirst({
      where: {
        restaurantId: context.restaurantId,
        code: normalizedCode,
        kind: CouponCampaignKind.GIFT_CARD,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!locatedGiftCard) {
      throw new BadRequestException('Gift card not found');
    }

    return this.financialLedger.withFinancialLedgerTransaction(
      [this.customerLedgerScope(context, 'CUSTOMER_WALLET')],
      async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT 1 FROM "coupons" WHERE "id" = ${locatedGiftCard.id} FOR UPDATE`,
        );
        const giftCard = await tx.coupon.findUnique({
          where: { id: locatedGiftCard.id },
        });
        if (!giftCard || giftCard.deletedAt) {
          throw new BadRequestException('Gift card not found');
        }
        const creditedAmount = giftCard.discountValue.toDecimalPlaces(2);
        const walletAccount = await this.ensureWalletAccount(context, tx);
        const operationKey = `gift-card-redemption:${giftCard.id}`;
        const requestHash = this.requestHash({
          amount: creditedAmount.toFixed(2),
          branchId: context.branchId ?? null,
          customerId: context.customerId,
          giftCardId: giftCard.id,
          restaurantId: context.restaurantId,
          tenantId: context.tenantId,
        });
        const ledgerKey =
          FinancialLedgerRepository.createOperationKey(operationKey);
        const existing = await tx.walletTransaction.findUnique({
          where: { idempotencyKey: ledgerKey },
        });
        if (existing) {
          const purchaseTransaction = await tx.walletTransaction.findFirst({
            where: {
              restaurantId: context.restaurantId,
              type: WalletTransactionType.DEBIT,
              metadata: { path: ['giftCardCode'], equals: giftCard.code },
            },
            select: { id: true },
          });
          const replay = await this.financialLedger.applyCustomerWalletDelta(
            {
              tenantId: context.tenantId,
              restaurantId: context.restaurantId,
              customerId: context.customerId,
              branchId: context.branchId ?? undefined,
              operationKey,
              requestHash,
              allowNegative: false,
              source: 'GIFT_CARD_REDEMPTION',
              delta: creditedAmount,
              currency: walletAccount.currency,
              type: WalletTransactionType.CREDIT,
              note: `Gift card ${giftCard.code} redeemed`,
              createdBy: actorId,
            },
            tx,
          );
          return {
            customerId: context.customerId,
            giftCardId: giftCard.id,
            code: giftCard.code,
            purchaseWalletTransactionId: purchaseTransaction?.id ?? null,
            walletTransactionId: replay.transaction.id,
            creditedAmount: Number(replay.transaction.amount),
            walletBalance: Number(replay.transaction.balanceAfter),
            currency: replay.transaction.currency,
          };
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
          throw new BadRequestException(
            'Gift card is not valid for this branch',
          );
        }
        if (
          giftCard.maxUses !== null &&
          giftCard.usedCount >= giftCard.maxUses
        ) {
          throw new BadRequestException('Gift card usage limit reached');
        }
        if (giftCard.maxUsesPerCustomer !== null) {
          const customerUsage = await tx.couponUsage.count({
            where: { couponId: giftCard.id, customerId: context.customerId },
          });
          if (customerUsage >= giftCard.maxUsesPerCustomer) {
            throw new BadRequestException(
              'Gift card per-customer limit reached',
            );
          }
        }
        if (creditedAmount.lessThanOrEqualTo(0)) {
          throw new BadRequestException(
            'Gift card amount must be greater than 0',
          );
        }
        const purchaseTransaction = await tx.walletTransaction.findFirst({
          where: {
            restaurantId: context.restaurantId,
            type: WalletTransactionType.DEBIT,
            metadata: { path: ['giftCardCode'], equals: giftCard.code },
          },
          select: { id: true, customerId: true },
        });
        if (purchaseTransaction?.customerId === context.customerId) {
          throw new BadRequestException(
            'Gift card cannot be redeemed by buyer',
          );
        }
        const usage = await tx.couponUsage.create({
          data: { couponId: giftCard.id, customerId: context.customerId },
        });
        await tx.coupon.update({
          where: { id: giftCard.id },
          data: { usedCount: { increment: 1 } },
        });
        const result = await this.financialLedger.applyCustomerWalletDelta(
          {
            tenantId: context.tenantId,
            restaurantId: context.restaurantId,
            customerId: context.customerId,
            branchId: context.branchId ?? undefined,
            operationKey,
            requestHash,
            allowNegative: false,
            source: 'GIFT_CARD_REDEMPTION',
            delta: creditedAmount,
            currency: walletAccount.currency,
            type: WalletTransactionType.CREDIT,
            note: `Gift card ${giftCard.code} redeemed`,
            metadata: {
              couponId: giftCard.id,
              couponUsageId: usage.id,
              code: giftCard.code,
            },
            createdBy: actorId,
          },
          tx,
        );
        return {
          customerId: context.customerId,
          giftCardId: giftCard.id,
          code: giftCard.code,
          purchaseWalletTransactionId: purchaseTransaction?.id ?? null,
          walletTransactionId: result.transaction.id,
          creditedAmount: Number(result.transaction.amount),
          walletBalance: Number(result.transaction.balanceAfter),
          currency: result.transaction.currency,
        };
      },
    );
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
    const operationKey = this.clientOperationKey(
      'wallet-gift-card-purchase',
      input.idempotencyKey,
    );
    const requestHash = this.requestHash({
      amount: amount.toFixed(2),
      branchId: input.branchId ?? null,
      customerId: context.customerId,
      expiresAt: input.expiresAt ?? null,
      message: input.message?.trim() ?? null,
      restaurantId: context.restaurantId,
      tenantId: context.tenantId,
      title: input.title?.trim() ?? null,
    });

    return this.financialLedger.withFinancialLedgerTransaction(
      [this.customerLedgerScope(context, 'CUSTOMER_WALLET')],
      async (tx) => {
        const walletAccount = await this.ensureWalletAccount(context, tx);
        const ledgerKey =
          FinancialLedgerRepository.createOperationKey(operationKey);
        const existing = await tx.walletTransaction.findUnique({
          where: { idempotencyKey: ledgerKey },
        });
        if (existing) {
          const replay = await this.financialLedger.applyCustomerWalletDelta(
            {
              tenantId: context.tenantId,
              restaurantId: context.restaurantId,
              customerId: context.customerId,
              branchId: context.branchId ?? undefined,
              operationKey,
              requestHash,
              allowNegative: false,
              source: 'CUSTOMER_GIFT_CARD_PURCHASE',
              delta: amount.negated(),
              currency: walletAccount.currency,
              type: WalletTransactionType.DEBIT,
              note: existing.note ?? 'Gift card purchased from wallet',
              createdBy: actorId,
            },
            tx,
          );
          const metadata = this.readPurchasedGiftCardMetadata(
            replay.transaction,
          );
          const giftCard = metadata.giftCardId
            ? await tx.coupon.findUnique({ where: { id: metadata.giftCardId } })
            : null;
          if (!giftCard) {
            throw new BadRequestException('Purchased gift card not found');
          }
          return {
            customerId: context.customerId,
            giftCardId: giftCard.id,
            code: giftCard.code,
            qrPayload:
              metadata.qrPayload ?? this.buildGiftCardQrPayload(giftCard.code),
            amount: Number(amount),
            walletTransactionId: replay.transaction.id,
            walletBalance: Number(replay.transaction.balanceAfter),
            currency: replay.transaction.currency,
            expiresAt: giftCard.expiresAt,
          };
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
          throw new BadRequestException(
            'Gift card expiry must be in the future',
          );
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
        const qrPayload = this.buildGiftCardQrPayload(code);
        const result = await this.financialLedger.applyCustomerWalletDelta(
          {
            tenantId: context.tenantId,
            restaurantId: context.restaurantId,
            customerId: context.customerId,
            branchId: context.branchId ?? undefined,
            operationKey,
            requestHash,
            allowNegative: false,
            source: 'CUSTOMER_GIFT_CARD_PURCHASE',
            delta: amount.negated(),
            currency: walletAccount.currency,
            type: WalletTransactionType.DEBIT,
            note: `Gift card ${code} purchased from wallet`,
            metadata: {
              giftCardId: giftCard.id,
              giftCardCode: code,
              qrPayload,
            },
            createdBy: actorId,
          },
          tx,
        );
        return {
          customerId: context.customerId,
          giftCardId: giftCard.id,
          code,
          qrPayload,
          amount: Number(amount),
          walletTransactionId: result.transaction.id,
          walletBalance: Number(result.transaction.balanceAfter),
          currency: result.transaction.currency,
          expiresAt,
        };
      },
    );
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
    idempotencyKey?: string,
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
    const redeemedAmount = new Prisma.Decimal(points)
      .mul(program.redemptionValuePerPoint)
      .toDecimalPlaces(2);
    const normalizedNote = note?.trim() || 'Loyalty points redeemed to wallet';
    const rootKey = this.clientOperationKey(
      'loyalty-wallet-conversion',
      idempotencyKey,
    );
    const requestHash = this.requestHash({
      amount: redeemedAmount.toFixed(2),
      customerId: context.customerId,
      note: normalizedNote,
      points,
      programId: program.id,
      restaurantId: context.restaurantId,
      tenantId: context.tenantId,
    });

    return this.financialLedger.withFinancialLedgerTransaction(
      this.customerLedgerScopes(context, ['LOYALTY', 'CUSTOMER_WALLET']),
      async (tx) => {
        await this.ensureLoyaltyAccount(context, tx);
        const walletAccount = await this.ensureWalletAccount(context, tx);
        const loyalty = await this.financialLedger.applyLoyaltyDelta(
          {
            tenantId: context.tenantId,
            restaurantId: context.restaurantId,
            customerId: context.customerId,
            branchId: context.branchId ?? undefined,
            operationKey: `${rootKey}:loyalty`,
            requestHash,
            allowNegative: false,
            source: 'LOYALTY_WALLET_CONVERSION',
            delta: -points,
            type: LoyaltyTransactionType.REDEEM,
            loyaltyProgramId: program.id,
            monetaryValue: redeemedAmount,
            redemptionTarget: LoyaltyRedemptionTarget.WALLET,
            lifetimeRedeemedDelta: points,
            note: normalizedNote,
            createdBy: actorId,
          },
          tx,
        );
        const wallet = await this.financialLedger.applyCustomerWalletDelta(
          {
            tenantId: context.tenantId,
            restaurantId: context.restaurantId,
            customerId: context.customerId,
            branchId: context.branchId ?? undefined,
            operationKey: `${rootKey}:wallet`,
            requestHash,
            allowNegative: false,
            source: 'LOYALTY_WALLET_CONVERSION',
            delta: redeemedAmount,
            currency: walletAccount.currency,
            type: WalletTransactionType.LOYALTY_REDEMPTION,
            note: 'Wallet credited from loyalty redemption',
            metadata: { pointsRedeemed: points },
            createdBy: actorId,
          },
          tx,
        );
        return {
          customerId: context.customerId,
          redeemedPoints: points,
          redeemedAmount: Number(redeemedAmount),
          remainingPoints: loyalty.transaction.balanceAfter,
          walletBalance: Number(wallet.transaction.balanceAfter),
          currency: wallet.transaction.currency,
        };
      },
    );
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
    const kinds: FinancialAccountKind[] = [];
    if (order.walletAppliedAmount.greaterThan(0)) kinds.push('CUSTOMER_WALLET');
    if (order.loyaltyPointsRedeemed > 0) kinds.push('LOYALTY');
    if (!kinds.length) return;
    const requestHash = this.requestHash({
      customerId: context.customerId,
      loyaltyDiscountAmount: order.loyaltyDiscountAmount.toFixed(2),
      loyaltyPointsRedeemed: order.loyaltyPointsRedeemed,
      orderId: order.id,
      restaurantId: context.restaurantId,
      tenantId: context.tenantId,
      walletAppliedAmount: order.walletAppliedAmount.toFixed(2),
    });

    await this.financialLedger.withFinancialLedgerTransaction(
      this.customerLedgerScopes(context, kinds),
      async (ledgerTx) => {
        if (order.walletAppliedAmount.greaterThan(0)) {
          const walletAccount = await this.ensureWalletAccount(
            context,
            ledgerTx,
          );
          await this.financialLedger.applyCustomerWalletDelta(
            {
              tenantId: context.tenantId,
              restaurantId: context.restaurantId,
              customerId: context.customerId,
              branchId: context.branchId ?? undefined,
              orderId: order.id,
              operationKey: `order:${order.id}:wallet-benefit-debit`,
              requestHash,
              allowNegative: false,
              source: 'ORDER_CHECKOUT_BENEFIT',
              delta: order.walletAppliedAmount.negated(),
              currency: walletAccount.currency,
              type: WalletTransactionType.DEBIT,
              note: 'Wallet applied on order checkout',
              metadata: {
                loyaltyDiscountAmount: Number(order.loyaltyDiscountAmount),
              },
              createdBy: actorId,
            },
            ledgerTx,
          );
        }
        if (order.loyaltyPointsRedeemed > 0) {
          await this.ensureLoyaltyAccount(context, ledgerTx);
          const program = await this.ensureLoyaltyProgram(context, ledgerTx);
          await this.financialLedger.applyLoyaltyDelta(
            {
              tenantId: context.tenantId,
              restaurantId: context.restaurantId,
              customerId: context.customerId,
              branchId: context.branchId ?? undefined,
              orderId: order.id,
              operationKey: `order:${order.id}:loyalty-benefit-debit`,
              requestHash,
              allowNegative: false,
              source: 'ORDER_CHECKOUT_BENEFIT',
              delta: -order.loyaltyPointsRedeemed,
              type: LoyaltyTransactionType.REDEEM,
              loyaltyProgramId: program.id,
              monetaryValue: order.loyaltyDiscountAmount,
              redemptionTarget: LoyaltyRedemptionTarget.ORDER_DISCOUNT,
              lifetimeRedeemedDelta: order.loyaltyPointsRedeemed,
              note: 'Loyalty points applied as order discount',
              createdBy: actorId,
            },
            ledgerTx,
          );
        }
      },
      tx,
    );
  }

  async awardPointsForPaidOrder(
    orderId: string,
    paymentTransactionId?: string,
    actorId?: string,
    options: { allowUnpaid?: boolean; idempotencyKey?: string } = {},
  ) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.repository.findOrderWithBenefits(orderId, tx);
      if (!order) throw new NotFoundException('Order not found');
      if (order.paymentStatus !== PaymentStatus.PAID && !options.allowUnpaid) {
        return null;
      }
      const context = {
        customerId: order.customerId,
        tenantId: order.tenantId,
        restaurantId: order.restaurantId,
        branchId: order.branchId,
      };
      return this.financialLedger.withFinancialLedgerTransaction(
        [this.customerLedgerScope(context, 'LOYALTY')],
        async (ledgerTx) => {
          const program = await this.ensureLoyaltyProgram(context, ledgerTx);
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
          if (pointsAwarded <= 0) return null;
          await this.ensureLoyaltyAccount(context, ledgerTx);
          const expiresAt =
            program.pointsExpiryDays && program.pointsExpiryDays > 0
              ? new Date(Date.now() + program.pointsExpiryDays * 86_400_000)
              : undefined;
          const requestHash = this.requestHash({
            customerId: context.customerId,
            orderId: order.id,
            pointsAwarded,
            programId: program.id,
            qualifyingAmount: qualifyingAmount.toFixed(2),
            restaurantId: context.restaurantId,
            tenantId: context.tenantId,
          });
          await this.financialLedger.applyLoyaltyDelta(
            {
              tenantId: context.tenantId,
              restaurantId: context.restaurantId,
              customerId: context.customerId,
              branchId: context.branchId,
              orderId: order.id,
              paymentTransactionId,
              operationKey: `order:${order.id}:loyalty-award`,
              requestHash,
              allowNegative: false,
              source: 'PAID_ORDER_LOYALTY_AWARD',
              delta: pointsAwarded,
              type: LoyaltyTransactionType.EARN,
              loyaltyProgramId: program.id,
              monetaryValue: qualifyingAmount,
              lifetimeEarnedDelta: pointsAwarded,
              expiresAt,
              note: 'Loyalty points earned on paid order',
              metadata: options.idempotencyKey
                ? { upstreamIdempotencyKey: options.idempotencyKey }
                : undefined,
              createdBy: actorId,
            },
            ledgerTx,
          );
          await this.repository.updateOrderBenefits(
            order.id,
            { loyaltyPointsAwarded: pointsAwarded },
            ledgerTx,
          );
          return pointsAwarded;
        },
        tx,
      );
    });
  }

  async restoreOrderBenefits(
    orderId: string,
    reason: 'REFUND' | 'PAYMENT_REVERSAL',
    actorId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.repository.findOrderWithBenefits(orderId, tx);
      if (!order) throw new NotFoundException('Order not found');
      const context = {
        customerId: order.customerId,
        tenantId: order.tenantId,
        restaurantId: order.restaurantId,
        branchId: order.branchId,
      };
      const kinds: FinancialAccountKind[] = [];
      if (order.walletAppliedAmount.greaterThan(0))
        kinds.push('CUSTOMER_WALLET');
      if (order.loyaltyPointsRedeemed > 0) kinds.push('LOYALTY');
      if (!kinds.length) return;
      const requestHash = this.requestHash({
        customerId: context.customerId,
        loyaltyDiscountAmount: order.loyaltyDiscountAmount.toFixed(2),
        loyaltyPointsRedeemed: order.loyaltyPointsRedeemed,
        orderId: order.id,
        reason,
        restaurantId: context.restaurantId,
        tenantId: context.tenantId,
        walletAppliedAmount: order.walletAppliedAmount.toFixed(2),
      });
      await this.financialLedger.withFinancialLedgerTransaction(
        this.customerLedgerScopes(context, kinds),
        async (ledgerTx) => {
          if (order.walletAppliedAmount.greaterThan(0)) {
            const account = await this.ensureWalletAccount(context, ledgerTx);
            await this.financialLedger.applyCustomerWalletDelta(
              {
                tenantId: context.tenantId,
                restaurantId: context.restaurantId,
                customerId: context.customerId,
                branchId: context.branchId,
                orderId: order.id,
                operationKey: `order:${order.id}:wallet-benefit-restore`,
                requestHash,
                allowNegative: false,
                source: 'ORDER_BENEFIT_RESTORE',
                delta: order.walletAppliedAmount,
                currency: account.currency,
                type:
                  reason === 'REFUND'
                    ? WalletTransactionType.REFUND
                    : WalletTransactionType.PAYMENT_REVERSAL,
                note: 'Wallet amount restored from order reversal',
                createdBy: actorId,
              },
              ledgerTx,
            );
          }
          if (order.loyaltyPointsRedeemed > 0) {
            await this.ensureLoyaltyAccount(context, ledgerTx);
            const program = await this.ensureLoyaltyProgram(context, ledgerTx);
            await this.financialLedger.applyLoyaltyDelta(
              {
                tenantId: context.tenantId,
                restaurantId: context.restaurantId,
                customerId: context.customerId,
                branchId: context.branchId,
                orderId: order.id,
                operationKey: `order:${order.id}:loyalty-benefit-restore`,
                requestHash,
                allowNegative: false,
                source: 'ORDER_BENEFIT_RESTORE',
                delta: order.loyaltyPointsRedeemed,
                type: LoyaltyTransactionType.RESTORE,
                loyaltyProgramId: program.id,
                monetaryValue: order.loyaltyDiscountAmount,
                redemptionTarget: LoyaltyRedemptionTarget.ORDER_DISCOUNT,
                lifetimeRedeemedDelta: -order.loyaltyPointsRedeemed,
                note: 'Loyalty points restored from order reversal',
                createdBy: actorId,
              },
              ledgerTx,
            );
          }
        },
        tx,
      );
    });
  }

  private requestHash(value: CanonicalJson): string {
    return FinancialLedgerRepository.createCanonicalRequestHash(value);
  }

  private clientOperationKey(prefix: string, supplied?: string): string {
    const key = supplied?.trim();
    return key
      ? `${prefix}:${key}`
      : `${prefix}:generated:${randomBytes(16).toString('hex')}`;
  }

  private customerLedgerScope(
    context: Pick<
      CustomerWalletLoyaltyContext,
      'tenantId' | 'restaurantId' | 'customerId'
    >,
    accountKind: FinancialAccountKind,
  ): FinancialLedgerScope {
    return {
      tenantId: context.tenantId,
      restaurantId: context.restaurantId,
      customerId: context.customerId,
      accountKind,
    };
  }

  private customerLedgerScopes(
    context: Pick<
      CustomerWalletLoyaltyContext,
      'tenantId' | 'restaurantId' | 'customerId'
    >,
    accountKinds: FinancialAccountKind[],
  ): FinancialLedgerScope[] {
    return accountKinds.map((kind) => this.customerLedgerScope(context, kind));
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
      (await this.globalSettingsService?.getDefaultCurrencyCode()) ??
      this.readString(metadata, [
        ['customerApp', 'wallet', 'currency'],
        ['wallet', 'currency'],
      ]) ??
      (await this.resolveRestaurantCurrency(context.restaurantId, tx)) ??
      'PKR';

    const client = tx ?? this.prisma;
    return client.walletAccount.upsert({
      where: {
        restaurantId_customerId: {
          restaurantId: context.restaurantId,
          customerId: context.customerId,
        },
      },
      create: {
        tenantId: context.tenantId,
        restaurantId: context.restaurantId,
        customerId: context.customerId,
        balance: new Prisma.Decimal(legacyBalance),
        currency: legacyCurrency,
      },
      update: {},
    });
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

    const client = tx ?? this.prisma;
    return client.loyaltyAccount.upsert({
      where: {
        restaurantId_customerId: {
          restaurantId: context.restaurantId,
          customerId: context.customerId,
        },
      },
      create: {
        tenantId: context.tenantId,
        restaurantId: context.restaurantId,
        customerId: context.customerId,
        availablePoints,
        lifetimeEarnedPoints: availablePoints + redeemedPoints,
        lifetimeRedeemedPoints: redeemedPoints,
      },
      update: {},
    });
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

    const client = tx ?? this.prisma;
    return client.loyaltyProgram.upsert({
      where: { restaurantId: context.restaurantId },
      create: {
        tenantId: context.tenantId,
        restaurantId: context.restaurantId,
        isActive: true,
        pointsPerCurrencyUnit: new Prisma.Decimal(0.05),
        currencyAmountPerPoint: new Prisma.Decimal(1),
        redemptionValuePerPoint: new Prisma.Decimal(1),
        minimumRedeemPoints: 50,
        allowWalletConversion: true,
        allowOrderDiscount: true,
      },
      update: {},
    });
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

    if (this.isStaffActor(user)) {
      if (!user.tid) {
        throw new ForbiddenException('Tenant context is required');
      }

      const assignedRestaurantIds = new Set([
        ...(user.restaurantAccess?.restaurantIds ?? []),
        ...(user.rid ? [user.rid] : []),
      ]);
      const restaurantId =
        requestedRestaurantId ??
        user.rid ??
        (assignedRestaurantIds.size === 1
          ? [...assignedRestaurantIds][0]
          : undefined);

      if (!restaurantId) {
        throw new BadRequestException('restaurantId is required');
      }

      const hasAllRestaurantsAccess =
        user.restaurantAccess?.allRestaurants === true ||
        user.restaurantAccess?.hasAllRestaurantsAccess === true;
      if (
        !hasAllRestaurantsAccess &&
        !assignedRestaurantIds.has(restaurantId)
      ) {
        throw new ForbiddenException(
          'You cannot access resources outside your assigned restaurants',
        );
      }

      const restaurant = await this.repository.findRestaurantScope(
        restaurantId,
        user.tid,
      );
      if (!restaurant) {
        throw new ForbiddenException(
          'You cannot access resources outside your assigned restaurants',
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

  private isStaffActor(user: AuthUserContext): boolean {
    return user.role === UserRoleEnum.STAFF || user.actorType === 'STAFF';
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
