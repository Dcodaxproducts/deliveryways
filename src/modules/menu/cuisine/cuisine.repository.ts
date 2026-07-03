import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../database';
import { PrismaTx } from '../../../common/types';
import { ListCuisinesAdminDto } from './dto';

@Injectable()
export class CuisineRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaTx | PrismaClient {
    return tx ?? this.prisma;
  }

  async create(data: Prisma.CuisineCreateInput, tx?: PrismaTx) {
    return this.client(tx).cuisine.create({ data });
  }

  async createMany(data: Prisma.CuisineCreateManyInput[]) {
    return this.prisma.cuisine.createMany({ data });
  }

  async findById(id: string) {
    return this.prisma.cuisine.findUnique({ where: { id } });
  }

  async findDetailById(id: string) {
    return this.prisma.cuisine.findUnique({
      where: { id },
      include: {
        itemLinks: {
          orderBy: [{ sortOrder: 'asc' }],
          include: {
            menuItem: {
              select: {
                id: true,
                name: true,
                slug: true,
                imageUrl: true,
                pricingMode: true,
                basePrice: true,
                isActive: true,
              },
            },
          },
        },
        _count: { select: { itemLinks: true } },
      },
    });
  }

  async findByRestaurantAndSlug(
    restaurantId: string,
    slug: string,
    excludeId?: string,
  ) {
    return this.prisma.cuisine.findFirst({
      where: {
        restaurantId,
        slug,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, deletedAt: true },
    });
  }

  async list(restaurantId: string | undefined, query: ListCuisinesAdminDto) {
    const where: Prisma.CuisineWhereInput = {
      ...(restaurantId ? { restaurantId } : {}),
      deletedAt: null,
      ...this.resolveActiveFilter(query),
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
      this.prisma.cuisine.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [
          { sortOrder: 'asc' },
          { [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc' },
        ],
        include: { _count: { select: { itemLinks: true } } },
      }),
      this.prisma.cuisine.count({ where }),
    ]);

    return { items, total };
  }

  private resolveActiveFilter(query: ListCuisinesAdminDto) {
    if (query.inactive) {
      return { isActive: false };
    }

    if (query.all || query.includeInactive) {
      return {};
    }

    return { isActive: true };
  }

  async update(id: string, data: Prisma.CuisineUpdateInput, tx?: PrismaTx) {
    return this.client(tx).cuisine.update({ where: { id }, data });
  }

  countItems(cuisineId: string, tx?: PrismaTx) {
    return this.client(tx).menuItemCuisine.count({ where: { cuisineId } });
  }

  deleteItemLinks(cuisineId: string, tx?: PrismaTx) {
    return this.client(tx).menuItemCuisine.deleteMany({ where: { cuisineId } });
  }

  hardDelete(id: string, tx?: PrismaTx) {
    return this.client(tx).cuisine.delete({ where: { id } });
  }
}
