import { PaymentMethod, WinOrderCatalogMappingType } from '@prisma/client';
import { IntegrationOrder } from '../orders';
import { WinOrderPollingService } from './winorder-polling.service';

describe('WinOrderPollingService', () => {
  const machine = {
    connectionId: 'connection-1',
    tenantId: 'tenant-1',
    restaurantId: 'restaurant-1',
    branchId: 'branch-1',
    storeId: 41,
  };

  it('emits the official OrderList envelope with mapped articles', async () => {
    const order: IntegrationOrder = {
      id: 'order-1',
      orderType: 'DELIVERY',
      paymentMethod: PaymentMethod.COD,
      paymentStatus: 'PENDING',
      orderTime: null,
      createdAt: new Date('2026-08-05T06:00:00Z'),
      subtotal: 10,
      taxAmount: 1,
      deliveryFee: 2,
      serviceChargeAmount: 1,
      tipAmount: 1,
      discountAmount: 0,
      totalAmount: 15,
      customerNote: 'Ring bell',
      customer: {
        email: 'guest@example.test',
        firstName: 'Guest',
        lastName: 'User',
        phone: '123',
      },
      deliveryAddress: {
        street: 'Main Street 1',
        area: null,
        postalCode: '12345',
        city: 'Bremen',
        state: 'Bremen',
        country: 'DE',
      },
      paymentReference: null,
      currency: 'EUR',
      items: [
        {
          id: 'line-1',
          menuItemId: 'pizza',
          menuItemName: 'Pizza',
          variationId: null,
          variationName: null,
          quantity: 1,
          unitPrice: 10,
          depositAmount: 0,
          lineTotal: 10,
          taxPercentage: 7,
          note: null,
          dealId: null,
          modifiers: [],
          sections: [],
        },
      ],
    };
    const orders = {
      listExportCandidates: jest.fn().mockResolvedValue([order]),
    };
    const connections = {
      findByBranch: jest
        .fn()
        .mockResolvedValue({ storeId: 4, storeName: 'Main' }),
    };
    const mappings = {
      list: jest.fn().mockResolvedValue({
        catalogMappings: [
          {
            mappingType: WinOrderCatalogMappingType.ITEM,
            localKey: 'item:pizza:base',
            externalArticleNo: 'P1',
            externalArticleName: 'Pizza',
          },
          {
            mappingType: WinOrderCatalogMappingType.SERVICE_CHARGE,
            localKey: 'service_charge',
            externalArticleNo: 'SC',
            externalArticleName: 'Service charge',
          },
        ],
        paymentMappings: [
          { paymentMethod: PaymentMethod.COD, externalLabel: 'Barzahlung' },
        ],
      }),
    };
    const exports = {
      lease: jest.fn().mockResolvedValue(new Set(['order-1'])),
      markFailed: jest.fn(),
    };
    const service = new WinOrderPollingService(
      orders as never,
      connections as never,
      mappings as never,
      exports as never,
    );

    const result = await service.getNewOrders(machine);

    const payload = result.OrderList.Order[0] as {
      OrderID: string;
      AddInfo: { PaymentType: string; Total: number };
      ArticleList: { Article: Array<{ ArticleNo: string; Price: number }> };
    };
    expect(payload.OrderID).toBe('order-1');
    expect(payload.AddInfo).toEqual(
      expect.objectContaining({ PaymentType: 'Barzahlung', Total: 15 }),
    );
    expect(payload.ArticleList.Article).toEqual([
      expect.objectContaining({ ArticleNo: 'P1', Price: 10 }),
      expect.objectContaining({ ArticleNo: 'SC', Price: 1 }),
    ]);
  });

  it('keeps unmapped leased orders retryable instead of returning them', async () => {
    const orders = {
      listExportCandidates: jest.fn().mockResolvedValue([
        {
          id: 'order-1',
          paymentMethod: PaymentMethod.COD,
          items: [],
        },
      ]),
    };
    const connections = { findByBranch: jest.fn().mockResolvedValue({}) };
    const mappings = {
      list: jest.fn().mockResolvedValue({
        catalogMappings: [],
        paymentMappings: [],
      }),
    };
    const exports = {
      lease: jest.fn().mockResolvedValue(new Set(['order-1'])),
      markFailed: jest.fn(),
    };
    const service = new WinOrderPollingService(
      orders as never,
      connections as never,
      mappings as never,
      exports as never,
    );

    const result = await service.getNewOrders(machine);

    expect(result.OrderList.Order).toEqual([]);
    expect(exports.markFailed).toHaveBeenCalledWith(
      machine,
      'order-1',
      'Missing payment mapping: COD',
    );
  });
});
