import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

    const slug = await this.ensureUniqueSlug(restaurantId, dto.slug ?? dto.name);

    const data = await this.restaurantMenuRepository.create({
      restaurant: { connect: { id: restaurantId } },
      name: dto.name,
      slug,
      description: dto.description,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });

    return { data, message: 'Restaurant menu created successfully' };
  }

  async list(user: AuthUserContext, query: ListRestaurantMenusDto) {
    const restaurantId = this.resolveRestaurantId(user, query.restaurantId, true);
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

  async update(user: AuthUserContext, id: string, dto: UpdateRestaurantMenuDto) {
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

    return { data, message: 'Restaurant menu updated successfully' };
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

    const item = await this.prisma.menuItem.findUnique({ where: { id: dto.menuItemId } });
    if (!item || item.deletedAt) {
      throw new NotFoundException('Menu item not found');
    }

    if (item.restaurantId !== menu.restaurantId) {
      throw new BadRequestException(
        'Menu item must belong to the same restaurant as the menu',
      );
    }

    const existing = await this.restaurantMenuRepository.findMenuItemLink(
      menu.id,
      item.id,
    );
    if (existing) {
      throw new BadRequestException('Menu item is already attached to this menu');
    }

    const data = await this.restaurantMenuRepository.attachItem({
      restaurantMenu: { connect: { id: menu.id } },
      menuItem: { connect: { id: item.id } },
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });

    return { data, message: 'Menu item attached successfully' };
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

    const link = await this.restaurantMenuRepository.findMenuItemLinkById(linkId);
    if (!link || link.restaurantMenuId !== menu.id) {
      throw new NotFoundException('Restaurant menu item link not found');
    }

    const data = await this.restaurantMenuRepository.updateMenuItemLink(linkId, {
      sortOrder: dto.sortOrder,
      isActive: dto.isActive,
    });

    return { data, message: 'Restaurant menu item updated successfully' };
  }

  async removeItem(user: AuthUserContext, menuId: string, linkId: string) {
    const menu = await this.restaurantMenuRepository.findById(menuId);
    if (!menu || menu.deletedAt) {
      throw new NotFoundException('Restaurant menu not found');
    }

    this.ensureCanWriteRestaurant(user, menu.restaurantId);

    const link = await this.restaurantMenuRepository.findMenuItemLinkById(linkId);
    if (!link || link.restaurantMenuId !== menu.id) {
      throw new NotFoundException('Restaurant menu item link not found');
    }

    const data = await this.restaurantMenuRepository.removeMenuItemLink(linkId);
    return { data, message: 'Menu item removed from menu successfully' };
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
        throw new ForbiddenException('Cross-restaurant access denied');
      }

      return user.rid;
    }

    throw new ForbiddenException('Insufficient permissions for restaurant menus');
  }

  private ensureCanReadRestaurant(user: AuthUserContext, restaurantId: string) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return;
    }

    if (user.rid !== restaurantId) {
      throw new ForbiddenException('Cross-restaurant access denied');
    }
  }

  private ensureCanWriteRestaurant(user: AuthUserContext, restaurantId: string) {
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
