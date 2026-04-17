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
  BulkCreateMenuCategoriesDto,
  CreateMenuCategoryDto,
  ListMenuCategoriesDto,
  UpdateMenuCategoryDto,
} from './dto';
import { MenuCategoryRepository } from './category.repository';

@Injectable()
export class MenuCategoryService {
  constructor(
    private readonly categoryRepository: MenuCategoryRepository,
    private readonly prisma: PrismaService,
    private readonly storageService?: StorageService,
  ) {}

  async create(user: AuthUserContext, dto: CreateMenuCategoryDto) {
    const restaurantId = await this.resolveRestaurantId(user, dto.restaurantId);
    await this.validateParentCategory(restaurantId, dto.parentCategoryId);
    const slug = this.normalizeRequiredString(dto.slug, 'slug');
    await this.assertUniqueSlug(restaurantId, slug);

    const data = await this.categoryRepository.create({
      restaurant: { connect: { id: restaurantId } },
      parent: dto.parentCategoryId
        ? { connect: { id: dto.parentCategoryId } }
        : undefined,
      name: dto.name,
      slug,
      description: dto.description,
      imageUrl: dto.imageUrl,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });

    return {
      data: await this.resolveMediaResponse(data),
      message: 'Menu category created successfully',
    };
  }

  async createBulk(user: AuthUserContext, dto: BulkCreateMenuCategoriesDto) {
    const restaurantId = await this.resolveRestaurantId(user, dto.restaurantId);

    if (!dto.items.length) {
      throw new BadRequestException('At least one item is required');
    }

    for (const item of dto.items) {
      await this.validateParentCategory(restaurantId, item.parentCategoryId);
    }

    const payload: Prisma.MenuCategoryCreateManyInput[] = dto.items.map(
      (item) => ({
        restaurantId,
        parentCategoryId: item.parentCategoryId,
        name: item.name,
        slug: item.slug,
        description: item.description,
        imageUrl: item.imageUrl,
        sortOrder: item.sortOrder ?? 0,
        isActive: item.isActive ?? true,
      }),
    );

    const result = await this.categoryRepository.createMany(payload);

    return {
      data: { count: result.count },
      message: 'Menu categories created successfully',
    };
  }

  async list(user: AuthUserContext, query: ListMenuCategoriesDto) {
    const restaurantId = await this.resolveRestaurantIdForList(
      user,
      query.restaurantId,
    );
    const { items, total } = await this.categoryRepository.list(
      restaurantId,
      query,
    );

    return {
      data: await this.resolveMediaResponse(
        items.map((item) => this.withModifierGroups(item)),
      ),
      message: 'Menu categories fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async update(user: AuthUserContext, id: string, dto: UpdateMenuCategoryDto) {
    const category = await this.categoryRepository.findById(id);
    if (!category || category.deletedAt) {
      throw new NotFoundException('Menu category not found');
    }

    await this.ensureCanAccessRestaurant(user, category.restaurantId);
    await this.validateParentCategory(
      category.restaurantId,
      dto.parentCategoryId,
      id,
    );
    const slug =
      dto.slug !== undefined
        ? this.normalizeRequiredString(dto.slug, 'slug')
        : undefined;

    if (slug) {
      await this.assertUniqueSlug(category.restaurantId, slug, id);
    }

    const data = await this.categoryRepository.update(id, {
      parent: dto.parentCategoryId
        ? { connect: { id: dto.parentCategoryId } }
        : dto.parentCategoryId === null
          ? { disconnect: true }
          : undefined,
      name: dto.name,
      slug,
      description: dto.description,
      imageUrl: dto.imageUrl,
      sortOrder: dto.sortOrder,
      isActive: dto.isActive,
    });

    return {
      data: await this.resolveMediaResponse(data),
      message: 'Menu category updated successfully',
    };
  }

  async remove(user: AuthUserContext, id: string) {
    const category = await this.categoryRepository.findById(id);
    if (!category || category.deletedAt) {
      throw new NotFoundException('Menu category not found');
    }

    await this.ensureCanAccessRestaurant(user, category.restaurantId);

    const [childrenCount, itemsCount] = await Promise.all([
      this.categoryRepository.countChildren(id),
      this.categoryRepository.countItems(id),
    ]);

    if (childrenCount > 0) {
      throw new BadRequestException(
        'Menu category cannot be permanently deleted while child categories exist',
      );
    }

    if (itemsCount > 0) {
      throw new BadRequestException(
        'Menu category cannot be permanently deleted while menu items exist',
      );
    }

    const data = await this.prisma.$transaction(async (tx) => {
      await this.categoryRepository.clearCouponScopes(id, tx);
      await this.categoryRepository.deleteBranchOverrides(id, tx);
      return this.categoryRepository.hardDelete(id, tx);
    });

    return { data, message: 'Menu category deleted successfully' };
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
      'Insufficient permissions for menu category write',
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

    throw new ForbiddenException(
      'Insufficient permissions for menu categories',
    );
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

  private async validateParentCategory(
    restaurantId: string,
    parentCategoryId?: string,
    currentCategoryId?: string,
  ) {
    if (!parentCategoryId) {
      return;
    }

    if (currentCategoryId && parentCategoryId === currentCategoryId) {
      throw new BadRequestException('Category cannot be parent of itself');
    }

    const parent = await this.prisma.menuCategory.findFirst({
      where: {
        id: parentCategoryId,
        restaurantId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!parent) {
      throw new BadRequestException('Parent category not found in restaurant');
    }
  }

  private async assertUniqueSlug(
    restaurantId: string,
    slug: string,
    excludeId?: string,
  ) {
    const existing = await this.categoryRepository.findByRestaurantAndSlug(
      restaurantId,
      slug,
      excludeId,
    );

    if (existing) {
      throw new BadRequestException(
        existing.deletedAt
          ? 'A menu category with this slug already exists in this restaurant, including a deleted category'
          : 'A menu category with this slug already exists in this restaurant',
      );
    }
  }

  private normalizeRequiredString(value: string, field: string) {
    const normalized = value.trim();

    if (!normalized) {
      throw new BadRequestException(`${field} is required`);
    }

    return normalized;
  }

  private async resolveMediaResponse<T>(data: T) {
    return (await this.storageService?.resolveMediaUrlsDeep(data)) ?? data;
  }

  private withModifierGroups<T extends { modifierLinks?: unknown }>(item: T) {
    const modifierLinks = Array.isArray(item.modifierLinks)
      ? (item.modifierLinks as Array<{
          sortOrder: number;
          modifierGroup: {
            id: string;
            name: string;
            description?: string | null;
            minSelect: number;
            maxSelect: number;
            isRequired: boolean;
            modifiers: Array<{
              id: string;
              name: string;
              priceDelta: Prisma.Decimal;
            }>;
          };
        }>)
      : [];

    return {
      ...item,
      modifierGroups: modifierLinks.map((link) => ({
        id: link.modifierGroup.id,
        name: link.modifierGroup.name,
        description: link.modifierGroup.description ?? null,
        minSelect: link.modifierGroup.minSelect,
        maxSelect: link.modifierGroup.maxSelect,
        isRequired: link.modifierGroup.isRequired,
        sortOrder: link.sortOrder,
        modifiers: link.modifierGroup.modifiers.map((modifier) => ({
          id: modifier.id,
          name: modifier.name,
          priceDelta: modifier.priceDelta,
        })),
      })),
    };
  }
}
