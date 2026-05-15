import { BadRequestException } from '@nestjs/common';
import { PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import {
  OrderTypeEnum,
  PaymentMethodEnum,
  UserRoleEnum,
} from '../../common/enums';
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

describe('OrdersService - deliveryman order access', () => {
  let service: OrdersService;
  let ordersRepository: {
    list: jest.Mock;
    findById: jest.Mock;
    updateStatus: jest.Mock;
    assignDeliveryman: jest.Mock;
  };
  let notificationsService: { notifyOrderStatusChanged: jest.Mock };
  let chatService: {
    syncDeliveryThreadForOrderLifecycle: jest.Mock;
    ensureDeliveryThreadForOrder: jest.Mock;
  };
  let orderTrackingRealtimeService: { emitTrackingUpdate: jest.Mock };

  const deliverymanUser = {
    uid: 'dm-1',
    role: 'DELIVERYMAN' as const,
    actorType: 'DELIVERYMAN' as const,
  };

  beforeEach(() => {
    ordersRepository = {
      list: jest
        .fn()
        .mockResolvedValue({ items: [{ id: 'order-1' }], total: 1 }),
      findById: jest.fn(),
      updateStatus: jest.fn(),
      assignDeliveryman: jest.fn(),
    };

    notificationsService = {
      notifyOrderStatusChanged: jest.fn().mockResolvedValue(undefined),
    };

    chatService = {
      syncDeliveryThreadForOrderLifecycle: jest
        .fn()
        .mockResolvedValue(undefined),
      ensureDeliveryThreadForOrder: jest.fn().mockResolvedValue(undefined),
    };

    orderTrackingRealtimeService = {
      emitTrackingUpdate: jest.fn(),
    };

    service = new OrdersService(
      {} as never,
      ordersRepository as never,
      {} as never,
      notificationsService as never,
      chatService as never,
      orderTrackingRealtimeService as never,
    );

    Object.assign(service as object, {
      toOrderListResponse: jest.fn().mockResolvedValue({ id: 'order-1' }),
      toOrderDetailsResponse: jest.fn().mockResolvedValue({ id: 'order-1' }),
      getTrackingSnapshotForRealtime: jest.fn().mockResolvedValue({ id: 'x' }),
    });
  });

  it('lists only orders assigned to the deliveryman', async () => {
    const query = {
      page: 1,
      limit: 10,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
    };

    const result = await service.list(deliverymanUser as never, query as never);

    expect(ordersRepository.list).toHaveBeenCalledWith(
      undefined,
      query,
      undefined,
      'dm-1',
    );
    expect(result.message).toBe('Orders fetched successfully');
  });

  it('allows deliveryman to fetch details of assigned orders', async () => {
    ordersRepository.findById.mockResolvedValue({
      id: 'order-1',
      restaurantId: 'restaurant-1',
      customerId: 'customer-1',
      deliverymanId: 'dm-1',
    });

    const result = await service.details(deliverymanUser as never, 'order-1');

    expect(result.message).toBe('Order fetched successfully');
  });

  it('blocks deliveryman from fetching another deliveryman order', async () => {
    ordersRepository.findById.mockResolvedValue({
      id: 'order-1',
      restaurantId: 'restaurant-1',
      customerId: 'customer-1',
      deliverymanId: 'dm-2',
    });

    await expect(
      service.details(deliverymanUser as never, 'order-1'),
    ).rejects.toThrow('Cross-deliveryman access denied');
  });

  it('allows deliveryman to mark assigned out-for-delivery order as delivered with valid otp', async () => {
    ordersRepository.findById.mockResolvedValue({
      id: 'order-1',
      restaurantId: 'restaurant-1',
      customerId: 'customer-1',
      deliverymanId: 'dm-1',
      deliveryOtp: '123456',
      orderType: 'DELIVERY',
      status: 'OUT_FOR_DELIVERY',
    });
    ordersRepository.updateStatus = jest.fn().mockResolvedValue({
      id: 'order-1',
      orderType: 'DELIVERY',
      status: 'DELIVERED',
      restaurantId: 'restaurant-1',
      customerId: 'customer-1',
      deliverymanId: 'dm-1',
      deliveryOtp: '123456',
    });

    Object.assign(service as object, {
      toOrderMutationResponse: jest.fn().mockReturnValue({ id: 'order-1' }),
    });

    const result = await service.updateStatus(
      deliverymanUser as never,
      'order-1',
      {
        status: 'DELIVERED',
        deliveryOtp: '123456',
      } as never,
    );

    expect(ordersRepository.updateStatus).toHaveBeenCalledWith(
      'order-1',
      'DELIVERED',
    );
    expect(result.message).toBe('Order status updated successfully');
  });

  it('requires delivery otp before completing a delivery order', async () => {
    ordersRepository.findById.mockResolvedValue({
      id: 'order-1',
      restaurantId: 'restaurant-1',
      customerId: 'customer-1',
      deliverymanId: 'dm-1',
      deliveryOtp: '123456',
      orderType: 'DELIVERY',
      status: 'OUT_FOR_DELIVERY',
    });

    await expect(
      service.updateStatus(deliverymanUser as never, 'order-1', {
        status: 'DELIVERED',
      } as never),
    ).rejects.toThrow('deliveryOtp is required to complete delivery');
  });

  it('rejects wrong delivery otp before completing a delivery order', async () => {
    ordersRepository.findById.mockResolvedValue({
      id: 'order-1',
      restaurantId: 'restaurant-1',
      customerId: 'customer-1',
      deliverymanId: 'dm-1',
      deliveryOtp: '123456',
      orderType: 'DELIVERY',
      status: 'OUT_FOR_DELIVERY',
    });

    await expect(
      service.updateStatus(deliverymanUser as never, 'order-1', {
        status: 'DELIVERED',
        deliveryOtp: '000000',
      } as never),
    ).rejects.toThrow('Invalid delivery OTP');
  });

  it('blocks deliveryman from updating another deliveryman assigned order', async () => {
    ordersRepository.findById.mockResolvedValue({
      id: 'order-1',
      restaurantId: 'restaurant-1',
      customerId: 'customer-1',
      deliverymanId: 'dm-2',
      orderType: 'DELIVERY',
      status: 'OUT_FOR_DELIVERY',
    });

    await expect(
      service.updateStatus(deliverymanUser as never, 'order-1', {
        status: 'DELIVERED',
      } as never),
    ).rejects.toThrow('Cross-deliveryman access denied');
  });

  it('allows deliveryman to accept an unassigned same-branch delivery order', async () => {
    ordersRepository.findById.mockResolvedValue({
      id: 'order-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      deliverymanId: null,
      orderType: 'DELIVERY',
      status: 'PREPARING',
    });
    ordersRepository.assignDeliveryman.mockResolvedValue({
      id: 'order-1',
      restaurantId: 'restaurant-1',
      customerId: 'customer-1',
      deliverymanId: 'dm-1',
      orderType: 'DELIVERY',
      status: 'OUT_FOR_DELIVERY',
    });
    Object.assign(service as object, {
      toOrderMutationResponse: jest.fn().mockReturnValue({ id: 'order-1' }),
    });

    const result = await service.acceptDeliverymanOrder(
      deliverymanUser as never,
      'order-1',
      'branch-1',
      'restaurant-1',
    );

    expect(ordersRepository.assignDeliveryman).toHaveBeenCalledWith(
      'order-1',
      'dm-1',
    );
    expect(chatService.ensureDeliveryThreadForOrder).toHaveBeenCalledWith(
      'order-1',
      'dm-1',
    );
    expect(result).toEqual({ id: 'order-1' });
  });

  it('rejects deliveryman accept when order already has a deliveryman', async () => {
    ordersRepository.findById.mockResolvedValue({
      id: 'order-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      deliverymanId: 'dm-2',
      orderType: 'DELIVERY',
      status: 'PREPARING',
    });

    await expect(
      service.acceptDeliverymanOrder(
        deliverymanUser as never,
        'order-1',
        'branch-1',
        'restaurant-1',
      ),
    ).rejects.toThrow('Order is already assigned to a deliveryman');
    expect(ordersRepository.assignDeliveryman).not.toHaveBeenCalled();
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
          depositAmount: new Prisma.Decimal(50),
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
      {} as never,
      {} as never,
      {
        calculateQuoteBenefits: jest.fn().mockResolvedValue({
          walletAppliedAmount: new Prisma.Decimal(0),
          loyaltyDiscountAmount: new Prisma.Decimal(0),
          loyaltyPointsRedeemed: 0,
          totalAmount: new Prisma.Decimal(600),
        }),
      } as never,
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
        subtotal: 550,
      }),
    );
    expect(result.data.deliveryFee).toBe(150);
    expect(result.data.discountAmount).toBe(100);
    expect(result.data.items[0].depositAmount).toBe(50);
    expect(result.data.totalAmount).toBe(600);
    expect(result.data.payableAmount).toBe(600);
  });

  it('adds delivery price adjustment on top of base item price when pricing mode is MULTIPLE', async () => {
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
            taxation: { taxPercentage: 0 },
          },
        }),
      },
      menuItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'menu-1',
          name: 'Burger',
          restaurantId: 'restaurant-1',
          pricingMode: 'MULTIPLE',
          basePrice: new Prisma.Decimal(500),
          deliveryPriceAdjustment: new Prisma.Decimal(80),
          takeawayPriceAdjustment: new Prisma.Decimal(20),
          depositAmount: new Prisma.Decimal(0),
          category: { id: 'cat-1' },
          variations: [],
          modifierLinks: [],
          branchOverrides: [],
        }),
      },
      address: { findFirst: jest.fn() },
      user: { findFirst: jest.fn() },
    };
    const service = new OrdersService(
      prisma as never,
      {} as never,
      {
        validateForCheckout: jest.fn().mockResolvedValue({
          coupon: null,
          discountAmount: new Prisma.Decimal(0),
          eligibleSubtotal: new Prisma.Decimal(580),
        }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        calculateQuoteBenefits: jest.fn().mockResolvedValue({
          walletAppliedAmount: new Prisma.Decimal(0),
          loyaltyDiscountAmount: new Prisma.Decimal(0),
          loyaltyPointsRedeemed: 0,
          totalAmount: new Prisma.Decimal(730),
        }),
      } as never,
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
        items: [{ menuItemId: 'menu-1', quantity: 1 }],
        orderTime: '2026-03-24T19:30:00.000Z',
      },
    );

    expect(result.data.items[0].unitPrice).toBe(580);
    expect(result.data.subtotal).toBe(580);
  });

  it('calculates percentage-based variation prices from item base price in quotes', async () => {
    const prisma = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'branch-1',
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          settings: {
            allowedOrderTypes: ['DELIVERY'],
            allowedPaymentMethods: ['COD'],
            deliveryConfig: {
              radiusKm: 5,
              minOrderAmount: 0,
              deliveryFee: 0,
              isFreeDelivery: false,
              freeDeliveryThreshold: 0,
            },
            taxation: { taxPercentage: 0 },
          },
        }),
      },
      menuItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'menu-1',
          name: 'Burger',
          restaurantId: 'restaurant-1',
          pricingMode: 'SINGLE',
          basePrice: new Prisma.Decimal(500),
          deliveryPriceAdjustment: new Prisma.Decimal(0),
          takeawayPriceAdjustment: new Prisma.Decimal(0),
          depositAmount: new Prisma.Decimal(0),
          category: {
            id: 'cat-1',
            variations: [
              {
                id: 'var-1',
                name: 'Large',
                price: new Prisma.Decimal(110),
                modifierPriceOverrides: [],
              },
            ],
          },
          variations: [],
          modifierLinks: [],
          branchOverrides: [],
        }),
      },
      address: { findFirst: jest.fn() },
      user: { findFirst: jest.fn() },
    };
    const service = new OrdersService(
      prisma as never,
      {} as never,
      {
        validateForCheckout: jest.fn().mockResolvedValue({
          coupon: null,
          discountAmount: new Prisma.Decimal(0),
          eligibleSubtotal: new Prisma.Decimal(110),
        }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        calculateQuoteBenefits: jest.fn().mockResolvedValue({
          walletAppliedAmount: new Prisma.Decimal(0),
          loyaltyDiscountAmount: new Prisma.Decimal(0),
          loyaltyPointsRedeemed: 0,
          totalAmount: new Prisma.Decimal(110),
        }),
      } as never,
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
        items: [{ menuItemId: 'menu-1', variationId: 'var-1', quantity: 1 }],
        orderTime: '2026-03-24T19:30:00.000Z',
      },
    );

    expect(result.data.items[0].unitPrice).toBe(110);
    expect(result.data.subtotal).toBe(110);
  });

  it('accepts item-level variations in quotes', async () => {
    const prisma = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'branch-1',
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          settings: {
            allowedOrderTypes: ['DELIVERY'],
            allowedPaymentMethods: ['COD'],
            deliveryConfig: {
              radiusKm: 5,
              minOrderAmount: 0,
              deliveryFee: 0,
              isFreeDelivery: false,
              freeDeliveryThreshold: 0,
            },
            taxation: { taxPercentage: 0 },
          },
        }),
      },
      menuItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'menu-1',
          name: 'Pizza',
          restaurantId: 'restaurant-1',
          pricingMode: 'SINGLE',
          basePrice: new Prisma.Decimal(500),
          deliveryPriceAdjustment: new Prisma.Decimal(0),
          takeawayPriceAdjustment: new Prisma.Decimal(0),
          depositAmount: new Prisma.Decimal(0),
          category: {
            id: 'cat-1',
            variations: [],
            variationLinks: [],
          },
          variationPriceOverrides: [
            {
              menuItemId: 'menu-1',
              variationId: 'var-item-1',
              price: new Prisma.Decimal(650),
              pickupPrice: null,
              displayText: null,
              variation: {
                id: 'var-item-1',
                name: 'Large',
                price: new Prisma.Decimal(0),
                modifierPriceOverrides: [],
                itemPriceOverrides: [],
              },
            },
          ],
          variations: [],
          modifierLinks: [],
          modifierPriceOverrides: [],
          branchOverrides: [],
        }),
      },
      address: { findFirst: jest.fn() },
      user: { findFirst: jest.fn() },
    };
    const service = new OrdersService(
      prisma as never,
      {} as never,
      {
        validateForCheckout: jest.fn().mockResolvedValue({
          coupon: null,
          discountAmount: new Prisma.Decimal(0),
          eligibleSubtotal: new Prisma.Decimal(650),
        }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        calculateQuoteBenefits: jest.fn().mockResolvedValue({
          walletAppliedAmount: new Prisma.Decimal(0),
          loyaltyDiscountAmount: new Prisma.Decimal(0),
          loyaltyPointsRedeemed: 0,
          totalAmount: new Prisma.Decimal(650),
        }),
      } as never,
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
          { menuItemId: 'menu-1', variationId: 'var-item-1', quantity: 1 },
        ],
        orderTime: '2026-03-24T19:30:00.000Z',
      },
    );

    expect(result.data.items[0].variationName).toBe('Large');
    expect(result.data.items[0].unitPrice).toBe(650);
    expect(result.data.subtotal).toBe(650);
  });

  it('accepts modifiers configured on the selected item variation in quotes', async () => {
    const prisma = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'branch-1',
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          settings: {
            allowedOrderTypes: ['DELIVERY'],
            allowedPaymentMethods: ['COD'],
            deliveryConfig: {
              radiusKm: 5,
              minOrderAmount: 0,
              deliveryFee: 0,
              isFreeDelivery: false,
              freeDeliveryThreshold: 0,
            },
            taxation: { taxPercentage: 0 },
          },
        }),
      },
      menuItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'menu-1',
          name: 'Zingory cheese',
          restaurantId: 'restaurant-1',
          pricingMode: 'SINGLE',
          basePrice: new Prisma.Decimal(100),
          deliveryPriceAdjustment: new Prisma.Decimal(0),
          takeawayPriceAdjustment: new Prisma.Decimal(0),
          depositAmount: new Prisma.Decimal(0),
          category: {
            id: 'cat-1',
            variations: [
              {
                id: 'var-1',
                name: 'Large',
                price: new Prisma.Decimal(100),
                itemPriceOverrides: [],
                modifierPriceOverrides: [
                  {
                    modifierId: 'modifier-cheese',
                    priceDelta: new Prisma.Decimal(25),
                    modifier: {
                      id: 'modifier-cheese',
                      name: 'Extra Cheese',
                      priceDelta: new Prisma.Decimal(0),
                      itemPriceOverrides: [],
                      variationPriceOverrides: [],
                    },
                  },
                ],
              },
            ],
          },
          variations: [],
          modifierLinks: [],
          modifierPriceOverrides: [],
          branchOverrides: [],
        }),
      },
      address: { findFirst: jest.fn() },
      user: { findFirst: jest.fn() },
    };
    const service = new OrdersService(
      prisma as never,
      {} as never,
      {
        validateForCheckout: jest.fn().mockResolvedValue({
          coupon: null,
          discountAmount: new Prisma.Decimal(0),
          eligibleSubtotal: new Prisma.Decimal(125),
        }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        calculateQuoteBenefits: jest.fn().mockResolvedValue({
          walletAppliedAmount: new Prisma.Decimal(0),
          loyaltyDiscountAmount: new Prisma.Decimal(0),
          loyaltyPointsRedeemed: 0,
          totalAmount: new Prisma.Decimal(125),
        }),
      } as never,
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
            variationId: 'var-1',
            quantity: 1,
            modifiers: [{ modifierId: 'modifier-cheese', quantity: 1 }],
          },
        ],
        orderTime: '2026-03-24T19:30:00.000Z',
      },
    );

    expect(result.data.items[0].snapshotModifiers).toEqual([
      {
        modifierId: 'modifier-cheese',
        name: 'Extra Cheese',
        quantity: 1,
        unitPrice: 25,
      },
    ]);
    expect(result.data.items[0].unitPrice).toBe(125);
    expect(result.data.subtotal).toBe(125);
  });

  it('rejects order modifiers above item maxSelect', async () => {
    const prisma = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'branch-1',
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          settings: {
            allowedOrderTypes: ['DELIVERY'],
            allowedPaymentMethods: ['COD'],
            deliveryConfig: {
              radiusKm: 5,
              minOrderAmount: 0,
              deliveryFee: 0,
              isFreeDelivery: false,
              freeDeliveryThreshold: 0,
            },
            taxation: { taxPercentage: 0 },
          },
        }),
      },
      menuItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'menu-1',
          name: 'Burger',
          restaurantId: 'restaurant-1',
          isRequired: false,
          minSelect: 0,
          maxSelect: 1,
          pricingMode: 'SINGLE',
          basePrice: new Prisma.Decimal(100),
          deliveryPriceAdjustment: new Prisma.Decimal(0),
          takeawayPriceAdjustment: new Prisma.Decimal(0),
          depositAmount: new Prisma.Decimal(0),
          category: { id: 'cat-1', variations: [], modifierLinks: [] },
          variations: [],
          modifierLinks: [
            {
              modifierGroup: {
                id: 'group-1',
                name: 'Sauces',
                minSelect: 0,
                maxSelect: 99,
                isRequired: false,
                modifierLinks: [
                  {
                    modifier: {
                      id: 'modifier-1',
                      name: 'Sauce 1',
                      priceDelta: new Prisma.Decimal(0),
                      itemPriceOverrides: [],
                      variationPriceOverrides: [],
                    },
                  },
                  {
                    modifier: {
                      id: 'modifier-2',
                      name: 'Sauce 2',
                      priceDelta: new Prisma.Decimal(0),
                      itemPriceOverrides: [],
                      variationPriceOverrides: [],
                    },
                  },
                ],
              },
            },
          ],
          modifierPriceOverrides: [],
          branchOverrides: [],
        }),
      },
      address: { findFirst: jest.fn() },
      user: { findFirst: jest.fn() },
    };
    const service = new OrdersService(
      prisma as never,
      {} as never,
      { validateForCheckout: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.quoteForCouponValidation(
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
              modifiers: [
                { modifierId: 'modifier-1', quantity: 1 },
                { modifierId: 'modifier-2', quantity: 1 },
              ],
            },
          ],
          orderTime: '2026-03-24T19:30:00.000Z',
        },
      ),
    ).rejects.toThrow('Burger allows at most 1 modifier selection(s)');
  });

  it('rejects order item quantity above item maxQuantity', async () => {
    const prisma = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'branch-1',
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          settings: {
            allowedOrderTypes: ['DELIVERY'],
            allowedPaymentMethods: ['COD'],
            deliveryConfig: {
              radiusKm: 5,
              minOrderAmount: 0,
              deliveryFee: 0,
              isFreeDelivery: false,
              freeDeliveryThreshold: 0,
            },
            taxation: { taxPercentage: 0 },
          },
        }),
      },
      menuItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'menu-1',
          name: 'Burger',
          restaurantId: 'restaurant-1',
          isRequired: false,
          minSelect: 0,
          maxSelect: null,
          minQuantity: 1,
          maxQuantity: 2,
          pricingMode: 'SINGLE',
          basePrice: new Prisma.Decimal(100),
          deliveryPriceAdjustment: new Prisma.Decimal(0),
          takeawayPriceAdjustment: new Prisma.Decimal(0),
          depositAmount: new Prisma.Decimal(0),
          category: { id: 'cat-1', variations: [], modifierLinks: [] },
          variations: [],
          modifierLinks: [],
          modifierPriceOverrides: [],
          branchOverrides: [],
        }),
      },
      address: { findFirst: jest.fn() },
      user: { findFirst: jest.fn() },
    };
    const service = new OrdersService(
      prisma as never,
      {} as never,
      { validateForCheckout: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.quoteForCouponValidation(
        {
          uid: 'customer-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          role: UserRoleEnum.CUSTOMER,
        },
        {
          branchId: 'branch-1',
          orderType: OrderTypeEnum.DELIVERY,
          items: [{ menuItemId: 'menu-1', quantity: 3 }],
          orderTime: '2026-03-24T19:30:00.000Z',
        },
      ),
    ).rejects.toThrow('Burger allows at most 2 item(s)');
  });
});

