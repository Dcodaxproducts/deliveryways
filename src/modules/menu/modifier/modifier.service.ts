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
  AttachModifierGroupDto,
  CreateModifierDto,
  CreateModifierGroupDto,
  ListModifierGroupsDto,
  ListModifiersDto,
  UpdateModifierDto,
  UpdateModifierGroupDto,
} from './dto';
import { ModifierRepository } from './modifier.repository';

@Injectable()
export class ModifierService {
  constructor(
    private readonly modifierRepository: ModifierRepository,
    private readonly prisma: PrismaService,
  ) {}

  async createGroup(user: AuthUserContext, dto: CreateModifierGroupDto) {
    const restaurantId = await this.resolveRestaurantId(user, dto.restaurantId);

    if ((dto.maxSelect ?? 1) < (dto.minSelect ?? 0)) {
      throw new BadRequestException('maxSelect cannot be less than minSelect');
    }

    const data = await this.modifierRepository.createGroup({
      restaurant: { connect: { id: restaurantId } },
      name: dto.name,
      description: dto.description,
      minSelect: dto.minSelect ?? 0,
      maxSelect: dto.maxSelect ?? 1,
      isRequired: dto.isRequired ?? false,
      sortOrder: dto.sortOrder ?? 0,
      isActive: true,
    });

    return { data, message: 'Modifier group created successfully' };
  }

