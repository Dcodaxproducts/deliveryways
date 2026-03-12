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
    const restaurantId = this.resolveRestaurantId(user, dto.restaurantId);

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
    const restaurantId = this.resolveRestaurantId(
      user,
      query.restaurantId,
      true,
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

  async updateGroup(
    user: AuthUserContext,
    id: string,
    dto: UpdateModifierGroupDto,
  ) {
    const group = await this.modifierRepository.findGroupById(id);
    if (!group || group.deletedAt) {
      throw new NotFoundException('Modifier group not found');
    }

    this.ensureWriteAccess(user, group.restaurantId);

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

    this.ensureWriteAccess(user, group.restaurantId);

    const data = await this.modifierRepository.softDeleteGroup(id);
    return { data, message: 'Modifier group deleted successfully' };
  }

  async createModifier(user: AuthUserContext, dto: CreateModifierDto) {
    const group = await this.modifierRepository.findGroupById(
      dto.modifierGroupId,
    );
    if (!group || group.deletedAt) {
      throw new NotFoundException('Modifier group not found');
    }

    this.ensureWriteAccess(user, group.restaurantId);

    const data = await this.modifierRepository.createModifier({
      modifierGroup: { connect: { id: dto.modifierGroupId } },
      name: dto.name,
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

    this.ensureWriteAccess(user, group.restaurantId);

    const data = await this.modifierRepository.updateModifier(id, {
      name: dto.name,
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

    this.ensureWriteAccess(user, group.restaurantId);

    const data = await this.modifierRepository.softDeleteModifier(id);
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

    this.ensureWriteAccess(user, item.restaurantId);

    const data = await this.modifierRepository.attachGroupToItem(
      itemId,
      groupId,
      dto.sortOrder ?? 0,
    );

    return { data, message: 'Modifier group attached to item successfully' };
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

    throw new ForbiddenException('Insufficient permissions for modifiers');
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
        'Insufficient permissions for modifier write',
      );
    }
  }
}
