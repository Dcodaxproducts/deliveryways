import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../database';
import { PrismaTx } from '../../../common/types';
import { ListModifierGroupsDto } from './dto';

@Injectable()
export class ModifierRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaTx | PrismaClient {
    return tx ?? this.prisma;
  }

  async createGroup(data: Prisma.ModifierGroupCreateInput, tx?: PrismaTx) {
    return this.client(tx).modifierGroup.create({ data });
  }

  async listGroups(restaurantId: string, query: ListModifierGroupsDto) {
    const where: Prisma.ModifierGroupWhereInput = {
      restaurantId,
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

  async createModifier(data: Prisma.ModifierCreateInput, tx?: PrismaTx) {
    return this.client(tx).modifier.create({ data });
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
}
