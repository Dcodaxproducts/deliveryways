import { Injectable } from '@nestjs/common';
import { ModifierSelectionType, Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../database';
import { PrismaTx } from '../../../common/types';
import {
  ListModifierCategoriesDto,
  ListModifierGroupsDto,
  ListModifiersDto,
} from './dto';

@Injectable()
export class ModifierRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaTx | PrismaClient {
    return tx ?? this.prisma;
  }

  private resolveModifierCategoryOrderBy(
    query: ListModifierCategoriesDto,
  ): Prisma.ModifierCategoryOrderByWithRelationInput[] {
    const direction = query.sortOrder.toLowerCase() as 'asc' | 'desc';

    if (query.sortBy === 'sortOrder') {
      return [{ sortOrder: direction }, { createdAt: 'desc' }];
    }

    return [
      { sortOrder: 'asc' },
      { [query.sortBy]: direction },
    ] as Prisma.ModifierCategoryOrderByWithRelationInput[];
  }

  private resolveModifierGroupOrderBy(
    query: ListModifierGroupsDto,
  ): Prisma.ModifierGroupOrderByWithRelationInput[] {
    const direction = query.sortOrder.toLowerCase() as 'asc' | 'desc';

    if (query.sortBy === 'sortOrder') {
      return [{ sortOrder: direction }, { createdAt: 'desc' }];
    }

    return [
      { sortOrder: 'asc' },
      { [query.sortBy]: direction },
    ] as Prisma.ModifierGroupOrderByWithRelationInput[];
  }

  private resolveModifierOrderBy(
    query: ListModifiersDto,
  ): Prisma.ModifierOrderByWithRelationInput[] {
    const direction = query.sortOrder.toLowerCase() as 'asc' | 'desc';

    if (query.sortBy === 'sortOrder') {
      return [{ sortOrder: direction }, { createdAt: 'desc' }];
    }

    return [
      { sortOrder: 'asc' },
      { [query.sortBy]: direction },
    ] as Prisma.ModifierOrderByWithRelationInput[];
  }

  async createCategory(
    data: Prisma.ModifierCategoryCreateInput,
    tx?: PrismaTx,
  ) {
    return this.client(tx).modifierCategory.create({ data });
  }

  async listCategories(
    restaurantId: string | undefined,
    query: ListModifierCategoriesDto,
  ) {
    const where: Prisma.ModifierCategoryWhereInput = {
      ...(restaurantId ? { restaurantId } : {}),
      deletedAt: null,
      ...this.resolveCategoryActiveFilter(query),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { slug: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.modifierCategory.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: this.resolveModifierCategoryOrderBy(query),
      }),
      this.prisma.modifierCategory.count({ where }),
    ]);

    return { items, total };
  }

  findCategoryById(id: string) {
    return this.prisma.modifierCategory.findUnique({ where: { id } });
  }

  findCategoryByRestaurantAndSlug(
    restaurantId: string,
    slug: string,
    excludeId?: string,
  ) {
    return this.prisma.modifierCategory.findFirst({
      where: {
        restaurantId,
        slug: { equals: slug, mode: 'insensitive' },
        deletedAt: null,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });
  }

  updateCategory(
    id: string,
    data: Prisma.ModifierCategoryUpdateInput,
    tx?: PrismaTx,
  ) {
    return this.client(tx).modifierCategory.update({ where: { id }, data });
  }

  hardDeleteCategory(id: string, tx?: PrismaTx) {
    return this.client(tx).modifierCategory.delete({ where: { id } });
  }

  countCategoryModifiers(categoryId: string, tx?: PrismaTx) {
    return this.client(tx).modifier.count({ where: { categoryId } });
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
      ...this.resolveGroupActiveFilter(query),
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.modifierGroup.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: this.resolveModifierGroupOrderBy(query),
        include: this.groupInclude(query.includeInactive),
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
      ...this.resolveModifierActiveFilter(query),
      ...(restaurantId ? { restaurantId } : {}),
      ...(query.modifierGroupId
        ? {
            groupLinks: {
              some: {
                modifierGroupId: query.modifierGroupId,
              },
            },
          }
        : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.modifier.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: this.resolveModifierOrderBy(query),
        include: {
          category: true,
          groupLinks: {
            include: {
              modifierGroup: {
                select: {
                  id: true,
                  restaurantId: true,
                  name: true,
                  description: true,
                  minSelect: true,
                  maxSelect: true,
                  includedSelect: true,
                  isRequired: true,
                  sortOrder: true,
                  isActive: true,
                },
              },
            },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
        },
      }),
      this.prisma.modifier.count({ where }),
    ]);

    return { items, total };
  }

  private resolveGroupActiveFilter(query: ListModifierGroupsDto) {
    if (query.inactive) {
      return { isActive: false };
    }

    if (query.all || query.includeInactive) {
      return {};
    }

    return { isActive: true };
  }

  private resolveCategoryActiveFilter(query: ListModifierCategoriesDto) {
    if (query.inactive) {
      return { isActive: false };
    }

    if (query.all) {
      return {};
    }

    return { isActive: true };
  }

  private resolveModifierActiveFilter(query: ListModifiersDto) {
    if (query.inactive) {
      return { isActive: false };
    }

    if (query.all || query.includeInactive) {
      return {};
    }

    return { isActive: true };
  }

  async findGroupById(id: string) {
    return this.prisma.modifierGroup.findUnique({ where: { id } });
  }

  async findGroupsByIds(ids: string[]) {
    return this.prisma.modifierGroup.findMany({
      where: {
        id: { in: ids },
      },
    });
  }

  async updateGroup(
    id: string,
    data: Prisma.ModifierGroupUpdateInput,
    tx?: PrismaTx,
  ) {
    return this.client(tx).modifierGroup.update({ where: { id }, data });
  }

  deleteGroupItemLinks(modifierGroupId: string, tx?: PrismaTx) {
    return this.client(tx).menuItemModifierGroup.deleteMany({
      where: { modifierGroupId },
    });
  }

  deleteGroupCategoryLinks(modifierGroupId: string, tx?: PrismaTx) {
    return this.client(tx).menuCategoryModifierGroup.deleteMany({
      where: { modifierGroupId },
    });
  }

  deleteGroupModifierLinks(modifierGroupId: string, tx?: PrismaTx) {
    return this.client(tx).modifierGroupModifier.deleteMany({
      where: { modifierGroupId },
    });
  }

  hardDeleteGroup(id: string, tx?: PrismaTx) {
    return this.client(tx).modifierGroup.delete({ where: { id } });
  }

  async createModifier(data: Prisma.ModifierCreateInput, tx?: PrismaTx) {
    return this.client(tx).modifier.create({ data });
  }

  async attachModifierToGroup(
    modifierGroupId: string,
    modifierId: string,
    sortOrder: number,
    tx?: PrismaTx,
  ) {
    return this.client(tx).modifierGroupModifier.upsert({
      where: {
        modifierGroupId_modifierId: {
          modifierGroupId,
          modifierId,
        },
      },
      update: { sortOrder },
      create: {
        modifierGroupId,
        modifierId,
        sortOrder,
      },
    });
  }

  detachModifierFromGroup(
    modifierGroupId: string,
    modifierId: string,
    tx?: PrismaTx,
  ) {
    return this.client(tx).modifierGroupModifier.deleteMany({
      where: {
        modifierGroupId,
        modifierId,
      },
    });
  }

  syncModifierGroups(
    modifierId: string,
    modifierGroupIds: string[],
    sortOrder: number,
    tx?: PrismaTx,
  ) {
    return Promise.all([
      this.client(tx).modifierGroupModifier.deleteMany({
        where: {
          modifierId,
          ...(modifierGroupIds.length
            ? { modifierGroupId: { notIn: modifierGroupIds } }
            : {}),
        },
      }),
      ...modifierGroupIds.map((modifierGroupId) =>
        this.attachModifierToGroup(modifierGroupId, modifierId, sortOrder, tx),
      ),
    ]);
  }

  async findModifierByRestaurantAndName(
    restaurantId: string,
    name: string,
    excludeId?: string,
  ) {
    return this.prisma.modifier.findFirst({
      where: {
        restaurantId,
        name: { equals: name, mode: 'insensitive' },
        deletedAt: null,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });
  }

  async findModifierById(id: string) {
    return this.prisma.modifier.findUnique({
      where: { id },
      include: {
        groupLinks: {
          include: {
            modifierGroup: {
              select: { id: true, restaurantId: true, deletedAt: true },
            },
          },
        },
      },
    });
  }

  async updateModifier(
    id: string,
    data: Prisma.ModifierUpdateInput,
    tx?: PrismaTx,
  ) {
    return this.client(tx).modifier.update({ where: { id }, data });
  }

  hardDeleteModifier(id: string, tx?: PrismaTx) {
    return this.client(tx).modifier.delete({ where: { id } });
  }

  async countModifierGroupLinks(modifierId: string, tx?: PrismaTx) {
    return this.client(tx).modifierGroupModifier.count({
      where: { modifierId },
    });
  }

  async attachGroupToItem(
    menuItemId: string,
    modifierGroupId: string,
    selectionType: ModifierSelectionType,
    minSelect: number,
    maxSelect: number,
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
      update: { selectionType, minSelect, maxSelect, sortOrder },
      create: {
        menuItemId,
        modifierGroupId,
        selectionType,
        minSelect,
        maxSelect,
        sortOrder,
      },
    });
  }

  detachGroupFromItem(
    menuItemId: string,
    modifierGroupId: string,
    tx?: PrismaTx,
  ) {
    return this.client(tx).menuItemModifierGroup.deleteMany({
      where: {
        menuItemId,
        modifierGroupId,
      },
    });
  }

  async attachGroupToCategory(
    categoryId: string,
    modifierGroupId: string,
    selectionType: ModifierSelectionType,
    minSelect: number,
    maxSelect: number,
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
      update: { selectionType, minSelect, maxSelect, sortOrder },
      create: {
        categoryId,
        modifierGroupId,
        selectionType,
        minSelect,
        maxSelect,
        sortOrder,
      },
    });
  }

  async syncGroupCategories(
    modifierGroupId: string,
    categoryIds: string[],
    tx?: PrismaTx,
  ) {
    await this.client(tx).menuCategoryModifierGroup.deleteMany({
      where: { modifierGroupId },
    });

    if (!categoryIds.length) {
      return [];
    }

    await this.client(tx).menuCategoryModifierGroup.createMany({
      data: categoryIds.map((categoryId, index) => ({
        categoryId,
        modifierGroupId,
        sortOrder: index,
      })),
      skipDuplicates: true,
    });

    return this.client(tx).menuCategoryModifierGroup.findMany({
      where: { modifierGroupId },
      orderBy: [{ sortOrder: 'asc' }],
    });
  }

  listCategoryGroups(categoryId: string) {
    return this.prisma.menuCategoryModifierGroup.findMany({
      where: { categoryId },
      orderBy: [{ sortOrder: 'asc' }, { modifierGroup: { sortOrder: 'asc' } }],
      include: {
        modifierGroup: {
          include: this.groupInclude(false),
        },
      },
    });
  }

  listGroupCategories(modifierGroupId: string) {
    return this.prisma.menuCategoryModifierGroup.findMany({
      where: {
        modifierGroupId,
        category: {
          deletedAt: null,
          isActive: true,
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { category: { sortOrder: 'asc' } }],
      include: {
        category: true,
      },
    });
  }

  private groupInclude(includeInactive?: boolean) {
    return {
      categoryLinks: {
        orderBy: [{ sortOrder: 'asc' }, { category: { sortOrder: 'asc' } }],
        include: {
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
      modifierLinks: {
        where: includeInactive
          ? undefined
          : {
              modifier: {
                deletedAt: null,
                isActive: true,
              },
            },
        orderBy: [{ sortOrder: 'asc' }, { modifier: { createdAt: 'asc' } }],
        include: {
          modifier: {
            include: {
              category: true,
              itemPriceOverrides: true,
              variationPriceOverrides: true,
            },
          },
        },
      },
    } satisfies Prisma.ModifierGroupInclude;
  }
}
