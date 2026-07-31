import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  Coupon,
  CouponApplyMode,
  CouponAudience,
  CouponCampaignKind,
  CouponDealSelectionMode,
  CouponDiscountType,
  CouponStatus,
  Prisma,
} from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { buildPaginationMeta } from '../../common/utils';
import {
  CreateCouponDto,
  ListCouponsDto,
  SetCouponStatusDto,
  UpdateCouponDto,
  ValidateCouponDto,
} from './dto';
import { CouponsRepository } from './coupons.repository';
import { GlobalSettingsService } from '../global-settings/global-settings.service';

export interface CouponValidationLineInput {
  menuItemId: string;
  categoryId: string;
  categoryIds?: string[];
  dealId?: string;
  quantity?: number;
  unitPrice?: number;
  lineTotal: number;
}

export interface CouponValidationInput {
  restaurantId: string;
  branchId: string;
  customerId: string;
  customerIsGuest?: boolean;
  code: string;
  subtotal: number;
  menuItemIds: string[];
  categoryIds: string[];
  lineItems?: CouponValidationLineInput[];
  ignoreMinOrderAmount?: boolean;
  isScheduledOrder?: boolean;
}

export interface CouponValidationResult {
  coupon: Coupon & {
    scopeMenuItems?: Array<{ menuItem: { id: string } }>;
    scopeCategories?: Array<{ menuCategory: { id: string } }>;
  };
  discountAmount: Prisma.Decimal;
  eligibleSubtotal: Prisma.Decimal;
}

export interface PromotionPreview {
  promotionId: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  applyMode: CouponApplyMode;
  discountType: CouponDiscountType;
  discountValue: number;
  maxDiscountAmount: number | null;
  discountAmount: number;
  discountedAmount: number;
}

export interface FixedPriceDealPricing {
  dealId: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  code: string;
  fixedPrice: Prisma.Decimal;
  menuItemIds: string[];
  selectionMode: CouponDealSelectionMode;
  requiredQuantity: number | null;
  categoryScopes: Array<{
    menuCategoryId: string;
    itemLimit: number | null;
    forcedVariationId: string | null;
    menuItemIds: string[];
    excludedMenuItemIds: string[];
  }>;
}

export interface FixedPriceDealItemOptions {
  dealId: string;
  forcedVariationId: string | null;
}

@Injectable()
export class CouponsService {
  constructor(
    private readonly couponsRepository: CouponsRepository,
    @Optional()
    private readonly globalSettingsService?: GlobalSettingsService,
  ) {}

