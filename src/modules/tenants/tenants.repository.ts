import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database';
import { QueryDto } from '../../common/dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class TenantsRepository {
  constructor(private readonly prisma: PrismaService) {}

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

  async update(id: string, data: Prisma.TenantUpdateInput) {
    return this.prisma.tenant.update({
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