describe('OrdersService - branch address lookup', () => {
  it('prefers active branch addresses that already have coordinates', async () => {
    const addressFindFirstCalls: unknown[] = [];
    const addressFindFirst = jest.fn().mockImplementation((args: unknown) => {
      addressFindFirstCalls.push(args);

      return addressFindFirstCalls.length === 1
        ? {
            lat: new Prisma.Decimal('31.5204'),
            lng: new Prisma.Decimal('74.3587'),
          }
        : {
            lat: new Prisma.Decimal('31.5205'),
            lng: new Prisma.Decimal('74.3588'),
          };
    });
    const prisma = {
      address: {
        findFirst: addressFindFirst,
      },
    };
    const service = new OrdersService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const fn = (
      service as unknown as {
        assertAddressWithinRadius: (
          customerId: string,
          deliveryAddressId: string,
          branchId: string,
          radiusKm: number,
        ) => Promise<void>;
      }
    ).assertAddressWithinRadius;

    await expect(
      fn.call(service, 'customer-1', 'address-1', 'branch-1', 10),
    ).resolves.toBeUndefined();

    const secondCall = addressFindFirstCalls[1] as {
      where: {
        refType: string;
        referenceId: string;
        isActive: boolean;
        deletedAt: null;
        lat: { not: null };
        lng: { not: null };
      };
      orderBy: { updatedAt: 'desc' };
    };

    expect(secondCall).toMatchObject({
      where: {
        refType: 'BRANCH',
        referenceId: 'branch-1',
        isActive: true,
        deletedAt: null,
        lat: { not: null },
        lng: { not: null },
      },
      orderBy: { updatedAt: 'desc' },
    });
  });
});

