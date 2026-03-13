import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../database';
import { PrismaTx } from '../../../common/types';
import { ListMenuCategoriesDto } from './dto';

@Injectable()
export class MenuCategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaTx | PrismaClient {
    return tx ?? this.prisma;
  }

  async create(data: Prisma.MenuCategoryCreateInput, tx?: PrismaTx) {
    return this.client(tx).menuCategory.create({ data });
  }

  async createMany(data: Prisma.MenuCategoryCreateManyInput[]) {
    return this.prisma.menuCategory.createMany({ data });
  }

  async findById(id: string) {
    return this.prisma.menuCategory.findUnique({ where: { id } });
  }

  async list(restaurantId: string | undefined, query: ListMenuCategoriesDto) {
    const where: Prisma.MenuCategoryWhereInput = {
      ...(restaurantId ? { restaurantId } : {}),
      deletedAt: null,
      ...(query.menuId
        ? {
            items: {
              some: {
                deletedAt: null,
                ...(query.includeInactive ? {} : { isActive: true }),
                menuLinks: {
                  some: {
                    restaurantMenuId: query.menuId,
                    ...(query.includeInactive ? {} : { isActive: true }),
                  },
                },
              },
            },
          }
        : {}),
      ...(query.includeInactive ? {} : { isActive: true }),
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
      this.prisma.menuCategory.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [
          { sortOrder: 'asc' },
          { [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc' },
        ],
        include: {
          parent: { select: { id: true, name: true } },
          _count: { select: { children: true, items: true } },
        },
      }),
      this.prisma.menuCategory.count({ where }),
    ]);

    return { items, total };
  }

  async update(
    id: string,
    data: Prisma.MenuCategoryUpdateInput,
    tx?: PrismaTx,
  ) {
    return this.client(tx).menuCategory.update({ where: { id }, data });
  }

  async softDelete(id: string, tx?: PrismaTx) {
    return this.client(tx).menuCategory.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }
}
