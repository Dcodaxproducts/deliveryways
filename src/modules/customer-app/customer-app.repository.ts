import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AddressRefType, OrderStatus, Prisma } from '@prisma/client';
import { isRestaurantMenuAvailableAt } from '../../common/utils';
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

const PUBLIC_CUISINE_MENU_LIMIT = 500;
const PUBLIC_CUISINE_CATEGORY_LIMIT_PER_CUISINE = 200;

const publicMenuItemDetailVariationSelect = {
  id: true,
  name: true,
  description: true,
  price: true,
  sortOrder: true,
  isDefault: true,
  isActive: true,
} satisfies Prisma.MenuItemVariationSelect;

const publicMenuItemDetailModifierSelect = {
  id: true,
  name: true,
  priceDelta: true,
  sortOrder: true,
  isActive: true,
} satisfies Prisma.ModifierSelect;

const publicMenuItemDetailModifierGroupSelect = {
  id: true,
  name: true,
  description: true,
  minSelect: true,
  maxSelect: true,
  includedSelect: true,
  isRequired: true,
  sortOrder: true,
  isActive: true,
} satisfies Prisma.ModifierGroupSelect;

@Injectable()
export class CustomerAppRepository {
  constructor(private readonly prisma: PrismaService) {}

  private groupBy<T>(rows: T[], key: (row: T) => string) {
    const grouped = new Map<string, T[]>();
    for (const row of rows) {
      const rowKey = key(row);
      const values = grouped.get(rowKey) ?? [];
      values.push(row);
      grouped.set(rowKey, values);
    }
    return grouped;
  }

