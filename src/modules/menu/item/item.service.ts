import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MenuItemPricingMode,
  Prisma,
  VariationPricingMode,
} from '@prisma/client';
import { AuthUserContext } from '../../../common/decorators';
import { UserRoleEnum } from '../../../common/enums';
import { buildPaginationMeta } from '../../../common/utils';
import { PrismaService } from '../../../database';
import { StorageService } from '../../storage/storage.service';
import {
  BulkCreateMenuItemsDto,
  CreateMenuItemDto,
  ListMenuItemsDto,
  UpdateMenuItemDto,
} from './dto';
import { MenuItemRepository } from './item.repository';

@Injectable()
export class MenuItemService {
  constructor(
    private readonly itemRepository: MenuItemRepository,
    private readonly prisma: PrismaService,
    private readonly storageService?: StorageService,
  ) {}

  async create(user: AuthUserContext, dto: CreateMenuItemDto) {
    const restaurantId = await this.resolveRestaurantId(user, dto.restaurantId);
    await this.validateCategory(restaurantId, dto.categoryId);
    await this.assertModifierOverridesBelongToRestaurant(
      restaurantId,
      dto.modifierPriceOverrides,
    );
    await this.assertVariationModifierOverridesBelongToRestaurant(
      restaurantId,
      dto.variationPriceOverrides,
    );

    const slug = this.normalizeRequiredString(dto.slug, 'slug');
    const sku = this.resolveOptionalString(dto.sku);
    const pricing = this.resolvePricingInput(dto);
    await this.assertUniqueFields(restaurantId, { slug, sku });

    const data = await this.prisma.$transaction(async (tx) => {
      const created = await this.itemRepository.create(
        {
          restaurant: { connect: { id: restaurantId } },
          category: { connect: { id: dto.categoryId } },
          name: dto.name,
          slug,
          description: dto.description,
          ingredients: dto.ingredients,
          nutritionalInformation: dto.nutritionalInformation,
          imageUrl: dto.imageUrl,
          sku,
          pricingMode: pricing.pricingMode,
          basePrice: new Prisma.Decimal(dto.basePrice),
          deliveryPriceAdjustment: pricing.deliveryPriceAdjustment,
          takeawayPriceAdjustment: pricing.takeawayPriceAdjustment,
          prepTimeMinutes: dto.prepTimeMinutes,
          dietaryFlags: this.toStoredDietaryFlags(
            dto.dietaryFlags,
            dto.supportsSplitPizza,
          ) as unknown as Prisma.InputJsonValue,
          allergenFlags: dto.allergenFlags as unknown as Prisma.InputJsonValue,
          depositAmount:
            dto.depositAmount !== undefined
              ? new Prisma.Decimal(dto.depositAmount)
              : undefined,
          isActive: dto.isActive ?? true,
        },
        tx,
      );

      await this.syncModifierPriceOverrides(
        created.id,
        dto.modifierPriceOverrides,
        tx,
      );
      await this.syncVariationPriceOverrides(
        created.id,
        dto.categoryId,
        dto.variationPriceOverrides,
        tx,
      );

      return created;
    });

    return {
      data: await this.resolveMediaResponse(this.withSplitPizzaMetadata(data)),
      message: 'Menu item created successfully',
    };
  }

