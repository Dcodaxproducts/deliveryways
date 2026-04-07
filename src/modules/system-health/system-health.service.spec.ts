import { SystemHealthService } from './system-health.service';
import { SystemHealthRepository } from './system-health.repository';

describe('SystemHealthService', () => {
  let service: SystemHealthService;
  let repository: Partial<Record<keyof SystemHealthRepository, jest.Mock>>;

  beforeEach(() => {
    repository = {
      pingDatabase: jest.fn().mockResolvedValue({ status: 'up', latencyMs: 5 }),
      getPlatformSummary: jest.fn().mockResolvedValue({
        tenants: 1,
        restaurants: 1,
        branches: 2,
        customers: 10,
        ordersTotal: 20,
        ordersToday: 4,
        failedPayments: 1,
        failedNotifications: 0,
      }),
    };

    service = new SystemHealthService(
      repository as unknown as SystemHealthRepository,
    );
  });

  it('returns healthy status when database is up and usage is low', async () => {
    (service as unknown as { readServerStats: () => unknown }).readServerStats =
      jest.fn().mockReturnValue({
        uptimeSeconds: 100,
        cpu: { cores: 2, load1m: 0.2, estimatedUsagePercent: 10 },
        memory: {
          totalBytes: 100,
          freeBytes: 50,
          usedBytes: 50,
          usedPercent: 50,
        },
        disk: {
          path: '/',
          totalBytes: 100,
          freeBytes: 70,
          usedBytes: 30,
          usedPercent: 30,
        },
      });

    const result = await service.getOverview();

    expect(result.data.status).toBe('healthy');
    expect(result.message).toBe('System health fetched successfully');
  });

  it('returns down status when database is down', async () => {
    repository.pingDatabase!.mockResolvedValue({
      status: 'down',
      latencyMs: 25,
    });
    (service as unknown as { readServerStats: () => unknown }).readServerStats =
      jest.fn().mockReturnValue({
        uptimeSeconds: 100,
        cpu: { cores: 2, load1m: 0.2, estimatedUsagePercent: 10 },
        memory: {
          totalBytes: 100,
          freeBytes: 50,
          usedBytes: 50,
          usedPercent: 50,
        },
        disk: {
          path: '/',
          totalBytes: 100,
          freeBytes: 70,
          usedBytes: 30,
          usedPercent: 30,
        },
      });

    const result = await service.getOverview();

    expect(result.data.status).toBe('down');
    expect(result.data.database.status).toBe('down');
  });
});
