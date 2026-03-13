import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../database';
import { QueryDto } from '../../common/dto';
import { PrismaTx } from '../../common/types';

@Injectable()
export class TenantsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaClient | PrismaTx {
    return tx ?? this.prisma;
  }

  async create(data: Prisma.TenantCreateInput, tx?: PrismaTx) {
    return this.client(tx).tenant.create({ data });
  }

  async findBySlug(slug: string) {
    return this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, slug: true },
    });
  }

  async findById(id: string) {
    return this.prisma.tenant.findUnique({
      where: { id },
      select: { id: true, slug: true, isActive: true, deletedAt: true },
    });
  }

  async list(query: QueryDto, withDeleted = false, includeInactive = false) {
    const where: Prisma.TenantWhereInput = {
      ...(withDeleted ? {} : { deletedAt: null }),
      ...(includeInactive ? {} : { isActive: true }),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { slug: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenant.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: {
          [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc',
        },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return { items, total };
  }

  async update(id: string, data: Prisma.TenantUpdateInput, tx?: PrismaTx) {
    return this.client(tx).tenant.update({
      where: { id },
      data,
    });
  }

  async analytics(tenantId: string) {
    const [restaurantsCount, branchesCount, activeUsers] =
      await this.prisma.$transaction([
        this.prisma.restaurant.count({ where: { tenantId, deletedAt: null } }),
        this.prisma.branch.count({ where: { tenantId, deletedAt: null } }),
        this.prisma.user.count({
          where: { tenantId, deletedAt: null, isActive: true },
        }),
      ]);

    return {
      restaurantsCount,
      branchesCount,
      activeUsers,
    };
  }

  async getDeleteSummary(tenantId: string) {
    const [restaurants, branches, users, orders, coupons, transactions] =
      await this.prisma.$transaction([
        this.prisma.restaurant.count({ where: { tenantId } }),
        this.prisma.branch.count({ where: { tenantId } }),
        this.prisma.user.count({ where: { tenantId } }),
        this.prisma.order.count({ where: { tenantId } }),
        this.prisma.coupon.count({ where: { tenantId } }),
        this.prisma.paymentTransaction.count({ where: { tenantId } }),
      ]);

    return {
      restaurants,
      branches,
      users,
      orders,
      coupons,
      transactions,
    };
  }

  async forceDelete(tenantId: string, tx?: PrismaTx) {
    return this.client(tx).tenant.delete({
      where: { id: tenantId },
    });
  }
}
