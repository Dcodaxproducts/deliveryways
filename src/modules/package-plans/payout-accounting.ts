import {
  PackageCommissionType,
  PackagePayoutCycle,
  Prisma,
} from '@prisma/client';

type LocalDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function localDateTimeParts(date: Date, timezone: string): LocalDateTimeParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

function localDateTimeToUtc(parts: LocalDateTimeParts, timezone: string): Date {
  const targetAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  let candidate = new Date(targetAsUtc);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const represented = localDateTimeParts(candidate, timezone);
    const representedAsUtc = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute,
      represented.second,
    );
    candidate = new Date(candidate.getTime() + targetAsUtc - representedAsUtc);
  }
  return candidate;
}

export function nextRestaurantPayoutAt(
  finalizedAt: Date,
  payoutCycle: PackagePayoutCycle,
  timezone: string,
): Date {
  const local = localDateTimeParts(finalizedAt, timezone);
  const localBoundary = new Date(
    Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second,
    ),
  );
  if (payoutCycle === PackagePayoutCycle.MONTHLY) {
    localBoundary.setUTCMonth(localBoundary.getUTCMonth() + 1);
  } else {
    const days =
      payoutCycle === PackagePayoutCycle.DAILY
        ? 1
        : payoutCycle === PackagePayoutCycle.BIWEEKLY
          ? 14
          : 7;
    localBoundary.setUTCDate(localBoundary.getUTCDate() + days);
  }
  return localDateTimeToUtc(
    {
      year: localBoundary.getUTCFullYear(),
      month: localBoundary.getUTCMonth() + 1,
      day: localBoundary.getUTCDate(),
      hour: localBoundary.getUTCHours(),
      minute: localBoundary.getUTCMinutes(),
      second: localBoundary.getUTCSeconds(),
    },
    timezone,
  );
}

export function toRestaurantLocalMonth(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  if (!year || !month) throw new RangeError('Unable to resolve local month');
  return [year, month].join('-');
}

export function allocateMonthlyCommission(input: {
  grossAmount: Prisma.Decimal;
  allocatedBefore: Prisma.Decimal;
  commissionType: PackageCommissionType;
  percentage: Prisma.Decimal;
  fixedAmount: Prisma.Decimal;
  commissionUnits: number;
  capAmount: Prisma.Decimal | null;
}): Prisma.Decimal {
  const calculated =
    input.commissionType === PackageCommissionType.FIXED
      ? input.fixedAmount.mul(input.commissionUnits)
      : input.grossAmount.mul(input.percentage).div(100);
  const remainingCap =
    input.capAmount === null
      ? calculated
      : Prisma.Decimal.max(
          input.capAmount.minus(input.allocatedBefore),
          new Prisma.Decimal(0),
        );

  return Prisma.Decimal.min(
    calculated,
    remainingCap,
    input.grossAmount,
  ).toDecimalPlaces(2);
}

export function monthlyFeeInstallment(
  monthlyFee: Prisma.Decimal,
  payoutSequence: number,
): Prisma.Decimal {
  if (payoutSequence < 1 || payoutSequence > 4) {
    return new Prisma.Decimal(0);
  }

  const totalCents = monthlyFee
    .mul(100)
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
  const baseCents = totalCents.dividedToIntegerBy(4);
  const remainderCents = totalCents.modulo(4).toNumber();

  return baseCents.plus(payoutSequence <= remainderCents ? 1 : 0).div(100);
}

export function allocateMonthlyFee(input: {
  payoutSequence: number;
  allocatedBefore: Prisma.Decimal;
  availableAfterOtherDeductions: Prisma.Decimal;
  monthlyFee: Prisma.Decimal;
}): Prisma.Decimal {
  const outstanding = Prisma.Decimal.max(
    input.monthlyFee.minus(input.allocatedBefore),
    0,
  );
  const scheduled =
    input.payoutSequence <= 4
      ? Prisma.Decimal.min(
          monthlyFeeInstallment(input.monthlyFee, input.payoutSequence),
          outstanding,
        )
      : outstanding;

  return Prisma.Decimal.min(
    scheduled,
    Prisma.Decimal.max(input.availableAfterOtherDeductions, 0),
  ).toDecimalPlaces(2);
}