  async create(user: AuthUserContext, dto: CreateCouponDto) {
    const restaurantId = await this.requireRestaurantId(
      user,
      dto.restaurantId,
      dto.branchId,
    );

    await this.validateScopeReferences(
      restaurantId,
      dto.scopeMenuItemId,
      dto.scopeCategoryId,
    );
    await this.validateScopeReferenceLists(
      restaurantId,
      dto.scopeMenuItemIds,
      dto.scopeCategoryIds,
    );

    const data = await this.couponsRepository.create({
      tenant: { connect: { id: this.requireTenantId(user) } },
      restaurant: { connect: { id: restaurantId } },
      branch: dto.branchId ? { connect: { id: dto.branchId } } : undefined,
      code: dto.code.trim().toUpperCase(),
      title: dto.title,
      description: dto.description,
      audience: dto.audience ?? CouponAudience.BOTH,
      applyMode:
        dto.applyMode ??
        (dto.scopeMenuItemIds?.length || dto.scopeCategoryIds?.length
          ? CouponApplyMode.SCOPED_ITEMS
          : CouponApplyMode.ORDER_TOTAL),
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
      scopeMenuItems: dto.scopeMenuItemIds?.length
        ? {
            create: [...new Set(dto.scopeMenuItemIds)].map((menuItemId) => ({
              menuItemId,
            })),
          }
        : undefined,
      scopeCategories: dto.scopeCategoryIds?.length
        ? {
            create: [...new Set(dto.scopeCategoryIds)].map(
              (menuCategoryId) => ({ menuCategoryId }),
            ),
          }
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

    const requestedRestaurantId = dto.restaurantId ?? dto.restaurant_id;
    if (
      requestedRestaurantId &&
      requestedRestaurantId !== coupon.restaurantId
    ) {
      throw new BadRequestException(
        'coupon does not belong to the provided restaurantId',
      );
    }

    await this.ensureRestaurantAccess(user, coupon.restaurantId);

    await this.validateScopeReferences(
      coupon.restaurantId,
      dto.scopeMenuItemId,
      dto.scopeCategoryId,
    );
    await this.validateScopeReferenceLists(
      coupon.restaurantId,
      dto.scopeMenuItemIds,
      dto.scopeCategoryIds,
    );

    const data = await this.couponsRepository.update(id, {
      title: dto.title,
      description: dto.description,
      audience: dto.audience,
      applyMode: dto.applyMode,
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
      scopeMenuItems:
        dto.scopeMenuItemIds !== undefined
          ? {
              deleteMany: {},
              create: [...new Set(dto.scopeMenuItemIds)].map((menuItemId) => ({
                menuItemId,
              })),
            }
          : undefined,
      scopeCategories:
        dto.scopeCategoryIds !== undefined
          ? {
              deleteMany: {},
              create: [...new Set(dto.scopeCategoryIds)].map(
                (menuCategoryId) => ({ menuCategoryId }),
              ),
            }
          : undefined,
    });

    return {
      data,
      message: 'Coupon updated successfully',
    };
  }

  async remove(user: AuthUserContext, id: string) {
    const coupon = await this.couponsRepository.findById(id);
    if (!coupon || coupon.deletedAt) {
      throw new NotFoundException('Coupon not found');
    }

    await this.ensureRestaurantAccess(user, coupon.restaurantId);
    await this.couponsRepository.update(id, {
      deletedAt: new Date(),
      isActive: false,
      status: CouponStatus.SUSPENDED,
    });

    return {
      data: { id },
      message: 'Coupon deleted successfully',
    };
  }

  async setStatus(
    user: AuthUserContext,
    code: string,
    dto: SetCouponStatusDto,
  ) {
    const restaurantId = await this.requireRestaurantId(
      user,
      dto.restaurantId ?? dto.restaurant_id,
    );
    const coupon = await this.couponsRepository.findByCodeOrId(
      restaurantId,
      code,
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
      customerIsGuest: user.isGuest === true,
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

  async getActiveAutoApplyPromotions(
    restaurantId: string,
    branchId?: string,
    customerIsGuest = false,
  ) {
    const promotions = await this.couponsRepository.findAutoApplyPromotions(
      restaurantId,
      branchId,
    );

    return promotions.filter((promotion) =>
      this.isAudienceEligible(promotion.audience, customerIsGuest),
    );
  }

  async getActiveAutoApplyPromotionsForDisplay(
    restaurantId: string,
    branchId?: string,
  ) {
    return this.couponsRepository.findAutoApplyPromotions(
      restaurantId,
      branchId,
    );
  }

  async getActiveCustomerCoupons(
    restaurantId: string,
    branchId?: string,
    customerIsGuest = false,
  ) {
    const coupons = await this.couponsRepository.findActiveCustomerCoupons(
      restaurantId,
      branchId,
    );

    return coupons.filter((coupon) =>
      this.isAudienceEligible(coupon.audience, customerIsGuest),
    );
  }

  async getActiveCustomerDeals(
    restaurantId: string,
    branchId?: string,
    customerIsGuest = false,
  ) {
    const deals = await this.couponsRepository.findActiveDeals(
      restaurantId,
      branchId,
    );

    return deals.filter((deal) =>
      this.isAudienceEligible(deal.audience, customerIsGuest),
    );
  }

  async getActiveHappyHours(
    restaurantId: string,
    branchId?: string,
    customerIsGuest = false,
  ) {
    const now = new Date();
    const timezone = await this.resolveScheduleTimezone();
    const happyHours = await this.couponsRepository.findActiveHappyHours(
      restaurantId,
      branchId,
    );

    return happyHours.filter(
      (happyHour) =>
        this.isAudienceEligible(happyHour.audience, customerIsGuest) &&
        this.isCouponScheduleActive(happyHour, now, timezone),
    );
  }

  async isActiveFixedPriceDealItem(
    restaurantId: string,
    branchId: string | undefined,
    dealId: string,
    menuItemId: string,
  ) {
    const deal = await this.couponsRepository.findActivePromotionById(
      restaurantId,
      branchId,
      dealId,
    );

    return !!this.resolveFixedPriceDealItemOptions(deal, menuItemId);
  }

  async getActiveFixedPriceDealItemOptions(
    restaurantId: string,
    branchId: string | undefined,
    dealId: string,
    menuItemId: string,
  ): Promise<FixedPriceDealItemOptions | null> {
    const deal = await this.couponsRepository.findActivePromotionById(
      restaurantId,
      branchId,
      dealId,
    );

    return this.resolveFixedPriceDealItemOptions(deal, menuItemId);
  }

  async getActiveFixedPriceDealPricing(
    restaurantId: string,
    branchId: string | undefined,
    dealId: string,
    customerIsGuest = false,
  ): Promise<FixedPriceDealPricing | null> {
    const deal = await this.couponsRepository.findActivePromotionById(
      restaurantId,
      branchId,
      dealId,
    );

    if (
      !deal ||
      !this.isAudienceEligible(deal.audience, customerIsGuest) ||
      !this.isFixedPriceDeal(deal)
    ) {
      return null;
    }

    const selectionMode =
      deal.dealSelectionMode ?? CouponDealSelectionMode.FIXED_ITEMS;
    const categoryScopes = this.resolveFixedDealCategoryScopes(deal);

    return {
      dealId: deal.id,
      title: deal.title,
      description: deal.description,
      imageUrl: deal.imageUrl,
      code: deal.code,
      fixedPrice: deal.discountValue,
      menuItemIds: this.resolveFixedDealMenuItemIds(deal),
      selectionMode,
      requiredQuantity:
        selectionMode === CouponDealSelectionMode.FLEXIBLE_ITEMS
          ? deal.dealRequiredQuantity
          : null,
      categoryScopes,
    };
  }

  private isFixedItemsFixedPriceDeal(
    coupon: Coupon & {
      scopeMenuItem?: { id: string } | null;
      scopeMenuItems?: Array<{ menuItem: { id: string } }>;
    },
  ) {
    return (
      coupon.discountType === CouponDiscountType.FIXED_PRICE &&
      coupon.applyMode === CouponApplyMode.SCOPED_ITEMS &&
      (coupon.dealSelectionMode ?? CouponDealSelectionMode.FIXED_ITEMS) ===
        CouponDealSelectionMode.FIXED_ITEMS &&
      this.resolveFixedDealMenuItemIds(coupon).length > 0
    );
  }

  private isFixedPriceDeal(
    coupon: Coupon & {
      scopeMenuItem?: { id: string } | null;
      scopeMenuItems?: Array<{ menuItem: { id: string } }>;
      scopeCategory?: { id: string } | null;
      scopeCategories?: Array<{ menuCategory: { id: string } }>;
    },
  ) {
    return (
      coupon.discountType === CouponDiscountType.FIXED_PRICE &&
      coupon.applyMode === CouponApplyMode.SCOPED_ITEMS &&
      (this.resolveFixedDealMenuItemIds(coupon).length > 0 ||
        this.resolveFixedDealCategoryScopes(coupon).length > 0)
    );
  }

  private resolveFixedPriceDealItemOptions(
    coupon:
      | (Coupon & {
          scopeMenuItem?: { id: string } | null;
          scopeMenuItems?: Array<{ menuItem: { id: string } }>;
          scopeCategory?: { id: string } | null;
          scopeCategories?: Array<{
            menuCategory: { id: string };
            forcedVariationId?: string | null;
          }>;
        })
      | null,
    menuItemId: string,
  ): FixedPriceDealItemOptions | null {
    if (!coupon || !this.isFixedPriceDeal(coupon)) {
      return null;
    }

    if (this.resolveFixedDealMenuItemIds(coupon).includes(menuItemId)) {
      return { dealId: coupon.id, forcedVariationId: null };
    }

    const categoryScope = this.resolveFixedDealCategoryScopes(coupon).find(
      (scope) => scope.menuItemIds.includes(menuItemId),
    );

    return categoryScope
      ? {
          dealId: coupon.id,
          forcedVariationId: categoryScope.forcedVariationId,
        }
      : null;
  }

  private resolveFixedDealMenuItemIds(
    coupon: Coupon & {
      scopeMenuItem?: { id: string } | null;
      scopeMenuItems?: Array<{ menuItem: { id: string } }>;
    },
  ) {
    return this.resolveScopedIds(
      coupon.scopeMenuItem?.id ?? coupon.scopeMenuItemId,
      coupon.scopeMenuItems?.map((entry) => entry.menuItem.id) ?? [],
    );
  }

  private resolveFixedDealCategoryScopes(
    coupon: Coupon & {
      scopeCategory?: { id: string } | null;
      scopeCategories?: Array<{
        itemLimit?: number | null;
        forcedVariationId?: string | null;
        includedMenuItemIds?: Prisma.JsonValue | null;
        excludedMenuItemIds?: Prisma.JsonValue | null;
        menuCategory: {
          id: string;
          variations?: Array<{ id: string }>;
          variationLinks?: Array<{ variationId: string }>;
          items?: Array<{
            id: string;
            variationPriceOverrides?: Array<{ variationId: string }>;
          }>;
        };
      }>;
    },
  ) {
    return [
      ...(coupon.scopeCategories ?? []).map((entry) => {
        const eligibility = this.resolveForcedVariationCategoryEligibility(
          entry.menuCategory,
          entry.forcedVariationId ?? null,
        );
        const includedMenuItemIds = this.readStringArrayJson(
          entry.includedMenuItemIds,
        );
        const configuredExcludedMenuItemIds = this.readStringArrayJson(
          entry.excludedMenuItemIds,
        );
        const menuItemIds = (
          includedMenuItemIds.length
            ? eligibility.eligibleMenuItemIds.filter((id) =>
                includedMenuItemIds.includes(id),
              )
            : eligibility.eligibleMenuItemIds
        ).filter((id) => !configuredExcludedMenuItemIds.includes(id));

        return {
          menuCategoryId: entry.menuCategory.id,
          itemLimit: entry.itemLimit ?? null,
          forcedVariationId: entry.forcedVariationId ?? null,
          menuItemIds,
          excludedMenuItemIds: [
            ...new Set([
              ...eligibility.excludedMenuItemIds,
              ...configuredExcludedMenuItemIds,
              ...eligibility.eligibleMenuItemIds.filter(
                (id) => includedMenuItemIds.length && !menuItemIds.includes(id),
              ),
            ]),
          ],
        };
      }),
      ...((coupon.scopeCategory?.id ?? coupon.scopeCategoryId)
        ? [
            {
              menuCategoryId:
                coupon.scopeCategory?.id ?? (coupon.scopeCategoryId as string),
              itemLimit: null,
              forcedVariationId: null,
              menuItemIds: [] as string[],
              excludedMenuItemIds: [] as string[],
            },
          ]
        : []),
    ].filter(
      (entry, index, all) =>
        all.findIndex(
          (candidate) => candidate.menuCategoryId === entry.menuCategoryId,
        ) === index,
    );
  }

  private resolveForcedVariationCategoryEligibility(
    menuCategory: {
      id: string;
      variations?: Array<{ id: string }>;
      variationLinks?: Array<{ variationId: string }>;
      items?: Array<{
        id: string;
        variationPriceOverrides?: Array<{ variationId: string }>;
      }>;
    },
    forcedVariationId: string | null,
  ) {
    const allMenuItemIds = menuCategory.items?.map((item) => item.id) ?? [];

    if (!forcedVariationId) {
      return { eligibleMenuItemIds: allMenuItemIds, excludedMenuItemIds: [] };
    }

    const hasCategoryWideVariation =
      menuCategory.variations?.some(
        (variation) => variation.id === forcedVariationId,
      ) ||
      menuCategory.variationLinks?.some(
        (link) => link.variationId === forcedVariationId,
      );

    if (hasCategoryWideVariation) {
      return { eligibleMenuItemIds: allMenuItemIds, excludedMenuItemIds: [] };
    }

    const eligibleMenuItemIds =
      menuCategory.items
        ?.filter((item) =>
          item.variationPriceOverrides?.some(
            (override) => override.variationId === forcedVariationId,
          ),
        )
        .map((item) => item.id) ?? [];

    return {
      eligibleMenuItemIds,
      excludedMenuItemIds: allMenuItemIds.filter(
        (menuItemId) => !eligibleMenuItemIds.includes(menuItemId),
      ),
    };
  }

  private readStringArrayJson(value: Prisma.JsonValue | null | undefined) {
    if (!Array.isArray(value)) {
      return [];
    }

    return [
      ...new Set(
        value.filter(
          (entry): entry is string =>
            typeof entry === 'string' && entry.trim().length > 0,
        ),
      ),
    ];
  }

  async findBestAutoApplyPromotion(
    input: Omit<CouponValidationInput, 'code'>,
  ): Promise<CouponValidationResult | null> {
    const [promotions, happyHours] = await Promise.all([
      this.getActiveAutoApplyPromotions(
        input.restaurantId,
        input.branchId,
        input.customerIsGuest,
      ),
      this.getActiveHappyHours(
        input.restaurantId,
        input.branchId,
        input.customerIsGuest,
      ),
    ]);

    let best: CouponValidationResult | null = null;

    for (const promotion of [...promotions, ...happyHours]) {
      try {
        const result = await this.validateResolvedCoupon(promotion, {
          ...input,
          code: promotion.code,
          ignoreMinOrderAmount:
            this.shouldMatchItemPreviewEligibility(promotion),
        });

        if (result.discountAmount.lessThanOrEqualTo(0)) {
          continue;
        }

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
      imageUrl: validation.coupon.imageUrl,
      thumbnailUrl: validation.coupon.imageUrl,
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
    if (!this.isAudienceEligible(coupon.audience, input.customerIsGuest)) {
      throw new BadRequestException(
        'Coupon is not available for this customer',
      );
    }

    if (
      !coupon.isActive ||
      coupon.status !== CouponStatus.ACTIVE ||
      coupon.deletedAt
    ) {
      throw new BadRequestException('Coupon is not active');
    }

    if (
      coupon.kind === CouponCampaignKind.HAPPY_HOUR &&
      input.isScheduledOrder
    ) {
      throw new BadRequestException(
        'Happy Hour is not available for scheduled orders',
      );
    }

    if (
      !this.isCouponWithinDateWindow(coupon.startsAt, coupon.expiresAt, now)
    ) {
      throw new BadRequestException('Coupon is not valid at this time');
    }

    if (
      !this.isCouponScheduleActive(
        coupon,
        now,
        await this.resolveScheduleTimezone(),
      )
    ) {
      throw new BadRequestException('Coupon is not valid at this time');
    }

    if (coupon.branchId && coupon.branchId !== input.branchId) {
      throw new BadRequestException('Coupon is not valid for this branch');
    }

    if (coupon.kind === CouponCampaignKind.GIFT_CARD) {
      throw new BadRequestException(
        'Gift card codes must be redeemed to wallet',
      );
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
      !input.ignoreMinOrderAmount &&
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
      discountAmount = this.resolveFlatDiscountAmount(
        coupon,
        input,
        eligibleSubtotal,
      );
    } else {
      discountAmount = eligibleSubtotal
        .mul(coupon.discountValue)
        .div(new Prisma.Decimal(100));
      if (coupon.maxDiscountAmount && coupon.maxDiscountAmount.greaterThan(0)) {
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
    const dealSelectionMode =
      coupon.dealSelectionMode ?? CouponDealSelectionMode.FIXED_ITEMS;

    if (dealSelectionMode === CouponDealSelectionMode.FLEXIBLE_ITEMS) {
      const requiredQuantity = coupon.dealRequiredQuantity ?? 0;
      if (requiredQuantity < 1) {
        throw new BadRequestException(
          'Flexible deal requires a valid item quantity',
        );
      }

      const eligibleQuantity = this.resolveEligibleDealQuantity(
        scopedMenuItemIds,
        scopedCategoryIds,
        input,
      );

      if (eligibleQuantity < requiredQuantity) {
        throw new BadRequestException(
          `Flexible deal requires at least ${requiredQuantity} eligible item(s)`,
        );
      }

      return;
    }

    if (scopedCategoryIds.length || scopedMenuItemIds.length < 2) {
      throw new BadRequestException(
        'Fixed price promotions require at least two scoped menu items',
      );
    }

    const selectedMenuItemIds = new Set(
      input.lineItems?.length
        ? input.lineItems
            .filter((line) => !line.dealId)
            .map((line) => line.menuItemId)
        : input.menuItemIds,
    );
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

    if (
      coupon.discountType === CouponDiscountType.FIXED_PRICE &&
      (coupon.dealSelectionMode ?? CouponDealSelectionMode.FIXED_ITEMS) ===
        CouponDealSelectionMode.FLEXIBLE_ITEMS
    ) {
      return this.resolveFlexibleDealEligibleSubtotal(
        scopedMenuItemIds,
        scopedCategoryIds,
        coupon.dealRequiredQuantity ?? 0,
        input,
      );
    }

    if (input.lineItems?.length) {
      return input.lineItems.reduce((sum, line) => {
        if (line.dealId) {
          return sum;
        }

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

  private shouldMatchItemPreviewEligibility(coupon: Coupon) {
    return (
      coupon.kind === CouponCampaignKind.HAPPY_HOUR &&
      coupon.applyMode === CouponApplyMode.SCOPED_ITEMS
    );
  }

  private resolveFlatDiscountAmount(
    coupon: Coupon & {
      scopeMenuItems?: Array<{ menuItem: { id: string } }>;
      scopeCategories?: Array<{ menuCategory: { id: string } }>;
    },
    input: CouponValidationInput,
    eligibleSubtotal: Prisma.Decimal,
  ) {
    if (coupon.applyMode === CouponApplyMode.ORDER_TOTAL) {
      return Prisma.Decimal.min(coupon.discountValue, eligibleSubtotal);
    }

    const eligibleLineItems = this.resolveEligibleLineItems(coupon, input);
    if (!eligibleLineItems.length) {
      return Prisma.Decimal.min(coupon.discountValue, eligibleSubtotal);
    }

    const discountAmount = eligibleLineItems.reduce((sum, line) => {
      const quantity = Math.max(1, line.quantity ?? 1);
      return sum.plus(coupon.discountValue.mul(quantity));
    }, new Prisma.Decimal(0));

    return Prisma.Decimal.min(discountAmount, eligibleSubtotal);
  }

  private resolveEligibleLineItems(
    coupon: Coupon & {
      scopeMenuItems?: Array<{ menuItem: { id: string } }>;
      scopeCategories?: Array<{ menuCategory: { id: string } }>;
    },
    input: CouponValidationInput,
  ) {
    if (!input.lineItems?.length) {
      return [];
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
      return input.lineItems.filter((line) => !line.dealId);
    }

    return input.lineItems.filter((line) => {
      if (line.dealId) {
        return false;
      }

      return (
        scopedMenuItemIds.includes(line.menuItemId) ||
        (line.categoryIds ?? [line.categoryId]).some((categoryId) =>
          scopedCategoryIds.includes(categoryId),
        )
      );
    });
  }

  private resolveFlexibleDealEligibleSubtotal(
    scopedMenuItemIds: string[],
    scopedCategoryIds: string[],
    requiredQuantity: number,
    input: CouponValidationInput,
  ) {
    if (requiredQuantity < 1) {
      throw new BadRequestException(
        'Flexible deal requires a valid item count',
      );
    }

    if (!input.lineItems?.length) {
      const eligibleCount = this.resolveEligibleDealQuantity(
        scopedMenuItemIds,
        scopedCategoryIds,
        input,
      );

      if (eligibleCount >= requiredQuantity) {
        return new Prisma.Decimal(input.subtotal);
      }

      throw new BadRequestException(
        `Flexible deal requires at least ${requiredQuantity} eligible item(s)`,
      );
    }

    const unitPrices = input.lineItems.flatMap((line) => {
      if (line.dealId) {
        return [];
      }

      const matches =
        scopedMenuItemIds.includes(line.menuItemId) ||
        (line.categoryIds ?? [line.categoryId]).some((categoryId) =>
          scopedCategoryIds.includes(categoryId),
        );

      if (!matches) {
        return [];
      }

      const quantity = Math.max(1, Math.trunc(line.quantity ?? 1));
      const unitPrice =
        line.unitPrice !== undefined
          ? new Prisma.Decimal(line.unitPrice)
          : new Prisma.Decimal(line.lineTotal).div(quantity);

      return Array.from({ length: quantity }, () => unitPrice);
    });

    if (unitPrices.length < requiredQuantity) {
      throw new BadRequestException(
        `Flexible deal requires at least ${requiredQuantity} eligible item(s)`,
      );
    }

    return unitPrices
      .sort((left, right) => right.comparedTo(left))
      .slice(0, requiredQuantity)
      .reduce((sum, price) => sum.plus(price), new Prisma.Decimal(0));
  }

  private resolveEligibleDealQuantity(
    scopedMenuItemIds: string[],
    scopedCategoryIds: string[],
    input: CouponValidationInput,
  ) {
    if (input.lineItems?.length) {
      return input.lineItems.reduce((sum, line) => {
        if (line.dealId) {
          return sum;
        }

        const matches =
          scopedMenuItemIds.includes(line.menuItemId) ||
          (line.categoryIds ?? [line.categoryId]).some((categoryId) =>
            scopedCategoryIds.includes(categoryId),
          );

        return matches ? sum + (line.quantity ?? 1) : sum;
      }, 0);
    }

    const menuItemMatches = input.menuItemIds.filter((menuItemId) =>
      scopedMenuItemIds.includes(menuItemId),
    ).length;
    const categoryMatches = input.categoryIds.filter((categoryId) =>
      scopedCategoryIds.includes(categoryId),
    ).length;

    return menuItemMatches + categoryMatches;
  }

  private resolveScopedIds(primary: string | null, extras: string[]) {
    return [...new Set([...(primary ? [primary] : []), ...extras])];
  }

  private async resolveRestaurantId(
    user: AuthUserContext,
    requestedRestaurantId?: string,
    requestedBranchId?: string,
  ): Promise<string | undefined> {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      if (requestedBranchId) {
        return this.resolveRestaurantIdFromBranch(
          requestedBranchId,
          undefined,
          requestedRestaurantId,
        );
      }

      return requestedRestaurantId;
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      const tenantId = this.requireTenantId(user);

      if (requestedBranchId) {
        return this.resolveRestaurantIdFromBranch(
          requestedBranchId,
          tenantId,
          requestedRestaurantId ?? user.rid,
        );
      }

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

    if (this.isStaffActor(user)) {
      const restaurantId =
        requestedRestaurantId ??
        user.rid ??
        this.resolveSingleAssignedRestaurantId(user);
      if (!restaurantId) {
        throw new ForbiddenException('Restaurant context is required');
      }

      await this.ensureStaffRestaurantAccess(user, restaurantId);
      return restaurantId;
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
    requestedBranchId?: string,
  ): Promise<string> {
    const restaurantId = await this.resolveRestaurantId(
      user,
      requestedRestaurantId,
      requestedBranchId,
    );

    if (!restaurantId) {
      throw new BadRequestException('restaurantId is required');
    }

    return restaurantId;
  }

  private async resolveRestaurantIdFromBranch(
    branchId: string,
    tenantId?: string,
    restaurantId?: string,
  ): Promise<string> {
    const branch = await this.couponsRepository.findBranchScope(
      branchId,
      tenantId,
      restaurantId,
    );

    if (!branch) {
      throw new ForbiddenException(
        'branchId does not belong to the provided restaurant scope',
      );
    }

    return branch.restaurantId;
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

    if (this.isStaffActor(user)) {
      await this.ensureStaffRestaurantAccess(user, restaurantId);
      return;
    }

    if (user.rid !== restaurantId) {
      throw new ForbiddenException(
        'You cannot access resources outside your restaurant',
      );
    }
  }

  private async ensureStaffRestaurantAccess(
    user: AuthUserContext,
    restaurantId: string,
  ): Promise<void> {
    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    const hasAllRestaurantsAccess =
      user.restaurantAccess?.allRestaurants === true ||
      user.restaurantAccess?.hasAllRestaurantsAccess === true;
    const assignedRestaurantIds = new Set([
      ...(user.restaurantAccess?.restaurantIds ?? []),
      ...(user.rid ? [user.rid] : []),
    ]);

    if (!hasAllRestaurantsAccess && !assignedRestaurantIds.has(restaurantId)) {
      throw new ForbiddenException(
        'You cannot access resources outside your assigned restaurants',
      );
    }

    await this.assertRestaurantInTenant(user.tid, restaurantId);
  }

  private resolveSingleAssignedRestaurantId(
    user: AuthUserContext,
  ): string | undefined {
    const restaurantIds = new Set([
      ...(user.restaurantAccess?.restaurantIds ?? []),
      ...(user.rid ? [user.rid] : []),
    ]);
    return restaurantIds.size === 1 ? [...restaurantIds][0] : undefined;
  }

  private isStaffActor(user: AuthUserContext): boolean {
    return user.role === UserRoleEnum.STAFF || user.actorType === 'STAFF';
  }

  private async resolveSingleTenantRestaurantId(tenantId: string) {
    const restaurants =
      await this.couponsRepository.findTenantRestaurants(tenantId);

    return restaurants.length === 1 ? restaurants[0].id : undefined;
  }

  private async assertRestaurantInTenant(
    tenantId: string,
    restaurantId: string,
  ) {
    const restaurant = await this.couponsRepository.findRestaurantInTenant(
      tenantId,
      restaurantId,
    );

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
      const item = await this.couponsRepository.findActiveScopeMenuItem(
        restaurantId,
        menuItemId,
      );

      if (!item) {
        throw new BadRequestException(
          'scopeMenuItemId not found in restaurant',
        );
      }
    }

    if (categoryId) {
      const category = await this.couponsRepository.findActiveScopeCategory(
        restaurantId,
        categoryId,
      );

      if (!category) {
        throw new BadRequestException(
          'scopeCategoryId not found in restaurant',
        );
      }
    }
  }

  private async validateScopeReferenceLists(
    restaurantId: string,
    menuItemIds: string[] = [],
    categoryIds: string[] = [],
  ): Promise<void> {
    await Promise.all([
      ...[...new Set(menuItemIds)].map((menuItemId) =>
        this.validateScopeReferences(restaurantId, menuItemId),
      ),
      ...[...new Set(categoryIds)].map((categoryId) =>
        this.validateScopeReferences(restaurantId, undefined, categoryId),
      ),
    ]);
  }

  private isAudienceEligible(
    audience: CouponAudience | null | undefined,
    customerIsGuest = false,
  ) {
    return (
      audience === null ||
      audience === undefined ||
      audience === CouponAudience.BOTH ||
      (customerIsGuest && audience === CouponAudience.GUEST) ||
      (!customerIsGuest && audience === CouponAudience.REGISTERED)
    );
  }

  private isCouponScheduleActive(
    coupon: Pick<Coupon, 'activeDays' | 'dailyStartTime' | 'dailyEndTime'>,
    now: Date,
    timezone = 'UTC',
  ) {
    const localTime = this.resolveLocalScheduleTime(now, timezone);
    const activeDays = this.readActiveDays(coupon.activeDays);

    if (!coupon.dailyStartTime || !coupon.dailyEndTime) {
      return !activeDays || activeDays.includes(localTime.weekday);
    }

    const currentMinutes = localTime.minutes;
    const startMinutes = this.parseTimeToMinutes(coupon.dailyStartTime);
    const endMinutes = this.parseTimeToMinutes(coupon.dailyEndTime);

    if (startMinutes === null || endMinutes === null) {
      return !activeDays || activeDays.includes(localTime.weekday);
    }

    if (startMinutes <= endMinutes) {
      return (
        (!activeDays || activeDays.includes(localTime.weekday)) &&
        currentMinutes >= startMinutes &&
        currentMinutes < endMinutes
      );
    }

    const scheduleWeekday =
      currentMinutes < endMinutes
        ? (localTime.weekday + 6) % 7
        : localTime.weekday;

    return (
      (!activeDays || activeDays.includes(scheduleWeekday)) &&
      (currentMinutes >= startMinutes || currentMinutes < endMinutes)
    );
  }

  private resolveLocalScheduleTime(now: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const readPart = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? '';
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekday = weekdays.indexOf(readPart('weekday'));
    const hour = Number(readPart('hour'));
    const minute = Number(readPart('minute'));

    return {
      weekday: weekday >= 0 ? weekday : now.getUTCDay(),
      minutes:
        Number.isFinite(hour) && Number.isFinite(minute)
          ? hour * 60 + minute
          : now.getUTCHours() * 60 + now.getUTCMinutes(),
    };
  }

  private async resolveScheduleTimezone() {
    const settings = await this.globalSettingsService?.getSettings();
    const timezone = settings?.data?.timezone;
    return typeof timezone === 'string' && timezone.trim()
      ? timezone.trim()
      : 'UTC';
  }

  private isCouponWithinDateWindow(
    startsAt: Date | null,
    expiresAt: Date | null,
    now: Date,
  ) {
    if (startsAt && startsAt > now) {
      return false;
    }

    if (!expiresAt) {
      return true;
    }

    const effectiveExpiresAt = this.isMidnightUtc(expiresAt)
      ? this.endOfUtcDay(expiresAt)
      : expiresAt;

    return effectiveExpiresAt >= now;
  }

  private isMidnightUtc(date: Date) {
    return (
      date.getUTCHours() === 0 &&
      date.getUTCMinutes() === 0 &&
      date.getUTCSeconds() === 0 &&
      date.getUTCMilliseconds() === 0
    );
  }

  private endOfUtcDay(date: Date) {
    const end = new Date(date);
    end.setUTCHours(23, 59, 59, 999);
    return end;
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
