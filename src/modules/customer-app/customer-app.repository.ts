import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database';
import {
  HomeScreenQueryDto,
  ListCuisineItemsQueryDto,
  ListCuisinesQueryDto,
  ListCustomerFavoritesQueryDto,
  ListPublicOrderReviewsQueryDto,
  ListPromotionalItemsQueryDto,
  PublicRestaurantQueryDto,
} from './dto';

const restaurantMenuScheduleSelect = {
  id: true,
  isTimed: true,
  timingConfig: true,
  isActive: true,
  deletedAt: true,
} satisfies Prisma.RestaurantMenuSelect;

@Injectable()
export class CustomerAppRepository {
  constructor(private readonly prisma: PrismaService) {}

  private buildPublicMenuItemInclude(
    branchId?: string,
  ): Prisma.MenuItemInclude {
    return {
      restaurant: {
        select: {
          id: true,
          name: true,
          logoUrl: true,
          tagline: true,
          settings: true,
          tenant: { select: { settings: true } },
        },
      },
      category: {
        select: {
          id: true,
          name: true,
          imageUrl: true,
          variations: {
            where: { deletedAt: null, isActive: true },
            include: {
              modifierPriceOverrides: {
                include: {
                  modifier: {
                    include: {
                      itemPriceOverrides: true,
                      variationPriceOverrides: true,
                    },
                  },
                },
              },
              itemPriceOverrides: true,
            },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
          variationLinks: {
            where: { isActive: true },
            include: {
              variation: {
                include: {
                  modifierPriceOverrides: {
                    include: {
                      modifier: {
                        include: {
                          itemPriceOverrides: true,
                          variationPriceOverrides: true,
                        },
                      },
                    },
                  },
                  itemPriceOverrides: true,
                },
              },
            },
            orderBy: [{ sortOrder: 'asc' }],
          },
          menuLinks: {
            include: {
              restaurantMenu: {
                select: restaurantMenuScheduleSelect,
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
      modifierPriceOverrides: {
        include: {
          modifier: {
            include: {
              itemPriceOverrides: true,
              variationPriceOverrides: true,
            },
          },
        },
        orderBy: [{ modifier: { sortOrder: 'asc' } }],
      },
      variationPriceOverrides: {
        include: {
          variation: {
            include: {
              modifierPriceOverrides: {
                include: {
                  modifier: {
                    include: {
                      itemPriceOverrides: true,
                      variationPriceOverrides: true,
                    },
                  },
                },
              },
              itemPriceOverrides: true,
            },
          },
        },
        orderBy: [{ variation: { sortOrder: 'asc' } }],
      },
      categoryLinks: {
        include: {
          menuCategory: {
            select: {
              id: true,
              menuLinks: {
                include: {
                  restaurantMenu: {
                    select: restaurantMenuScheduleSelect,
                  },
                },
              },
            },
          },
        },
      },
      menuLinks: {
        include: {
          restaurantMenu: {
            select: restaurantMenuScheduleSelect,
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
    };
  }

  private buildPublicMenuItemVisibilityWhere(
    branchId?: string,
  ): Prisma.MenuItemWhereInput {
    return {
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
      ...this.buildBranchMenuItemAvailabilityWhere(branchId),
    };
  }

  private buildDealScopedMenuItemVisibilityWhere(
    restaurantId: string,
    branchId: string | undefined,
    now: Date,
  ): Prisma.MenuItemWhereInput {
    const activeDealWhere: Prisma.CouponWhereInput = {
      restaurantId,
      kind: 'PROMOTION',
      discountType: 'FIXED_PRICE',
      autoApply: true,
      deletedAt: null,
      isActive: true,
      status: 'ACTIVE',
      startsAt: { lte: now },
      expiresAt: { gte: now },
      OR: [{ branchId: null }, ...(branchId ? [{ branchId }] : [])],
    };

    return {
      category: {
        deletedAt: null,
        isActive: true,
      },
      ...this.buildBranchMenuItemAvailabilityWhere(branchId),
      OR: [
        { couponScopes: { some: activeDealWhere } },
        { couponScopeLinks: { some: { coupon: activeDealWhere } } },
      ],
    };
  }

  private buildBranchMenuItemAvailabilityWhere(
    branchId?: string,
  ): Prisma.MenuItemWhereInput {
    if (!branchId) {
      return {};
    }

    return {
      OR: [
        { branchOverrides: { none: { branchId } } },
        { branchOverrides: { some: { branchId, isAvailable: true } } },
      ],
    };
  }

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

  async findCustomersForTableReservations(params: {
    restaurantId: string;
    customerId?: string;
    search?: string;
  }) {
    const search = params.search?.trim();

    return this.prisma.user.findMany({
      where: {
        role: 'CUSTOMER',
        restaurantId: params.restaurantId,
        deletedAt: null,
        isActive: true,
        ...(params.customerId ? { id: params.customerId } : {}),
        ...(search
          ? {
              OR: [
                { email: { contains: search, mode: 'insensitive' } },
                {
                  profile: {
                    is: {
                      OR: [
                        {
                          firstName: { contains: search, mode: 'insensitive' },
                        },
                        { lastName: { contains: search, mode: 'insensitive' } },
                        { phone: { contains: search, mode: 'insensitive' } },
                      ],
                    },
                  },
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        email: true,
        profile: {
          select: {
            firstName: true,
            lastName: true,
            phone: true,
            avatarUrl: true,
            metadata: true,
          },
        },
      },
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
            select: {
              id: true,
              name: true,
              logoUrl: true,
              tagline: true,
              settings: true,
              tenant: { select: { settings: true } },
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              imageUrl: true,
              variations: {
                where: { deletedAt: null, isActive: true },
                include: {
                  modifierPriceOverrides: {
                    include: {
                      modifier: {
                        include: {
                          itemPriceOverrides: true,
                          variationPriceOverrides: true,
                        },
                      },
                    },
                  },
                  itemPriceOverrides: true,
                },
                orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
              },
              variationLinks: {
                where: { isActive: true },
                include: {
                  variation: {
                    include: {
                      modifierPriceOverrides: {
                        include: {
                          modifier: {
                            include: {
                              itemPriceOverrides: true,
                              variationPriceOverrides: true,
                            },
                          },
                        },
                      },
                      itemPriceOverrides: true,
                    },
                  },
                },
                orderBy: [{ sortOrder: 'asc' }],
              },
              menuLinks: {
                include: {
                  restaurantMenu: {
                    select: restaurantMenuScheduleSelect,
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
          modifierPriceOverrides: {
            include: {
              modifier: {
                include: {
                  itemPriceOverrides: true,
                  variationPriceOverrides: true,
                },
              },
            },
            orderBy: [{ modifier: { sortOrder: 'asc' } }],
          },
          variationPriceOverrides: {
            include: {
              variation: {
                include: {
                  modifierPriceOverrides: {
                    include: {
                      modifier: {
                        include: {
                          itemPriceOverrides: true,
                          variationPriceOverrides: true,
                        },
                      },
                    },
                  },
                  itemPriceOverrides: true,
                },
              },
            },
            orderBy: [{ variation: { sortOrder: 'asc' } }],
          },
          categoryLinks: {
            include: {
              menuCategory: {
                select: {
                  id: true,
                  menuLinks: {
                    include: {
                      restaurantMenu: {
                        select: restaurantMenuScheduleSelect,
                      },
                    },
                  },
                },
              },
            },
          },
          menuLinks: {
            include: {
              restaurantMenu: {
                select: restaurantMenuScheduleSelect,
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

  async findRestaurantScope(restaurantId: string, tenantId?: string) {
    return this.prisma.restaurant.findFirst({
      where: {
        id: restaurantId,
        deletedAt: null,
        ...(tenantId ? { tenantId } : {}),
      },
      select: { id: true },
    });
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
        branding: true,
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
        tenantId: true,
        restaurantId: true,
        name: true,
        logoUrl: true,
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
        tenantId: true,
        restaurantId: true,
        name: true,
        logoUrl: true,
        coverImage: true,
        description: true,
        settings: true,
      },
    });
  }

  async getBranchPublicStats(restaurantId: string, branchId: string) {
    const [
      completedOrders,
      activeMenuItems,
      reviewsAggregate,
      fiveStarReviews,
    ] = await this.prisma.$transaction([
      this.prisma.order.count({
        where: {
          restaurantId,
          branchId,
          status: OrderStatus.DELIVERED,
        },
      }),
      this.prisma.menuItem.count({
        where: {
          restaurantId,
          deletedAt: null,
          isActive: true,
          ...this.buildBranchMenuItemAvailabilityWhere(branchId),
        },
      }),
      this.prisma.orderReview.aggregate({
        where: { restaurantId, branchId },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      this.prisma.orderReview.count({
        where: { restaurantId, branchId, rating: 5 },
      }),
    ]);

    const reviewCount = reviewsAggregate._count._all;

    return {
      completedOrders,
      activeMenuItems,
      reviewCount,
      averageRating:
        reviewsAggregate._avg.rating !== null
          ? Number(reviewsAggregate._avg.rating.toFixed(2))
          : null,
      fiveStarReviews,
    };
  }

  async listPublicReviews(query: ListPublicOrderReviewsQueryDto) {
    const where: Prisma.OrderReviewWhereInput = {
      restaurantId: query.restaurantId!,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.rating ? { rating: query.rating } : {}),
    };

    const [items, total, summary] = await this.prisma.$transaction([
      this.prisma.orderReview.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ createdAt: 'desc' }],
        select: {
          id: true,
          restaurantId: true,
          branchId: true,
          orderId: true,
          rating: true,
          comment: true,
          createdAt: true,
          customer: {
            select: {
              id: true,
              profile: {
                select: {
                  firstName: true,
                  lastName: true,
                  avatarUrl: true,
                },
              },
            },
          },
          branch: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.orderReview.count({ where }),
      this.prisma.orderReview.aggregate({
        where: {
          restaurantId: query.restaurantId!,
          ...(query.branchId ? { branchId: query.branchId } : {}),
        },
        _avg: { rating: true },
        _count: { _all: true },
      }),
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        restaurantId: item.restaurantId,
        branchId: item.branchId,
        orderId: item.orderId,
        rating: item.rating,
        comment: item.comment,
        createdAt: item.createdAt,
        customer: {
          id: item.customer.id,
          firstName: item.customer.profile?.firstName ?? null,
          lastName: item.customer.profile?.lastName ?? null,
          avatarUrl: item.customer.profile?.avatarUrl ?? null,
        },
        branch: item.branch,
      })),
      total,
      summary: {
        reviewCount: summary._count._all,
        averageRating:
          summary._avg.rating !== null
            ? Number(summary._avg.rating.toFixed(2))
            : null,
      },
    };
  }

  async listCuisineCategories(
    query: ListCuisinesQueryDto,
    scope?: { categoryIds?: string[] },
  ) {
    const branchId = query.branchId;
    const categoryIds = scope?.categoryIds ?? [];
    const where: Prisma.MenuCategoryWhereInput = {
      restaurantId: query.restaurantId,
      deletedAt: null,
      isActive: true,
      ...(categoryIds.length ? { id: { in: categoryIds } } : {}),
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
          items: {
            where: {
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
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            include: this.buildPublicMenuItemInclude(branchId),
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
      deletedAt: null,
      isActive: true,
      AND: [
        {
          OR: [
            { categoryId: cuisineId },
            { categoryLinks: { some: { menuCategoryId: cuisineId } } },
          ],
        },
      ],
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
            select: {
              id: true,
              name: true,
              logoUrl: true,
              tagline: true,
              settings: true,
              tenant: { select: { settings: true } },
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              imageUrl: true,
              variations: {
                where: { deletedAt: null, isActive: true },
                include: {
                  modifierPriceOverrides: {
                    include: {
                      modifier: {
                        include: {
                          itemPriceOverrides: true,
                          variationPriceOverrides: true,
                        },
                      },
                    },
                  },
                  itemPriceOverrides: true,
                },
                orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
              },
              variationLinks: {
                where: { isActive: true },
                include: {
                  variation: {
                    include: {
                      modifierPriceOverrides: {
                        include: {
                          modifier: {
                            include: {
                              itemPriceOverrides: true,
                              variationPriceOverrides: true,
                            },
                          },
                        },
                      },
                      itemPriceOverrides: true,
                    },
                  },
                },
                orderBy: [{ sortOrder: 'asc' }],
              },
              menuLinks: {
                include: {
                  restaurantMenu: {
                    select: restaurantMenuScheduleSelect,
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
          modifierPriceOverrides: {
            include: {
              modifier: {
                include: {
                  itemPriceOverrides: true,
                  variationPriceOverrides: true,
                },
              },
            },
            orderBy: [{ modifier: { sortOrder: 'asc' } }],
          },
          variationPriceOverrides: {
            include: {
              variation: {
                include: {
                  modifierPriceOverrides: {
                    include: {
                      modifier: {
                        include: {
                          itemPriceOverrides: true,
                          variationPriceOverrides: true,
                        },
                      },
                    },
                  },
                  itemPriceOverrides: true,
                },
              },
            },
            orderBy: [{ variation: { sortOrder: 'asc' } }],
          },
          menuLinks: {
            include: {
              restaurantMenu: {
                select: restaurantMenuScheduleSelect,
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
    query: PublicRestaurantQueryDto & { restaurantId: string },
  ) {
    const restaurantId = query.restaurantId;
    const branchId = query.branchId;
    const now = new Date();

    return this.prisma.menuItem.findFirst({
      where: {
        slug: { equals: slug.trim(), mode: 'insensitive' },
        restaurantId,
        deletedAt: null,
        isActive: true,
        OR: [
          this.buildPublicMenuItemVisibilityWhere(branchId),
          this.buildDealScopedMenuItemVisibilityWhere(
            restaurantId,
            branchId,
            now,
          ),
        ],
      },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            tagline: true,
            settings: true,
            tenant: { select: { settings: true } },
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            variations: {
              where: { deletedAt: null, isActive: true },
              include: {
                modifierPriceOverrides: {
                  include: {
                    modifier: {
                      include: {
                        itemPriceOverrides: true,
                        variationPriceOverrides: true,
                      },
                    },
                  },
                },
                itemPriceOverrides: true,
              },
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            },
            variationLinks: {
              where: { isActive: true },
              include: {
                variation: {
                  include: {
                    modifierPriceOverrides: {
                      include: {
                        modifier: {
                          include: {
                            itemPriceOverrides: true,
                            variationPriceOverrides: true,
                          },
                        },
                      },
                    },
                    itemPriceOverrides: true,
                  },
                },
              },
              orderBy: [{ sortOrder: 'asc' }],
            },
            menuLinks: {
              include: {
                restaurantMenu: {
                  select: restaurantMenuScheduleSelect,
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
        modifierPriceOverrides: {
          include: {
            modifier: {
              include: {
                itemPriceOverrides: true,
                variationPriceOverrides: true,
              },
            },
          },
          orderBy: [{ modifier: { sortOrder: 'asc' } }],
        },
        variationPriceOverrides: {
          include: {
            variation: {
              include: {
                modifierPriceOverrides: {
                  include: {
                    modifier: {
                      include: {
                        itemPriceOverrides: true,
                        variationPriceOverrides: true,
                      },
                    },
                  },
                },
                itemPriceOverrides: true,
              },
            },
          },
          orderBy: [{ variation: { sortOrder: 'asc' } }],
        },
        categoryLinks: {
          include: {
            menuCategory: {
              select: {
                id: true,
                menuLinks: {
                  include: {
                    restaurantMenu: {
                      select: restaurantMenuScheduleSelect,
                    },
                  },
                },
              },
            },
          },
        },
        menuLinks: {
          include: {
            restaurantMenu: {
              select: restaurantMenuScheduleSelect,
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

  async listPublicDealScopeMenuItems(
    query: PublicRestaurantQueryDto & { restaurantId: string },
    menuItemIds: string[],
  ) {
    const restaurantId = query.restaurantId;
    const branchId = query.branchId;
    const now = new Date();

    return this.prisma.menuItem.findMany({
      where: {
        id: { in: menuItemIds },
        restaurantId,
        deletedAt: null,
        isActive: true,
        OR: [
          this.buildPublicMenuItemVisibilityWhere(branchId),
          this.buildDealScopedMenuItemVisibilityWhere(
            restaurantId,
            branchId,
            now,
          ),
        ],
      },
      take: menuItemIds.length,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      include: this.buildPublicMenuItemInclude(branchId),
    });
  }

  async listPromotionalItems(
    query: HomeScreenQueryDto | ListPromotionalItemsQueryDto,
    scope?: { menuItemIds?: string[]; categoryIds?: string[] },
  ) {
    const branchId = query.branchId;
    const take = 'promotionLimit' in query ? query.promotionLimit : query.limit;
    const menuItemIds = scope?.menuItemIds ?? [];
    const categoryIds = scope?.categoryIds ?? [];

    return this.prisma.menuItem.findMany({
      where: {
        restaurantId: query.restaurantId,
        deletedAt: null,
        isActive: true,
        ...(menuItemIds.length || categoryIds.length
          ? {
              OR: [
                ...(menuItemIds.length ? [{ id: { in: menuItemIds } }] : []),
                ...(categoryIds.length
                  ? [
                      { categoryId: { in: categoryIds } },
                      {
                        categoryLinks: {
                          some: { menuCategoryId: { in: categoryIds } },
                        },
                      },
                    ]
                  : []),
              ],
            }
          : {}),
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
          select: {
            id: true,
            name: true,
            logoUrl: true,
            tagline: true,
            settings: true,
            tenant: { select: { settings: true } },
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            variations: {
              where: { deletedAt: null, isActive: true },
              include: {
                modifierPriceOverrides: {
                  include: {
                    modifier: {
                      include: {
                        itemPriceOverrides: true,
                        variationPriceOverrides: true,
                      },
                    },
                  },
                },
                itemPriceOverrides: true,
              },
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            },
            variationLinks: {
              where: { isActive: true },
              include: {
                variation: {
                  include: {
                    modifierPriceOverrides: {
                      include: {
                        modifier: {
                          include: {
                            itemPriceOverrides: true,
                            variationPriceOverrides: true,
                          },
                        },
                      },
                    },
                    itemPriceOverrides: true,
                  },
                },
              },
              orderBy: [{ sortOrder: 'asc' }],
            },
            menuLinks: {
              include: {
                restaurantMenu: {
                  select: restaurantMenuScheduleSelect,
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
        modifierPriceOverrides: {
          include: {
            modifier: {
              include: {
                itemPriceOverrides: true,
                variationPriceOverrides: true,
              },
            },
          },
          orderBy: [{ modifier: { sortOrder: 'asc' } }],
        },
        variationPriceOverrides: {
          include: {
            variation: {
              include: {
                modifierPriceOverrides: {
                  include: {
                    modifier: {
                      include: {
                        itemPriceOverrides: true,
                        variationPriceOverrides: true,
                      },
                    },
                  },
                },
                itemPriceOverrides: true,
              },
            },
          },
          orderBy: [{ variation: { sortOrder: 'asc' } }],
        },
        categoryLinks: {
          include: {
            menuCategory: {
              select: {
                id: true,
                menuLinks: {
                  include: {
                    restaurantMenu: {
                      select: restaurantMenuScheduleSelect,
                    },
                  },
                },
              },
            },
          },
        },
        menuLinks: {
          include: {
            restaurantMenu: {
              select: restaurantMenuScheduleSelect,
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
