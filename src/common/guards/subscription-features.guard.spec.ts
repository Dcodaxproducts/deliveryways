import { ForbiddenException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { AdminReportsController } from '../../modules/admin/admin-reports.controller';
import {
  resolveSubscriptionFeature,
  SubscriptionFeaturesGuard,
} from './subscription-features.guard';

type TestUser = {
  role: string;
  actorType?: string;
  tid?: string | null;
  rid?: string | null;
};

const createContext = (
  controllerPath: string,
  handlerPath: string,
  user: TestUser,
  query: Record<string, unknown> = {},
  options: {
    method?: string;
    params?: Record<string, unknown>;
    body?: Record<string, unknown>;
  } = {},
) => {
  class TestController {}
  const handler = () => undefined;
  Reflect.defineMetadata(PATH_METADATA, controllerPath, TestController);
  Reflect.defineMetadata(PATH_METADATA, handlerPath, handler);

  return {
    getClass: () => TestController,
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => ({
        user,
        query,
        method: options.method ?? 'GET',
        params: options.params ?? {},
        body: options.body ?? {},
      }),
    }),
  };
};

type AdminReportsHandler =
  | 'getFinancialReport'
  | 'getOrdersReport'
  | 'exportOrdersCsv';

const createAdminReportsContext = (
  handlerName: AdminReportsHandler,
  user: TestUser,
  query: Record<string, unknown> = {},
  options: {
    method?: string;
    params?: Record<string, unknown>;
    body?: Record<string, unknown>;
  } = {},
) => ({
  getClass: () => AdminReportsController,
  getHandler: () => AdminReportsController.prototype[handlerName],
  switchToHttp: () => ({
    getRequest: () => ({
      user,
      query,
      method: options.method ?? 'GET',
      params: options.params ?? {},
      body: options.body ?? {},
    }),
  }),
});

const createPrisma = (options?: {
  features?: Record<string, boolean>;
  restaurant?: { id: string } | null;
}) => ({
  restaurant: {
    findFirst: jest.fn().mockResolvedValue(options?.restaurant ?? null),
  },
  tenantSubscription: {
    findFirst: jest.fn().mockResolvedValue({
      packagePlan: {
        features: options?.features ?? {
          orderManagement: true,
          customerAnalytics: false,
        },
      },
    }),
  },
});

