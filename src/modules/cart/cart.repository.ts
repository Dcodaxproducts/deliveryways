import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaTx } from '../../common/types';
import { PrismaService } from '../../database';

const cartVariationSelect = {
  id: true,
  name: true,
  description: true,
  price: true,
  sortOrder: true,
  isDefault: true,
  isActive: true,
} satisfies Prisma.MenuItemVariationSelect;

const cartModifierSelect = {
  id: true,
  name: true,
  priceDelta: true,
} satisfies Prisma.ModifierSelect;

const cartModifierGroupSelect = {
  id: true,
  name: true,
  minSelect: true,
  maxSelect: true,
  includedSelect: true,
  isRequired: true,
} satisfies Prisma.ModifierGroupSelect;

const cartMenuItemSelect = {
  id: true,
  restaurantId: true,
  categoryId: true,
  name: true,
  slug: true,
  description: true,
  imageUrl: true,
  pricingMode: true,
  basePrice: true,
  deliveryPriceAdjustment: true,
  takeawayPriceAdjustment: true,
  prepTimeMinutes: true,
  dietaryFlags: true,
  depositAmount: true,
  isRequired: true,
  minSelect: true,
  maxSelect: true,
  minQuantity: true,
  maxQuantity: true,
  category: {
    select: {
      id: true,
      name: true,
      imageUrl: true,
    },
  },
  categoryLinks: { select: { menuCategoryId: true } },
  branchOverrides: {
    select: { priceOverride: true, isAvailable: true },
  },
} satisfies Prisma.MenuItemSelect;

type CartMenuItemRow = Prisma.MenuItemGetPayload<{
  select: typeof cartMenuItemSelect;
}>;

