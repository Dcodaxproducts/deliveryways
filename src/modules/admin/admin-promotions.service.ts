import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CouponApplyMode,
  CouponCampaignKind,
  CouponDiscountType,
  CouponStatus,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { buildPaginationMeta } from '../../common/utils';
import {
  AdminListPromotionsQueryDto,
  AdminPromotionStatsQueryDto,
  AdminPromotionsOverviewQueryDto,
  CreateAdminDealDto,
  CreateAdminHappyHourDto,
  CreateAdminPromotionDto,
  UpdateAdminDealDto,
  UpdateAdminHappyHourDto,
  UpdateAdminPromotionDto,
} from './dto';
import {
  AdminPromotionScope,
  AdminPromotionsRepository,
} from './admin-promotions.repository';

@Injectable()
export class AdminPromotionsService {
  constructor(
    private readonly adminPromotionsRepository: AdminPromotionsRepository,
  ) {}

  async getOverview(
    user: AuthUserContext,
    query: AdminPromotionsOverviewQueryDto,
  ) {
    const scope = await this.resolveScope(
      user,
      query.restaurantId,
      query.branchId,
    );
    const data = await this.adminPromotionsRepository.getOverview(scope);

    return {
      data: {
        ...data,
        filters: {
          restaurantId: scope.restaurantId ?? null,
          branchId: scope.branchId ?? null,
        },
      },
      message: 'Promotions overview fetched successfully',
    };
  }

  async list(
    user: AuthUserContext,
    query: AdminListPromotionsQueryDto,
    kind?: CouponCampaignKind,
  ) {
    const scope = await this.resolveScope(
      user,
      query.restaurantId,
      query.branchId,
    );
    const effectiveQuery = kind ? { ...query, kind } : query;
    const { items, total } = await this.adminPromotionsRepository.list(
      scope,
      effectiveQuery,
    );

    return {
      data: items.map((item) => this.mapPromotion(item)),
      message: `${this.kindLabel(kind)} fetched successfully`,
      meta: buildPaginationMeta(query, total),
    };
  }

  async getById(
    user: AuthUserContext,
    id: string,
    query: AdminPromotionStatsQueryDto,
    kind?: CouponCampaignKind,
  ) {
    const scope = await this.resolveScope(
      user,
      query.restaurantId,
      query.branchId,
    );
    const promotion = await this.adminPromotionsRepository.findById(id);
    if (!promotion || promotion.deletedAt) {
      throw new NotFoundException('Promotion not found');
    }

    this.ensureCouponInScope(scope, promotion);
    if (kind && promotion.kind !== kind) {
      throw new NotFoundException('Promotion not found');
    }

    return {
      data: this.mapPromotion(promotion),
      message: 'Promotion fetched successfully',
    };
  }

