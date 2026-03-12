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
  ) {}

  async create(user: AuthUserContext, dto: CreateMenuCategoryDto) {
    const restaurantId = this.resolveRestaurantId(user, dto.restaurantId);
    await this.validateParentCategory(restaurantId, dto.parentCategoryId);

    const data = await this.categoryRepository.create({
      restaurant: { connect: { id: restaurantId } },
      parent: dto.parentCategoryId
        ? { connect: { id: dto.parentCategoryId } }
        : undefined,
      name: dto.name,
      slug: dto.slug,
      description: dto.description,
      imageUrl: dto.imageUrl,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });

    return { data, message: 'Menu category created successfully' };
  }

  async createBulk(user: AuthUserContext, dto: BulkCreateMenuCategoriesDto) {
    const restaurantId = this.resolveRestaurantId(user, dto.restaurantId);

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
    const restaurantId = this.resolveRestaurantId(
      user,
      query.restaurantId,
      true,
    );
    const { items, total } = await this.categoryRepository.list(
      restaurantId,
      query,
    );

    return {
      data: items,
      message: 'Menu categories fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async update(user: AuthUserContext, id: string, dto: UpdateMenuCategoryDto) {
    const category = await this.categoryRepository.findById(id);
    if (!category || category.deletedAt) {
      throw new NotFoundException('Menu category not found');
    }

    this.ensureCanAccessRestaurant(user, category.restaurantId);
    await this.validateParentCategory(
      category.restaurantId,
      dto.parentCategoryId,
      id,
    );

    const data = await this.categoryRepository.update(id, {
      parent: dto.parentCategoryId
        ? { connect: { id: dto.parentCategoryId } }
        : dto.parentCategoryId === null
          ? { disconnect: true }
          : undefined,
      name: dto.name,
      slug: dto.slug,
      description: dto.description,
      imageUrl: dto.imageUrl,
      sortOrder: dto.sortOrder,
      isActive: dto.isActive,
    });

    return { data, message: 'Menu category updated successfully' };
  }

  async remove(user: AuthUserContext, id: string) {
    const category = await this.categoryRepository.findById(id);
    if (!category || category.deletedAt) {
      throw new NotFoundException('Menu category not found');
    }

    this.ensureCanAccessRestaurant(user, category.restaurantId);

    const data = await this.categoryRepository.softDelete(id);
    return { data, message: 'Menu category deleted successfully' };
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

    throw new ForbiddenException(
      'Insufficient permissions for menu categories',
    );
  }

  private ensureCanAccessRestaurant(
    user: AuthUserContext,
    restaurantId: string,
  ) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return;
    }

    if (user.rid !== restaurantId) {
      throw new ForbiddenException('Cross-restaurant access denied');
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
}
