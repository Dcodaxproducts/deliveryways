import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UserRoleEnum } from '../../common/enums';
import { LoyaltyWalletService } from './loyalty-wallet.service';

describe('LoyaltyWalletService', () => {
  const makeService = () => {
    const repository = {
      findCustomer: jest.fn(),
      findLoyaltyProgram: jest.fn(),
      createLoyaltyProgram: jest.fn(),
      findLoyaltyAccount: jest.fn(),
      createLoyaltyAccount: jest.fn(),
      listLoyaltyTransactions: jest.fn(),
      updateLoyaltyAccount: jest.fn(),
      createLoyaltyTransaction: jest.fn(),
      updateLoyaltyProgram: jest.fn(),
      findProfileMetadata: jest.fn(),
      findRestaurantSettings: jest.fn(),
      findWalletAccount: jest.fn(),
      createWalletAccount: jest.fn(),
      updateWalletAccount: jest.fn(),
      createWalletTransaction: jest.fn(),
    };

    const prisma = {
      restaurant: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback({}),
      ),
    };

    const service = new LoyaltyWalletService(
      repository as never,
      prisma as never,
    );

    return { service, repository, prisma };
  };

  it('returns admin customer loyalty summary for business admin in same tenant', async () => {
    const { service, repository } = makeService();
    repository.findCustomer.mockResolvedValue({
      id: 'customer-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      role: 'CUSTOMER',
      isActive: true,
      deletedAt: null,
    });
    repository.findLoyaltyProgram.mockResolvedValue({
      id: 'program-1',
      restaurantId: 'restaurant-1',
      isActive: true,
      pointsPerCurrencyUnit: new Prisma.Decimal(0.05),
      currencyAmountPerPoint: new Prisma.Decimal(1),
      redemptionValuePerPoint: new Prisma.Decimal(1),
      minimumRedeemPoints: 50,
      allowWalletConversion: true,
      allowOrderDiscount: true,
      pointsExpiryDays: null,
      createdAt: new Date('2026-04-09T00:00:00.000Z'),
      updatedAt: new Date('2026-04-09T00:00:00.000Z'),
    });
    repository.findLoyaltyAccount.mockResolvedValue({
      id: 'account-1',
      availablePoints: 120,
      lifetimeRedeemedPoints: 20,
      lifetimeEarnedPoints: 140,
    });
    repository.listLoyaltyTransactions.mockResolvedValue([]);

    const result = await service.getAdminCustomerLoyalty(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      } as never,
      'customer-1',
    );

    expect(result.data.availablePoints).toBe(120);
    expect(result.data.customerId).toBe('customer-1');
    expect(result.message).toBe('Customer loyalty points fetched successfully');
  });

  it('blocks branch admin from adjusting loyalty for another branch customer', async () => {
    const { service, repository } = makeService();
    repository.findCustomer.mockResolvedValue({
      id: 'customer-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-2',
      role: 'CUSTOMER',
      isActive: true,
      deletedAt: null,
    });

    await expect(
      service.adjustCustomerLoyalty(
        {
          uid: 'branch-admin-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          bid: 'branch-1',
          role: UserRoleEnum.BRANCH_ADMIN,
        } as never,
        'customer-1',
        { points: 50, isCredit: true, note: 'Manual bonus' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('updates loyalty program for tenant-scoped business admin', async () => {
    const { service, repository, prisma } = makeService();
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    repository.findLoyaltyProgram.mockResolvedValue({
      id: 'program-1',
      restaurantId: 'restaurant-1',
      isActive: true,
      pointsPerCurrencyUnit: new Prisma.Decimal(0.05),
      currencyAmountPerPoint: new Prisma.Decimal(1),
      redemptionValuePerPoint: new Prisma.Decimal(1),
      minimumRedeemPoints: 50,
      allowWalletConversion: true,
      allowOrderDiscount: true,
      pointsExpiryDays: null,
      createdAt: new Date('2026-04-09T00:00:00.000Z'),
      updatedAt: new Date('2026-04-09T00:00:00.000Z'),
    });
    repository.updateLoyaltyProgram.mockResolvedValue({
      restaurantId: 'restaurant-1',
      isActive: true,
      pointsPerCurrencyUnit: new Prisma.Decimal(0.1),
      currencyAmountPerPoint: new Prisma.Decimal(1),
      redemptionValuePerPoint: new Prisma.Decimal(2),
      minimumRedeemPoints: 100,
      allowWalletConversion: true,
      allowOrderDiscount: false,
      pointsExpiryDays: 30,
      createdAt: new Date('2026-04-09T00:00:00.000Z'),
      updatedAt: new Date('2026-04-09T01:00:00.000Z'),
    });

    const result = await service.updateLoyaltyProgramSettings(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      } as never,
      {
        restaurantId: 'restaurant-1',
        pointsPerCurrencyUnit: 0.1,
        redemptionValuePerPoint: 2,
        minimumRedeemPoints: 100,
        allowOrderDiscount: false,
        pointsExpiryDays: 30,
      },
    );

    expect(repository.updateLoyaltyProgram).toHaveBeenCalled();
    expect(result.data.redemptionValuePerPoint).toBe(2);
    expect(result.data.minimumRedeemPoints).toBe(100);
  });

  it('requires restaurantId for super admin loyalty program fetch', async () => {
    const { service } = makeService();

    await expect(
      service.getLoyaltyProgramSettings({
        uid: 'super-1',
        role: UserRoleEnum.SUPER_ADMIN,
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('redeems active gift card into wallet balance', async () => {
    const { service, repository, prisma } = makeService();
    const tx = {
      coupon: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'gift-1',
          restaurantId: 'restaurant-1',
          branchId: null,
          code: 'GIFT-123',
          kind: 'GIFT_CARD',
          status: 'ACTIVE',
          isActive: true,
          usedCount: 0,
          maxUses: 10,
          maxUsesPerCustomer: 1,
          startsAt: new Date('2026-01-01T00:00:00.000Z'),
          expiresAt: new Date('2026-12-31T00:00:00.000Z'),
          discountValue: new Prisma.Decimal(1000),
        }),
        update: jest.fn(),
      },
      couponUsage: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'usage-1' }),
      },
    };
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof tx) => unknown) => callback(tx),
    );
    repository.findWalletAccount.mockResolvedValue({
      id: 'wallet-1',
      balance: new Prisma.Decimal(500),
      currency: 'PKR',
    });
    repository.createWalletTransaction.mockResolvedValue({ id: 'wallet-tx-1' });

    const result = await service.redeemGiftCardToWallet(
      {
        customerId: 'customer-1',
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
      },
      'gift-123',
      'customer-1',
    );

    expect(tx.coupon.findFirst).toHaveBeenCalledWith({
      where: {
        restaurantId: 'restaurant-1',
        code: 'GIFT-123',
        kind: 'GIFT_CARD',
        deletedAt: null,
      },
    });
    expect(tx.couponUsage.create).toHaveBeenCalledWith({
      data: {
        couponId: 'gift-1',
        customerId: 'customer-1',
      },
    });
    expect(repository.updateWalletAccount).toHaveBeenCalledWith(
      'wallet-1',
      { balance: new Prisma.Decimal(1500) },
      tx,
    );
    expect(repository.createWalletTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: new Prisma.Decimal(1000),
        balanceAfter: new Prisma.Decimal(1500),
        metadata: {
          source: 'GIFT_CARD',
          couponId: 'gift-1',
          couponUsageId: 'usage-1',
          code: 'GIFT-123',
        },
      }),
      tx,
    );
    expect(result.creditedAmount).toBe(1000);
    expect(result.walletBalance).toBe(1500);
  });
});
