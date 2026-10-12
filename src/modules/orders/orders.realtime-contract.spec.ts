import { NotFoundException } from '@nestjs/common';
import { OrderStatus, OrderType, PaymentStatus, Prisma } from '@prisma/client';
import { UserRoleEnum } from '../../common/enums';
import type {
  OrderCreatedRealtimePayload,
  OrderStatusRealtimePayload,
  OrderUpdatedRealtimePayload,
} from '../notifications/notifications-realtime.service';
import { OrdersService } from './orders.service';

const createdAt = new Date('2026-10-12T10:00:00.000Z');
const updatedAt = new Date('2026-10-12T10:05:00.000Z');

const summaryRow = {
  id: 'order-1',
  tenantId: 'tenant-1',
  restaurantId: 'restaurant-1',
  branchId: 'branch-1',
  status: OrderStatus.CONFIRMED,
  orderType: OrderType.DELIVERY,
  paymentStatus: PaymentStatus.PENDING,
  totalAmount: new Prisma.Decimal('42.50'),
  createdAt,
  updatedAt,
};

const trackingRow = {
  id: 'order-1',
  tenantId: 'tenant-1',
  restaurantId: 'restaurant-1',
  branchId: 'branch-1',
  customerId: 'customer-1',
  deliveryAddressId: 'address-1',
  deliverymanId: 'deliveryman-1',
  orderType: OrderType.DELIVERY,
  paymentStatus: PaymentStatus.PENDING,
  paymentMethod: 'CASH',
  orderTime: null,
  isScheduled: false,
  status: OrderStatus.OUT_FOR_DELIVERY,
  assignedAt: createdAt,
  deliveredAt: null,
  paidAt: null,
  cancelledAt: null,
  customerNote: null,
  createdAt,
  updatedAt,
  branch: { id: 'branch-1', name: 'Main', logoUrl: null, coverImage: null },
  deliveryAddress: {
    id: 'address-1',
    street: '1 Main St',
    area: null,
    postalCode: '1000',
    city: 'City',
    state: 'State',
    country: 'DE',
    lat: new Prisma.Decimal('52.5'),
    lng: new Prisma.Decimal('13.4'),
  },
  deliveryman: {
    id: 'deliveryman-1',
    firstName: 'Dee',
    lastName: 'Livery',
    phone: '+49123',
    status: 'ACTIVE',
    vehicleType: 'BIKE',
    vehicleNumber: null,
    currentLat: new Prisma.Decimal('52.51'),
    currentLng: new Prisma.Decimal('13.41'),
    locationUpdatedAt: updatedAt,
  },
};

const makeService = (overrides: { summary?: unknown; tracking?: unknown }) => {
  const repository = {
    findRealtimeSummaryById: jest
      .fn()
      .mockResolvedValue(
        overrides.summary === undefined ? summaryRow : overrides.summary,
      ),
    findTrackingById: jest
      .fn()
      .mockResolvedValue(
        overrides.tracking === undefined ? trackingRow : overrides.tracking,
      ),
  };
  const prisma = { address: { findFirst: jest.fn().mockResolvedValue(null) } };
  const service = new OrdersService(
    prisma as never,
    repository as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, repository, prisma };
};

describe('OrdersService realtime payload contracts', () => {
  it('order.created keeps the existing OrderCreatedRealtimePayload shape', async () => {
    const expected: OrderCreatedRealtimePayload = {
      id: 'order-1',
      status: 'CONFIRMED',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      orderType: 'DELIVERY',
      paymentStatus: 'PENDING',
      totalAmount: 42.5,
      createdAt,
    };
    const payload = await makeService({}).service.getRealtimeEventPayload(
      'order.created',
      'order-1',
    );
    expect(payload).toStrictEqual(expected);
    expect(typeof (payload as OrderCreatedRealtimePayload).totalAmount).toBe(
      'number',
    );
  });

  it('order.status.updated keeps the existing OrderStatusRealtimePayload shape', async () => {
    const expected: OrderStatusRealtimePayload = {
      id: 'order-1',
      status: 'CONFIRMED',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      updatedAt,
    };
    expect(
      await makeService({}).service.getRealtimeEventPayload(
        'order.status.updated',
        'order-1',
      ),
    ).toStrictEqual(expected);
  });

  it('order.updated keeps the existing OrderUpdatedRealtimePayload shape', async () => {
    const expected: OrderUpdatedRealtimePayload = {
      id: 'order-1',
      status: 'CONFIRMED',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      paymentStatus: 'PENDING',
      updatedAt,
    };
    expect(
      await makeService({}).service.getRealtimeEventPayload(
        'order.updated',
        'order-1',
      ),
    ).toStrictEqual(expected);
  });

  it('order.tracking.updated is the full tracking snapshot, identical to order.tracking.snapshot', async () => {
    const { service } = makeService({});
    const updated = await service.getRealtimeEventPayload(
      'order.tracking.updated',
      'order-1',
    );
    const snapshot = await service.getTrackingSnapshot(
      { uid: 'customer-1', role: UserRoleEnum.CUSTOMER },
      'order-1',
    );
    expect(updated).toStrictEqual(snapshot);
    expect(updated).toMatchObject({
      id: 'order-1',
      supportsRealtime: true,
      trackingMode: 'STATUS_AND_LOCATION',
      currentStage: OrderStatus.OUT_FOR_DELIVERY,
      deliveryman: {
        id: 'deliveryman-1',
        currentLat: 52.51,
        currentLng: 13.41,
      },
    });
    expect(Object.keys(updated as object).sort()).toEqual(
      [
        'id',
        'tenantId',
        'restaurantId',
        'branchId',
        'customerId',
        'deliveryAddressId',
        'deliverymanId',
        'orderType',
        'paymentMethod',
        'paymentStatus',
        'orderTime',
        'isScheduled',
        'status',
        'customerNote',
        'createdAt',
        'updatedAt',
        'assignedAt',
        'deliveredAt',
        'paidAt',
        'cancelledAt',
        'supportsRealtime',
        'trackingMode',
        'currentStage',
        'progressPercent',
        'branch',
        'deliveryAddress',
        'deliveryman',
        'timeline',
      ].sort(),
    );
  });

  it('returns null for vanished orders and rethrows infrastructure errors', async () => {
    const service = makeService({ summary: null, tracking: null }).service;
    for (const event of [
      'order.created',
      'order.status.updated',
      'order.updated',
      'order.tracking.updated',
    ] as const)
      expect(await service.getRealtimeEventPayload(event, 'gone')).toBeNull();

    const failing = makeService({});
    failing.repository.findTrackingById.mockRejectedValue(new Error('db down'));
    await expect(
      failing.service.getRealtimeEventPayload('order.tracking.updated', 'x'),
    ).rejects.toThrow('db down');
    failing.repository.findRealtimeSummaryById.mockRejectedValue(
      new NotFoundException('not for summary'),
    );
    await expect(
      failing.service.getRealtimeEventPayload('order.updated', 'x'),
    ).rejects.toThrow('not for summary');
  });
});
