import { Injectable } from '@nestjs/common';
import {
  LoyaltyAccount,
  LoyaltyProgram,
  PaymentTransaction,
  Prisma,
  PrismaClient,
  User,
  WalletAccount,
} from '@prisma/client';
import { PrismaTx } from '../../common/types';
import { PrismaService } from '../../database';

@Injectable()
export class LoyaltyWalletRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaClient | PrismaTx {
    return tx ?? this.prisma;
  }

  findProfileMetadata(customerId: string) {
    return this.prisma.profile.findUnique({
      where: { userId: customerId },
      select: { metadata: true },
    });
  }

  findCustomer(customerId: string) {
    return this.prisma.user.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        tenantId: true,
        restaurantId: true,
        branchId: true,
        role: true,
      },
    });
  }

  findWalletAccount(restaurantId: string, customerId: string, tx?: PrismaTx) {
    return this.client(tx).walletAccount.findUnique({
      where: {
        restaurantId_customerId: {
          restaurantId,
          customerId,
        },
      },
    });
  }

  findLoyaltyAccount(
    restaurantId: string,
    customerId: string,
    tx?: PrismaTx,
  ) {
    return this.client(tx).loyaltyAccount.findUnique({
      where: {
        restaurantId_customerId: {
          restaurantId,
          customerId,
        },
      },
    });
  }

  findLoyaltyProgram(restaurantId: string, tx?: PrismaTx) {
    return this.client(tx).loyaltyProgram.findUnique({
      where: { restaurantId },
    });
  }

  createWalletAccount(data: Prisma.WalletAccountCreateInput, tx?: PrismaTx) {
    return this.client(tx).walletAccount.create({ data });
  }

  createLoyaltyAccount(data: Prisma.LoyaltyAccountCreateInput, tx?: PrismaTx) {
    return this.client(tx).loyaltyAccount.create({ data });
  }

  createLoyaltyProgram(data: Prisma.LoyaltyProgramCreateInput, tx?: PrismaTx) {
    return this.client(tx).loyaltyProgram.create({ data });
  }

  updateWalletAccount(
    id: string,
    data: Prisma.WalletAccountUpdateInput,
    tx?: PrismaTx,
  ) {
    return this.client(tx).walletAccount.update({
      where: { id },
      data,
    });
  }

  updateLoyaltyAccount(
    id: string,
    data: Prisma.LoyaltyAccountUpdateInput,
    tx?: PrismaTx,
  ) {
    return this.client(tx).loyaltyAccount.update({
      where: { id },
      data,
    });
  }

  updateLoyaltyProgram(
    restaurantId: string,
    data: Prisma.LoyaltyProgramUpdateInput,
    tx?: PrismaTx,
  ) {
    return this.client(tx).loyaltyProgram.update({
      where: { restaurantId },
      data,
    });
  }

  createWalletTransaction(
    data: Prisma.WalletTransactionCreateInput,
    tx?: PrismaTx,
  ) {
    return this.client(tx).walletTransaction.create({ data });
  }

  createLoyaltyTransaction(
    data: Prisma.LoyaltyTransactionCreateInput,
    tx?: PrismaTx,
  ) {
    return this.client(tx).loyaltyTransaction.create({ data });
  }

  listWalletTransactions(walletAccountId: string, limit = 20) {
    return this.prisma.walletTransaction.findMany({
      where: { walletAccountId },
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
    });
  }

  listLoyaltyTransactions(loyaltyAccountId: string, limit = 20) {
    return this.prisma.loyaltyTransaction.findMany({
      where: { loyaltyAccountId },
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
    });
  }

  findOrderWithBenefits(orderId: string, tx?: PrismaTx) {
    return this.client(tx).order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        tenantId: true,
        restaurantId: true,
        branchId: true,
        customerId: true,
        subtotal: true,
        totalAmount: true,
        paymentStatus: true,
        walletAppliedAmount: true,
        loyaltyDiscountAmount: true,
        loyaltyPointsRedeemed: true,
        loyaltyPointsAwarded: true,
      },
    });
  }

  updateOrderBenefits(
    orderId: string,
    data: Prisma.OrderUpdateInput,
    tx?: PrismaTx,
  ) {
    return this.client(tx).order.update({
      where: { id: orderId },
      data,
    });
  }

  countWalletRestoreTransactions(orderId: string, tx?: PrismaTx) {
    return this.client(tx).walletTransaction.count({
      where: {
        orderId,
        type: { in: ['REFUND', 'PAYMENT_REVERSAL'] },
      },
    });
  }

  countLoyaltyRestoreTransactions(orderId: string, tx?: PrismaTx) {
    return this.client(tx).loyaltyTransaction.count({
      where: {
        orderId,
        type: 'RESTORE',
      },
    });
  }

  countLoyaltyEarnTransactions(orderId: string, tx?: PrismaTx) {
    return this.client(tx).loyaltyTransaction.count({
      where: {
        orderId,
        type: 'EARN',
      },
    });
  }

  findPaymentTransaction(id: string, tx?: PrismaTx) {
    return this.client(tx).paymentTransaction.findUnique({
      where: { id },
      select: {
        id: true,
        orderId: true,
        amount: true,
        currency: true,
        paymentMethod: true,
        tenantId: true,
        restaurantId: true,
        branchId: true,
      },
    });
  }
}