  async listGroups(user: AuthUserContext, query: ListModifierGroupsDto) {
    const restaurantId = await this.resolveRestaurantIdForList(
      user,
      query.restaurantId,
    );
    const { items, total } = await this.modifierRepository.listGroups(
      restaurantId,
      query,
    );

    return {
      data: items,
      message: 'Modifier groups fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async listModifiers(user: AuthUserContext, query: ListModifiersDto) {
    const restaurantId = await this.resolveRestaurantIdForList(
      user,
      query.restaurantId,
    );
    const { items, total } = await this.modifierRepository.listModifiers(
      restaurantId,
      query,
    );

    return {
      data: items,
      message: 'Modifiers fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async updateGroup(
    user: AuthUserContext,
    id: string,
    dto: UpdateModifierGroupDto,
  ) {
    const group = await this.modifierRepository.findGroupById(id);
    if (!group || group.deletedAt) {
      throw new NotFoundException('Modifier group not found');
    }

    await this.ensureWriteAccess(user, group.restaurantId);

    if (
      dto.minSelect !== undefined &&
      dto.maxSelect !== undefined &&
      dto.maxSelect < dto.minSelect
    ) {
      throw new BadRequestException('maxSelect cannot be less than minSelect');
    }

    const data = await this.modifierRepository.updateGroup(id, {
      name: dto.name,
      description: dto.description,
      minSelect: dto.minSelect,
      maxSelect: dto.maxSelect,
      isRequired: dto.isRequired,
      sortOrder: dto.sortOrder,
      isActive: dto.isActive,
    });

    return { data, message: 'Modifier group updated successfully' };
  }

  async removeGroup(user: AuthUserContext, id: string) {
    const group = await this.modifierRepository.findGroupById(id);
    if (!group || group.deletedAt) {
      throw new NotFoundException('Modifier group not found');
    }

    await this.ensureWriteAccess(user, group.restaurantId);

    const data = await this.prisma.$transaction(async (tx) => {
      await this.modifierRepository.deleteGroupItemLinks(id, tx);
      await this.modifierRepository.deleteGroupModifiers(id, tx);
      return this.modifierRepository.hardDeleteGroup(id, tx);
    });

    return { data, message: 'Modifier group deleted successfully' };
  }

  async createModifier(user: AuthUserContext, dto: CreateModifierDto) {
    const group = await this.modifierRepository.findGroupById(
      dto.modifierGroupId,
    );
    if (!group || group.deletedAt) {
      throw new NotFoundException('Modifier group not found');
    }

    await this.ensureWriteAccess(user, group.restaurantId);

    const normalizedName = this.normalizeName(dto.name);
    const existingModifier =
      await this.modifierRepository.findModifierByGroupAndName(
        dto.modifierGroupId,
        normalizedName,
      );

    if (existingModifier) {
      throw new BadRequestException(
        'A modifier with this name already exists in this group',
      );
    }

    const data = await this.modifierRepository.createModifier({
      modifierGroup: { connect: { id: dto.modifierGroupId } },
      name: normalizedName,
      priceDelta: new Prisma.Decimal(dto.priceDelta ?? 0),
      sortOrder: dto.sortOrder ?? 0,
      isActive: true,
    });

    return { data, message: 'Modifier created successfully' };
  }

  async updateModifier(
    user: AuthUserContext,
    id: string,
    dto: UpdateModifierDto,
  ) {
    const modifier = await this.modifierRepository.findModifierById(id);
    if (!modifier || modifier.deletedAt) {
      throw new NotFoundException('Modifier not found');
    }

    const group = await this.modifierRepository.findGroupById(
      modifier.modifierGroupId,
    );
    if (!group || group.deletedAt) {
      throw new NotFoundException('Modifier group not found');
    }

    await this.ensureWriteAccess(user, group.restaurantId);

    const normalizedName =
      dto.name !== undefined ? this.normalizeName(dto.name) : undefined;

    if (normalizedName) {
      const existingModifier =
        await this.modifierRepository.findModifierByGroupAndName(
          modifier.modifierGroupId,
          normalizedName,
          id,
        );

      if (existingModifier) {
        throw new BadRequestException(
          'A modifier with this name already exists in this group',
        );
      }
    }

    const data = await this.modifierRepository.updateModifier(id, {
      name: normalizedName,
      priceDelta:
        dto.priceDelta !== undefined
          ? new Prisma.Decimal(dto.priceDelta)
          : undefined,
      sortOrder: dto.sortOrder,
      isActive: dto.isActive,
    });

    return { data, message: 'Modifier updated successfully' };
  }

  async removeModifier(user: AuthUserContext, id: string) {
    const modifier = await this.modifierRepository.findModifierById(id);
    if (!modifier || modifier.deletedAt) {
      throw new NotFoundException('Modifier not found');
    }

    const group = await this.modifierRepository.findGroupById(
      modifier.modifierGroupId,
    );
    if (!group || group.deletedAt) {
      throw new NotFoundException('Modifier group not found');
    }

    await this.ensureWriteAccess(user, group.restaurantId);

    const data = await this.modifierRepository.hardDeleteModifier(id);
    return { data, message: 'Modifier deleted successfully' };
  }

  async attachGroupToItem(
    user: AuthUserContext,
    itemId: string,
    groupId: string,
    dto: AttachModifierGroupDto,
  ) {
    const item = await this.prisma.menuItem.findUnique({
      where: { id: itemId },
    });
    if (!item || item.deletedAt) {
      throw new NotFoundException('Menu item not found');
    }

    const group = await this.modifierRepository.findGroupById(groupId);
    if (!group || group.deletedAt) {
      throw new NotFoundException('Modifier group not found');
    }

    if (item.restaurantId !== group.restaurantId) {
      throw new BadRequestException(
        'Menu item and modifier group must belong to the same restaurant',
      );
    }

    await this.ensureWriteAccess(user, item.restaurantId);

    const data = await this.modifierRepository.attachGroupToItem(
      itemId,
      groupId,
      dto.sortOrder ?? 0,
    );

    return { data, message: 'Modifier group attached to item successfully' };
  }

  async attachGroupToCategory(
    user: AuthUserContext,
    categoryId: string,
    groupId: string,
    dto: AttachModifierGroupDto,
  ) {
    const category = await this.prisma.menuCategory.findUnique({
      where: { id: categoryId },
    });
    if (!category || category.deletedAt) {
      throw new NotFoundException('Menu category not found');
    }

    const group = await this.modifierRepository.findGroupById(groupId);
    if (!group || group.deletedAt) {
      throw new NotFoundException('Modifier group not found');
    }

    if (category.restaurantId !== group.restaurantId) {
      throw new BadRequestException(
        'Menu category and modifier group must belong to the same restaurant',
      );
    }

    await this.ensureWriteAccess(user, category.restaurantId);

    const data = await this.modifierRepository.attachGroupToCategory(
      categoryId,
      groupId,
      dto.sortOrder ?? 0,
    );

    return {
      data,
      message: 'Modifier group attached to category successfully',
    };
  }

  async listCategoryGroups(user: AuthUserContext, categoryId: string) {
    const category = await this.prisma.menuCategory.findUnique({
      where: { id: categoryId },
    });
    if (!category || category.deletedAt) {
      throw new NotFoundException('Menu category not found');
    }

    await this.ensureReadAccess(user, category.restaurantId);

    return {
      data: await this.modifierRepository.listCategoryGroups(categoryId),
      message: 'Category modifier groups fetched successfully',
    };
  }

  private normalizeName(value: string) {
    const normalized = value.trim();

    if (!normalized.length) {
      throw new BadRequestException('name is required');
    }

    return normalized;
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

    throw new ForbiddenException('Insufficient permissions for modifier write');
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

    throw new ForbiddenException('Insufficient permissions for modifiers');
  }

  private async ensureWriteAccess(user: AuthUserContext, restaurantId: string) {
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

    throw new ForbiddenException('Insufficient permissions for modifier write');
  }

  private async ensureReadAccess(user: AuthUserContext, restaurantId: string) {
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
}
