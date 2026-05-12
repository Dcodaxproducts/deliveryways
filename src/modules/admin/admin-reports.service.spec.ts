import { AdminReportsService } from './admin-reports.service';

describe('AdminReportsService', () => {
  it('exports menu csv for business admin token restaurant scope', async () => {
    const repository = {
      exportMenu: jest.fn().mockResolvedValue([
        {
          id: 'item-1',
          name: 'Burger',
          slug: 'burger',
          sku: 'BRG-1',
          pricingMode: 'SINGLE',
          basePrice: 450,
          deliveryPriceAdjustment: 0,
          takeawayPriceAdjustment: 0,
          depositAmount: null,
          prepTimeMinutes: 15,
          isActive: true,
          createdAt: new Date('2026-04-22T00:00:00.000Z'),
          category: {
            id: 'category-1',
            name: 'Burgers',
            slug: 'burgers',
            variations: [{ id: 'var-1' }],
          },
          menuLinks: [{ restaurantMenu: { id: 'menu-1', name: 'Main Menu' } }],
          _count: { modifierLinks: 2 },
        },
      ]),
    };

    const service = new AdminReportsService(repository as never);

    const result = await service.exportMenuCsv(
      {
        uid: 'business-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: 'BUSINESS_ADMIN',
      } as never,
      {},
    );

    expect(repository.exportMenu).toHaveBeenCalledWith(
      {
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
      },
      expect.objectContaining({ restaurantId: 'restaurant-1' }),
    );
    expect(result.data.fileName).toContain('menu-export-restaurant-1');
    expect(result.data.content).toContain('Burger');
  });

  it('returns orders report with branch scope for branch admin', async () => {
    const repository = {
      getOrdersReport: jest.fn().mockResolvedValue({
        totalOrders: 12,
        totalRevenue: 18000,
        averageOrderValue: 1500,
        totalDeliveryFee: 500,
        totalDiscount: 300,
        statusBreakdown: [{ key: 'DELIVERED', count: 8 }],
        orderTypeBreakdown: [{ key: 'DELIVERY', count: 9 }],
        paymentStatusBreakdown: [{ key: 'PAID', count: 10 }],
        topItems: [
          {
            menuItemId: 'item-1',
            menuItemName: 'Burger',
            quantity: 7,
            revenue: 3150,
          },
        ],
      }),
    };

    const service = new AdminReportsService(repository as never);

    const result = await service.getOrdersReport(
      {
        uid: 'branch-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
        role: 'BRANCH_ADMIN',
      } as never,
      {},
    );

    expect(repository.getOrdersReport).toHaveBeenCalledWith(
      {
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
      },
      expect.objectContaining({
        branchId: 'branch-1',
        restaurantId: 'restaurant-1',
      }),
    );
    expect(result.data.totalOrders).toBe(12);
    expect(result.message).toBe('Orders report fetched successfully');
  });

  it('lists generated invoices for business admin scope', async () => {
    const repository = {
      listInvoices: jest.fn().mockResolvedValue([
        {
          id: 'order-12345678',
          restaurantId: 'restaurant-1',
          branchId: 'branch-1',
          orderType: 'DELIVERY',
          status: 'DELIVERED',
          paymentStatus: 'PAID',
          paymentMethod: 'CARD',
          subtotal: 1000,
          taxAmount: 50,
          deliveryFee: 100,
          discountAmount: 25,
          walletAppliedAmount: 0,
          loyaltyDiscountAmount: 0,
          totalAmount: 1125,
          paidAt: new Date('2026-05-12T10:00:00.000Z'),
          createdAt: new Date('2026-05-12T09:55:00.000Z'),
          orderTime: new Date('2026-05-12T09:55:00.000Z'),
          restaurant: {
            id: 'restaurant-1',
            name: 'Restaurant',
            slug: 'restaurant',
          },
          branch: { id: 'branch-1', name: 'Main' },
          customer: {
            id: 'customer-1',
            email: 'customer@test.com',
            profile: { firstName: 'Ali', lastName: 'Khan', phone: '123' },
          },
          transactions: [
            {
              id: 'txn-1',
              type: 'CHARGE',
              status: 'PAID',
              amount: 1125,
              currency: 'PKR',
              paymentMethod: 'CARD',
              providerRef: 'ref-1',
              processedAt: new Date('2026-05-12T10:00:00.000Z'),
              createdAt: new Date('2026-05-12T10:00:00.000Z'),
            },
          ],
          _count: { items: 2 },
        },
      ]),
    };

    const service = new AdminReportsService(repository as never);

    const result = await service.listInvoices(
      {
        uid: 'business-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: 'BUSINESS_ADMIN',
      } as never,
      {},
    );

    expect(repository.listInvoices).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', restaurantId: 'restaurant-1' },
      expect.objectContaining({ restaurantId: 'restaurant-1' }),
    );
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        invoiceNumber: 'INV-12345678',
        totalAmount: 1125,
        itemsCount: 2,
      }),
    );
  });

  it('returns generated invoice details for branch admin scope', async () => {
    const repository = {
      findInvoiceOrder: jest.fn().mockResolvedValue({
        id: 'order-12345678',
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
        orderType: 'TAKEAWAY',
        status: 'DELIVERED',
        paymentStatus: 'PAID',
        paymentMethod: 'CASH',
        subtotal: 500,
        taxAmount: 0,
        deliveryFee: 0,
        discountAmount: 0,
        walletAppliedAmount: 0,
        loyaltyDiscountAmount: 0,
        totalAmount: 500,
        paidAt: new Date('2026-05-12T10:00:00.000Z'),
        createdAt: new Date('2026-05-12T09:55:00.000Z'),
        orderTime: new Date('2026-05-12T09:55:00.000Z'),
        restaurant: {
          id: 'restaurant-1',
          name: 'Restaurant',
          slug: 'restaurant',
        },
        branch: { id: 'branch-1', name: 'Main' },
        customer: {
          id: 'customer-1',
          email: 'customer@test.com',
          profile: null,
        },
        coupon: null,
        items: [
          {
            id: 'order-item-1',
            menuItemId: 'item-1',
            menuItemName: 'Burger',
            variationId: null,
            variationName: null,
            unitPrice: 500,
            quantity: 1,
            lineTotal: 500,
            note: null,
            snapshotModifiers: null,
            createdAt: new Date('2026-05-12T09:55:00.000Z'),
          },
        ],
        transactions: [],
      }),
    };

    const service = new AdminReportsService(repository as never);

    const result = await service.getInvoice(
      {
        uid: 'branch-admin-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
        role: 'BRANCH_ADMIN',
      } as never,
      'order-12345678',
      {},
    );

    expect(repository.findInvoiceOrder).toHaveBeenCalledWith(
      {
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
      },
      'order-12345678',
      { restaurantId: 'restaurant-1', branchId: 'branch-1' },
    );
    expect(result.data.items[0]).toEqual(
      expect.objectContaining({ menuItemName: 'Burger', lineTotal: 500 }),
    );
    expect(result.message).toBe('Invoice fetched successfully');
  });
});
