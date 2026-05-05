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
  CreateMenuVariationDto,
  ListMenuVariationsDto,
  SyncCategoryVariationsDto,
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
    const restaurantId = await this.resolveRestaurantIdForCreate(user, dto);
    const category = dto.categoryId
      ? await this.prisma.menuCategory.findUnique({
          where: { id: dto.categoryId },
        })
      : null;

    if (dto.categoryId && (!category || category.deletedAt)) {
      throw new NotFoundException('Menu category not found');
    }

    if (category && category.restaurantId !== restaurantId) {
      throw new BadRequestException(
        'Menu variation and category must belong to the same restaurant',
      );
    }

    await this.ensureRestaurantWriteAccess(user, restaurantId);
    await this.assertUniqueVariationName(restaurantId, dto.name);
    await this.assertModifierOverridesBelongToRestaurant(
      restaurantId,
      dto.modifierPriceOverrides,
    );

    return this.prisma.$transaction(async (tx) => {
      if (dto.categoryId && dto.isDefault) {
        await this.variationRepository.resetDefaults(dto.categoryId, tx);
      }

      const data = await this.variationRepository.create(
        {
          restaurant: { connect: { id: restaurantId } },
          category: dto.categoryId
            ? { connect: { id: dto.categoryId } }
            : undefined,
          name: dto.name.trim(),
          description: dto.description,
          sku: dto.sku,
          price: new Prisma.Decimal(dto.price ?? 0),
          sortOrder: dto.sortOrder ?? 0,
          isDefault: dto.isDefault ?? false,
          isActive: dto.isActive ?? true,
          categoryLinks: dto.categoryId
            ? {
                create: {
                  categoryId: dto.categoryId,
                  sortOrder: dto.sortOrder ?? 0,
                  isDefault: dto.isDefault ?? false,
                  isActive: dto.isActive ?? true,
                },
              }
            : undefined,
        },
        tx,
      );

      await this.syncModifierPriceOverrides(
        data.id,
        dto.modifierPriceOverrides,
        tx,
      );

      if (dto.categoryId) {
        await this.seedItemPriceOverridesForVariation(
          data.id,
          dto.categoryId,
          new Prisma.Decimal(dto.price ?? 0),
          tx,
        );
      }

      return {
        data,
        message: 'Menu variation created successfully',
      };
    });
  }

  async list(user: AuthUserContext, query: ListMenuVariationsDto) {
    const restaurantId = query.categoryId
      ? await this.resolveRestaurantIdFromCategory(user, query.categoryId)
      : await this.resolveRestaurantIdForList(user, query.restaurantId);

    const { items, total } = await this.variationRepository.list(
      restaurantId,
      query,
    );
    return {
      data: items,
      message: 'Menu variations fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async syncCategoryVariations(
    user: AuthUserContext,
    categoryId: string,
    dto: SyncCategoryVariationsDto,
  ) {
    const category = await this.prisma.menuCategory.findUnique({
      where: { id: categoryId },
    });
    if (!category || category.deletedAt) {
      throw new NotFoundException('Menu category not found');
    }

    await this.ensureRestaurantWriteAccess(user, category.restaurantId);

    const variationIds = [...new Set(dto.variationIds)];
    const variations = variationIds.length
      ? await this.prisma.menuItemVariation.findMany({
          where: {
            id: { in: variationIds },
            restaurantId: category.restaurantId,
            deletedAt: null,
          },
          select: { id: true, price: true },
        })
      : [];

    if (variations.length !== variationIds.length) {
      throw new BadRequestException(
        'All variations must exist in the category restaurant',
      );
    }

    const data = await this.prisma.$transaction(async (tx) => {
      await tx.menuCategoryVariation.deleteMany({ where: { categoryId } });
      if (variationIds.length) {
        await tx.menuCategoryVariation.createMany({
          data: variationIds.map((variationId, index) => ({
            categoryId,
            variationId,
            sortOrder: index,
            isDefault: index === 0,
            isActive: true,
          })),
          skipDuplicates: true,
        });

        for (const variation of variations) {
          await this.seedItemPriceOverridesForVariation(
            variation.id,
            categoryId,
            variation.price,
            tx,
          );
        }
      }

      return tx.menuCategoryVariation.findMany({
        where: { categoryId },
        include: { variation: true },
        orderBy: [{ sortOrder: 'asc' }],
      });
    });

    return {
      data,
      message: 'Category variations updated successfully',
    };
  }

  async update(user: AuthUserContext, id: string, dto: UpdateMenuVariationDto) {
    const variation = await this.variationRepository.findById(id);
    if (!variation || variation.deletedAt) {
      throw new NotFoundException('Menu variation not found');
    }

    await this.ensureRestaurantWriteAccess(user, variation.restaurantId);
    await this.assertModifierOverridesBelongToRestaurant(
      variation.restaurantId,
      dto.modifierPriceOverrides,
    );

    if (dto.name !== undefined) {
      await this.assertUniqueVariationName(
        variation.restaurantId,
        dto.name,
        id,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const data = await this.variationRepository.update(
        id,
        {
          name: dto.name?.trim(),
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

      if (dto.modifierPriceOverrides !== undefined) {
        await this.syncModifierPriceOverrides(
          id,
          dto.modifierPriceOverrides,
          tx,
        );
      }

      return {
        data,
        message: 'Menu variation updated successfully',
      };
    });
  }

  async remove(user: AuthUserContext, id: string) {
    const variation = await this.variationRepository.findById(id);
    if (!variation || variation.deletedAt) {
      throw new NotFoundException('Menu variation not found');
    }

    await this.ensureRestaurantWriteAccess(user, variation.restaurantId);

    const data = await this.variationRepository.softDelete(id);
    return {
      data,
      message: 'Menu variation deleted successfully',
    };
  }

  private async resolveRestaurantIdForCreate(
    user: AuthUserContext,
    dto: CreateMenuVariationDto,
  ) {
    if (dto.restaurantId) {
      return this.resolveRestaurantId(user, dto.restaurantId);
    }

    if (dto.categoryId) {
      return this.resolveRestaurantIdFromCategory(user, dto.categoryId);
    }

    return this.resolveRestaurantId(user, undefined);
  }

  private async resolveRestaurantIdFromCategory(
    user: AuthUserContext,
    categoryId: string,
  ) {
    const category = await this.prisma.menuCategory.findUnique({
      where: { id: categoryId },
    });
    if (!category || category.deletedAt) {
      throw new NotFoundException('Menu category not found');
    }

    await this.ensureRestaurantReadAccess(user, category.restaurantId);
    return category.restaurantId;
  }

  private async resolveRestaurantId(
    user: AuthUserContext,
    requestedRestaurantId?: string,
  ): Promise<string> {
    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      if (!user.tid) {
        throw new ForbiddenException('Tenant context is required');
      }

      const restaurantId = requestedRestaurantId ?? user.rid;
      if (!restaurantId) {
        throw new BadRequestException('restaurantId is required');
      }

      await this.assertRestaurantInTenant(user.tid, restaurantId);
      return restaurantId;
    }

    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      if (!requestedRestaurantId) {
        throw new BadRequestException('restaurantId is required');
      }

      return requestedRestaurantId;
    }

    throw new ForbiddenException(
      'Insufficient permissions for menu variation write',
    );
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

      return requestedRestaurantId ?? user.rid;
    }

    if (user.rid) {
      if (requestedRestaurantId && requestedRestaurantId !== user.rid) {
        throw new ForbiddenException(
          'You cannot access resources outside your restaurant',
        );
      }
      return user.rid;
    }

    throw new ForbiddenException(
      'Insufficient permissions for menu variations',
    );
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

  private async assertUniqueVariationName(
    restaurantId: string,
    name: string,
    excludeId?: string,
  ) {
    const normalizedName = name.trim();
    if (!normalizedName.length) {
      throw new BadRequestException('name is required');
    }

    const variationClient = this.prisma.menuItemVariation;
    const existing = variationClient?.findFirst
      ? await variationClient.findFirst({
          where: {
            restaurantId,
            name: normalizedName,
            ...(excludeId ? { id: { not: excludeId } } : {}),
          },
          select: { id: true, deletedAt: true },
        })
      : null;

    if (existing && !existing.deletedAt) {
      throw new BadRequestException(
        'A variation with this name already exists in this restaurant',
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
      where: { variationId, menuItemId: null },
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

  private async seedItemPriceOverridesForVariation(
    variationId: string,
    categoryId: string,
    price: Prisma.Decimal,
    tx: Prisma.TransactionClient,
  ) {
    const items = await tx.menuItem.findMany({
      where: {
        categoryId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!items.length) {
      return;
    }

    await tx.menuItemVariationPriceOverride.createMany({
      data: items.map((item) => ({
        menuItemId: item.id,
        variationId,
        price,
      })),
      skipDuplicates: true,
    });
  }
}
