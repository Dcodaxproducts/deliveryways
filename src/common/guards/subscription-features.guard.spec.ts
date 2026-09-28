import { ForbiddenException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import {
  resolveSubscriptionFeature,
  SubscriptionFeaturesGuard,
} from './subscription-features.guard';

describe('SubscriptionFeaturesGuard', () => {
  it('maps protected routes to plan features', () => {
    expect(resolveSubscriptionFeature('orders')).toBe('orderManagement');
    expect(resolveSubscriptionFeature('pos/orders')).toBe('posCashRegister');
    expect(resolveSubscriptionFeature('admin/reports/orders')).toBe(
      'orderManagement',
    );
    expect(resolveSubscriptionFeature('admin/reports/orders/export')).toBe(
      'customerAnalytics',
    );
  });

  it('allows selected-restaurant order summaries when order management is enabled', async () => {
    class AdminReportsController {}
    const getOrdersReport = () => undefined;
    Reflect.defineMetadata(
      PATH_METADATA,
      'admin/reports',
      AdminReportsController,
    );
    Reflect.defineMetadata(PATH_METADATA, 'orders', getOrdersReport);
    const findFirst = jest.fn().mockResolvedValue({
      packagePlan: {
        features: { orderManagement: true, customerAnalytics: false },
      },
    });
    const guard = new SubscriptionFeaturesGuard({
      tenantSubscription: { findFirst },
    } as never);
    const context = {
      getClass: () => AdminReportsController,
      getHandler: () => getOrdersReport,
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            role: 'STAFF',
            actorType: 'STAFF',
            tid: 'tenant-1',
            rid: 'restaurant-1',
          },
          query: {
            restaurantId: 'restaurant-1',
            fromDate: '2026-09-27T22:00:00.000Z',
            toDate: '2026-09-28T09:18:00.000Z',
          },
        }),
      }),
    };

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    const calls = findFirst.mock.calls as unknown as Array<
      [
        {
          where: {
            tenantId: string;
            OR: Array<{ restaurantId: string | null }>;
          };
        },
      ]
    >;
    expect(calls[0][0].where.tenantId).toBe('tenant-1');
    expect(calls[0][0].where.OR).toContainEqual({
      restaurantId: 'restaurant-1',
    });
  });

  it('rejects a restaurant-panel request when its plan disables the feature', async () => {
    class OrdersController {}
    const listOrders = () => undefined;
    Reflect.defineMetadata(PATH_METADATA, 'orders', OrdersController);
    const prisma = {
      tenantSubscription: {
        findFirst: jest.fn().mockResolvedValue({
          packagePlan: { features: { orderManagement: false } },
        }),
      },
    };
    const guard = new SubscriptionFeaturesGuard(prisma as never);
    const context = {
      getClass: () => OrdersController,
      getHandler: () => listOrders,
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            role: 'RESTAURANT_ADMIN',
            tid: 'tenant-1',
            rid: 'restaurant-1',
          },
        }),
      }),
    };

    await expect(guard.canActivate(context as never)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows the request after switching to a plan that enables the feature', async () => {
    class PosController {}
    const listPosOrders = () => undefined;
    Reflect.defineMetadata(PATH_METADATA, 'pos', PosController);
    const prisma = {
      tenantSubscription: {
        findFirst: jest.fn().mockResolvedValue({
          packagePlan: { features: { posCashRegister: true } },
        }),
      },
    };
    const guard = new SubscriptionFeaturesGuard(prisma as never);
    const context = {
      getClass: () => PosController,
      getHandler: () => listPosOrders,
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            role: 'BRANCH_ADMIN',
            tid: 'tenant-1',
            rid: 'restaurant-1',
          },
        }),
      }),
    };

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
  });
});
