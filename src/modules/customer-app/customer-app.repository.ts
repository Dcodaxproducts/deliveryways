import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database';
import {
  HomeScreenQueryDto,
  ListCuisineItemsQueryDto,
  ListCuisinesQueryDto,
  ListCustomerFavoritesQueryDto,
  ListPromotionalItemsQueryDto,
  PublicRestaurantQueryDto,
} from './dto';

@Injectable()
export class CustomerAppRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCustomerProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
  }

  async findActiveCustomer(
    customerId: string,
    tenantId: string,
    restaurantId: string,
  ) {
    return this.prisma.user.findFirst({
      where: {
        id: customerId,
        tenantId,
        restaurantId,
        role: 'CUSTOMER',
        deletedAt: null,
        isActive: true,
      },
      select: { id: true },
    });
  }

  async upsertCustomerProfile(userId: string, metadata: Prisma.JsonObject) {
    const existing = await this.prisma.profile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (existing) {
      return this.prisma.profile.update({
        where: { id: existing.id },
        data: { metadata },
      });
    }

    return this.prisma.profile.create({
      data: {
        userId,
        firstName: 'Customer',
        lastName: 'Profile',
        metadata,
      },
    });
  }

  async findFavoriteMenuItems(
    restaurantId: string,
    branchId: string | undefined,
    menuItemIds: string[],
    query: ListCustomerFavoritesQueryDto,
  ) {
    const where: Prisma.MenuItemWhereInput = {
      id: { in: menuItemIds },
      restaurantId,
      deletedAt: null,
      isActive: true,
      category: {
        deletedAt: null,
        isActive: true,
        ...(branchId
          ? {
              OR: [
                { overrides: { none: { branchId } } },
                { overrides: { some: { branchId, isVisible: true } } },
              ],
            }
          : {}),
      },
      ...(branchId
        ? {
            OR: [
              { branchOverrides: { none: { branchId } } },
              { branchOverrides: { some: { branchId, isAvailable: true } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.menuItem.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ updatedAt: 'desc' }],
        include: {
          restaurant: {
            select: { id: true, name: true, logoUrl: true, tagline: true },
          },
          category: { select: { id: true, name: true, imageUrl: true } },
          variations: {
            where: { deletedAt: null, isActive: true },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
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
          branchOverrides: branchId
            ? {
                where: { branchId },
                select: { priceOverride: true, isAvailable: true },
                take: 1,
              }
            : false,
        },
      }),
      this.prisma.menuItem.count({ where }),
    ]);

    return { items, total };
  }

  async findRestaurantPublicContent(restaurantId: string) {
    return this.prisma.restaurant.findFirst({
      where: {
        id: restaurantId,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        logoUrl: true,
        coverImage: true,
        tagline: true,
        bio: true,
        supportContact: true,
        settings: true,
      },
    });
  }

  async findBranchPublicContent(branchId: string, restaurantId: string) {
    return this.prisma.branch.findFirst({
      where: {
        id: branchId,
        restaurantId,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        coverImage: true,
        description: true,
        settings: true,
      },
    });
  }

  async findBranchesPublicContent(branchIds: string[], restaurantId: string) {
    if (!branchIds.length) {
      return [];
    }

    return this.prisma.branch.findMany({
      where: {
        id: { in: branchIds },
        restaurantId,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        coverImage: true,
        description: true,
        settings: true,
      },
    });
  }

  async listCuisineCategories(query: ListCuisinesQueryDto) {
    const branchId = query.branchId;
    const where: Prisma.MenuCategoryWhereInput = {
      restaurantId: query.restaurantId,
      deletedAt: null,
      isActive: true,
      ...(branchId
        ? {
            OR: [
              { overrides: { none: { branchId } } },
              { overrides: { some: { branchId, isVisible: true } } },
            ],
          }
        : {}),
      items: {
        some: {
          deletedAt: null,
          isActive: true,
          ...(branchId
            ? {
                OR: [
                  { branchOverrides: { none: { branchId } } },
                  {
                    branchOverrides: {
                      some: { branchId, isAvailable: true },
                    },
                  },
                ],
              }
            : {}),
        },
      },
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.menuCategory.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          _count: {
            select: {
              items: {
                where: {
                  deletedAt: null,
                  isActive: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.menuCategory.count({ where }),
    ]);

    return { items, total };
  }

  async findPublicCuisine(
    cuisineId: string,
    restaurantId: string,
    branchId?: string,
  ) {
    return this.prisma.menuCategory.findFirst({
      where: {
        id: cuisineId,
        restaurantId,
        deletedAt: null,
        isActive: true,
        ...(branchId
          ? {
              OR: [
                { overrides: { none: { branchId } } },
                { overrides: { some: { branchId, isVisible: true } } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        imageUrl: true,
      },
    });
  }

  async listCuisineMenuItems(
    cuisineId: string,
    query: ListCuisineItemsQueryDto,
  ) {
    const branchId = query.branchId;
    const where: Prisma.MenuItemWhereInput = {
      restaurantId: query.restaurantId,
      categoryId: cuisineId,
      deletedAt: null,
      isActive: true,
      category: {
        deletedAt: null,
        isActive: true,
        ...(branchId
          ? {
              OR: [
                { overrides: { none: { branchId } } },
                { overrides: { some: { branchId, isVisible: true } } },
              ],
            }
          : {}),
      },
      ...(branchId
        ? {
            OR: [
              { branchOverrides: { none: { branchId } } },
              { branchOverrides: { some: { branchId, isAvailable: true } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.menuItem.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        include: {
          restaurant: {
            select: { id: true, name: true, logoUrl: true, tagline: true },
          },
          category: { select: { id: true, name: true, imageUrl: true } },
          variations: {
            where: { deletedAt: null, isActive: true },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
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
          branchOverrides: branchId
            ? {
                where: { branchId },
                select: { priceOverride: true, isAvailable: true },
                take: 1,
              }
            : false,
        },
      }),
      this.prisma.menuItem.count({ where }),
    ]);

    return { items, total };
  }

  async findPublicMenuItemBySlug(
    slug: string,
    query: PublicRestaurantQueryDto,
  ) {
    const branchId = query.branchId;

    return this.prisma.menuItem.findFirst({
      where: {
        slug,
        restaurantId: query.restaurantId,
        deletedAt: null,
        isActive: true,
        category: {
          deletedAt: null,
          isActive: true,
          ...(branchId
            ? {
                OR: [
                  { overrides: { none: { branchId } } },
                  { overrides: { some: { branchId, isVisible: true } } },
                ],
              }
            : {}),
        },
        ...(branchId
          ? {
              OR: [
                { branchOverrides: { none: { branchId } } },
                { branchOverrides: { some: { branchId, isAvailable: true } } },
              ],
            }
          : {}),
      },
      include: {
        restaurant: {
          select: { id: true, name: true, logoUrl: true, tagline: true },
        },
        category: { select: { id: true, name: true, imageUrl: true } },
        variations: {
          where: { deletedAt: null, isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
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
        branchOverrides: branchId
          ? {
              where: { branchId },
              select: { priceOverride: true, isAvailable: true },
              take: 1,
            }
          : false,
      },
    });
  }

  async listPromotionalItems(
    query: HomeScreenQueryDto | ListPromotionalItemsQueryDto,
  ) {
    const branchId = query.branchId;
    const take = 'promotionLimit' in query ? query.promotionLimit : query.limit;

    return this.prisma.menuItem.findMany({
      where: {
        restaurantId: query.restaurantId,
        deletedAt: null,
        isActive: true,
        category: {
          deletedAt: null,
          isActive: true,
          ...(branchId
            ? {
                OR: [
                  { overrides: { none: { branchId } } },
                  { overrides: { some: { branchId, isVisible: true } } },
                ],
              }
            : {}),
        },
        ...(branchId
          ? {
              OR: [
                { branchOverrides: { none: { branchId } } },
                { branchOverrides: { some: { branchId, isAvailable: true } } },
              ],
            }
          : {}),
      },
      take,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        restaurant: {
          select: { id: true, name: true, logoUrl: true, tagline: true },
        },
        category: { select: { id: true, name: true, imageUrl: true } },
        variations: {
          where: { deletedAt: null, isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
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
        branchOverrides: branchId
          ? {
              where: { branchId },
              select: { priceOverride: true, isAvailable: true },
              take: 1,
            }
          : false,
      },
    });
  }
}
