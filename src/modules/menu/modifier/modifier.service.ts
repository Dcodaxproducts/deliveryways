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
  AttachModifierToGroupDto,
  CreateModifierDto,
  CreateModifierGroupDto,
  DuplicateModifierDto,
  ListModifierGroupsDto,
  ListModifiersDto,
  SyncModifierGroupCategoriesDto,
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
      data: items.map((group) => this.mapGroup(group)),
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
      data: items.map((modifier) => this.mapModifier(modifier)),
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
      await this.modifierRepository.deleteGroupCategoryLinks(id, tx);
      await this.modifierRepository.deleteGroupModifierLinks(id, tx);
      return this.modifierRepository.hardDeleteGroup(id, tx);
    });

    return { data, message: 'Modifier group deleted successfully' };
  }

  async createModifier(user: AuthUserContext, dto: CreateModifierDto) {
    const modifierGroupIds = this.normalizeModifierGroupIds(
      dto.modifierGroupIds,
    );
    const groups = modifierGroupIds.length
      ? await this.modifierRepository.findGroupsByIds(modifierGroupIds)
      : [];

    if (modifierGroupIds.length) {
      this.assertValidModifierGroups(groups, modifierGroupIds);
    }

    const restaurantId = groups.length
      ? groups[0].restaurantId
      : await this.resolveRestaurantId(user, dto.restaurantId);

    this.assertGroupsBelongToRestaurant(groups, restaurantId);

    await this.ensureWriteAccess(user, restaurantId);

    const normalizedName = this.normalizeName(dto.name);
    const existingModifier =
      await this.modifierRepository.findModifierByRestaurantAndName(
        restaurantId,
        normalizedName,
      );

    if (existingModifier) {
      throw new BadRequestException(
        'A modifier with this name already exists in this restaurant',
      );
    }

    const data = await this.prisma.$transaction(async (tx) => {
      const modifier = await this.modifierRepository.createModifier(
        {
          restaurant: { connect: { id: restaurantId } },
          name: normalizedName,
          priceDelta: new Prisma.Decimal(dto.priceDelta ?? 0),
          sortOrder: dto.sortOrder ?? 0,
          isActive: true,
        },
        tx,
      );

      if (modifierGroupIds.length) {
        await this.modifierRepository.syncModifierGroups(
          modifier.id,
          modifierGroupIds,
          dto.sortOrder ?? 0,
          tx,
        );
      }

      return modifier;
    });

    return { data, message: 'Modifier created successfully' };
  }

  async duplicateModifier(
    user: AuthUserContext,
    id: string,
    dto: DuplicateModifierDto,
  ) {
    const modifier = await this.modifierRepository.findModifierById(id);
    if (!modifier || modifier.deletedAt) {
      throw new NotFoundException('Modifier not found');
    }

    await this.ensureWriteAccess(user, modifier.restaurantId);

    const normalizedName = dto.name
      ? this.normalizeName(dto.name)
      : await this.generateDuplicateModifierName(
          modifier.restaurantId,
          modifier.name,
        );

    if (dto.name) {
      const existingModifier =
        await this.modifierRepository.findModifierByRestaurantAndName(
          modifier.restaurantId,
          normalizedName,
        );

      if (existingModifier) {
        throw new BadRequestException(
          'A modifier with this name already exists in this restaurant',
        );
      }
    }

    const modifierGroupIds =
      dto.modifierGroupIds ??
      modifier.groupLinks.map((link) => link.modifierGroup.id);

    const groups = modifierGroupIds.length
      ? await this.modifierRepository.findGroupsByIds(modifierGroupIds)
      : [];

    this.assertValidModifierGroups(groups, modifierGroupIds);
    this.assertGroupsBelongToRestaurant(groups, modifier.restaurantId);

    const data = await this.prisma.$transaction(async (tx) => {
      const duplicated = await this.modifierRepository.createModifier(
        {
          restaurant: { connect: { id: modifier.restaurantId } },
          name: normalizedName,
          priceDelta: new Prisma.Decimal(dto.priceDelta ?? modifier.priceDelta),
          sortOrder: dto.sortOrder ?? modifier.sortOrder,
          isActive: true,
        },
        tx,
      );

      if (modifierGroupIds.length) {
        await this.modifierRepository.syncModifierGroups(
          duplicated.id,
          modifierGroupIds,
          dto.sortOrder ?? modifier.sortOrder,
          tx,
        );
      }

      return duplicated;
    });

    return { data, message: 'Modifier duplicated successfully' };
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

    await this.ensureWriteAccess(user, modifier.restaurantId);

    if (dto.modifierGroupIds !== undefined) {
      const groups = dto.modifierGroupIds.length
        ? await this.modifierRepository.findGroupsByIds(dto.modifierGroupIds)
        : [];

      this.assertValidModifierGroups(groups, dto.modifierGroupIds);
      this.assertGroupsBelongToRestaurant(groups, modifier.restaurantId);
    }

    const normalizedName =
      dto.name !== undefined ? this.normalizeName(dto.name) : undefined;

    if (normalizedName) {
      const existingModifier =
        await this.modifierRepository.findModifierByRestaurantAndName(
          modifier.restaurantId,
          normalizedName,
          id,
        );

      if (existingModifier) {
        throw new BadRequestException(
          'A modifier with this name already exists in this restaurant',
        );
      }
    }

    const data = await this.prisma.$transaction(async (tx) => {
      const updatedModifier = await this.modifierRepository.updateModifier(
        id,
        {
          name: normalizedName,
          priceDelta:
            dto.priceDelta !== undefined
              ? new Prisma.Decimal(dto.priceDelta)
              : undefined,
          sortOrder: dto.sortOrder,
          isActive: dto.isActive,
        },
        tx,
      );

      if (dto.modifierGroupIds !== undefined) {
        await this.modifierRepository.syncModifierGroups(
          id,
          dto.modifierGroupIds,
          dto.sortOrder ?? updatedModifier.sortOrder,
          tx,
        );
      }

      return updatedModifier;
    });

    return { data, message: 'Modifier updated successfully' };
  }

  async removeModifier(user: AuthUserContext, id: string) {
    const modifier = await this.modifierRepository.findModifierById(id);
    if (!modifier || modifier.deletedAt) {
      throw new NotFoundException('Modifier not found');
    }

    await this.ensureWriteAccess(user, modifier.restaurantId);

    const data = await this.modifierRepository.hardDeleteModifier(id);
    return { data, message: 'Modifier deleted successfully' };
  }

  async attachModifierToGroup(
    user: AuthUserContext,
    groupId: string,
    modifierId: string,
    dto: AttachModifierToGroupDto,
  ) {
    const [group, modifier] = await Promise.all([
      this.modifierRepository.findGroupById(groupId),
      this.modifierRepository.findModifierById(modifierId),
    ]);

    if (!group || group.deletedAt) {
      throw new NotFoundException('Modifier group not found');
    }

    if (!modifier || modifier.deletedAt) {
      throw new NotFoundException('Modifier not found');
    }

    if (group.restaurantId !== modifier.restaurantId) {
      throw new BadRequestException(
        'Modifier and modifier group must belong to the same restaurant',
      );
    }

    await this.ensureWriteAccess(user, group.restaurantId);

    const data = await this.modifierRepository.attachModifierToGroup(
      groupId,
      modifierId,
      dto.sortOrder ?? modifier.sortOrder,
    );

    return { data, message: 'Modifier attached to group successfully' };
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
      data: (await this.modifierRepository.listCategoryGroups(categoryId)).map(
        (link) => ({
          ...link,
          modifierGroup: this.mapGroup(link.modifierGroup),
        }),
      ),
      message: 'Category modifier groups fetched successfully',
    };
  }

  async listGroupCategories(user: AuthUserContext, groupId: string) {
    const group = await this.modifierRepository.findGroupById(groupId);
    if (!group || group.deletedAt) {
      throw new NotFoundException('Modifier group not found');
    }

    await this.ensureReadAccess(user, group.restaurantId);

    return {
      data: (await this.modifierRepository.listGroupCategories(groupId)).map(
        (link) => ({
          ...link,
          category: link.category,
        }),
      ),
      message: 'Modifier group categories fetched successfully',
    };
  }

  async syncGroupCategories(
    user: AuthUserContext,
    groupId: string,
    dto: SyncModifierGroupCategoriesDto,
  ) {
    const group = await this.modifierRepository.findGroupById(groupId);
    if (!group || group.deletedAt) {
      throw new NotFoundException('Modifier group not found');
    }

    await this.ensureWriteAccess(user, group.restaurantId);

    const categoryIds = [...new Set(dto.categoryIds)];
    const categories = categoryIds.length
      ? await this.prisma.menuCategory.findMany({
          where: {
            id: { in: categoryIds },
            restaurantId: group.restaurantId,
            deletedAt: null,
          },
          select: { id: true },
        })
      : [];

    if (categories.length !== categoryIds.length) {
      throw new BadRequestException(
        'All categories must exist in the modifier group restaurant',
      );
    }

    const data = await this.prisma.$transaction((tx) =>
      this.modifierRepository.syncGroupCategories(groupId, categoryIds, tx),
    );

    return {
      data,
      message: 'Modifier group categories updated successfully',
    };
  }

  private mapGroup(group: {
    id: string;
    name: string;
    description: string | null;
    minSelect: number;
    maxSelect: number;
    isRequired: boolean;
    sortOrder: number;
    isActive: boolean;
    modifierLinks?: Array<{
      sortOrder: number;
      modifier: {
        id: string;
        name: string;
        priceDelta: Prisma.Decimal;
        sortOrder: number;
        isActive: boolean;
      };
    }>;
    categoryLinks?: Array<{
      sortOrder: number;
      categoryId: string;
      category: {
        id: string;
        name: string;
        slug: string;
      };
    }>;
  }) {
    return {
      ...group,
      modifiers: (group.modifierLinks ?? []).map((link) => ({
        ...link.modifier,
        sortOrder: link.sortOrder,
      })),
      categoryIds: (group.categoryLinks ?? []).map((link) => link.categoryId),
      categories: (group.categoryLinks ?? []).map((link) => ({
        ...link.category,
        sortOrder: link.sortOrder,
      })),
    };
  }

  private mapModifier(modifier: {
    id: string;
    name: string;
    priceDelta: Prisma.Decimal;
    sortOrder: number;
    isActive: boolean;
    groupLinks?: Array<{
      sortOrder: number;
      modifierGroup: {
        id: string;
        restaurantId: string;
        name: string;
        description: string | null;
        minSelect: number;
        maxSelect: number;
        isRequired: boolean;
        sortOrder: number;
        isActive: boolean;
      };
    }>;
  }) {
    return {
      ...modifier,
      modifierGroups: (modifier.groupLinks ?? []).map((link) => ({
        ...link.modifierGroup,
        sortOrder: link.sortOrder,
      })),
    };
  }

  private async generateDuplicateModifierName(
    restaurantId: string,
    sourceName: string,
  ) {
    const baseName = `${this.normalizeName(sourceName)} Copy`;
    let candidate = baseName;
    let suffix = 2;

    while (
      await this.modifierRepository.findModifierByRestaurantAndName(
        restaurantId,
        candidate,
      )
    ) {
      candidate = `${baseName} ${suffix}`;
      suffix += 1;
    }

    return candidate;
  }

  private normalizeName(value: string) {
    const normalized = value.trim();

    if (!normalized.length) {
      throw new BadRequestException('name is required');
    }

    return normalized;
  }

  private normalizeModifierGroupIds(modifierGroupIds?: string[]) {
    return [...new Set((modifierGroupIds ?? []).filter(Boolean))] as string[];
  }

  private assertValidModifierGroups(
    groups: Array<{
      id: string;
      restaurantId: string;
      deletedAt: Date | null;
    }>,
    expectedGroupIds: string[],
  ) {
    if (
      groups.length !== expectedGroupIds.length ||
      groups.some((group) => group.deletedAt)
    ) {
      throw new NotFoundException('One or more modifier groups were not found');
    }
  }

  private assertGroupsBelongToRestaurant(
    groups: Array<{
      restaurantId: string;
    }>,
    restaurantId: string,
  ) {
    if (groups.some((group) => group.restaurantId !== restaurantId)) {
      throw new BadRequestException(
        'All modifier groups must belong to the same restaurant',
      );
    }
  }

  private async resolveRestaurantId(
    user: AuthUserContext,
    requestedRestaurantId?: string,
  ): Promise<string> {
    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      if (!user.tid) {
        throw new ForbiddenException('Tenant context is required');
      }

      const fallbackRestaurantId = requestedRestaurantId ?? user.rid;
      if (!fallbackRestaurantId) {
        throw new BadRequestException('restaurantId is required');
      }

      await this.assertRestaurantInTenant(user.tid, fallbackRestaurantId);
      return fallbackRestaurantId;
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
