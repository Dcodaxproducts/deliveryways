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
      'customerAnalytics',
    );
  });

  it('rejects a restaurant-panel request when its plan disables the feature', async () => {
    class OrdersController {}
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
