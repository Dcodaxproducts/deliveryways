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

  async list(query: QueryDto, withDeleted = false) {
    const where: Prisma.TenantWhereInput = {
      ...(withDeleted ? {} : { deletedAt: null }),
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
    const [restaurantsCount, branchesCount, activeUsers] = await this.prisma.$transaction([
      this.prisma.restaurant.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.branch.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.user.count({ where: { tenantId, deletedAt: null, isActive: true } }),
    ]);

    return {
      restaurantsCount,
      branchesCount,
      activeUsers,
    };
  }
}
