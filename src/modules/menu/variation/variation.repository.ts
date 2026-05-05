import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../database';
import { PrismaTx } from '../../../common/types';
import { ListMenuVariationsDto } from './dto';

@Injectable()
export class MenuVariationRepository {
  constructor(private readonly prisma: PrismaService) {}

  private readonly include = {
    categoryLinks: {
      include: {
        category: {
          select: { id: true, name: true, slug: true },
        },
      },
      orderBy: [{ sortOrder: 'asc' }],
    },
    modifierPriceOverrides: {
      where: { menuItemId: null },
      include: {
        modifier: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ modifierId: 'asc' }],
    },
  } satisfies Prisma.MenuItemVariationInclude;

  private client(tx?: PrismaTx): PrismaTx | PrismaClient {
    return tx ?? this.prisma;
  }

  async create(data: Prisma.MenuItemVariationCreateInput, tx?: PrismaTx) {
    return this.client(tx).menuItemVariation.create({
      data,
      include: this.include,
    });
  }

  async findById(id: string) {
    return this.prisma.menuItemVariation.findUnique({
      where: { id },
      include: this.include,
    });
  }

  async list(restaurantId: string | undefined, query: ListMenuVariationsDto) {
    const where: Prisma.MenuItemVariationWhereInput = {
      ...(restaurantId ? { restaurantId } : {}),
      deletedAt: null,
      ...(query.categoryId
        ? { categoryLinks: { some: { categoryId: query.categoryId } } }
        : {}),
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };

    const orderBy: Prisma.MenuItemVariationOrderByWithRelationInput[] =
      query.categoryId
        ? [
            { categoryLinks: { _count: 'desc' } },
            { sortOrder: 'asc' },
            { createdAt: 'desc' },
          ]
        : [{ sortOrder: 'asc' }, { createdAt: 'desc' }];

    const [items, total] = await this.prisma.$transaction([
      this.prisma.menuItemVariation.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy,
        include: this.include,
      }),
      this.prisma.menuItemVariation.count({ where }),
    ]);

    return { items, total };
  }

  async resetDefaults(categoryId: string, tx?: PrismaTx) {
    return this.client(tx).menuCategoryVariation.updateMany({
      where: { categoryId },
      data: { isDefault: false },
    });
  }

  async update(
    id: string,
    data: Prisma.MenuItemVariationUpdateInput,
    tx?: PrismaTx,
  ) {
    return this.client(tx).menuItemVariation.update({
      where: { id },
      data,
      include: this.include,
    });
  }

  async softDelete(id: string, tx?: PrismaTx) {
    return this.client(tx).menuItemVariation.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, isDefault: false },
      include: this.include,
    });
  }
}
