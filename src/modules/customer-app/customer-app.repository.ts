import { Injectable } from '@nestjs/common';
import { AddressRefType, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database';
import {
  HomeScreenQueryDto,
  ListCuisineItemsQueryDto,
  ListCuisinesQueryDto,
  ListMenuCategoriesQueryDto,
  ListCustomerFavoritesQueryDto,
  ListPublicOrderReviewsQueryDto,
  ListPublicBranchesQueryDto,
  ListPublicMenuItemsQueryDto,
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

const publicMenuItemVariationCardSelect = {
  id: true,
  name: true,
  description: true,
  price: true,
  sortOrder: true,
  isDefault: true,
  isActive: true,
} satisfies Prisma.MenuItemVariationSelect;

@Injectable()
export class CustomerAppRepository {
  constructor(private readonly prisma: PrismaService) {}

  private buildPublicMenuItemDetailInclude(
    identifier: string,
    restaurantId: string,
    branchId?: string,
  ) {
    const menuItemWhere: Prisma.MenuItemWhereInput = {
      restaurantId,
      deletedAt: null,
      isActive: true,
      OR: [
        { id: identifier },
        { slug: { equals: identifier, mode: Prisma.QueryMode.insensitive } },
      ],
    };
    const variationModifierOverrideWhere: Prisma.MenuVariationModifierPriceOverrideWhereInput =
      {
        OR: [{ menuItemId: null }, { menuItem: { is: menuItemWhere } }],
      };
    const modifierSelect = {
      id: true,
      name: true,
      priceDelta: true,
      sortOrder: true,
      isActive: true,
    } satisfies Prisma.ModifierSelect;
    const variationSelect = {
      id: true,
      name: true,
      description: true,
      price: true,
      sortOrder: true,
      isDefault: true,
      isActive: true,
      modifierPriceOverrides: {
        where: variationModifierOverrideWhere,
        select: {
          id: true,
          menuItemId: true,
          variationId: true,
          modifierId: true,
          priceDelta: true,
          modifier: { select: modifierSelect },
        },
      },
    } satisfies Prisma.MenuItemVariationSelect;
    const modifierLinksInclude = {
      orderBy: [{ sortOrder: 'asc' as const }],
      include: {
        modifierGroup: {
          include: {
            modifierLinks: {
              where: {
                modifier: { deletedAt: null, isActive: true },
              },
              include: {
                modifier: { select: modifierSelect },
              },
              orderBy: [
                { sortOrder: 'asc' as const },
                { modifier: { createdAt: 'asc' as const } },
              ],
            },
          },
        },
      },
    } satisfies Prisma.MenuItem$modifierLinksArgs;

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
            select: variationSelect,
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
          variationLinks: {
            where: { isActive: true },
            select: {
              sortOrder: true,
              isDefault: true,
              isActive: true,
              variation: { select: variationSelect },
            },
            orderBy: [{ sortOrder: 'asc' }],
          },
          modifierLinks: modifierLinksInclude,
          menuLinks: {
            include: {
              restaurantMenu: {
                select: restaurantMenuScheduleSelect,
              },
            },
          },
        },
      },
      modifierLinks: modifierLinksInclude,
      modifierPriceOverrides: {
        select: {
          id: true,
          menuItemId: true,
          modifierId: true,
          priceDelta: true,
          isRequired: true,
          modifier: { select: modifierSelect },
        },
        orderBy: [{ modifier: { sortOrder: 'asc' } }],
      },
      variationPriceOverrides: {
        select: {
          id: true,
          menuItemId: true,
          variationId: true,
          price: true,
          pickupPrice: true,
          displayText: true,
          variation: { select: variationSelect },
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
    } satisfies Prisma.MenuItemInclude;
  }

  private buildPublicMenuItemInclude(branchId?: string) {
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
    } satisfies Prisma.MenuItemInclude;
  }

  private buildPublicMenuItemCardInclude(branchId?: string) {
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
            select: publicMenuItemVariationCardSelect,
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
          variationLinks: {
            where: { isActive: true },
            select: {
              sortOrder: true,
              isDefault: true,
              isActive: true,
              variation: {
                select: publicMenuItemVariationCardSelect,
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
      categoryLinks: {
        select: {
          menuCategoryId: true,
          menuCategory: {
            select: {
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
      variationPriceOverrides: {
        select: {
          menuItemId: true,
          variationId: true,
          price: true,
          pickupPrice: true,
          displayText: true,
          variation: {
            select: publicMenuItemVariationCardSelect,
          },
        },
        orderBy: [{ variation: { sortOrder: 'asc' } }],
      },
      branchOverrides: branchId
        ? {
            where: { branchId },
            select: { priceOverride: true, isAvailable: true },
            take: 1,
          }
        : false,
    } satisfies Prisma.MenuItemInclude;
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
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
      ],
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

  async findRestaurantDomainContext(hostname: string, subdomain?: string) {
    const select = {
      id: true,
      tenantId: true,
      name: true,
      slug: true,
      subdomain: true,
      customDomain: true,
      customDomainVerifiedAt: true,
      logoUrl: true,
      branding: true,
      branches: {
        where: { deletedAt: null, isActive: true },
        orderBy: [{ isMain: 'desc' as const }, { createdAt: 'asc' as const }],
        take: 1,
        select: { id: true, name: true, isMain: true },
      },
    };
    const customDomainRestaurant = await this.prisma.restaurant.findFirst({
      where: {
        deletedAt: null,
        isActive: true,
        customDomain: { equals: hostname, mode: 'insensitive' },
        customDomainVerifiedAt: { not: null },
      },
      select,
    });

    if (customDomainRestaurant || !subdomain) {
      return customDomainRestaurant;
    }

    return this.prisma.restaurant.findFirst({
      where: {
        deletedAt: null,
        isActive: true,
        subdomain: {
          equals: subdomain,
          mode: Prisma.QueryMode.insensitive,
        },
      },
      select,
    });
  }

  async listPublicBranches(query: ListPublicBranchesQueryDto) {
    const where = {
      restaurantId: query.restaurantId,
      deletedAt: null,
      isActive: true,
      ...(query.search?.trim()
        ? {
            name: {
              contains: query.search.trim(),
              mode: Prisma.QueryMode.insensitive,
            },
          }
        : {}),
    } satisfies Prisma.BranchWhereInput;

    const [branches, total] = await Promise.all([
      this.prisma.branch.findMany({
        where,
        orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          restaurantId: true,
          name: true,
          isMain: true,
          isActive: true,
          settings: true,
        },
      }),
      this.prisma.branch.count({ where }),
    ]);

    const addresses = branches.length
      ? await this.prisma.address.findMany({
          where: {
            referenceId: { in: branches.map((branch) => branch.id) },
            refType: AddressRefType.BRANCH,
            deletedAt: null,
            isActive: true,
          },
          select: {
            referenceId: true,
            street: true,
            area: true,
            postalCode: true,
            city: true,
            state: true,
            country: true,
            lat: true,
            lng: true,
          },
        })
      : [];
    const addressByBranchId = new Map(
      addresses.map((address) => [address.referenceId, address]),
    );

    return {
      items: branches.map((branch) => ({
        ...branch,
        address: addressByBranchId.get(branch.id) ?? null,
      })),
      total,
    };
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
        tenant: { select: { id: true, name: true } },
        name: true,
        logoUrl: true,
        coverImage: true,
        tagline: true,
        bio: true,
        socialMedia: true,
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

  async findPublicAddress(referenceId: string, refType: AddressRefType) {
    return this.prisma.address.findFirst({
      where: {
        referenceId,
        refType,
        deletedAt: null,
        isActive: true,
      },
      select: {
        street: true,
        area: true,
        postalCode: true,
        city: true,
        state: true,
        country: true,
        lat: true,
        lng: true,
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

  listPublicGiftCards(restaurantId: string, branchId?: string) {
    const now = new Date();

    return this.prisma.coupon.findMany({
      where: {
        restaurantId,
        kind: 'GIFT_CARD',
        deletedAt: null,
        isActive: true,
        status: 'ACTIVE',
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
        ],
        OR: [{ branchId: null }, ...(branchId ? [{ branchId }] : [])],
      },
      select: {
        id: true,
        branchId: true,
        title: true,
        description: true,
        imageUrl: true,
        discountValue: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ createdAt: 'desc' }],
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
          order: {
            select: {
              id: true,
              orderType: true,
              status: true,
              paymentMethod: true,
              paymentStatus: true,
              totalAmount: true,
              createdAt: true,
              items: {
                orderBy: [{ createdAt: 'asc' }],
                select: {
                  id: true,
                  menuItemId: true,
                  menuItemName: true,
                  variationId: true,
                  variationName: true,
                  quantity: true,
                  unitPrice: true,
                  lineTotal: true,
                  snapshotModifiers: true,
                },
              },
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
        order: {
          id: item.order.id,
          orderType: item.order.orderType,
          status: item.order.status,
          paymentMethod: item.order.paymentMethod,
          paymentStatus: item.order.paymentStatus,
          totalAmount: Number(item.order.totalAmount),
          createdAt: item.order.createdAt,
          items: item.order.items.map((orderItem) => ({
            id: orderItem.id,
            menuItemId: orderItem.menuItemId,
            menuItemName: orderItem.menuItemName,
            variationId: orderItem.variationId,
            variationName: orderItem.variationName,
            quantity: orderItem.quantity,
            unitPrice: Number(orderItem.unitPrice),
            lineTotal: Number(orderItem.lineTotal),
            snapshotModifiers: orderItem.snapshotModifiers,
          })),
        },
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

  async listMenuCategories(
    query: ListMenuCategoriesQueryDto,
    scope?: { categoryIds?: string[]; includeItems?: boolean },
  ) {
    const branchId = query.branchId;
    const categoryIds = scope?.categoryIds ?? [];
    const includeItems = scope?.includeItems ?? false;
    const itemVisibilityWhere: Prisma.MenuItemWhereInput = {
      restaurantId: query.restaurantId,
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
    };
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
    };

    const [items, total] = await Promise.all([
      this.prisma.menuCategory.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { name: 'asc' }],
        include: {
          _count: {
            select: {
              itemLinks: { where: { menuItem: itemVisibilityWhere } },
            },
          },
          itemLinks: includeItems
            ? {
                where: { menuItem: itemVisibilityWhere },
                orderBy: [{ sortOrder: 'asc' }],
                include: {
                  menuItem: {
                    include: this.buildPublicMenuItemInclude(branchId),
                  },
                },
              }
            : false,
        },
      }),
      this.prisma.menuCategory.count({ where }),
    ]);

    return {
      items: items.map((item) => {
        const linkedItems = includeItems
          ? (item.itemLinks as unknown as Array<{ menuItem: unknown }>)
          : [];

        return {
          ...item,
          categoryIds: [item.id],
          _count: { items: item._count.itemLinks },
          items: includeItems
            ? linkedItems.map((link) => link.menuItem)
            : undefined,
        };
      }),
      total,
    };
  }

  async listCuisineCategories(
    query: ListCuisinesQueryDto,
    scope?: { categoryIds?: string[]; includeItems?: boolean },
  ) {
    const branchId = query.branchId;
    const categoryIds = scope?.categoryIds ?? [];
    const includeItems = scope?.includeItems ?? false;
    const itemVisibilityWhere: Prisma.MenuItemWhereInput = {
      restaurantId: query.restaurantId,
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
    };
    const scopedCategoryWhere: Prisma.MenuItemWhereInput | undefined =
      categoryIds.length
        ? {
            OR: [
              { categoryId: { in: categoryIds } },
              {
                categoryLinks: {
                  some: { menuCategoryId: { in: categoryIds } },
                },
              },
            ],
          }
        : undefined;
    const where: Prisma.CuisineWhereInput = {
      deletedAt: null,
      isActive: true,
      itemLinks: {
        some: {
          menuItem: scopedCategoryWhere
            ? { AND: [itemVisibilityWhere, scopedCategoryWhere] }
            : itemVisibilityWhere,
        },
      },
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.cuisine.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          _count: {
            select: {
              itemLinks: {
                where: { menuItem: itemVisibilityWhere },
              },
            },
          },
          itemLinks: {
            where: { menuItem: itemVisibilityWhere },
            orderBy: [{ sortOrder: 'asc' }],
            include: {
              menuItem: {
                include: includeItems
                  ? this.buildPublicMenuItemInclude(branchId)
                  : {
                      categoryLinks: {
                        select: { menuCategoryId: true },
                      },
                    },
              },
            },
          },
        },
      }),
      this.prisma.cuisine.count({ where }),
    ]);

    return {
      items: items.map((item) => {
        const categoryIdsForCuisine = new Set<string>();
        for (const link of item.itemLinks) {
          categoryIdsForCuisine.add(link.menuItem.categoryId);
          for (const categoryLink of link.menuItem.categoryLinks ?? []) {
            categoryIdsForCuisine.add(categoryLink.menuCategoryId);
          }
        }

        return {
          ...item,
          categoryIds: [...categoryIdsForCuisine],
          _count: { items: item._count.itemLinks },
          items: includeItems
            ? item.itemLinks.map((link) => link.menuItem)
            : undefined,
        };
      }),
      total,
    };
  }

  async findPublicCuisine(
    cuisineId: string,
    restaurantId: string,
    branchId?: string,
  ) {
    return this.prisma.cuisine.findFirst({
      where: {
        id: cuisineId,
        deletedAt: null,
        isActive: true,
        ...(branchId
          ? {
              itemLinks: {
                some: {
                  menuItem: {
                    restaurantId,
                    deletedAt: null,
                    isActive: true,
                    OR: [
                      { branchOverrides: { none: { branchId } } },
                      {
                        branchOverrides: {
                          some: { branchId, isAvailable: true },
                        },
                      },
                    ],
                  },
                },
              },
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
      cuisineLinks: { some: { cuisineId } },
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

  async listPublicMenuItems(
    query: ListPublicMenuItemsQueryDto & { restaurantId: string },
  ) {
    const restaurantId = query.restaurantId;
    const branchId = query.branchId;
    const search = query.search?.trim();
    const now = new Date();
    const requiredFilters: Prisma.MenuItemWhereInput[] = [];

    if (query.categoryId) {
      requiredFilters.push({
        OR: [
          { categoryId: query.categoryId },
          {
            categoryLinks: {
              some: { menuCategoryId: query.categoryId },
            },
          },
        ],
      });
    }

    if (search) {
      requiredFilters.push({
        OR: [
          {
            name: {
              contains: search,
              mode: Prisma.QueryMode.insensitive,
            },
          },
          {
            slug: {
              contains: search,
              mode: Prisma.QueryMode.insensitive,
            },
          },
          {
            description: {
              contains: search,
              mode: Prisma.QueryMode.insensitive,
            },
          },
          {
            sku: {
              contains: search,
              mode: Prisma.QueryMode.insensitive,
            },
          },
        ],
      });
    }

    requiredFilters.push({
      OR: [
        this.buildPublicMenuItemVisibilityWhere(branchId),
        this.buildDealScopedMenuItemVisibilityWhere(
          restaurantId,
          branchId,
          now,
        ),
      ],
    });

    const where: Prisma.MenuItemWhereInput = {
      restaurantId,
      deletedAt: null,
      isActive: true,
      AND: requiredFilters,
      ...(query.supportsSplitPizza === true
        ? { supportsSplitPizza: true }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.menuItem.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { name: 'asc' }],
        include: this.buildPublicMenuItemCardInclude(branchId),
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
    const identifier = slug.trim();

    return this.prisma.menuItem.findFirst({
      where: {
        restaurantId,
        deletedAt: null,
        isActive: true,
        AND: [
          {
            OR: [
              { id: identifier },
              { slug: { equals: identifier, mode: 'insensitive' } },
            ],
          },
          {
            OR: [
              this.buildPublicMenuItemVisibilityWhere(branchId),
              this.buildDealScopedMenuItemVisibilityWhere(
                restaurantId,
                branchId,
                now,
              ),
            ],
          },
        ],
      },
      include: this.buildPublicMenuItemDetailInclude(
        identifier,
        restaurantId,
        branchId,
      ),
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
    scope?: {
      menuItemIds?: string[];
      categoryIds?: string[];
      includeDetails?: boolean;
    },
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
      include:
        scope?.includeDetails === false
          ? this.buildPublicMenuItemCardInclude(branchId)
          : {
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