  async createPromotion(
    user: AuthUserContext,
    dto: CreateAdminPromotionDto,
    codePrefix = 'PROMO',
  ) {
    const scope = await this.resolveScope(user, dto.restaurantId, dto.branchId);
    this.assertValidDateRange(dto.startsAt, dto.expiresAt);
    const scopeIds = this.normalizeScopeIds(dto);

    await this.validateScopeReferences(
      scope.restaurantId,
      scopeIds.menuItemIds,
      scopeIds.categoryIds,
    );
    this.assertValidPromotionPricing(
      dto.discountType as CouponDiscountType,
      (dto.applyMode ?? 'SCOPED_ITEMS') as CouponApplyMode,
      scopeIds,
    );

    const data = await this.adminPromotionsRepository.create({
      tenant: { connect: { id: this.requireTenantIdFromScope(scope) } },
      restaurant: { connect: { id: this.requireRestaurantIdFromScope(scope) } },
      branch: scope.branchId ? { connect: { id: scope.branchId } } : undefined,
      code: this.resolvePromotionCode(dto.code, codePrefix),
      title: dto.title,
      description: dto.description,
      kind: CouponCampaignKind.PROMOTION,
      status:
        dto.isActive === false ? CouponStatus.SUSPENDED : CouponStatus.ACTIVE,
      applyMode: (dto.applyMode ?? 'SCOPED_ITEMS') as CouponApplyMode,
      autoApply: dto.autoApply ?? true,
      discountType: dto.discountType as CouponDiscountType,
      discountValue: new Prisma.Decimal(dto.discountValue),
      maxDiscountAmount:
        dto.maxDiscountAmount !== undefined
          ? new Prisma.Decimal(dto.maxDiscountAmount)
          : undefined,
      minOrderAmount:
        dto.minOrderAmount !== undefined
          ? new Prisma.Decimal(dto.minOrderAmount)
          : undefined,
      maxUses: dto.maxUses,
      maxUsesPerCustomer: dto.maxUsesPerCustomer,
      startsAt: new Date(dto.startsAt),
      expiresAt: new Date(dto.expiresAt),
      scopeMenuItem:
        scopeIds.menuItemIds.length === 1
          ? { connect: { id: scopeIds.menuItemIds[0] } }
          : undefined,
      scopeCategory:
        scopeIds.categoryIds.length === 1
          ? { connect: { id: scopeIds.categoryIds[0] } }
          : undefined,
      ...(scopeIds.menuItemIds.length
        ? {
            scopeMenuItems: {
              create: scopeIds.menuItemIds.map((menuItemId) => ({
                menuItem: { connect: { id: menuItemId } },
              })),
            },
          }
        : {}),
      ...(scopeIds.categoryIds.length
        ? {
            scopeCategories: {
              create: scopeIds.categoryIds.map((menuCategoryId) => ({
                menuCategory: { connect: { id: menuCategoryId } },
              })),
            },
          }
        : {}),
      isActive: dto.isActive ?? true,
    });

    return {
      data: this.mapPromotion(data),
      message: 'Promotion created successfully',
    };
  }

  async listDeals(user: AuthUserContext, query: AdminListPromotionsQueryDto) {
    const result = await this.list(
      user,
      {
        ...query,
        discountType: CouponDiscountType.FIXED_PRICE,
      },
      CouponCampaignKind.PROMOTION,
    );

    return {
      ...result,
      message: 'Deals fetched successfully',
    };
  }

  async getDeal(
    user: AuthUserContext,
    id: string,
    query: AdminPromotionStatsQueryDto,
  ) {
    const result = await this.getById(
      user,
      id,
      query,
      CouponCampaignKind.PROMOTION,
    );

    if (result.data.discountType !== CouponDiscountType.FIXED_PRICE) {
      throw new NotFoundException('Deal not found');
    }

    return {
      ...result,
      message: 'Deal fetched successfully',
    };
  }

  async createDeal(user: AuthUserContext, dto: CreateAdminDealDto) {
    const result = await this.createPromotion(
      user,
      {
        ...dto,
        discountType: CouponDiscountType.FIXED_PRICE,
        applyMode: CouponApplyMode.SCOPED_ITEMS,
        autoApply: true,
      },
      'DEAL',
    );

    return {
      ...result,
      message: 'Deal created successfully',
    };
  }

  async updateDeal(user: AuthUserContext, id: string, dto: UpdateAdminDealDto) {
    await this.getDeal(user, id, {
      restaurantId: dto.restaurantId,
      branchId: dto.branchId,
    });
    const result = await this.updatePromotion(user, id, {
      ...dto,
      discountType: CouponDiscountType.FIXED_PRICE,
      applyMode: CouponApplyMode.SCOPED_ITEMS,
      autoApply: true,
    });

    return {
      ...result,
      message: 'Deal updated successfully',
    };
  }

  async removeDeal(
    user: AuthUserContext,
    id: string,
    query: AdminPromotionStatsQueryDto,
  ) {
    await this.getDeal(user, id, query);
    const result = await this.removePromotion(user, id, query);

    return {
      ...result,
      message: 'Deal deleted successfully',
    };
  }

  async getDealStats(
    user: AuthUserContext,
    id: string,
    query: AdminPromotionStatsQueryDto,
  ) {
    const result = await this.getStats(user, id, query);

    if (result.data.promotion.discountType !== CouponDiscountType.FIXED_PRICE) {
      throw new NotFoundException('Deal not found');
    }

    return {
      ...result,
      message: 'Deal stats fetched successfully',
    };
  }

  async updatePromotion(
    user: AuthUserContext,
    id: string,
    dto: UpdateAdminPromotionDto,
  ) {
    const existing = await this.adminPromotionsRepository.findById(id);
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Promotion not found');
    }

