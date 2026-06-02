import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUserContext } from '../../../common/decorators';
import { UserRoleEnum } from '../../../common/enums';
import {
  buildPaginationMeta,
  isRestaurantMenuAvailableAt,
} from '../../../common/utils';
import { StorageService } from '../../storage/storage.service';
import {
  AttachRestaurantMenuItemDto,
  CreateRestaurantMenuDto,
  ListRestaurantMenuItemsDto,
  ListRestaurantMenusDto,
  UpdateRestaurantMenuDto,
  UpdateRestaurantMenuItemDto,
} from './dto';
import { RestaurantMenuRepository } from './restaurant-menu.repository';

type RestaurantMenuScheduleCarrier = {
  isTimed?: boolean;
  timingConfig: unknown;
  isActive?: boolean;
  deletedAt?: Date | string | null;
};

@Injectable()
export class RestaurantMenuService {
  constructor(
    private readonly restaurantMenuRepository: RestaurantMenuRepository,
    private readonly storageService?: StorageService,
  ) {}

  async create(user: AuthUserContext, dto: CreateRestaurantMenuDto) {
    const restaurantId = await this.resolveRestaurantId(user, dto.restaurantId);
    if (!restaurantId) {
      throw new BadRequestException('restaurantId is required');
    }

    const slug = await this.ensureUniqueSlug(
      restaurantId,
      dto.slug ?? dto.name,
    );

    const data = await this.restaurantMenuRepository.create({
      restaurant: { connect: { id: restaurantId } },
      name: dto.name,
      slug,
      description: dto.description,
      isTimed: dto.isTimed ?? false,
      timingConfig: dto.timingConfig as never,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });

    if (dto.itemIds?.length) {
      await this.attachItemsToMenu(data.id, restaurantId, dto.itemIds);
    }

    if (dto.categoryIds?.length) {
      await this.attachCategoriesToMenu(data.id, restaurantId, dto.categoryIds);
    }

    const menu = await this.restaurantMenuRepository.findById(data.id);

    return {
      data: await this.resolveMediaResponse(
        this.attachCategoryVariations(menu ?? data),
      ),
      message: 'Restaurant menu created successfully',
    };
  }

  async list(user: AuthUserContext, query: ListRestaurantMenusDto) {
    const restaurantId = await this.resolveRestaurantId(
      user,
      query.restaurantId,
      true,
    );
    const { items, total } = await this.restaurantMenuRepository.list(
      restaurantId,
      query,
    );
    const visibleItems = this.filterCustomerVisibleMenus(user, items);

    return {
      data: await this.resolveMediaResponse(
        visibleItems.map((item) => this.attachCategoryVariations(item)),
      ),
      message: 'Restaurant menus fetched successfully',
      meta: buildPaginationMeta(query, Math.min(total, visibleItems.length)),
    };
  }

  async getById(user: AuthUserContext, id: string) {
    const menu = await this.restaurantMenuRepository.findById(id);
    if (!menu || menu.deletedAt) {
      throw new NotFoundException('Restaurant menu not found');
    }

    await this.ensureCanReadRestaurant(user, menu.restaurantId);

    if (this.isCustomer(user) && !this.isMenuCurrentlyVisible(menu)) {
      throw new NotFoundException('Restaurant menu not found');
    }

    return {
      data: await this.resolveMediaResponse(
        this.attachCategoryVariations(menu),
      ),
      message: 'Restaurant menu fetched successfully',
    };
  }

  async update(
    user: AuthUserContext,
    id: string,
    dto: UpdateRestaurantMenuDto,
  ) {
    const menu = await this.restaurantMenuRepository.findById(id);
    if (!menu || menu.deletedAt) {
      throw new NotFoundException('Restaurant menu not found');
    }

    await this.ensureCanWriteRestaurant(user, menu.restaurantId);

    const data = await this.restaurantMenuRepository.update(id, {
      name: dto.name,
      slug: dto.slug
        ? await this.ensureUniqueSlug(menu.restaurantId, dto.slug, id)
        : undefined,
      description: dto.description,
      isTimed: dto.isTimed,
      timingConfig: dto.timingConfig as never,
      sortOrder: dto.sortOrder,
      isActive: dto.isActive,
    });

    if (dto.itemIds !== undefined) {
      await this.syncMenuItems(menu.id, menu.restaurantId, dto.itemIds);
    }

    if (dto.categoryIds !== undefined) {
      await this.syncMenuCategories(
        menu.id,
        menu.restaurantId,
        dto.categoryIds,
      );
    }

    const updatedMenu = await this.restaurantMenuRepository.findById(id);

    return {
      data: await this.resolveMediaResponse(
        this.attachCategoryVariations(updatedMenu ?? data),
      ),
      message: 'Restaurant menu updated successfully',
    };
  }

