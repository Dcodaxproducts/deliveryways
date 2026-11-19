import {
  PackageBillingModel,
  PackageCommissionType,
  PackagePayoutCycle,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database';
import {
  type MonthlyPayoutAllocationInput,
  PackagePlansRepository,
} from './package-plans.repository';

const integrationUrl = process.env.POSTGRES_INTEGRATION_URL;
const describePostgres = integrationUrl ? describe : describe.skip;

describePostgres('PackagePlansRepository PostgreSQL payout ledger', () => {
  let prisma: PrismaService;
  let repository: PackagePlansRepository;
  const suffix = Date.now().toString(36);
  const tenantSlug = `payout-ledger-tenant-${suffix}`;
  const restaurantSlug = `payout-ledger-restaurant-${suffix}`;
  let tenantId: string;
  let restaurantId: string;
  let packagePlanId: string;
  let subscriptionId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = integrationUrl;
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PackagePlansRepository(prisma);

    const tenant = await prisma.tenant.create({
      data: { name: 'Payout ledger integration tenant', slug: tenantSlug },
    });
    tenantId = tenant.id;
    const restaurant = await prisma.restaurant.create({
      data: {
        tenantId,
        name: 'Payout ledger integration restaurant',
        slug: restaurantSlug,
        subdomain: restaurantSlug,
      },
    });
    restaurantId = restaurant.id;
    const plan = await prisma.packagePlan.create({
      data: {
        name: 'Payout ledger integration plan',
        billingModel: PackageBillingModel.HYBRID,
        planPrice: new Prisma.Decimal(160),
        commissionType: PackageCommissionType.PERCENTAGE,
        commissionPercentage: new Prisma.Decimal(5),
        commissionCapAmount: new Prisma.Decimal(100),
        payoutCycle: PackagePayoutCycle.WEEKLY,
      },
    });
    packagePlanId = plan.id;
    const subscription = await prisma.tenantSubscription.create({
      data: { tenantId, restaurantId, packagePlanId },
    });
    subscriptionId = subscription.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.restaurantPayoutAllocation.deleteMany({
      where: { ledger: { subscriptionId } },
    });
    await prisma.restaurantPayoutMonthlyLedger.deleteMany({
      where: { subscriptionId },
    });
    await prisma.tenantSubscription.deleteMany({
      where: { id: subscriptionId },
    });
    await prisma.packagePlan.deleteMany({ where: { id: packagePlanId } });
    await prisma.restaurant.deleteMany({ where: { id: restaurantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  const allocation = (
    sourceKey: string,
    overrides: Partial<MonthlyPayoutAllocationInput> = {},
  ): MonthlyPayoutAllocationInput => ({
    tenantId,
    restaurantId,
    subscriptionId,
    localMonth: '2026-11',
    timezone: 'UTC',
    currency: 'EUR',
    sourceKey,
    grossCommissionableAmount: new Prisma.Decimal(1000),
    commissionableOrderCount: 1,
    availablePayoutAmount: new Prisma.Decimal(1000),
    availableForMonthlyFeeAmount: new Prisma.Decimal(1000),
    packagePlanId,
    billingModel: PackageBillingModel.HYBRID,
    commissionType: PackageCommissionType.PERCENTAGE,
    commissionCapAmount: new Prisma.Decimal(100),
    commissionPercentage: new Prisma.Decimal(5),
    commissionFixedAmount: new Prisma.Decimal(0),
    vatPercentage: new Prisma.Decimal(0),
    monthlyFeeAmount: new Prisma.Decimal(160),
    payoutCycle: PackagePayoutCycle.WEEKLY,
    payoutOpportunities: 4,
    snapshotHash: sourceKey.padEnd(64, '0').slice(0, 64),
    expectedCommissionAmount: new Prisma.Decimal(50),
    expectedMonthlyFeeAmount: new Prisma.Decimal(40),
    ...overrides,
  });

  it('accepts fee and cap reductions below allocated values with zero further charge', async () => {
    const first = await repository.allocateMonthlyPayout(
      allocation(`postgres-first-${suffix}`),
    );
    expect(first.commissionAmount.toFixed(2)).toBe('50.00');
    expect(first.monthlyFeeAmount.toFixed(2)).toBe('40.00');

    const reduced = await repository.allocateMonthlyPayout(
      allocation(`postgres-reduced-${suffix}`, {
        commissionCapAmount: new Prisma.Decimal(10),
        monthlyFeeAmount: new Prisma.Decimal(20),
        expectedCommissionAmount: new Prisma.Decimal(0),
        expectedMonthlyFeeAmount: new Prisma.Decimal(0),
      }),
    );
    expect(reduced.commissionAmount.toFixed(2)).toBe('0.00');
    expect(reduced.monthlyFeeAmount.toFixed(2)).toBe('0.00');

    const ledger = await prisma.restaurantPayoutMonthlyLedger.findUniqueOrThrow(
      {
        where: {
          restaurantId_subscriptionId_localMonth: {
            restaurantId,
            subscriptionId,
            localMonth: '2026-11',
          },
        },
        include: { allocations: { orderBy: { sequence: 'asc' } } },
      },
    );
    expect(ledger.commissionCapAmount?.toFixed(2)).toBe('50.00');
    expect(ledger.commissionAllocatedAmount.toFixed(2)).toBe('50.00');
    expect(ledger.monthlyFeeAmount.toFixed(2)).toBe('40.00');
    expect(ledger.monthlyFeeAllocatedAmount.toFixed(2)).toBe('40.00');
    expect(ledger.monthlyFeeOutstandingAmount.toFixed(2)).toBe('0.00');
    expect(
      ledger.allocations.map((item) => item.commissionAmount.toFixed(2)),
    ).toEqual(['50.00', '0.00']);
    expect(
      ledger.allocations.map((item) => item.monthlyFeeAmount.toFixed(2)),
    ).toEqual(['40.00', '0.00']);
  });
});