    const requestedRestaurantId = dto.restaurantId ?? existing.restaurantId;
    const requestedBranchId = dto.branchId ?? existing.branchId ?? undefined;
    const scope = await this.resolveScope(
      user,
      requestedRestaurantId,
      requestedBranchId,
    );
    this.ensureCouponInScope(scope, existing);

    this.assertValidDateRange(
      dto.startsAt ?? existing.startsAt.toISOString(),
      dto.expiresAt ?? existing.expiresAt.toISOString(),
    );
    const scopeIds = this.normalizeScopeIds(dto, existing);
    await this.validateScopeReferences(
      scope.restaurantId,
      scopeIds.menuItemIds,
      scopeIds.categoryIds,
    );
    this.assertValidPromotionPricing(
      dto.discountType ?? existing.discountType,
      dto.applyMode ?? existing.applyMode,
      scopeIds,
    );

    const data = await this.adminPromotionsRepository.update(id, {
      ...(dto.code !== undefined
        ? { code: this.resolvePromotionCode(dto.code) }
        : {}),
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description }
        : {}),
      ...(scope.branchId !== existing.branchId
        ? {
            branch: scope.branchId
              ? { connect: { id: scope.branchId } }
              : { disconnect: true },
          }
        : {}),
      ...(dto.discountType
        ? { discountType: dto.discountType as CouponDiscountType }
        : {}),
      ...(dto.applyMode ? { applyMode: dto.applyMode as CouponApplyMode } : {}),
      ...(dto.autoApply !== undefined ? { autoApply: dto.autoApply } : {}),
      ...(dto.discountValue !== undefined
        ? { discountValue: new Prisma.Decimal(dto.discountValue) }
        : {}),
      ...(dto.maxDiscountAmount !== undefined
        ? { maxDiscountAmount: new Prisma.Decimal(dto.maxDiscountAmount) }
        : {}),
      ...(dto.minOrderAmount !== undefined
        ? { minOrderAmount: new Prisma.Decimal(dto.minOrderAmount) }
        : {}),
      ...(dto.maxUses !== undefined ? { maxUses: dto.maxUses } : {}),
      ...(dto.maxUsesPerCustomer !== undefined
        ? { maxUsesPerCustomer: dto.maxUsesPerCustomer }
        : {}),
      ...(dto.startsAt ? { startsAt: new Date(dto.startsAt) } : {}),
      ...(dto.expiresAt ? { expiresAt: new Date(dto.expiresAt) } : {}),
      ...(this.hasScopeInput(dto)
        ? {
            scopeMenuItem:
              scopeIds.menuItemIds.length === 1
                ? { connect: { id: scopeIds.menuItemIds[0] } }
                : { disconnect: true },
            scopeCategory:
              scopeIds.categoryIds.length === 1
                ? { connect: { id: scopeIds.categoryIds[0] } }
                : { disconnect: true },
            scopeMenuItems: {
              deleteMany: {},
              ...(scopeIds.menuItemIds.length
                ? {
                    create: scopeIds.menuItemIds.map((menuItemId) => ({
                      menuItem: { connect: { id: menuItemId } },
                    })),
                  }
                : {}),
            },
            scopeCategories: {
              deleteMany: {},
              ...(scopeIds.categoryIds.length
                ? {
                    create: scopeIds.categoryIds.map((menuCategoryId) => ({
                      menuCategory: { connect: { id: menuCategoryId } },
                    })),
                  }
                : {}),
            },
          }
        : {}),
      ...(dto.isActive !== undefined
        ? {
            isActive: dto.isActive,
            status: dto.isActive ? CouponStatus.ACTIVE : CouponStatus.SUSPENDED,
          }
        : {}),
    });

    return {
      data: this.mapPromotion(data),
      message: 'Promotion updated successfully',
    };
  }

  async removePromotion(
    user: AuthUserContext,
    id: string,
    query: AdminPromotionStatsQueryDto,
  ) {
    const scope = await this.resolveScope(
      user,
      query.restaurantId,
      query.branchId,
    );
    const existing = await this.adminPromotionsRepository.findById(id);
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Promotion not found');
    }

    this.ensureCouponInScope(scope, existing);

    await this.adminPromotionsRepository.update(id, {
      deletedAt: new Date(),
      isActive: false,
      status: CouponStatus.SUSPENDED,
    });

    return {
      data: { id },
      message: 'Promotion deleted successfully',
    };
  }

  async createHappyHour(user: AuthUserContext, dto: CreateAdminHappyHourDto) {
    this.assertValidDailyWindow(dto.dailyStartTime, dto.dailyEndTime);
    const scope = await this.resolveScope(user, dto.restaurantId, dto.branchId);
    this.assertValidDateRange(dto.startsAt, dto.expiresAt);
    const scopeIds = this.normalizeScopeIds(dto);
    await this.validateScopeReferences(
      scope.restaurantId,
      scopeIds.menuItemIds,
      scopeIds.categoryIds,
    );
    this.assertValidPromotionPricing(
      dto.discountType as CouponDiscountType,
      (dto.applyMode ?? 'SCOPED_ITEMS') as CouponApplyMode,
      scopeIds,
    );

    const data = await this.adminPromotionsRepository.create({
      tenant: { connect: { id: this.requireTenantIdFromScope(scope) } },
      restaurant: { connect: { id: this.requireRestaurantIdFromScope(scope) } },
      branch: scope.branchId ? { connect: { id: scope.branchId } } : undefined,
      code: this.resolvePromotionCode(dto.code, 'HAPPY'),
      title: dto.title,
      description: dto.description,
      kind: CouponCampaignKind.HAPPY_HOUR,
      status:
        dto.isActive === false ? CouponStatus.SUSPENDED : CouponStatus.ACTIVE,
      applyMode: (dto.applyMode ?? 'SCOPED_ITEMS') as CouponApplyMode,
      autoApply: dto.autoApply ?? true,
      discountType: dto.discountType as CouponDiscountType,
      discountValue: new Prisma.Decimal(dto.discountValue),
      maxDiscountAmount:
        dto.maxDiscountAmount !== undefined
          ? new Prisma.Decimal(dto.maxDiscountAmount)
          : undefined,
      minOrderAmount:
        dto.minOrderAmount !== undefined
          ? new Prisma.Decimal(dto.minOrderAmount)
          : undefined,
      maxUses: dto.maxUses,
      maxUsesPerCustomer: dto.maxUsesPerCustomer,
      startsAt: new Date(dto.startsAt),
      expiresAt: new Date(dto.expiresAt),
      activeDays: dto.activeDays,
      dailyStartTime: dto.dailyStartTime,
      dailyEndTime: dto.dailyEndTime,
      scopeMenuItem:
        scopeIds.menuItemIds.length === 1
          ? { connect: { id: scopeIds.menuItemIds[0] } }
          : undefined,
      scopeCategory:
        scopeIds.categoryIds.length === 1
          ? { connect: { id: scopeIds.categoryIds[0] } }
          : undefined,
      ...(scopeIds.menuItemIds.length
        ? {
            scopeMenuItems: {
              create: scopeIds.menuItemIds.map((menuItemId) => ({
                menuItem: { connect: { id: menuItemId } },
              })),
            },
          }
        : {}),
      ...(scopeIds.categoryIds.length
        ? {
            scopeCategories: {
              create: scopeIds.categoryIds.map((menuCategoryId) => ({
                menuCategory: { connect: { id: menuCategoryId } },
              })),
            },
          }
        : {}),
      isActive: dto.isActive ?? true,
    });

    return {
      data: this.mapPromotion(data),
      message: 'Happy hour created successfully',
    };
  }

  async updateHappyHour(
    user: AuthUserContext,
    id: string,
    dto: UpdateAdminHappyHourDto,
  ) {
    const existing = await this.adminPromotionsRepository.findById(id);
    if (
      !existing ||
      existing.deletedAt ||
      existing.kind !== CouponCampaignKind.HAPPY_HOUR
    ) {
      throw new NotFoundException('Happy hour not found');
    }

    const requestedRestaurantId = dto.restaurantId ?? existing.restaurantId;
    const requestedBranchId = dto.branchId ?? existing.branchId ?? undefined;
    const scope = await this.resolveScope(
      user,
      requestedRestaurantId,
      requestedBranchId,
    );
    this.ensureCouponInScope(scope, existing);

    this.assertValidDateRange(
      dto.startsAt ?? existing.startsAt.toISOString(),
      dto.expiresAt ?? existing.expiresAt.toISOString(),
    );
    this.assertValidDailyWindow(
      dto.dailyStartTime ?? existing.dailyStartTime ?? '',
      dto.dailyEndTime ?? existing.dailyEndTime ?? '',
    );
    const scopeIds = this.normalizeScopeIds(dto, existing);
    await this.validateScopeReferences(
      scope.restaurantId,
      scopeIds.menuItemIds,
      scopeIds.categoryIds,
    );
    this.assertValidPromotionPricing(
      dto.discountType ?? existing.discountType,
      dto.applyMode ?? existing.applyMode,
      scopeIds,
    );

    const data = await this.adminPromotionsRepository.update(id, {
      ...(dto.code !== undefined
        ? { code: this.resolvePromotionCode(dto.code, 'HAPPY') }
        : {}),
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description }
        : {}),
      ...(scope.branchId !== existing.branchId
        ? {
            branch: scope.branchId
              ? { connect: { id: scope.branchId } }
              : { disconnect: true },
          }
        : {}),
      ...(dto.discountType
        ? { discountType: dto.discountType as CouponDiscountType }
        : {}),
      ...(dto.applyMode ? { applyMode: dto.applyMode as CouponApplyMode } : {}),
      ...(dto.autoApply !== undefined ? { autoApply: dto.autoApply } : {}),
      ...(dto.discountValue !== undefined
        ? { discountValue: new Prisma.Decimal(dto.discountValue) }
        : {}),
      ...(dto.maxDiscountAmount !== undefined
        ? { maxDiscountAmount: new Prisma.Decimal(dto.maxDiscountAmount) }
        : {}),
      ...(dto.minOrderAmount !== undefined
        ? { minOrderAmount: new Prisma.Decimal(dto.minOrderAmount) }
        : {}),
      ...(dto.maxUses !== undefined ? { maxUses: dto.maxUses } : {}),
      ...(dto.maxUsesPerCustomer !== undefined
        ? { maxUsesPerCustomer: dto.maxUsesPerCustomer }
        : {}),
      ...(dto.startsAt ? { startsAt: new Date(dto.startsAt) } : {}),
      ...(dto.expiresAt ? { expiresAt: new Date(dto.expiresAt) } : {}),
      ...(dto.activeDays !== undefined ? { activeDays: dto.activeDays } : {}),
      ...(dto.dailyStartTime !== undefined
        ? { dailyStartTime: dto.dailyStartTime }
        : {}),
      ...(dto.dailyEndTime !== undefined
        ? { dailyEndTime: dto.dailyEndTime }
        : {}),
      ...(this.hasScopeInput(dto)
        ? {
            scopeMenuItem:
              scopeIds.menuItemIds.length === 1
                ? { connect: { id: scopeIds.menuItemIds[0] } }
                : { disconnect: true },
            scopeCategory:
              scopeIds.categoryIds.length === 1
                ? { connect: { id: scopeIds.categoryIds[0] } }
                : { disconnect: true },
            scopeMenuItems: {
              deleteMany: {},
              ...(scopeIds.menuItemIds.length
                ? {
                    create: scopeIds.menuItemIds.map((menuItemId) => ({
                      menuItem: { connect: { id: menuItemId } },
                    })),
                  }
                : {}),
            },
            scopeCategories: {
              deleteMany: {},
              ...(scopeIds.categoryIds.length
                ? {
                    create: scopeIds.categoryIds.map((menuCategoryId) => ({
                      menuCategory: { connect: { id: menuCategoryId } },
                    })),
                  }
                : {}),
            },
          }
        : {}),
      ...(dto.isActive !== undefined
        ? {
            isActive: dto.isActive,
            status: dto.isActive ? CouponStatus.ACTIVE : CouponStatus.SUSPENDED,
          }
        : {}),
    });

    return {
      data: this.mapPromotion(data),
      message: 'Happy hour updated successfully',
    };
  }

  async getStats(
    user: AuthUserContext,
    id: string,
    query: AdminPromotionStatsQueryDto,
  ) {
    const scope = await this.resolveScope(
      user,
      query.restaurantId,
      query.branchId,
    );
    const stats = await this.adminPromotionsRepository.getPromotionStats(
      scope,
      id,
    );
    if (!stats) {
      throw new NotFoundException('Promotion not found');
    }

    return {
      data: {
        promotion: this.mapPromotion(stats.coupon),
        usageCount: stats.usageCount,
        uniqueCustomers: stats.uniqueCustomers,
        orderCount: stats.orderCount,
        totalRevenue: stats.totalRevenue,
        totalDiscount: stats.totalDiscount,
        lastUsedAt: stats.lastUsedAt,
      },
      message: 'Promotion stats fetched successfully',
    };
  }

  private async resolveScope(
    user: AuthUserContext,
    requestedRestaurantId?: string,
    requestedBranchId?: string,
  ): Promise<AdminPromotionScope> {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      if (requestedBranchId) {
        const branch =
          await this.adminPromotionsRepository.findBranchScope(
            requestedBranchId,
          );
        if (!branch) {
          throw new NotFoundException('Branch not found');
        }

        if (
          requestedRestaurantId &&
          requestedRestaurantId !== branch.restaurantId
        ) {
          throw new BadRequestException(
            'branchId does not belong to the provided restaurantId',
          );
        }

        return {
          tenantId: branch.tenantId,
          restaurantId: branch.restaurantId,
          branchId: branch.id,
        };
      }

      if (requestedRestaurantId) {
        const restaurant =
          await this.adminPromotionsRepository.findRestaurantScope(
            requestedRestaurantId,
          );
        if (!restaurant) {
          throw new NotFoundException('Restaurant not found');
        }

        return { tenantId: restaurant.tenantId, restaurantId: restaurant.id };
      }

      return {};
    }

    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    if (user.role === UserRoleEnum.BRANCH_ADMIN) {
      if (!user.rid || !user.bid) {
        throw new ForbiddenException('Branch context is required');
      }

      if (requestedRestaurantId && requestedRestaurantId !== user.rid) {
        throw new ForbiddenException(
          'You cannot access resources outside your restaurant',
        );
      }

      if (requestedBranchId && requestedBranchId !== user.bid) {
        throw new ForbiddenException(
          'You cannot access resources outside your branch',
        );
      }

      return { tenantId: user.tid, restaurantId: user.rid, branchId: user.bid };
    }

    if (requestedBranchId) {
      const branch = await this.adminPromotionsRepository.findBranchScope(
        requestedBranchId,
        user.tid,
        user.rid,
      );
      if (!branch) {
        throw new ForbiddenException(
          'You cannot access resources outside your tenant restaurants',
        );
      }

      if (
        requestedRestaurantId &&
        requestedRestaurantId !== branch.restaurantId
      ) {
        throw new BadRequestException(
          'branchId does not belong to the provided restaurantId',
        );
      }

      return {
        tenantId: user.tid,
        restaurantId: branch.restaurantId,
        branchId: branch.id,
      };
    }

    if (user.rid) {
      if (requestedRestaurantId && requestedRestaurantId !== user.rid) {
        throw new ForbiddenException(
          'You cannot access resources outside your restaurant',
        );
      }

      return { tenantId: user.tid, restaurantId: user.rid };
    }

    if (requestedRestaurantId) {
      const restaurant =
        await this.adminPromotionsRepository.findRestaurantScope(
          requestedRestaurantId,
          user.tid,
        );
      if (!restaurant) {
        throw new ForbiddenException(
          'You cannot access resources outside your tenant restaurants',
        );
      }

      return { tenantId: user.tid, restaurantId: restaurant.id };
    }

    throw new BadRequestException('restaurantId is required');
  }

  private async validateScopeReferences(
    restaurantId: string | undefined,
    menuItemIds: string[],
    categoryIds: string[],
  ) {
    const scopedRestaurantId = this.requireRestaurantIdFromScope({
      restaurantId,
    });

    if (menuItemIds.length) {
      const itemCount =
        await this.adminPromotionsRepository.countActiveMenuItems(
          scopedRestaurantId,
          menuItemIds,
        );
      if (itemCount !== new Set(menuItemIds).size) {
        throw new BadRequestException(
          'One or more scopeMenuItemIds were not found in restaurant',
        );
      }
    }

    if (categoryIds.length) {
      const categoryCount =
        await this.adminPromotionsRepository.countActiveMenuCategories(
          scopedRestaurantId,
          categoryIds,
        );
      if (categoryCount !== new Set(categoryIds).size) {
        throw new BadRequestException(
          'One or more scopeCategoryIds were not found in restaurant',
        );
      }
    }
  }

  private ensureCouponInScope(
    scope: AdminPromotionScope,
    coupon: { tenantId: string; restaurantId: string; branchId: string | null },
  ) {
    if (scope.tenantId && coupon.tenantId !== scope.tenantId) {
      throw new ForbiddenException(
        'You cannot access resources outside your tenant restaurants',
      );
    }
    if (scope.restaurantId && coupon.restaurantId !== scope.restaurantId) {
      throw new ForbiddenException(
        'You cannot access resources outside your restaurant',
      );
    }
    if (scope.branchId && coupon.branchId !== scope.branchId) {
      throw new ForbiddenException(
        'You cannot access resources outside your branch',
      );
    }
  }

  private assertValidPromotionPricing(
    discountType: CouponDiscountType,
    applyMode: CouponApplyMode,
    scopeIds: { menuItemIds: string[]; categoryIds: string[] },
  ) {
    if (discountType !== CouponDiscountType.FIXED_PRICE) {
      return;
    }

    if (applyMode !== CouponApplyMode.SCOPED_ITEMS) {
      throw new BadRequestException(
        'Fixed price promotions must use SCOPED_ITEMS applyMode',
      );
    }

    if (scopeIds.categoryIds.length) {
      throw new BadRequestException(
        'Fixed price promotions cannot use category scope',
      );
    }

    if (scopeIds.menuItemIds.length < 2) {
      throw new BadRequestException(
        'Fixed price promotions require at least two menu items',
      );
    }
  }

  private assertValidDateRange(startsAt: string, expiresAt: string) {
    if (new Date(startsAt) >= new Date(expiresAt)) {
      throw new BadRequestException('expiresAt must be after startsAt');
    }
  }

  private assertValidDailyWindow(start: string, end: string) {
    if (!this.isValidTime(start) || !this.isValidTime(end)) {
      throw new BadRequestException(
        'dailyStartTime and dailyEndTime must be in HH:mm format',
      );
    }
  }

  private isValidTime(value: string) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  }

  private mapPromotion(coupon: {
    id: string;
    code: string;
    title: string;
    description: string | null;
    kind: CouponCampaignKind;
    status: CouponStatus;
    applyMode: CouponApplyMode;
    autoApply: boolean;
    discountType: CouponDiscountType;
    discountValue: Prisma.Decimal;
    maxDiscountAmount: Prisma.Decimal | null;
    minOrderAmount: Prisma.Decimal | null;
    maxUses: number | null;
    maxUsesPerCustomer: number | null;
    usedCount: number;
    startsAt: Date;
    expiresAt: Date;
    activeDays: Prisma.JsonValue | null;
    dailyStartTime: string | null;
    dailyEndTime: string | null;
    isActive: boolean;
    branch?: { id: string; name: string } | null;
    restaurant?: { id: string; name: string } | null;
    scopeMenuItem?: { id: string; name: string } | null;
    scopeCategory?: { id: string; name: string } | null;
    scopeMenuItems?: Array<{ menuItem: { id: string; name: string } }>;
    scopeCategories?: Array<{ menuCategory: { id: string; name: string } }>;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: coupon.id,
      code: coupon.autoApply ? null : coupon.code,
      title: coupon.title,
      description: coupon.description,
      kind: coupon.kind,
      status: coupon.status,
      applyMode: coupon.applyMode,
      autoApply: coupon.autoApply,
      discountType: coupon.discountType,
      discountValue: Number(coupon.discountValue),
      maxDiscountAmount: coupon.maxDiscountAmount
        ? Number(coupon.maxDiscountAmount)
        : null,
      minOrderAmount: coupon.minOrderAmount
        ? Number(coupon.minOrderAmount)
        : null,
      maxUses: coupon.maxUses,
      maxUsesPerCustomer: coupon.maxUsesPerCustomer,
      usedCount: coupon.usedCount,
      startsAt: coupon.startsAt,
      expiresAt: coupon.expiresAt,
      activeDays: coupon.activeDays,
      dailyStartTime: coupon.dailyStartTime,
      dailyEndTime: coupon.dailyEndTime,
      isActive: coupon.isActive,
      branch: coupon.branch ?? null,
      restaurant: coupon.restaurant ?? null,
      scopeMenuItem: coupon.scopeMenuItem ?? null,
      scopeCategory: coupon.scopeCategory ?? null,
      scopeMenuItems: this.mergeScopedEntities(
        coupon.scopeMenuItem,
        coupon.scopeMenuItems?.map((entry) => entry.menuItem) ?? [],
      ),
      scopeCategories: this.mergeScopedEntities(
        coupon.scopeCategory,
        coupon.scopeCategories?.map((entry) => entry.menuCategory) ?? [],
      ),
      createdAt: coupon.createdAt,
      updatedAt: coupon.updatedAt,
    };
  }

  private mergeScopedEntities<T extends { id: string }>(
    single: T | null | undefined,
    list: T[],
  ) {
    const items = [...(single ? [single] : []), ...list];
    return items.filter(
      (item, index, all) =>
        all.findIndex((entry) => entry.id === item.id) === index,
    );
  }

  private normalizeScopeIds(
    dto: {
      scopeMenuItemId?: string;
      scopeCategoryId?: string;
      scopeMenuItemIds?: string[];
      scopeCategoryIds?: string[];
    },
    existing?: {
      scopeMenuItemId?: string | null;
      scopeCategoryId?: string | null;
      scopeMenuItems?: Array<{ menuItem: { id: string } }>;
      scopeCategories?: Array<{ menuCategory: { id: string } }>;
    },
  ) {
    const hasMenuItemArray = dto.scopeMenuItemIds !== undefined;
    const hasCategoryArray = dto.scopeCategoryIds !== undefined;
    const hasLegacyMenuItem = dto.scopeMenuItemId !== undefined;
    const hasLegacyCategory = dto.scopeCategoryId !== undefined;

    const menuItemIds =
      hasMenuItemArray || hasLegacyMenuItem
        ? [
            ...(dto.scopeMenuItemId ? [dto.scopeMenuItemId] : []),
            ...(dto.scopeMenuItemIds ?? []).filter(Boolean),
          ]
        : [
            ...(existing?.scopeMenuItemId ? [existing.scopeMenuItemId] : []),
            ...(existing?.scopeMenuItems ?? []).map(
              (entry) => entry.menuItem.id,
            ),
          ];

    const categoryIds =
      hasCategoryArray || hasLegacyCategory
        ? [
            ...(dto.scopeCategoryId ? [dto.scopeCategoryId] : []),
            ...(dto.scopeCategoryIds ?? []).filter(Boolean),
          ]
        : [
            ...(existing?.scopeCategoryId ? [existing.scopeCategoryId] : []),
            ...(existing?.scopeCategories ?? []).map(
              (entry) => entry.menuCategory.id,
            ),
          ];

    return {
      menuItemIds: [...new Set(menuItemIds)],
      categoryIds: [...new Set(categoryIds)],
    };
  }

  private hasScopeInput(dto: {
    scopeMenuItemId?: string;
    scopeCategoryId?: string;
    scopeMenuItemIds?: string[];
    scopeCategoryIds?: string[];
  }) {
    return (
      dto.scopeMenuItemId !== undefined ||
      dto.scopeCategoryId !== undefined ||
      dto.scopeMenuItemIds !== undefined ||
      dto.scopeCategoryIds !== undefined
    );
  }

  private resolvePromotionCode(code: string | undefined, prefix = 'PROMO') {
    const trimmed = code?.trim();
    if (trimmed) {
      return trimmed.toUpperCase();
    }

    return `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private kindLabel(kind?: CouponCampaignKind) {
    if (kind === CouponCampaignKind.HAPPY_HOUR) {
      return 'Happy hours';
    }
    if (kind === CouponCampaignKind.PROMOTION) {
      return 'Promotions';
    }
    return 'Promotions';
  }

  private requireTenantIdFromScope(scope: AdminPromotionScope) {
    if (!scope.tenantId) {
      throw new BadRequestException('tenantId is required');
    }

    return scope.tenantId;
  }

  private requireRestaurantIdFromScope(
    scope: Pick<AdminPromotionScope, 'restaurantId'>,
  ) {
    if (!scope.restaurantId) {
      throw new BadRequestException('restaurantId is required');
    }

    return scope.restaurantId;
  }
}
