import {
  PackageCommissionType,
  PackagePayoutCycle,
  Prisma,
} from '@prisma/client';
import {
  allocateMonthlyCommission,
  allocateMonthlyFee,
  monthlyFeeInstallment,
  nextRestaurantPayoutAt,
  toRestaurantLocalMonth,
} from './payout-accounting';

describe('payout accounting', () => {
  it('allocates an explicit 7% commission up to 100 in one local month', () => {
    let allocated = new Prisma.Decimal(0);
    const deductions = [400, 500, 700, 800].map((grossAmount) => {
      const amount = allocateMonthlyCommission({
        grossAmount: new Prisma.Decimal(grossAmount),
        allocatedBefore: allocated,
        commissionType: PackageCommissionType.PERCENTAGE,
        percentage: new Prisma.Decimal(7),
        fixedAmount: new Prisma.Decimal(0),
        commissionUnits: 1,
        capAmount: new Prisma.Decimal(100),
      });
      allocated = allocated.plus(amount);
      return amount.toNumber();
    });
    expect(deductions).toEqual([28, 35, 37, 0]);
  });

  it('allocates four exact installments from an arbitrary configured fee', () => {
    let allocated = new Prisma.Decimal(0);
    const installments = [1, 2, 3, 4].map((payoutSequence) => {
      const amount = allocateMonthlyFee({
        payoutSequence,
        allocatedBefore: allocated,
        availableAfterOtherDeductions: new Prisma.Decimal(1000),
        monthlyFee: new Prisma.Decimal('200.03'),
      });
      allocated = allocated.plus(amount);
      return amount.toNumber();
    });
    expect(installments).toEqual([50.01, 50.01, 50.01, 50]);
    expect(allocated.toNumber()).toBe(200.03);
    expect(monthlyFeeInstallment(new Prisma.Decimal(79), 1).toNumber()).toBe(
      19.75,
    );
  });

  it('carries a shortfall within the month and lets only the fifth payout catch it up', () => {
    const monthlyFee = new Prisma.Decimal(159);
    const first = allocateMonthlyFee({
      payoutSequence: 1,
      allocatedBefore: new Prisma.Decimal(0),
      availableAfterOtherDeductions: new Prisma.Decimal(10),
      monthlyFee,
    });
    const second = allocateMonthlyFee({
      payoutSequence: 2,
      allocatedBefore: first,
      availableAfterOtherDeductions: new Prisma.Decimal(1000),
      monthlyFee,
    });
    const fifth = allocateMonthlyFee({
      payoutSequence: 5,
      allocatedBefore: first.plus(second).plus('79.50'),
      availableAfterOtherDeductions: new Prisma.Decimal(1000),
      monthlyFee,
    });
    expect([first.toNumber(), second.toNumber(), fifth.toNumber()]).toEqual([
      10, 39.75, 29.75,
    ]);
  });

  it('supports fixed commission and an unlimited percentage cap', () => {
    expect(
      allocateMonthlyCommission({
        grossAmount: new Prisma.Decimal(100),
        allocatedBefore: new Prisma.Decimal(0),
        commissionType: PackageCommissionType.FIXED,
        percentage: new Prisma.Decimal(0),
        fixedAmount: new Prisma.Decimal('3.25'),
        commissionUnits: 2,
        capAmount: null,
      }).toNumber(),
    ).toBe(6.5);
    expect(
      allocateMonthlyCommission({
        grossAmount: new Prisma.Decimal(1000),
        allocatedBefore: new Prisma.Decimal(999),
        commissionType: PackageCommissionType.PERCENTAGE,
        percentage: new Prisma.Decimal(5),
        fixedAmount: new Prisma.Decimal(0),
        commissionUnits: 1,
        capAmount: null,
      }).toNumber(),
    ).toBe(50);
  });

  it('keeps distinct restaurant plan values isolated', () => {
    const restaurantACommission = allocateMonthlyCommission({
      grossAmount: new Prisma.Decimal(2000),
      allocatedBefore: new Prisma.Decimal(0),
      commissionType: PackageCommissionType.PERCENTAGE,
      percentage: new Prisma.Decimal(7),
      fixedAmount: new Prisma.Decimal(0),
      commissionUnits: 1,
      capAmount: new Prisma.Decimal(100),
    });
    const restaurantBCommission = allocateMonthlyCommission({
      grossAmount: new Prisma.Decimal(2000),
      allocatedBefore: new Prisma.Decimal(0),
      commissionType: PackageCommissionType.PERCENTAGE,
      percentage: new Prisma.Decimal(5),
      fixedAmount: new Prisma.Decimal(0),
      commissionUnits: 1,
      capAmount: new Prisma.Decimal(79),
    });

    expect(restaurantACommission.toNumber()).toBe(100);
    expect(restaurantBCommission.toNumber()).toBe(79);
    expect(monthlyFeeInstallment(new Prisma.Decimal(200), 1).toNumber()).toBe(
      50,
    );
    expect(monthlyFeeInstallment(new Prisma.Decimal(159), 1).toNumber()).toBe(
      39.75,
    );
  });

  it('resets allocations in the next local month', () => {
    expect(
      allocateMonthlyCommission({
        grossAmount: new Prisma.Decimal(400),
        allocatedBefore: new Prisma.Decimal(0),
        commissionType: PackageCommissionType.PERCENTAGE,
        percentage: new Prisma.Decimal(5),
        fixedAmount: new Prisma.Decimal(0),
        commissionUnits: 1,
        capAmount: new Prisma.Decimal(79),
      }).toNumber(),
    ).toBe(20);
    expect(
      allocateMonthlyFee({
        payoutSequence: 1,
        allocatedBefore: new Prisma.Decimal(0),
        availableAfterOtherDeductions: new Prisma.Decimal(100),
        monthlyFee: new Prisma.Decimal(159),
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

  it('schedules the next weekly payout at the same local time across DST', () => {
    expect(
      nextRestaurantPayoutAt(
        new Date('2026-03-25T09:00:00.000Z'),
        PackagePayoutCycle.WEEKLY,
        'Europe/Berlin',
      ).toISOString(),
    ).toBe('2026-04-01T08:00:00.000Z');
  });
  it('resets the weekly due date after every manual finalized boundary', () => {
    const firstAutomaticBoundary = new Date('2026-07-08T10:00:00.000Z');
    const firstManualBoundary = new Date('2026-07-12T10:00:00.000Z');
    const secondManualBoundary = new Date('2026-07-16T10:00:00.000Z');

    expect(
      nextRestaurantPayoutAt(
        firstAutomaticBoundary,
        PackagePayoutCycle.WEEKLY,
        'Europe/Berlin',
      ).toISOString(),
    ).toBe('2026-07-15T10:00:00.000Z');
    expect(
      nextRestaurantPayoutAt(
        firstManualBoundary,
        PackagePayoutCycle.WEEKLY,
        'Europe/Berlin',
      ).toISOString(),
    ).toBe('2026-07-19T10:00:00.000Z');
    expect(
      nextRestaurantPayoutAt(
        secondManualBoundary,
        PackagePayoutCycle.WEEKLY,
        'Europe/Berlin',
      ).toISOString(),
    ).toBe('2026-07-23T10:00:00.000Z');
  });
});
