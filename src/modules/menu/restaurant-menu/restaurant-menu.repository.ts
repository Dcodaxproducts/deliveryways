import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../database';
import { PrismaTx } from '../../../common/types';
import { ListRestaurantMenuItemsDto, ListRestaurantMenusDto } from './dto';

@Injectable()
export class RestaurantMenuRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaTx | PrismaClient {
    return tx ?? this.prisma;
  }

  async create(data: Prisma.RestaurantMenuCreateInput, tx?: PrismaTx) {
    return this.client(tx).restaurantMenu.create({ data });
  }

  async findById(id: string) {
    return this.prisma.restaurantMenu.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: {
            menuItem: {
              include: {
                category: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                    imageUrl: true,
                    items: {
                      where: {
                        deletedAt: null,
                        isActive: true,
                      },
                      select: {
                        id: true,
                        name: true,
                        slug: true,
                      },
                      orderBy: [{ createdAt: 'asc' }],
                    },
                    variations: {
                      where: { deletedAt: null, isActive: true },
                      include: {
                        itemPriceOverrides: true,
                      },
                      orderBy: { sortOrder: 'asc' },
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
                                modifier: {
                                  include: {
                                    itemPriceOverrides: true,
                                    variationPriceOverrides: true,
                                  },
                                },
                              },
                            },
                          },
                        },
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
                          include: {
                            modifier: {
                              include: {
                                itemPriceOverrides: true,
                                variationPriceOverrides: true,
                              },
                            },
                          },
                          orderBy: [
                            { sortOrder: 'asc' },
                            { modifier: { createdAt: 'asc' } },
                          ],
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        categories: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: {
            menuCategory: {
              select: {
                id: true,
                name: true,
                slug: true,
                imageUrl: true,
                isActive: true,
              },
            },
          },
        },
      },
    });
  }

  async list(restaurantId: string | undefined, query: ListRestaurantMenusDto) {
    const where: Prisma.RestaurantMenuWhereInput = {
      ...(restaurantId ? { restaurantId } : {}),
      deletedAt: null,
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
      this.prisma.restaurantMenu.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [
          { sortOrder: 'asc' },
          { [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc' },
        ],
        include: {
          _count: { select: { items: true, categories: true } },
          items: {
            where: query.includeInactive
              ? undefined
              : {
                  isActive: true,
                  menuItem: {
                    deletedAt: null,
                    isActive: true,
                  },
                },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            include: {
              menuItem: {
                include: {
                  category: {
                    select: {
                      id: true,
                      name: true,
                      slug: true,
                      imageUrl: true,
                      items: {
                        where: {
                          deletedAt: null,
                          isActive: true,
                        },
                        select: {
                          id: true,
                          name: true,
                          slug: true,
                        },
                        orderBy: [{ createdAt: 'asc' }],
                      },
                      variations: {
                        where: { deletedAt: null, isActive: true },
                        include: {
                          itemPriceOverrides: true,
                        },
                        orderBy: { sortOrder: 'asc' },
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
                            include: {
                              modifier: {
                                include: {
                                  itemPriceOverrides: true,
                                  variationPriceOverrides: true,
                                },
                              },
                            },
                            orderBy: [
                              { sortOrder: 'asc' },
                              { modifier: { createdAt: 'asc' } },
                            ],
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          categories: {
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            include: {
              menuCategory: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  imageUrl: true,
                  isActive: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.restaurantMenu.count({ where }),
    ]);

    return { items, total };
  }

  async update(
    id: string,
    data: Prisma.RestaurantMenuUpdateInput,
    tx?: PrismaTx,
  ) {
    return this.client(tx).restaurantMenu.update({ where: { id }, data });
  }

  async softDelete(id: string, tx?: PrismaTx) {
    return this.client(tx).restaurantMenu.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  async attachItem(data: Prisma.RestaurantMenuItemCreateInput, tx?: PrismaTx) {
    return this.client(tx).restaurantMenuItem.create({ data });
  }

  async attachCategory(
    data: Prisma.RestaurantMenuCategoryCreateInput,
    tx?: PrismaTx,
  ) {
    return this.client(tx).restaurantMenuCategory.create({ data });
  }

  async getNextSortOrder(restaurantMenuId: string) {
    const latest = await this.prisma.restaurantMenuItem.findFirst({
      where: { restaurantMenuId },
      orderBy: [{ sortOrder: 'desc' }, { createdAt: 'desc' }],
      select: { sortOrder: true },
    });

    return (latest?.sortOrder ?? -1) + 1;
  }

  async findMenuItemLinkById(id: string) {
    return this.prisma.restaurantMenuItem.findUnique({
      where: { id },
      include: {
        restaurantMenu: true,
        menuItem: true,
      },
    });
  }

  async findMenuItemLink(restaurantMenuId: string, menuItemId: string) {
    return this.prisma.restaurantMenuItem.findUnique({
      where: {
        restaurantMenuId_menuItemId: {
          restaurantMenuId,
          menuItemId,
        },
      },
    });
  }

  async findMenuCategoryLink(restaurantMenuId: string, menuCategoryId: string) {
    return this.prisma.restaurantMenuCategory.findUnique({
      where: {
        restaurantMenuId_menuCategoryId: {
          restaurantMenuId,
          menuCategoryId,
        },
      },
    });
  }

  async listMenuCategories(restaurantMenuId: string) {
    return this.prisma.restaurantMenuCategory.findMany({
      where: { restaurantMenuId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        menuCategory: {
          select: {
            id: true,
            name: true,
            slug: true,
            imageUrl: true,
            isActive: true,
          },
        },
      },
    });
  }

  async deleteMenuCategoryLinks(restaurantMenuId: string, tx?: PrismaTx) {
    return this.client(tx).restaurantMenuCategory.deleteMany({
      where: { restaurantMenuId },
    });
  }

  async getNextCategorySortOrder(restaurantMenuId: string) {
    const latest = await this.prisma.restaurantMenuCategory.findFirst({
      where: { restaurantMenuId },
      orderBy: [{ sortOrder: 'desc' }, { createdAt: 'desc' }],
      select: { sortOrder: true },
    });

    return (latest?.sortOrder ?? -1) + 1;
  }

  async listMenuItems(
    restaurantMenuId: string,
    query: ListRestaurantMenuItemsDto,
  ) {
    const requestedItemIds = query.itemIds
      ? query.itemIds
          .split(',')
          .map((itemId) => itemId.trim())
          .filter((itemId) => itemId.length > 0)
      : [];

    const where: Prisma.MenuItemWhereInput = {
      deletedAt: null,
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(requestedItemIds.length ? { id: { in: requestedItemIds } } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { slug: { contains: query.search, mode: 'insensitive' } },
              { sku: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      OR: [
        {
          menuLinks: {
            some: {
              restaurantMenuId,
              ...(query.includeInactive ? {} : { isActive: true }),
            },
          },
        },
        {
          category: {
            menuLinks: {
              some: {
                restaurantMenuId,
              },
            },
          },
        },
      ],
    };

    const orderDirection = query.sortOrder.toLowerCase() as 'asc' | 'desc';

    const [items, total] = await this.prisma.$transaction([
      this.prisma.menuItem.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy:
          query.sortBy === 'sortOrder'
            ? [{ category: { sortOrder: orderDirection } }, { name: 'asc' }]
            : [{ [query.sortBy]: orderDirection }],
        include: {
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
              imageUrl: true,
              items: {
                where: {
                  deletedAt: null,
                  isActive: true,
                },
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
                orderBy: [{ createdAt: 'asc' }],
              },
              variations: {
                where: {
                  deletedAt: null,
                  ...(query.includeInactive ? {} : { isActive: true }),
                },
                include: {
                  itemPriceOverrides: true,
                },
                orderBy: { sortOrder: 'asc' },
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
                          modifier: {
                            include: {
                              itemPriceOverrides: true,
                              variationPriceOverrides: true,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          menuLinks: {
            where: { restaurantMenuId },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            select: {
              id: true,
              sortOrder: true,
              isActive: true,
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
                    include: {
                      modifier: {
                        include: {
                          itemPriceOverrides: true,
                          variationPriceOverrides: true,
                        },
                      },
                    },
                    orderBy: [
                      { sortOrder: 'asc' },
                      { modifier: { createdAt: 'asc' } },
                    ],
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.menuItem.count({ where }),
    ]);

    const menuCategoryLinks = await this.prisma.restaurantMenuCategory.findMany(
      {
        where: { restaurantMenuId },
        select: {
          menuCategoryId: true,
          sortOrder: true,
        },
      },
    );

    const categoryLinkMap = new Map(
      menuCategoryLinks.map((link) => [link.menuCategoryId, link]),
    );

    return {
      items: items.map((item) => {
        const directLink = item.menuLinks[0] ?? null;
        const categoryLink = categoryLinkMap.get(item.categoryId) ?? null;
        const source =
          directLink && categoryLink
            ? 'DIRECT_AND_CATEGORY'
            : directLink
              ? 'DIRECT'
              : 'CATEGORY';

        return {
          id: item.id,
          name: item.name,
          slug: item.slug,
          description: item.description,
          imageUrl: item.imageUrl,
          sku: item.sku,
          basePrice: item.basePrice,
          depositAmount: item.depositAmount,
          prepTimeMinutes: item.prepTimeMinutes,
          isActive: item.isActive,
          category: item.category,
          variations: item.category.variations,
          modifierGroups: this.buildModifierGroups(item),
          menuResolution: {
            source,
            directLink,
            categoryLink,
          },
        };
      }),
      total,
    };
  }

  async updateMenuItemLink(
    id: string,
    data: Prisma.RestaurantMenuItemUpdateInput,
    tx?: PrismaTx,
  ) {
    return this.client(tx).restaurantMenuItem.update({ where: { id }, data });
  }

  async removeMenuItemLink(id: string, tx?: PrismaTx) {
    return this.client(tx).restaurantMenuItem.delete({ where: { id } });
  }

  private buildModifierGroups(item: {
    id: string;
    category: {
      modifierLinks: Array<{
        sortOrder: number;
        modifierGroup: {
          id: string;
          name: string;
          description?: string | null;
          minSelect: number;
          maxSelect: number;
          isRequired: boolean;
          modifierLinks: Array<{
            sortOrder: number;
            modifier: {
              id: string;
              name: string;
              description?: string | null;
              priceDelta: Prisma.Decimal;
              itemPriceOverrides?: Array<{
                menuItemId: string;
                priceDelta: Prisma.Decimal;
              }>;
              variationPriceOverrides?: Array<{
                menuItemId?: string | null;
                variationId: string;
                priceDelta: Prisma.Decimal;
              }>;
            };
          }>;
        };
      }>;
    };
    modifierLinks: Array<{
      sortOrder: number;
      modifierGroup: {
        id: string;
        name: string;
        description?: string | null;
        minSelect: number;
        maxSelect: number;
        isRequired: boolean;
        modifierLinks: Array<{
          sortOrder: number;
          modifier: {
            id: string;
            name: string;
            description?: string | null;
            priceDelta: Prisma.Decimal;
            itemPriceOverrides?: Array<{
              menuItemId: string;
              priceDelta: Prisma.Decimal;
            }>;
            variationPriceOverrides?: Array<{
              menuItemId?: string | null;
              variationId: string;
              priceDelta: Prisma.Decimal;
            }>;
          };
        }>;
      };
    }>;
  }) {
    const categoryGroupIds = new Set(
      item.category.modifierLinks.map((link) => link.modifierGroup.id),
    );

    return [...item.category.modifierLinks, ...item.modifierLinks]
      .filter(
        (link, index, links) =>
          links.findIndex(
            (candidate) => candidate.modifierGroup.id === link.modifierGroup.id,
          ) === index,
      )
      .map((link) => ({
        id: link.modifierGroup.id,
        name: link.modifierGroup.name,
        description: link.modifierGroup.description ?? null,
        minSelect: link.modifierGroup.minSelect,
        maxSelect: link.modifierGroup.maxSelect,
        isRequired: link.modifierGroup.isRequired,
        sortOrder: link.sortOrder,
        source: categoryGroupIds.has(link.modifierGroup.id)
          ? 'CATEGORY'
          : 'ITEM',
        modifiers: (link.modifierGroup.modifierLinks ?? []).map(
          ({ modifier, sortOrder }) => ({
            id: modifier.id,
            name: modifier.name,
            description: modifier.description ?? null,
            sortOrder,
            priceDelta: Number(modifier.priceDelta),
            itemPriceOverrides: (modifier.itemPriceOverrides ?? [])
              .filter((override) => override.menuItemId === item.id)
              .map((override) => ({
                menuItemId: override.menuItemId,
                priceDelta: Number(override.priceDelta),
              })),
            variationPriceOverrides: (
              modifier.variationPriceOverrides ?? []
            ).map((override) => ({
              menuItemId: override.menuItemId ?? null,
              variationId: override.variationId,
              priceDelta: Number(override.priceDelta),
            })),
          }),
        ),
      }));
  }
}
