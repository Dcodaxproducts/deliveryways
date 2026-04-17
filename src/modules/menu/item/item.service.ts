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

    const slug = this.normalizeRequiredString(dto.slug, 'slug');
    const sku = this.resolveOptionalString(dto.sku);
    await this.assertUniqueFields(restaurantId, { slug, sku });

    const data = await this.itemRepository.create({
      restaurant: { connect: { id: restaurantId } },
      category: { connect: { id: dto.categoryId } },
      name: dto.name,
      slug,
      description: dto.description,
      ingredients: dto.ingredients,
      nutritionalInformation: dto.nutritionalInformation,
      imageUrl: dto.imageUrl,
      sku,
      basePrice: new Prisma.Decimal(dto.basePrice),
      prepTimeMinutes: dto.prepTimeMinutes,
      dietaryFlags: dto.dietaryFlags as unknown as Prisma.InputJsonValue,
      allergenFlags: dto.allergenFlags as unknown as Prisma.InputJsonValue,
      isActive: dto.isActive ?? true,
    });

    return {
      data: await this.resolveMediaResponse(data),
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

    const payload: Prisma.MenuItemCreateManyInput[] = dto.items.map((item) => ({
      restaurantId,
      categoryId: item.categoryId,
      name: item.name,
      slug: item.slug,
      description: item.description,
      ingredients: item.ingredients,
      nutritionalInformation: item.nutritionalInformation,
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
    const restaurantId = await this.resolveRestaurantIdForList(
      user,
      query.restaurantId,
    );
    const { items, total } = await this.itemRepository.list(
      restaurantId,
      query,
    );

    return {
      data: await this.resolveMediaResponse(items),
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

    const slug =
      dto.slug !== undefined
        ? this.normalizeRequiredString(dto.slug, 'slug')
        : undefined;
    const sku =
      dto.sku !== undefined ? this.resolveOptionalString(dto.sku) : undefined;
    await this.assertUniqueFields(item.restaurantId, { slug, sku }, id);

    const data = await this.itemRepository.update(id, {
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
      basePrice:
        dto.basePrice !== undefined
          ? new Prisma.Decimal(dto.basePrice)
          : undefined,
      prepTimeMinutes: dto.prepTimeMinutes,
      dietaryFlags: dto.dietaryFlags as unknown as Prisma.InputJsonValue,
      allergenFlags: dto.allergenFlags as unknown as Prisma.InputJsonValue,
      isActive: dto.isActive,
    });

    return {
      data: await this.resolveMediaResponse(data),
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
      await this.itemRepository.deleteVariations(id, tx);
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

  private async resolveMediaResponse<T>(data: T) {
    return (await this.storageService?.resolveMediaUrlsDeep(data)) ?? data;
  }
}
