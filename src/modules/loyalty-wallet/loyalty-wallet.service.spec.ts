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
      findRestaurantScope: jest.fn(),
      findWalletAccount: jest.fn(),
      createWalletAccount: jest.fn(),
      updateWalletAccount: jest.fn(),
      createWalletTransaction: jest.fn(),
      listPurchasedGiftCardTransactions: jest.fn(),
      findGiftCardsByIds: jest.fn(),
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

  it('lists customer-purchased gift cards from purchase transactions', async () => {
    const { service, repository } = makeService();
    const purchasedAt = new Date('2026-06-10T09:00:00.000Z');
    const expiresAt = new Date('2027-06-10T09:00:00.000Z');
    repository.listPurchasedGiftCardTransactions.mockResolvedValue({
      items: [
        {
          id: 'wallet-transaction-1',
          currency: 'PKR',
          createdAt: purchasedAt,
          metadata: {
            source: 'CUSTOMER_GIFT_CARD_PURCHASE',
            giftCardId: 'gift-card-1',
            giftCardCode: 'GIFT-123',
            qrPayload: 'DWGC:GIFT-123',
          },
        },
      ],
      total: 1,
    });
    repository.findGiftCardsByIds.mockResolvedValue([
      {
        id: 'gift-card-1',
        branchId: 'branch-1',
        code: 'GIFT-123',
        title: 'Birthday Gift',
        description: 'Enjoy your meal',
        discountValue: new Prisma.Decimal(1000),
        maxUses: 1,
        maxUsesPerCustomer: 1,
        usedCount: 0,
        startsAt: purchasedAt,
        expiresAt,
        isActive: true,
        status: 'ACTIVE',
        createdAt: purchasedAt,
        updatedAt: purchasedAt,
      },
    ]);

    const result = await service.listPurchasedGiftCards(
      {
        customerId: 'customer-1',
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
      },
      {
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      },
    );

    expect(repository.listPurchasedGiftCardTransactions).toHaveBeenCalledWith(
      { restaurantId: 'restaurant-1', customerId: 'customer-1' },
      { page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'DESC' },
    );
    expect(repository.findGiftCardsByIds).toHaveBeenCalledWith('restaurant-1', [
      'gift-card-1',
    ]);
    expect(result).toEqual({
      items: [
        {
          id: 'gift-card-1',
          code: 'GIFT-123',
          qrPayload: 'DWGC:GIFT-123',
          title: 'Birthday Gift',
          description: 'Enjoy your meal',
          amount: 1000,
          currency: 'PKR',
          branchId: 'branch-1',
          startsAt: purchasedAt,
          expiresAt,
          isActive: true,
          status: 'ACTIVE',
          maxUses: 1,
          maxUsesPerCustomer: 1,
          usedCount: 0,
          isRedeemed: false,
          purchaseWalletTransactionId: 'wallet-transaction-1',
          purchasedAt,
          createdAt: purchasedAt,
          updatedAt: purchasedAt,
        },
      ],
      total: 1,
    });
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

  it('allows Loyalty Program staff to fetch an assigned restaurant program', async () => {
    const { service, repository } = makeService();
    repository.findRestaurantScope.mockResolvedValue({ id: 'restaurant-1' });
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

    const result = await service.getLoyaltyProgramSettings(
      {
        uid: 'staff-1',
        tid: 'tenant-1',
        role: UserRoleEnum.STAFF,
        actorType: 'STAFF',
        restaurantAccess: {
          restaurantIds: ['restaurant-1'],
          allRestaurants: false,
        },
      },
      'restaurant-1',
    );

    expect(result.data.restaurantId).toBe('restaurant-1');
  });

  it('blocks Loyalty Program staff outside assigned restaurants', async () => {
    const { service } = makeService();

    await expect(
      service.getLoyaltyProgramSettings(
        {
          uid: 'staff-1',
          tid: 'tenant-1',
          role: UserRoleEnum.STAFF,
          actorType: 'STAFF',
          restaurantAccess: {
            restaurantIds: ['restaurant-1'],
            allRestaurants: false,
          },
        },
        'restaurant-2',
      ),
    ).rejects.toThrow(
      'You cannot access resources outside your assigned restaurants',
    );
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
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      couponUsage: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'usage-1' }),
      },
      walletTransaction: {
        findFirst: jest.fn().mockResolvedValue(null),
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

  it('purchases a gift card by debiting customer wallet', async () => {
    const { service, repository, prisma } = makeService();
    type CouponCreateArg = {
      data: {
        tenantId: string;
        restaurantId: string;
        code: string;
        title: string;
        description: string | null;
        kind: string;
        maxUses: number;
        maxUsesPerCustomer: number;
        discountValue: Prisma.Decimal;
      };
    };
    const couponCreate = jest
      .fn<Promise<{ id: string; code: string }>, [CouponCreateArg]>()
      .mockResolvedValue({
        id: 'gift-1',
        code: 'GIFT-ABCDE12345',
      });
    const tx = {
      coupon: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: couponCreate,
      },
    };
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof tx) => unknown) => callback(tx),
    );
    repository.findWalletAccount.mockResolvedValue({
      id: 'wallet-1',
      balance: new Prisma.Decimal(2000),
      currency: 'PKR',
    });
    repository.createWalletTransaction.mockResolvedValue({
      id: 'wallet-tx-1',
    });

    const result = await service.purchaseGiftCardFromWallet(
      {
        customerId: 'buyer-1',
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
      },
      {
        amount: 1000,
        title: 'Birthday Gift',
        message: 'Enjoy your meal',
      },
      'buyer-1',
    );

    const couponCreateCall = couponCreate.mock.calls[0][0];
    expect(couponCreateCall.data).toMatchObject({
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      title: 'Birthday Gift',
      description: 'Enjoy your meal',
      kind: 'GIFT_CARD',
      maxUses: 1,
      maxUsesPerCustomer: 1,
      discountValue: new Prisma.Decimal(1000),
    });
    expect(couponCreateCall.data.code).toMatch(/^GIFT-/);
    expect(repository.updateWalletAccount).toHaveBeenCalledWith(
      'wallet-1',
      { balance: new Prisma.Decimal(1000) },
      tx,
    );
    const walletTransactionCalls = repository.createWalletTransaction.mock
      .calls as [
      [
        {
          type: string;
          amount: Prisma.Decimal;
          balanceAfter: Prisma.Decimal;
          metadata: {
            source: string;
            giftCardId: string;
            qrPayload: string;
          };
        },
        unknown,
      ],
    ];
    const walletTransactionCall = walletTransactionCalls[0][0];
    expect(walletTransactionCall).toMatchObject({
      type: 'DEBIT',
      amount: new Prisma.Decimal(-1000),
      balanceAfter: new Prisma.Decimal(1000),
    });
    expect(walletTransactionCall.metadata).toMatchObject({
      source: 'CUSTOMER_GIFT_CARD_PURCHASE',
      giftCardId: 'gift-1',
    });
    expect(walletTransactionCall.metadata.qrPayload).toMatch(/^DWGC:GIFT-/);
    expect(result.amount).toBe(1000);
    expect(result.walletBalance).toBe(1000);
    expect(result.qrPayload).toMatch(/^DWGC:GIFT-/);
  });

  it('blocks gift card purchase when wallet balance is insufficient', async () => {
    const { service, repository } = makeService();
    repository.findWalletAccount.mockResolvedValue({
      id: 'wallet-1',
      balance: new Prisma.Decimal(500),
      currency: 'PKR',
    });

    await expect(
      service.purchaseGiftCardFromWallet(
        {
          customerId: 'buyer-1',
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          branchId: 'branch-1',
        },
        {
          amount: 1000,
        },
        'buyer-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks buyer from redeeming their own purchased gift card', async () => {
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
          maxUses: 1,
          maxUsesPerCustomer: 1,
          startsAt: new Date('2026-01-01T00:00:00.000Z'),
          expiresAt: new Date('2026-12-31T00:00:00.000Z'),
          discountValue: new Prisma.Decimal(1000),
        }),
      },
      couponUsage: {
        count: jest.fn().mockResolvedValue(0),
      },
      walletTransaction: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'purchase-wallet-tx-1',
          customerId: 'buyer-1',
        }),
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

    await expect(
      service.redeemGiftCardToWallet(
        {
          customerId: 'buyer-1',
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          branchId: 'branch-1',
        },
        'DWGC:GIFT-123',
        'buyer-1',
      ),
    ).rejects.toThrow('Gift card cannot be redeemed by buyer');
  });
});
