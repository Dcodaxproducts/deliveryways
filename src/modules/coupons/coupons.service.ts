import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Coupon,
  CouponApplyMode,
  CouponDiscountType,
  CouponStatus,
  Prisma,
} from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { buildPaginationMeta } from '../../common/utils';
import { PrismaService } from '../../database';
import {
  CreateCouponDto,
  ListCouponsDto,
  SetCouponStatusDto,
  UpdateCouponDto,
  ValidateCouponDto,
} from './dto';
import { CouponsRepository } from './coupons.repository';

export interface CouponValidationLineInput {
  menuItemId: string;
  categoryId: string;
  categoryIds?: string[];
  lineTotal: number;
}

export interface CouponValidationInput {
  restaurantId: string;
  branchId: string;
  customerId: string;
  code: string;
  subtotal: number;
  menuItemIds: string[];
  categoryIds: string[];
  lineItems?: CouponValidationLineInput[];
}

export interface CouponValidationResult {
  coupon: Coupon;
  discountAmount: Prisma.Decimal;
  eligibleSubtotal: Prisma.Decimal;
}

export interface PromotionPreview {
  promotionId: string;
  title: string;
  description: string | null;
  applyMode: CouponApplyMode;
  discountType: CouponDiscountType;
  discountValue: number;
  maxDiscountAmount: number | null;
  discountAmount: number;
  discountedAmount: number;
}

@Injectable()
export class CouponsService {
  constructor(
    private readonly couponsRepository: CouponsRepository,
    private readonly prisma: PrismaService,
  ) {}

  async create(user: AuthUserContext, dto: CreateCouponDto) {
    const restaurantId = await this.requireRestaurantId(user, dto.restaurantId);

    await this.validateScopeReferences(
      restaurantId,
      dto.scopeMenuItemId,
      dto.scopeCategoryId,
    );

    const data = await this.couponsRepository.create({
      tenant: { connect: { id: this.requireTenantId(user) } },
      restaurant: { connect: { id: restaurantId } },
      branch: dto.branchId ? { connect: { id: dto.branchId } } : undefined,
      code: dto.code.trim().toUpperCase(),
      title: dto.title,
      description: dto.description,
      discountType: dto.discountType,
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
    });

    return {
      data,
      message: 'Coupon created successfully',
    };
  }

  async list(user: AuthUserContext, query: ListCouponsDto) {
    const restaurantId = await this.resolveRestaurantId(
      user,
      query.restaurantId,
    );
    const { items, total } = await this.couponsRepository.list(
      restaurantId,
      query,
    );

    return {
      data: items,
      message: 'Coupons fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async update(user: AuthUserContext, id: string, dto: UpdateCouponDto) {
    const coupon = await this.couponsRepository.findById(id);
    if (!coupon || coupon.deletedAt) {
      throw new NotFoundException('Coupon not found');
    }

    await this.ensureRestaurantAccess(user, coupon.restaurantId);

    await this.validateScopeReferences(
      coupon.restaurantId,
      dto.scopeMenuItemId,
      dto.scopeCategoryId,
    );

    const data = await this.couponsRepository.update(id, {
      title: dto.title,
      description: dto.description,
      branch: dto.branchId ? { connect: { id: dto.branchId } } : undefined,
      discountType: dto.discountType,
      discountValue:
        dto.discountValue !== undefined
          ? new Prisma.Decimal(dto.discountValue)
          : undefined,
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
      startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      status: dto.status,
      isActive: dto.isActive,
      scopeMenuItem: dto.scopeMenuItemId
        ? { connect: { id: dto.scopeMenuItemId } }
        : undefined,
      scopeCategory: dto.scopeCategoryId
        ? { connect: { id: dto.scopeCategoryId } }
        : undefined,
    });

    return {
      data,
      message: 'Coupon updated successfully',
    };
  }

  async setStatus(
    user: AuthUserContext,
    code: string,
    dto: SetCouponStatusDto,
  ) {
    const restaurantId = await this.requireRestaurantId(user);
    const coupon = await this.couponsRepository.findByCode(
      restaurantId,
      code.trim().toUpperCase(),
    );

    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }

    const data = await this.couponsRepository.update(coupon.id, {
      status: dto.status,
      isActive: dto.status === CouponStatus.ACTIVE,
    });

    return {
      data,
      message: `Coupon ${dto.status === CouponStatus.ACTIVE ? 'activated' : 'suspended'} successfully`,
    };
  }