  private buildPublicMenuItemDetailInclude(branchId?: string) {
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
          _count: {
            select: { modifierLinks: true },
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
      _count: {
        select: {
          modifierLinks: true,
          modifierPriceOverrides: true,
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
      select: { id: true, settings: true },
    });
  }

  async findRestaurantDomainContext(hostname: string, subdomain?: string) {
    const customDomainCandidates = hostname.startsWith('www.')
      ? [hostname, hostname.slice(4)]
      : [hostname, `www.${hostname}`];
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
        OR: customDomainCandidates.map((customDomain) => ({
          customDomain: {
            equals: customDomain,
            mode: Prisma.QueryMode.insensitive,
          },
        })),
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

  async countActiveBranches(restaurantId: string) {
    return this.prisma.branch.count({
      where: {
        restaurantId,
        deletedAt: null,
        isActive: true,
      },
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
        restaurant: { select: { name: true } },
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
    const categoryOrderBy: Prisma.MenuCategoryOrderByWithRelationInput[] =
      query.sortBy === 'createdAt'
        ? [
            {
              createdAt: query.sortOrder.toLowerCase() as 'asc' | 'desc',
            },
            { name: 'asc' },
          ]
        : [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { name: 'asc' }];
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
        orderBy: categoryOrderBy,
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
    if (!query.restaurantId) {
      throw new ServiceUnavailableException('Restaurant context is required');
    }

    const branchId = query.branchId;
    const categoryIds = scope?.categoryIds ?? [];
    const { availableMenuIds, scheduleVisibilityWhere } =
      await this.loadPublicMenuScheduleVisibility(query.restaurantId);
    const baseItemVisibilityWhere: Prisma.MenuItemWhereInput = {
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
              {
                branchOverrides: {
                  some: { branchId, isAvailable: true },
                },
              },
            ],
          }
        : {}),
    };
    const itemVisibilityWhere: Prisma.MenuItemWhereInput = {
      AND: [baseItemVisibilityWhere, scheduleVisibilityWhere],
    };
    const scopedCategoryWhere: Prisma.MenuItemWhereInput | undefined =
      categoryIds.length
        ? {
            OR: [
              { categoryId: { in: categoryIds } },
              {
                categoryLinks: {
                  some: {
                    menuCategoryId: { in: categoryIds },
                    menuCategory: {
                      deletedAt: null,
                      isActive: true,
                      ...(branchId
                        ? {
                            OR: [
                              { overrides: { none: { branchId } } },
                              {
                                overrides: {
                                  some: { branchId, isVisible: true },
                                },
                              },
                            ],
                          }
                        : {}),
                    },
                  },
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

    const [items, total] = await Promise.all([
      this.prisma.cuisine.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          _count: {
            select: {
              itemLinks: {
                where: {
                  menuItem: scopedCategoryWhere
                    ? { AND: [itemVisibilityWhere, scopedCategoryWhere] }
                    : itemVisibilityWhere,
                },
              },
            },
          },
        },
      }),
      this.prisma.cuisine.count({ where }),
    ]);
    const categoryIdsByCuisine = await this.loadCuisineCategoryIds(
      items.map((item) => item.id),
      query.restaurantId,
      branchId,
      availableMenuIds,
      categoryIds,
    );

    return {
      items: items.map((item) => ({
        ...item,
        categoryIds: categoryIdsByCuisine.get(item.id) ?? [],
        _count: { items: item._count.itemLinks },
      })),
      total,
    };
  }

  private async loadCuisineCategoryIds(
    cuisineIds: string[],
    restaurantId: string,
    branchId: string | undefined,
    availableMenuIds: string[],
    scopedCategoryIds: string[],
  ): Promise<Map<string, string[]>> {
    if (!cuisineIds.length) {
      return new Map();
    }

    const branchItemVisibility = branchId
      ? Prisma.sql`AND (
          NOT EXISTS (
            SELECT 1 FROM branch_menu_item_overrides bmio
            WHERE bmio.menu_item_id = mi.id AND bmio.branch_id = ${branchId}
          )
          OR EXISTS (
            SELECT 1 FROM branch_menu_item_overrides bmio
            WHERE bmio.menu_item_id = mi.id
              AND bmio.branch_id = ${branchId}
              AND bmio.is_available = true
          )
        )`
      : Prisma.empty;
    const branchCategoryVisibility = branchId
      ? Prisma.sql`AND (
          NOT EXISTS (
            SELECT 1 FROM branch_category_overrides bmco
            WHERE bmco.menu_category_id = category_ids.category_id
              AND bmco.branch_id = ${branchId}
          )
          OR EXISTS (
            SELECT 1 FROM branch_category_overrides bmco
            WHERE bmco.menu_category_id = category_ids.category_id
              AND bmco.branch_id = ${branchId}
              AND bmco.is_visible = true
          )
        )`
      : Prisma.empty;
    const categoryScope = scopedCategoryIds.length
      ? Prisma.sql`AND category_ids.category_id IN (${Prisma.join(scopedCategoryIds)})`
      : Prisma.empty;
    const scheduleVisibility = availableMenuIds.length
      ? Prisma.sql`AND (
          (
            NOT EXISTS (SELECT 1 FROM restaurant_menu_items rmi WHERE rmi.menu_item_id = mi.id)
            AND NOT EXISTS (SELECT 1 FROM restaurant_menu_categories rmc WHERE rmc.menu_category_id = mi.category_id)
            AND NOT EXISTS (
              SELECT 1 FROM menu_item_categories micat_schedule
              JOIN restaurant_menu_categories rmc ON rmc.menu_category_id = micat_schedule.menu_category_id
              WHERE micat_schedule.menu_item_id = mi.id
            )
          )
          OR EXISTS (
            SELECT 1 FROM restaurant_menu_items rmi
            WHERE rmi.menu_item_id = mi.id AND rmi.is_active = true
              AND rmi.restaurant_menu_id IN (${Prisma.join(availableMenuIds)})
          )
          OR EXISTS (
            SELECT 1 FROM restaurant_menu_categories rmc
            WHERE rmc.menu_category_id = mi.category_id
              AND rmc.restaurant_menu_id IN (${Prisma.join(availableMenuIds)})
          )
          OR EXISTS (
            SELECT 1 FROM menu_item_categories micat_schedule
            JOIN restaurant_menu_categories rmc ON rmc.menu_category_id = micat_schedule.menu_category_id
            WHERE micat_schedule.menu_item_id = mi.id
              AND rmc.restaurant_menu_id IN (${Prisma.join(availableMenuIds)})
          )
        )`
      : Prisma.sql`AND (
          NOT EXISTS (SELECT 1 FROM restaurant_menu_items rmi WHERE rmi.menu_item_id = mi.id)
          AND NOT EXISTS (SELECT 1 FROM restaurant_menu_categories rmc WHERE rmc.menu_category_id = mi.category_id)
          AND NOT EXISTS (
            SELECT 1 FROM menu_item_categories micat_schedule
            JOIN restaurant_menu_categories rmc ON rmc.menu_category_id = micat_schedule.menu_category_id
            WHERE micat_schedule.menu_item_id = mi.id
          )
        )`;
    const rows = await this.prisma.$queryRaw<
      Array<{ cuisineId: string; categoryId: string; rowNumber: bigint }>
    >(Prisma.sql`
      WITH visible_categories AS (
        SELECT DISTINCT mic.cuisine_id AS "cuisineId", category_ids.category_id AS "categoryId"
        FROM menu_item_cuisines mic
        JOIN menu_items mi ON mi.id = mic.menu_item_id
        CROSS JOIN LATERAL (
          SELECT mi.category_id
          UNION
          SELECT micat.menu_category_id FROM menu_item_categories micat
          WHERE micat.menu_item_id = mi.id
        ) category_ids
        JOIN menu_categories mc ON mc.id = category_ids.category_id
        WHERE mic.cuisine_id IN (${Prisma.join(cuisineIds)})
          AND mi.restaurant_id = ${restaurantId}
          AND mi.deleted_at IS NULL AND mi.is_active = true
          AND mc.deleted_at IS NULL AND mc.is_active = true
          ${branchItemVisibility}
          ${branchCategoryVisibility}
          ${categoryScope}
          ${scheduleVisibility}
      ), ranked_categories AS (
        SELECT "cuisineId", "categoryId",
          ROW_NUMBER() OVER (PARTITION BY "cuisineId" ORDER BY "categoryId") AS "rowNumber"
        FROM visible_categories
      )
      SELECT "cuisineId", "categoryId", "rowNumber"
      FROM ranked_categories
      WHERE "rowNumber" <= ${PUBLIC_CUISINE_CATEGORY_LIMIT_PER_CUISINE + 1}
      ORDER BY "cuisineId", "rowNumber"
    `);

    if (
      rows.some(
        (row) =>
          Number(row.rowNumber) > PUBLIC_CUISINE_CATEGORY_LIMIT_PER_CUISINE,
      )
    ) {
      throw new ServiceUnavailableException(
        'Cuisine category detail limit exceeded',
      );
    }

    const categoryIdsByCuisine = new Map<string, string[]>();
    for (const row of rows) {
      const values = categoryIdsByCuisine.get(row.cuisineId) ?? [];
      values.push(row.categoryId);
      categoryIdsByCuisine.set(row.cuisineId, values);
    }
    return categoryIdsByCuisine;
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
    if (!query.restaurantId) {
      throw new ServiceUnavailableException('Restaurant context is required');
    }

    const branchId = query.branchId;
    const { scheduleVisibilityWhere } =
      await this.loadPublicMenuScheduleVisibility(query.restaurantId);
    const baseWhere: Prisma.MenuItemWhereInput = {
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
    const where: Prisma.MenuItemWhereInput = {
      AND: [baseWhere, scheduleVisibilityWhere],
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

  private async loadPublicMenuScheduleVisibility(restaurantId: string) {
    const menuSchedules = await this.prisma.restaurantMenu.findMany({
      where: { restaurantId, isActive: true, deletedAt: null },
      select: { id: true, isTimed: true, timingConfig: true },
      orderBy: { id: 'asc' },
      take: PUBLIC_CUISINE_MENU_LIMIT + 1,
    });
    if (menuSchedules.length > PUBLIC_CUISINE_MENU_LIMIT) {
      throw new ServiceUnavailableException(
        'Restaurant menu schedule limit exceeded',
      );
    }

    const now = new Date();
    const availableMenuIds = menuSchedules
      .filter(
        (menu) =>
          !menu.isTimed || isRestaurantMenuAvailableAt(menu.timingConfig, now),
      )
      .map((menu) => menu.id);
    const scheduleVisibilityWhere: Prisma.MenuItemWhereInput = {
      OR: [
        {
          AND: [
            { menuLinks: { none: {} } },
            { category: { menuLinks: { none: {} } } },
            {
              categoryLinks: {
                none: { menuCategory: { menuLinks: { some: {} } } },
              },
            },
          ],
        },
        ...(availableMenuIds.length
          ? ([
              {
                menuLinks: {
                  some: {
                    isActive: true,
                    restaurantMenuId: { in: availableMenuIds },
                  },
                },
              },
              {
                category: {
                  menuLinks: {
                    some: { restaurantMenuId: { in: availableMenuIds } },
                  },
                },
              },
              {
                categoryLinks: {
                  some: {
                    menuCategory: {
                      menuLinks: {
                        some: { restaurantMenuId: { in: availableMenuIds } },
                      },
                    },
                  },
                },
              },
            ] satisfies Prisma.MenuItemWhereInput[])
          : []),
      ],
    };

    return { availableMenuIds, scheduleVisibilityWhere };
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
        ? {
            dietaryFlags: {
              array_contains: ['__SPLIT_PIZZA_ENABLED__'],
            },
          }
        : {}),
    };
    const itemOrderBy: Prisma.MenuItemOrderByWithRelationInput[] =
      query.sortBy === 'createdAt'
        ? [
            {
              createdAt: query.sortOrder.toLowerCase() as 'asc' | 'desc',
            },
            { name: 'asc' },
          ]
        : [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { name: 'asc' }];

    const [items, total] = await Promise.all([
      this.prisma.menuItem.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: itemOrderBy,
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

    const item = await this.prisma.menuItem.findFirst({
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
      include: this.buildPublicMenuItemDetailInclude(branchId),
    });

    if (!item) {
      return null;
    }

    const [
      variationPriceOverrides,
      categoryVariationLinks,
      itemModifierLinks,
      categoryModifierLinks,
      modifierPriceOverrides,
    ] = await Promise.all([
      this.prisma.menuItemVariationPriceOverride.findMany({
        where: { menuItemId: item.id },
        select: {
          id: true,
          menuItemId: true,
          variationId: true,
          price: true,
          pickupPrice: true,
          displayText: true,
          variation: { select: publicMenuItemDetailVariationSelect },
        },
        orderBy: [{ variation: { sortOrder: 'asc' } }],
      }),
      this.prisma.menuCategoryVariation.findMany({
        where: {
          categoryId: item.categoryId,
          isActive: true,
          variation: { deletedAt: null, isActive: true },
        },
        select: {
          sortOrder: true,
          isDefault: true,
          isActive: true,
          variation: { select: publicMenuItemDetailVariationSelect },
        },
        orderBy: [{ sortOrder: 'asc' }],
      }),
      this.prisma.menuItemModifierGroup.findMany({
        where: { menuItemId: item.id },
        select: {
          id: true,
          sortOrder: true,
          selectionType: true,
          minSelect: true,
          maxSelect: true,
          modifierGroup: { select: publicMenuItemDetailModifierGroupSelect },
        },
        orderBy: [{ sortOrder: 'asc' }],
      }),
      this.prisma.menuCategoryModifierGroup.findMany({
        where: { categoryId: item.categoryId },
        select: {
          id: true,
          sortOrder: true,
          selectionType: true,
          minSelect: true,
          maxSelect: true,
          modifierGroup: { select: publicMenuItemDetailModifierGroupSelect },
        },
        orderBy: [{ sortOrder: 'asc' }],
      }),
      this.prisma.menuItemModifierPriceOverride.findMany({
        where: { menuItemId: item.id },
        select: {
          id: true,
          menuItemId: true,
          modifierId: true,
          priceDelta: true,
          isRequired: true,
        },
      }),
    ]);

    const categoryVariations = categoryVariationLinks.length
      ? []
      : await this.prisma.menuItemVariation.findMany({
          where: {
            categoryId: item.categoryId,
            deletedAt: null,
            isActive: true,
          },
          select: publicMenuItemDetailVariationSelect,
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        });
    const modifierGroupIds = [
      ...new Set([
        ...itemModifierLinks.map((link) => link.modifierGroup.id),
        ...categoryModifierLinks.map((link) => link.modifierGroup.id),
      ]),
    ];
    const variationIds = [
      ...new Set([
        ...variationPriceOverrides.map((override) => override.variationId),
        ...categoryVariationLinks.map((link) => link.variation.id),
        ...categoryVariations.map((variation) => variation.id),
      ]),
    ];
    const [groupModifierLinks, variationModifierOverrides] = await Promise.all([
      modifierGroupIds.length
        ? this.prisma.modifierGroupModifier.findMany({
            where: {
              modifierGroupId: { in: modifierGroupIds },
              modifier: { deletedAt: null, isActive: true },
            },
            select: {
              id: true,
              modifierGroupId: true,
              modifierId: true,
              sortOrder: true,
            },
            orderBy: [{ sortOrder: 'asc' }, { modifier: { createdAt: 'asc' } }],
          })
        : Promise.resolve([]),
      variationIds.length
        ? this.prisma.menuVariationModifierPriceOverride.findMany({
            where: {
              variationId: { in: variationIds },
              OR: [{ menuItemId: item.id }, { menuItemId: null }],
            },
            select: {
              id: true,
              menuItemId: true,
              variationId: true,
              modifierId: true,
              priceDelta: true,
            },
          })
        : Promise.resolve([]),
    ]);
    const modifierIds = [
      ...new Set([
        ...groupModifierLinks.map((link) => link.modifierId),
        ...modifierPriceOverrides.map((override) => override.modifierId),
        ...variationModifierOverrides.map((override) => override.modifierId),
      ]),
    ];
    const modifiers = modifierIds.length
      ? await this.prisma.modifier.findMany({
          where: { id: { in: modifierIds }, restaurantId },
          select: publicMenuItemDetailModifierSelect,
        })
      : [];
    const modifiersById = new Map(
      modifiers.map((modifier) => [modifier.id, modifier]),
    );
    const groupModifierLinksByGroupId = this.groupBy(
      groupModifierLinks,
      (link) => link.modifierGroupId,
    );
    const attachModifierGroup = <
      T extends {
        modifierGroup: (typeof itemModifierLinks)[number]['modifierGroup'];
      },
    >(
      link: T,
    ) => ({
      ...link,
      modifierGroup: {
        ...link.modifierGroup,
        modifierLinks: (
          groupModifierLinksByGroupId.get(link.modifierGroup.id) ?? []
        ).flatMap((groupLink) => {
          const modifier = modifiersById.get(groupLink.modifierId);
          return modifier ? [{ ...groupLink, modifier }] : [];
        }),
      },
    });
    const variationModifierOverridesByVariationId = this.groupBy(
      variationModifierOverrides.flatMap((override) => {
        const modifier = modifiersById.get(override.modifierId);
        return modifier ? [{ ...override, modifier }] : [];
      }),
      (override) => override.variationId,
    );
    const attachVariationModifiers = <
      T extends (typeof categoryVariations)[number],
    >(
      variation: T,
    ) => ({
      ...variation,
      modifierPriceOverrides:
        variationModifierOverridesByVariationId.get(variation.id) ?? [],
    });

    return {
      ...item,
      category: {
        ...item.category,
        variations: categoryVariations.map(attachVariationModifiers),
        variationLinks: categoryVariationLinks.map((link) => ({
          ...link,
          variation: attachVariationModifiers(link.variation),
        })),
        modifierLinks: categoryModifierLinks.map(attachModifierGroup),
      },
      modifierLinks: itemModifierLinks.map(attachModifierGroup),
      modifierPriceOverrides: modifierPriceOverrides.flatMap((override) => {
        const modifier = modifiersById.get(override.modifierId);
        return modifier ? [{ ...override, modifier }] : [];
      }),
      variationPriceOverrides: variationPriceOverrides.map((override) => ({
        ...override,
        variation: attachVariationModifiers(override.variation),
      })),
    };
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
  async createTableReservationAtomic(input: {
    tenantId: string;
    restaurantId: string;
    branchId: string;
    customerId: string | null;
    reservationDate: Date;
    durationMinutes: number;
    guestCount: number;
    note: string | null;
    guestName: string;
    guestEmail: string;
    guestPhone: string;
    idempotencyScope: string;
    clientRequestId: string;
    requestFingerprint: string;
    autoAccept: boolean;
    tableCount: number;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.idempotencyScope + ':' + input.clientRequestId}, 0))`;
      await tx.$queryRaw`SELECT id FROM branches WHERE id = ${input.branchId} AND restaurant_id = ${input.restaurantId} FOR UPDATE`;

      const existing = await tx.tableReservation.findUnique({
        where: {
          idempotencyScope_clientRequestId: {
            idempotencyScope: input.idempotencyScope,
            clientRequestId: input.clientRequestId,
          },
        },
      });
      if (existing) {
        return {
          reservation: existing,
          created: false,
          fingerprintMatches:
            existing.requestFingerprint === input.requestFingerprint,
        };
      }

      const slotEnd = new Date(
        input.reservationDate.getTime() + input.durationMinutes * 60_000,
      );
      const earliestOverlap = new Date(
        input.reservationDate.getTime() - input.durationMinutes * 60_000 + 1,
      );
      const acceptedCount = input.autoAccept
        ? (await tx.tableReservation.count({
            where: {
              branchId: input.branchId,
              status: { in: ['CONFIRMED', 'SEATED'] },
              reservationDate: { gte: earliestOverlap, lt: slotEnd },
            },
          })) +
          (await this.countLegacyAcceptedReservations(tx, {
            restaurantId: input.restaurantId,
            branchId: input.branchId,
            slotStart: input.reservationDate,
            slotEnd,
          }))
        : 0;
      const status =
        input.autoAccept &&
        input.tableCount > 0 &&
        acceptedCount < input.tableCount
          ? 'CONFIRMED'
          : 'REQUESTED';
      const reservation = await tx.tableReservation.create({
        data: {
          tenantId: input.tenantId,
          restaurantId: input.restaurantId,
          branchId: input.branchId,
          customerId: input.customerId,
          reservationDate: input.reservationDate,
          durationMinutes: input.durationMinutes,
          guestCount: input.guestCount,
          note: input.note,
          status,
          guestName: input.guestName,
          guestEmail: input.guestEmail,
          guestPhone: input.guestPhone,
          idempotencyScope: input.idempotencyScope,
          clientRequestId: input.clientRequestId,
          requestFingerprint: input.requestFingerprint,
        },
      });

      return { reservation, created: true, fingerprintMatches: true };
    });
  }

  findTableReservationByIdempotency(
    idempotencyScope: string,
    clientRequestId: string,
  ) {
    return this.prisma.tableReservation.findUnique({
      where: {
        idempotencyScope_clientRequestId: {
          idempotencyScope,
          clientRequestId,
        },
      },
    });
  }

  findTableReservationsForCustomer(customerId: string) {
    return this.prisma.tableReservation.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  findTableReservationForCustomer(id: string, customerId: string) {
    return this.prisma.tableReservation.findFirst({
      where: { id, customerId },
    });
  }

  cancelTableReservationForCustomer(id: string, customerId: string) {
    return this.prisma.tableReservation.updateMany({
      where: { id, customerId, status: { not: 'CANCELLED' } },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
  }

  findAdminTableReservations(input: {
    restaurantId: string;
    branchId?: string;
    customerId?: string;
    status?: string;
    search?: string;
  }) {
    return this.prisma.tableReservation.findMany({
      where: {
        restaurantId: input.restaurantId,
        ...(input.branchId ? { branchId: input.branchId } : {}),
        ...(input.customerId ? { customerId: input.customerId } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.search
          ? {
              OR: [
                { guestName: { contains: input.search, mode: 'insensitive' } },
                { guestEmail: { contains: input.search, mode: 'insensitive' } },
                { guestPhone: { contains: input.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        customer: {
          select: {
            id: true,
            profile: { select: { avatarUrl: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  findAdminTableReservationById(input: {
    id: string;
    restaurantId: string;
    branchId?: string;
  }) {
    return this.prisma.tableReservation.findFirst({
      where: {
        id: input.id,
        restaurantId: input.restaurantId,
        ...(input.branchId ? { branchId: input.branchId } : {}),
      },
      include: {
        customer: {
          select: { id: true, profile: { select: { avatarUrl: true } } },
        },
      },
    });
  }

  updateAdminTableReservationStatusAtomic(input: {
    id: string;
    restaurantId: string;
    branchId: string;
    status: string;
    tableCount: number;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM branches WHERE id = ${input.branchId} AND restaurant_id = ${input.restaurantId} FOR UPDATE`;
      const reservation = await tx.tableReservation.findFirst({
        where: {
          id: input.id,
          restaurantId: input.restaurantId,
          branchId: input.branchId,
        },
      });
      if (!reservation) return { reservation: null, capacityExceeded: false };
      if (input.status === 'CONFIRMED') {
        const slotEnd = new Date(
          reservation.reservationDate.getTime() +
            reservation.durationMinutes * 60_000,
        );
        const earliestOverlap = new Date(
          reservation.reservationDate.getTime() -
            reservation.durationMinutes * 60_000 +
            1,
        );
        const acceptedDurable = await tx.tableReservation.count({
          where: {
            id: { not: reservation.id },
            branchId: reservation.branchId,
            status: { in: ['CONFIRMED', 'SEATED'] },
            reservationDate: { gte: earliestOverlap, lt: slotEnd },
          },
        });
        const accepted =
          acceptedDurable +
          (await this.countLegacyAcceptedReservations(tx, {
            restaurantId: input.restaurantId,
            branchId: input.branchId,
            slotStart: reservation.reservationDate,
            slotEnd,
          }));
        if (input.tableCount <= 0 || accepted >= input.tableCount) {
          return { reservation: null, capacityExceeded: true };
        }
      }
      const updated = await tx.tableReservation.update({
        where: { id: reservation.id },
        data: {
          status: input.status,
          cancelledAt:
            input.status === 'CANCELLED'
              ? (reservation.cancelledAt ?? new Date())
              : null,
        },
      });
      return { reservation: updated, capacityExceeded: false };
    });
  }

  updateLegacyTableReservationStatusAtomic(input: {
    customerId: string;
    reservationId: string;
    restaurantId: string;
    branchId: string;
    status: string;
    tableCount: number;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM branches WHERE id = ${input.branchId} AND restaurant_id = ${input.restaurantId} FOR UPDATE`;
      const customer = await tx.user.findFirst({
        where: {
          id: input.customerId,
          restaurantId: input.restaurantId,
          role: 'CUSTOMER',
          deletedAt: null,
          isActive: true,
        },
        select: { profile: { select: { id: true, metadata: true } } },
      });
      const metadata = customer?.profile?.metadata;
      if (
        !customer?.profile ||
        !metadata ||
        typeof metadata !== 'object' ||
        Array.isArray(metadata)
      ) {
        return { updated: false, capacityExceeded: false };
      }
      const root = structuredClone(metadata);
      const customerApp = root.customerApp;
      if (
        !customerApp ||
        typeof customerApp !== 'object' ||
        Array.isArray(customerApp)
      ) {
        return { updated: false, capacityExceeded: false };
      }
      const reservations = customerApp.tableReservations;
      if (!Array.isArray(reservations)) {
        return { updated: false, capacityExceeded: false };
      }
      const index = reservations.findIndex(
        (value) =>
          value !== null &&
          typeof value === 'object' &&
          !Array.isArray(value) &&
          value.id === input.reservationId,
      );
      if (index < 0) return { updated: false, capacityExceeded: false };
      const reservation = reservations[index];
      if (
        !reservation ||
        typeof reservation !== 'object' ||
        Array.isArray(reservation) ||
        reservation.branchId !== input.branchId ||
        typeof reservation.reservationDate !== 'string'
      ) {
        return { updated: false, capacityExceeded: false };
      }
      const slotStart = new Date(reservation.reservationDate);
      const slotEnd = new Date(slotStart.getTime() + 30 * 60_000);
      if (input.status === 'CONFIRMED') {
        const earliestOverlap = new Date(slotStart.getTime() - 30 * 60_000 + 1);
        const durable = await tx.tableReservation.count({
          where: {
            branchId: input.branchId,
            status: { in: ['CONFIRMED', 'SEATED'] },
            reservationDate: { gte: earliestOverlap, lt: slotEnd },
          },
        });
        const legacy = await this.countLegacyAcceptedReservations(tx, {
          restaurantId: input.restaurantId,
          branchId: input.branchId,
          slotStart,
          slotEnd,
          excludeReservationId: input.reservationId,
        });
        if (input.tableCount <= 0 || durable + legacy >= input.tableCount) {
          return { updated: false, capacityExceeded: true };
        }
      }
      reservations[index] = {
        ...reservation,
        status: input.status,
        cancelledAt:
          input.status === 'CANCELLED'
            ? (reservation.cancelledAt ?? new Date().toISOString())
            : null,
      };
      await tx.profile.update({
        where: { id: customer.profile.id },
        data: { metadata: root },
      });
      return { updated: true, capacityExceeded: false };
    });
  }

  private async countLegacyAcceptedReservations(
    tx: Prisma.TransactionClient,
    input: {
      restaurantId: string;
      branchId: string;
      slotStart: Date;
      slotEnd: Date;
      excludeReservationId?: string;
    },
  ) {
    const customers = await tx.user.findMany({
      where: {
        role: 'CUSTOMER',
        restaurantId: input.restaurantId,
        deletedAt: null,
        isActive: true,
      },
      select: { profile: { select: { metadata: true } } },
    });
    let count = 0;
    for (const customer of customers) {
      const metadata = customer.profile?.metadata;
      if (
        !metadata ||
        typeof metadata !== 'object' ||
        Array.isArray(metadata)
      ) {
        continue;
      }
      const customerApp = metadata.customerApp;
      if (
        !customerApp ||
        typeof customerApp !== 'object' ||
        Array.isArray(customerApp)
      ) {
        continue;
      }
      const reservations = customerApp.tableReservations;
      if (!Array.isArray(reservations)) continue;
      for (const reservation of reservations) {
        if (
          !reservation ||
          typeof reservation !== 'object' ||
          Array.isArray(reservation) ||
          reservation.id === input.excludeReservationId ||
          reservation.branchId !== input.branchId ||
          typeof reservation.status !== 'string' ||
          !['CONFIRMED', 'SEATED'].includes(reservation.status) ||
          typeof reservation.reservationDate !== 'string'
        ) {
          continue;
        }
        const start = new Date(reservation.reservationDate);
        const end = new Date(start.getTime() + 30 * 60_000);
        if (
          !Number.isNaN(start.getTime()) &&
          start.getTime() < input.slotEnd.getTime() &&
          end.getTime() > input.slotStart.getTime()
        ) {
          count += 1;
        }
      }
    }
    return count;
  }
}
