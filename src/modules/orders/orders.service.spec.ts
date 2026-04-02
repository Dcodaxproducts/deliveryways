import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrderTypeEnum, UserRoleEnum } from '../../common/enums';
import { OrdersService } from './orders.service';

describe('OrdersService - delivery radius', () => {
  let service: OrdersService;

  beforeEach(() => {
    service = new OrdersService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('calculates 0 km for same point', () => {
    const distFn = (
      service as unknown as {
        calculateDistanceKm: (
          a: number,
          b: number,
          c: number,
          d: number,
        ) => number;
      }
    ).calculateDistanceKm;
    const distance = distFn.call(service, 31.5204, 74.3587, 31.5204, 74.3587);
    expect(distance).toBe(0);
  });

  it('calculates correct distance between two Lahore points', () => {
    const distFn = (
      service as unknown as {
        calculateDistanceKm: (
          a: number,
          b: number,
          c: number,
          d: number,
        ) => number;
      }
    ).calculateDistanceKm;
    const distance = distFn.call(service, 31.5204, 74.3587, 31.5497, 74.3436);
    expect(distance).toBeGreaterThan(2);
    expect(distance).toBeLessThan(5);
  });
});

describe('OrdersService - status transitions', () => {
  let service: OrdersService;

  beforeEach(() => {
    service = new OrdersService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  const checkTransition = (
    orderType: string,
    current: string,
    next: string,
  ): boolean => {
    const fn = (
      service as unknown as {
        isValidStatusTransition: (a: string, b: string, c: string) => boolean;
      }
    ).isValidStatusTransition;
    return fn.call(service, orderType, current, next);
  };

  it('allows PLACED -> CONFIRMED', () => {
    expect(checkTransition('DELIVERY', 'PLACED', 'CONFIRMED')).toBe(true);
  });

  it('allows PLACED -> REJECTED', () => {
    expect(checkTransition('DELIVERY', 'PLACED', 'REJECTED')).toBe(true);
  });

  it('allows CONFIRMED -> PREPARING', () => {
    expect(checkTransition('DELIVERY', 'CONFIRMED', 'PREPARING')).toBe(true);
  });

  it('allows delivery PREPARING -> OUT_FOR_DELIVERY', () => {
    expect(checkTransition('DELIVERY', 'PREPARING', 'OUT_FOR_DELIVERY')).toBe(
      true,
    );
  });

  it('allows OUT_FOR_DELIVERY -> DELIVERED', () => {
    expect(checkTransition('DELIVERY', 'OUT_FOR_DELIVERY', 'DELIVERED')).toBe(
      true,
    );
  });

  it('allows takeaway PREPARING -> READY_FOR_PICKUP', () => {
    expect(checkTransition('TAKEAWAY', 'PREPARING', 'READY_FOR_PICKUP')).toBe(
      true,
    );
  });

  it('allows READY_FOR_PICKUP -> PICKED_UP', () => {
    expect(checkTransition('TAKEAWAY', 'READY_FOR_PICKUP', 'PICKED_UP')).toBe(
      true,
    );
  });

  it('allows dine-in PREPARING -> READY_TO_SERVE', () => {
    expect(checkTransition('DINE_IN', 'PREPARING', 'READY_TO_SERVE')).toBe(
      true,
    );
  });

  it('allows READY_TO_SERVE -> SERVED', () => {
    expect(checkTransition('DINE_IN', 'READY_TO_SERVE', 'SERVED')).toBe(true);
  });

  it('rejects DELIVERED -> anything', () => {
    expect(checkTransition('DELIVERY', 'DELIVERED', 'PLACED')).toBe(false);
    expect(checkTransition('DELIVERY', 'DELIVERED', 'CANCELLED')).toBe(false);
  });

  it('rejects CANCELLED -> anything', () => {
    expect(checkTransition('DELIVERY', 'CANCELLED', 'PLACED')).toBe(false);
  });

  it('rejects backwards transitions', () => {
    expect(checkTransition('DELIVERY', 'PREPARING', 'CONFIRMED')).toBe(false);
    expect(checkTransition('DELIVERY', 'CONFIRMED', 'PLACED')).toBe(false);
  });

  it('rejects takeaway PREPARING -> OUT_FOR_DELIVERY', () => {
    expect(checkTransition('TAKEAWAY', 'PREPARING', 'OUT_FOR_DELIVERY')).toBe(
      false,
    );
  });

  it('rejects dine-in PREPARING -> OUT_FOR_DELIVERY', () => {
    expect(checkTransition('DINE_IN', 'PREPARING', 'OUT_FOR_DELIVERY')).toBe(
      false,
    );
  });
});

describe('OrdersService - order time validation', () => {
  let service: OrdersService;

  beforeEach(() => {
    service = new OrdersService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('accepts valid ISO order time', () => {
    const fn = (
      service as unknown as {
        assertValidOrderTime: (value: string) => void;
      }
    ).assertValidOrderTime;

    expect(() => fn.call(service, '2026-03-24T19:30:00.000Z')).not.toThrow();
  });

  it('rejects invalid order time', () => {
    const fn = (
      service as unknown as {
        assertValidOrderTime: (value: string) => void;
      }
    ).assertValidOrderTime;

    expect(() => fn.call(service, 'not-a-date')).toThrow(BadRequestException);
  });

  it('marks future order time as scheduled', () => {
    const fn = (
      service as unknown as {
        isScheduledOrderTime: (value: string) => boolean;
      }
    ).isScheduledOrderTime;

    expect(fn.call(service, '2999-03-24T19:30:00.000Z')).toBe(true);
  });

  it('marks past order time as not scheduled', () => {
    const fn = (
      service as unknown as {
        isScheduledOrderTime: (value: string) => boolean;
      }
    ).isScheduledOrderTime;

    expect(fn.call(service, '2020-03-24T19:30:00.000Z')).toBe(false);
  });
});

describe('OrdersService - coupon quote validation', () => {
  it('skips delivery address checks when validating coupon application', async () => {
    const prisma = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'branch-1',
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          settings: {
            allowedOrderTypes: ['DELIVERY', 'TAKEAWAY'],
            allowedPaymentMethods: ['COD'],
            deliveryConfig: {
              radiusKm: 5,
              minOrderAmount: 0,
              deliveryFee: 150,
              isFreeDelivery: false,
              freeDeliveryThreshold: 0,
            },
            taxation: {
              taxPercentage: 0,
            },
          },
        }),
      },
      menuItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'menu-1',
          name: 'Burger',
          restaurantId: 'restaurant-1',
          basePrice: new Prisma.Decimal(500),
          category: { id: 'cat-1' },
          variations: [],
          modifierLinks: [],
          branchOverrides: [],
        }),
      },
      address: {
        findFirst: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
      },
    };
    const couponsService = {
      validateForCheckout: jest.fn().mockResolvedValue({
        coupon: { id: 'coupon-1', code: 'SAVE10' },
        discountAmount: new Prisma.Decimal(100),
        eligibleSubtotal: new Prisma.Decimal(500),
      }),
    };
    const service = new OrdersService(
      prisma as never,
      {} as never,
      couponsService as never,
      {} as never,
      {} as never,
    );

    const result = await service.quoteForCouponValidation(
      {
        uid: 'customer-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      {
        branchId: 'branch-1',
        orderType: OrderTypeEnum.DELIVERY,
        items: [
          {
            menuItemId: 'menu-1',
            quantity: 1,
          },
        ],
        couponCode: 'SAVE10',
        orderTime: '2026-03-24T19:30:00.000Z',
      },
    );

    expect(prisma.address.findFirst).not.toHaveBeenCalled();
    expect(couponsService.validateForCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: 'branch-1',
        customerId: 'customer-1',
        code: 'SAVE10',
        subtotal: 500,
      }),
    );
    expect(result.data.deliveryFee).toBe(150);
    expect(result.data.discountAmount).toBe(100);
    expect(result.data.totalAmount).toBe(550);
  });
});