@Injectable()
export class CartRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaTx | PrismaClient {
    return tx ?? this.prisma;
  }

  transaction<T>(callback: (tx: PrismaTx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(callback);
  }

  async findByCustomerId(customerId: string) {
    return this.prisma.cart.findUnique({
      where: { customerId },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async create(data: Prisma.CartCreateInput, tx?: PrismaTx) {
    return this.client(tx).cart.create({
      data,
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async update(id: string, data: Prisma.CartUpdateInput, tx?: PrismaTx) {
    return this.client(tx).cart.update({
      where: { id },
      data,
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async deleteByCustomerId(customerId: string, tx?: PrismaTx) {
    return this.client(tx).cart.delete({
      where: { customerId },
    });
  }

  async deleteExpiredBefore(cutoff: Date) {
    return this.prisma.cart.deleteMany({
      where: { updatedAt: { lt: cutoff } },
    });
  }

  async createItem(data: Prisma.CartItemCreateInput, tx?: PrismaTx) {
    return this.client(tx).cartItem.create({ data });
  }

  async updateItem(
    id: string,
    data: Prisma.CartItemUpdateInput,
    tx?: PrismaTx,
  ) {
    return this.client(tx).cartItem.update({ where: { id }, data });
  }

  async updateItems(
    ids: string[],
    data: Prisma.CartItemUpdateManyMutationInput,
  ) {
    if (!ids.length) {
      return { count: 0 };
    }

    return this.prisma.cartItem.updateMany({
      where: { id: { in: ids } },
      data,
    });
  }

  async deleteItem(id: string, tx?: PrismaTx) {
    return this.client(tx).cartItem.delete({ where: { id } });
  }

  async deleteItems(ids: string[]) {
    if (!ids.length) {
      return { count: 0 };
    }

    return this.prisma.cartItem.deleteMany({
      where: { id: { in: ids } },
    });
  }

  async findItemByIdForCustomer(itemId: string, customerId: string) {
    return this.prisma.cartItem.findFirst({
      where: {
        id: itemId,
        cart: {
          customerId,
        },
      },
      include: {
        cart: {
          include: {
            items: {
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });
  }

  async findActiveCustomer(
    customerId: string,
    tenantId?: string,
    restaurantId?: string,
  ) {
    return this.prisma.user.findFirst({
      where: {
        id: customerId,
        ...(tenantId ? { tenantId } : {}),
        ...(restaurantId ? { restaurantId } : {}),
        role: 'CUSTOMER',
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        tenantId: true,
        restaurantId: true,
      },
    });
  }

  async findActiveBranch(branchId: string) {
    return this.prisma.branch.findFirst({
      where: {
        id: branchId,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        tenantId: true,
        restaurantId: true,
        settings: true,
      },
    });
  }

  async findPaymentSettingsForBranch(branchId: string) {
    return this.prisma.branch.findFirst({
      where: {
        id: branchId,
        deletedAt: null,
        isActive: true,
      },
      select: {
        settings: true,
        restaurant: {
          select: {
            settings: true,
          },
        },
      },
    });
  }

  async findRestaurantMenuById(restaurantMenuId: string, restaurantId: string) {
    return this.prisma.restaurantMenu.findFirst({
      where: {
        id: restaurantMenuId,
        restaurantId,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        isTimed: true,
        timingConfig: true,
        items: {
          where: { isActive: true },
          select: { menuItemId: true },
        },
        categories: {
          select: { menuCategoryId: true },
        },
      },
    });
  }

  async findOwnedAddress(addressId: string, tenantId: string, userId: string) {
    return this.prisma.address.findFirst({
      where: {
        id: addressId,
        tenantId,
        referenceId: userId,
        refType: 'USER',
        deletedAt: null,
        isActive: true,
      },
      select: { id: true },
    });
  }

  async findMenuItemForCart(
    menuItemId: string,
    restaurantId: string,
    branchId: string,
  ) {
    const item = await this.prisma.menuItem.findFirst({
      where: {
        id: menuItemId,
        restaurantId,
        deletedAt: null,
        isActive: true,
      },
      select: {
        ...cartMenuItemSelect,
        branchOverrides: {
          where: { branchId },
          select: { priceOverride: true, isAvailable: true },
          take: 1,
        },
      },
    });

    if (!item) {
      return null;
    }

    return (await this.hydrateCartMenuItems([item]))[0] ?? null;
  }

  async findSplitSectionItems(
    menuItemIds: string[],
    restaurantId: string,
    branchId: string,
  ) {
    if (!menuItemIds.length) {
      return [];
    }

    const items = await this.prisma.menuItem.findMany({
      where: {
        id: { in: menuItemIds },
        restaurantId,
        deletedAt: null,
        isActive: true,
      },
      select: {
        ...cartMenuItemSelect,
        branchOverrides: {
          where: { branchId },
          select: { priceOverride: true, isAvailable: true },
          take: 1,
        },
      },
    });

    return this.hydrateCartMenuItems(items);
  }

  async findMenuItemsForResponse(
    menuItemIds: string[],
    restaurantId: string,
    branchId: string,
  ) {
    if (!menuItemIds.length) {
      return [];
    }

    const items = await this.prisma.menuItem.findMany({
      where: {
        id: { in: menuItemIds },
        restaurantId,
      },
      select: {
        ...cartMenuItemSelect,
        branchOverrides: {
          where: { branchId },
          select: { priceOverride: true, isAvailable: true },
          take: 1,
        },
      },
    });

    return this.hydrateCartMenuItems(items);
  }

  async findSplitFlavorCategories(categoryIds: string[], restaurantId: string) {
    if (!categoryIds.length) {
      return [];
    }

    return this.prisma.menuCategory.findMany({
      where: {
        id: { in: categoryIds },
        restaurantId,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
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
      },
    });
  }

  private async hydrateCartMenuItems(items: CartMenuItemRow[]) {
    if (!items.length) {
      return [];
    }

    const menuItemIds = items.map((item) => item.id);
    const categoryIds = [...new Set(items.map((item) => item.categoryId))];
    const [
      itemVariationOverrides,
      categoryVariationLinks,
      itemModifierLinks,
      categoryModifierLinks,
      directModifierOverrides,
    ] = await Promise.all([
      this.prisma.menuItemVariationPriceOverride.findMany({
        where: { menuItemId: { in: menuItemIds } },
        select: {
          menuItemId: true,
          variationId: true,
          price: true,
          pickupPrice: true,
          displayText: true,
          variation: { select: cartVariationSelect },
        },
        orderBy: [{ variation: { sortOrder: 'asc' } }],
      }),
      this.prisma.menuCategoryVariation.findMany({
        where: {
          categoryId: { in: categoryIds },
          isActive: true,
          variation: { deletedAt: null, isActive: true },
        },
        select: {
          categoryId: true,
          sortOrder: true,
          isDefault: true,
          isActive: true,
          variation: { select: cartVariationSelect },
        },
        orderBy: [{ sortOrder: 'asc' }],
      }),
      this.prisma.menuItemModifierGroup.findMany({
        where: { menuItemId: { in: menuItemIds } },
        select: {
          menuItemId: true,
          sortOrder: true,
          selectionType: true,
          minSelect: true,
          maxSelect: true,
          modifierGroup: { select: cartModifierGroupSelect },
        },
        orderBy: [{ sortOrder: 'asc' }],
      }),
      this.prisma.menuCategoryModifierGroup.findMany({
        where: { categoryId: { in: categoryIds } },
        select: {
          categoryId: true,
          sortOrder: true,
          selectionType: true,
          minSelect: true,
          maxSelect: true,
          modifierGroup: { select: cartModifierGroupSelect },
        },
        orderBy: [{ sortOrder: 'asc' }],
      }),
      this.prisma.menuItemModifierPriceOverride.findMany({
        where: { menuItemId: { in: menuItemIds } },
        select: {
          menuItemId: true,
          modifierId: true,
          priceDelta: true,
          isRequired: true,
        },
      }),
    ]);

    const linkedCategoryIds = new Set(
      categoryVariationLinks.map((link) => link.categoryId),
    );
    const fallbackCategoryIds = categoryIds.filter(
      (categoryId) => !linkedCategoryIds.has(categoryId),
    );
    const categoryVariations = fallbackCategoryIds.length
      ? await this.prisma.menuItemVariation.findMany({
          where: {
            categoryId: { in: fallbackCategoryIds },
            deletedAt: null,
            isActive: true,
          },
          select: {
            categoryId: true,
            ...cartVariationSelect,
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        })
      : [];

    const modifierGroupIds = [
      ...new Set([
        ...itemModifierLinks.map((link) => link.modifierGroup.id),
        ...categoryModifierLinks.map((link) => link.modifierGroup.id),
      ]),
    ];
    const groupModifierLinks = modifierGroupIds.length
      ? await this.prisma.modifierGroupModifier.findMany({
          where: {
            modifierGroupId: { in: modifierGroupIds },
            modifier: { deletedAt: null, isActive: true },
          },
          select: {
            modifierGroupId: true,
            modifierId: true,
            sortOrder: true,
          },
          orderBy: [{ sortOrder: 'asc' }, { modifier: { createdAt: 'asc' } }],
        })
      : [];
    const modifierIds = [
      ...new Set([
        ...groupModifierLinks.map((link) => link.modifierId),
        ...directModifierOverrides.map((override) => override.modifierId),
      ]),
    ];
    const variationIds = [
      ...new Set([
        ...itemVariationOverrides.map((override) => override.variationId),
        ...categoryVariationLinks.map((link) => link.variation.id),
        ...categoryVariations.map((variation) => variation.id),
      ]),
    ];
    const modifiers = modifierIds.length
      ? await this.prisma.modifier.findMany({
          where: { id: { in: modifierIds } },
          select: {
            ...cartModifierSelect,
            itemPriceOverrides: {
              where: { menuItemId: { in: menuItemIds } },
              select: { menuItemId: true, priceDelta: true },
            },
            variationPriceOverrides: {
              where: {
                variationId: { in: variationIds },
                OR: [{ menuItemId: { in: menuItemIds } }, { menuItemId: null }],
              },
              select: {
                menuItemId: true,
                variationId: true,
                priceDelta: true,
              },
            },
          },
        })
      : [];

    const modifiersById = new Map(
      modifiers.map((modifier) => [modifier.id, modifier]),
    );
    const groupModifierLinksByGroupId = this.groupBy(
      groupModifierLinks,
      (link) => link.modifierGroupId,
    );
    const itemModifierLinksByItemId = this.groupBy(
      itemModifierLinks,
      (link) => link.menuItemId,
    );
    const categoryModifierLinksByCategoryId = this.groupBy(
      categoryModifierLinks,
      (link) => link.categoryId,
    );
    const directOverridesByItemId = this.groupBy(
      directModifierOverrides,
      (override) => override.menuItemId,
    );
    const itemVariationOverridesByItemId = this.groupBy(
      itemVariationOverrides,
      (override) => override.menuItemId,
    );
    const variationLinksByCategoryId = this.groupBy(
      categoryVariationLinks,
      (link) => link.categoryId,
    );
    const variationsByCategoryId = this.groupBy(
      categoryVariations,
      (variation) => variation.categoryId ?? '',
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

    const categoryGraphsById = new Map(
      categoryIds.map((categoryId) => {
        const categoryScalars = items.find(
          (item) => item.categoryId === categoryId,
        )!.category;
        const variations = (variationsByCategoryId.get(categoryId) ?? []).map(
          (categoryVariation) => {
            const { categoryId: sourceCategoryId, ...variation } =
              categoryVariation;
            void sourceCategoryId;
            return { ...variation, itemPriceOverrides: [] };
          },
        );
        const variationLinks = (
          variationLinksByCategoryId.get(categoryId) ?? []
        ).map((link) => ({
          ...link,
          variation: { ...link.variation, itemPriceOverrides: [] },
        }));
        const category = {
          ...categoryScalars,
          variations,
          variationLinks,
          modifierLinks: (
            categoryModifierLinksByCategoryId.get(categoryId) ?? []
          ).map(attachModifierGroup),
        };

        return [
          categoryId,
          {
            category,
            variations: this.resolveCategoryVariations(category),
          },
        ] as const;
      }),
    );

    return items.map((item) => {
      const variationOverrides =
        itemVariationOverridesByItemId.get(item.id) ?? [];
      const categoryGraph = categoryGraphsById.get(item.categoryId)!;
      const modifierPriceOverrides = (
        directOverridesByItemId.get(item.id) ?? []
      ).flatMap((override) => {
        const modifier = modifiersById.get(override.modifierId);
        return modifier ? [{ ...override, modifier }] : [];
      });

      return {
        ...item,
        category: categoryGraph.category,
        modifierLinks: (itemModifierLinksByItemId.get(item.id) ?? []).map(
          attachModifierGroup,
        ),
        modifierPriceOverrides,
        variationPriceOverrides: variationOverrides,
        variations: variationOverrides.length
          ? this.resolveItemVariations(item.id, variationOverrides)
          : categoryGraph.variations,
      };
    });
  }

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

  private resolveItemVariations(
    menuItemId: string,
    overrides: Array<{
      price: Prisma.Decimal;
      pickupPrice?: Prisma.Decimal | null;
      displayText?: string | null;
      variation: {
        id: string;
        name: string;
        description?: string | null;
        price: Prisma.Decimal;
        itemPriceOverrides?: Array<{
          menuItemId: string;
          price: Prisma.Decimal;
          pickupPrice?: Prisma.Decimal | null;
          displayText?: string | null;
        }>;
      };
    }>,
  ) {
    return overrides.map((override) => ({
      ...override.variation,
      price: override.price,
      pickupPrice: override.pickupPrice ?? null,
      displayText: override.displayText ?? null,
      itemPriceOverrides: [{ ...override, menuItemId }],
    }));
  }

  private resolveCategoryVariations(category: {
    variations: Array<{
      id: string;
      name: string;
      description?: string | null;
      price: Prisma.Decimal;
      itemPriceOverrides?: Array<{
        menuItemId: string;
        price: Prisma.Decimal;
        pickupPrice?: Prisma.Decimal | null;
        displayText?: string | null;
      }>;
    }>;
    variationLinks?: Array<{
      sortOrder: number;
      isDefault: boolean;
      isActive: boolean;
      variation: {
        id: string;
        name: string;
        description?: string | null;
        price: Prisma.Decimal;
        itemPriceOverrides?: Array<{
          menuItemId: string;
          price: Prisma.Decimal;
          pickupPrice?: Prisma.Decimal | null;
          displayText?: string | null;
        }>;
      };
    }>;
  }) {
    return category.variationLinks?.length
      ? category.variationLinks.map((link) => ({
          ...link.variation,
          sortOrder: link.sortOrder,
          isDefault: link.isDefault,
          isActive: link.isActive,
        }))
      : category.variations;
  }
}
