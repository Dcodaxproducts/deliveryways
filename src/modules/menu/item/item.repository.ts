import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../database';
import { PrismaTx } from '../../../common/types';
import { ListMenuItemsDto } from './dto';

@Injectable()
export class MenuItemRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaTx | PrismaClient {
    return tx ?? this.prisma;
  }

  async create(data: Prisma.MenuItemCreateInput, tx?: PrismaTx) {
    return this.client(tx).menuItem.create({ data });
  }

  async createMany(data: Prisma.MenuItemCreateManyInput[]) {
    return this.prisma.menuItem.createMany({ data });
  }

  async findById(id: string) {
    return this.prisma.menuItem.findUnique({ where: { id } });
  }

  async list(restaurantId: string | undefined, query: ListMenuItemsDto) {
    const where: Prisma.MenuItemWhereInput = {
      ...(restaurantId ? { restaurantId } : {}),
      deletedAt: null,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.menuId
        ? {
            menuLinks: {
              some: {
                restaurantMenuId: query.menuId,
                ...(query.includeInactive ? {} : { isActive: true }),
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
              { sku: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.menuItem.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: {
          [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc',
        },
        include: {
          category: { select: { id: true, name: true } },
          variations: {
            where: { deletedAt: null },
            orderBy: { sortOrder: 'asc' },
          },
        },
      }),
      this.prisma.menuItem.count({ where }),
    ]);

    return { items, total };
  }

  async update(id: string, data: Prisma.MenuItemUpdateInput, tx?: PrismaTx) {
    return this.client(tx).menuItem.update({ where: { id }, data });
  }

  async softDelete(id: string, tx?: PrismaTx) {
    return this.client(tx).menuItem.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }
}
