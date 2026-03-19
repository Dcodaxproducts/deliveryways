import { BadRequestException } from '@nestjs/common';
import { UserRoleEnum } from '../../common/enums';
import { OrdersService } from './orders.service';

describe('OrdersService - delivery radius', () => {
  let service: OrdersService;

  beforeEach(() => {
    service = new OrdersService(
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
    );
  });

  const checkTransition = (current: string, next: string): boolean => {
    const fn = (
      service as unknown as {
        isValidStatusTransition: (a: string, b: string) => boolean;
      }
    ).isValidStatusTransition;
    return fn.call(service, current, next);
  };

  it('allows PLACED -> CONFIRMED', () => {
    expect(checkTransition('PLACED', 'CONFIRMED')).toBe(true);
  });

  it('allows PLACED -> REJECTED', () => {
    expect(checkTransition('PLACED', 'REJECTED')).toBe(true);
  });

  it('allows CONFIRMED -> PREPARING', () => {
    expect(checkTransition('CONFIRMED', 'PREPARING')).toBe(true);
  });

  it('allows PREPARING -> OUT_FOR_DELIVERY', () => {
    expect(checkTransition('PREPARING', 'OUT_FOR_DELIVERY')).toBe(true);
  });

  it('allows OUT_FOR_DELIVERY -> DELIVERED', () => {
    expect(checkTransition('OUT_FOR_DELIVERY', 'DELIVERED')).toBe(true);
  });

  it('rejects DELIVERED -> anything', () => {
    expect(checkTransition('DELIVERED', 'PLACED')).toBe(false);
    expect(checkTransition('DELIVERED', 'CANCELLED')).toBe(false);
  });

  it('rejects CANCELLED -> anything', () => {
    expect(checkTransition('CANCELLED', 'PLACED')).toBe(false);
  });

  it('rejects backwards transitions', () => {
    expect(checkTransition('PREPARING', 'CONFIRMED')).toBe(false);
    expect(checkTransition('CONFIRMED', 'PLACED')).toBe(false);
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
