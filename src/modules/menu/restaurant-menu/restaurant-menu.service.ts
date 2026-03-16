import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUserContext } from '../../../common/decorators';
import { UserRoleEnum } from '../../../common/enums';
import { buildPaginationMeta } from '../../../common/utils';
import { PrismaService } from '../../../database';
import {
  AttachRestaurantMenuItemDto,
  CreateRestaurantMenuDto,
  ListRestaurantMenuItemsDto,
  ListRestaurantMenusDto,
  UpdateRestaurantMenuDto,
  UpdateRestaurantMenuItemDto,
} from './dto';
import { RestaurantMenuRepository } from './restaurant-menu.repository';

@Injectable()
export class RestaurantMenuService {
  constructor(
    private readonly restaurantMenuRepository: RestaurantMenuRepository,
    private readonly prisma: PrismaService,
  ) {}

  async create(user: AuthUserContext, dto: CreateRestaurantMenuDto) {
    const restaurantId = this.resolveRestaurantId(user, dto.restaurantId);
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
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });

    if (dto.itemIds?.length) {
      await this.attachItemsToMenu(data.id, restaurantId, dto.itemIds);
    }

    const menu = await this.restaurantMenuRepository.findById(data.id);

    return {
      data: menu ?? data,
      message: 'Restaurant menu created successfully',
    };
  }

  async list(user: AuthUserContext, query: ListRestaurantMenusDto) {
    const restaurantId = this.resolveRestaurantId(
      user,
      query.restaurantId,
      true,
    );
    const { items, total } = await this.restaurantMenuRepository.list(
      restaurantId,
      query,
    );

    return {
      data: items,
      message: 'Restaurant menus fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async getById(user: AuthUserContext, id: string) {
    const menu = await this.restaurantMenuRepository.findById(id);
    if (!menu || menu.deletedAt) {
      throw new NotFoundException('Restaurant menu not found');
    }

    this.ensureCanReadRestaurant(user, menu.restaurantId);

    return {
      data: menu,
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

    this.ensureCanWriteRestaurant(user, menu.restaurantId);

    const data = await this.restaurantMenuRepository.update(id, {
      name: dto.name,
      slug: dto.slug
        ? await this.ensureUniqueSlug(menu.restaurantId, dto.slug, id)
        : undefined,
      description: dto.description,
      sortOrder: dto.sortOrder,
      isActive: dto.isActive,
    });

    if (dto.itemIds !== undefined) {
      await this.syncMenuItems(menu.id, menu.restaurantId, dto.itemIds);
    }

    const updatedMenu = await this.restaurantMenuRepository.findById(id);

    return {
      data: updatedMenu ?? data,
      message: 'Restaurant menu updated successfully',
    };
  }

  async remove(user: AuthUserContext, id: string) {
    const menu = await this.restaurantMenuRepository.findById(id);
    if (!menu || menu.deletedAt) {
      throw new NotFoundException('Restaurant menu not found');
    }

    this.ensureCanWriteRestaurant(user, menu.restaurantId);

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

    this.ensureCanWriteRestaurant(user, menu.restaurantId);

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

    this.ensureCanReadRestaurant(user, menu.restaurantId);

    const { items, total } = await this.restaurantMenuRepository.listMenuItems(
      menu.id,
      query,
    );

    return {
      data: items,
      message: 'Restaurant menu items fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
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

    this.ensureCanWriteRestaurant(user, menu.restaurantId);

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

    this.ensureCanWriteRestaurant(user, menu.restaurantId);

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

    return this.prisma.$transaction(
      items.map((item, index) =>
        this.prisma.restaurantMenuItem.create({
          data: {
            restaurantMenuId: menuId,
            menuItemId: item.id,
            sortOrder: nextSortOrder + index,
            isActive: true,
          },
        }),
      ),
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

    const existingLinks = await this.prisma.restaurantMenuItem.findMany({
      where: { restaurantMenuId: menuId },
      select: { id: true, menuItemId: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    const existingItemIds = new Set(
      existingLinks.map((link) => link.menuItemId),
    );
    const requestedItemIds = new Set(uniqueItemIds);

    const linksToRemove = existingLinks.filter(
      (link) => !requestedItemIds.has(link.menuItemId),
    );

    const itemsToAdd = items.filter((item) => !existingItemIds.has(item.id));

    await this.prisma.$transaction([
      ...linksToRemove.map((link) =>
        this.prisma.restaurantMenuItem.delete({ where: { id: link.id } }),
      ),
      ...itemsToAdd.map((item, index) =>
        this.prisma.restaurantMenuItem.create({
          data: {
            restaurantMenuId: menuId,
            menuItemId: item.id,
            sortOrder: existingLinks.length + index,
            isActive: true,
          },
        }),
      ),
    ]);
  }

  private async resolveMenuItemsForMenu(
    restaurantId: string,
    itemIds: string[],
  ) {
    const uniqueItemIds = [...new Set(itemIds)];
    const items = await this.prisma.menuItem.findMany({
      where: {
        id: { in: uniqueItemIds },
        deletedAt: null,
      },
      select: {
        id: true,
        restaurantId: true,
      },
    });

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

  private resolveRestaurantId(
    user: AuthUserContext,
    requestedRestaurantId?: string,
    allowReadFromToken = false,
  ) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return requestedRestaurantId;
    }

    const canReadFromToken =
      user.role === UserRoleEnum.BUSINESS_ADMIN ||
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

  private ensureCanReadRestaurant(user: AuthUserContext, restaurantId: string) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return;
    }

    if (user.rid !== restaurantId) {
      throw new ForbiddenException(
        'You cannot access resources outside your restaurant',
      );
    }
  }

  private ensureCanWriteRestaurant(
    user: AuthUserContext,
    restaurantId: string,
  ) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return;
    }

    if (
      user.role !== UserRoleEnum.BUSINESS_ADMIN ||
      user.rid !== restaurantId
    ) {
      throw new ForbiddenException(
        'Insufficient permissions for restaurant menu write',
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
      const existing = await this.prisma.restaurantMenu.findFirst({
        where: {
          restaurantId,
          slug: candidate,
        },
        select: { id: true },
      });

      if (!existing || existing.id === ignoreId) {
        return candidate;
      }

      candidate = `${normalizedBase}-${counter}`;
      counter += 1;
    }
  }
}
