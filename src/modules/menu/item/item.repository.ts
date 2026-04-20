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

  async findByRestaurantAndSlug(
    restaurantId: string,
    slug: string,
    excludeId?: string,
  ) {
    return this.prisma.menuItem.findFirst({
      where: {
        restaurantId,
        slug,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, deletedAt: true },
    });
  }

  async findByRestaurantAndSku(
    restaurantId: string,
    sku: string,
    excludeId?: string,
  ) {
    return this.prisma.menuItem.findFirst({
      where: {
        restaurantId,
        sku,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, deletedAt: true },
    });
  }

  async list(restaurantId: string | undefined, query: ListMenuItemsDto) {
    const where: Prisma.MenuItemWhereInput = {
      ...(restaurantId ? { restaurantId } : {}),
      deletedAt: null,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.menuId || query.menu_id
        ? {
            OR: [
              {
                menuLinks: {
                  some: {
                    restaurantMenuId: query.menuId ?? query.menu_id,
                    ...(query.includeInactive ? {} : { isActive: true }),
                  },
                },
              },
              {
                category: {
                  menuLinks: {
                    some: {
                      restaurantMenuId: query.menuId ?? query.menu_id,
                    },
                  },
                },
              },
            ],
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
          restaurant: {
            select: {
              id: true,
              name: true,
              slug: true,
              logoUrl: true,
              coverImage: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
              imageUrl: true,
              menuLinks: {
                orderBy: [{ sortOrder: 'asc' }],
                include: {
                  restaurantMenu: {
                    select: {
                      id: true,
                      name: true,
                      slug: true,
                      isActive: true,
                    },
                  },
                },
              },
              modifierLinks: {
                orderBy: [{ sortOrder: 'asc' }],
                include: {
                  modifierGroup: {
                    include: {
                      modifiers: {
                        where: { deletedAt: null, isActive: true },
                        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
                      },
                    },
                  },
                },
              },
            },
          },
          menuLinks: {
            where: { ...(query.includeInactive ? {} : { isActive: true }) },
            orderBy: [{ sortOrder: 'asc' }],
            include: {
              restaurantMenu: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  isActive: true,
                },
              },
            },
          },
          variations: {
            where: { deletedAt: null },
            orderBy: { sortOrder: 'asc' },
          },
          modifierLinks: {
            orderBy: [{ sortOrder: 'asc' }],
            include: {
              modifierGroup: {
                include: {
                  modifiers: {
                    where: { deletedAt: null },
                    include: {
                      itemPriceOverrides: true,
                    },
                    orderBy: { sortOrder: 'asc' },
                  },
                },
              },
            },
          },
          _count: {
            select: {
              variations: true,
              modifierLinks: true,
              menuLinks: true,
            },
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

  countOrderItems(menuItemId: string, tx?: PrismaTx) {
    return this.client(tx).orderItem.count({
      where: { menuItemId },
    });
  }

  deleteMenuLinks(menuItemId: string, tx?: PrismaTx) {
    return this.client(tx).restaurantMenuItem.deleteMany({
      where: { menuItemId },
    });
  }

  deleteVariations(menuItemId: string, tx?: PrismaTx) {
    return this.client(tx).menuItemVariation.deleteMany({
      where: { menuItemId },
    });
  }

  deleteModifierLinks(menuItemId: string, tx?: PrismaTx) {
    return this.client(tx).menuItemModifierGroup.deleteMany({
      where: { menuItemId },
    });
  }

  deleteBranchOverrides(menuItemId: string, tx?: PrismaTx) {
    return this.client(tx).branchMenuItemOverride.deleteMany({
      where: { menuItemId },
    });
  }

  deleteRecipes(menuItemId: string, tx?: PrismaTx) {
    return this.client(tx).menuItemRecipe.deleteMany({
      where: { menuItemId },
    });
  }

  clearCouponScopes(menuItemId: string, tx?: PrismaTx) {
    return this.client(tx).coupon.updateMany({
      where: { scopeMenuItemId: menuItemId },
      data: { scopeMenuItemId: null },
    });
  }

  hardDelete(id: string, tx?: PrismaTx) {
    return this.client(tx).menuItem.delete({ where: { id } });
  }
}