  async validate(user: AuthUserContext, dto: ValidateCouponDto) {
    const restaurantId = await this.requireRestaurantId(user);
    const customerId =
      user.role === UserRoleEnum.CUSTOMER
        ? user.uid
        : (dto.customerId ?? user.uid);

    const result = await this.validateForCheckout({
      restaurantId,
      branchId: dto.branchId,
      customerId,
      code: dto.code,
      subtotal: dto.subtotal,
      menuItemIds: dto.menuItemIds ?? [],
      categoryIds: dto.categoryIds ?? [],
    });

    return {
      data: {
        couponId: result.coupon.id,
        code: result.coupon.code,
        discountAmount: Number(result.discountAmount),
        eligibleSubtotal: Number(result.eligibleSubtotal),
      },
      message: 'Coupon is valid',
    };
  }

  async validateForCheckout(
    input: CouponValidationInput,
  ): Promise<CouponValidationResult> {
    const coupon = await this.couponsRepository.findByCode(
      input.restaurantId,
      input.code.trim().toUpperCase(),
    );

    if (!coupon) {
      throw new BadRequestException('Coupon not found');
    }

    return this.validateResolvedCoupon(coupon, input);
  }

  async getActiveAutoApplyPromotions(restaurantId: string, branchId?: string) {
    return this.couponsRepository.findAutoApplyPromotions(
      restaurantId,
      branchId,
    );
  }

  async findBestAutoApplyPromotion(
    input: Omit<CouponValidationInput, 'code'>,
  ): Promise<CouponValidationResult | null> {
    const promotions = await this.getActiveAutoApplyPromotions(
      input.restaurantId,
      input.branchId,
    );

    let best: CouponValidationResult | null = null;

    for (const promotion of promotions) {
      try {
        const result = await this.validateResolvedCoupon(promotion, {
          ...input,
          code: promotion.code,
        });

        if (
          !best ||
          result.discountAmount.greaterThan(best.discountAmount) ||
          (result.discountAmount.equals(best.discountAmount) &&
            result.eligibleSubtotal.greaterThan(best.eligibleSubtotal))
        ) {
          best = result;
        }
      } catch {
        continue;
      }
    }

    return best;
  }

  buildPromotionPreview(
    validation: CouponValidationResult,
    baseAmount: Prisma.Decimal | number,
  ): PromotionPreview {
    const base =
      baseAmount instanceof Prisma.Decimal
        ? baseAmount
        : new Prisma.Decimal(baseAmount);
    const discountedAmount = Prisma.Decimal.max(
      base.minus(validation.discountAmount),
      new Prisma.Decimal(0),
    );

    return {
      promotionId: validation.coupon.id,
      title: validation.coupon.title,
      description: validation.coupon.description,
      applyMode: validation.coupon.applyMode,
      discountType: validation.coupon.discountType,
      discountValue: Number(validation.coupon.discountValue),
      maxDiscountAmount: validation.coupon.maxDiscountAmount
        ? Number(validation.coupon.maxDiscountAmount)
        : null,
      discountAmount: Number(validation.discountAmount),
      discountedAmount: Number(discountedAmount.toDecimalPlaces(2)),
    };
  }

  async registerUsage(
    couponId: string,
    customerId: string,
    orderId: string,
    tx: Prisma.TransactionClient,
  ) {
    await this.couponsRepository.incrementUsage(
      couponId,
      customerId,
      orderId,
      tx,
    );
  }

  private async validateResolvedCoupon(
    coupon: Coupon & {
      scopeMenuItems?: Array<{ menuItem: { id: string } }>;
      scopeCategories?: Array<{ menuCategory: { id: string } }>;
    },
    input: CouponValidationInput,
  ): Promise<CouponValidationResult> {
    const now = new Date();
    if (
      !coupon.isActive ||
      coupon.status !== CouponStatus.ACTIVE ||
      coupon.deletedAt
    ) {
      throw new BadRequestException('Coupon is not active');
    }

    if (coupon.startsAt > now || coupon.expiresAt < now) {
      throw new BadRequestException('Coupon is not valid at this time');
    }

    if (!this.isCouponScheduleActive(coupon, now)) {
      throw new BadRequestException('Coupon is not valid at this time');
    }

    if (coupon.branchId && coupon.branchId !== input.branchId) {
      throw new BadRequestException('Coupon is not valid for this branch');
    }

    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      throw new BadRequestException('Coupon usage limit reached');
    }

