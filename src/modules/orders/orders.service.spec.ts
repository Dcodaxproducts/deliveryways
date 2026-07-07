import { BadRequestException } from '@nestjs/common';
import {
  CouponDealSelectionMode,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
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

  it('requires only item-attached modifiers marked as required', () => {
    const assertModifierSelectionLimits = (
      service as unknown as {
        assertModifierSelectionLimits: (
          item: {
            id: string;
            name?: string;
            isRequired?: boolean;
            minSelect?: number;
            maxSelect?: number | null;
            modifierLinks: Array<never>;
            modifierPriceOverrides?: Array<{
              modifierId?: string;
              priceDelta: Prisma.Decimal;
              isRequired?: boolean;
              modifier: {
                id: string;
                name: string;
                priceDelta: Prisma.Decimal;
              };
            }>;
          },
          modifiers: Array<{ modifierId: string; quantity?: number }>,
        ) => void;
      }
    ).assertModifierSelectionLimits;
    const menuItem = {
      id: 'menu-1',
      name: 'Basic Pizza Copy',
      modifierLinks: [],
      modifierPriceOverrides: [
        {
          modifierId: 'modifier-required',
          priceDelta: new Prisma.Decimal(100),
          isRequired: true,
          modifier: {
            id: 'modifier-required',
            name: 'Extra Cheese',
            priceDelta: new Prisma.Decimal(0),
          },
        },
        {
          modifierId: 'modifier-optional',
          priceDelta: new Prisma.Decimal(150),
          isRequired: false,
          modifier: {
            id: 'modifier-optional',
            name: 'Olives',
            priceDelta: new Prisma.Decimal(0),
          },
        },
      ],
    };

    expect(() => assertModifierSelectionLimits(menuItem, [])).toThrow(
      'Basic Pizza Copy requires modifier selection(s): Extra Cheese',
    );
    expect(() =>
      assertModifierSelectionLimits(menuItem, [
        { modifierId: 'modifier-required', quantity: 1 },
      ]),
    ).not.toThrow();
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

  it('calculates percentage service charge and tip in amount summary', () => {
    const resolveServiceCharge = (
      service as unknown as {
        resolveServiceCharge: (
          config: { isEnabled: boolean; type: 'PERCENTAGE'; value: number },
          subtotal: Prisma.Decimal,
        ) => {
          type: string | null;
          value: Prisma.Decimal | null;
          amount: Prisma.Decimal;
        };
      }
    ).resolveServiceCharge;
    const buildAmountSummary = (
      service as unknown as {
        buildAmountSummary: (amounts: {
          subtotal: Prisma.Decimal;
          taxAmount: Prisma.Decimal;
          deliveryFee: Prisma.Decimal;
          serviceChargeAmount?: Prisma.Decimal;
          tipAmount?: Prisma.Decimal;
          discountAmount: Prisma.Decimal;
          walletAppliedAmount?: Prisma.Decimal;
          loyaltyDiscountAmount?: Prisma.Decimal;
          payableAmount: Prisma.Decimal;
        }) => {
          serviceChargeAmount: number;
          tipAmount: number;
          totalAmount: number;
          payableAmount: number;
        };
      }
    ).buildAmountSummary;

    const serviceCharge = resolveServiceCharge.call(
      service,
      { isEnabled: true, type: 'PERCENTAGE', value: 10 },
      new Prisma.Decimal(1000),
    );
    const summary = buildAmountSummary.call(service, {
      subtotal: new Prisma.Decimal(1000),
      taxAmount: new Prisma.Decimal(50),
      deliveryFee: new Prisma.Decimal(100),
      serviceChargeAmount: serviceCharge.amount,
      tipAmount: new Prisma.Decimal(150),
      discountAmount: new Prisma.Decimal(100),
      walletAppliedAmount: new Prisma.Decimal(200),
      payableAmount: new Prisma.Decimal(1100),
    });

    expect(Number(serviceCharge.amount)).toBe(100);
    expect(summary.serviceChargeAmount).toBe(100);
    expect(summary.tipAmount).toBe(150);
    expect(summary.totalAmount).toBe(1300);
    expect(summary.payableAmount).toBe(1100);
  });

  it('allows delivery only inside configured delivery hours', () => {
    const assertDeliveryOrderWithinHours = (
      service as unknown as {
        assertDeliveryOrderWithinHours: (
          settings: {
            deliveryHours: Array<{
              dayOfWeek: string;
              isClosed: boolean;
              openTime?: string | null;
              closeTime?: string | null;
              breakTimes?: Array<{ startTime: string; endTime: string }>;
            }>;
          },
          orderType: OrderTypeEnum,
          orderTime: string,
        ) => void;
      }
    ).assertDeliveryOrderWithinHours;
    const settings = {
      deliveryHours: [
        {
          dayOfWeek: 'TUESDAY',
          isClosed: false,
          openTime: '12:00',
          closeTime: '22:00',
          breakTimes: [{ startTime: '15:00', endTime: '16:00' }],
        },
      ],
    };

    expect(() =>
      assertDeliveryOrderWithinHours.call(
        service,
        settings,
        OrderTypeEnum.DELIVERY,
        '2026-06-09T07:30:00.000Z',
      ),
    ).not.toThrow();
    expect(() =>
      assertDeliveryOrderWithinHours.call(
        service,
        settings,
        OrderTypeEnum.DELIVERY,
        '2026-06-09T04:30:00.000Z',
      ),
    ).toThrow('Delivery is not available at requested order time');
    expect(() =>
      assertDeliveryOrderWithinHours.call(
        service,
        settings,
        OrderTypeEnum.DELIVERY,
        '2026-06-09T10:30:00.000Z',
      ),
    ).toThrow('Delivery is not available at requested order time');
  });

  it('validates normal delivery orders against current branch hours', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-09T07:30:00.000Z'));
    const assertDeliveryOrderWithinHours = (
      service as unknown as {
        assertDeliveryOrderWithinHours: (
          settings: {
            deliveryHours: Array<{
              dayOfWeek: string;
              isClosed: boolean;
              openTime?: string | null;
              closeTime?: string | null;
            }>;
          },
          orderType: OrderTypeEnum,
          orderTime: string | null,
        ) => void;
      }
    ).assertDeliveryOrderWithinHours;
    const settings = {
      deliveryHours: [
        {
          dayOfWeek: 'TUESDAY',
          isClosed: false,
          openTime: '12:00',
          closeTime: '22:00',
        },
      ],
    };

    expect(() =>
      assertDeliveryOrderWithinHours.call(
        service,
        settings,
        OrderTypeEnum.DELIVERY,
        null,
      ),
    ).not.toThrow();
    jest.useRealTimers();
  });

  it('keeps branch opening hours authoritative before restaurant delivery fallback', () => {
    const readBranchSettings = (
      service as unknown as {
        readBranchSettings: (
          branchSettings: unknown,
          restaurantSettings?: unknown,
        ) => {
          openingHours: Array<{
            dayOfWeek: string;
            isClosed: boolean;
            openTime?: string | null;
            closeTime?: string | null;
          }>;
          deliveryHours: Array<{
            dayOfWeek: string;
            isClosed: boolean;
            openTime?: string | null;
            closeTime?: string | null;
          }>;
        };
      }
    ).readBranchSettings;
    const settings = readBranchSettings.call(
      service,
      {
        openingHours: [
          {
            dayOfWeek: 'TUESDAY',
            isClosed: false,
            openTime: '09:00',
            closeTime: '18:00',
          },
        ],
        deliveryHours: [],
      },
      {
        deliveryHours: [
          {
            dayOfWeek: 'TUESDAY',
            isClosed: false,
            openTime: '20:00',
            closeTime: '23:00',
          },
        ],
      },
    );

    expect(settings.deliveryHours).toEqual([]);
    expect(settings.openingHours).toEqual([
      {
        dayOfWeek: 'TUESDAY',
        isClosed: false,
        openTime: '09:00',
        closeTime: '18:00',
      },
    ]);
  });

  it('falls back to restaurant schedule hours when branch hours only contain closed rows', () => {
    const readBranchSettings = (
      service as unknown as {
        readBranchSettings: (
          branchSettings: unknown,
          restaurantSettings?: unknown,
        ) => {
          openingHours: Array<{
            dayOfWeek: string;
            isClosed: boolean;
            openTime?: string | null;
            closeTime?: string | null;
          }>;
          deliveryHours: Array<{
            dayOfWeek: string;
            isClosed: boolean;
            openTime?: string | null;
            closeTime?: string | null;
          }>;
        };
      }
    ).readBranchSettings;
    const assertDeliveryOrderWithinHours = (
      service as unknown as {
        assertDeliveryOrderWithinHours: (
          settings: {
            openingHours: Array<{
              dayOfWeek: string;
              isClosed: boolean;
              openTime?: string | null;
              closeTime?: string | null;
            }>;
            deliveryHours: Array<{
              dayOfWeek: string;
              isClosed: boolean;
              openTime?: string | null;
              closeTime?: string | null;
            }>;
          },
          orderType: OrderTypeEnum,
          orderTime: string,
        ) => void;
      }
    ).assertDeliveryOrderWithinHours;

    const settings = readBranchSettings.call(
      service,
      {
        openingHours: [
          {
            dayOfWeek: 'TUESDAY',
            isClosed: true,
            openTime: null,
            closeTime: null,
          },
        ],
        deliveryHours: [],
      },
      {
        openingHours: [
          {
            dayOfWeek: 'TUESDAY',
            isClosed: false,
            openTime: '09:00',
            closeTime: '12:00',
          },
        ],
      },
    );

    expect(settings.openingHours).toEqual([
      {
        dayOfWeek: 'TUESDAY',
        isClosed: false,
        openTime: '09:00',
        closeTime: '12:00',
      },
    ]);
    expect(() =>
      assertDeliveryOrderWithinHours.call(
        service,
        settings,
        OrderTypeEnum.DELIVERY,
        '2026-06-09T04:41:00.000Z',
      ),
    ).not.toThrow();
  });

  it('falls back to restaurant schedule hours when branch hours are not configured', () => {
    const readBranchSettings = (
      service as unknown as {
        readBranchSettings: (
          branchSettings: unknown,
          restaurantSettings?: unknown,
        ) => {
          openingHours: Array<{
            dayOfWeek: string;
            isClosed: boolean;
            openTime?: string | null;
            closeTime?: string | null;
          }>;
          deliveryHours: Array<{
            dayOfWeek: string;
            isClosed: boolean;
            openTime?: string | null;
            closeTime?: string | null;
          }>;
        };
      }
    ).readBranchSettings;
    const assertDeliveryOrderWithinHours = (
      service as unknown as {
        assertDeliveryOrderWithinHours: (
          settings: {
            openingHours: Array<{
              dayOfWeek: string;
              isClosed: boolean;
              openTime?: string | null;
              closeTime?: string | null;
            }>;
            deliveryHours: Array<{
              dayOfWeek: string;
              isClosed: boolean;
              openTime?: string | null;
              closeTime?: string | null;
            }>;
          },
          orderType: OrderTypeEnum,
          orderTime: string,
        ) => void;
      }
    ).assertDeliveryOrderWithinHours;

    const settings = readBranchSettings.call(
      service,
      { openingHours: [], deliveryHours: [] },
      {
        openingHours: [
          {
            dayOfWeek: 'TUESDAY',
            isClosed: false,
            openTime: '09:00',
            closeTime: '18:00',
          },
        ],
      },
    );

    expect(settings.openingHours).toEqual([
      {
        dayOfWeek: 'TUESDAY',
        isClosed: false,
        openTime: '09:00',
        closeTime: '18:00',
      },
    ]);
    expect(() =>
      assertDeliveryOrderWithinHours.call(
        service,
        settings,
        OrderTypeEnum.DELIVERY,
        '2026-06-09T07:30:00.000Z',
      ),
    ).not.toThrow();
  });

  it('allows future scheduled orders after a temporary branch closure ends', () => {
    const assertBranchAcceptingOrders = (
      service as unknown as {
        assertBranchAcceptingOrders: (
          settings: unknown,
          orderTime: string | null,
        ) => void;
      }
    ).assertBranchAcceptingOrders;
    const closedUntil = new Date(Date.now() + 20 * 60 * 1000);
    const afterClosure = new Date(closedUntil.getTime() + 10 * 60 * 1000);
    const duringClosure = new Date(closedUntil.getTime() - 5 * 60 * 1000);
    const settings = {
      temporaryClosure: {
        isClosed: true,
        reason: 'maintenance',
        closedUntil: closedUntil.toISOString(),
        message: 'Branch temporarily closed',
      },
      holidayOpeningHours: [],
    };

    expect(() =>
      assertBranchAcceptingOrders.call(service, settings, null),
    ).toThrow('Branch temporarily closed');
    expect(() =>
      assertBranchAcceptingOrders.call(
        service,
        settings,
        duringClosure.toISOString(),
      ),
    ).toThrow('Branch temporarily closed');
    expect(() =>
      assertBranchAcceptingOrders.call(
        service,
        settings,
        afterClosure.toISOString(),
      ),
    ).not.toThrow();
  });

  it('treats timezone-less scheduled order time as local branch wall time', () => {
    const assertDeliveryOrderWithinHours = (
      service as unknown as {
        assertDeliveryOrderWithinHours: (
          settings: {
            openingHours: Array<{
              dayOfWeek: string;
              isClosed: boolean;
              openTime?: string | null;
              closeTime?: string | null;
            }>;
            deliveryHours: Array<{
              dayOfWeek: string;
              isClosed: boolean;
              openTime?: string | null;
              closeTime?: string | null;
            }>;
            holidayOpeningHours: unknown[];
          },
          orderType: OrderTypeEnum,
          orderTime: string,
          timezone: string,
        ) => void;
      }
    ).assertDeliveryOrderWithinHours;
    const settings = {
      holidayOpeningHours: [],
      openingHours: [
        {
          dayOfWeek: 'TUESDAY',
          isClosed: false,
          openTime: '16:00',
          closeTime: '18:00',
        },
      ],
      deliveryHours: [],
    };

    expect(() =>
      assertDeliveryOrderWithinHours.call(
        service,
        settings,
        OrderTypeEnum.DELIVERY,
        '2026-06-30T16:15:00',
        'Asia/Karachi',
      ),
    ).not.toThrow();
  });

  it('validates scheduled order times in the configured schedule timezone', () => {
    const assertDeliveryOrderWithinHours = (
      service as unknown as {
        assertDeliveryOrderWithinHours: (
          settings: {
            openingHours: Array<{
              dayOfWeek: string;
              isClosed: boolean;
              openTime?: string | null;
              closeTime?: string | null;
            }>;
            deliveryHours: Array<{
              dayOfWeek: string;
              isClosed: boolean;
              openTime?: string | null;
              closeTime?: string | null;
            }>;
            holidayOpeningHours: unknown[];
          },
          orderType: OrderTypeEnum,
          orderTime: string,
          timezone: string,
        ) => void;
      }
    ).assertDeliveryOrderWithinHours;
    const settings = {
      holidayOpeningHours: [],
      openingHours: [
        {
          dayOfWeek: 'TUESDAY',
          isClosed: false,
          openTime: '16:00',
          closeTime: '18:00',
        },
      ],
      deliveryHours: [],
    };

    expect(() =>
      assertDeliveryOrderWithinHours.call(
        service,
        settings,
        OrderTypeEnum.DELIVERY,
        '2026-06-30T14:15:00.000Z',
        'Europe/Berlin',
      ),
    ).not.toThrow();
    expect(() =>
      assertDeliveryOrderWithinHours.call(
        service,
        settings,
        OrderTypeEnum.DELIVERY,
        '2026-06-30T14:15:00.000Z',
        'Asia/Karachi',
      ),
    ).toThrow('Delivery is not available at requested order time');
  });

  it('falls back to opening hours when delivery hours are not configured', () => {
    const assertDeliveryOrderWithinHours = (
      service as unknown as {
        assertDeliveryOrderWithinHours: (
          settings: {
            openingHours: Array<{
              dayOfWeek: string;
              isClosed: boolean;
              openTime?: string | null;
              closeTime?: string | null;
            }>;
            deliveryHours: Array<never>;
          },
          orderType: OrderTypeEnum,
          orderTime: string,
        ) => void;
      }
    ).assertDeliveryOrderWithinHours;
    const settings = {
      openingHours: [
        {
          dayOfWeek: 'TUESDAY',
          isClosed: false,
          openTime: '09:00',
          closeTime: '18:00',
        },
      ],
      deliveryHours: [],
    };

    expect(() =>
      assertDeliveryOrderWithinHours.call(
        service,
        settings,
        OrderTypeEnum.DELIVERY,
        '2026-06-09T07:30:00.000Z',
      ),
    ).not.toThrow();
    expect(() =>
      assertDeliveryOrderWithinHours.call(
        service,
        settings,
        OrderTypeEnum.DELIVERY,
        '2026-06-09T14:30:00.000Z',
      ),
    ).toThrow('Delivery is not available at requested order time');
  });

  it('uses date-specific holiday opening hours for scheduled delivery', () => {
    const assertDeliveryOrderWithinHours = (
      service as unknown as {
        assertDeliveryOrderWithinHours: (
          settings: {
            holidayOpeningHours: Array<{
              date: string;
              isClosed: boolean;
              openTime?: string | null;
              closeTime?: string | null;
            }>;
            openingHours: Array<{
              dayOfWeek: string;
              isClosed: boolean;
              openTime?: string | null;
              closeTime?: string | null;
            }>;
            deliveryHours: Array<{
              dayOfWeek: string;
              isClosed: boolean;
              openTime?: string | null;
              closeTime?: string | null;
            }>;
          },
          orderType: OrderTypeEnum,
          orderTime: string,
        ) => void;
      }
    ).assertDeliveryOrderWithinHours;
    const settings = {
      holidayOpeningHours: [
        {
          date: '2026-06-09',
          isClosed: false,
          openTime: '18:00',
          closeTime: '20:00',
        },
      ],
      openingHours: [
        {
          dayOfWeek: 'TUESDAY',
          isClosed: false,
          openTime: '09:00',
          closeTime: '22:00',
        },
      ],
      deliveryHours: [
        {
          dayOfWeek: 'TUESDAY',
          isClosed: false,
          openTime: '12:00',
          closeTime: '22:00',
        },
      ],
    };

    expect(() =>
      assertDeliveryOrderWithinHours.call(
        service,
        settings,
        OrderTypeEnum.DELIVERY,
        '2026-06-09T13:30:00.000Z',
      ),
    ).not.toThrow();
    expect(() =>
      assertDeliveryOrderWithinHours.call(
        service,
        settings,
        OrderTypeEnum.DELIVERY,
        '2026-06-09T07:30:00.000Z',
      ),
    ).toThrow('Delivery is not available at requested order time');
  });

  it('uses date-specific holiday opening hours for scheduled pickup', () => {
    const assertDeliveryOrderWithinHours = (
      service as unknown as {
        assertDeliveryOrderWithinHours: (
          settings: {
            holidayOpeningHours: Array<{
              date: string;
              isClosed: boolean;
              openTime?: string | null;
              closeTime?: string | null;
            }>;
            openingHours: Array<{
              dayOfWeek: string;
              isClosed: boolean;
              openTime?: string | null;
              closeTime?: string | null;
            }>;
            deliveryHours: Array<never>;
          },
          orderType: OrderTypeEnum,
          orderTime: string,
        ) => void;
      }
    ).assertDeliveryOrderWithinHours;
    const settings = {
      holidayOpeningHours: [
        {
          date: '2026-06-09',
          isClosed: false,
          openTime: '20:00',
          closeTime: '22:00',
        },
      ],
      openingHours: [
        {
          dayOfWeek: 'TUESDAY',
          isClosed: false,
          openTime: '09:00',
          closeTime: '18:00',
        },
      ],
      deliveryHours: [],
    };

    expect(() =>
      assertDeliveryOrderWithinHours.call(
        service,
        settings,
        OrderTypeEnum.TAKEAWAY,
        '2026-06-09T15:30:00.000Z',
      ),
    ).not.toThrow();
    expect(() =>
      assertDeliveryOrderWithinHours.call(
        service,
        settings,
        OrderTypeEnum.TAKEAWAY,
        '2026-06-09T07:30:00.000Z',
      ),
    ).toThrow('Pickup is not available at requested order time');
  });

  it('blocks scheduled orders on date-specific closed days', () => {
    const assertDeliveryOrderWithinHours = (
      service as unknown as {
        assertDeliveryOrderWithinHours: (
          settings: {
            holidayOpeningHours: Array<{
              date: string;
              isClosed: boolean;
              openTime?: string | null;
              closeTime?: string | null;
            }>;
            openingHours: Array<{
              dayOfWeek: string;
              isClosed: boolean;
              openTime?: string | null;
              closeTime?: string | null;
            }>;
            deliveryHours: Array<never>;
          },
          orderType: OrderTypeEnum,
          orderTime: string,
        ) => void;
      }
    ).assertDeliveryOrderWithinHours;

    expect(() =>
      assertDeliveryOrderWithinHours.call(
        service,
        {
          holidayOpeningHours: [
            {
              date: '2026-06-09',
              isClosed: true,
              openTime: null,
              closeTime: null,
            },
          ],
          openingHours: [
            {
              dayOfWeek: 'TUESDAY',
              isClosed: false,
              openTime: '09:00',
              closeTime: '22:00',
            },
          ],
          deliveryHours: [],
        },
        OrderTypeEnum.DELIVERY,
        '2026-06-09T13:30:00.000Z',
      ),
    ).toThrow('Delivery is not available at requested order time');
  });

  it('does not apply delivery hours to pickup orders', () => {
    const assertDeliveryOrderWithinHours = (
      service as unknown as {
        assertDeliveryOrderWithinHours: (
          settings: { deliveryHours: Array<{ dayOfWeek: string }> },
          orderType: OrderTypeEnum,
          orderTime: string,
        ) => void;
      }
    ).assertDeliveryOrderWithinHours;

    expect(() =>
      assertDeliveryOrderWithinHours.call(
        service,
        { deliveryHours: [{ dayOfWeek: 'TUESDAY' }] },
        OrderTypeEnum.TAKEAWAY,
        '2026-06-09T04:30:00.000Z',
      ),
    ).not.toThrow();
  });

  it('detects whether a point is inside a delivery zone polygon', () => {
    const zoneFn = (
      service as unknown as {
        isPointInPolygon: (
          lat: number,
          lng: number,
          polygon: Array<{ lat: number; lng: number }>,
        ) => boolean;
      }
    ).isPointInPolygon;

    expect(
      zoneFn.call(service, 31.52, 74.35, [
        { lat: 31.5, lng: 74.3 },
        { lat: 31.6, lng: 74.3 },
        { lat: 31.6, lng: 74.4 },
        { lat: 31.5, lng: 74.4 },
      ]),
    ).toBe(true);

    expect(
      zoneFn.call(service, 31.7, 74.5, [
        { lat: 31.5, lng: 74.3 },
        { lat: 31.6, lng: 74.3 },
        { lat: 31.6, lng: 74.4 },
        { lat: 31.5, lng: 74.4 },
      ]),
    ).toBe(false);
  });
});

