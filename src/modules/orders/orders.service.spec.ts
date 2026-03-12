import { OrdersService } from './orders.service';

describe('OrdersService - delivery radius', () => {
  let service: OrdersService;

  beforeEach(() => {
    service = new OrdersService({} as never, {} as never, {} as never);
  });

  it('calculates 0 km for same point', () => {
    const distFn = (
      service as unknown as {
        calculateDistanceKm: (
          a: number,
          b: number,
          c: number,
          d: number,
        ) => number;
      }
    ).calculateDistanceKm;
    const distance = distFn.call(service, 31.5204, 74.3587, 31.5204, 74.3587);
    expect(distance).toBe(0);
  });

  it('calculates correct distance between two Lahore points', () => {
    const distFn = (
      service as unknown as {
        calculateDistanceKm: (
          a: number,
          b: number,
          c: number,
          d: number,
        ) => number;
      }
    ).calculateDistanceKm;
    const distance = distFn.call(service, 31.5204, 74.3587, 31.5497, 74.3436);
    expect(distance).toBeGreaterThan(2);
    expect(distance).toBeLessThan(5);
  });
});

describe('OrdersService - status transitions', () => {
  let service: OrdersService;

  beforeEach(() => {
    service = new OrdersService({} as never, {} as never, {} as never);
  });

  const checkTransition = (current: string, next: string): boolean => {
    const fn = (
      service as unknown as {
        isValidStatusTransition: (a: string, b: string) => boolean;
      }
    ).isValidStatusTransition;
    return fn.call(service, current, next);
  };

  it('allows PLACED -> CONFIRMED', () => {
    expect(checkTransition('PLACED', 'CONFIRMED')).toBe(true);
  });

  it('allows PLACED -> REJECTED', () => {
    expect(checkTransition('PLACED', 'REJECTED')).toBe(true);
  });

  it('allows CONFIRMED -> PREPARING', () => {
    expect(checkTransition('CONFIRMED', 'PREPARING')).toBe(true);
  });

  it('allows PREPARING -> OUT_FOR_DELIVERY', () => {
    expect(checkTransition('PREPARING', 'OUT_FOR_DELIVERY')).toBe(true);
  });

  it('allows OUT_FOR_DELIVERY -> DELIVERED', () => {
    expect(checkTransition('OUT_FOR_DELIVERY', 'DELIVERED')).toBe(true);
  });

  it('rejects DELIVERED -> anything', () => {
    expect(checkTransition('DELIVERED', 'PLACED')).toBe(false);
    expect(checkTransition('DELIVERED', 'CANCELLED')).toBe(false);
  });

  it('rejects CANCELLED -> anything', () => {
    expect(checkTransition('CANCELLED', 'PLACED')).toBe(false);
  });

  it('rejects backwards transitions', () => {
    expect(checkTransition('PREPARING', 'CONFIRMED')).toBe(false);
    expect(checkTransition('CONFIRMED', 'PLACED')).toBe(false);
  });
});
