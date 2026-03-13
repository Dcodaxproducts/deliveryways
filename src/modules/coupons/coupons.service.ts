import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Coupon,
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

export interface CouponValidationInput {
  restaurantId: string;
  branchId: string;
  customerId: string;
  code: string;
  subtotal: number;
  menuItemIds: string[];
  categoryIds: string[];
}

export interface CouponValidationResult {
  coupon: Coupon;
  discountAmount: Prisma.Decimal;
  eligibleSubtotal: Prisma.Decimal;
}

@Injectable()
export class CouponsService {
  constructor(
    private readonly couponsRepository: CouponsRepository,
    private readonly prisma: PrismaService,
  ) {}

  async create(user: AuthUserContext, dto: CreateCouponDto) {
    const restaurantId = this.requireRestaurantId(user);

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
    const restaurantId = this.resolveRestaurantId(user, query.restaurantId);
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

    this.ensureRestaurantAccess(user, coupon.restaurantId);

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
    const restaurantId = this.requireRestaurantId(user);
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
    const restaurantId = this.requireRestaurantId(user);
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

    const eligibleSubtotal = subtotalDecimal;

    if (coupon.scopeMenuItemId) {
      if (!input.menuItemIds.includes(coupon.scopeMenuItemId)) {
        throw new BadRequestException(
          'Coupon is not applicable to selected items',
        );
      }
    }

    if (coupon.scopeCategoryId) {
      if (!input.categoryIds.includes(coupon.scopeCategoryId)) {
        throw new BadRequestException(
          'Coupon is not applicable to selected categories',
        );
      }
    }

    if (eligibleSubtotal.lessThanOrEqualTo(new Prisma.Decimal(0))) {
      throw new BadRequestException(
        'Coupon eligible subtotal must be greater than zero',
      );
    }

    let discountAmount = new Prisma.Decimal(0);

    if (coupon.discountType === CouponDiscountType.FLAT) {
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

  private resolveRestaurantId(
    user: AuthUserContext,
    requestedRestaurantId?: string,
  ): string | undefined {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return requestedRestaurantId;
    }

    if (!user.rid) {
      throw new ForbiddenException('Restaurant context is required');
    }

    if (requestedRestaurantId && requestedRestaurantId !== user.rid) {
      throw new ForbiddenException('Cross-restaurant access denied');
    }

    return user.rid;
  }

  private requireRestaurantId(user: AuthUserContext): string {
    const restaurantId = this.resolveRestaurantId(user);

    if (!restaurantId) {
      throw new BadRequestException('restaurantId is required');
    }

    return restaurantId;
  }

  private ensureRestaurantAccess(user: AuthUserContext, restaurantId: string) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return;
    }

    if (user.rid !== restaurantId) {
      throw new ForbiddenException('Cross-restaurant access denied');
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
}