describe('SubscriptionFeaturesGuard', () => {
  it('maps protected routes to plan features', () => {
    expect(resolveSubscriptionFeature('orders')).toBe('orderManagement');
    expect(resolveSubscriptionFeature('pos/orders')).toBe('posCashRegister');
    expect(resolveSubscriptionFeature('admin/reports/financial')).toBe(
      'orderManagement',
    );
    expect(resolveSubscriptionFeature('admin/reports/orders')).toBe(
      'orderManagement',
    );
    expect(resolveSubscriptionFeature('admin/reports/orders/export')).toBe(
      'customerAnalytics',
    );
  });

  it('evaluates an authorized selected restaurant instead of a prior restaurant claim', async () => {
    const prisma = createPrisma();
    const guard = new SubscriptionFeaturesGuard(prisma as never);
    const context = createContext(
      'admin/reports',
      'orders',
      {
        role: 'STAFF',
        actorType: 'STAFF',
        tid: 'tenant-1',
        rid: 'restaurant-selected',
      },
      {
        restaurantId: 'restaurant-selected',
        fromDate: '2026-09-27T22:00:00.000Z',
        toDate: '2026-09-28T09:18:00.000Z',
      },
    );

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    const calls = prisma.tenantSubscription.findFirst.mock
      .calls as unknown as Array<
      [
        {
          where: {
            tenantId: string;
            OR: Array<{ restaurantId: string | null }>;
          };
        },
      ]
    >;
    expect(calls[0][0].where).toMatchObject({
      tenantId: 'tenant-1',
      OR: [{ restaurantId: 'restaurant-selected' }, { restaurantId: null }],
    });
  });

  it('rejects staff when the selected restaurant differs from the authorized scope', async () => {
    const prisma = createPrisma();
    const guard = new SubscriptionFeaturesGuard(prisma as never);
    const context = createContext(
      'admin/reports',
      'orders',
      {
        role: 'STAFF',
        actorType: 'STAFF',
        tid: 'tenant-1',
        rid: 'restaurant-assigned',
      },
      { restaurantId: 'restaurant-unassigned' },
    );

    await expect(guard.canActivate(context as never)).rejects.toThrow(
      'Access to the selected restaurant is denied',
    );
    expect(prisma.tenantSubscription.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a selected restaurant when order management is disabled', async () => {
    const prisma = createPrisma({
      features: { orderManagement: false, customerAnalytics: true },
    });
    const guard = new SubscriptionFeaturesGuard(prisma as never);
    const context = createContext(
      'admin/reports',
      'orders',
      {
        role: 'STAFF',
        actorType: 'STAFF',
        tid: 'tenant-1',
        rid: 'restaurant-selected',
      },
      { restaurantId: 'restaurant-selected' },
    );

    await expect(guard.canActivate(context as never)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('validates tenant membership before gating a tenant-wide business admin target', async () => {
    const prisma = createPrisma({ restaurant: { id: 'restaurant-selected' } });
    const guard = new SubscriptionFeaturesGuard(prisma as never);
    const context = createContext(
      'admin/reports',
      'orders',
      { role: 'BUSINESS_ADMIN', tid: 'tenant-1', rid: null },
      { restaurantId: 'restaurant-selected' },
    );

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(prisma.restaurant.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'restaurant-selected',
        tenantId: 'tenant-1',
        deletedAt: null,
        isActive: true,
      },
      select: { id: true },
    });
  });

  it('denies conflicting GET body and query restaurant scopes before reading feature state', async () => {
    const prisma = createPrisma({ restaurant: { id: 'restaurant-query' } });
    const guard = new SubscriptionFeaturesGuard(prisma as never);
    const context = createContext(
      'admin/reports',
      'orders',
      { role: 'BUSINESS_ADMIN', tid: 'tenant-1', rid: null },
      { restaurantId: 'restaurant-query' },
      {
        method: 'GET',
        body: { restaurantId: 'restaurant-body' },
      },
    );

    await expect(guard.canActivate(context as never)).rejects.toThrow(
      'Access to the selected restaurant is denied',
    );
    expect(prisma.restaurant.findFirst).not.toHaveBeenCalled();
    expect(prisma.tenantSubscription.findFirst).not.toHaveBeenCalled();
  });

  it('denies a BUSINESS_ADMIN report when query and parameter scopes differ', async () => {
    const prisma = createPrisma({ restaurant: { id: 'restaurant-query' } });
    const guard = new SubscriptionFeaturesGuard(prisma as never);
    const context = createContext(
      'admin/reports',
      'orders',
      { role: 'BUSINESS_ADMIN', tid: 'tenant-1', rid: null },
      { restaurantId: 'restaurant-query' },
      {
        method: 'GET',
        params: { restaurantId: 'restaurant-param' },
      },
    );

    await expect(guard.canActivate(context as never)).rejects.toThrow(
      'Access to the selected restaurant is denied',
    );
    expect(prisma.tenantSubscription.findFirst).not.toHaveBeenCalled();
  });

  it('preserves legitimate body-scoped routes', async () => {
    const prisma = createPrisma();
    const guard = new SubscriptionFeaturesGuard(prisma as never);
    const context = createContext(
      'orders',
      '',
      { role: 'RESTAURANT_ADMIN', tid: 'tenant-1', rid: 'restaurant-1' },
      {},
      {
        method: 'POST',
        body: { restaurantId: 'restaurant-1' },
      },
    );

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
  });

  it('denies a cross-tenant business admin target before reading feature state', async () => {
    const prisma = createPrisma({ restaurant: null });
    const guard = new SubscriptionFeaturesGuard(prisma as never);
    const context = createContext(
      'admin/reports',
      'orders',
      { role: 'BUSINESS_ADMIN', tid: 'tenant-1', rid: null },
      { restaurantId: 'restaurant-other-tenant' },
    );

    await expect(guard.canActivate(context as never)).rejects.toThrow(
      'Access to the selected restaurant is denied',
    );
    expect(prisma.tenantSubscription.findFirst).not.toHaveBeenCalled();
  });

  it('allows super-admin staff after the role guard hydrates selected tenant and restaurant claims', async () => {
    const prisma = createPrisma();
    const guard = new SubscriptionFeaturesGuard(prisma as never);
    const context = createContext(
      'admin/reports',
      'orders',
      {
        role: 'STAFF',
        actorType: 'STAFF',
        tid: 'tenant-selected',
        rid: 'restaurant-selected',
      },
      { restaurantId: 'restaurant-selected' },
    );

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
  });

  it('denies selected-restaurant access for super-admin staff without hydrated claims', async () => {
    const prisma = createPrisma();
    const guard = new SubscriptionFeaturesGuard(prisma as never);
    const context = createContext(
      'admin/reports',
      'orders',
      { role: 'STAFF', actorType: 'STAFF', tid: null, rid: null },
      { restaurantId: 'restaurant-selected' },
    );

    await expect(guard.canActivate(context as never)).rejects.toThrow(
      'Access to the selected restaurant is denied',
    );
    expect(prisma.tenantSubscription.findFirst).not.toHaveBeenCalled();
  });

  it('does not require restaurant entitlement for an unscoped super-admin report', async () => {
    const prisma = createPrisma();
    const guard = new SubscriptionFeaturesGuard(prisma as never);
    const context = createContext('admin/reports', 'orders', {
      role: 'STAFF',
      actorType: 'STAFF',
      tid: null,
      rid: null,
    });

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(prisma.tenantSubscription.findFirst).not.toHaveBeenCalled();
  });

  describe('AdminReportsController metadata', () => {
    const businessAdmin: TestUser = {
      role: 'BUSINESS_ADMIN',
      tid: 'tenant-1',
      rid: null,
    };

    it('maps only financial and orders summaries to order management', () => {
      const featureFor = (handlerName: AdminReportsHandler) =>
        resolveSubscriptionFeature(
          [
            Reflect.getMetadata(PATH_METADATA, AdminReportsController),
            Reflect.getMetadata(
              PATH_METADATA,
              AdminReportsController.prototype[handlerName],
            ),
          ].join('/'),
        );

      expect(featureFor('getFinancialReport')).toBe('orderManagement');
      expect(featureFor('getOrdersReport')).toBe('orderManagement');
      expect(featureFor('exportOrdersCsv')).toBe('customerAnalytics');
    });

    it('allows financial reports for an authorized selected restaurant when order management is enabled', async () => {
      const prisma = createPrisma({
        features: { orderManagement: true, customerAnalytics: false },
        restaurant: { id: 'restaurant-selected' },
      });
      const guard = new SubscriptionFeaturesGuard(prisma as never);
      const context = createAdminReportsContext(
        'getFinancialReport',
        businessAdmin,
        { restaurantId: 'restaurant-selected' },
      );

      await expect(guard.canActivate(context as never)).resolves.toBe(true);
      expect(prisma.restaurant.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'restaurant-selected',
          tenantId: 'tenant-1',
          deletedAt: null,
          isActive: true,
        },
        select: { id: true },
      });
      const subscriptionCalls = prisma.tenantSubscription.findFirst.mock
        .calls as unknown as Array<
        [
          {
            where: {
              tenantId: string;
              OR: Array<{ restaurantId: string | null }>;
            };
          },
        ]
      >;
      expect(subscriptionCalls[0][0].where).toMatchObject({
        tenantId: 'tenant-1',
        OR: [{ restaurantId: 'restaurant-selected' }, { restaurantId: null }],
      });
    });

    it('denies financial reports when order management is disabled', async () => {
      const prisma = createPrisma({
        features: { orderManagement: false, customerAnalytics: true },
      });
      const guard = new SubscriptionFeaturesGuard(prisma as never);
      const context = createAdminReportsContext(
        'getFinancialReport',
        {
          role: 'BRANCH_ADMIN',
          tid: 'tenant-1',
          rid: 'restaurant-selected',
        },
        { restaurantId: 'restaurant-selected' },
      );

      await expect(guard.canActivate(context as never)).rejects.toThrow(
        'Your current subscription does not include orderManagement',
      );
    });

    it('preserves customer analytics gating for sibling report routes', async () => {
      const prisma = createPrisma({
        features: { orderManagement: true, customerAnalytics: false },
      });
      const guard = new SubscriptionFeaturesGuard(prisma as never);
      const context = createAdminReportsContext(
        'exportOrdersCsv',
        {
          role: 'BRANCH_ADMIN',
          tid: 'tenant-1',
          rid: 'restaurant-selected',
        },
        { restaurantId: 'restaurant-selected' },
      );

      await expect(guard.canActivate(context as never)).rejects.toThrow(
        'Your current subscription does not include customerAnalytics',
      );
    });

    it('denies conflicting financial report restaurant IDs before database access', async () => {
      const prisma = createPrisma({ restaurant: { id: 'restaurant-query' } });
      const guard = new SubscriptionFeaturesGuard(prisma as never);
      const context = createAdminReportsContext(
        'getFinancialReport',
        businessAdmin,
        { restaurantId: 'restaurant-query' },
        { params: { restaurantId: 'restaurant-param' } },
      );

      await expect(guard.canActivate(context as never)).rejects.toThrow(
        'Access to the selected restaurant is denied',
      );
      expect(prisma.restaurant.findFirst).not.toHaveBeenCalled();
      expect(prisma.tenantSubscription.findFirst).not.toHaveBeenCalled();
    });

    it('denies cross-tenant financial report targets before entitlement lookup', async () => {
      const prisma = createPrisma({ restaurant: null });
      const guard = new SubscriptionFeaturesGuard(prisma as never);
      const context = createAdminReportsContext(
        'getFinancialReport',
        businessAdmin,
        { restaurantId: 'restaurant-other-tenant' },
      );

      await expect(guard.canActivate(context as never)).rejects.toThrow(
        'Access to the selected restaurant is denied',
      );
      expect(prisma.tenantSubscription.findFirst).not.toHaveBeenCalled();
    });

    it('denies unassigned staff financial report targets', async () => {
      const prisma = createPrisma();
      const guard = new SubscriptionFeaturesGuard(prisma as never);
      const context = createAdminReportsContext(
        'getFinancialReport',
        {
          role: 'STAFF',
          actorType: 'STAFF',
          tid: 'tenant-1',
          rid: 'restaurant-assigned',
        },
        { restaurantId: 'restaurant-unassigned' },
      );

      await expect(guard.canActivate(context as never)).rejects.toThrow(
        'Access to the selected restaurant is denied',
      );
      expect(prisma.tenantSubscription.findFirst).not.toHaveBeenCalled();
    });
  });
});
