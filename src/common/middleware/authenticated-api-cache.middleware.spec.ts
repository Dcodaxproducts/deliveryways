import * as express from 'express';
import * as request from 'supertest';
import { AuthenticatedApiCacheMiddleware } from './authenticated-api-cache.middleware';

const AUTHORIZATION = 'Bearer authenticated-admin-token';

describe('AuthenticatedApiCacheMiddleware', () => {
  const createApp = () => {
    const app = express();
    const middleware = new AuthenticatedApiCacheMiddleware();

    app.use((req, res, next) => middleware.use(req, res, next));
    app.get('/api/v1/admin/reports/orders', (_req, res) => {
      res.json({ success: true, data: { totalOrders: 7 } });
    });
    app.get('/api/v1/admin/dashboard/orders/stats', (_req, res) => {
      res.json({ success: true, data: { today: 7 } });
    });
    app.get('/api/v1/orders', (_req, res) => {
      res.json({ success: true, data: [{ id: 'order-1' }] });
    });
    app.get('/public/content', (_req, res) => {
      res.json({ success: true, data: { title: 'Cacheable content' } });
    });

    return app;
  };

  it.each([
    '/api/v1/admin/reports/orders',
    '/api/v1/admin/dashboard/orders/stats',
    '/api/v1/orders',
  ])(
    'returns 200 JSON for repeated authenticated conditional GETs to %s',
    async (path) => {
      const app = createApp();
      const firstResponse = await request(app)
        .get(path)
        .set('Authorization', AUTHORIZATION)
        .expect(200);

      expect(firstResponse.headers.etag).toBeDefined();
      expect(firstResponse.headers['cache-control']).toBe(
        'private, no-store, max-age=0',
      );

      const conditionalResponse = await request(app)
        .get(path)
        .set('Authorization', AUTHORIZATION)
        .set('If-None-Match', firstResponse.headers.etag)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(conditionalResponse.body).toEqual(firstResponse.body);
    },
  );

  it('ignores authenticated date validators so dynamic responses keep a body', async () => {
    const response = await request(createApp())
      .get('/api/v1/admin/reports/orders')
      .set('Authorization', AUTHORIZATION)
      .set('If-Modified-Since', new Date(Date.now() + 60_000).toUTCString())
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      data: { totalOrders: 7 },
    });
  });

  it('preserves conditional GET caching for unauthenticated public content', async () => {
    const app = createApp();
    const firstResponse = await request(app).get('/public/content').expect(200);

    await request(app)
      .get('/public/content')
      .set('If-None-Match', firstResponse.headers.etag)
      .expect(304);
  });
});
