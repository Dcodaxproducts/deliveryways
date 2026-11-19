import { Prisma } from '@prisma/client';
import {
  allocateMonthlyCommission,
  allocateMonthlyFee,
  toRestaurantLocalMonth,
} from './payout-accounting';

describe('payout accounting', () => {
  it('allocates 5% commission up to EUR79 in one local month', () => {
    let allocated = new Prisma.Decimal(0);
    const deductions = [400, 500, 700, 800].map((grossAmount) => {
      const amount = allocateMonthlyCommission({
        grossAmount: new Prisma.Decimal(grossAmount),
        allocatedBefore: allocated,
      });
      allocated = allocated.plus(amount);
      return amount.toNumber();
    });
    expect(deductions).toEqual([20, 25, 34, 0]);
  });

  it('allocates four fixed EUR39.75 installments', () => {
    let allocated = new Prisma.Decimal(0);
    const installments = [1, 2, 3, 4].map((payoutSequence) => {
      const amount = allocateMonthlyFee({
        payoutSequence,
        allocatedBefore: allocated,
        availableAfterOtherDeductions: new Prisma.Decimal(1000),
      });
      allocated = allocated.plus(amount);
      return amount.toNumber();
    });
    expect(installments).toEqual([39.75, 39.75, 39.75, 39.75]);
  });

  it('carries a shortfall within the month and lets only the fifth payout catch it up', () => {
    const first = allocateMonthlyFee({
      payoutSequence: 1,
      allocatedBefore: new Prisma.Decimal(0),
      availableAfterOtherDeductions: new Prisma.Decimal(10),
    });
    const second = allocateMonthlyFee({
      payoutSequence: 2,
      allocatedBefore: first,
      availableAfterOtherDeductions: new Prisma.Decimal(1000),
    });
    const fifth = allocateMonthlyFee({
      payoutSequence: 5,
      allocatedBefore: first.plus(second).plus('79.50'),
      availableAfterOtherDeductions: new Prisma.Decimal(1000),
    });
    expect([first.toNumber(), second.toNumber(), fifth.toNumber()]).toEqual([
      10, 39.75, 29.75,
    ]);
  });

  it('resets allocations in the next local month', () => {
    expect(
      allocateMonthlyCommission({
        grossAmount: new Prisma.Decimal(400),
        allocatedBefore: new Prisma.Decimal(0),
      }).toNumber(),
    ).toBe(20);
    expect(
      allocateMonthlyFee({
        payoutSequence: 1,
        allocatedBefore: new Prisma.Decimal(0),
        availableAfterOtherDeductions: new Prisma.Decimal(100),
      }).toNumber(),
    ).toBe(39.75);
  });

  it('uses the restaurant timezone across DST and UTC month boundaries', () => {
    expect(
      toRestaurantLocalMonth(
        new Date('2026-03-31T22:30:00.000Z'),
        'Europe/Berlin',
      ),
    ).toBe('2026-04');
    expect(
      toRestaurantLocalMonth(
        new Date('2026-10-31T23:30:00.000Z'),
        'America/New_York',
      ),
    ).toBe('2026-10');
  });
});
