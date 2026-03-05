import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database';
import { Prisma } from '@prisma/client';
import { QueryDto } from '../../common/dto';

@Injectable()
export class RestaurantsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.RestaurantCreateInput) {
    return this.prisma.restaurant.create({ data });
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

  async update(id: string, data: Prisma.RestaurantUpdateInput) {
    return this.prisma.restaurant.update({
      where: { id },
      data,
    });
  }

  async softDelete(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const deletedAt = new Date();
      await tx.branch.updateMany({
        where: { restaurantId: id, deletedAt: null },
        data: { deletedAt, isActive: false },
      });

      return tx.restaurant.update({
        where: { id },
        data: {
          deletedAt,
          isActive: false,
        },
      });
    });
  }
}
