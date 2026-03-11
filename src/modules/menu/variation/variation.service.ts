import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUserContext } from '../../../common/decorators';
import { UserRoleEnum } from '../../../common/enums';
import { buildPaginationMeta } from '../../../common/utils';
import { PrismaService } from '../../../database';
import {
  CreateMenuVariationDto,
  ListMenuVariationsDto,
  UpdateMenuVariationDto,
} from './dto';
import { MenuVariationRepository } from './variation.repository';

@Injectable()
export class MenuVariationService {
  constructor(
    private readonly variationRepository: MenuVariationRepository,
    private readonly prisma: PrismaService,
  ) {}

  async create(user: AuthUserContext, dto: CreateMenuVariationDto) {
    const item = await this.prisma.menuItem.findUnique({ where: { id: dto.menuItemId } });

    if (!item || item.deletedAt) {
      throw new NotFoundException('Menu item not found');
    }

    this.ensureRestaurantWriteAccess(user, item.restaurantId);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await this.variationRepository.resetDefaults(dto.menuItemId, tx);
      }

      const data = await this.variationRepository.create(
        {
          menuItem: { connect: { id: dto.menuItemId } },
          name: dto.name,
          sku: dto.sku,
          price: new Prisma.Decimal(dto.price),
          sortOrder: dto.sortOrder ?? 0,
          isDefault: dto.isDefault ?? false,
          isActive: dto.isActive ?? true,
        },
        tx,
      );

      return { data, message: 'Menu variation created successfully' };
    });
  }

  async list(user: AuthUserContext, query: ListMenuVariationsDto) {
    const item = await this.prisma.menuItem.findUnique({ where: { id: query.menuItemId } });
    if (!item || item.deletedAt) {
      throw new NotFoundException('Menu item not found');
    }

    this.ensureRestaurantReadAccess(user, item.restaurantId);

    const { items, total } = await this.variationRepository.list(query);
    return {
      data: items,
      message: 'Menu variations fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async update(user: AuthUserContext, id: string, dto: UpdateMenuVariationDto) {
    const variation = await this.variationRepository.findById(id);
    if (!variation || variation.deletedAt) {
      throw new NotFoundException('Menu variation not found');
    }

    const item = await this.prisma.menuItem.findUnique({ where: { id: variation.menuItemId } });
    if (!item || item.deletedAt) {
      throw new NotFoundException('Menu item not found');
    }

    this.ensureRestaurantWriteAccess(user, item.restaurantId);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await this.variationRepository.resetDefaults(variation.menuItemId, tx);
      }

      const data = await this.variationRepository.update(
        id,
        {
          name: dto.name,
          sku: dto.sku,
          price: dto.price !== undefined ? new Prisma.Decimal(dto.price) : undefined,
          sortOrder: dto.sortOrder,
          isDefault: dto.isDefault,
          isActive: dto.isActive,
        },
        tx,
      );

      return { data, message: 'Menu variation updated successfully' };
    });
  }

  async remove(user: AuthUserContext, id: string) {
    const variation = await this.variationRepository.findById(id);
    if (!variation || variation.deletedAt) {
      throw new NotFoundException('Menu variation not found');
    }

    const item = await this.prisma.menuItem.findUnique({ where: { id: variation.menuItemId } });
    if (!item || item.deletedAt) {
      throw new NotFoundException('Menu item not found');
    }

    this.ensureRestaurantWriteAccess(user, item.restaurantId);

    const data = await this.variationRepository.softDelete(id);
    return { data, message: 'Menu variation deleted successfully' };
  }

  private ensureRestaurantWriteAccess(user: AuthUserContext, restaurantId: string) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return;
    }

    if (user.role !== UserRoleEnum.BUSINESS_ADMIN || user.rid !== restaurantId) {
      throw new ForbiddenException('Insufficient permissions for menu variation write');
    }
  }

  private ensureRestaurantReadAccess(user: AuthUserContext, restaurantId: string) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return;
    }

    if (user.rid !== restaurantId) {
      throw new ForbiddenException('Cross-restaurant access denied');
    }
  }
}
