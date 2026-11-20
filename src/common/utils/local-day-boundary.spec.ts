import { restaurantLocalDayBoundary } from './local-day-boundary';

describe('restaurantLocalDayBoundary', () => {
  it('covers the complete 23-hour DST spring-forward day', () => {
    const from = restaurantLocalDayBoundary('2026-03-29', 'Europe/Berlin');
    const to = restaurantLocalDayBoundary('2026-03-29', 'Europe/Berlin', true);

    expect(from.toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(to.toISOString()).toBe('2026-03-29T22:00:00.000Z');
    expect(to.getTime() - from.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it('covers the complete 25-hour DST fall-back day', () => {
    const from = restaurantLocalDayBoundary('2026-10-25', 'Europe/Berlin');
    const to = restaurantLocalDayBoundary('2026-10-25', 'Europe/Berlin', true);

    expect(from.toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(to.toISOString()).toBe('2026-10-25T23:00:00.000Z');
    expect(to.getTime() - from.getTime()).toBe(25 * 60 * 60 * 1000);
  });

  it('uses restaurant-local midnight in a non-DST timezone', () => {
    expect(
      restaurantLocalDayBoundary('2026-07-15', 'Asia/Karachi').toISOString(),
    ).toBe('2026-07-14T19:00:00.000Z');
  });
});
