import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  BillingInterval,
  PackageBillingModel,
  Prisma,
  SubscriptionStatus,
} from '@prisma/client';
import { PackagePlansService } from './package-plans.service';

describe('PackagePlansService', () => {
  const superAdmin = { uid: 'admin-1', role: 'SUPER_ADMIN' } as never;

  const makePlan = (overrides: Record<string, unknown> = {}) => ({
    id: 'plan-1',
    tenantId: null,
    name: 'Hybrid Growth',
    description: null,
    billingModel: PackageBillingModel.HYBRID,
    billingInterval: BillingInterval.MONTHLY,
    planPrice: new Prisma.Decimal(5000),
    commissionPercentage: new Prisma.Decimal(5),
    currency: 'PKR',
    trialDays: 0,
    features: null,
    isActive: true,
    isDefault: false,
    deletedAt: null,
    createdAt: new Date('2026-04-27T00:00:00.000Z'),
    updatedAt: new Date('2026-04-27T00:00:00.000Z'),
    ...overrides,
  });

  it('creates hybrid package plan with fixed fee and commission', async () => {
    const repository = {
      createPlan: jest.fn().mockResolvedValue(makePlan()),
    };
    const service = new PackagePlansService(repository as never);

    const result = await service.createPlan(superAdmin, {
      name: 'Hybrid Growth',
      billingModel: PackageBillingModel.HYBRID,
      planPrice: 5000,
      commissionPercentage: 5,
    });

    expect(repository.createPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        billingModel: PackageBillingModel.HYBRID,
        planPrice: new Prisma.Decimal(5000),
        commissionPercentage: new Prisma.Decimal(5),
      }),
    );
    expect(result.message).toBe('Package plan created successfully');
  });

  it('rejects commission plan with fixed plan price', async () => {
    const service = new PackagePlansService({} as never);

    await expect(
      service.createPlan(superAdmin, {
        name: 'Commission Only',
        billingModel: PackageBillingModel.COMMISSION,
        planPrice: 1000,
        commissionPercentage: 8,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects non-super-admin package management', async () => {
    const service = new PackagePlansService({} as never);

    await expect(
      service.listPlans(
        { uid: 'business-1', role: 'BUSINESS_ADMIN' } as never,
        { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'DESC' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('cancels existing active subscription when assigning a new package', async () => {
    const repository = {
      findTenantById: jest.fn().mockResolvedValue({ id: 'tenant-1' }),
      findPlanById: jest.fn().mockResolvedValue(makePlan()),
      findActiveSubscription: jest.fn().mockResolvedValue({ id: 'sub-old' }),
      updateSubscription: jest.fn().mockResolvedValue({ id: 'sub-old' }),
      createSubscription: jest.fn().mockResolvedValue({ id: 'sub-new' }),
    };
    const service = new PackagePlansService(repository as never);

    const result = await service.assignSubscription(superAdmin, {
      tenantId: 'tenant-1',
      packagePlanId: 'plan-1',
    });

    expect(repository.updateSubscription).toHaveBeenCalledWith(
      'sub-old',
      expect.objectContaining({ status: SubscriptionStatus.CANCELLED }),
    );
    expect(repository.createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant: { connect: { id: 'tenant-1' } },
        packagePlan: { connect: { id: 'plan-1' } },
      }),
    );
    expect(result.message).toBe('Tenant subscription assigned successfully');
  });
});
