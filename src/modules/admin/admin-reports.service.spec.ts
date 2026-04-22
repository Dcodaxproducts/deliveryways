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
          menuLinks: [
            { restaurantMenu: { id: 'menu-1', name: 'Main Menu' } },
          ],
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
        topItems: [{ menuItemId: 'item-1', menuItemName: 'Burger', quantity: 7, revenue: 3150 }],
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
      expect.objectContaining({ branchId: 'branch-1', restaurantId: 'restaurant-1' }),
    );
    expect(result.data.totalOrders).toBe(12);
    expect(result.message).toBe('Orders report fetched successfully');
  });
});
