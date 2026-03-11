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
  ) {}

  async create(user: AuthUserContext, dto: CreateMenuItemDto) {
    const restaurantId = this.resolveRestaurantId(user, dto.restaurantId);
    await this.validateCategory(restaurantId, dto.categoryId);

    const data = await this.itemRepository.create({
      restaurant: { connect: { id: restaurantId } },
      category: { connect: { id: dto.categoryId } },
      name: dto.name,
      slug: dto.slug,
      description: dto.description,
      imageUrl: dto.imageUrl,
      sku: dto.sku,
      basePrice: new Prisma.Decimal(dto.basePrice),
      prepTimeMinutes: dto.prepTimeMinutes,
      dietaryFlags: dto.dietaryFlags as unknown as Prisma.InputJsonValue,
      allergenFlags: dto.allergenFlags as unknown as Prisma.InputJsonValue,
      isActive: dto.isActive ?? true,
    });

    return { data, message: 'Menu item created successfully' };
  }

  async createBulk(user: AuthUserContext, dto: BulkCreateMenuItemsDto) {
    const restaurantId = this.resolveRestaurantId(user, dto.restaurantId);

    if (!dto.items.length) {
      throw new BadRequestException('At least one item is required');
    }

    for (const item of dto.items) {
      await this.validateCategory(restaurantId, item.categoryId);
    }

    const payload: Prisma.MenuItemCreateManyInput[] = dto.items.map((item) => ({
      restaurantId,
      categoryId: item.categoryId,
      name: item.name,
      slug: item.slug,
      description: item.description,
      imageUrl: item.imageUrl,
      sku: item.sku,
      basePrice: new Prisma.Decimal(item.basePrice),
      prepTimeMinutes: item.prepTimeMinutes,
      dietaryFlags: item.dietaryFlags as unknown as Prisma.InputJsonValue,
      allergenFlags: item.allergenFlags as unknown as Prisma.InputJsonValue,
      isActive: item.isActive ?? true,
    }));

    const result = await this.itemRepository.createMany(payload);

    return {
      data: { count: result.count },
      message: 'Menu items created successfully',
    };
  }

  async list(user: AuthUserContext, query: ListMenuItemsDto) {
    const restaurantId = this.resolveRestaurantId(user, query.restaurantId, true);
    const { items, total } = await this.itemRepository.list(restaurantId, query);

    return {
      data: items,
      message: 'Menu items fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async update(user: AuthUserContext, id: string, dto: UpdateMenuItemDto) {
    const item = await this.itemRepository.findById(id);
    if (!item || item.deletedAt) {
      throw new NotFoundException('Menu item not found');
    }

    this.ensureCanAccessRestaurant(user, item.restaurantId);

    if (dto.categoryId) {
      await this.validateCategory(item.restaurantId, dto.categoryId);
    }

    const data = await this.itemRepository.update(id, {
      category: dto.categoryId ? { connect: { id: dto.categoryId } } : undefined,
      name: dto.name,
      slug: dto.slug,
      description: dto.description,
      imageUrl: dto.imageUrl,
      sku: dto.sku,
      basePrice:
        dto.basePrice !== undefined ? new Prisma.Decimal(dto.basePrice) : undefined,
      prepTimeMinutes: dto.prepTimeMinutes,
      dietaryFlags: dto.dietaryFlags as unknown as Prisma.InputJsonValue,
      allergenFlags: dto.allergenFlags as unknown as Prisma.InputJsonValue,
      isActive: dto.isActive,
    });

    return { data, message: 'Menu item updated successfully' };
  }

  async remove(user: AuthUserContext, id: string) {
    const item = await this.itemRepository.findById(id);
    if (!item || item.deletedAt) {
      throw new NotFoundException('Menu item not found');
    }

    this.ensureCanAccessRestaurant(user, item.restaurantId);

    const data = await this.itemRepository.softDelete(id);
    return { data, message: 'Menu item deleted successfully' };
  }

  private resolveRestaurantId(
    user: AuthUserContext,
    requestedRestaurantId?: string,
    allowReadForBranchAdmin = false,
  ) {
    if (
      user.role === UserRoleEnum.BUSINESS_ADMIN ||
      (allowReadForBranchAdmin && user.role === UserRoleEnum.BRANCH_ADMIN)
    ) {
      if (!user.rid) {
        throw new ForbiddenException('Restaurant context is required');
      }

      return user.rid;
    }

    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      if (!requestedRestaurantId) {
        throw new BadRequestException('restaurantId is required');
      }

      return requestedRestaurantId;
    }

    throw new ForbiddenException('Insufficient permissions for menu items');
  }

  private ensureCanAccessRestaurant(user: AuthUserContext, restaurantId: string) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return;
    }

    if (user.rid !== restaurantId) {
      throw new ForbiddenException('Cross-restaurant access denied');
    }
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
}
