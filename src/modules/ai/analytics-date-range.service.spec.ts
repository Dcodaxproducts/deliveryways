import { BadRequestException } from '@nestjs/common';
import { AnalyticsDateRangeService } from './analytics-date-range.service';
import {
  AnalyticsComparison,
  AnalyticsIntent,
  AnalyticsPeriodPreset,
} from './domain/analytics-copilot.types';

const base = {
  requestId: '11111111-1111-4111-8111-111111111111',
  restaurantId: 'restaurant-1',
  intent: AnalyticsIntent.OVERVIEW,
  period: AnalyticsPeriodPreset.CUSTOM,
  comparison: AnalyticsComparison.NONE,
  timezone: 'Europe/Berlin',
  locale: 'en' as const,
};

describe('AnalyticsDateRangeService', () => {
  const service = new AnalyticsDateRangeService();

  it('converts date-only restaurant periods to half-open UTC boundaries across DST', () => {
    const result = service.resolve({
      ...base,
      fromDate: '2026-03-29',
      toDate: '2026-03-29',
    });
    expect(result.current.startUtc.toISOString()).toBe(
      '2026-03-28T23:00:00.000Z',
    );
    expect(result.current.endExclusiveUtc.toISOString()).toBe(
      '2026-03-29T22:00:00.000Z',
    );
    expect(result.current.dayCount).toBe(1);
  });

  it('builds an equal calendar-day previous period', () => {
    const result = service.resolve({
      ...base,
      comparison: AnalyticsComparison.PREVIOUS_PERIOD,
      fromDate: '2026-10-10',
      toDate: '2026-10-16',
    });
    expect(result.comparison).toMatchObject({
      fromDate: '2026-10-03',
      toDate: '2026-10-09',
      dayCount: 7,
    });
  });

  it('rejects invalid, reversed, and overlong periods', () => {
    expect(() =>
      service.resolve({
        ...base,
        timezone: 'Not/AZone',
        fromDate: '2026-10-01',
        toDate: '2026-10-02',
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      service.resolve({
        ...base,
        fromDate: '2026-10-02',
        toDate: '2026-10-01',
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      service.resolve({
        ...base,
        fromDate: '2025-01-01',
        toDate: '2026-10-01',
      }),
    ).toThrow(BadRequestException);
  });

  it('resolves bounded seven-day preset in the requested timezone', () => {
    const result = service.resolve(
      {
        ...base,
        period: AnalyticsPeriodPreset.LAST_7_DAYS,
        fromDate: undefined,
        toDate: undefined,
      },
      new Date('2026-10-16T01:00:00.000Z'),
    );
    expect(result.current).toMatchObject({
      fromDate: '2026-10-10',
      toDate: '2026-10-16',
      dayCount: 7,
    });
  });
});
