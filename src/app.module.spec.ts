import { MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { AppModule } from './app.module';
import { AuthenticatedApiCacheMiddleware } from './common/middleware/authenticated-api-cache.middleware';
import { TenantDiscoveryMiddleware } from './common/middleware/tenant-discovery.middleware';

describe('AppModule middleware registration', () => {
  it('applies authenticated cache policy before tenant discovery on every route', () => {
    const forRoutes = jest.fn();
    const apply = jest.fn().mockReturnValue({ forRoutes });
    const consumer = { apply } as unknown as MiddlewareConsumer;

    new AppModule().configure(consumer);

    expect(apply).toHaveBeenCalledWith(
      AuthenticatedApiCacheMiddleware,
      TenantDiscoveryMiddleware,
    );
    expect(forRoutes).toHaveBeenCalledWith({
      path: '*',
      method: RequestMethod.ALL,
    });
  });
});