describe('OrdersService - response mapping', () => {
  let service: OrdersService;

  beforeEach(() => {
    service = new OrdersService(
      {
        menuItem: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('marks list responses originating from group orders with nested participant items', async () => {
    const menuItemFindMany = (
      service as unknown as {
        prisma: { menuItem: { findMany: jest.Mock } };
      }
    ).prisma.menuItem.findMany;

    menuItemFindMany.mockResolvedValue([
      {
        id: 'menu-1',
        restaurantId: 'restaurant-1',
        categoryId: 'cat-1',
        name: 'Burger',
        slug: 'burger',
        description: null,
        imageUrl: 'https://example.com/burger.png',
        sku: 'SKU-1',
        basePrice: new Prisma.Decimal(500),
        prepTimeMinutes: 10,
        dietaryFlags: [],
        allergenFlags: [],
        isActive: true,
        deletedAt: null,
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        updatedAt: new Date('2026-04-01T00:00:00.000Z'),
        category: { id: 'cat-1', name: 'Burgers', imageUrl: null },
        variations: [],
        modifierLinks: [],
        branchOverrides: [],
      },
    ]);

    const result = await (
      service as unknown as {
        toOrderListResponse: (
          order: Record<string, unknown>,
        ) => Promise<Record<string, unknown>>;
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
        items: [
          {
            id: 'group-item-1',
            participantId: 'participant-1',
            menuItemId: 'menu-1',
            variationId: null,
            quantity: 1,
            note: 'no mayo',
            modifiers: [],
            createdAt: new Date('2026-04-01T06:05:00.000Z'),
            updatedAt: new Date('2026-04-01T06:05:00.000Z'),
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
        items: [
          {
            id: 'group-item-1',
            menuItemId: 'menu-1',
            variationId: '',
            quantity: 1,
            note: 'no mayo',
            modifiers: [],
            createdAt: new Date('2026-04-01T06:05:00.000Z'),
            updatedAt: new Date('2026-04-01T06:05:00.000Z'),
            menuItem: {
              id: 'menu-1',
              restaurantId: 'restaurant-1',
              categoryId: 'cat-1',
              name: 'Burger',
              slug: 'burger',
              description: null,
              imageUrl: 'https://example.com/burger.png',
              sku: 'SKU-1',
              basePrice: new Prisma.Decimal(500),
              prepTimeMinutes: 10,
              dietaryFlags: [],
              allergenFlags: [],
              isActive: true,
              deletedAt: null,
              createdAt: new Date('2026-04-01T00:00:00.000Z'),
              updatedAt: new Date('2026-04-01T00:00:00.000Z'),
              category: {
                id: 'cat-1',
                name: 'Burgers',
                imageUrl: null,
              },
              variations: [],
              modifierLinks: [],
              branchOverrides: [],
            },
          },
        ],
      },
    ]);
  });

  it('includes group-order participants with nested participant items in details responses', async () => {
    const menuItemFindMany = (
      service as unknown as {
        prisma: { menuItem: { findMany: jest.Mock } };
      }
    ).prisma.menuItem.findMany;

    menuItemFindMany.mockResolvedValue([
      {
        id: 'menu-1',
        restaurantId: 'restaurant-1',
        categoryId: 'cat-1',
        name: 'Burger',
        slug: 'burger',
        description: null,
        imageUrl: 'https://example.com/burger.png',
        sku: 'SKU-1',
        basePrice: new Prisma.Decimal(500),
        prepTimeMinutes: 10,
        dietaryFlags: [],
        allergenFlags: [],
        isActive: true,
        deletedAt: null,
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        updatedAt: new Date('2026-04-01T00:00:00.000Z'),
        category: { id: 'cat-1', name: 'Burgers', imageUrl: null },
        variations: [],
        modifierLinks: [],
        branchOverrides: [],
      },
    ]);

    const result = await (
      service as unknown as {
        toOrderDetailsResponse: (
          order: Record<string, unknown>,
        ) => Promise<Record<string, unknown>>;
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
        items: [
          {
            id: 'group-item-1',
            participantId: 'participant-1',
            menuItemId: 'menu-1',
            variationId: null,
            quantity: 1,
            note: 'no mayo',
            modifiers: [],
            createdAt: new Date('2026-04-01T06:05:00.000Z'),
            updatedAt: new Date('2026-04-01T06:05:00.000Z'),
          },
        ],
      },
      items: [
        {
          id: 'item-1',
          menuItemId: 'menu-1',
          menuItemName: 'Burger',
          variationId: null,
          variationName: null,
          unitPrice: new Prisma.Decimal(500),
          quantity: 1,
          lineTotal: new Prisma.Decimal(500),
          note: null,
          snapshotModifiers: [],
          menuItem: {
            id: 'menu-1',
            slug: 'burger',
            imageUrl: 'https://example.com/burger.png',
            category: { id: 'cat-1', name: 'Burgers', imageUrl: null },
          },
        },
      ],
    });

    expect(result.isGroupOrder).toBe(true);
    expect(result.groupOrderSessionId).toBe('group-session-1');
    expect(result.groupOrderInviteCode).toBe('INVITE123');
    expect(result.participantCount).toBe(1);
    expect(result.itemCount).toBe(1);
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
        items: [
          {
            id: 'group-item-1',
            menuItemId: 'menu-1',
            variationId: '',
            quantity: 1,
            note: 'no mayo',
            modifiers: [],
            createdAt: new Date('2026-04-01T06:05:00.000Z'),
            updatedAt: new Date('2026-04-01T06:05:00.000Z'),
            menuItem: {
              id: 'menu-1',
              restaurantId: 'restaurant-1',
              categoryId: 'cat-1',
              name: 'Burger',
              slug: 'burger',
              description: null,
              imageUrl: 'https://example.com/burger.png',
              sku: 'SKU-1',
              basePrice: new Prisma.Decimal(500),
              prepTimeMinutes: 10,
              dietaryFlags: [],
              allergenFlags: [],
              isActive: true,
              deletedAt: null,
              createdAt: new Date('2026-04-01T00:00:00.000Z'),
              updatedAt: new Date('2026-04-01T00:00:00.000Z'),
              category: {
                id: 'cat-1',
                name: 'Burgers',
                imageUrl: null,
              },
              variations: [],
              modifierLinks: [],
              branchOverrides: [],
            },
          },
        ],
      },
    ]);
    expect(result.itemsPreview).toEqual([
      {
        id: 'item-1',
        menuItemId: 'menu-1',
        menuItemName: 'Burger',
        imageUrl: 'https://example.com/burger.png',
        variationId: '',
        variationName: null,
        quantity: 1,
        unitPrice: 500,
        lineTotal: 500,
        note: null,
        snapshotModifiers: [],
        snapshotSections: [],
      },
    ]);
  });

  it('marks details responses for normal orders as non-group orders', async () => {
    const result = await (
      service as unknown as {
        toOrderDetailsResponse: (
          order: Record<string, unknown>,
        ) => Promise<Record<string, unknown>>;
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

describe('OrdersService - wallet payment', () => {
  it('marks wallet-only orders as paid and awards loyalty points', async () => {
    const paymentTransactionCreate = jest.fn();
    const ordersRepository = {
      create: jest.fn().mockResolvedValue({
        id: 'order-1',
        tenantId: 'tenant-1',
        subtotal: new Prisma.Decimal(500),
        taxAmount: new Prisma.Decimal(0),
        deliveryFee: new Prisma.Decimal(0),
        discountAmount: new Prisma.Decimal(0),
        loyaltyDiscountAmount: new Prisma.Decimal(0),
        walletAppliedAmount: new Prisma.Decimal(500),
        totalAmount: new Prisma.Decimal(0),
      }),
    };
    const prisma = {
      restaurant: {
        findUnique: jest.fn().mockResolvedValue({
          settings: { currency: 'USD' },
        }),
      },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        Promise.resolve(
          callback({
            paymentTransaction: {
              create: paymentTransactionCreate,
            },
          }),
        ),
      ),
    };
    const loyaltyWalletService = {
      applyOrderBenefits: jest.fn(),
      awardPointsForPaidOrder: jest.fn(),
    };
    const service = new OrdersService(
      prisma as never,
      ordersRepository as never,
      { registerUsage: jest.fn() } as never,
      { notifyOrderPlaced: jest.fn() } as never,
      {} as never,
      {
        emitOrderCreated: jest.fn(),
        emitOrderStatusChanged: jest.fn(),
      } as never,
      undefined,
      loyaltyWalletService as never,
    );

    jest
      .spyOn(
        service as unknown as {
          buildQuote: (user: unknown, dto: unknown) => Promise<unknown>;
        },
        'buildQuote',
      )
      .mockResolvedValue({
        branch: {
          id: 'branch-1',
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          settings: {
            ordering: {
              allowedOrderTypes: ['DELIVERY', 'TAKEAWAY'],
              allowedPaymentMethods: ['COD', 'STRIPE', 'WALLET'],
            },
          },
        },
        customer: { customerId: 'customer-1' },
        lines: [],
        subtotal: new Prisma.Decimal(500),
        taxAmount: new Prisma.Decimal(0),
        deliveryFee: new Prisma.Decimal(0),
        discountAmount: new Prisma.Decimal(0),
        walletAppliedAmount: new Prisma.Decimal(500),
        loyaltyDiscountAmount: new Prisma.Decimal(0),
        loyaltyPointsRedeemed: 0,
        totalAmount: new Prisma.Decimal(0),
        couponId: undefined,
      });

    const result = await service.create(
      {
        uid: 'customer-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      } as never,
      {
        branchId: 'branch-1',
        orderType: OrderTypeEnum.DELIVERY,
        paymentMethod: PaymentMethodEnum.WALLET,
        items: [],
        orderTime: '2026-04-16T12:00:00.000Z',
      },
    );

    expect(result.data.totalAmount).toBe(500);
    expect(result.data.payableAmount).toBe(0);
    expect(result.data.walletAppliedAmount).toBe(500);
    const deliveryOtpMatcher = expect.stringMatching(/^\d{6}$/) as unknown;
    expect(ordersRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethod: PaymentMethod.WALLET,
        paymentStatus: PaymentStatus.PAID,
        deliveryOtp: deliveryOtpMatcher,
      }),
      expect.anything(),
    );
    expect(paymentTransactionCreate).toHaveBeenCalled();
    const [paymentTransactionArgs] = paymentTransactionCreate.mock.calls[0] as [
      {
        data: {
          paymentMethod: PaymentMethod;
          status: PaymentStatus;
          amount: Prisma.Decimal;
          currency: string;
        };
      },
    ];
    expect(paymentTransactionArgs.data.paymentMethod).toBe(
      PaymentMethod.WALLET,
    );
    expect(paymentTransactionArgs.data.status).toBe(PaymentStatus.PAID);
    expect(paymentTransactionArgs.data.currency).toBe('USD');
    expect(
      paymentTransactionArgs.data.amount.equals(new Prisma.Decimal(500)),
    ).toBe(true);
    expect(loyaltyWalletService.awardPointsForPaidOrder).toHaveBeenCalledWith(
      'order-1',
      undefined,
      'customer-1',
    );
  });

  it('strips delivery otp from generic mutation responses', () => {
    const service = new OrdersService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const response = (
      service as unknown as {
        toOrderMutationResponse: (order: {
          id: string;
          tenantId: string;
          deliveryOtp: string;
          subtotal: Prisma.Decimal;
          taxAmount: Prisma.Decimal;
          deliveryFee: Prisma.Decimal;
          discountAmount: Prisma.Decimal;
          loyaltyDiscountAmount: Prisma.Decimal;
          walletAppliedAmount: Prisma.Decimal;
          totalAmount: Prisma.Decimal;
        }) => Record<string, unknown>;
      }
    ).toOrderMutationResponse({
      id: 'order-1',
      tenantId: 'tenant-1',
      deliveryOtp: '123456',
      subtotal: new Prisma.Decimal(500),
      taxAmount: new Prisma.Decimal(0),
      deliveryFee: new Prisma.Decimal(50),
      discountAmount: new Prisma.Decimal(0),
      loyaltyDiscountAmount: new Prisma.Decimal(0),
      walletAppliedAmount: new Prisma.Decimal(0),
      totalAmount: new Prisma.Decimal(550),
    });

    expect(response).not.toHaveProperty('tenantId');
    expect(response).not.toHaveProperty('deliveryOtp');
    expect(response.payableAmount).toBe(550);
  });

  it('rejects wallet payment when wallet balance is insufficient', async () => {
    const service = new OrdersService(
      {
        restaurant: {
          findUnique: jest.fn().mockResolvedValue({
            settings: { currency: 'USD' },
          }),
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      {} as never,
    );

    jest
      .spyOn(
        service as unknown as {
          buildQuote: (user: unknown, dto: unknown) => Promise<unknown>;
        },
        'buildQuote',
      )
      .mockResolvedValue({
        branch: {
          id: 'branch-1',
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          settings: {
            ordering: {
              allowedOrderTypes: ['DELIVERY', 'TAKEAWAY'],
              allowedPaymentMethods: ['COD', 'STRIPE', 'WALLET'],
            },
          },
        },
        customer: { customerId: 'customer-1' },
        lines: [],
        subtotal: new Prisma.Decimal(500),
        taxAmount: new Prisma.Decimal(0),
        deliveryFee: new Prisma.Decimal(0),
        discountAmount: new Prisma.Decimal(0),
        walletAppliedAmount: new Prisma.Decimal(300),
        loyaltyDiscountAmount: new Prisma.Decimal(0),
        loyaltyPointsRedeemed: 0,
        totalAmount: new Prisma.Decimal(200),
        couponId: undefined,
      });

    await expect(
      service.create(
        {
          uid: 'customer-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          role: UserRoleEnum.CUSTOMER,
        } as never,
        {
          branchId: 'branch-1',
          orderType: OrderTypeEnum.DELIVERY,
          paymentMethod: PaymentMethodEnum.WALLET,
          items: [],
          orderTime: '2026-04-16T12:00:00.000Z',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows quoted coupon validation without delivery coordinates on the main quote path', async () => {
    const prisma = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'branch-1',
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          settings: {
            ordering: {
              allowedOrderTypes: ['DELIVERY'],
              allowedPaymentMethods: ['COD'],
            },
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
          depositAmount: new Prisma.Decimal(50),
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
        eligibleSubtotal: new Prisma.Decimal(550),
      }),
    };
    const service = new OrdersService(
      prisma as never,
      {} as never,
      couponsService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        calculateQuoteBenefits: jest.fn().mockResolvedValue({
          walletAppliedAmount: new Prisma.Decimal(0),
          loyaltyDiscountAmount: new Prisma.Decimal(0),
          loyaltyPointsRedeemed: 0,
          totalAmount: new Prisma.Decimal(600),
        }),
      } as never,
    );

    const result = await service.quote(
      {
        uid: 'customer-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      {
        branchId: 'branch-1',
        orderType: OrderTypeEnum.DELIVERY,
        deliveryAddressId: 'address-1',
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
        code: 'SAVE10',
        subtotal: 550,
      }),
    );
    expect(result.data.items[0].depositAmount).toBe(50);
    expect(result.data.totalAmount).toBe(600);
  });

  it('prices split pizza using the highest half and returns section snapshots', async () => {
    const prisma = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'branch-1',
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          settings: {
            allowedOrderTypes: ['DELIVERY'],
            allowedPaymentMethods: ['COD'],
            deliveryConfig: {
              radiusKm: 5,
              minOrderAmount: 0,
              deliveryFee: 0,
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
          id: 'menu-parent',
          name: 'Half And Half Pizza',
          restaurantId: 'restaurant-1',
          basePrice: new Prisma.Decimal(900),
          depositAmount: new Prisma.Decimal(0),
          dietaryFlags: ['__SPLIT_PIZZA_ENABLED__'],
          category: { id: 'cat-pizza', variations: [] },
          modifierLinks: [],
          branchOverrides: [],
        }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'flavor-1',
            name: 'Fajita Pizza',
            restaurantId: 'restaurant-1',
            basePrice: new Prisma.Decimal(1200),
            dietaryFlags: ['__SPLIT_PIZZA_ENABLED__'],
            category: { id: 'cat-pizza', variations: [] },
            modifierLinks: [],
            branchOverrides: [],
          },
          {
            id: 'flavor-2',
            name: 'Pepperoni Pizza',
            restaurantId: 'restaurant-1',
            basePrice: new Prisma.Decimal(1000),
            dietaryFlags: ['__SPLIT_PIZZA_ENABLED__'],
            category: { id: 'cat-pizza', variations: [] },
            modifierLinks: [],
            branchOverrides: [],
          },
        ]),
      },
      address: {
        findFirst: jest.fn().mockResolvedValue({
          lat: new Prisma.Decimal('31.5204'),
          lng: new Prisma.Decimal('74.3587'),
        }),
      },
      user: {
        findFirst: jest.fn(),
      },
    };
    const service = new OrdersService(
      prisma as never,
      {} as never,
      { validateForCheckout: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        calculateQuoteBenefits: jest.fn().mockResolvedValue({
          walletAppliedAmount: new Prisma.Decimal(0),
          loyaltyDiscountAmount: new Prisma.Decimal(0),
          loyaltyPointsRedeemed: 0,
          totalAmount: new Prisma.Decimal(1200),
        }),
      } as never,
    );

    const result = await service.quote(
      {
        uid: 'customer-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      {
        branchId: 'branch-1',
        orderType: OrderTypeEnum.DELIVERY,
        deliveryAddressId: 'address-1',
        items: [
          {
            menuItemId: 'menu-parent',
            quantity: 1,
            sections: [
              { slot: 'LEFT', menuItemId: 'flavor-1' },
              { slot: 'RIGHT', menuItemId: 'flavor-2' },
            ],
          },
        ],
        orderTime: '2026-03-24T19:30:00.000Z',
      },
    );

    expect(result.data.items[0].unitPrice).toBe(1200);
    expect(result.data.items[0].snapshotSections).toEqual([
      {
        slot: 'LEFT',
        menuItemId: 'flavor-1',
        menuItemName: 'Fajita Pizza',
        unitPrice: 1200,
      },
      {
        slot: 'RIGHT',
        menuItemId: 'flavor-2',
        menuItemName: 'Pepperoni Pizza',
        unitPrice: 1000,
      },
    ]);
  });

  it('enforces selected menu membership and timed availability only when restaurantMenuId is provided', async () => {
    const prisma = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'branch-1',
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          settings: {
            ordering: {
              allowedOrderTypes: ['DELIVERY'],
              allowedPaymentMethods: ['COD'],
            },
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
      restaurantMenu: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'menu-1',
          isTimed: true,
          timingConfig: {
            timezone: 'Asia/Karachi',
            windows: [{ day: 'MONDAY', start: '12:00', end: '16:00' }],
          },
          items: [{ menuItemId: 'menu-1' }],
          categories: [],
        }),
      },
      menuItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'menu-1',
          name: 'Burger',
          restaurantId: 'restaurant-1',
          basePrice: new Prisma.Decimal(500),
          depositAmount: new Prisma.Decimal(0),
          category: { id: 'cat-1' },
          variations: [],
          modifierLinks: [],
          branchOverrides: [],
        }),
      },
      address: {
        findFirst: jest.fn().mockResolvedValue({
          lat: new Prisma.Decimal('31.5204'),
          lng: new Prisma.Decimal('74.3587'),
        }),
      },
      user: {
        findFirst: jest.fn(),
      },
    };
    const service = new OrdersService(
      prisma as never,
      {} as never,
      { validateForCheckout: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        calculateQuoteBenefits: jest.fn().mockResolvedValue({
          walletAppliedAmount: new Prisma.Decimal(0),
          loyaltyDiscountAmount: new Prisma.Decimal(0),
          loyaltyPointsRedeemed: 0,
          totalAmount: new Prisma.Decimal(650),
        }),
      } as never,
    );

    const result = await service.quote(
      {
        uid: 'customer-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      {
        branchId: 'branch-1',
        restaurantMenuId: 'menu-1',
        orderType: OrderTypeEnum.DELIVERY,
        deliveryAddressId: 'address-1',
        items: [{ menuItemId: 'menu-1', quantity: 1 }],
        orderTime: '2026-04-20T08:00:00.000Z',
      },
    );

    const [[restaurantMenuFindFirstArgs]] = prisma.restaurantMenu.findFirst.mock
      .calls as Array<[{ where: { id: string } }]>;

    expect(restaurantMenuFindFirstArgs.where.id).toBe('menu-1');
    expect(result.data.restaurantMenuId).toBe('menu-1');
  });

  it('rejects selected menus outside their timed window', async () => {
    const prisma = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'branch-1',
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          settings: {
            ordering: {
              allowedOrderTypes: ['DELIVERY'],
              allowedPaymentMethods: ['COD'],
            },
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
      restaurantMenu: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'menu-1',
          isTimed: true,
          timingConfig: {
            timezone: 'Asia/Karachi',
            windows: [{ day: 'MONDAY', start: '12:00', end: '16:00' }],
          },
          items: [{ menuItemId: 'menu-1' }],
          categories: [],
        }),
      },
      menuItem: {
        findFirst: jest.fn(),
      },
      address: {
        findFirst: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
      },
    };
    const service = new OrdersService(
      prisma as never,
      {} as never,
      { validateForCheckout: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        calculateQuoteBenefits: jest.fn(),
      } as never,
    );

    await expect(
      service.quote(
        {
          uid: 'customer-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          role: UserRoleEnum.CUSTOMER,
        },
        {
          branchId: 'branch-1',
          restaurantMenuId: 'menu-1',
          orderType: OrderTypeEnum.DELIVERY,
          deliveryAddressId: 'address-1',
          items: [{ menuItemId: 'menu-1', quantity: 1 }],
          orderTime: '2026-04-20T04:00:00.000Z',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.menuItem.findFirst).not.toHaveBeenCalled();
  });
});
