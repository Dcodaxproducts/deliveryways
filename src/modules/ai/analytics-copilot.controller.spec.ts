/* eslint-disable @typescript-eslint/unbound-method */
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { RolesEnum } from '../../common/enums';
import { AnalyticsCopilotController } from './analytics-copilot.controller';
import {
  AnalyticsIntent,
  AnalyticsPeriodPreset,
} from './domain/analytics-copilot.types';

describe('AnalyticsCopilotController', () => {
  it('delegates capabilities and query without adding business logic', async () => {
    const service = {
      getCapabilities: jest
        .fn()
        .mockResolvedValue({ data: { enabled: false } }),
      query: jest.fn().mockResolvedValue({ data: { mode: 'AI' } }),
    };
    const controller = new AnalyticsCopilotController(service as never);
    const user = { uid: 'owner-1', tid: 'tenant-1', role: 'BUSINESS_ADMIN' };
    await controller.getCapabilities(user as never, {
      restaurantId: 'restaurant-1',
    });
    await controller.query(
      user as never,
      {
        requestId: '11111111-1111-4111-8111-111111111111',
        restaurantId: 'restaurant-1',
        intent: AnalyticsIntent.OVERVIEW,
        period: AnalyticsPeriodPreset.LAST_7_DAYS,
        timezone: 'UTC',
        locale: 'en',
      } as never,
    );
    expect(service.getCapabilities).toHaveBeenCalledWith(user, {
      restaurantId: 'restaurant-1',
    });
    expect(service.query).toHaveBeenCalledTimes(1);
  });

  it('declares business-admin-only access on both endpoints', () => {
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        AnalyticsCopilotController.prototype.getCapabilities,
      ),
    ).toEqual([RolesEnum.BUSINESS_ADMIN]);
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        AnalyticsCopilotController.prototype.query,
      ),
    ).toEqual([RolesEnum.BUSINESS_ADMIN]);
  });
});
