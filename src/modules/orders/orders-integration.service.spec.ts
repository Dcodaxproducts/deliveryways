import { BadRequestException } from '@nestjs/common';
import {
  OrderStatus,
  OrderType,
  PaymentFeePayer,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { OrdersIntegrationService } from './orders-integration.service';

describe('OrdersIntegrationService', () => {
  const scope = {
    tenantId: 'tenant-1',
    restaurantId: 'restaurant-1',
    branchId: 'branch-1',
  };

  const makeService = () => {
    const repository = {
      findIntegrationExportCandidates: jest.fn(),
      findIntegrationOrder: jest.fn(),
      updateIntegrationStatus: jest.fn(),
      updateIntegrationEstimate: jest.fn(),
    };
    const notifications = { notifyOrderStatusChanged: jest.fn() };
    const chat = { syncDeliveryThreadForOrderLifecycle: jest.fn() };
    const realtime = { emitTrackingUpdate: jest.fn() };
    const service = new OrdersIntegrationService(
      repository as never,
      notifications as never,
      chat as never,
      realtime as never,
    );

    return { service, repository, notifications, chat, realtime };
  };

  it('normalizes an export candidate without leaking Prisma decimals', async () => {
    const { service, repository } = makeService();
    repository.findIntegrationExportCandidates.mockResolvedValue([
      {
        id: 'order-1',
        orderType: OrderType.DELIVERY,
        paymentMethod: PaymentMethod.COD,
        paymentStatus: PaymentStatus.PENDING,
        orderTime: null,
        createdAt: new Date('2026-08-05T06:00:00Z'),
        subtotal: new Prisma.Decimal(20),
        taxAmount: new Prisma.Decimal(2),
        deliveryFee: new Prisma.Decimal(3),
        serviceChargeAmount: new Prisma.Decimal(1),
        transactionFeeAmount: new Prisma.Decimal(1.5),
        transactionFeePayer: PaymentFeePayer.CUSTOMER,
        tipAmount: new Prisma.Decimal(0),
        discountAmount: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal(26),
        customerNote: null,
        customer: {
          email: 'guest@example.test',
          profile: { firstName: 'Guest', lastName: null, phone: '123' },
        },
        deliveryAddress: null,
        transactions: [{ providerRef: 'pay-1', currency: 'EUR' }],
        items: [
          {
            id: 'order-item-1',
            menuItemId: 'item-1',
            menuItemName: 'Pizza',
            variationId: 'variation-1',
            variationName: 'Large',
            quantity: 1,
            unitPrice: new Prisma.Decimal(20),
            depositAmount: new Prisma.Decimal(0),
            lineTotal: new Prisma.Decimal(20),
            note: null,
            menuItem: { taxPercentage: new Prisma.Decimal(10) },
            snapshotModifiers: [
              {
                modifierId: 'modifier-1',
                name: 'Olives',
                quantity: 1,
                unitPrice: 2,
              },
            ],
          },
        ],
      },
    ]);

    const result = await service.listExportCandidates(scope, 25);

    expect(result[0]).toEqual(
      expect.objectContaining({
        id: 'order-1',
        totalAmount: 26,
        paymentFeeAmount: 1.5,
      }),
    );
    expect(result[0].items[0]).toEqual(
      expect.objectContaining({
        taxPercentage: 10,
        modifiers: [
          {
            modifierId: 'modifier-1',
            name: 'Olives',
            quantity: 1,
            unitPrice: 2,
          },
        ],
      }),
    );
  });

  it('omits a transaction fee paid by the restaurant', async () => {
    const { service, repository } = makeService();
    repository.findIntegrationExportCandidates.mockResolvedValue([
      {
        id: 'order-restaurant-fee',
        orderType: OrderType.TAKEAWAY,
        paymentMethod: PaymentMethod.STRIPE,
        paymentStatus: PaymentStatus.PAID,
        orderTime: null,
        createdAt: new Date('2026-08-22T06:00:00Z'),
        subtotal: new Prisma.Decimal(20),
        taxAmount: new Prisma.Decimal(2),
        deliveryFee: new Prisma.Decimal(0),
        serviceChargeAmount: new Prisma.Decimal(0),
        transactionFeeAmount: new Prisma.Decimal(1.5),
        transactionFeePayer: PaymentFeePayer.RESTAURANT,
        tipAmount: new Prisma.Decimal(0),
        discountAmount: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal(22),
        customerNote: null,
        customer: {
          email: 'guest@example.test',
          profile: null,
        },
        deliveryAddress: null,
        transactions: [],
        items: [],
      },
    ]);

    const result = await service.listExportCandidates(scope, 25);

    expect(result[0].paymentFeeAmount).toBe(0);
  });

  it('advances through missing delivery lifecycle states', async () => {
    const { service, repository, notifications, chat, realtime } =
      makeService();
    repository.findIntegrationOrder.mockResolvedValue({
      id: 'order-1',
      orderType: OrderType.DELIVERY,
      status: OrderStatus.PLACED,
      orderTime: null,
    });

    await service.applyStatus({
      ...scope,
      orderId: 'order-1',
      status: 'OUT_FOR_DELIVERY',
      estimatedPreparationMinutes: 20,
    });

    expect(repository.updateIntegrationStatus).toHaveBeenNthCalledWith(
      1,
      'order-1',
      expect.objectContaining(scope),
      OrderStatus.CONFIRMED,
      expect.any(Date),
    );
    expect(repository.updateIntegrationStatus).toHaveBeenNthCalledWith(
      2,
      'order-1',
      expect.objectContaining(scope),
      OrderStatus.PREPARING,
      undefined,
    );
    expect(repository.updateIntegrationStatus).toHaveBeenNthCalledWith(
      3,
      'order-1',
      expect.objectContaining(scope),
      OrderStatus.OUT_FOR_DELIVERY,
      undefined,
    );
    expect(repository.updateIntegrationEstimate).toHaveBeenCalledWith(
      'order-1',
      expect.objectContaining(scope),
      expect.objectContaining({ estimatedPreparationMinutes: 20 }),
    );
    expect(notifications.notifyOrderStatusChanged).toHaveBeenCalledWith(
      'order-1',
    );
    expect(chat.syncDeliveryThreadForOrderLifecycle).toHaveBeenCalledWith(
      'order-1',
      OrderStatus.OUT_FOR_DELIVERY,
    );
    expect(realtime.emitTrackingUpdate).toHaveBeenCalledWith({ id: 'order-1' });
  });

  it('rejects backward status changes', async () => {
    const { service, repository } = makeService();
    repository.findIntegrationOrder.mockResolvedValue({
      id: 'order-1',
      orderType: OrderType.DELIVERY,
      status: OrderStatus.OUT_FOR_DELIVERY,
      orderTime: new Date(),
    });

    await expect(
      service.applyStatus({
        ...scope,
        orderId: 'order-1',
        status: 'PREPARING',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
