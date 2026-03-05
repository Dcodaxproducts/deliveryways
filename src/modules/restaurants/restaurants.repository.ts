import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../database';
import { QueryDto } from '../../common/dto';
import { PrismaTx } from '../../common/types';

@Injectable()
export class RestaurantsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaClient | PrismaTx {
    return tx ?? this.prisma;
  }

  async create(data: Prisma.RestaurantCreateInput, tx?: PrismaTx) {
    return this.client(tx).restaurant.create({ data });
  }

  async findBySlug(slug: string) {
    return this.prisma.restaurant.findUnique({
      where: { slug },
      select: { id: true, slug: true },
    });
  }

  async listByTenant(
    tenantId: string,
    query: QueryDto,
    publicView = false,
    withDeleted = false,
  ) {
    const where: Prisma.RestaurantWhereInput = {
      tenantId,
      ...(withDeleted ? {} : { deletedAt: null }),
      ...(publicView ? { isActive: true, deletedAt: null } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { slug: { contains: query.search, mode: 'insensitive' } },
              { customDomain: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.restaurant.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: {
          [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc',
        },
      }),
      this.prisma.restaurant.count({ where }),
    ]);

    return { items, total };
  }

  async findTenantIdByRestaurant(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { tenantId: true },
    });

    return restaurant?.tenantId;
  }

  async update(id: string, data: Prisma.RestaurantUpdateInput, tx?: PrismaTx) {
    return this.client(tx).restaurant.update({
      where: { id },
      data,
    });
  }

  async softDelete(id: string, tx?: PrismaTx) {
    const client = this.client(tx);
    const deletedAt = new Date();

    await client.branch.updateMany({
      where: { restaurantId: id, deletedAt: null },
      data: { deletedAt, isActive: false },
    });

    return client.restaurant.update({
      where: { id },
      data: {
        deletedAt,
        isActive: false,
      },
    });
  }
}