    if (coupon.maxUsesPerCustomer !== null) {
      const customerUsage = await this.couponsRepository.countCustomerUsage(
        coupon.id,
        input.customerId,
      );
      if (customerUsage >= coupon.maxUsesPerCustomer) {
        throw new BadRequestException('Coupon per-customer limit reached');
      }
    }

    const subtotalDecimal = new Prisma.Decimal(input.subtotal);
    if (
      coupon.minOrderAmount &&
      subtotalDecimal.lessThan(coupon.minOrderAmount)
    ) {
      throw new BadRequestException(
        'Order subtotal does not meet coupon minimum amount',
      );
    }

    const eligibleSubtotal = this.resolveEligibleSubtotal(coupon, input);

    if (eligibleSubtotal.lessThanOrEqualTo(new Prisma.Decimal(0))) {
      throw new BadRequestException(
        'Coupon eligible subtotal must be greater than zero',
      );
    }

    let discountAmount = new Prisma.Decimal(0);

    if (coupon.discountType === CouponDiscountType.FIXED_PRICE) {
      this.assertFixedPricePromotionEligible(coupon, input);
      discountAmount = Prisma.Decimal.max(
        eligibleSubtotal.minus(coupon.discountValue),
        new Prisma.Decimal(0),
      );
    } else if (coupon.discountType === CouponDiscountType.FLAT) {
      discountAmount = Prisma.Decimal.min(
        coupon.discountValue,
        eligibleSubtotal,
      );
    } else {
      discountAmount = eligibleSubtotal
        .mul(coupon.discountValue)
        .div(new Prisma.Decimal(100));
      if (coupon.maxDiscountAmount) {
        discountAmount = Prisma.Decimal.min(
          discountAmount,
          coupon.maxDiscountAmount,
        );
      }
      discountAmount = Prisma.Decimal.min(discountAmount, eligibleSubtotal);
    }

    discountAmount = new Prisma.Decimal(discountAmount.toDecimalPlaces(2));