describe('OrdersService - response mapping', () => {
  let service: OrdersService;

  beforeEach(() => {
    service = new OrdersService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('marks list responses originating from group orders', () => {
    const result = (
      service as unknown as {
        toOrderListResponse: (
          order: Record<string, unknown>,
        ) => Record<string, unknown>;
      }
    ).toOrderListResponse({
      id: 'order-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      orderType: 'DELIVERY',
      paymentMethod: 'COD',
      orderTime: null,
      isScheduled: false,
      status: 'PLACED',
      paymentStatus: 'PENDING',
      subtotal: new Prisma.Decimal(500),
      taxAmount: new Prisma.Decimal(0),
      deliveryFee: new Prisma.Decimal(100),
      discountAmount: new Prisma.Decimal(50),
      totalAmount: new Prisma.Decimal(550),
      customerNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      restaurant: {
        id: 'restaurant-1',
        name: 'Restaurant',
        slug: 'restaurant',
        logoUrl: null,
        coverImage: null,
      },
      branch: { id: 'branch-1', name: 'Main', coverImage: null },
      coupon: null,
      customer: {
        id: 'customer-1',
        email: 'customer@test.com',
        profile: null,
      },
      deliveryman: null,
      sourceGroupOrder: {
        id: 'group-session-1',
        inviteCode: 'INVITE123',
        hostUserId: 'customer-1',
        status: 'CHECKED_OUT',
        participants: [
          {
            id: 'participant-1',
            userId: 'customer-1',
            isHost: true,
            status: 'ACTIVE',
            joinedAt: new Date('2026-04-01T06:00:00.000Z'),
            leftAt: null,
            user: {
              id: 'customer-1',
              email: 'customer@test.com',
              isGuest: false,
              profile: {
                firstName: 'Bilal',
                lastName: 'Shah',
                phone: '03001234567',
                avatarUrl: null,
              },
            },
          },
        ],
      },
      items: [],
    });

    expect(result.isGroupOrder).toBe(true);
    expect(result.groupOrderSessionId).toBe('group-session-1');
    expect(result.groupOrderInviteCode).toBe('INVITE123');
    expect(result.participantCount).toBe(1);
    expect(result.participants).toEqual([
      {
        id: 'participant-1',
        userId: 'customer-1',
        isHost: true,
        status: 'ACTIVE',
        joinedAt: new Date('2026-04-01T06:00:00.000Z'),
        leftAt: null,
        user: {
          id: 'customer-1',
          email: 'customer@test.com',
          isGuest: false,
          firstName: 'Bilal',
          lastName: 'Shah',
          phone: '03001234567',
          avatarUrl: null,
        },
      },
    ]);
  });

  it('marks details responses for normal orders as non-group orders', () => {
    const result = (
      service as unknown as {
        toOrderDetailsResponse: (
          order: Record<string, unknown>,
        ) => Record<string, unknown>;
      }
    ).toOrderDetailsResponse({
      id: 'order-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      couponId: null,
      deliveryAddressId: null,
      deliverymanId: null,
      orderType: 'TAKEAWAY',
      paymentMethod: 'COD',
      orderTime: null,
      isScheduled: false,
      status: 'PLACED',
      paymentStatus: 'PENDING',
      subtotal: new Prisma.Decimal(500),
      taxAmount: new Prisma.Decimal(0),
      deliveryFee: new Prisma.Decimal(0),
      discountAmount: new Prisma.Decimal(0),
      totalAmount: new Prisma.Decimal(500),
      customerNote: null,
      assignedAt: null,
      deliveredAt: null,
      paidAt: null,
      cancelledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      restaurant: {
        id: 'restaurant-1',
        name: 'Restaurant',
        slug: 'restaurant',
        logoUrl: null,
        coverImage: null,
      },
      branch: { id: 'branch-1', name: 'Main', coverImage: null },
      coupon: null,
      customer: {
        id: 'customer-1',
        email: 'customer@test.com',
        profile: null,
      },
      deliveryAddress: null,
      deliveryman: null,
      transactions: [],
      sourceGroupOrder: null,
      items: [],
    });

    expect(result.isGroupOrder).toBe(false);
    expect(result.groupOrderSessionId).toBeNull();
    expect(result.groupOrderInviteCode).toBeNull();
  });
});

describe('OrdersService - admin customer resolution', () => {
  const branch = {
    id: 'branch-1',
    tenantId: 'tenant-1',
    restaurantId: 'restaurant-1',
    settings: {},
  };

  it('lets customers place orders for themselves without lookup', async () => {
    const prisma = {
      user: {
        findFirst: jest.fn(),
      },
    };
    const service = new OrdersService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await (
      service as unknown as {
        resolveQuoteCustomer: (
          user: {
            uid: string;
            role: UserRoleEnum;
            rid?: string;
            tid?: string;
            bid?: string;
          },
          currentBranch: typeof branch,
          requestedCustomerId?: string,
        ) => Promise<{ customerId: string }>;
      }
    ).resolveQuoteCustomer(
      {
        uid: 'customer-1',
        role: UserRoleEnum.CUSTOMER,
        rid: 'restaurant-1',
        tid: 'tenant-1',
      },
      branch,
    );

    expect(result).toEqual({ customerId: 'customer-1' });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('rejects customer override for another customer', async () => {
    const service = new OrdersService(
      {
        user: { findFirst: jest.fn() },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      (
        service as unknown as {
          resolveQuoteCustomer: (
            user: {
              uid: string;
              role: UserRoleEnum;
              rid?: string;
              tid?: string;
              bid?: string;
            },
            currentBranch: typeof branch,
            requestedCustomerId?: string,
          ) => Promise<{ customerId: string }>;
        }
      ).resolveQuoteCustomer(
        {
          uid: 'customer-1',
          role: UserRoleEnum.CUSTOMER,
          rid: 'restaurant-1',
          tid: 'tenant-1',
        },
        branch,
        'customer-2',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires customerId for business admin orders', async () => {
    const service = new OrdersService(
      {
        user: { findFirst: jest.fn() },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      (
        service as unknown as {
          resolveQuoteCustomer: (
            user: {
              uid: string;
              role: UserRoleEnum;
              rid?: string;
              tid?: string;
              bid?: string;
            },
            currentBranch: typeof branch,
            requestedCustomerId?: string,
          ) => Promise<{ customerId: string }>;
        }
      ).resolveQuoteCustomer(
        {
          uid: 'admin-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
          rid: 'restaurant-1',
          tid: 'tenant-1',
          bid: 'branch-1',
        },
        branch,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows business admin when customer belongs to same restaurant', async () => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'customer-1' }),
      },
    };
    const service = new OrdersService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await (
      service as unknown as {
        resolveQuoteCustomer: (
          user: {
            uid: string;
            role: UserRoleEnum;
            rid?: string;
            tid?: string;
            bid?: string;
          },
          currentBranch: typeof branch,
          requestedCustomerId?: string,
        ) => Promise<{ customerId: string }>;
      }
    ).resolveQuoteCustomer(
      {
        uid: 'admin-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
        rid: 'restaurant-1',
        tid: 'tenant-1',
        bid: 'branch-1',
      },
      branch,
      'customer-1',
    );

    expect(result).toEqual({ customerId: 'customer-1' });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'customer-1',
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        role: 'CUSTOMER',
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
      },
    });
  });

  it('rejects business admin when customer is outside restaurant scope', async () => {
    const service = new OrdersService(
      {
        user: { findFirst: jest.fn().mockResolvedValue(null) },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      (
        service as unknown as {
          resolveQuoteCustomer: (
            user: {
              uid: string;
              role: UserRoleEnum;
              rid?: string;
              tid?: string;
              bid?: string;
            },
            currentBranch: typeof branch,
            requestedCustomerId?: string,
          ) => Promise<{ customerId: string }>;
        }
      ).resolveQuoteCustomer(
        {
          uid: 'admin-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
          rid: 'restaurant-1',
          tid: 'tenant-1',
          bid: 'branch-1',
        },
        branch,
        'customer-9',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
