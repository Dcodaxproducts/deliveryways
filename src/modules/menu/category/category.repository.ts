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

  async findDetailById(id: string) {
    return this.prisma.menuCategory.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        children: {
          where: { deletedAt: null },
          select: {
            id: true,
            name: true,
            slug: true,
            sortOrder: true,
            isActive: true,
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
        items: {
          where: { deletedAt: null },
          select: {
            id: true,
            name: true,
            slug: true,
            imageUrl: true,
            pricingMode: true,
            basePrice: true,
            isActive: true,
          },
          orderBy: [{ createdAt: 'asc' }],
        },
        variations: {
          where: { deletedAt: null },
          include: { itemPriceOverrides: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
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
                modifierLinks: {
                  where: {
                    modifier: { deletedAt: null, isActive: true },
                  },
                  orderBy: [
                    { sortOrder: 'asc' },
                    { modifier: { createdAt: 'asc' } },
                  ],
                  include: {
                    modifier: true,
                  },
                },
              },
            },
          },
        },
        _count: { select: { children: true, items: true } },
      },
    });
  }

  async findByRestaurantAndSlug(
    restaurantId: string,
    slug: string,
    excludeId?: string,
  ) {
    return this.prisma.menuCategory.findFirst({
      where: {
        restaurantId,
        slug,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, deletedAt: true },
    });
  }

  async list(restaurantId: string | undefined, query: ListMenuCategoriesDto) {
    const where: Prisma.MenuCategoryWhereInput = {
      ...(restaurantId ? { restaurantId } : {}),
      deletedAt: null,
      ...(query.menuId || query.menu_id
        ? {
            OR: [
              {
                menuLinks: {
                  some: {
                    restaurantMenuId: query.menuId ?? query.menu_id,
                  },
                },
              },
              {
                items: {
                  some: {
                    deletedAt: null,
                    ...(query.includeInactive ? {} : { isActive: true }),
                    menuLinks: {
                      some: {
                        restaurantMenuId: query.menuId ?? query.menu_id,
                        ...(query.includeInactive ? {} : { isActive: true }),
                      },
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
                  modifierLinks: {
                    where: {
                      modifier: { deletedAt: null, isActive: true },
                    },
                    orderBy: [
                      { sortOrder: 'asc' },
                      { modifier: { createdAt: 'asc' } },
                    ],
                    include: {
                      modifier: true,
                    },
                  },
                },
              },
            },
          },
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

  countChildren(categoryId: string, tx?: PrismaTx) {
    return this.client(tx).menuCategory.count({
      where: { parentCategoryId: categoryId },
    });
  }

  countItems(categoryId: string, tx?: PrismaTx) {
    return this.client(tx).menuItem.count({
      where: { categoryId },
    });
  }

  clearCouponScopes(categoryId: string, tx?: PrismaTx) {
    return this.client(tx).coupon.updateMany({
      where: { scopeCategoryId: categoryId },
      data: { scopeCategoryId: null },
    });
  }

  deleteBranchOverrides(categoryId: string, tx?: PrismaTx) {
    return this.client(tx).branchCategoryOverride.deleteMany({
      where: { menuCategoryId: categoryId },
    });
  }

  deleteVariations(categoryId: string, tx?: PrismaTx) {
    return this.client(tx).menuItemVariation.deleteMany({
      where: { categoryId },
    });
  }

  hardDelete(id: string, tx?: PrismaTx) {
    return this.client(tx).menuCategory.delete({ where: { id } });
  }
}
