import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, VariationPricingMode } from '@prisma/client';
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
    await this.assertModifierOverridesBelongToRestaurant(
      category.restaurantId,
      dto.modifierPriceOverrides,
    );

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
          ...this.resolvePricingInput(dto),
          sortOrder: dto.sortOrder ?? 0,
          isDefault: dto.isDefault ?? false,
          isActive: dto.isActive ?? true,
        },
        tx,
      );

      await this.syncModifierPriceOverrides(
        data.id,
        dto.modifierPriceOverrides,
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
    await this.assertModifierOverridesBelongToRestaurant(
      category.restaurantId,
      dto.modifierPriceOverrides,
    );

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
          ...this.resolvePricingInput(dto, variation),
          sortOrder: dto.sortOrder,
          isDefault: dto.isDefault,
          isActive: dto.isActive,
        },
        tx,
      );

      if (dto.modifierPriceOverrides !== undefined) {
        await this.syncModifierPriceOverrides(
          id,
          dto.modifierPriceOverrides,
          tx,
        );
      }

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

  private async assertModifierOverridesBelongToRestaurant(
    restaurantId: string,
    overrides: Array<{ modifierId: string; priceDelta: number }> | undefined,
  ) {
    if (!overrides?.length) {
      return;
    }

    const modifierIds = [...new Set(overrides.map((item) => item.modifierId))];
    const count = await this.prisma.modifier.count({
      where: {
        id: { in: modifierIds },
        deletedAt: null,
        restaurantId,
        groupLinks: {
          some: {
            modifierGroup: {
              restaurantId,
              deletedAt: null,
            },
          },
        },
      },
    });

    if (count !== modifierIds.length) {
      throw new BadRequestException(
        'One or more variation modifier price overrides are invalid for this restaurant',
      );
    }
  }

  private async syncModifierPriceOverrides(
    variationId: string,
    overrides: Array<{ modifierId: string; priceDelta: number }> | undefined,
    tx: Prisma.TransactionClient,
  ) {
    await tx.menuVariationModifierPriceOverride.deleteMany({
      where: { variationId },
    });

    if (!overrides?.length) {
      return;
    }

    await tx.menuVariationModifierPriceOverride.createMany({
      data: overrides.map((item) => ({
        variationId,
        modifierId: item.modifierId,
        priceDelta: new Prisma.Decimal(item.priceDelta),
      })),
    });
  }

  private resolvePricingInput(
    dto: CreateMenuVariationDto | UpdateMenuVariationDto,
    existing?: {
      price?: Prisma.Decimal;
      pricingMode?: VariationPricingMode;
      adjustmentValue?: Prisma.Decimal | null;
    },
  ) {
    const pricingMode =
      (dto.pricingMode as VariationPricingMode | undefined) ??
      existing?.pricingMode ??
      VariationPricingMode.FIXED;

    if (pricingMode === VariationPricingMode.FIXED) {
      const nextPrice = dto.price ?? existing?.price;

      if (nextPrice === undefined) {
        throw new BadRequestException(
          'price is required when variation pricingMode is FIXED',
        );
      }

      return {
        pricingMode,
        price: new Prisma.Decimal(nextPrice),
        adjustmentValue: null,
      };
    }

    const nextAdjustmentValue =
      dto.adjustmentValue ?? existing?.adjustmentValue;

    if (nextAdjustmentValue === undefined || nextAdjustmentValue === null) {
      throw new BadRequestException(
        'adjustmentValue is required for non-fixed variation pricing',
      );
    }

    return {
      pricingMode,
      price:
        dto.price !== undefined
          ? new Prisma.Decimal(dto.price)
          : (existing?.price ?? new Prisma.Decimal(0)),
      adjustmentValue: new Prisma.Decimal(nextAdjustmentValue),
    };
  }
}
