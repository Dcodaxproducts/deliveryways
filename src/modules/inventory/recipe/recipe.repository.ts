import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../database';
import { PrismaTx } from '../../../common/types';
import { ListRecipesDto } from './dto';

@Injectable()
export class RecipeRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaTx | PrismaClient {
    return tx ?? this.prisma;
  }

  async upsert(
    menuItemId: string,
    inventoryItemId: string,
    quantity: Prisma.Decimal,
    tx?: PrismaTx,
  ) {
    return this.client(tx).menuItemRecipe.upsert({
      where: { menuItemId_inventoryItemId: { menuItemId, inventoryItemId } },
      update: { quantity },
      create: { menuItemId, inventoryItemId, quantity },
    });
  }

  async list(query: ListRecipesDto) {
    const where: Prisma.MenuItemRecipeWhereInput = {
      ...(query.menuItemId ? { menuItemId: query.menuItemId } : {}),
      ...(query.inventoryItemId
        ? { inventoryItemId: query.inventoryItemId }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.menuItemRecipe.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          menuItem: { select: { id: true, name: true } },
          inventoryItem: { select: { id: true, name: true, unit: true } },
        },
      }),
      this.prisma.menuItemRecipe.count({ where }),
    ]);

    return { items, total };
  }

  async findById(id: string) {
    return this.prisma.menuItemRecipe.findUnique({ where: { id } });
  }

  async remove(id: string, tx?: PrismaTx) {
    return this.client(tx).menuItemRecipe.delete({ where: { id } });
  }
}
