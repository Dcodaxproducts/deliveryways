import { Injectable } from '@nestjs/common';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../database';
import { ListPackagePlansDto, ListTenantSubscriptionsDto } from './dto';

@Injectable()
export class PackagePlansRepository {
  constructor(private readonly prisma: PrismaService) {}

  createPlan(data: Prisma.PackagePlanCreateInput) {
    return this.prisma.packagePlan.create({ data });
  }

  updatePlan(id: string, data: Prisma.PackagePlanUpdateInput) {
    return this.prisma.packagePlan.update({ where: { id }, data });
  }

  findPlanById(id: string) {
    return this.prisma.packagePlan.findFirst({
      where: { id, deletedAt: null },
    });
  }

  async listPlans(query: ListPackagePlansDto) {
    const where: Prisma.PackagePlanWhereInput = {
      ...(query.withDeleted ? {} : { deletedAt: null }),
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.billingModel ? { billingModel: query.billingModel } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              {
                description: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.packagePlan.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: {
          [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc',
        },
      }),
      this.prisma.packagePlan.count({ where }),
    ]);

    return { items, total };
  }

  clearDefaultPlans(exceptPlanId?: string) {
    return this.prisma.packagePlan.updateMany({
      where: {
        isDefault: true,
        ...(exceptPlanId ? { id: { not: exceptPlanId } } : {}),
      },
      data: { isDefault: false },
    });
  }

  findTenantById(id: string) {
    return this.prisma.tenant.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
  }

  findRestaurantById(id: string, tenantId: string) {
    return this.prisma.restaurant.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
  }

  findActiveSubscription(tenantId: string, restaurantId?: string | null) {
    return this.prisma.tenantSubscription.findFirst({
      where: {
        tenantId,
        restaurantId: restaurantId ?? null,
        status: {
          in: [SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE],
        },
      },
      include: this.subscriptionInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  createSubscription(data: Prisma.TenantSubscriptionCreateInput) {
    return this.prisma.tenantSubscription.create({
      data,
      include: this.subscriptionInclude,
    });
  }

  updateSubscription(id: string, data: Prisma.TenantSubscriptionUpdateInput) {
    return this.prisma.tenantSubscription.update({
      where: { id },
      data,
      include: this.subscriptionInclude,
    });
  }

  findSubscriptionById(id: string) {
    return this.prisma.tenantSubscription.findUnique({
      where: { id },
      include: this.subscriptionInclude,
    });
  }

  async listSubscriptions(query: ListTenantSubscriptionsDto) {
    const where: Prisma.TenantSubscriptionWhereInput = {
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(query.restaurantId ? { restaurantId: query.restaurantId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              {
                tenant: {
                  name: { contains: query.search, mode: 'insensitive' },
                },
              },
              {
                restaurant: {
                  name: { contains: query.search, mode: 'insensitive' },
                },
              },
              {
                packagePlan: {
                  name: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenantSubscription.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: {
          [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc',
        },
        include: this.subscriptionInclude,
      }),
      this.prisma.tenantSubscription.count({ where }),
    ]);

    return { items, total };
  }

  countActiveSubscriptionsByPlan(packagePlanId: string) {
    return this.prisma.tenantSubscription.count({
      where: {
        packagePlanId,
        status: {
          in: [SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE],
        },
      },
    });
  }

  private readonly subscriptionInclude = {
    tenant: { select: { id: true, name: true, slug: true } },
    restaurant: {
      select: {
        id: true,
        name: true,
        slug: true,
        supportContact: true,
        settings: true,
      },
    },
    packagePlan: true,
  } satisfies Prisma.TenantSubscriptionInclude;
}
