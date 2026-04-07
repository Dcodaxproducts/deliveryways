import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SystemHealthMetricsService } from './system-health-metrics.service';

describe('SystemHealthMetricsService', () => {
  let service: SystemHealthMetricsService;
  let storePath: string;
  let previousStorePath: string | undefined;

  beforeEach(() => {
    previousStorePath = process.env.SYSTEM_HEALTH_STORE_PATH;
    storePath = join(
      mkdtempSync(join(tmpdir(), 'dw-system-health-')),
      'metrics-store.json',
    );
    process.env.SYSTEM_HEALTH_STORE_PATH = storePath;
    service = new SystemHealthMetricsService();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    if (previousStorePath === undefined) {
      delete process.env.SYSTEM_HEALTH_STORE_PATH;
    } else {
      process.env.SYSTEM_HEALTH_STORE_PATH = previousStorePath;
    }
    await rm(join(storePath, '..'), { recursive: true, force: true });
  });

  it('builds request overview and buckets from recorded requests', async () => {
    await service.onModuleInit();
    service.recordRequest({
      method: 'GET',
      path: '/api/v1/orders',
      statusCode: 200,
      durationMs: 120,
      success: true,
      timestamp: new Date(Date.now() - 60_000).toISOString(),
    });
    service.recordRequest({
      method: 'POST',
      path: '/api/v1/orders',
      statusCode: 500,
      durationMs: 300,
      success: false,
      timestamp: new Date(Date.now() - 30_000).toISOString(),
    });

    const overview = service.getRequestOverview('hour');
    const metrics = service.getRequestMetrics('hour');

    expect(overview.totalRequests).toBe(2);
    expect(overview.successCount).toBe(1);
    expect(overview.failureCount).toBe(1);
    expect(overview.persistence).toEqual({
      mode: 'file',
      durableAcrossRestarts: true,
    });
    expect(metrics.buckets).toHaveLength(12);
  });

  it('returns integration summaries and logs', async () => {
    await service.onModuleInit();
    service.recordIntegrationLog('webhook', {
      status: 'failed',
      message: 'Webhook delivery failed',
      meta: { endpoint: 'https://example.com/webhook' },
    });

    const overview = service.getIntegrationOverview();
    const logs = service.getIntegrationLogs('webhook', 10);

    expect(overview.webhook.failedCount).toBe(1);
    expect(logs.items[0]?.message).toBe('Webhook delivery failed');
  });

  it('loads persisted metrics across service restart without schema changes', async () => {
    await service.onModuleInit();
    service.recordRequest({
      method: 'GET',
      path: '/api/v1/orders',
      statusCode: 200,
      durationMs: 50,
      success: true,
    });
    service.recordIntegrationLog('printer', {
      status: 'warning',
      message: 'Printer is reconnecting',
    });
    await service.onModuleDestroy();

    const reloaded = new SystemHealthMetricsService();
    await reloaded.onModuleInit();

    expect(reloaded.getRequestOverview('hour').totalRequests).toBe(1);
    expect(reloaded.getIntegrationLogs('printer', 10).items).toHaveLength(1);

    await reloaded.onModuleDestroy();
  });
});
