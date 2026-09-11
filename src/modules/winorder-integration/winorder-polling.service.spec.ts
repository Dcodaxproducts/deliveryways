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
    paymentFeeAmount: 0,
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
      street: 'Main Street',
      area: '1',
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

  it('emits the official OrderList envelope with mapped articles', async () => {
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
          { paymentMethod: PaymentMethod.COD, externalLabel: 'Cash' },
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
      AddInfo: {
        PaymentType: string;
        PaymentFee?: number;
        DeliverType: string;
        DeliveryType?: string;
        Total: number;
      };
      ArticleList: { Article: Array<{ ArticleNo: string; Price: number }> };
      Customer: {
        DeliveryAddress: { Street: string; AddAddress?: string };
      };
    };
    expect(payload.OrderID).toBe('order-1');
    expect(payload.AddInfo).toEqual(
      expect.objectContaining({ PaymentType: 'Barzahlung', Total: 15 }),
    );
    expect(payload.AddInfo.DeliverType).toBe('Lieferung');
    expect(payload.AddInfo.DeliveryType).toBeUndefined();
    expect(payload.AddInfo.PaymentFee).toBeUndefined();
    expect(payload.Customer.DeliveryAddress).toEqual(
      expect.objectContaining({ Street: 'Main Street 1' }),
    );
    expect(payload.Customer.DeliveryAddress.AddAddress).toBeUndefined();
    expect(payload.ArticleList.Article).toEqual([
      expect.objectContaining({ ArticleNo: 'P1', Price: 10 }),
      expect.objectContaining({ ArticleNo: 'SC', Price: 1 }),
    ]);
  });

  it.each([
    ['DELIVERY', 'Lieferung'],
    ['TAKEAWAY', 'Abholung'],
    ['DINE_IN', 'Vor Ort'],
  ] as const)(
    'exports %s orders with WinOrder DeliverType %s',
    async (orderType, expectedDeliverType) => {
      const typedOrder: IntegrationOrder = {
        ...order,
        id: `order-${orderType.toLowerCase()}`,
        orderType,
        serviceChargeAmount: 0,
      };
      const orders = {
        listExportCandidates: jest.fn().mockResolvedValue([typedOrder]),
      };
      const connections = { findByBranch: jest.fn().mockResolvedValue({}) };
      const mappings = {
        list: jest.fn().mockResolvedValue({
          catalogMappings: [],
          paymentMappings: [],
        }),
      };
      const exports = {
        lease: jest.fn().mockResolvedValue(new Set([typedOrder.id])),
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
        AddInfo: { DeliverType: string; DeliveryType?: string };
      };

      expect(payload.AddInfo.DeliverType).toBe(expectedDeliverType);
      expect(payload.AddInfo.DeliveryType).toBeUndefined();
      expect(exports.markFailed).not.toHaveBeenCalled();
    },
  );

  it('uses the online default and base article for a new variation', async () => {
    const onlineOrder: IntegrationOrder = {
      ...order,
      id: 'order-2',
      paymentMethod: PaymentMethod.PAYPAL,
      paymentStatus: 'PAID',
      serviceChargeAmount: 0,
      items: [
        {
          ...order.items[0],
          variationId: 'large',
          variationName: 'Large',
        },
      ],
    };
    const orders = {
      listExportCandidates: jest.fn().mockResolvedValue([onlineOrder]),
    };
    const connections = {
      findByBranch: jest.fn().mockResolvedValue({ storeId: null }),
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
        ],
        paymentMappings: [],
      }),
    };
    const exports = {
      lease: jest.fn().mockResolvedValue(new Set(['order-2'])),
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
      AddInfo: { PaymentType: string };
      ArticleList: {
        Article: Array<{ ArticleNo: string; ArticleSize?: string }>;
      };
    };
    expect(payload.AddInfo.PaymentType).toBe('Über DeliveryWay online bezahlt');
    expect(payload.ArticleList.Article).toEqual([
      expect.objectContaining({ ArticleNo: 'P1', ArticleSize: 'Large' }),
    ]);
    expect(exports.markFailed).not.toHaveBeenCalled();
  });

  it('exports a customer-paid online fee through PaymentFee', async () => {
    const feeOrder: IntegrationOrder = {
      ...order,
      id: 'order-fee',
      paymentMethod: PaymentMethod.STRIPE,
      paymentStatus: 'PAID',
      serviceChargeAmount: 0,
      paymentFeeAmount: 1.25,
    };
    const orders = {
      listExportCandidates: jest.fn().mockResolvedValue([feeOrder]),
    };
    const connections = { findByBranch: jest.fn().mockResolvedValue({}) };
    const mappings = {
      list: jest.fn().mockResolvedValue({
        catalogMappings: [],
        paymentMappings: [],
      }),
    };
    const exports = {
      lease: jest.fn().mockResolvedValue(new Set(['order-fee'])),
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
      AddInfo: { PaymentType: string; PaymentFee?: number };
    };
    expect(payload.AddInfo).toEqual(
      expect.objectContaining({
        PaymentType: 'Über DeliveryWay online bezahlt',
        PaymentFee: 1.25,
      }),
    );
    expect(exports.markFailed).not.toHaveBeenCalled();
  });

  it('exports modifiers without repricing and item notes as sub-article comments', async () => {
    const nameMatchedOrder: IntegrationOrder = {
      ...order,
      id: 'order-3',
      serviceChargeAmount: 0,
      items: [
        {
          ...order.items[0],
          variationId: 'large',
          variationName: 'Large',
          note: 'ohne Mais',
          modifiers: [
            {
              modifierId: 'cheese',
              name: 'Extra Cheese',
              quantity: 2,
              unitPrice: 1.5,
            },
          ],
        },
      ],
    };
    const orders = {
      listExportCandidates: jest.fn().mockResolvedValue([nameMatchedOrder]),
    };
    const connections = {
      findByBranch: jest.fn().mockResolvedValue({ storeId: null }),
    };
    const mappings = {
      list: jest.fn().mockResolvedValue({
        catalogMappings: [],
        paymentMappings: [],
      }),
    };
    const exports = {
      lease: jest.fn().mockResolvedValue(new Set(['order-3'])),
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
      ArticleList: {
        Article: Array<{
          ArticleNo?: string;
          ArticleName: string;
          ArticleSize?: string;
          Price: number;
          Comment?: string;
          SubArticleList?: {
            SubArticle: Array<{
              ArticleNo?: string;
              ArticleName?: string;
              Count: number;
              Price?: number;
              Comment?: string;
            }>;
          };
        }>;
      };
    };
    expect(payload.ArticleList.Article).toEqual([
      expect.objectContaining({
        ArticleNo: undefined,
        ArticleName: 'Pizza',
        ArticleSize: 'Large',
        Price: 10,
        SubArticleList: {
          SubArticle: [
            {
              ArticleNo: undefined,
              ArticleName: 'Extra Cheese',
              Count: 2,
              Price: 0,
            },
            {
              Comment: 'ohne Mais',
              Count: 1,
            },
          ],
        },
      }),
    ]);
    expect(payload.ArticleList.Article[0].Comment).toBeUndefined();
    expect(exports.markFailed).not.toHaveBeenCalled();
  });

  it('keeps the reported three-item WinOrder total and product notes intact', async () => {
    const reportedOrder: IntegrationOrder = {
      ...order,
      id: 'order-reported-winorder-total',
      subtotal: 28,
      deliveryFee: 1,
      serviceChargeAmount: 0,
      tipAmount: 2,
      totalAmount: 31,
      items: [
        {
          ...order.items[0],
          id: 'chicken-nuggets',
          menuItemId: 'chicken-nuggets',
          menuItemName: 'Chicken Nuggets, 6 Stück',
          unitPrice: 3.8,
          lineTotal: 3.8,
          modifiers: [
            {
              modifierId: 'salsa-sauce',
              name: 'Salsa Sauce',
              quantity: 1,
              unitPrice: 0,
            },
          ],
        },
        {
          ...order.items[0],
          id: 'pizza-basic',
          menuItemId: 'pizza-basic',
          menuItemName: 'Pizza Basic, klein',
          unitPrice: 11,
          lineTotal: 11,
          note: 'Pizza schneiden',
          modifiers: [
            {
              modifierId: 'cheese',
              name: 'Käserand',
              quantity: 1,
              unitPrice: 2,
            },
            {
              modifierId: 'onions',
              name: 'Zwiebeln',
              quantity: 1,
              unitPrice: 1,
            },
          ],
        },
        {
          ...order.items[0],
          id: 'bolognese',
          menuItemId: 'bolognese',
          menuItemName: 'BOLOGNESE, Portion',
          unitPrice: 13.2,
          lineTotal: 13.2,
          note: 'ohne Mais',
          modifiers: [
            {
              modifierId: 'ham',
              name: 'Formfleisch-Vorderschinken',
              quantity: 1,
              unitPrice: 2,
            },
          ],
        },
      ],
    };
    const orders = {
      listExportCandidates: jest.fn().mockResolvedValue([reportedOrder]),
    };
    const connections = { findByBranch: jest.fn().mockResolvedValue({}) };
    const mappings = {
      list: jest.fn().mockResolvedValue({
        catalogMappings: [],
        paymentMappings: [],
      }),
    };
    const exports = {
      lease: jest
        .fn()
        .mockResolvedValue(new Set(['order-reported-winorder-total'])),
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
      AddInfo: { DeliverLumpSum: number; Tip: number; Total: number };
      ArticleList: {
        Article: Array<{
          Count: number;
          Price: number;
          SubArticleList?: {
            SubArticle: Array<{
              ArticleName?: string;
              Count: number;
              Price?: number;
              Comment?: string;
            }>;
          };
        }>;
      };
    };
    const subArticles = payload.ArticleList.Article.flatMap(
      (article) => article.SubArticleList?.SubArticle ?? [],
    );
    const articleTotal = payload.ArticleList.Article.reduce(
      (total, article) => total + article.Price * article.Count,
      0,
    );

    expect(articleTotal).toBe(28);
    expect(
      articleTotal + payload.AddInfo.DeliverLumpSum + payload.AddInfo.Tip,
    ).toBe(payload.AddInfo.Total);
    expect(subArticles.filter((subArticle) => subArticle.ArticleName)).toEqual([
      expect.objectContaining({ ArticleName: 'Salsa Sauce', Price: 0 }),
      expect.objectContaining({ ArticleName: 'Käserand', Price: 0 }),
      expect.objectContaining({ ArticleName: 'Zwiebeln', Price: 0 }),
      expect.objectContaining({
        ArticleName: 'Formfleisch-Vorderschinken',
        Price: 0,
      }),
    ]);
    expect(subArticles.filter((subArticle) => subArticle.Comment)).toEqual([
      { Comment: 'Pizza schneiden', Count: 1 },
      { Comment: 'ohne Mais', Count: 1 },
    ]);
    expect(exports.markFailed).not.toHaveBeenCalled();
  });

  it('keeps a positive generic service charge retryable without a mapping', async () => {
    const orders = {
      listExportCandidates: jest.fn().mockResolvedValue([order]),
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
      'Missing catalog mapping: service_charge',
    );
  });

  it('keeps unsupported unmapped payments retryable', async () => {
    const orders = {
      listExportCandidates: jest.fn().mockResolvedValue([
        {
          id: 'order-1',
          paymentMethod: PaymentMethod.BANK_TRANSFER,
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
      'Missing payment mapping: BANK_TRANSFER',
    );
  });
});
