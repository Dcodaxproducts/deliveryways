import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUserContext } from '../../../common/decorators';
import { UserRoleEnum } from '../../../common/enums';
import { buildPaginationMeta } from '../../../common/utils';
import {
  CreateInventoryItemDto,
  ListInventoryItemsDto,
  UpdateInventoryItemDto,
} from './dto';
import { InventoryItemRepository } from './item.repository';

@Injectable()
export class InventoryItemService {
  constructor(private readonly itemRepository: InventoryItemRepository) {}

  async create(user: AuthUserContext, dto: CreateInventoryItemDto) {
    const restaurantId = this.resolveRestaurantId(user, dto.restaurantId);

    const data = await this.itemRepository.create({
      restaurant: { connect: { id: restaurantId } },
      category: dto.inventoryCategoryId
        ? { connect: { id: dto.inventoryCategoryId } }
        : undefined,
      name: dto.name,
      sku: dto.sku,
      unit: dto.unit,
      currentQty: new Prisma.Decimal(dto.currentQty ?? 0),
      reorderLevel:
        dto.reorderLevel !== undefined
          ? new Prisma.Decimal(dto.reorderLevel)
          : undefined,
      costPerUnit:
        dto.costPerUnit !== undefined
          ? new Prisma.Decimal(dto.costPerUnit)
          : undefined,
    });

    return { data, message: 'Inventory item created successfully' };
  }

  async list(user: AuthUserContext, query: ListInventoryItemsDto) {
    const restaurantId = this.resolveRestaurantId(
      user,
      query.restaurantId,
      true,
    );
    const { items, total } = await this.itemRepository.list(
      restaurantId,
      query,
    );

    return {
      data: items,
      message: 'Inventory items fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async update(user: AuthUserContext, id: string, dto: UpdateInventoryItemDto) {
    const item = await this.itemRepository.findById(id);
    if (!item || item.deletedAt) {
      throw new NotFoundException('Inventory item not found');
    }

    this.ensureWriteAccess(user, item.restaurantId);

    const data = await this.itemRepository.update(id, {
      category: dto.inventoryCategoryId
        ? { connect: { id: dto.inventoryCategoryId } }
        : undefined,
      name: dto.name,
      sku: dto.sku,
      unit: dto.unit,
      reorderLevel:
        dto.reorderLevel !== undefined
          ? new Prisma.Decimal(dto.reorderLevel)
          : undefined,
      costPerUnit:
        dto.costPerUnit !== undefined
          ? new Prisma.Decimal(dto.costPerUnit)
          : undefined,
      isActive: dto.isActive,
    });

    return { data, message: 'Inventory item updated successfully' };
  }

  async remove(user: AuthUserContext, id: string) {
    const item = await this.itemRepository.findById(id);
    if (!item || item.deletedAt) {
      throw new NotFoundException('Inventory item not found');
    }

    this.ensureWriteAccess(user, item.restaurantId);

    const data = await this.itemRepository.softDelete(id);
    return { data, message: 'Inventory item deleted successfully' };
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
      'Insufficient permissions for inventory items',
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
        'Insufficient permissions for inventory item write',
      );
    }
  }
}