describe('OrdersService - delivery pricing modes', () => {
  const createZonePricingService = (input: {
    basePrice: number;
    branchMinOrderAmount?: number;
    zone?: {
      deliveryFee: number;
      minOrderAmount?: number;
      freeDeliveryThreshold?: number;
    };
  }) =>
    new OrdersService(
      {
        branch: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'branch-1',
            tenantId: 'tenant-1',
            restaurantId: 'restaurant-1',
            settings: {
              allowedOrderTypes: ['DELIVERY', 'TAKEAWAY'],
              allowedPaymentMethods: ['COD'],
              deliveryConfig: {
                mode: 'ZONE',
                radiusKm: 5,
                minOrderAmount: input.branchMinOrderAmount ?? 0,
                deliveryFee: 100,
                isFreeDelivery: false,
                freeDeliveryThreshold: 0,
                zones: [
                  {
                    name: 'Central',
                    deliveryFee: input.zone?.deliveryFee ?? 250,
                    minOrderAmount: input.zone?.minOrderAmount,
                    freeDeliveryThreshold: input.zone?.freeDeliveryThreshold,
                    polygon: [
                      { lat: 31.5, lng: 74.3 },
                      { lat: 31.6, lng: 74.3 },
                      { lat: 31.6, lng: 74.4 },
                      { lat: 31.5, lng: 74.4 },
                    ],
                  },
                ],
                postalCodeRules: [],
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
            basePrice: new Prisma.Decimal(input.basePrice),
            depositAmount: new Prisma.Decimal(0),
            category: { id: 'cat-1', variations: [], modifierLinks: [] },
            modifierLinks: [],
            branchOverrides: [],
          }),
        },
        address: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce({
              id: 'address-1',
              lat: new Prisma.Decimal('31.5204'),
              lng: new Prisma.Decimal('74.3587'),
              postalCode: null,
            })
            .mockResolvedValueOnce({
              lat: new Prisma.Decimal('31.5000'),
              lng: new Prisma.Decimal('74.3500'),
            }),
        },
        user: { findFirst: jest.fn() },
      } as never,
      {} as never,
      {
        validateForCheckout: jest.fn(),
        findBestAutoApplyPromotion: jest.fn().mockResolvedValue(null),
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
          totalAmount: new Prisma.Decimal(input.basePrice),
        }),
      } as never,
    );

  const zoneQuoteInput = {
    branchId: 'branch-1',
    orderType: OrderTypeEnum.DELIVERY,
    deliveryAddressId: 'address-1',
    items: [{ menuItemId: 'menu-1', quantity: 1 }],
    orderTime: '2026-03-24T19:30:00.000Z',
  };

  const customerUser = {
    uid: 'customer-1',
    tid: 'tenant-1',
    rid: 'restaurant-1',
    role: UserRoleEnum.CUSTOMER,
  };

  it('uses zone-based delivery fee when address falls inside a configured zone', async () => {
    const service = new OrdersService(
      {
        branch: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'branch-1',
            tenantId: 'tenant-1',
            restaurantId: 'restaurant-1',
            settings: {
              allowedOrderTypes: ['DELIVERY'],
              allowedPaymentMethods: ['COD'],
              deliveryConfig: {
                mode: 'ZONE',
                radiusKm: 5,
                minOrderAmount: 0,
                deliveryFee: 100,
                isFreeDelivery: false,
                freeDeliveryThreshold: 0,
                zones: [
                  {
                    name: 'Central',
                    deliveryFee: 250,
                    polygon: [
                      { lat: 31.5, lng: 74.3 },
                      { lat: 31.6, lng: 74.3 },
                      { lat: 31.6, lng: 74.4 },
                      { lat: 31.5, lng: 74.4 },
                    ],
                  },
                ],
                postalCodeRules: [],
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
            basePrice: new Prisma.Decimal(500),
            depositAmount: new Prisma.Decimal(0),
            category: { id: 'cat-1', variations: [], modifierLinks: [] },
            modifierLinks: [],
            branchOverrides: [],
          }),
        },
        address: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce({
              id: 'address-1',
              lat: new Prisma.Decimal('31.5204'),
              lng: new Prisma.Decimal('74.3587'),
              postalCode: null,
            })
            .mockResolvedValueOnce({
              lat: new Prisma.Decimal('31.5000'),
              lng: new Prisma.Decimal('74.3500'),
            }),
        },
        user: { findFirst: jest.fn() },
      } as never,
      {} as never,
      {
        validateForCheckout: jest.fn(),
        findBestAutoApplyPromotion: jest.fn().mockResolvedValue(null),
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
          totalAmount: new Prisma.Decimal(750),
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
        items: [{ menuItemId: 'menu-1', quantity: 1 }],
        orderTime: '2026-03-24T19:30:00.000Z',
      },
    );

    expect(result.data.deliveryFee).toBe(250);
  });

  it('uses zone-level free delivery threshold when subtotal qualifies', async () => {
    const service = createZonePricingService({
      basePrice: 2000,
      zone: { deliveryFee: 250, freeDeliveryThreshold: 1500 },
    });

    const result = await service.quote(customerUser, zoneQuoteInput);

    expect(result.data.deliveryFee).toBe(0);
  });

  it('allows delivery quotes below the zone minimum order amount', async () => {
    const service = createZonePricingService({
      basePrice: 600,
      branchMinOrderAmount: 0,
      zone: { deliveryFee: 250, minOrderAmount: 1000 },
    });

    const result = await service.quote(customerUser, zoneQuoteInput);

    expect(result.data.subtotal).toBe(600);
    expect(result.data.deliveryFee).toBe(250);
  });

  it('rejects delivery checkout below the zone minimum order amount', async () => {
    const service = createZonePricingService({
      basePrice: 600,
      branchMinOrderAmount: 0,
      zone: { deliveryFee: 250, minOrderAmount: 1000 },
    });

    await expect(
      service.create(customerUser, {
        ...zoneQuoteInput,
        paymentMethod: PaymentMethodEnum.COD,
      }),
    ).rejects.toThrow('Subtotal is below zone minimum order amount');
  });

  it('does not apply minimum order amount to pickup orders', async () => {
    const service = createZonePricingService({
      basePrice: 600,
      branchMinOrderAmount: 1000,
      zone: { deliveryFee: 250, minOrderAmount: 1200 },
    });

    const result = await service.quote(customerUser, {
      ...zoneQuoteInput,
      orderType: OrderTypeEnum.TAKEAWAY,
      deliveryAddressId: undefined,
    });

    expect(result.data.subtotal).toBe(600);
    expect(result.data.deliveryFee).toBe(0);
  });

  it('uses zone-band delivery fee when address falls inside a configured distance band', async () => {
    const service = new OrdersService(
      {
        branch: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'branch-1',
            tenantId: 'tenant-1',
            restaurantId: 'restaurant-1',
            settings: {
              allowedOrderTypes: ['DELIVERY'],
              allowedPaymentMethods: ['COD'],
              deliveryConfig: {
                mode: 'ZONE_BANDS',
                radiusKm: 5,
                minOrderAmount: 0,
                deliveryFee: 100,
                isFreeDelivery: false,
                freeDeliveryThreshold: 0,
                zones: [],
                zoneBands: [
                  { fromKm: 0, toKm: 2, deliveryFee: 120 },
                  { fromKm: 2, toKm: 5, deliveryFee: 220 },
                ],
                postalCodeRules: [],
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
            basePrice: new Prisma.Decimal(500),
            depositAmount: new Prisma.Decimal(0),
            category: { id: 'cat-1', variations: [], modifierLinks: [] },
            modifierLinks: [],
            branchOverrides: [],
          }),
        },
        address: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce({
              id: 'address-1',
              lat: new Prisma.Decimal('31.5204'),
              lng: new Prisma.Decimal('74.3587'),
              postalCode: null,
            })
            .mockResolvedValueOnce({
              lat: new Prisma.Decimal('31.5000'),
              lng: new Prisma.Decimal('74.3500'),
            }),
        },
        user: { findFirst: jest.fn() },
      } as never,
      {} as never,
      {
        validateForCheckout: jest.fn(),
        findBestAutoApplyPromotion: jest.fn().mockResolvedValue(null),
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
          totalAmount: new Prisma.Decimal(720),
        }),
      } as never,
    );

    const result = await service.quote(customerUser, zoneQuoteInput);

    expect(result.data.deliveryFee).toBe(220);
  });

  it('uses zone-band free delivery threshold when subtotal qualifies', async () => {
    const service = new OrdersService(
      {
        branch: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'branch-1',
            tenantId: 'tenant-1',
            restaurantId: 'restaurant-1',
            settings: {
              allowedOrderTypes: ['DELIVERY'],
              allowedPaymentMethods: ['COD'],
              deliveryConfig: {
                mode: 'ZONE_BANDS',
                radiusKm: 5,
                minOrderAmount: 0,
                deliveryFee: 100,
                isFreeDelivery: false,
                freeDeliveryThreshold: 0,
                zones: [],
                zoneBands: [
                  {
                    fromKm: 0,
                    toKm: 5,
                    deliveryFee: 220,
                    freeDeliveryThreshold: 1500,
                  },
                ],
                postalCodeRules: [],
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
            basePrice: new Prisma.Decimal(2000),
            depositAmount: new Prisma.Decimal(0),
            category: { id: 'cat-1', variations: [], modifierLinks: [] },
            modifierLinks: [],
            branchOverrides: [],
          }),
        },
        address: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce({
              id: 'address-1',
              lat: new Prisma.Decimal('31.5204'),
              lng: new Prisma.Decimal('74.3587'),
              postalCode: null,
            })
            .mockResolvedValueOnce({
              lat: new Prisma.Decimal('31.5000'),
              lng: new Prisma.Decimal('74.3500'),
            }),
        },
        user: { findFirst: jest.fn() },
      } as never,
      {} as never,
      {
        validateForCheckout: jest.fn(),
        findBestAutoApplyPromotion: jest.fn().mockResolvedValue(null),
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
          totalAmount: new Prisma.Decimal(2000),
        }),
      } as never,
    );

    const result = await service.quote(customerUser, zoneQuoteInput);

    expect(result.data.deliveryFee).toBe(0);
  });

  it('rejects delivery address outside configured zone bands', async () => {
    const service = new OrdersService(
      {
        branch: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'branch-1',
            tenantId: 'tenant-1',
            restaurantId: 'restaurant-1',
            settings: {
              allowedOrderTypes: ['DELIVERY'],
              allowedPaymentMethods: ['COD'],
              deliveryConfig: {
                mode: 'ZONE_BANDS',
                radiusKm: 5,
                minOrderAmount: 0,
                deliveryFee: 100,
                isFreeDelivery: false,
                freeDeliveryThreshold: 0,
                zones: [],
                zoneBands: [{ fromKm: 0, toKm: 1, deliveryFee: 120 }],
                postalCodeRules: [],
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
            basePrice: new Prisma.Decimal(500),
            depositAmount: new Prisma.Decimal(0),
            category: { id: 'cat-1', variations: [], modifierLinks: [] },
            modifierLinks: [],
            branchOverrides: [],
          }),
        },
        address: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce({
              id: 'address-1',
              lat: new Prisma.Decimal('31.5204'),
              lng: new Prisma.Decimal('74.3587'),
              postalCode: null,
            })
            .mockResolvedValueOnce({
              lat: new Prisma.Decimal('31.5000'),
              lng: new Prisma.Decimal('74.3500'),
            }),
        },
        user: { findFirst: jest.fn() },
      } as never,
      {} as never,
      {
        validateForCheckout: jest.fn(),
        findBestAutoApplyPromotion: jest.fn().mockResolvedValue(null),
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
          totalAmount: new Prisma.Decimal(620),
        }),
      } as never,
    );

    await expect(service.quote(customerUser, zoneQuoteInput)).rejects.toThrow(
      'Delivery address is outside branch delivery zone bands',
    );
  });

  it('uses postal-code delivery fee when branch pricing mode is postal code', async () => {
    const service = new OrdersService(
      {
        branch: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'branch-1',
            tenantId: 'tenant-1',
            restaurantId: 'restaurant-1',
            settings: {
              allowedOrderTypes: ['DELIVERY'],
              allowedPaymentMethods: ['COD'],
              deliveryConfig: {
                mode: 'POSTAL_CODE',
                radiusKm: 5,
                minOrderAmount: 0,
                deliveryFee: 100,
                isFreeDelivery: false,
                freeDeliveryThreshold: 0,
                zones: [],
                postalCodeRules: [{ postalCode: '54000', deliveryFee: 300 }],
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
            basePrice: new Prisma.Decimal(500),
            depositAmount: new Prisma.Decimal(0),
            category: { id: 'cat-1', variations: [], modifierLinks: [] },
            modifierLinks: [],
            branchOverrides: [],
          }),
        },
        address: {
          findFirst: jest.fn().mockResolvedValueOnce({
            id: 'address-1',
            lat: new Prisma.Decimal('31.5204'),
            lng: new Prisma.Decimal('74.3587'),
            postalCode: '54000',
          }),
        },
        user: { findFirst: jest.fn() },
      } as never,
      {} as never,
      {
        validateForCheckout: jest.fn(),
        findBestAutoApplyPromotion: jest.fn().mockResolvedValue(null),
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
          totalAmount: new Prisma.Decimal(800),
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
        items: [{ menuItemId: 'menu-1', quantity: 1 }],
        orderTime: '2026-03-24T19:30:00.000Z',
      },
    );

    expect(result.data.deliveryFee).toBe(300);
  });

  it('applies postal-code minimum order and free delivery thresholds', async () => {
    const service = new OrdersService(
      {
        branch: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'branch-1',
            tenantId: 'tenant-1',
            restaurantId: 'restaurant-1',
            settings: {
              allowedOrderTypes: ['DELIVERY'],
              allowedPaymentMethods: ['COD'],
              deliveryConfig: {
                mode: 'POSTAL_CODE',
                radiusKm: 5,
                minOrderAmount: 0,
                deliveryFee: 100,
                isFreeDelivery: false,
                freeDeliveryThreshold: 0,
                zones: [],
                postalCodeRules: [
                  {
                    postalCode: '54000',
                    deliveryFee: 300,
                    minOrderAmount: 400,
                    freeDeliveryThreshold: 500,
                  },
                ],
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
            basePrice: new Prisma.Decimal(500),
            depositAmount: new Prisma.Decimal(0),
            category: { id: 'cat-1', variations: [], modifierLinks: [] },
            modifierLinks: [],
            branchOverrides: [],
          }),
        },
        address: {
          findFirst: jest.fn().mockResolvedValueOnce({
            id: 'address-1',
            lat: new Prisma.Decimal('31.5204'),
            lng: new Prisma.Decimal('74.3587'),
            postalCode: '54000',
          }),
        },
        user: { findFirst: jest.fn() },
      } as never,
      {} as never,
      {
        validateForCheckout: jest.fn(),
        findBestAutoApplyPromotion: jest.fn().mockResolvedValue(null),
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
          totalAmount: new Prisma.Decimal(500),
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
        items: [{ menuItemId: 'menu-1', quantity: 1 }],
        orderTime: '2026-03-24T19:30:00.000Z',
      },
    );

    expect(result.data.deliveryFee).toBe(0);
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

describe('OrdersService - table reservation capacity', () => {
  type TestOrderTx = { order: { count: jest.Mock } };

  let service: OrdersService;
  let tx: TestOrderTx;

  beforeEach(() => {
    service = new OrdersService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    tx = { order: { count: jest.fn() } };
  });

  const assertCapacity = (
    orderType: OrderTypeEnum,
    orderTime: string | null,
    tableCount: number,
  ) =>
    (
      service as unknown as {
        assertDineInTableCapacity: (
          tx: TestOrderTx,
          orderType: OrderTypeEnum,
          branchId: string,
          orderTime: string | null,
          settings: {
            tableReservationsEnabled: boolean;
            tableCount: number;
          },
        ) => Promise<void>;
      }
    ).assertDineInTableCapacity(tx, orderType, 'branch-1', orderTime, {
      tableReservationsEnabled: true,
      tableCount,
    });

  it('rejects dine-in reservation when branch table count is full', async () => {
    tx.order.count.mockResolvedValue(1);

    await expect(
      assertCapacity(OrderTypeEnum.DINE_IN, '2026-06-16T15:00:00.000Z', 1),
    ).rejects.toThrow('No tables are available for the selected time slot');
  });

  it('allows dine-in reservation when capacity remains', async () => {
    tx.order.count.mockResolvedValue(1);

    await expect(
      assertCapacity(OrderTypeEnum.DINE_IN, '2026-06-16T15:00:00.000Z', 2),
    ).resolves.toBeUndefined();
  });

  it('requires an order time for table reservations', async () => {
    await expect(
      assertCapacity(OrderTypeEnum.DINE_IN, null, 1),
    ).rejects.toThrow('orderTime is required for table reservations');
    expect(tx.order.count).not.toHaveBeenCalled();
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
      undefined,
    );
    expect(result.message).toBe('Order status updated successfully');
  });

  it('requires branch-set order time when accepting a placed order', async () => {
    ordersRepository.findById.mockResolvedValue({
      id: 'order-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      deliverymanId: null,
      orderType: 'DELIVERY',
      status: 'PLACED',
    });

    await expect(
      service.updateStatus(
        {
          uid: 'branch-admin-1',
          role: UserRoleEnum.BRANCH_ADMIN,
          rid: 'restaurant-1',
          bid: 'branch-1',
        } as never,
        'order-1',
        { status: 'CONFIRMED' } as never,
      ),
    ).rejects.toThrow('orderTime is required when accepting an order');
    expect(ordersRepository.updateStatus).not.toHaveBeenCalled();
  });

  it('sets order time when branch admin accepts a placed order', async () => {
    const orderTime = '2026-03-24T19:30:00.000Z';
    ordersRepository.findById.mockResolvedValue({
      id: 'order-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      deliverymanId: null,
      orderType: 'DELIVERY',
      status: 'PLACED',
    });
    ordersRepository.updateStatus.mockResolvedValue({
      id: 'order-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      deliverymanId: null,
      orderType: 'DELIVERY',
      status: 'CONFIRMED',
      orderTime: new Date(orderTime),
    });

    Object.assign(service as object, {
      toOrderMutationResponse: jest.fn().mockReturnValue({ id: 'order-1' }),
    });

    const result = await service.updateStatus(
      {
        uid: 'branch-admin-1',
        role: UserRoleEnum.BRANCH_ADMIN,
        rid: 'restaurant-1',
        bid: 'branch-1',
      } as never,
      'order-1',
      { status: 'CONFIRMED', orderTime } as never,
    );

    expect(ordersRepository.updateStatus).toHaveBeenCalledWith(
      'order-1',
      'CONFIRMED',
      new Date(orderTime),
    );
    expect(result.message).toBe('Order status updated successfully');
  });

  it('allows branch admin to send confirmed delivery with external driver', async () => {
    ordersRepository.findById.mockResolvedValue({
      id: 'order-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      deliverymanId: null,
      orderType: 'DELIVERY',
      status: 'CONFIRMED',
    });
    ordersRepository.updateStatus.mockResolvedValue({
      id: 'order-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      deliverymanId: null,
      orderType: 'DELIVERY',
      status: 'OUT_FOR_DELIVERY',
    });

    Object.assign(service as object, {
      toOrderMutationResponse: jest.fn().mockReturnValue({
        id: 'order-1',
        status: 'OUT_FOR_DELIVERY',
        deliverymanId: null,
      }),
    });

    const result = await service.updateStatus(
      {
        uid: 'branch-admin-1',
        role: UserRoleEnum.BRANCH_ADMIN,
        rid: 'restaurant-1',
        bid: 'branch-1',
      } as never,
      'order-1',
      {
        status: 'OUT_FOR_DELIVERY',
        deliveryFulfillmentMode: 'EXTERNAL',
      } as never,
    );

    expect(ordersRepository.updateStatus).toHaveBeenCalledWith(
      'order-1',
      'OUT_FOR_DELIVERY',
      undefined,
    );
    expect(chatService.ensureDeliveryThreadForOrder).not.toHaveBeenCalled();
    expect(result.data).toEqual({
      id: 'order-1',
      status: 'OUT_FOR_DELIVERY',
      deliverymanId: null,
    });
  });

  it('keeps confirmed to out-for-delivery invalid without external driver mode', async () => {
    ordersRepository.findById.mockResolvedValue({
      id: 'order-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      deliverymanId: null,
      orderType: 'DELIVERY',
      status: 'CONFIRMED',
    });

    await expect(
      service.updateStatus(
        {
          uid: 'branch-admin-1',
          role: UserRoleEnum.BRANCH_ADMIN,
          rid: 'restaurant-1',
          bid: 'branch-1',
        } as never,
        'order-1',
        { status: 'OUT_FOR_DELIVERY' } as never,
      ),
    ).rejects.toThrow('Invalid order status transition');
    expect(ordersRepository.updateStatus).not.toHaveBeenCalled();
  });

  it('blocks external driver mode for pickup orders', async () => {
    ordersRepository.findById.mockResolvedValue({
      id: 'order-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      deliverymanId: null,
      orderType: 'TAKEAWAY',
      status: 'CONFIRMED',
    });

    await expect(
      service.updateStatus(
        {
          uid: 'branch-admin-1',
          role: UserRoleEnum.BRANCH_ADMIN,
          rid: 'restaurant-1',
          bid: 'branch-1',
        } as never,
        'order-1',
        {
          status: 'OUT_FOR_DELIVERY',
          deliveryFulfillmentMode: 'EXTERNAL',
        } as never,
      ),
    ).rejects.toThrow('Invalid order status transition');
    expect(ordersRepository.updateStatus).not.toHaveBeenCalled();
  });

  it('blocks branch admin accepting another branch order', async () => {
    ordersRepository.findById.mockResolvedValue({
      id: 'order-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-2',
      customerId: 'customer-1',
      deliverymanId: null,
      orderType: 'DELIVERY',
      status: 'PLACED',
    });

    await expect(
      service.updateStatus(
        {
          uid: 'branch-admin-1',
          role: UserRoleEnum.BRANCH_ADMIN,
          rid: 'restaurant-1',
          bid: 'branch-1',
        } as never,
        'order-1',
        {
          status: 'CONFIRMED',
          orderTime: '2026-03-24T19:30:00.000Z',
        } as never,
      ),
    ).rejects.toThrow('You cannot access resources outside your branch');
    expect(ordersRepository.updateStatus).not.toHaveBeenCalled();
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

describe('OrdersService - order reviews', () => {
  const makeService = () => {
    const ordersRepository = {
      findReviewContextById: jest.fn(),
      createReview: jest.fn(),
    };
    const service = new OrdersService(
      {} as never,
      ordersRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    return { service, ordersRepository };
  };

  it('allows customer to review a delivered order once', async () => {
    const { service, ordersRepository } = makeService();
    ordersRepository.findReviewContextById.mockResolvedValue({
      id: 'order-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      orderType: OrderType.DELIVERY,
      status: OrderStatus.DELIVERED,
      review: null,
    });
    ordersRepository.createReview.mockResolvedValue({
      id: 'review-1',
      orderId: 'order-1',
      rating: 5,
      comment: 'Great food',
      createdAt: new Date('2026-06-02T05:50:00.000Z'),
      updatedAt: new Date('2026-06-02T05:50:00.000Z'),
    });

    const result = await service.submitReview(
      {
        uid: 'customer-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      'order-1',
      { rating: 5, comment: '  Great food  ' },
    );

    expect(ordersRepository.createReview).toHaveBeenCalledWith(
      expect.objectContaining({
        order: { connect: { id: 'order-1' } },
        customer: { connect: { id: 'customer-1' } },
        rating: 5,
        comment: 'Great food',
      }),
    );
    expect(result.message).toBe('Order review submitted successfully');
  });

  it('rejects reviews before order completion', async () => {
    const { service, ordersRepository } = makeService();
    ordersRepository.findReviewContextById.mockResolvedValue({
      id: 'order-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      orderType: OrderType.DELIVERY,
      status: OrderStatus.OUT_FOR_DELIVERY,
      review: null,
    });

    await expect(
      service.submitReview(
        {
          uid: 'customer-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          role: UserRoleEnum.CUSTOMER,
        },
        'order-1',
        { rating: 4 },
      ),
    ).rejects.toThrow('Only completed orders can be reviewed');
    expect(ordersRepository.createReview).not.toHaveBeenCalled();
  });

  it('rejects duplicate order reviews', async () => {
    const { service, ordersRepository } = makeService();
    ordersRepository.findReviewContextById.mockResolvedValue({
      id: 'order-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      orderType: OrderType.TAKEAWAY,
      status: OrderStatus.PICKED_UP,
      review: { id: 'review-1' },
    });

    await expect(
      service.submitReview(
        {
          uid: 'customer-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          role: UserRoleEnum.CUSTOMER,
        },
        'order-1',
        { rating: 4 },
      ),
    ).rejects.toThrow('Order has already been reviewed');
    expect(ordersRepository.createReview).not.toHaveBeenCalled();
  });
});

describe('OrdersService - coupon quote validation', () => {
  it('adds service charge but not inclusive tax to quote totals', async () => {
    const calculateQuoteBenefits = jest.fn(
      (input: { totalBeforeBenefits: Prisma.Decimal }) => ({
        walletAppliedAmount: new Prisma.Decimal(0),
        loyaltyDiscountAmount: new Prisma.Decimal(0),
        loyaltyPointsRedeemed: 0,
        totalAmount: input.totalBeforeBenefits,
      }),
    );
    const prisma = {
      branch: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'branch-1',
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          settings: {
            allowedOrderTypes: ['TAKEAWAY'],
            allowedPaymentMethods: ['COD'],
            deliveryConfig: {
              radiusKm: 5,
              minOrderAmount: 0,
              deliveryFee: 0,
              isFreeDelivery: false,
              freeDeliveryThreshold: 0,
            },
            taxation: {
              taxPercentage: 10,
            },
            serviceCharge: {
              isEnabled: false,
              type: 'PERCENTAGE',
              value: 0,
            },
          },
        }),
      },
      menuItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'menu-1',
          name: 'Burger',
          restaurantId: 'restaurant-1',
          basePrice: new Prisma.Decimal(1000),
          depositAmount: new Prisma.Decimal(0),
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
    const service = new OrdersService(
      prisma as never,
      {} as never,
      {
        findBestAutoApplyPromotion: jest.fn().mockResolvedValue(null),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { calculateQuoteBenefits } as never,
      {
        getServiceChargeConfig: jest.fn().mockResolvedValue({
          isEnabled: true,
          type: 'PERCENTAGE',
          value: 10,
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
        orderType: OrderTypeEnum.TAKEAWAY,
        items: [
          {
            menuItemId: 'menu-1',
            quantity: 1,
          },
        ],
      },
    );

    expect(calculateQuoteBenefits).toHaveBeenCalledWith(
      expect.objectContaining({
        subtotal: new Prisma.Decimal(1000),
        totalBeforeBenefits: new Prisma.Decimal(1100),
      }),
    );
    expect(result.data.subtotal).toBe(1000);
    expect(result.data.taxAmount).toBe(100);
    expect(result.data.serviceChargeAmount).toBe(100);
    expect(result.data.totalAmount).toBe(1100);
    expect(result.data.payableAmount).toBe(1100);
  });

  it('skips delivery address and branch availability checks when validating coupon application', async () => {
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
            temporaryClosure: {
              isClosed: true,
              reason: 'Busy kitchen',
              message: 'Branch temporarily closed',
              closedUntil: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
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

  it('accepts grouped modifier selections in quotes', async () => {
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
          isRequired: true,
          minSelect: 1,
          maxSelect: 2,
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
          eligibleSubtotal: new Prisma.Decimal(150),
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
          totalAmount: new Prisma.Decimal(150),
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
            modifierSelections: [
              {
                modifierGroupId: 'group-cheese',
                modifiers: [{ modifierId: 'modifier-cheese', quantity: 2 }],
              },
            ],
          },
        ],
        orderTime: '2026-03-24T19:30:00.000Z',
      },
    );

    expect(result.data.items[0].snapshotModifiers).toEqual([
      {
        modifierId: 'modifier-cheese',
        name: 'Extra Cheese',
        quantity: 2,
        unitPrice: 25,
      },
    ]);
    expect(result.data.items[0].unitPrice).toBe(150);
    expect(result.data.subtotal).toBe(150);
  });

  it('rejects free order item modifier selections above one', async () => {
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

  it('quotes ready-made deal items without requiring modifiers', async () => {
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
          isRequired: true,
          minSelect: 1,
          maxSelect: 2,
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
    const couponsService = {
      validateForCheckout: jest.fn(),
      findBestAutoApplyPromotion: jest.fn().mockResolvedValue(null),
      isActiveFixedPriceDealItem: jest.fn().mockResolvedValue(true),
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
          totalAmount: new Prisma.Decimal(100),
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
            dealId: 'deal-1',
            quantity: 1,
          },
        ],
        orderTime: '2026-03-24T19:30:00.000Z',
      },
    );

    expect(couponsService.isActiveFixedPriceDealItem).toHaveBeenCalledWith(
      'restaurant-1',
      'branch-1',
      'deal-1',
      'menu-1',
    );
    expect(result.data.items[0]).toEqual(
      expect.objectContaining({
        menuItemId: 'menu-1',
        dealId: 'deal-1',
        snapshotModifiers: [],
      }),
    );
  });

  it('quotes ready-made deal items without requiring attached modifiers', async () => {
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
          name: 'Burger Deal',
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
          modifierLinks: [],
          modifierPriceOverrides: [
            {
              modifierId: 'modifier-cola',
              priceDelta: new Prisma.Decimal(25),
              isRequired: true,
              modifier: {
                id: 'modifier-cola',
                name: 'Cola',
                priceDelta: new Prisma.Decimal(0),
              },
            },
          ],
          branchOverrides: [],
        }),
      },
      address: { findFirst: jest.fn() },
      user: { findFirst: jest.fn() },
    };
    const couponsService = {
      validateForCheckout: jest.fn(),
      findBestAutoApplyPromotion: jest.fn().mockResolvedValue(null),
      isActiveFixedPriceDealItem: jest.fn().mockResolvedValue(true),
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
            dealId: 'deal-1',
            quantity: 1,
          },
        ],
        orderTime: '2026-03-24T19:30:00.000Z',
      },
    );

    expect(result.data.items[0]).toEqual(
      expect.objectContaining({
        dealId: 'deal-1',
        unitPrice: 100,
        snapshotModifiers: [],
      }),
    );

    const customizedResult = await service.quoteForCouponValidation(
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
            dealId: 'deal-1',
            quantity: 1,
            modifiers: [{ modifierId: 'modifier-cola', quantity: 1 }],
          },
        ],
        orderTime: '2026-03-24T19:30:00.000Z',
      },
    );

    expect(customizedResult.data.items[0]).toEqual(
      expect.objectContaining({
        dealId: 'deal-1',
        unitPrice: 125,
        lineTotal: 125,
        snapshotModifiers: [
          expect.objectContaining({
            modifierId: 'modifier-cola',
            quantity: 1,
            unitPrice: 25,
          }),
        ],
      }),
    );
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
        resolveDeliveryFeeForAddress: (
          customerId: string,
          deliveryAddressId: string,
          branchId: string,
          deliveryConfig: {
            mode: 'RADIUS';
            radiusKm: number;
            deliveryFee: number;
            minOrderAmount: number;
            isFreeDelivery: boolean;
            freeDeliveryThreshold: number;
            zones: [];
            postalCodeRules: [];
          },
          subtotal: Prisma.Decimal,
        ) => Promise<Prisma.Decimal>;
      }
    ).resolveDeliveryFeeForAddress;

    await expect(
      fn.call(
        service,
        'customer-1',
        'address-1',
        'branch-1',
        {
          mode: 'RADIUS',
          radiusKm: 10,
          deliveryFee: 120,
          minOrderAmount: 0,
          isFreeDelivery: false,
          freeDeliveryThreshold: 0,
          zones: [],
          postalCodeRules: [],
        },
        new Prisma.Decimal(500),
      ),
    ).resolves.toEqual(new Prisma.Decimal(120));

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
      deliveryAddress: {
        id: 'address-1',
        street: 'Main Street',
        area: 'House 12',
        postalCode: '54000',
        city: 'Lahore',
        state: 'Punjab',
        country: 'PK',
        lat: new Prisma.Decimal('31.5204'),
        lng: new Prisma.Decimal('74.3587'),
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
    expect(result.deliveryAddress).toEqual({
      id: 'address-1',
      street: 'Main Street',
      area: 'House 12',
      postalCode: '54000',
      city: 'Lahore',
      state: 'Punjab',
      country: 'PK',
      houseNumber: 'House 12',
      lat: 31.5204,
      lng: 74.3587,
    });
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
          depositAmount: new Prisma.Decimal(0),
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
        depositAmount: 0,
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
    expect(result.availablePaymentMethods).toEqual([
      'COD',
      'CARD_ON_DELIVERY',
      'PAYPAL',
      'WALLET',
    ]);
    expect(result.paymentOptions).toEqual({
      selected: 'COD',
      available: ['COD', 'CARD_ON_DELIVERY', 'PAYPAL', 'WALLET'],
    });
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
        ) => Promise<{ customerId: string; isGuest: boolean }>;
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

    expect(result).toEqual({ customerId: 'customer-1', isGuest: false });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('preserves guest flag from authenticated guest customer context', async () => {
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

    const result = await (
      service as unknown as {
        resolveQuoteCustomer: (
          user: {
            uid: string;
            role: UserRoleEnum;
            rid?: string;
            tid?: string;
            bid?: string;
            isGuest?: boolean;
          },
          currentBranch: typeof branch,
          requestedCustomerId?: string,
        ) => Promise<{ customerId: string; isGuest: boolean }>;
      }
    ).resolveQuoteCustomer(
      {
        uid: 'guest-1',
        role: UserRoleEnum.CUSTOMER,
        rid: 'restaurant-1',
        tid: 'tenant-1',
        isGuest: true,
      },
      branch,
    );

    expect(result).toEqual({ customerId: 'guest-1', isGuest: true });
  });

  it('requires guest contact when guest places an order', () => {
    const service = new OrdersService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    expect(() =>
      (
        service as unknown as {
          assertGuestContactForOrder: (
            customer: { customerId: string; isGuest: boolean },
            guestContact?: unknown,
          ) => void;
        }
      ).assertGuestContactForOrder({
        customerId: 'guest-1',
        isGuest: true,
      }),
    ).toThrow('guestContact is required for guest orders');
  });

  it('requires privacy policy acceptance when guest places an order', () => {
    const service = new OrdersService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    expect(() =>
      (
        service as unknown as {
          assertGuestContactForOrder: (
            customer: { customerId: string; isGuest: boolean },
            guestContact?: unknown,
          ) => void;
        }
      ).assertGuestContactForOrder(
        {
          customerId: 'guest-1',
          isGuest: true,
        },
        {
          email: 'guest@example.com',
          phone: '+923001234567',
          privacyPolicyAccepted: false,
        },
      ),
    ).toThrow('privacyPolicyAccepted is required for guest orders');
  });

  it('stores guest contact consent metadata with privacy policy link', () => {
    const service = new OrdersService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const metadata = (
      service as unknown as {
        toGuestContactMetadata: (
          existingMetadata: unknown,
          dto: {
            email: string;
            phone: string;
            privacyPolicyAccepted: boolean;
          },
          restaurantId: string,
        ) => Record<string, unknown>;
      }
    ).toGuestContactMetadata(
      {},
      {
        email: 'Guest@Example.com',
        phone: '+923001234567',
        privacyPolicyAccepted: true,
      },
      'restaurant-1',
    );

    expect(metadata.guestContact).toMatchObject({
      email: 'guest@example.com',
      phone: '+923001234567',
      privacyPolicyAccepted: true,
      privacyPolicyLink:
        '/api/v1/public-content/privacy-policy?restaurantId=restaurant-1',
    });
    expect(
      (metadata.guestContact as { privacyPolicyAcceptedAt?: unknown })
        .privacyPolicyAcceptedAt,
    ).toEqual(expect.any(String));
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
          ) => Promise<{ customerId: string; isGuest: boolean }>;
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
          ) => Promise<{ customerId: string; isGuest: boolean }>;
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
        findFirst: jest.fn().mockResolvedValue({
          id: 'customer-1',
          isGuest: false,
        }),
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
        ) => Promise<{ customerId: string; isGuest: boolean }>;
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

    expect(result).toEqual({ customerId: 'customer-1', isGuest: false });
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
        isGuest: true,
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
          ) => Promise<{ customerId: string; isGuest: boolean }>;
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
  it('allows checkout with a globally active payment method absent from branch settings', async () => {
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
        walletAppliedAmount: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal(500),
      }),
    };
    const prisma = {
      globalSetting: {
        findUnique: jest.fn().mockResolvedValue({
          paymentMethods: [
            {
              code: PaymentMethod.CARD_ON_DELIVERY,
              label: 'Card on delivery',
              isActive: true,
            },
          ],
        }),
      },
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
    const globalSettingsService = {
      getDefaultCurrencyCode: jest.fn().mockResolvedValue('PKR'),
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
      globalSettingsService as never,
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
            allowedPaymentMethods: ['COD'],
          },
        },
        customer: { customerId: 'customer-1' },
        lines: [
          {
            menuItemId: 'menu-1',
            categoryId: 'cat-1',
            menuItemName: 'Burger',
            quantity: 1,
            depositAmount: new Prisma.Decimal(0),
            unitPrice: new Prisma.Decimal(500),
            lineTotal: new Prisma.Decimal(500),
          },
        ],
        subtotal: new Prisma.Decimal(500),
        taxAmount: new Prisma.Decimal(0),
        deliveryFee: new Prisma.Decimal(0),
        discountAmount: new Prisma.Decimal(0),
        walletAppliedAmount: new Prisma.Decimal(0),
        loyaltyDiscountAmount: new Prisma.Decimal(0),
        loyaltyPointsRedeemed: 0,
        totalAmount: new Prisma.Decimal(500),
        couponId: undefined,
      });

    await service.create(
      {
        uid: 'customer-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      } as never,
      {
        branchId: 'branch-1',
        orderType: OrderTypeEnum.DELIVERY,
        paymentMethod: PaymentMethodEnum.CARD_ON_DELIVERY,
        items: [],
        orderTime: '2026-04-16T12:00:00.000Z',
      },
    );

    expect(prisma.globalSetting.findUnique).toHaveBeenCalledWith({
      where: { scopeKey: 'GLOBAL' },
      select: { paymentMethods: true },
    });
    expect(ordersRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethod: PaymentMethod.CARD_ON_DELIVERY,
      }),
      expect.anything(),
    );
  });

  it('keeps online card orders payment-pending until Stripe succeeds', async () => {
    const paymentTransactionCreate = jest.fn();
    const notifyOrderPlaced = jest.fn();
    const ordersRepository = {
      create: jest.fn().mockResolvedValue({
        id: 'order-stripe-1',
        tenantId: 'tenant-1',
        status: OrderStatus.PAYMENT_PENDING,
        subtotal: new Prisma.Decimal(500),
        taxAmount: new Prisma.Decimal(0),
        deliveryFee: new Prisma.Decimal(0),
        discountAmount: new Prisma.Decimal(0),
        loyaltyDiscountAmount: new Prisma.Decimal(0),
        walletAppliedAmount: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal(500),
      }),
    };
    const prisma = {
      globalSetting: {
        findUnique: jest.fn().mockResolvedValue({
          paymentMethods: [
            { code: PaymentMethod.STRIPE, label: 'Stripe', isActive: true },
          ],
        }),
      },
      restaurant: {
        findUnique: jest.fn().mockResolvedValue({
          settings: { currency: 'EUR' },
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
      { notifyOrderPlaced } as never,
      {} as never,
      {
        emitOrderCreated: jest.fn(),
        emitOrderStatusChanged: jest.fn(),
      } as never,
      undefined,
      loyaltyWalletService as never,
      { getDefaultCurrencyCode: jest.fn().mockResolvedValue('EUR') } as never,
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
          settings: { allowedPaymentMethods: ['STRIPE'] },
        },
        customer: { customerId: 'customer-1' },
        lines: [
          {
            menuItemId: 'menu-1',
            categoryId: 'cat-1',
            menuItemName: 'Burger',
            quantity: 1,
            depositAmount: new Prisma.Decimal(0),
            unitPrice: new Prisma.Decimal(500),
            lineTotal: new Prisma.Decimal(500),
          },
        ],
        subtotal: new Prisma.Decimal(500),
        taxAmount: new Prisma.Decimal(0),
        deliveryFee: new Prisma.Decimal(0),
        discountAmount: new Prisma.Decimal(0),
        walletAppliedAmount: new Prisma.Decimal(0),
        loyaltyDiscountAmount: new Prisma.Decimal(0),
        loyaltyPointsRedeemed: 0,
        totalAmount: new Prisma.Decimal(500),
        couponId: undefined,
      });

    await service.create(
      {
        uid: 'customer-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      } as never,
      {
        branchId: 'branch-1',
        orderType: OrderTypeEnum.DELIVERY,
        paymentMethod: PaymentMethodEnum.STRIPE,
        items: [],
      },
    );

    expect(ordersRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethod: PaymentMethod.STRIPE,
        status: OrderStatus.PAYMENT_PENDING,
        paymentStatus: PaymentStatus.PENDING,
      }),
      expect.anything(),
    );
    const paymentTransactionCalls = paymentTransactionCreate.mock
      .calls as Array<
      [{ data: { paymentMethod: PaymentMethod; status: PaymentStatus } }]
    >;
    const paymentTransactionCall = paymentTransactionCalls[0][0];
    expect(paymentTransactionCall.data.paymentMethod).toBe(
      PaymentMethod.STRIPE,
    );
    expect(paymentTransactionCall.data.status).toBe(PaymentStatus.PENDING);
    expect(notifyOrderPlaced).not.toHaveBeenCalled();
    expect(loyaltyWalletService.awardPointsForPaidOrder).not.toHaveBeenCalled();
  });

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
    const globalSettingsService = {
      getDefaultCurrencyCode: jest.fn().mockResolvedValue('PKR'),
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
      globalSettingsService as never,
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
        lines: [
          {
            menuItemId: 'menu-1',
            categoryId: 'cat-1',
            menuItemName: 'Glass Bottle Cola',
            quantity: 1,
            depositAmount: new Prisma.Decimal(50),
            unitPrice: new Prisma.Decimal(450),
            lineTotal: new Prisma.Decimal(500),
          },
        ],
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
        items: {
          create: [
            expect.objectContaining({
              depositAmount: new Prisma.Decimal(50),
              unitPrice: new Prisma.Decimal(450),
              lineTotal: new Prisma.Decimal(500),
            }),
          ],
        },
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
    expect(paymentTransactionArgs.data.currency).toBe('PKR');
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

  it('auto-applies scoped promotion without coupon code in quotes', async () => {
    const couponsService = {
      validateForCheckout: jest.fn(),
      findBestAutoApplyPromotion: jest.fn().mockResolvedValue({
        coupon: {
          id: 'promo-1',
          code: 'PROMO-1',
          title: 'Burger deal',
          applyMode: 'SCOPED_ITEMS',
          autoApply: true,
          discountType: 'FIXED_PRICE',
          discountValue: new Prisma.Decimal(400),
        },
        discountAmount: new Prisma.Decimal(100),
        eligibleSubtotal: new Prisma.Decimal(500),
      }),
    };
    const service = new OrdersService(
      {
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
            basePrice: new Prisma.Decimal(500),
            depositAmount: new Prisma.Decimal(0),
            category: { id: 'cat-1', variations: [], modifierLinks: [] },
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
        user: { findFirst: jest.fn() },
      } as never,
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
          totalAmount: new Prisma.Decimal(400),
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
        items: [{ menuItemId: 'menu-1', quantity: 1 }],
        orderTime: '2026-03-24T19:30:00.000Z',
      },
    );

    expect(couponsService.findBestAutoApplyPromotion).toHaveBeenCalled();
    expect(result.data.discountAmount).toBe(100);
    expect(result.data.appliedPromotion).toEqual({
      id: 'promo-1',
      title: 'Burger deal',
      applyMode: 'SCOPED_ITEMS',
      autoApply: true,
      discountType: 'FIXED_PRICE',
      discountValue: 400,
      discountAmount: 100,
    });
  });

  it('passes selected deal items into auto-apply order quote flow', async () => {
    const couponsService = {
      validateForCheckout: jest.fn(),
      findBestAutoApplyPromotion: jest.fn().mockResolvedValue({
        coupon: {
          id: 'deal-1',
          code: 'DEAL-1',
          title: 'Burger Combo',
          applyMode: 'SCOPED_ITEMS',
          autoApply: true,
          discountType: 'FIXED_PRICE',
          discountValue: new Prisma.Decimal(799),
        },
        discountAmount: new Prisma.Decimal(301),
        eligibleSubtotal: new Prisma.Decimal(1100),
      }),
    };
    const menuItems = new Map([
      [
        'burger-1',
        {
          id: 'burger-1',
          name: 'Burger',
          restaurantId: 'restaurant-1',
          basePrice: new Prisma.Decimal(600),
          depositAmount: new Prisma.Decimal(0),
          category: { id: 'cat-burger', variations: [], modifierLinks: [] },
          modifierLinks: [],
          branchOverrides: [],
        },
      ],
      [
        'drink-1',
        {
          id: 'drink-1',
          name: 'Drink',
          restaurantId: 'restaurant-1',
          basePrice: new Prisma.Decimal(500),
          depositAmount: new Prisma.Decimal(0),
          category: { id: 'cat-drink', variations: [], modifierLinks: [] },
          modifierLinks: [],
          branchOverrides: [],
        },
      ],
    ]);
    const service = new OrdersService(
      {
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
                deliveryFee: 0,
                isFreeDelivery: false,
                freeDeliveryThreshold: 0,
              },
              taxation: { taxPercentage: 0 },
            },
          }),
        },
        menuItem: {
          findFirst: jest.fn(({ where }: { where: { id: string } }) =>
            Promise.resolve(menuItems.get(where.id) ?? null),
          ),
        },
        address: {
          findFirst: jest.fn().mockResolvedValue({
            lat: new Prisma.Decimal('31.5204'),
            lng: new Prisma.Decimal('74.3587'),
          }),
        },
        user: { findFirst: jest.fn() },
      } as never,
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
          totalAmount: new Prisma.Decimal(799),
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
          { menuItemId: 'burger-1', quantity: 1 },
          { menuItemId: 'drink-1', quantity: 1 },
        ],
        orderTime: '2026-03-24T19:30:00.000Z',
      },
    );

    expect(couponsService.findBestAutoApplyPromotion).toHaveBeenCalledWith(
      expect.objectContaining({
        lineItems: [
          expect.objectContaining({
            menuItemId: 'burger-1',
            categoryId: 'cat-burger',
          }),
          expect.objectContaining({
            menuItemId: 'drink-1',
            categoryId: 'cat-drink',
          }),
        ],
        subtotal: 1100,
      }),
    );
    expect(result.data.discountAmount).toBe(301);
    expect(result.data.appliedPromotion).toEqual({
      id: 'deal-1',
      title: 'Burger Combo',
      applyMode: 'SCOPED_ITEMS',
      autoApply: true,
      discountType: 'FIXED_PRICE',
      discountValue: 799,
      discountAmount: 301,
    });
  });

  it('prices explicit fixed combo deal lines at the fixed deal price', async () => {
    const calculateQuoteBenefits = jest.fn().mockResolvedValue({
      walletAppliedAmount: new Prisma.Decimal(0),
      loyaltyDiscountAmount: new Prisma.Decimal(0),
      loyaltyPointsRedeemed: 0,
      totalAmount: new Prisma.Decimal(100),
    });
    const couponsService = {
      validateForCheckout: jest.fn(),
      findBestAutoApplyPromotion: jest.fn().mockResolvedValue(null),
      isActiveFixedPriceDealItem: jest.fn().mockResolvedValue(true),
      getActiveFixedPriceDealPricing: jest.fn().mockResolvedValue({
        dealId: 'deal-1',
        fixedPrice: new Prisma.Decimal(100),
        menuItemIds: ['menu-1', 'menu-2'],
      }),
    };
    const menuItems = new Map([
      [
        'menu-1',
        {
          id: 'menu-1',
          name: 'No Add-Ons',
          restaurantId: 'restaurant-1',
          basePrice: new Prisma.Decimal(20),
          depositAmount: new Prisma.Decimal(0),
          category: { id: 'cat-1', variations: [], modifierLinks: [] },
          modifierLinks: [],
          branchOverrides: [],
        },
      ],
      [
        'menu-2',
        {
          id: 'menu-2',
          name: 'Pizza Tse',
          restaurantId: 'restaurant-1',
          basePrice: new Prisma.Decimal(5),
          depositAmount: new Prisma.Decimal(0),
          category: { id: 'cat-2', variations: [], modifierLinks: [] },
          modifierLinks: [],
          branchOverrides: [],
        },
      ],
    ]);
    const service = new OrdersService(
      {
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
                deliveryFee: 0,
                isFreeDelivery: false,
                freeDeliveryThreshold: 0,
              },
              taxation: { taxPercentage: 0 },
            },
          }),
        },
        menuItem: {
          findFirst: jest.fn(({ where }: { where: { id: string } }) =>
            Promise.resolve(menuItems.get(where.id) ?? null),
          ),
        },
        address: {
          findFirst: jest.fn().mockResolvedValue({
            lat: new Prisma.Decimal('31.5204'),
            lng: new Prisma.Decimal('74.3587'),
          }),
        },
        user: { findFirst: jest.fn() },
      } as never,
      {} as never,
      couponsService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { calculateQuoteBenefits } as never,
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
          { menuItemId: 'menu-1', dealId: 'deal-1', quantity: 1 },
          { menuItemId: 'menu-2', dealId: 'deal-1', quantity: 1 },
        ],
        orderTime: '2026-03-24T19:30:00.000Z',
      },
    );

    expect(result.data.subtotal).toBe(100);
    expect(result.data.items).toEqual([
      expect.objectContaining({
        menuItemId: 'menu-1',
        dealId: 'deal-1',
        unitPrice: 80,
        lineTotal: 80,
      }),
      expect.objectContaining({
        menuItemId: 'menu-2',
        dealId: 'deal-1',
        unitPrice: 20,
        lineTotal: 20,
      }),
    ]);
    expect(calculateQuoteBenefits).toHaveBeenCalledWith(
      expect.objectContaining({ subtotal: new Prisma.Decimal(100) }),
    );
    expect(couponsService.findBestAutoApplyPromotion).toHaveBeenCalledWith(
      expect.objectContaining({
        lineItems: [
          expect.objectContaining({
            menuItemId: 'menu-1',
            dealId: 'deal-1',
            lineTotal: 80,
          }),
          expect.objectContaining({
            menuItemId: 'menu-2',
            dealId: 'deal-1',
            lineTotal: 20,
          }),
        ],
      }),
    );
  });

  it('prices flexible category deal quote lines at the fixed deal price', async () => {
    const calculateQuoteBenefits = jest
      .fn()
      .mockImplementation((summary: { subtotal: Prisma.Decimal }) =>
        Promise.resolve({
          walletAppliedAmount: new Prisma.Decimal(0),
          loyaltyDiscountAmount: new Prisma.Decimal(0),
          loyaltyPointsRedeemed: 0,
          totalAmount: summary.subtotal,
        }),
      );
    const couponsService = {
      validateForCheckout: jest.fn(),
      findBestAutoApplyPromotion: jest.fn().mockResolvedValue(null),
      isActiveFixedPriceDealItem: jest.fn().mockResolvedValue(true),
      getActiveFixedPriceDealPricing: jest.fn().mockResolvedValue({
        dealId: 'deal-1',
        fixedPrice: new Prisma.Decimal(22.5),
        menuItemIds: [],
        selectionMode: CouponDealSelectionMode.FLEXIBLE_ITEMS,
        requiredQuantity: null,
        categoryScopes: [
          { menuCategoryId: 'cat-pasta', itemLimit: 2 },
          { menuCategoryId: 'cat-drinks', itemLimit: 1 },
        ],
      }),
    };
    const menuItems = new Map([
      [
        'pasta-1',
        {
          id: 'pasta-1',
          name: 'Spicy Tom',
          restaurantId: 'restaurant-1',
          basePrice: new Prisma.Decimal(7.5),
          depositAmount: new Prisma.Decimal(0),
          category: { id: 'cat-pasta', variations: [], modifierLinks: [] },
          categoryLinks: [],
          modifierLinks: [],
          modifierPriceOverrides: [],
          variations: [],
          branchOverrides: [],
        },
      ],
      [
        'pasta-2',
        {
          id: 'pasta-2',
          name: 'Tuna',
          restaurantId: 'restaurant-1',
          basePrice: new Prisma.Decimal(8.9),
          depositAmount: new Prisma.Decimal(0),
          category: { id: 'cat-pasta', variations: [], modifierLinks: [] },
          categoryLinks: [],
          modifierLinks: [],
          modifierPriceOverrides: [],
          variations: [],
          branchOverrides: [],
        },
      ],
      [
        'drink-1',
        {
          id: 'drink-1',
          name: 'Fanta',
          restaurantId: 'restaurant-1',
          basePrice: new Prisma.Decimal(0),
          depositAmount: new Prisma.Decimal(0.08),
          category: { id: 'cat-drinks', variations: [], modifierLinks: [] },
          categoryLinks: [],
          modifierLinks: [],
          modifierPriceOverrides: [],
          variations: [],
          branchOverrides: [],
        },
      ],
    ]);
    const service = new OrdersService(
      {
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
                deliveryFee: 0,
                isFreeDelivery: false,
                freeDeliveryThreshold: 0,
              },
              taxation: { taxPercentage: 0 },
            },
          }),
        },
        menuItem: {
          findFirst: jest.fn(({ where }: { where: { id: string } }) =>
            Promise.resolve(menuItems.get(where.id) ?? null),
          ),
        },
        address: {
          findFirst: jest.fn().mockResolvedValue({
            lat: new Prisma.Decimal('31.5204'),
            lng: new Prisma.Decimal('74.3587'),
          }),
        },
        user: { findFirst: jest.fn() },
      } as never,
      {} as never,
      couponsService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { calculateQuoteBenefits } as never,
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
          { menuItemId: 'pasta-1', dealId: 'deal-1', quantity: 1 },
          { menuItemId: 'pasta-2', dealId: 'deal-1', quantity: 1 },
          { menuItemId: 'drink-1', dealId: 'deal-1', quantity: 1 },
        ],
        orderTime: '2026-03-24T19:30:00.000Z',
      },
    );

    expect(result.data.subtotal).toBe(22.58);
    expect(result.data.items).toEqual([
      expect.objectContaining({
        menuItemId: 'pasta-1',
        dealId: 'deal-1',
        unitPrice: 10.29,
        lineTotal: 10.29,
      }),
      expect.objectContaining({
        menuItemId: 'pasta-2',
        dealId: 'deal-1',
        unitPrice: 12.21,
        lineTotal: 12.21,
      }),
      expect.objectContaining({
        menuItemId: 'drink-1',
        dealId: 'deal-1',
        unitPrice: 0,
        lineTotal: 0.08,
      }),
    ]);
    expect(calculateQuoteBenefits).toHaveBeenCalledWith(
      expect.objectContaining({ subtotal: new Prisma.Decimal(22.58) }),
    );
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

  it('quotes split pizza when selected variation exists only on section flavors', async () => {
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
            basePrice: new Prisma.Decimal(1000),
            dietaryFlags: [],
            category: {
              id: 'cat-pizza',
              variations: [
                {
                  id: 'var-large',
                  name: 'Large',
                  price: new Prisma.Decimal(1300),
                  itemPriceOverrides: [],
                },
              ],
            },
            modifierLinks: [],
            branchOverrides: [],
          },
          {
            id: 'flavor-2',
            name: 'Pepperoni Pizza',
            restaurantId: 'restaurant-1',
            basePrice: new Prisma.Decimal(1100),
            dietaryFlags: [],
            category: {
              id: 'cat-pizza',
              variations: [
                {
                  id: 'var-large',
                  name: 'Large',
                  price: new Prisma.Decimal(1500),
                  itemPriceOverrides: [],
                },
              ],
            },
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
          totalAmount: new Prisma.Decimal(1500),
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
            variationId: 'var-large',
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

    expect(result.data.items[0]).toEqual(
      expect.objectContaining({
        variationId: 'var-large',
        variationName: 'Large',
        unitPrice: 1500,
      }),
    );
  });

  it('falls back to split section base price when selected variation is missing on one flavor', async () => {
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
            name: 'Pizza',
            restaurantId: 'restaurant-1',
            basePrice: new Prisma.Decimal(1000),
            dietaryFlags: [],
            category: { id: 'cat-pizza', variations: [] },
            modifierLinks: [],
            branchOverrides: [],
          },
          {
            id: 'flavor-2',
            name: 'Pepperoni Pizza',
            restaurantId: 'restaurant-1',
            basePrice: new Prisma.Decimal(1100),
            dietaryFlags: [],
            category: {
              id: 'cat-pizza',
              variations: [
                {
                  id: 'var-large',
                  name: 'Large',
                  price: new Prisma.Decimal(1500),
                  itemPriceOverrides: [],
                },
              ],
            },
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
          totalAmount: new Prisma.Decimal(1500),
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
            variationId: 'var-large',
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

    expect(result.data.items[0]).toEqual(
      expect.objectContaining({
        variationId: 'var-large',
        variationName: 'Large',
        unitPrice: 1500,
      }),
    );
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