  async createBulk(user: AuthUserContext, dto: BulkCreateMenuItemsDto) {
    const restaurantId = await this.resolveRestaurantId(user, dto.restaurantId);

    if (!dto.items.length) {
      throw new BadRequestException('At least one item is required');
    }

    for (const item of dto.items) {
      await this.validateCategory(restaurantId, item.categoryId);
    }

    const payload: Prisma.MenuItemCreateManyInput[] = dto.items.map((item) => {
      const pricing = this.resolvePricingInput(item);

      return {
        restaurantId,
        categoryId: item.categoryId,
        name: item.name,
        slug: item.slug,
        description: item.description,
        ingredients: item.ingredients,
        nutritionalInformation: item.nutritionalInformation,
        imageUrl: item.imageUrl,
        sku: item.sku,
        pricingMode: pricing.pricingMode,
        basePrice: new Prisma.Decimal(item.basePrice),
        deliveryPriceAdjustment: pricing.deliveryPriceAdjustment,
        takeawayPriceAdjustment: pricing.takeawayPriceAdjustment,
        prepTimeMinutes: item.prepTimeMinutes,
        dietaryFlags: this.toStoredDietaryFlags(
          item.dietaryFlags,
          item.supportsSplitPizza,
        ) as unknown as Prisma.InputJsonValue,
        allergenFlags: item.allergenFlags as unknown as Prisma.InputJsonValue,
        depositAmount:
          item.depositAmount !== undefined
            ? new Prisma.Decimal(item.depositAmount)
            : undefined,
        isActive: item.isActive ?? true,
      };
    });

    const result = await this.itemRepository.createMany(payload);

    return {
      data: { count: result.count },
      message: 'Menu items created successfully',
    };
  }

  async list(user: AuthUserContext, query: ListMenuItemsDto) {
    const restaurantId = await this.resolveRestaurantIdForList(
      user,
      query.restaurantId,
    );
    const { items, total } = await this.itemRepository.list(
      restaurantId,
      query,
    );

    return {
      data: await this.resolveMediaResponse(
        items.map((item) =>
          this.withSplitPizzaMetadata(this.withCategoryModifierGroups(item)),
        ),
      ),
      message: 'Menu items fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async update(user: AuthUserContext, id: string, dto: UpdateMenuItemDto) {
    const item = await this.itemRepository.findById(id);
    if (!item || item.deletedAt) {
      throw new NotFoundException('Menu item not found');
    }

    await this.ensureCanAccessRestaurant(user, item.restaurantId);

    if (dto.categoryId) {
      await this.validateCategory(item.restaurantId, dto.categoryId);
    }
    await this.assertModifierOverridesBelongToRestaurant(
      item.restaurantId,
      dto.modifierPriceOverrides,
    );
    await this.assertVariationModifierOverridesBelongToRestaurant(
      item.restaurantId,
      dto.variationPriceOverrides,
    );

    const slug =
      dto.slug !== undefined
        ? this.normalizeRequiredString(dto.slug, 'slug')
        : undefined;
    const sku =
      dto.sku !== undefined ? this.resolveOptionalString(dto.sku) : undefined;
    const pricing = this.resolvePricingInput(dto, item);
    await this.assertUniqueFields(item.restaurantId, { slug, sku }, id);

    const data = await this.prisma.$transaction(async (tx) => {
      const updated = await this.itemRepository.update(
        id,
        {
          category: dto.categoryId
            ? { connect: { id: dto.categoryId } }
            : undefined,
          name: dto.name,
          slug,
          description: dto.description,
          ingredients: dto.ingredients,
          nutritionalInformation: dto.nutritionalInformation,
          imageUrl: dto.imageUrl,
          sku,
          pricingMode: pricing.pricingMode,
          basePrice:
            dto.basePrice !== undefined
              ? new Prisma.Decimal(dto.basePrice)
              : undefined,
          deliveryPriceAdjustment: pricing.deliveryPriceAdjustment,
          takeawayPriceAdjustment: pricing.takeawayPriceAdjustment,
          prepTimeMinutes: dto.prepTimeMinutes,
          dietaryFlags: this.toStoredDietaryFlags(
            dto.dietaryFlags,
            dto.supportsSplitPizza,
            item.dietaryFlags,
          ) as unknown as Prisma.InputJsonValue,
          allergenFlags: dto.allergenFlags as unknown as Prisma.InputJsonValue,
          depositAmount:
            dto.depositAmount !== undefined
              ? new Prisma.Decimal(dto.depositAmount)
              : undefined,
          isActive: dto.isActive,
        },
        tx,
      );

      if (dto.modifierPriceOverrides !== undefined) {
        await this.syncModifierPriceOverrides(
          id,
          dto.modifierPriceOverrides,
          tx,
        );
      }

      if (dto.categoryId || dto.variationPriceOverrides !== undefined) {
        await this.syncVariationPriceOverrides(
          id,
          dto.categoryId ?? item.categoryId,
          dto.variationPriceOverrides,
          tx,
        );
      }

      return updated;
    });

    return {
      data: await this.resolveMediaResponse(this.withSplitPizzaMetadata(data)),
      message: 'Menu item updated successfully',
    };
  }

  async remove(user: AuthUserContext, id: string) {
    const item = await this.itemRepository.findById(id);
    if (!item || item.deletedAt) {
      throw new NotFoundException('Menu item not found');
    }

    await this.ensureCanAccessRestaurant(user, item.restaurantId);

    const orderItemsCount = await this.itemRepository.countOrderItems(id);

    if (orderItemsCount > 0) {
      throw new BadRequestException(
        'Menu item cannot be permanently deleted because it is used in orders',
      );
    }

    const data = await this.prisma.$transaction(async (tx) => {
      await this.itemRepository.deleteMenuLinks(id, tx);
      await this.itemRepository.deleteModifierLinks(id, tx);
      await this.itemRepository.deleteBranchOverrides(id, tx);
      await this.itemRepository.deleteRecipes(id, tx);
      await this.itemRepository.clearCouponScopes(id, tx);
      return this.itemRepository.hardDelete(id, tx);
    });

    return { data, message: 'Menu item deleted successfully' };
  }

  private async resolveRestaurantId(
    user: AuthUserContext,
    requestedRestaurantId?: string,
  ): Promise<string> {
    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      if (!user.tid) {
        throw new ForbiddenException('Tenant context is required');
      }

      if (!requestedRestaurantId) {
        throw new BadRequestException('restaurantId is required');
      }

      await this.assertRestaurantInTenant(user.tid, requestedRestaurantId);
      return requestedRestaurantId;
    }

    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      if (!requestedRestaurantId) {
        throw new BadRequestException('restaurantId is required');
      }

      return requestedRestaurantId;
    }

