import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../database';
import { PrismaTx } from '../../../common/types';
import { ListModifierGroupsDto, ListModifiersDto } from './dto';

@Injectable()
export class ModifierRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaTx | PrismaClient {
    return tx ?? this.prisma;
  }

  async createGroup(data: Prisma.ModifierGroupCreateInput, tx?: PrismaTx) {
    return this.client(tx).modifierGroup.create({ data });
  }

  async listGroups(
    restaurantId: string | undefined,
    query: ListModifierGroupsDto,
  ) {
    const where: Prisma.ModifierGroupWhereInput = {
      ...(restaurantId ? { restaurantId } : {}),
      deletedAt: null,
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.modifierGroup.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        include: {
          modifiers: {
            where: { deletedAt: null },
            orderBy: { sortOrder: 'asc' },
          },
        },
      }),
      this.prisma.modifierGroup.count({ where }),
    ]);

    return { items, total };
  }

  async listModifiers(
    restaurantId: string | undefined,
    query: ListModifiersDto,
  ) {
    const where: Prisma.ModifierWhereInput = {
      deletedAt: null,
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.modifierGroupId
        ? { modifierGroupId: query.modifierGroupId }
        : {}),
      ...(restaurantId
        ? {
            modifierGroup: {
              restaurantId,
            },
          }
        : {}),
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.modifier.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        include: {
          modifierGroup: {
            select: {
              id: true,
              restaurantId: true,
              name: true,
              description: true,
              minSelect: true,
              maxSelect: true,
              isRequired: true,
              sortOrder: true,
              isActive: true,
            },
          },
        },
      }),
      this.prisma.modifier.count({ where }),
    ]);

    return { items, total };
  }

  async findGroupById(id: string) {
    return this.prisma.modifierGroup.findUnique({ where: { id } });
  }

  async updateGroup(
    id: string,
    data: Prisma.ModifierGroupUpdateInput,
    tx?: PrismaTx,
  ) {
    return this.client(tx).modifierGroup.update({ where: { id }, data });
  }

  async softDeleteGroup(id: string, tx?: PrismaTx) {
    return this.client(tx).modifierGroup.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  deleteGroupItemLinks(modifierGroupId: string, tx?: PrismaTx) {
    return this.client(tx).menuItemModifierGroup.deleteMany({
      where: { modifierGroupId },
    });
  }

  deleteGroupModifiers(modifierGroupId: string, tx?: PrismaTx) {
    return this.client(tx).modifier.deleteMany({
      where: { modifierGroupId },
    });
  }

  hardDeleteGroup(id: string, tx?: PrismaTx) {
    return this.client(tx).modifierGroup.delete({ where: { id } });
  }

  async createModifier(data: Prisma.ModifierCreateInput, tx?: PrismaTx) {
    return this.client(tx).modifier.create({ data });
  }

  async findModifierByGroupAndName(
    modifierGroupId: string,
    name: string,
    excludeId?: string,
  ) {
    return this.prisma.modifier.findFirst({
      where: {
        modifierGroupId,
        name: { equals: name, mode: 'insensitive' },
        deletedAt: null,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });
  }

  async findModifierById(id: string) {
    return this.prisma.modifier.findUnique({ where: { id } });
  }

  async updateModifier(
    id: string,
    data: Prisma.ModifierUpdateInput,
    tx?: PrismaTx,
  ) {
    return this.client(tx).modifier.update({ where: { id }, data });
  }

  async softDeleteModifier(id: string, tx?: PrismaTx) {
    return this.client(tx).modifier.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  hardDeleteModifier(id: string, tx?: PrismaTx) {
    return this.client(tx).modifier.delete({ where: { id } });
  }

  async attachGroupToItem(
    menuItemId: string,
    modifierGroupId: string,
    sortOrder: number,
    tx?: PrismaTx,
  ) {
    return this.client(tx).menuItemModifierGroup.upsert({
      where: {
        menuItemId_modifierGroupId: {
          menuItemId,
          modifierGroupId,
        },
      },
      update: { sortOrder },
      create: {
        menuItemId,
        modifierGroupId,
        sortOrder,
      },
    });
  }

  async attachGroupToCategory(
    categoryId: string,
    modifierGroupId: string,
    sortOrder: number,
    tx?: PrismaTx,
  ) {
    return this.client(tx).menuCategoryModifierGroup.upsert({
      where: {
        categoryId_modifierGroupId: {
          categoryId,
          modifierGroupId,
        },
      },
      update: { sortOrder },
      create: {
        categoryId,
        modifierGroupId,
        sortOrder,
      },
    });
  }

  listCategoryGroups(categoryId: string) {
    return this.prisma.menuCategoryModifierGroup.findMany({
      where: { categoryId },
      orderBy: [{ sortOrder: 'asc' }, { modifierGroup: { sortOrder: 'asc' } }],
      include: {
        modifierGroup: {
          include: {
            modifiers: {
              where: { deletedAt: null, isActive: true },
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            },
          },
        },
      },
    });
  }
}
