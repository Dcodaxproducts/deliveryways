import { SystemHealthMetricsService } from './system-health-metrics.service';

describe('SystemHealthMetricsService', () => {
  let service: SystemHealthMetricsService;

  beforeEach(() => {
    service = new SystemHealthMetricsService();
  });

  it('builds request overview and buckets from recorded requests', () => {
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
    expect(metrics.buckets).toHaveLength(12);
  });

  it('returns integration summaries and logs', () => {
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
});