  async remove(user: AuthUserContext, id: string) {
    const menu = await this.restaurantMenuRepository.findById(id);
    if (!menu || menu.deletedAt) {
      throw new NotFoundException('Restaurant menu not found');
    }

    await this.ensureCanWriteRestaurant(user, menu.restaurantId);

    const data = await this.restaurantMenuRepository.softDelete(id);
    return { data, message: 'Restaurant menu deleted successfully' };
  }

  async attachItem(
    user: AuthUserContext,
    menuId: string,
    dto: AttachRestaurantMenuItemDto,
  ) {
    const menu = await this.restaurantMenuRepository.findById(menuId);
    if (!menu || menu.deletedAt) {
      throw new NotFoundException('Restaurant menu not found');
    }

    await this.ensureCanWriteRestaurant(user, menu.restaurantId);

    const data = await this.attachItemsToMenu(
      menu.id,
      menu.restaurantId,
      dto.itemIds,
    );

    return {
      data,
      message: 'Menu items attached successfully',
    };
  }

  async listItems(
    user: AuthUserContext,
    menuId: string,
    query: ListRestaurantMenuItemsDto,
  ) {
    const menu = await this.restaurantMenuRepository.findById(menuId);
    if (!menu || menu.deletedAt) {
      throw new NotFoundException('Restaurant menu not found');
    }

    await this.ensureCanReadRestaurant(user, menu.restaurantId);

    if (this.isCustomer(user) && !this.isMenuCurrentlyVisible(menu)) {
      return {
        data: [],
        message: 'Restaurant menu items fetched successfully',
        meta: buildPaginationMeta(query, 0),
      };
    }

    const { items, total } = await this.restaurantMenuRepository.listMenuItems(
      menu.id,
      query,
    );

    return {
      data: await this.resolveMediaResponse(items),
      message: 'Restaurant menu items fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  private async resolveMediaResponse<T>(data: T) {
    return (await this.storageService?.resolveMediaUrlsDeep(data)) ?? data;
  }

  private filterCustomerVisibleMenus<T extends RestaurantMenuScheduleCarrier>(
    user: AuthUserContext,
    menus: T[],
  ): T[] {
    if (!this.isCustomer(user)) {
      return menus;
    }

    return menus.filter((menu) => this.isMenuCurrentlyVisible(menu));
  }

  private isMenuCurrentlyVisible(menu: RestaurantMenuScheduleCarrier): boolean {
    if (menu.isActive === false || menu.deletedAt) {
      return false;
    }

    if (menu.isTimed !== true) {
      return true;
    }

    return isRestaurantMenuAvailableAt(menu.timingConfig, new Date());
  }

  private isCustomer(user: AuthUserContext): boolean {
    return user.role === UserRoleEnum.CUSTOMER;
  }

  async updateItem(
    user: AuthUserContext,
    menuId: string,
    linkId: string,
    dto: UpdateRestaurantMenuItemDto,
  ) {
    const menu = await this.restaurantMenuRepository.findById(menuId);
    if (!menu || menu.deletedAt) {
      throw new NotFoundException('Restaurant menu not found');
    }

    await this.ensureCanWriteRestaurant(user, menu.restaurantId);

    const link =
      await this.restaurantMenuRepository.findMenuItemLinkById(linkId);
    if (!link || link.restaurantMenuId !== menu.id) {
      throw new NotFoundException('Restaurant menu item link not found');
    }

    const data = await this.restaurantMenuRepository.updateMenuItemLink(
      linkId,
      {
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    );

    return { data, message: 'Restaurant menu item updated successfully' };
  }

  async removeItem(user: AuthUserContext, menuId: string, linkId: string) {
    const menu = await this.restaurantMenuRepository.findById(menuId);
    if (!menu || menu.deletedAt) {
      throw new NotFoundException('Restaurant menu not found');
    }

    await this.ensureCanWriteRestaurant(user, menu.restaurantId);

    const link =
      await this.restaurantMenuRepository.findMenuItemLinkById(linkId);
    if (!link || link.restaurantMenuId !== menu.id) {
      throw new NotFoundException('Restaurant menu item link not found');
    }

    const data = await this.restaurantMenuRepository.removeMenuItemLink(linkId);
    return { data, message: 'Menu item removed from menu successfully' };
  }

  private async attachItemsToMenu(
    menuId: string,
    restaurantId: string,
    itemIds: string[],
  ) {
    const items = await this.resolveMenuItemsForMenu(restaurantId, itemIds);

    const existingLinks = await Promise.all(
      items.map((item) =>
        this.restaurantMenuRepository.findMenuItemLink(menuId, item.id),
      ),
    );

    if (existingLinks.some(Boolean)) {
      throw new BadRequestException(
        'One or more menu items are already attached to this menu',
      );
    }

    const nextSortOrder =
      await this.restaurantMenuRepository.getNextSortOrder(menuId);

    return this.restaurantMenuRepository.createMenuItemLinks(
      menuId,
      items,
      nextSortOrder,
    );
  }

  private async attachCategoriesToMenu(
    menuId: string,
    restaurantId: string,
    categoryIds: string[],
  ) {
    const categories = await this.resolveMenuCategoriesForMenu(
      restaurantId,
      categoryIds,
    );

    const existingLinks = await Promise.all(
      categories.map((category) =>
        this.restaurantMenuRepository.findMenuCategoryLink(menuId, category.id),
      ),
    );

    if (existingLinks.some(Boolean)) {
      throw new BadRequestException(
        'One or more menu categories are already attached to this menu',
      );
    }

    const nextSortOrder =
      await this.restaurantMenuRepository.getNextCategorySortOrder(menuId);

    return this.restaurantMenuRepository.createMenuCategoryLinks(
      menuId,
      categories,
      nextSortOrder,
    );
  }

  private async syncMenuItems(
    menuId: string,
    restaurantId: string,
    itemIds: string[],
  ) {
    const uniqueItemIds = [...new Set(itemIds)];
    const items = uniqueItemIds.length
      ? await this.resolveMenuItemsForMenu(restaurantId, uniqueItemIds)
      : [];

    const existingLinks =
      await this.restaurantMenuRepository.listMenuItemLinks(menuId);

    const existingItemIds = new Set(
      existingLinks.map((link) => link.menuItemId),
    );
    const requestedItemIds = new Set(uniqueItemIds);

    const linksToRemove = existingLinks.filter(
      (link) => !requestedItemIds.has(link.menuItemId),
    );

    const itemsToAdd = items.filter((item) => !existingItemIds.has(item.id));

    await this.restaurantMenuRepository.syncMenuItemLinks({
      restaurantMenuId: menuId,
      linksToRemove,
      itemsToAdd,
      startSortOrder: existingLinks.length,
    });
  }

  private async syncMenuCategories(
    menuId: string,
    restaurantId: string,
    categoryIds: string[],
  ) {
    const uniqueCategoryIds = [...new Set(categoryIds)];
    const categories = uniqueCategoryIds.length
      ? await this.resolveMenuCategoriesForMenu(restaurantId, uniqueCategoryIds)
      : [];

    const existingLinks =
      await this.restaurantMenuRepository.listMenuCategoryLinks(menuId);

    const existingCategoryIds = new Set(
      existingLinks.map((link) => link.menuCategoryId),
    );
    const requestedCategoryIds = new Set(uniqueCategoryIds);

    const linksToRemove = existingLinks.filter(
      (link) => !requestedCategoryIds.has(link.menuCategoryId),
    );

    const categoriesToAdd = categories.filter(
      (category) => !existingCategoryIds.has(category.id),
    );

    await this.restaurantMenuRepository.syncMenuCategoryLinks({
      restaurantMenuId: menuId,
      linksToRemove,
      categoriesToAdd,
      startSortOrder: existingLinks.length,
    });
  }

  private async resolveMenuItemsForMenu(
    restaurantId: string,
    itemIds: string[],
  ) {
    const uniqueItemIds = [...new Set(itemIds)];
    const items =
      await this.restaurantMenuRepository.findMenuItemsByIds(uniqueItemIds);

    if (items.length !== uniqueItemIds.length) {
      throw new NotFoundException('One or more menu items were not found');
    }

    if (items.some((item) => item.restaurantId !== restaurantId)) {
      throw new BadRequestException(
        'All menu items must belong to the same restaurant as the menu',
      );
    }

    return uniqueItemIds.map((itemId) => {
      const item = items.find((menuItem) => menuItem.id === itemId);

      if (!item) {
        throw new NotFoundException('One or more menu items were not found');
      }

      return item;
    });
  }

  private async resolveMenuCategoriesForMenu(
    restaurantId: string,
    categoryIds: string[],
  ) {
    const uniqueCategoryIds = [...new Set(categoryIds)];
    const categories =
      await this.restaurantMenuRepository.findMenuCategoriesByIds(
        restaurantId,
        uniqueCategoryIds,
      );

    if (categories.length !== uniqueCategoryIds.length) {
      throw new NotFoundException('One or more menu categories were not found');
    }

    return uniqueCategoryIds.map((categoryId) => {
      const category = categories.find((item) => item.id === categoryId);

      if (!category) {
        throw new NotFoundException(
          'One or more menu categories were not found',
        );
      }

      return category;
    });
  }

  private async resolveRestaurantId(
    user: AuthUserContext,
    requestedRestaurantId?: string,
    allowReadFromToken = false,
  ) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return requestedRestaurantId;
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      if (!user.tid) {
        throw new ForbiddenException('Tenant context is required');
      }

      if (requestedRestaurantId) {
        await this.assertRestaurantInTenant(user.tid, requestedRestaurantId);
        return requestedRestaurantId;
      }

      if (allowReadFromToken && user.rid) {
        return user.rid;
      }

      throw new BadRequestException('restaurantId is required');
    }

    const canReadFromToken =
      (allowReadFromToken && user.role === UserRoleEnum.BRANCH_ADMIN) ||
      (allowReadFromToken && user.role === UserRoleEnum.CUSTOMER);

    if (canReadFromToken) {
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

    throw new ForbiddenException(
      'Insufficient permissions for restaurant menus',
    );
  }

  private async ensureCanReadRestaurant(
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

  private async ensureCanWriteRestaurant(
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

    throw new ForbiddenException(
      'Insufficient permissions for restaurant menu write',
    );
  }

  private async assertRestaurantInTenant(
    tenantId: string,
    restaurantId: string,
  ) {
    const restaurant =
      await this.restaurantMenuRepository.findRestaurantInTenant(
        tenantId,
        restaurantId,
      );

    if (!restaurant) {
      throw new ForbiddenException(
        'You cannot access resources outside your tenant restaurants',
      );
    }
  }

  private async ensureUniqueSlug(
    restaurantId: string,
    base: string,
    ignoreId?: string,
  ): Promise<string> {
    const normalizedBase = base
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');

    let candidate = normalizedBase;
    let counter = 1;

    while (true) {
      const existing = await this.restaurantMenuRepository.findSlugOwner(
        restaurantId,
        candidate,
      );

      if (!existing || existing.id === ignoreId) {
        return candidate;
      }

      candidate = `${normalizedBase}-${counter}`;
      counter += 1;
    }
  }

  private attachCategoryVariations<T extends Record<string, unknown>>(
    menu: T,
  ): T {
    if (!menu.items) {
      return menu;
    }

    return {
      ...menu,
      items: (
        menu.items as Array<{
          menuItem: Record<string, unknown> & {
            category?: { variations?: unknown[] };
            dietaryFlags?: unknown;
            modifierLinks?: unknown;
            id?: string;
          };
        }>
      ).map((item) => ({
        ...item,
        menuItem: {
          ...item.menuItem,
          dietaryFlags: Array.isArray(item.menuItem.dietaryFlags)
            ? item.menuItem.dietaryFlags.filter(
                (flag) => flag !== '__SPLIT_PIZZA_ENABLED__',
              )
            : item.menuItem.dietaryFlags,
          supportsSplitPizza:
            Array.isArray(item.menuItem.dietaryFlags) &&
            item.menuItem.dietaryFlags.includes('__SPLIT_PIZZA_ENABLED__'),
          splitPizza:
            Array.isArray(item.menuItem.dietaryFlags) &&
            item.menuItem.dietaryFlags.includes('__SPLIT_PIZZA_ENABLED__')
              ? {
                  enabled: true,
                  slots: ['LEFT', 'RIGHT'],
                  pricingRule: 'HIGHEST_HALF',
                  allowedFlavors: (
                    (
                      item.menuItem.category as {
                        items?: Array<{
                          id: string;
                          name: string;
                          slug: string;
                        }>;
                      }
                    )?.items ?? []
                  ).map((candidate) => ({
                    id: candidate.id,
                    name: candidate.name,
                    slug: candidate.slug,
                  })),
                }
              : null,
          variations: this.normalizeVariations(
            this.resolveItemVariationSource(item.menuItem),
            item.menuItem.id,
          ),
          modifiers: this.normalizeDirectModifiers(item.menuItem),
        },
      })),
    };
  }

  private resolveItemVariationSource(item: Record<string, unknown>) {
    const category = item.category as
      | {
          variations?: Array<{
            price?: { toString(): string } | number | null;
            itemPriceOverrides?: Array<{
              menuItemId: string;
              price: { toString(): string } | number;
            }>;
          }>;
          variationLinks?: Array<{
            sortOrder?: number;
            isDefault?: boolean;
            isActive?: boolean;
            variation: {
              price?: { toString(): string } | number | null;
              itemPriceOverrides?: Array<{
                menuItemId: string;
                price: { toString(): string } | number;
              }>;
            };
          }>;
        }
      | undefined;
    const variationPriceOverrides = item.variationPriceOverrides as
      | Array<{
          variation: {
            price?: { toString(): string } | number | null;
            itemPriceOverrides?: Array<{
              menuItemId: string;
              price: { toString(): string } | number;
            }>;
          };
        }>
      | undefined;

    if (variationPriceOverrides?.length) {
      return variationPriceOverrides.map((override) => ({
        ...override.variation,
        itemPriceOverrides: override.variation.itemPriceOverrides,
      }));
    }

    if (category?.variationLinks?.length) {
      return category.variationLinks.map((link) => ({
        ...link.variation,
        sortOrder: link.sortOrder,
        isDefault: link.isDefault,
        isActive: link.isActive,
      }));
    }

    return category?.variations;
  }

  private normalizeDirectModifiers(item: Record<string, unknown>) {
    const modifierPriceOverrides = item.modifierPriceOverrides as
      | Array<{
          priceDelta: { toString(): string } | number;
          modifier: {
            id: string;
            name: string;
            description?: string | null;
            sortOrder: number;
          };
        }>
      | undefined;

    return (modifierPriceOverrides ?? []).map((override) => ({
      id: override.modifier.id,
      name: override.modifier.name,
      description: override.modifier.description ?? null,
      sortOrder: override.modifier.sortOrder,
      priceDelta: Number(override.priceDelta),
    }));
  }

  private normalizeVariations<
    T extends {
      price?: { toString(): string } | number | null;
      itemPriceOverrides?: Array<{
        menuItemId: string;
        price: { toString(): string } | number;
        pickupPrice?: { toString(): string } | number | null;
        displayText?: string | null;
      }>;
    },
  >(variations: T[] | undefined | null, menuItemId?: string) {
    return (variations ?? []).map((variation) => {
      const override = variation.itemPriceOverrides?.find(
        (itemOverride) => itemOverride.menuItemId === menuItemId,
      );

      return {
        ...variation,
        price: Number(override?.price ?? variation.price ?? 0),
        pickupPrice:
          override?.pickupPrice !== undefined && override?.pickupPrice !== null
            ? Number(override.pickupPrice)
            : null,
        displayText: override?.displayText ?? null,
      };
    });
  }
}
