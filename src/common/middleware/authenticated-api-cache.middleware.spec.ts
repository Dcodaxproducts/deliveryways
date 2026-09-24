import * as express from 'express';
import * as request from 'supertest';
import { AuthenticatedApiCacheMiddleware } from './authenticated-api-cache.middleware';

const AUTHORIZATION = 'Bearer authenticated-admin-token';

describe('AuthenticatedApiCacheMiddleware', () => {
  const lastModified = new Date('2026-09-24T08:00:00.000Z').toUTCString();

  const createApp = (useCacheMiddleware = true) => {
    const app = express();
    const middleware = new AuthenticatedApiCacheMiddleware();

    if (useCacheMiddleware) {
      app.use((req, res, next) => middleware.use(req, res, next));
    }
    app.get('/api/v1/admin/reports/orders', (_req, res) => {
      res.setHeader('Last-Modified', lastModified);
      res.json({ success: true, data: { totalOrders: 7 } });
    });
    app.get('/api/v1/admin/dashboard/orders/stats', (_req, res) => {
      res.json({ success: true, data: { today: 7 } });
    });
    app.get('/api/v1/orders', (_req, res) => {
      res.json({ success: true, data: [{ id: 'order-1' }] });
    });
    app.get('/public/content', (_req, res) => {
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json({ success: true, data: { title: 'Cacheable content' } });
    });
    app.post('/api/v1/auth/login', (_req, res) => {
      res.json({ accessToken: 'access-token', refreshToken: 'refresh-token' });
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

  it('turns a real Last-Modified 304 baseline into authenticated 200 JSON', async () => {
    await request(createApp(false))
      .get('/api/v1/admin/reports/orders')
      .set('If-Modified-Since', lastModified)
      .expect(304);

    const response = await request(createApp())
      .get('/api/v1/admin/reports/orders')
      .set('Authorization', AUTHORIZATION)
      .set('If-Modified-Since', lastModified)
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      data: { totalOrders: 7 },
    });
  });

  it('returns 200 for authenticated conditional HEAD requests', async () => {
    const app = createApp();
    const firstResponse = await request(app)
      .head('/api/v1/admin/reports/orders')
      .set('Authorization', AUTHORIZATION)
      .expect(200);

    await request(app)
      .head('/api/v1/admin/reports/orders')
      .set('Authorization', AUTHORIZATION)
      .set('If-None-Match', firstResponse.headers.etag)
      .expect('Cache-Control', 'private, no-store, max-age=0')
      .expect(200);
  });

  it('prevents storage of unauthenticated token-producing responses', async () => {
    const response = await request(createApp())
      .post('/api/v1/auth/login')
      .expect('Cache-Control', 'private, no-store, max-age=0')
      .expect(200);

    expect(response.body).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
  });

  it('preserves public cache policy and conditional GET behavior', async () => {
    const app = createApp();
    const firstResponse = await request(app).get('/public/content').expect(200);

    expect(firstResponse.headers['cache-control']).toBe('public, max-age=300');

    const conditionalResponse = await request(app)
      .get('/public/content')
      .set('If-None-Match', firstResponse.headers.etag)
      .expect(304);

    expect(conditionalResponse.headers['cache-control']).toBe(
      'public, max-age=300',
    );
  });
});
