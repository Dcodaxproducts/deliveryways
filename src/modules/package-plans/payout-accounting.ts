import { Prisma } from '@prisma/client';

export const PAYOUT_COMMISSION_RATE = new Prisma.Decimal(5);
export const PAYOUT_COMMISSION_MONTHLY_CAP = new Prisma.Decimal(79);
export const PAYOUT_MONTHLY_FEE = new Prisma.Decimal(159);
export const PAYOUT_MONTHLY_FEE_INSTALLMENT = new Prisma.Decimal('39.75');

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
  capAmount?: Prisma.Decimal;
  percentage?: Prisma.Decimal;
}): Prisma.Decimal {
  const cap = input.capAmount ?? PAYOUT_COMMISSION_MONTHLY_CAP;
  const percentage = input.percentage ?? PAYOUT_COMMISSION_RATE;
  const remaining = Prisma.Decimal.max(cap.minus(input.allocatedBefore), 0);
  return Prisma.Decimal.min(
    input.grossAmount.mul(percentage).div(100),
    remaining,
    input.grossAmount,
  ).toDecimalPlaces(2);
}

export function allocateMonthlyFee(input: {
  payoutSequence: number;
  allocatedBefore: Prisma.Decimal;
  availableAfterOtherDeductions: Prisma.Decimal;
  monthlyFee?: Prisma.Decimal;
}): Prisma.Decimal {
  const monthlyFee = input.monthlyFee ?? PAYOUT_MONTHLY_FEE;
  const outstanding = Prisma.Decimal.max(
    monthlyFee.minus(input.allocatedBefore),
    0,
  );
  const scheduled =
    input.payoutSequence <= 4
      ? Prisma.Decimal.min(PAYOUT_MONTHLY_FEE_INSTALLMENT, outstanding)
      : outstanding;
  return Prisma.Decimal.min(
    scheduled,
    Prisma.Decimal.max(input.availableAfterOtherDeductions, 0),
  ).toDecimalPlaces(2);
}
