import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUserContext } from '../../../common/decorators';
import { UserRoleEnum } from '../../../common/enums';
import { buildPaginationMeta } from '../../../common/utils';
import {
  CreateInventoryCategoryDto,
  ListInventoryCategoriesDto,
  UpdateInventoryCategoryDto,
} from './dto';
import { InventoryCategoryRepository } from './category.repository';

@Injectable()
export class InventoryCategoryService {
  constructor(
    private readonly categoryRepository: InventoryCategoryRepository,
  ) {}

  async create(user: AuthUserContext, dto: CreateInventoryCategoryDto) {
    const restaurantId = this.resolveRestaurantId(user, dto.restaurantId);

    const data = await this.categoryRepository.create({
      restaurant: { connect: { id: restaurantId } },
      name: dto.name,
      slug: dto.slug,
      description: dto.description,
      isActive: dto.isActive ?? true,
    });

    return { data, message: 'Inventory category created successfully' };
  }

  async list(user: AuthUserContext, query: ListInventoryCategoriesDto) {
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
      message: 'Inventory categories fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async update(
    user: AuthUserContext,
    id: string,
    dto: UpdateInventoryCategoryDto,
  ) {
    const category = await this.categoryRepository.findById(id);
    if (!category || category.deletedAt) {
      throw new NotFoundException('Inventory category not found');
    }

    this.ensureWriteAccess(user, category.restaurantId);

    const data = await this.categoryRepository.update(id, {
      name: dto.name,
      slug: dto.slug,
      description: dto.description,
      isActive: dto.isActive,
    });

    return { data, message: 'Inventory category updated successfully' };
  }

  async remove(user: AuthUserContext, id: string) {
    const category = await this.categoryRepository.findById(id);
    if (!category || category.deletedAt) {
      throw new NotFoundException('Inventory category not found');
    }

    this.ensureWriteAccess(user, category.restaurantId);

    const data = await this.categoryRepository.softDelete(id);
    return { data, message: 'Inventory category deleted successfully' };
  }

  private resolveRestaurantId(
    user: AuthUserContext,
    requestedRestaurantId?: string,
    allowReadForBranchAdmin = false,
  ) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return requestedRestaurantId;
    }

    if (
      user.role === UserRoleEnum.BUSINESS_ADMIN ||
      (allowReadForBranchAdmin && user.role === UserRoleEnum.BRANCH_ADMIN)
    ) {
      if (!user.rid) {
        throw new ForbiddenException('Restaurant context is required');
      }

      if (requestedRestaurantId && requestedRestaurantId !== user.rid) {
        throw new ForbiddenException('Cross-restaurant access denied');
      }

      return user.rid;
    }

    throw new ForbiddenException(
      'Insufficient permissions for inventory categories',
    );
  }

  private ensureWriteAccess(user: AuthUserContext, restaurantId: string) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return;
    }

    if (
      user.role !== UserRoleEnum.BUSINESS_ADMIN ||
      user.rid !== restaurantId
    ) {
      throw new ForbiddenException(
        'Insufficient permissions for inventory category write',
      );
    }
  }
}
