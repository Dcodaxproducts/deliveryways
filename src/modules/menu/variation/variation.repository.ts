import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../database';
import { PrismaTx } from '../../../common/types';
import { ListMenuVariationsDto } from './dto';

@Injectable()
export class MenuVariationRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaTx | PrismaClient {
    return tx ?? this.prisma;
  }

  async create(data: Prisma.MenuItemVariationCreateInput, tx?: PrismaTx) {
    return this.client(tx).menuItemVariation.create({ data });
  }

  async findById(id: string) {
    return this.prisma.menuItemVariation.findUnique({ where: { id } });
  }

  async list(query: ListMenuVariationsDto) {
    const where: Prisma.MenuItemVariationWhereInput = {
      menuItemId: query.menuItemId,
      deletedAt: null,
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.menuItemVariation.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.menuItemVariation.count({ where }),
    ]);

    return { items, total };
  }

  async resetDefaults(menuItemId: string, tx?: PrismaTx) {
    return this.client(tx).menuItemVariation.updateMany({
      where: { menuItemId },
      data: { isDefault: false },
    });
  }

  async update(id: string, data: Prisma.MenuItemVariationUpdateInput, tx?: PrismaTx) {
    return this.client(tx).menuItemVariation.update({ where: { id }, data });
  }

  async softDelete(id: string, tx?: PrismaTx) {
    return this.client(tx).menuItemVariation.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, isDefault: false },
    });
  }
}
