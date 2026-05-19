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
  AllergenAdditiveTemplateEntryDto,
  BulkCreateMenuItemsDto,
  CreateProductLabelDto,
  CreateMenuItemDto,
  DEFAULT_MENU_ITEM_LABELS,
  DuplicateMenuItemDto,
  ListMenuItemsDto,
  ReorderMenuItemsDto,
  UpdateAllergenAdditiveTemplateEntryDto,
  UpdateAllergenAdditiveTemplatesDto,
  UpdateMenuItemDto,
  UpdateProductLabelDto,
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
    this.assertSelectionLimits(dto);
    await this.assertKnownLabels(restaurantId, dto.labels ?? dto.dietaryFlags);
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
              dto.labels ?? dto.dietaryFlags,
              dto.supportsSplitPizza,
            ) as unknown as Prisma.InputJsonValue,
            allergenFlags: this.resolveAllergenCodes(
              dto,
            ) as unknown as Prisma.InputJsonValue,
            depositAmount:
              dto.depositAmount !== undefined
                ? new Prisma.Decimal(dto.depositAmount)
                : undefined,
            isRequired: dto.isRequired ?? false,
            minSelect: dto.minSelect ?? 0,
            maxSelect: dto.maxSelect ?? null,
            minQuantity: dto.minQuantity ?? 1,
            maxQuantity: dto.maxQuantity ?? null,
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
      this.assertSelectionLimits(item);
      await this.assertKnownLabels(
        restaurantId,
        item.labels ?? item.dietaryFlags,
      );
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
          item.labels ?? item.dietaryFlags,
          item.supportsSplitPizza,
        ) as unknown as Prisma.InputJsonValue,
        allergenFlags: this.resolveAllergenCodes(
          item,
        ) as unknown as Prisma.InputJsonValue,
        depositAmount:
          item.depositAmount !== undefined
            ? new Prisma.Decimal(item.depositAmount)
            : undefined,
        isRequired: item.isRequired ?? false,
        minSelect: item.minSelect ?? 0,
        maxSelect: item.maxSelect ?? null,
        minQuantity: item.minQuantity ?? 1,
        maxQuantity: item.maxQuantity ?? null,
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
    this.assertSelectionLimits(dto, item);
    await this.assertKnownLabels(
      item.restaurantId,
      dto.labels ?? dto.dietaryFlags,
    );
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
            dto.labels ?? dto.dietaryFlags,
            dto.supportsSplitPizza,
            item.dietaryFlags,
          ) as unknown as Prisma.InputJsonValue,
          allergenFlags:
            dto.allergenFlags !== undefined || dto.allergenCodes !== undefined
              ? (this.resolveAllergenCodes(
                  dto,
                ) as unknown as Prisma.InputJsonValue)
              : undefined,
          depositAmount:
            dto.depositAmount !== undefined
              ? new Prisma.Decimal(dto.depositAmount)
              : undefined,
          isRequired: dto.isRequired,
          minSelect: dto.minSelect,
          maxSelect: dto.maxSelect,
          minQuantity: dto.minQuantity,
          maxQuantity: dto.maxQuantity,
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

  async getLabels(user: AuthUserContext, requestedRestaurantId?: string) {
    const labels = await this.getProductLabelsForUser(
      user,
      requestedRestaurantId,
    );

    return {
      data: labels,
      message: 'Menu item labels fetched successfully',
    };
  }

  async createLabel(
    user: AuthUserContext,
    dto: CreateProductLabelDto,
    requestedRestaurantId?: string,
  ) {
    const state = await this.loadProductLabelState(user, requestedRestaurantId);
    const value = this.normalizeLabelValue(dto.value ?? dto.label);
    const label = dto.label.trim();

    if (!label) {
      throw new BadRequestException('label is required');
    }

    if (state.labels.some((item) => item.value === value)) {
      throw new BadRequestException('Product label already exists');
    }

    const labels = [...state.labels, { value, label }];
    await this.saveProductLabels(state.tenantId, state.settings, labels);

    return {
      data: { value, label },
      message: 'Menu item label created successfully',
    };
  }

  async updateLabel(
    user: AuthUserContext,
    value: string,
    dto: UpdateProductLabelDto,
    requestedRestaurantId?: string,
  ) {
    const state = await this.loadProductLabelState(user, requestedRestaurantId);
    const normalizedValue = this.normalizeLabelValue(value);
    const index = state.labels.findIndex(
      (item) => item.value === normalizedValue,
    );

    if (index === -1) {
      throw new NotFoundException('Product label not found');
    }

    const nextValue = dto.value
      ? this.normalizeLabelValue(dto.value)
      : normalizedValue;
    const nextLabel = dto.label?.trim() ?? state.labels[index].label;

    if (!nextLabel) {
      throw new BadRequestException('label is required');
    }

    if (
      nextValue !== normalizedValue &&
      state.labels.some((item) => item.value === nextValue)
    ) {
      throw new BadRequestException('Product label already exists');
    }

    if (nextValue !== normalizedValue) {
      await this.assertProductLabelNotInUse(state.tenantId, normalizedValue);
    }

    const labels = state.labels.map((item) =>
      item.value === normalizedValue
        ? { value: nextValue, label: nextLabel }
        : item,
    );
    await this.saveProductLabels(state.tenantId, state.settings, labels);

    return {
      data: { value: nextValue, label: nextLabel },
      message: 'Menu item label updated successfully',
    };
  }

  async deleteLabel(
    user: AuthUserContext,
    value: string,
    requestedRestaurantId?: string,
  ) {
    const state = await this.loadProductLabelState(user, requestedRestaurantId);
    const normalizedValue = this.normalizeLabelValue(value);
    const exists = state.labels.some((item) => item.value === normalizedValue);

    if (!exists) {
      throw new NotFoundException('Product label not found');
    }

    await this.assertProductLabelNotInUse(state.tenantId, normalizedValue);
    await this.saveProductLabels(
      state.tenantId,
      state.settings,
      state.labels.filter((item) => item.value !== normalizedValue),
    );

    return {
      data: { value: normalizedValue },
      message: 'Menu item label deleted successfully',
    };
  }

  async getAllergenAdditiveTemplates(
    user: AuthUserContext,
    requestedRestaurantId?: string,
  ) {
    const state = await this.loadAllergenAdditiveTemplateState(
      user,
      requestedRestaurantId,
    );

    return {
      data: state.templates,
      message: 'Allergen and additive templates fetched successfully',
    };
  }

  async updateAllergenAdditiveTemplates(
    user: AuthUserContext,
    dto: UpdateAllergenAdditiveTemplatesDto,
  ) {
    this.assertUniqueTemplateCodes(dto.allergens ?? [], 'allergens');
    this.assertUniqueTemplateCodes(dto.additives ?? [], 'additives');
    const state = await this.loadAllergenAdditiveTemplateState(
      user,
      dto.restaurantId,
    );
    const templates = {
      allergens: this.normalizeTemplateEntries(
        dto.allergens ?? state.templates.allergens,
      ),
      additives: this.normalizeTemplateEntries(
        dto.additives ?? state.templates.additives,
      ),
    };

    await this.saveAllergenAdditiveTemplates(
      state.tenantId,
      state.settings,
      templates,
    );

    return {
      data: templates,
      message: 'Allergen and additive templates updated successfully',
    };
  }

  async createAllergenAdditiveTemplateEntry(
    user: AuthUserContext,
    type: string,
    dto: AllergenAdditiveTemplateEntryDto,
    requestedRestaurantId?: string,
  ) {
    const templateType = this.resolveTemplateType(type);
    const { tenantId, settings, templates } =
      await this.loadAllergenAdditiveTemplateState(user, requestedRestaurantId);
    const entries = templates[templateType];
    const entry = { code: dto.code.trim(), label: dto.label.trim() };

    if (!entry.code || !entry.label) {
      throw new BadRequestException('code and label are required');
    }

    if (entries.some((item) => item.code === entry.code)) {
      throw new BadRequestException('Template code already exists');
    }

    const nextTemplates = {
      ...templates,
      [templateType]: [...entries, entry],
    };
    await this.saveAllergenAdditiveTemplates(tenantId, settings, nextTemplates);

    return {
      data: entry,
      message: 'Allergen/additive template entry created successfully',
    };
  }

  async updateAllergenAdditiveTemplateEntry(
    user: AuthUserContext,
    type: string,
    code: string,
    dto: UpdateAllergenAdditiveTemplateEntryDto,
    requestedRestaurantId?: string,
  ) {
    const templateType = this.resolveTemplateType(type);
    const { tenantId, settings, templates } =
      await this.loadAllergenAdditiveTemplateState(user, requestedRestaurantId);
    const entries = templates[templateType];
    const currentCode = code.trim();
    const index = entries.findIndex((entry) => entry.code === currentCode);

    if (index === -1) {
      throw new NotFoundException('Allergen/additive template entry not found');
    }

    const nextCode = dto.code?.trim() ?? currentCode;
    const nextLabel = dto.label?.trim() ?? entries[index].label;

    if (!nextCode || !nextLabel) {
      throw new BadRequestException('code and label are required');
    }

    if (
      nextCode !== currentCode &&
      entries.some((entry) => entry.code === nextCode)
    ) {
      throw new BadRequestException('Template code already exists');
    }

    if (nextCode !== currentCode) {
      await this.assertAllergenCodeNotInUse(tenantId, currentCode);
    }

    const nextEntry = { code: nextCode, label: nextLabel };
    const nextTemplates = {
      ...templates,
      [templateType]: entries.map((entry) =>
        entry.code === currentCode ? nextEntry : entry,
      ),
    };
    await this.saveAllergenAdditiveTemplates(tenantId, settings, nextTemplates);

    return {
      data: nextEntry,
      message: 'Allergen/additive template entry updated successfully',
    };
  }

  async deleteAllergenAdditiveTemplateEntry(
    user: AuthUserContext,
    type: string,
    code: string,
    requestedRestaurantId?: string,
  ) {
    const templateType = this.resolveTemplateType(type);
    const { tenantId, settings, templates } =
      await this.loadAllergenAdditiveTemplateState(user, requestedRestaurantId);
    const currentCode = code.trim();
    const exists = templates[templateType].some(
      (entry) => entry.code === currentCode,
    );

    if (!exists) {
      throw new NotFoundException('Allergen/additive template entry not found');
    }

    await this.assertAllergenCodeNotInUse(tenantId, currentCode);
    const nextTemplates = {
      ...templates,
      [templateType]: templates[templateType].filter(
        (entry) => entry.code !== currentCode,
      ),
    };
    await this.saveAllergenAdditiveTemplates(tenantId, settings, nextTemplates);

    return {
      data: { code: currentCode },
      message: 'Allergen/additive template entry deleted successfully',
    };
  }

  async duplicate(
    user: AuthUserContext,
    id: string,
    dto: DuplicateMenuItemDto,
  ) {
    const item = await this.prisma.menuItem.findUnique({
      where: { id },
      include: {
        modifierPriceOverrides: true,
        variationPriceOverrides: {
          include: { variation: true },
        },
        variationModifierPriceOverrides: true,
      },
    });

    if (!item || item.deletedAt) {
      throw new NotFoundException('Menu item not found');
    }

    await this.ensureCanAccessRestaurant(user, item.restaurantId);

    const name = dto.name?.trim() || `${item.name} Copy`;
    const slug = await this.resolveUniqueSlug(
      item.restaurantId,
      dto.slug ?? `${item.slug}-copy`,
    );
    const sku =
      dto.sku !== undefined ? this.resolveOptionalString(dto.sku) : undefined;
    await this.assertUniqueFields(item.restaurantId, { sku });

    const created = await this.prisma.$transaction(async (tx) => {
      const copy = await this.itemRepository.create(
        {
          restaurant: { connect: { id: item.restaurantId } },
          category: { connect: { id: item.categoryId } },
          name,
          slug,
          description: item.description,
          ingredients: item.ingredients,
          allergenPdfUrl: item.allergenPdfUrl,
          nutritionalInformation: item.nutritionalInformation,
          imageUrl: item.imageUrl,
          sku,
          sortOrder: item.sortOrder + 1,
          pricingMode: item.pricingMode,
          basePrice: item.basePrice,
          deliveryPriceAdjustment: item.deliveryPriceAdjustment,
          takeawayPriceAdjustment: item.takeawayPriceAdjustment,
          prepTimeMinutes: item.prepTimeMinutes,
          dietaryFlags: item.dietaryFlags as Prisma.InputJsonValue,
          allergenFlags: item.allergenFlags as Prisma.InputJsonValue,
          depositAmount: item.depositAmount,
          isRequired: item.isRequired,
          minSelect: item.minSelect,
          maxSelect: item.maxSelect,
          minQuantity: item.minQuantity,
          maxQuantity: item.maxQuantity,
          isActive: item.isActive,
        },
        tx,
      );

      await this.syncModifierPriceOverrides(
        copy.id,
        item.modifierPriceOverrides.map((override) => ({
          modifierId: override.modifierId,
          priceDelta: Number(override.priceDelta),
        })),
        tx,
      );
      await this.syncVariationPriceOverrides(
        copy.id,
        item.restaurantId,
        item.variationPriceOverrides.map((override) => ({
          variationId: override.variationId,
          price: Number(override.price),
          pickupPrice:
            override.pickupPrice === null
              ? undefined
              : Number(override.pickupPrice),
          displayText: override.displayText ?? undefined,
          modifierPriceOverrides: item.variationModifierPriceOverrides
            .filter(
              (modifierOverride) =>
                modifierOverride.variationId === override.variationId,
            )
            .map((modifierOverride) => ({
              modifierId: modifierOverride.modifierId,
              priceDelta: Number(modifierOverride.priceDelta),
            })),
        })),
        tx,
      );

      return copy;
    });

    return {
      data: await this.resolveMediaResponse(
        this.withSplitPizzaMetadata(created),
      ),
      message: 'Menu item duplicated successfully',
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

    const data = await this.prisma.$transaction(async (tx) => {
      await this.cleanupMenuItemReferences(id, tx);

      if (orderItemsCount > 0) {
        return this.itemRepository.softDelete(id, tx);
      }

      return this.itemRepository.hardDelete(id, tx);
    });

    return {
      data,
      message:
        orderItemsCount > 0
          ? 'Menu item removed from active flows and archived because it is used in orders'
          : 'Menu item deleted successfully',
    };
  }

  private async cleanupMenuItemReferences(
    id: string,
    tx: Prisma.TransactionClient,
  ) {
    await this.itemRepository.deleteCartItems(id, tx);
    await this.itemRepository.deleteGroupOrderItems(id, tx);
    await this.itemRepository.deletePosDraftItems(id, tx);
    await this.itemRepository.deleteMenuLinks(id, tx);
    await this.itemRepository.deleteModifierLinks(id, tx);
    await this.itemRepository.deleteModifierPriceOverrides(id, tx);
    await this.itemRepository.deleteVariationPriceOverrides(id, tx);
    await this.itemRepository.deleteVariationModifierPriceOverrides(id, tx);
    await this.itemRepository.deleteBranchOverrides(id, tx);
    await this.itemRepository.deleteRecipes(id, tx);
    await this.itemRepository.clearCouponScopes(id, tx);
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

  private assertSelectionLimits(
    dto: Pick<
      CreateMenuItemDto | UpdateMenuItemDto,
      'isRequired' | 'minSelect' | 'maxSelect' | 'minQuantity' | 'maxQuantity'
    >,
    existing?: {
      isRequired?: boolean;
      minSelect?: number;
      maxSelect?: number | null;
      minQuantity?: number;
      maxQuantity?: number | null;
    },
  ) {
    const isRequired = dto.isRequired ?? existing?.isRequired ?? false;
    const minSelect = dto.minSelect ?? existing?.minSelect ?? 0;
    const maxSelect =
      dto.maxSelect !== undefined
        ? dto.maxSelect
        : (existing?.maxSelect ?? null);

    if (isRequired && minSelect < 1) {
      throw new BadRequestException(
        'minSelect must be at least 1 when item is required',
      );
    }

    if (maxSelect !== null && maxSelect < minSelect) {
      throw new BadRequestException(
        'maxSelect must be greater than or equal to minSelect',
      );
    }

    const minQuantity = dto.minQuantity ?? existing?.minQuantity ?? 1;
    const maxQuantity =
      dto.maxQuantity !== undefined
        ? dto.maxQuantity
        : (existing?.maxQuantity ?? null);

    if (maxQuantity !== null && maxQuantity < minQuantity) {
      throw new BadRequestException(
        'maxQuantity must be greater than or equal to minQuantity',
      );
    }
  }

  private readonly splitPizzaDietaryFlag = '__SPLIT_PIZZA_ENABLED__';

  private async assertKnownLabels(
    restaurantId: string,
    labels: string[] | undefined,
  ) {
    if (!labels?.length) {
      return;
    }

    const knownLabels = await this.getProductLabelsForRestaurant(restaurantId);
    const knownValues = new Set(knownLabels.map((label) => label.value));
    const unknownLabel = labels.find((label) => !knownValues.has(label));

    if (unknownLabel) {
      throw new BadRequestException(`Unknown product label: ${unknownLabel}`);
    }
  }

  private async assertProductLabelNotInUse(tenantId: string, value: string) {
    const count = await this.prisma.menuItem.count({
      where: {
        restaurant: { tenantId },
        deletedAt: null,
        dietaryFlags: { array_contains: [value] },
      },
    });

    if (count > 0) {
      throw new BadRequestException(
        'Product label is assigned to menu items and cannot be changed or deleted',
      );
    }
  }

  private async getProductLabelsForUser(
    user: AuthUserContext,
    requestedRestaurantId?: string,
  ) {
    if (user.role === UserRoleEnum.SUPER_ADMIN && !requestedRestaurantId) {
      return this.getGlobalProductLabels();
    }

    const state = await this.loadProductLabelState(user, requestedRestaurantId);
    return state.labels;
  }

  private async getProductLabelsForRestaurant(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { id: restaurantId, deletedAt: null },
      select: { tenant: { select: { settings: true } } },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    const tenantSettings = (
      restaurant as { tenant?: { settings?: unknown } | null }
    ).tenant?.settings;
    const labels = this.readProductLabels(
      this.readPath(tenantSettings, ['productLabels']) ??
        this.readPath(tenantSettings, ['menu', 'productLabels']),
    );
    return labels.length ? labels : DEFAULT_MENU_ITEM_LABELS;
  }

  private async getGlobalProductLabels() {
    const settings = await this.prisma.globalSetting.upsert({
      where: { scopeKey: 'GLOBAL' },
      update: {},
      create: {
        scopeKey: 'GLOBAL',
        productLabels:
          DEFAULT_MENU_ITEM_LABELS as unknown as Prisma.InputJsonValue,
      },
      select: { productLabels: true },
    });

    const labels = this.readProductLabels(settings.productLabels);
    return labels.length ? labels : DEFAULT_MENU_ITEM_LABELS;
  }

  private async loadProductLabelState(
    user: AuthUserContext,
    requestedRestaurantId?: string,
  ) {
    const { tenantId, settings } = await this.loadTenantSettingsState(
      user,
      requestedRestaurantId,
    );
    const labels = this.readProductLabels(
      this.readPath(settings, ['productLabels']) ??
        this.readPath(settings, ['menu', 'productLabels']),
    );

    return {
      tenantId,
      settings,
      labels: labels.length ? labels : DEFAULT_MENU_ITEM_LABELS,
    };
  }

  private async saveProductLabels(
    tenantId: string,
    settings: Prisma.JsonObject,
    labels: Array<{ value: string; label: string }>,
  ) {
    settings.productLabels = labels as unknown as Prisma.JsonValue;
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { settings: settings as Prisma.InputJsonValue },
    });
  }

  private readProductLabels(input: unknown) {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .map((entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          return null;
        }

        const value = (entry as Record<string, unknown>).value;
        const label = (entry as Record<string, unknown>).label;

        if (typeof value !== 'string' || typeof label !== 'string') {
          return null;
        }

        return { value: value.trim(), label: label.trim() };
      })
      .filter(
        (entry): entry is { value: string; label: string } =>
          !!entry && entry.value.length > 0 && entry.label.length > 0,
      );
  }

  private normalizeLabelValue(value: string) {
    const normalized = value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_');

    if (!normalized) {
      throw new BadRequestException('label value is required');
    }

    return normalized;
  }

  private resolveTemplateType(type: string): 'allergens' | 'additives' {
    if (type === 'allergens' || type === 'allergen') {
      return 'allergens';
    }

    if (type === 'additives' || type === 'additive') {
      return 'additives';
    }

    throw new BadRequestException('type must be allergens or additives');
  }

  private async loadAllergenAdditiveTemplateState(
    user: AuthUserContext,
    requestedRestaurantId?: string,
  ) {
    const { tenantId, settings } = await this.loadTenantSettingsState(
      user,
      requestedRestaurantId,
    );

    return {
      tenantId,
      settings,
      templates: this.readAllergenAdditiveTemplates(settings),
    };
  }

  private async loadTenantSettingsState(
    user: AuthUserContext,
    requestedRestaurantId?: string,
  ) {
    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      if (!user.tid) {
        throw new ForbiddenException('Tenant context is required');
      }

      if (requestedRestaurantId) {
        await this.assertRestaurantInTenant(user.tid, requestedRestaurantId);
      }

      const tenant = await this.prisma.tenant.findFirst({
        where: { id: user.tid, deletedAt: null },
        select: { settings: true },
      });

      if (!tenant) {
        throw new NotFoundException('Tenant not found');
      }

      return {
        tenantId: user.tid,
        settings: this.toJsonObject(tenant.settings),
      };
    }

    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      if (!requestedRestaurantId) {
        throw new BadRequestException('restaurantId is required');
      }

      const restaurant = await this.prisma.restaurant.findFirst({
        where: { id: requestedRestaurantId, deletedAt: null },
        select: { tenantId: true, tenant: { select: { settings: true } } },
      });

      if (!restaurant) {
        throw new NotFoundException('Restaurant not found');
      }

      return {
        tenantId: restaurant.tenantId,
        settings: this.toJsonObject(restaurant.tenant.settings),
      };
    }

    if (!user.rid) {
      throw new ForbiddenException('Restaurant context is required');
    }

    const restaurant = await this.prisma.restaurant.findFirst({
      where: { id: user.rid, deletedAt: null },
      select: { tenantId: true, tenant: { select: { settings: true } } },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    return {
      tenantId: restaurant.tenantId,
      settings: this.toJsonObject(restaurant.tenant.settings),
    };
  }

  private async saveAllergenAdditiveTemplates(
    tenantId: string,
    settings: Prisma.JsonObject,
    templates: {
      allergens: Array<{ code: string; label: string }>;
      additives: Array<{ code: string; label: string }>;
    },
  ) {
    const customerApp = this.toJsonObject(settings.customerApp);
    customerApp.allergenAdditiveTemplates = templates;
    settings.customerApp = customerApp;

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { settings: settings as Prisma.InputJsonValue },
    });
  }

  private async assertAllergenCodeNotInUse(tenantId: string, code: string) {
    const count = await this.prisma.menuItem.count({
      where: {
        restaurant: { tenantId },
        deletedAt: null,
        allergenFlags: { array_contains: [code] },
      },
    });

    if (count > 0) {
      throw new BadRequestException(
        'Allergen/additive code is assigned to menu items and cannot be changed or deleted',
      );
    }
  }

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

  private resolveAllergenCodes(dto: {
    allergenFlags?: string[];
    allergenCodes?: string[];
  }) {
    return dto.allergenCodes ?? dto.allergenFlags ?? [];
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
    const tenantSettings =
      item.restaurant &&
      typeof item.restaurant === 'object' &&
      !Array.isArray(item.restaurant)
        ? (item.restaurant as { tenant?: { settings?: unknown } }).tenant
            ?.settings
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
      productLabels: this.resolveProductLabelText(
        item.dietaryFlags,
        tenantSettings ?? restaurantSettings,
      ),
      ...this.resolveAllergenAdditiveLabels(
        item.allergenFlags,
        tenantSettings ?? restaurantSettings,
      ),
      allergenCodes: this.readStringArray(item.allergenFlags),
      allergenAdditives: this.resolveAllergenAdditiveText(
        item.allergenFlags,
        tenantSettings ?? restaurantSettings,
      ),
    };
  }

  private resolveAllergenAdditiveText(
    codesInput: unknown,
    restaurantSettings: unknown,
  ) {
    const codes = this.readStringArray(codesInput);
    if (!codes.length) {
      return [];
    }

    const templates = this.readAllergenAdditiveTemplates(restaurantSettings);
    const byCode = new Map(
      [...templates.allergens, ...templates.additives].map((entry) => [
        entry.code,
        entry,
      ]),
    );

    return codes.map((code) => ({
      code,
      label: byCode.get(code)?.label ?? code,
    }));
  }

  private resolveProductLabelText(codesInput: unknown, settings: unknown) {
    const codes = this.readStringArray(codesInput).filter(
      (flag) => flag !== this.splitPizzaDietaryFlag,
    );
    const configuredLabels = this.readProductLabels(
      this.readPath(settings, ['productLabels']) ??
        this.readPath(settings, ['menu', 'productLabels']),
    );
    const labels = configuredLabels.length
      ? configuredLabels
      : DEFAULT_MENU_ITEM_LABELS;
    const byValue = new Map(labels.map((entry) => [entry.value, entry]));

    return codes.map((value) => ({
      value,
      label: byValue.get(value)?.label ?? value,
    }));
  }

  private resolveAllergenAdditiveLabels(
    codesInput: unknown,
    restaurantSettings: unknown,
  ) {
    const codes = this.readStringArray(codesInput);
    const templates = this.readAllergenAdditiveTemplates(restaurantSettings);
    const allergensByCode = new Map(
      templates.allergens.map((entry) => [entry.code, entry]),
    );
    const additivesByCode = new Map(
      templates.additives.map((entry) => [entry.code, entry]),
    );
    const allergens: Array<{ code: string; label: string }> = [];
    const additives: Array<{ code: string; label: string }> = [];

    for (const code of codes) {
      const additive = additivesByCode.get(code);
      if (additive) {
        additives.push({ code, label: additive.label });
        continue;
      }

      const allergen = allergensByCode.get(code);
      allergens.push({ code, label: allergen?.label ?? code });
    }

    return { allergens, additives };
  }

  private readAllergenAdditiveTemplates(settings: unknown) {
    const templates =
      this.readPath(settings, ['customerApp', 'allergenAdditiveTemplates']) ??
      this.readPath(settings, ['allergenAdditiveTemplates']);

    return {
      allergens: this.readTemplateEntries(
        this.readObjectValue(templates, 'allergens'),
      ),
      additives: this.readTemplateEntries(
        this.readObjectValue(templates, 'additives'),
      ),
    };
  }

  private readTemplateEntries(input: unknown) {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .map((entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          return null;
        }

        const code = (entry as Record<string, unknown>).code;
        const label = (entry as Record<string, unknown>).label;

        if (typeof code !== 'string' || typeof label !== 'string') {
          return null;
        }

        return { code: code.trim(), label: label.trim() };
      })
      .filter(
        (entry): entry is { code: string; label: string } =>
          !!entry && entry.code.length > 0 && entry.label.length > 0,
      );
  }

  private readObjectValue(input: unknown, key: string) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return undefined;
    }

    return (input as Record<string, unknown>)[key];
  }

  private toJsonObject(input: unknown): Prisma.JsonObject {
    return input && typeof input === 'object' && !Array.isArray(input)
      ? { ...(input as Prisma.JsonObject) }
      : {};
  }

  private assertUniqueTemplateCodes(
    entries: Array<{ code: string }>,
    field: string,
  ) {
    const codes = entries.map((entry) => entry.code.trim());
    if (new Set(codes).size !== codes.length) {
      throw new BadRequestException(`${field} template codes must be unique`);
    }
  }

  private normalizeTemplateEntries(
    entries: Array<{ code: string; label: string }>,
  ) {
    return entries.map((entry) => ({
      code: entry.code.trim(),
      label: entry.label.trim(),
    }));
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
      labels: publicDietaryFlags,
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
    const cursor = this.readPath(input, path);

    return typeof cursor === 'string' && cursor.trim().length
      ? cursor.trim()
      : null;
  }

  private readPath(input: unknown, path: string[]) {
    let cursor = input;

    for (const key of path) {
      if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) {
        return undefined;
      }

      cursor = (cursor as Record<string, unknown>)[key];
    }

    return cursor;
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
    const hasPriceAdjustment =
      dto.deliveryPriceAdjustment !== undefined ||
      dto.takeawayPriceAdjustment !== undefined;
    const pricingMode =
      (dto.pricingMode as MenuItemPricingMode | undefined) ??
      (hasPriceAdjustment ? MenuItemPricingMode.MULTIPLE : undefined) ??
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
