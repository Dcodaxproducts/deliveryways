import {
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
    const category = await this.prisma.menuCategory.findUnique({
      where: { id: dto.categoryId },
    });

    if (!category || category.deletedAt) {
      throw new NotFoundException('Menu category not found');
    }

    await this.ensureRestaurantWriteAccess(user, category.restaurantId);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await this.variationRepository.resetDefaults(dto.categoryId, tx);
      }

      const data = await this.variationRepository.create(
        {
          category: { connect: { id: dto.categoryId } },
          name: dto.name,
          description: dto.description,
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
    const category = await this.prisma.menuCategory.findUnique({
      where: { id: query.categoryId },
    });
    if (!category || category.deletedAt) {
      throw new NotFoundException('Menu category not found');
    }

    await this.ensureRestaurantReadAccess(user, category.restaurantId);

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

    const category = await this.prisma.menuCategory.findUnique({
      where: { id: variation.categoryId },
    });
    if (!category || category.deletedAt) {
      throw new NotFoundException('Menu category not found');
    }

    await this.ensureRestaurantWriteAccess(user, category.restaurantId);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await this.variationRepository.resetDefaults(variation.categoryId, tx);
      }

      const data = await this.variationRepository.update(
        id,
        {
          name: dto.name,
          description: dto.description,
          sku: dto.sku,
          price:
            dto.price !== undefined ? new Prisma.Decimal(dto.price) : undefined,
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

    const category = await this.prisma.menuCategory.findUnique({
      where: { id: variation.categoryId },
    });
    if (!category || category.deletedAt) {
      throw new NotFoundException('Menu category not found');
    }

    await this.ensureRestaurantWriteAccess(user, category.restaurantId);

    const data = await this.variationRepository.softDelete(id);
    return { data, message: 'Menu variation deleted successfully' };
  }

  private async ensureRestaurantWriteAccess(
    user: AuthUserContext,
    restaurantId: string,
  ) {
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

    throw new ForbiddenException(
      'Insufficient permissions for menu variation write',
    );
  }

  private async ensureRestaurantReadAccess(
    user: AuthUserContext,
    restaurantId: string,
  ) {
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
