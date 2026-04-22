import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CouponCampaignKind,
  CouponDiscountType,
  CouponStatus,
  Prisma,
} from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { buildPaginationMeta } from '../../common/utils';
import { PrismaService } from '../../database';
import {
  AdminListPromotionsQueryDto,
  AdminPromotionStatsQueryDto,
  AdminPromotionsOverviewQueryDto,
  CreateAdminHappyHourDto,
  CreateAdminPromotionDto,
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
    private readonly prisma: PrismaService,
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

  async createPromotion(user: AuthUserContext, dto: CreateAdminPromotionDto) {
    const scope = await this.resolveScope(user, dto.restaurantId, dto.branchId);
    this.assertValidDateRange(dto.startsAt, dto.expiresAt);

    await this.validateScopeReferences(
      scope.restaurantId,
      dto.scopeMenuItemId,
      dto.scopeCategoryId,
    );

    const data = await this.adminPromotionsRepository.create({
      tenant: { connect: { id: this.requireTenantIdFromScope(scope) } },
      restaurant: { connect: { id: this.requireRestaurantIdFromScope(scope) } },
      branch: scope.branchId ? { connect: { id: scope.branchId } } : undefined,
      code: dto.code.trim().toUpperCase(),
      title: dto.title,
      description: dto.description,
      kind: CouponCampaignKind.PROMOTION,
      status:
        dto.isActive === false ? CouponStatus.SUSPENDED : CouponStatus.ACTIVE,
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
      scopeMenuItem: dto.scopeMenuItemId
        ? { connect: { id: dto.scopeMenuItemId } }
        : undefined,
      scopeCategory: dto.scopeCategoryId
        ? { connect: { id: dto.scopeCategoryId } }
        : undefined,
      isActive: dto.isActive ?? true,
    });

    return {
      data: this.mapPromotion(data),
      message: 'Promotion created successfully',
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
    await this.validateScopeReferences(
      scope.restaurantId,
      dto.scopeMenuItemId ?? existing.scopeMenuItemId ?? undefined,
      dto.scopeCategoryId ?? existing.scopeCategoryId ?? undefined,
    );

    const data = await this.adminPromotionsRepository.update(id, {
      ...(dto.code ? { code: dto.code.trim().toUpperCase() } : {}),
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
      ...(dto.scopeMenuItemId !== undefined
        ? {
            scopeMenuItem: dto.scopeMenuItemId
              ? { connect: { id: dto.scopeMenuItemId } }
              : { disconnect: true },
          }
        : {}),
      ...(dto.scopeCategoryId !== undefined
        ? {
            scopeCategory: dto.scopeCategoryId
              ? { connect: { id: dto.scopeCategoryId } }
              : { disconnect: true },
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
    await this.validateScopeReferences(
      scope.restaurantId,
      dto.scopeMenuItemId,
      dto.scopeCategoryId,
    );

    const data = await this.adminPromotionsRepository.create({
      tenant: { connect: { id: this.requireTenantIdFromScope(scope) } },
      restaurant: { connect: { id: this.requireRestaurantIdFromScope(scope) } },
      branch: scope.branchId ? { connect: { id: scope.branchId } } : undefined,
      code: dto.code.trim().toUpperCase(),
      title: dto.title,
      description: dto.description,
      kind: CouponCampaignKind.HAPPY_HOUR,
      status:
        dto.isActive === false ? CouponStatus.SUSPENDED : CouponStatus.ACTIVE,
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
      scopeMenuItem: dto.scopeMenuItemId
        ? { connect: { id: dto.scopeMenuItemId } }
        : undefined,
      scopeCategory: dto.scopeCategoryId
        ? { connect: { id: dto.scopeCategoryId } }
        : undefined,
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
    await this.validateScopeReferences(
      scope.restaurantId,
      dto.scopeMenuItemId ?? existing.scopeMenuItemId ?? undefined,
      dto.scopeCategoryId ?? existing.scopeCategoryId ?? undefined,
    );

    const data = await this.adminPromotionsRepository.update(id, {
      ...(dto.code ? { code: dto.code.trim().toUpperCase() } : {}),
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
      ...(dto.scopeMenuItemId !== undefined
        ? {
            scopeMenuItem: dto.scopeMenuItemId
              ? { connect: { id: dto.scopeMenuItemId } }
              : { disconnect: true },
          }
        : {}),
      ...(dto.scopeCategoryId !== undefined
        ? {
            scopeCategory: dto.scopeCategoryId
              ? { connect: { id: dto.scopeCategoryId } }
              : { disconnect: true },
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
    menuItemId?: string,
    categoryId?: string,
  ) {
    const scopedRestaurantId = this.requireRestaurantIdFromScope({
      restaurantId,
    });

    if (menuItemId) {
      const item = await this.prisma.menuItem.findFirst({
        where: {
          id: menuItemId,
          restaurantId: scopedRestaurantId,
          deletedAt: null,
          isActive: true,
        },
        select: { id: true },
      });
      if (!item) {
        throw new BadRequestException(
          'scopeMenuItemId not found in restaurant',
        );
      }
    }

    if (categoryId) {
      const category = await this.prisma.menuCategory.findFirst({
        where: {
          id: categoryId,
          restaurantId: scopedRestaurantId,
          deletedAt: null,
          isActive: true,
        },
        select: { id: true },
      });
      if (!category) {
        throw new BadRequestException(
          'scopeCategoryId not found in restaurant',
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
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: coupon.id,
      code: coupon.code,
      title: coupon.title,
      description: coupon.description,
      kind: coupon.kind,
      status: coupon.status,
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
      createdAt: coupon.createdAt,
      updatedAt: coupon.updatedAt,
    };
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
