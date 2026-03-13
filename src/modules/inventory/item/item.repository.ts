import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../database';
import { PrismaTx } from '../../../common/types';
import { ListInventoryItemsDto } from './dto';

@Injectable()
export class InventoryItemRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaTx | PrismaClient {
    return tx ?? this.prisma;
  }

  async create(data: Prisma.InventoryItemCreateInput, tx?: PrismaTx) {
    return this.client(tx).inventoryItem.create({ data });
  }

  async findById(id: string) {
    return this.prisma.inventoryItem.findUnique({ where: { id } });
  }

  async list(restaurantId: string | undefined, query: ListInventoryItemsDto) {
    const where: Prisma.InventoryItemWhereInput = {
      ...(restaurantId ? { restaurantId } : {}),
      deletedAt: null,
      ...(query.inventoryCategoryId
        ? { inventoryCategoryId: query.inventoryCategoryId }
        : {}),
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { sku: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.inventoryItem.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: {
          [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc',
        },
        include: {
          category: { select: { id: true, name: true } },
        },
      }),
      this.prisma.inventoryItem.count({ where }),
    ]);

    return { items, total };
  }

  async update(
    id: string,
    data: Prisma.InventoryItemUpdateInput,
    tx?: PrismaTx,
  ) {
    return this.client(tx).inventoryItem.update({ where: { id }, data });
  }

  async softDelete(id: string, tx?: PrismaTx) {
    return this.client(tx).inventoryItem.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  async adjustQty(id: string, delta: Prisma.Decimal, tx?: PrismaTx) {
    return this.client(tx).inventoryItem.update({
      where: { id },
      data: { currentQty: { increment: delta } },
    });
  }
}
