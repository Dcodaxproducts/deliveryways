import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../database';
import { PrismaTx } from '../../../common/types';
import { ListInventoryCategoriesDto } from './dto';

@Injectable()
export class InventoryCategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaTx | PrismaClient {
    return tx ?? this.prisma;
  }

  async create(data: Prisma.InventoryCategoryCreateInput, tx?: PrismaTx) {
    return this.client(tx).inventoryCategory.create({ data });
  }

  async findById(id: string) {
    return this.prisma.inventoryCategory.findUnique({ where: { id } });
  }

  async list(
    restaurantId: string | undefined,
    query: ListInventoryCategoriesDto,
  ) {
    const where: Prisma.InventoryCategoryWhereInput = {
      ...(restaurantId ? { restaurantId } : {}),
      deletedAt: null,
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.inventoryCategory.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: {
          [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc',
        },
        include: { _count: { select: { items: true } } },
      }),
      this.prisma.inventoryCategory.count({ where }),
    ]);

    return { items, total };
  }

  async update(
    id: string,
    data: Prisma.InventoryCategoryUpdateInput,
    tx?: PrismaTx,
  ) {
    return this.client(tx).inventoryCategory.update({ where: { id }, data });
  }

  async softDelete(id: string, tx?: PrismaTx) {
    return this.client(tx).inventoryCategory.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }
}
