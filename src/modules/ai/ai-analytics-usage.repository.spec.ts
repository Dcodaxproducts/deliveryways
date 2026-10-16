/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { AiAnalyticsUsageStatus } from '@prisma/client';
import { AiAnalyticsUsageRepository } from './ai-analytics-usage.repository';

const scope = {
  tenantId: 'tenant-1',
  restaurantId: 'restaurant-1',
  branchId: null,
  ownerUserId: 'owner-1',
};
const range = {
  fromDate: '2026-10-10',
  toDate: '2026-10-16',
  startUtc: new Date('2026-10-10T00:00:00Z'),
  endExclusiveUtc: new Date('2026-10-17T00:00:00Z'),
  dayCount: 7,
};

describe('AiAnalyticsUsageRepository', () => {
  it('reuses an existing scoped request without creating another audit row', async () => {
    const aiAnalyticsUsage = {
      findUnique: jest.fn().mockResolvedValue({ id: 'usage-1' }),
      create: jest.fn(),
    };
    const repository = new AiAnalyticsUsageRepository({
      aiAnalyticsUsage,
    } as never);
    const result = await repository.reserve({
      scope,
      actorId: 'owner-1',
      actorRole: 'BUSINESS_ADMIN',
      requestId: '11111111-1111-4111-8111-111111111111',
      intent: 'OVERVIEW',
      range,
      comparison: null,
      timezone: 'UTC',
      locale: 'en',
      questionHash: 'a'.repeat(64),
      promptVersion: 'v1',
      expiresAt: new Date('2026-11-16'),
    });
    expect(result.created).toBe(false);
    expect(aiAnalyticsUsage.create).not.toHaveBeenCalled();
    expect(aiAnalyticsUsage.findUnique).toHaveBeenCalledWith({
      where: {
        tenantId_restaurantId_requestId: {
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          requestId: expect.any(String),
        },
      },
    });
  });

  it('persists only safe response JSON and scoped usage totals', async () => {
    const aiAnalyticsUsage = {
      update: jest.fn().mockResolvedValue({}),
      aggregate: jest.fn().mockResolvedValue({ _count: { id: 1 }, _sum: {} }),
    };
    const repository = new AiAnalyticsUsageRepository({
      aiAnalyticsUsage,
    } as never);
    await repository.complete('usage-1', {
      status: AiAnalyticsUsageStatus.FALLBACK,
      response: {
        requestId: 'r',
        mode: 'DETERMINISTIC_FALLBACK',
        intent: 'OVERVIEW',
        generatedAt: '2026-10-16T00:00:00Z',
        period: {
          fromDate: '2026-10-10',
          toDate: '2026-10-16',
          timezone: 'UTC',
        },
        comparison: null,
        currency: 'EUR',
        answer: {
          summary: 'safe',
          insights: [],
          caveats: [],
          followUpQuestions: [],
        },
        evidence: {
          metrics: [],
          paymentTypes: [],
          popularItems: [],
          busyHours: [],
          staffPerformance: [],
          definitions: [],
        },
      } as never,
      snapshotHash: 'b'.repeat(64),
      latencyMs: 12,
    });
    await repository.getDailyUsage(scope, new Date('2026-10-16T00:00:00Z'));
    expect(aiAnalyticsUsage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: AiAnalyticsUsageStatus.FALLBACK,
          response: expect.objectContaining({ answer: expect.any(Object) }),
        }),
      }),
    );
    expect(aiAnalyticsUsage.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
        }),
      }),
    );
  });

  it('deletes expired audit rows in bounded batches', async () => {
    const aiAnalyticsUsage = {
      findMany: jest.fn().mockResolvedValue([{ id: '1' }, { id: '2' }]),
      deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
    };
    const repository = new AiAnalyticsUsageRepository({
      aiAnalyticsUsage,
    } as never);
    await expect(repository.deleteExpired()).resolves.toBe(2);
    expect(aiAnalyticsUsage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 500 }),
    );
    expect(aiAnalyticsUsage.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['1', '2'] } },
    });
  });
});
