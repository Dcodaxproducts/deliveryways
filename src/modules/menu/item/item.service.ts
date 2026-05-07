import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MenuItemPricingMode, Prisma } from '@prisma/client';
import { AuthUserContext } from '../../../common/decorators';
import { UserRoleEnum } from '../../../common/enums';
import { buildPaginationMeta } from '../../../common/utils';
import { PrismaService } from '../../../database';
import { StorageService } from '../../storage/storage.service';
import {
  BulkCreateMenuItemsDto,
  CreateMenuItemDto,
  ListMenuItemsDto,
  ReorderMenuItemsDto,
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
    const modifiers = this.resolveDirectModifiers(dto);
    await this.validateCategory(restaurantId, dto.categoryId);
    await this.assertModifierOverridesBelongToRestaurant(
      restaurantId,
      modifiers,
    );
    await this.assertVariationModifierOverridesBelongToRestaurant(
      restaurantId,
      dto.variationPriceOverrides,
    );

    const slug = await this.resolveUniqueSlug(
      restaurantId,
      dto.slug ?? dto.name,
    );
    const sku = this.resolveOptionalString(dto.sku);
    const pricing = this.resolvePricingInput(dto);
    await this.assertUniqueFields(restaurantId, { sku });

    const data = await this.createItemWithAssignments(
      restaurantId,
      dto,
      slug,
      sku,
      pricing,
      modifiers,
    );

    return {
      data: await this.resolveMediaResponse(this.withSplitPizzaMetadata(data)),
      message: 'Menu item created successfully',
    };
  }

  private async createItemWithAssignments(
    restaurantId: string,
    dto: CreateMenuItemDto,
    slug: string,
    sku: string | undefined,
    pricing: {
      pricingMode: MenuItemPricingMode;
      deliveryPriceAdjustment: Prisma.Decimal;
      takeawayPriceAdjustment: Prisma.Decimal;
    },
    modifiers: Array<{ modifierId: string; priceDelta: number }> | undefined,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await this.itemRepository.create(
          {
            restaurant: { connect: { id: restaurantId } },
            category: { connect: { id: dto.categoryId } },
            name: dto.name,
            slug,
            description: dto.description,
            ingredients: dto.ingredients,
            allergenPdfUrl: dto.allergenPdfUrl,
            nutritionalInformation: dto.nutritionalInformation,
            imageUrl: dto.imageUrl,
            sku,
            sortOrder: dto.sortOrder ?? 0,
            pricingMode: pricing.pricingMode,
            basePrice: new Prisma.Decimal(dto.basePrice),
            deliveryPriceAdjustment: pricing.deliveryPriceAdjustment,
            takeawayPriceAdjustment: pricing.takeawayPriceAdjustment,
            prepTimeMinutes: dto.prepTimeMinutes,
            dietaryFlags: this.toStoredDietaryFlags(
              dto.dietaryFlags,
              dto.supportsSplitPizza,
            ) as unknown as Prisma.InputJsonValue,
            allergenFlags:
              dto.allergenFlags as unknown as Prisma.InputJsonValue,
            depositAmount:
              dto.depositAmount !== undefined
                ? new Prisma.Decimal(dto.depositAmount)
                : undefined,
            isActive: dto.isActive ?? true,
          },
          tx,
        );

        await this.syncModifierPriceOverrides(created.id, modifiers, tx);
        await this.syncVariationPriceOverrides(
          created.id,
          restaurantId,
          dto.variationPriceOverrides,
          tx,
        );

        return created;
      });
    } catch (error) {
      this.throwMenuItemUniqueError(error);
      throw error;
    }
  }

  async createBulk(user: AuthUserContext, dto: BulkCreateMenuItemsDto) {
    const restaurantId = await this.resolveRestaurantId(user, dto.restaurantId);

    if (!dto.items.length) {
      throw new BadRequestException('At least one item is required');
    }

    for (const item of dto.items) {
      await this.validateCategory(restaurantId, item.categoryId);
    }

    const usedSlugs = new Set<string>();
    const payload: Prisma.MenuItemCreateManyInput[] = [];

    for (const item of dto.items) {
      const pricing = this.resolvePricingInput(item);
      const slug = await this.resolveUniqueSlug(
        restaurantId,
        item.slug ?? item.name,
        undefined,
        usedSlugs,
      );
      usedSlugs.add(slug);

      payload.push({
        restaurantId,
        categoryId: item.categoryId,
        name: item.name,
        slug,
        description: item.description,
        ingredients: item.ingredients,
        allergenPdfUrl: item.allergenPdfUrl,
        nutritionalInformation: item.nutritionalInformation,
        imageUrl: item.imageUrl,
        sku: item.sku,
        sortOrder: item.sortOrder ?? 0,
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
      });
    }

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
          this.withRestaurantAllergenPdfUrl(
            this.withoutLegacyModifierGroups(this.withSplitPizzaMetadata(item)),
          ),
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
    const modifiers = this.resolveDirectModifiers(dto);

    if (dto.categoryId) {
      await this.validateCategory(item.restaurantId, dto.categoryId);
    }
    await this.assertModifierOverridesBelongToRestaurant(
      item.restaurantId,
      modifiers,
    );
    await this.assertVariationModifierOverridesBelongToRestaurant(
      item.restaurantId,
      dto.variationPriceOverrides,
    );

    const slug =
      dto.slug !== undefined
        ? await this.resolveUniqueSlug(item.restaurantId, dto.slug, id)
        : undefined;
    const sku =
      dto.sku !== undefined ? this.resolveOptionalString(dto.sku) : undefined;
    const pricing = this.resolvePricingInput(dto, item);
    await this.assertUniqueFields(item.restaurantId, { sku }, id);

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
          allergenPdfUrl: dto.allergenPdfUrl,
          nutritionalInformation: dto.nutritionalInformation,
          imageUrl: dto.imageUrl,
          sku,
          sortOrder: dto.sortOrder ?? 0,
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

      if (
        dto.modifiers !== undefined ||
        dto.modifierPriceOverrides !== undefined
      ) {
        await this.syncModifierPriceOverrides(id, modifiers, tx);
      }

      if (dto.categoryId || dto.variationPriceOverrides !== undefined) {
        await this.syncVariationPriceOverrides(
          id,
          item.restaurantId,
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

  async reorder(user: AuthUserContext, dto: ReorderMenuItemsDto) {
    if (!dto.items.length) {
      throw new BadRequestException('At least one item is required');
    }

    const ids = dto.items.map((item) => item.id);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Menu item reorder ids must be unique');
    }

    if (dto.menuId) {
      const menu = await this.prisma.restaurantMenu.findUnique({
        where: { id: dto.menuId },
        select: { id: true, restaurantId: true, deletedAt: true },
      });

      if (!menu || menu.deletedAt) {
        throw new NotFoundException('Restaurant menu not found');
      }

      await this.ensureCanAccessRestaurant(user, menu.restaurantId);

      const links = await this.prisma.restaurantMenuItem.findMany({
        where: { restaurantMenuId: dto.menuId, menuItemId: { in: ids } },
        select: { id: true, menuItemId: true },
      });

      if (links.length !== ids.length) {
        throw new BadRequestException('All items must be attached to the menu');
      }

      const sortOrderByItemId = new Map(
        dto.items.map((item) => [item.id, item.sortOrder]),
      );

      await this.prisma.$transaction(
        links.map((link) =>
          this.prisma.restaurantMenuItem.update({
            where: { id: link.id },
            data: { sortOrder: sortOrderByItemId.get(link.menuItemId) ?? 0 },
          }),
        ),
      );
    } else {
      const items = await this.prisma.menuItem.findMany({
        where: { id: { in: ids }, deletedAt: null },
        select: { id: true, restaurantId: true },
      });

      if (items.length !== ids.length) {
        throw new BadRequestException('One or more menu items were not found');
      }

      const restaurantIds = new Set(items.map((item) => item.restaurantId));
      if (restaurantIds.size !== 1) {
        throw new BadRequestException(
          'All menu items must belong to one restaurant',
        );
      }

      await this.ensureCanAccessRestaurant(user, [...restaurantIds][0]);

      const sortOrderById = new Map(
        dto.items.map((item) => [item.id, item.sortOrder]),
      );
      await this.prisma.$transaction(
        items.map((item) =>
          this.prisma.menuItem.update({
            where: { id: item.id },
            data: { sortOrder: sortOrderById.get(item.id) ?? 0 },
          }),
        ),
      );
    }

    return {
      data: { count: dto.items.length },
      message: 'Menu items reordered successfully',
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
    fields: { sku?: string | undefined },
    excludeId?: string,
  ) {
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

  private throwMenuItemUniqueError(error: unknown) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return;
    }

    const target = Array.isArray(error.meta?.target)
      ? (error.meta?.target as string[])
      : [];

    if (target.includes('slug')) {
      throw new BadRequestException(
        'A menu item with this slug already exists in this restaurant',
      );
    }

    if (target.includes('sku')) {
      throw new BadRequestException(
        'A menu item with this SKU already exists in this restaurant',
      );
    }

    if (target.includes('modifier_id')) {
      throw new BadRequestException(
        'Modifier assignments must contain unique modifierIds',
      );
    }

    if (target.includes('variation_id')) {
      throw new BadRequestException(
        'Variation price overrides must contain unique variationIds',
      );
    }

    throw new BadRequestException(
      'Menu item contains a duplicate unique assignment',
    );
  }

  private async resolveUniqueSlug(
    restaurantId: string,
    value: string,
    excludeId?: string,
    reservedSlugs: Set<string> = new Set<string>(),
  ) {
    const baseSlug = this.slugify(value);
    let candidate = baseSlug;
    let suffix = 2;

    while (
      reservedSlugs.has(candidate) ||
      (await this.itemRepository.findByRestaurantAndSlug(
        restaurantId,
        candidate,
        excludeId,
      ))
    ) {
      candidate = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    return candidate;
  }

  private slugify(value: string) {
    const slug = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');

    if (!slug) {
      throw new BadRequestException('slug source is required');
    }

    return slug;
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
    this.assertUniqueModifierOverrides(overrides);

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

  private resolveDirectModifiers(
    dto: Pick<
      CreateMenuItemDto | UpdateMenuItemDto,
      'modifiers' | 'modifierPriceOverrides'
    >,
  ) {
    return dto.modifiers ?? dto.modifierPriceOverrides;
  }

  private async syncVariationPriceOverrides(
    menuItemId: string,
    restaurantId: string,
    overrides:
      | Array<{
          variationId: string;
          price: number;
          pickupPrice?: number;
          displayText?: string;
          modifierPriceOverrides?: Array<{
            modifierId: string;
            priceDelta: number;
          }>;
        }>
      | undefined,
    tx: Prisma.TransactionClient,
  ) {
    const overrideMap = new Map(
      (overrides ?? []).map((item) => [item.variationId, item]),
    );

    if (overrideMap.size !== (overrides ?? []).length) {
      throw new BadRequestException(
        'Variation price overrides must contain unique variationIds',
      );
    }

    const variations = overrideMap.size
      ? await tx.menuItemVariation.findMany({
          where: {
            id: { in: [...overrideMap.keys()] },
            restaurantId,
            deletedAt: null,
          },
          select: { id: true },
        })
      : [];

    if (variations.length !== overrideMap.size) {
      throw new BadRequestException(
        'One or more variation price overrides are invalid for this restaurant',
      );
    }

    await tx.menuItemVariationPriceOverride.deleteMany({
      where: { menuItemId },
    });
    await tx.menuVariationModifierPriceOverride.deleteMany({
      where: { menuItemId },
    });

    if (!overrides?.length) {
      return;
    }

    await tx.menuItemVariationPriceOverride.createMany({
      data: overrides.map((override) => ({
        menuItemId,
        variationId: override.variationId,
        price: new Prisma.Decimal(override.price),
        pickupPrice:
          override.pickupPrice !== undefined
            ? new Prisma.Decimal(override.pickupPrice)
            : null,
        displayText: this.resolveNullableString(override.displayText),
      })),
    });

    for (const override of overrides) {
      this.assertUniqueModifierOverrides(override.modifierPriceOverrides);
    }

    const modifierPriceOverrides = overrides.flatMap((override) =>
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

  private assertUniqueModifierOverrides(
    overrides: Array<{ modifierId: string }> | undefined,
  ) {
    if (!overrides?.length) {
      return;
    }

    const modifierIds = overrides.map((item) => item.modifierId);
    if (new Set(modifierIds).size !== modifierIds.length) {
      throw new BadRequestException(
        'Modifier assignments must contain unique modifierIds',
      );
    }
  }

  private resolveNullableString(value: string | null | undefined) {
    if (value === undefined || value === null) {
      return null;
    }

    const normalized = value.trim();
    return normalized.length ? normalized : null;
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

  private withRestaurantAllergenPdfUrl<T extends Record<string, unknown>>(
    item: T,
  ): T {
    const restaurantSettings =
      item.restaurant &&
      typeof item.restaurant === 'object' &&
      !Array.isArray(item.restaurant)
        ? (item.restaurant as { settings?: unknown }).settings
        : undefined;
    const restaurantAllergenPdfUrl =
      this.readStringPath(restaurantSettings, [
        'customerApp',
        'allergenPdfUrl',
      ]) ??
      this.readStringPath(restaurantSettings, [
        'customerApp',
        'allergensPdfUrl',
      ]) ??
      this.readStringPath(restaurantSettings, ['allergenPdfUrl']) ??
      this.readStringPath(restaurantSettings, ['allergensPdfUrl']);

    let restaurant = item.restaurant;
    if (
      item.restaurant &&
      typeof item.restaurant === 'object' &&
      !Array.isArray(item.restaurant)
    ) {
      restaurant = { ...(item.restaurant as Record<string, unknown>) };
      delete (restaurant as Record<string, unknown>).settings;
    }

    return {
      ...item,
      restaurant,
      allergenPdfUrl: restaurantAllergenPdfUrl ?? item.allergenPdfUrl ?? null,
    };
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

  private readStringPath(input: unknown, path: string[]) {
    let cursor = input;

    for (const key of path) {
      if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) {
        return null;
      }

      cursor = (cursor as Record<string, unknown>)[key];
    }

    return typeof cursor === 'string' && cursor.trim().length
      ? cursor.trim()
      : null;
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

  private withoutLegacyModifierGroups<T extends { category?: unknown }>(
    item: T,
  ) {
    const rest = { ...(item as Record<string, unknown>) };
    delete rest.modifierLinks;
    delete rest.categoryModifierGroups;

    if (
      !rest.category ||
      typeof rest.category !== 'object' ||
      Array.isArray(rest.category)
    ) {
      return rest as T;
    }

    const category = { ...(rest.category as Record<string, unknown>) };
    delete category.modifierLinks;

    return {
      ...rest,
      category,
    } as T;
  }
}