    return {
      coupon,
      discountAmount,
      eligibleSubtotal,
    };
  }

  private assertFixedPricePromotionEligible(
    coupon: Coupon & {
      scopeMenuItems?: Array<{ menuItem: { id: string } }>;
      scopeCategories?: Array<{ menuCategory: { id: string } }>;
    },
    input: CouponValidationInput,
  ) {
    if (coupon.applyMode !== CouponApplyMode.SCOPED_ITEMS) {
      throw new BadRequestException(
        'Fixed price promotions must be scoped to menu items',
      );
    }

    const scopedMenuItemIds = this.resolveScopedIds(
      coupon.scopeMenuItemId,
      coupon.scopeMenuItems?.map((entry) => entry.menuItem.id) ?? [],
    );
    const scopedCategoryIds = this.resolveScopedIds(
      coupon.scopeCategoryId,
      coupon.scopeCategories?.map((entry) => entry.menuCategory.id) ?? [],
    );

    if (scopedCategoryIds.length || scopedMenuItemIds.length < 2) {
      throw new BadRequestException(
        'Fixed price promotions require at least two scoped menu items',
      );
    }

    const selectedMenuItemIds = new Set(input.menuItemIds);
    const missingMenuItem = scopedMenuItemIds.find(
      (menuItemId) => !selectedMenuItemIds.has(menuItemId),
    );

    if (missingMenuItem) {
      throw new BadRequestException(
        'Fixed price promotion requires all scoped menu items',
      );
    }
  }

  private resolveEligibleSubtotal(
    coupon: Coupon & {
      scopeMenuItems?: Array<{ menuItem: { id: string } }>;
      scopeCategories?: Array<{ menuCategory: { id: string } }>;
    },
    input: CouponValidationInput,
  ) {
    const subtotalDecimal = new Prisma.Decimal(input.subtotal);
    if (coupon.applyMode === CouponApplyMode.ORDER_TOTAL) {
      return subtotalDecimal;
    }

    const scopedMenuItemIds = this.resolveScopedIds(
      coupon.scopeMenuItemId,
      coupon.scopeMenuItems?.map((entry) => entry.menuItem.id) ?? [],
    );
    const scopedCategoryIds = this.resolveScopedIds(
      coupon.scopeCategoryId,
      coupon.scopeCategories?.map((entry) => entry.menuCategory.id) ?? [],
    );

    if (!scopedMenuItemIds.length && !scopedCategoryIds.length) {
      return subtotalDecimal;
    }

    if (input.lineItems?.length) {
      return input.lineItems.reduce((sum, line) => {
        const matches =
          scopedMenuItemIds.includes(line.menuItemId) ||
          (line.categoryIds ?? [line.categoryId]).some((categoryId) =>
            scopedCategoryIds.includes(categoryId),
          );
        return matches ? sum.plus(new Prisma.Decimal(line.lineTotal)) : sum;
      }, new Prisma.Decimal(0));
    }

    const hasScopedMenuItemMatch = scopedMenuItemIds.some((id) =>
      input.menuItemIds.includes(id),
    );
    const hasScopedCategoryMatch = scopedCategoryIds.some((id) =>
      input.categoryIds.includes(id),
    );

    if (hasScopedMenuItemMatch || hasScopedCategoryMatch) {
      return subtotalDecimal;
    }

    if (scopedMenuItemIds.length) {
      throw new BadRequestException(
        'Coupon is not applicable to selected items',
      );
    }

    throw new BadRequestException(
      'Coupon is not applicable to selected categories',
    );
  }

  private resolveScopedIds(primary: string | null, extras: string[]) {
    return [...new Set([...(primary ? [primary] : []), ...extras])];
  }

  private async resolveRestaurantId(
    user: AuthUserContext,
    requestedRestaurantId?: string,
  ): Promise<string | undefined> {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return requestedRestaurantId;
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      const tenantId = this.requireTenantId(user);

      if (requestedRestaurantId) {
        await this.assertRestaurantInTenant(tenantId, requestedRestaurantId);
        return requestedRestaurantId;
      }

      if (user.rid) {
        await this.assertRestaurantInTenant(tenantId, user.rid);
        return user.rid;
      }

      return this.resolveSingleTenantRestaurantId(tenantId);
    }

    if (!user.rid) {
      throw new ForbiddenException('Restaurant context is required');
    }

    if (requestedRestaurantId && requestedRestaurantId !== user.rid) {
      throw new ForbiddenException(
        'You cannot access resources outside your restaurant',
      );
    }

    return user.rid;
  }

  private async requireRestaurantId(
    user: AuthUserContext,
    requestedRestaurantId?: string,
  ): Promise<string> {
    const restaurantId = await this.resolveRestaurantId(
      user,
      requestedRestaurantId,
    );

    if (!restaurantId) {
      throw new BadRequestException('restaurantId is required');
    }

    return restaurantId;
  }

  private async ensureRestaurantAccess(
    user: AuthUserContext,
    restaurantId: string,
  ) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return;
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      await this.assertRestaurantInTenant(
        this.requireTenantId(user),
        restaurantId,
      );
      return;
    }

    if (user.rid !== restaurantId) {
      throw new ForbiddenException(
        'You cannot access resources outside your restaurant',
      );
    }
  }

  private async resolveSingleTenantRestaurantId(tenantId: string) {
    const restaurants = await this.prisma.restaurant.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true },
      take: 2,
    });

    return restaurants.length === 1 ? restaurants[0].id : undefined;
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

  private requireTenantId(user: AuthUserContext): string {
    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    return user.tid;
  }

  private async validateScopeReferences(
    restaurantId: string,
    menuItemId?: string,
    categoryId?: string,
  ): Promise<void> {
    if (menuItemId) {
      const item = await this.prisma.menuItem.findFirst({
        where: {
          id: menuItemId,
          restaurantId,
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
          restaurantId,
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

  private isCouponScheduleActive(
    coupon: Pick<Coupon, 'activeDays' | 'dailyStartTime' | 'dailyEndTime'>,
    now: Date,
  ) {
    const activeDays = this.readActiveDays(coupon.activeDays);
    if (activeDays && !activeDays.includes(now.getUTCDay())) {
      return false;
    }

    if (!coupon.dailyStartTime || !coupon.dailyEndTime) {
      return true;
    }

    const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const startMinutes = this.parseTimeToMinutes(coupon.dailyStartTime);
    const endMinutes = this.parseTimeToMinutes(coupon.dailyEndTime);

    if (startMinutes === null || endMinutes === null) {
      return true;
    }

    if (startMinutes <= endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    }

    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }

  private readActiveDays(value: Prisma.JsonValue | null): number[] | null {
    if (!Array.isArray(value) || !value.length) {
      return null;
    }

    return value
      .map((entry) => Number(entry))
      .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 6);
  }

  private parseTimeToMinutes(value: string): number | null {
    const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
    if (!match) {
      return null;
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) {
      return null;
    }

    return hours * 60 + minutes;
  }
}
