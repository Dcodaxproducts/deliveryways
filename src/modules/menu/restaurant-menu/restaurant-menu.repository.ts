import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../database';
import { PrismaTx } from '../../../common/types';
import { ListRestaurantMenuItemsDto, ListRestaurantMenusDto } from './dto';

@Injectable()
export class RestaurantMenuRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaTx | PrismaClient {
    return tx ?? this.prisma;
  }

  async create(data: Prisma.RestaurantMenuCreateInput, tx?: PrismaTx) {
    return this.client(tx).restaurantMenu.create({ data });
  }

  async findById(id: string) {
    return this.prisma.restaurantMenu.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: {
            menuItem: {
              include: {
                category: { select: { id: true, name: true } },
                variations: {
                  where: { deletedAt: null, isActive: true },
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
          },
        },
      },
    });
  }

  async list(restaurantId: string | undefined, query: ListRestaurantMenusDto) {
    const where: Prisma.RestaurantMenuWhereInput = {
      ...(restaurantId ? { restaurantId } : {}),
      deletedAt: null,
      ...(query.includeInactive ? {} : { isActive: true }),
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
      this.prisma.restaurantMenu.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [
          { sortOrder: 'asc' },
          { [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc' },
        ],
        include: {
          _count: { select: { items: true } },
          items: {
            where: query.includeInactive
              ? undefined
              : {
                  isActive: true,
                  menuItem: {
                    deletedAt: null,
                    isActive: true,
                  },
                },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            include: {
              menuItem: {
                include: {
                  category: { select: { id: true, name: true } },
                  variations: {
                    where: { deletedAt: null, isActive: true },
                    orderBy: { sortOrder: 'asc' },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.restaurantMenu.count({ where }),
    ]);

    return { items, total };
  }

  async update(
    id: string,
    data: Prisma.RestaurantMenuUpdateInput,
    tx?: PrismaTx,
  ) {
    return this.client(tx).restaurantMenu.update({ where: { id }, data });
  }

  async softDelete(id: string, tx?: PrismaTx) {
    return this.client(tx).restaurantMenu.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  async attachItem(data: Prisma.RestaurantMenuItemCreateInput, tx?: PrismaTx) {
    return this.client(tx).restaurantMenuItem.create({ data });
  }

  async getNextSortOrder(restaurantMenuId: string) {
    const latest = await this.prisma.restaurantMenuItem.findFirst({
      where: { restaurantMenuId },
      orderBy: [{ sortOrder: 'desc' }, { createdAt: 'desc' }],
      select: { sortOrder: true },
    });

    return (latest?.sortOrder ?? -1) + 1;
  }

  async findMenuItemLinkById(id: string) {
    return this.prisma.restaurantMenuItem.findUnique({
      where: { id },
      include: {
        restaurantMenu: true,
        menuItem: true,
      },
    });
  }

  async findMenuItemLink(restaurantMenuId: string, menuItemId: string) {
    return this.prisma.restaurantMenuItem.findUnique({
      where: {
        restaurantMenuId_menuItemId: {
          restaurantMenuId,
          menuItemId,
        },
      },
    });
  }

  async listMenuItems(
    restaurantMenuId: string,
    query: ListRestaurantMenuItemsDto,
  ) {
    const where: Prisma.RestaurantMenuItemWhereInput = {
      restaurantMenuId,
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.search
        ? {
            menuItem: {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { slug: { contains: query.search, mode: 'insensitive' } },
                { sku: { contains: query.search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.restaurantMenuItem.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [
          { sortOrder: 'asc' },
          { [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc' },
        ],
        include: {
          menuItem: {
            include: {
              category: { select: { id: true, name: true } },
              variations: {
                where: { deletedAt: null, isActive: true },
                orderBy: { sortOrder: 'asc' },
              },
            },
          },
        },
      }),
      this.prisma.restaurantMenuItem.count({ where }),
    ]);

    return { items, total };
  }

  async updateMenuItemLink(
    id: string,
    data: Prisma.RestaurantMenuItemUpdateInput,
    tx?: PrismaTx,
  ) {
    return this.client(tx).restaurantMenuItem.update({ where: { id }, data });
  }

  async removeMenuItemLink(id: string, tx?: PrismaTx) {
    return this.client(tx).restaurantMenuItem.delete({ where: { id } });
  }
}