    throw new ForbiddenException(
      'Insufficient permissions for menu item write',
    );
  }

  private async resolveRestaurantIdForList(
    user: AuthUserContext,
    requestedRestaurantId?: string,
  ): Promise<string | undefined> {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return requestedRestaurantId;
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      if (!user.tid) {
        throw new ForbiddenException('Tenant context is required');
      }

      if (requestedRestaurantId) {
        await this.assertRestaurantInTenant(user.tid, requestedRestaurantId);
      }

      return requestedRestaurantId;
    }

    if (
      user.role === UserRoleEnum.BRANCH_ADMIN ||
      user.role === UserRoleEnum.CUSTOMER
    ) {
      if (!user.rid) {
        throw new ForbiddenException('Restaurant context is required');
      }

      if (requestedRestaurantId && requestedRestaurantId !== user.rid) {
        throw new ForbiddenException(
          'You cannot access resources outside your restaurant',
        );
      }

      return user.rid;
    }

    throw new ForbiddenException('Insufficient permissions for menu items');
  }

  private async ensureCanAccessRestaurant(
    user: AuthUserContext,
    restaurantId: string,
  ) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return;
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      if (!user.tid) {
        throw new ForbiddenException('Tenant context is required');
      }

      await this.assertRestaurantInTenant(user.tid, restaurantId);
      return;
    }

    if (user.rid !== restaurantId) {
      throw new ForbiddenException(
        'You cannot access resources outside your restaurant',
      );
    }
  }

  private async assertRestaurantInTenant(
    tenantId: string,
    restaurantId: string,
  ) {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { id: restaurantId, tenantId, deletedAt: null },
      select: { id: true },
    });

    if (!restaurant) {
      throw new ForbiddenException(
        'You cannot access resources outside your tenant restaurants',
      );
    }
  }

  private async assertUniqueFields(
    restaurantId: string,
    fields: { slug?: string; sku?: string | undefined },
    excludeId?: string,
  ) {
    if (fields.slug) {
      const existingBySlug = await this.itemRepository.findByRestaurantAndSlug(
        restaurantId,
        fields.slug,
        excludeId,
      );

      if (existingBySlug) {
        throw new BadRequestException(
          existingBySlug.deletedAt
            ? 'A menu item with this slug already exists in this restaurant, including a deleted item'
            : 'A menu item with this slug already exists in this restaurant',
        );
      }
    }

    if (fields.sku) {
      const existingBySku = await this.itemRepository.findByRestaurantAndSku(
        restaurantId,
        fields.sku,
        excludeId,
      );

      if (existingBySku) {
        throw new BadRequestException(
          existingBySku.deletedAt
            ? 'A menu item with this SKU already exists in this restaurant, including a deleted item'
            : 'A menu item with this SKU already exists in this restaurant',
        );
      }
    }
  }

  private normalizeRequiredString(value: string, field: string) {
    const normalized = value.trim();

    if (!normalized) {
      throw new BadRequestException(`${field} is required`);
    }

    return normalized;
  }

  private resolveOptionalString(value: string | null | undefined) {
    if (value === undefined || value === null) {
      return undefined;
    }

    const normalized = value.trim();
    return normalized.length ? normalized : undefined;
  }

  private async validateCategory(restaurantId: string, categoryId: string) {
    const category = await this.prisma.menuCategory.findFirst({
      where: {
        id: categoryId,
        restaurantId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!category) {
      throw new BadRequestException('Category not found in restaurant');
    }
  }

  private async assertModifierOverridesBelongToRestaurant(
    restaurantId: string,
    overrides: Array<{ modifierId: string; priceDelta: number }> | undefined,
  ) {
    if (!overrides?.length) {
      return;
    }

    const modifierIds = [...new Set(overrides.map((item) => item.modifierId))];
    const count = await this.prisma.modifier.count({
      where: {
        id: { in: modifierIds },
        deletedAt: null,
        restaurantId,
        groupLinks: {
          some: {
            modifierGroup: {
              restaurantId,
              deletedAt: null,
            },
          },
        },
      },
    });

    if (count !== modifierIds.length) {
      throw new BadRequestException(
        'One or more modifier price overrides are invalid for this restaurant',
      );
    }
  }

  private async assertVariationModifierOverridesBelongToRestaurant(
    restaurantId: string,
    overrides:
      | Array<{
          modifierPriceOverrides?: Array<{
            modifierId: string;
            priceDelta: number;
          }>;
        }>
      | undefined,
  ) {
    const flattened = (overrides ?? []).flatMap(
      (override) => override.modifierPriceOverrides ?? [],
    );

    await this.assertModifierOverridesBelongToRestaurant(
      restaurantId,
      flattened,
    );
  }

  private async syncModifierPriceOverrides(
    menuItemId: string,
    overrides: Array<{ modifierId: string; priceDelta: number }> | undefined,
    tx: Prisma.TransactionClient,
  ) {
    await tx.menuItemModifierPriceOverride.deleteMany({
      where: { menuItemId },
    });

    if (!overrides?.length) {
      return;
    }

    await tx.menuItemModifierPriceOverride.createMany({
      data: overrides.map((item) => ({
        menuItemId,
        modifierId: item.modifierId,
        priceDelta: new Prisma.Decimal(item.priceDelta),
      })),
    });
  }

  private async syncVariationPriceOverrides(
    menuItemId: string,
    categoryId: string,
    overrides:
      | Array<{
          variationId: string;
          pricingMode?: VariationPricingMode;
          price?: number;
          adjustmentValue?: number;
          modifierPriceOverrides?: Array<{
            modifierId: string;
            priceDelta: number;
          }>;
        }>
      | undefined,
    tx: Prisma.TransactionClient,
  ) {
    const variations = await tx.menuItemVariation.findMany({
      where: {
        categoryId,
        deletedAt: null,
      },
      select: {
        id: true,
        pricingMode: true,
        price: true,
        adjustmentValue: true,
      },
    });

    const overrideMap = new Map(
      (overrides ?? []).map((item) => [item.variationId, item]),
    );

    if (overrideMap.size !== (overrides ?? []).length) {
      throw new BadRequestException(
        'Variation price overrides must contain unique variationIds',
      );
    }

    const categoryVariationIds = new Set(variations.map((item) => item.id));
    for (const variationId of overrideMap.keys()) {
      if (!categoryVariationIds.has(variationId)) {
        throw new BadRequestException(
          'One or more variation price overrides are invalid for this category',
        );
      }
    }

    await tx.menuItemVariationPriceOverride.deleteMany({
      where: { menuItemId },
    });
    await tx.menuVariationModifierPriceOverride.deleteMany({
      where: { menuItemId },
    });

    if (!variations.length) {
      return;
    }

    await tx.menuItemVariationPriceOverride.createMany({
      data: variations.map((variation) => {
        const override = overrideMap.get(variation.id);
        const pricing = this.resolveVariationPricingInput(override, variation);

        return {
          menuItemId,
          variationId: variation.id,
          pricingMode: pricing.pricingMode,
          price: pricing.price,
          adjustmentValue: pricing.adjustmentValue,
        };
      }),
    });

    const modifierPriceOverrides = (overrides ?? []).flatMap((override) =>
      (override.modifierPriceOverrides ?? []).map((modifierOverride) => ({
        menuItemId,
        variationId: override.variationId,
        modifierId: modifierOverride.modifierId,
        priceDelta: new Prisma.Decimal(modifierOverride.priceDelta),
      })),
    );

    if (!modifierPriceOverrides.length) {
      return;
    }

    await tx.menuVariationModifierPriceOverride.createMany({
      data: modifierPriceOverrides,
    });
  }

  private readonly splitPizzaDietaryFlag = '__SPLIT_PIZZA_ENABLED__';

  private toStoredDietaryFlags(
    dietaryFlags: string[] | undefined,
    supportsSplitPizza?: boolean,
    existingDietaryFlags?: unknown,
  ) {
    const currentFlags =
      dietaryFlags ?? this.readStringArray(existingDietaryFlags) ?? [];
    const nextFlags = currentFlags.filter(
      (flag) => flag !== this.splitPizzaDietaryFlag,
    );

    if (supportsSplitPizza) {
      nextFlags.push(this.splitPizzaDietaryFlag);
    }

    return nextFlags;
  }

  private withSplitPizzaMetadata<T extends Record<string, unknown>>(
    item: T,
  ): T {
    const dietaryFlags = this.readStringArray(item.dietaryFlags);
    const supportsSplitPizza = dietaryFlags.includes(
      this.splitPizzaDietaryFlag,
    );
    const publicDietaryFlags = dietaryFlags.filter(
      (flag) => flag !== this.splitPizzaDietaryFlag,
    );
    const category =
      item.category &&
      typeof item.category === 'object' &&
      !Array.isArray(item.category)
        ? (item.category as {
            items?: Array<{ id: string; name: string; slug: string }>;
          })
        : undefined;

    return {
      ...item,
      dietaryFlags: publicDietaryFlags,
      supportsSplitPizza,
      splitPizza: supportsSplitPizza
        ? {
            enabled: true,
            slots: ['LEFT', 'RIGHT'],
            pricingRule: 'HIGHEST_HALF',
            allowedFlavors: (category?.items ?? []).map((candidate) => ({
              id: candidate.id,
              name: candidate.name,
              slug: candidate.slug,
            })),
          }
        : null,
    };
  }

  private readStringArray(input: unknown): string[] {
    if (!Array.isArray(input)) {
      return [];
    }

    return input.filter((value): value is string => typeof value === 'string');
  }

  private async resolveMediaResponse<T>(data: T) {
    return (await this.storageService?.resolveMediaUrlsDeep(data)) ?? data;
  }

  private resolvePricingInput(
    dto: CreateMenuItemDto | UpdateMenuItemDto,
    existing?: {
      [key: string]: unknown;
      pricingMode?: MenuItemPricingMode | null;
      deliveryPriceAdjustment?: Prisma.Decimal | null;
      takeawayPriceAdjustment?: Prisma.Decimal | null;
    },
  ) {
    const pricingMode =
      (dto.pricingMode as MenuItemPricingMode | undefined) ??
      existing?.pricingMode ??
      MenuItemPricingMode.SINGLE;

    if (pricingMode === MenuItemPricingMode.SINGLE) {
      const zero = new Prisma.Decimal(0);
      return {
        pricingMode,
        deliveryPriceAdjustment: zero,
        takeawayPriceAdjustment: zero,
      };
    }

    return {
      pricingMode,
      deliveryPriceAdjustment: new Prisma.Decimal(
        dto.deliveryPriceAdjustment ?? existing?.deliveryPriceAdjustment ?? 0,
      ),
      takeawayPriceAdjustment: new Prisma.Decimal(
        dto.takeawayPriceAdjustment ?? existing?.takeawayPriceAdjustment ?? 0,
      ),
    };
  }

  private resolveVariationPricingInput(
    override:
      | {
          pricingMode?: VariationPricingMode;
          price?: number;
          adjustmentValue?: number;
        }
      | undefined,
    existing: {
      pricingMode: VariationPricingMode;
      price: Prisma.Decimal;
      adjustmentValue: Prisma.Decimal | null;
    },
  ) {
    const pricingMode = override?.pricingMode ?? existing.pricingMode;

    if (pricingMode === VariationPricingMode.FIXED) {
      const nextPrice = override?.price ?? existing.price;

      return {
        pricingMode,
        price: new Prisma.Decimal(nextPrice),
        adjustmentValue: null,
      };
    }

    const nextAdjustmentValue =
      override?.adjustmentValue ?? existing.adjustmentValue;

    if (nextAdjustmentValue === undefined || nextAdjustmentValue === null) {
      throw new BadRequestException(
        'adjustmentValue is required for non-fixed variation pricing',
      );
    }

    return {
      pricingMode,
      price:
        override?.price !== undefined
          ? new Prisma.Decimal(override.price)
          : existing.price,
      adjustmentValue: new Prisma.Decimal(nextAdjustmentValue),
    };
  }

  private withCategoryModifierGroups<T extends { category?: unknown }>(
    item: T,
  ) {
    const rawCategory = item.category;

    if (
      !rawCategory ||
      typeof rawCategory !== 'object' ||
      Array.isArray(rawCategory)
    ) {
      return item;
    }

    const category = rawCategory as {
      modifierLinks?: Array<{
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
              priceDelta: Prisma.Decimal;
            };
          }>;
        };
      }>;
    };

    return {
      ...item,
      categoryModifierGroups: (category.modifierLinks ?? []).map((link) => ({
        id: link.modifierGroup.id,
        name: link.modifierGroup.name,
        description: link.modifierGroup.description ?? null,
        minSelect: link.modifierGroup.minSelect,
        maxSelect: link.modifierGroup.maxSelect,
        isRequired: link.modifierGroup.isRequired,
        sortOrder: link.sortOrder,
        modifiers: link.modifierGroup.modifierLinks.map(
          ({ modifier, sortOrder }) => ({
            id: modifier.id,
            name: modifier.name,
            priceDelta: modifier.priceDelta,
            sortOrder,
          }),
        ),
      })),
    };
  }
}
