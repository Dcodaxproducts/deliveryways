import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import { OrderTypeEnum, UserRoleEnum } from '../../common/enums';
import { buildPaginationMeta } from '../../common/utils';
import { PrismaService } from '../../database';
import { CouponsService } from '../coupons/coupons.service';
import {
  CancelOrderDto,
  CreateOrderDto,
  ListOrdersDto,
  QuoteOrderDto,
  UpdateOrderStatusDto,
} from './dto';
import { OrdersRepository } from './orders.repository';

type QuoteLine = {
  menuItemId: string;
  categoryId: string;
  menuItemName: string;
  variationId?: string;
  variationName?: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  note?: string;
  snapshotModifiers?: {
    modifierId: string;
    name: string;
    quantity: number;
    unitPrice: number;
  }[];
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersRepository: OrdersRepository,
    private readonly couponsService: CouponsService,
  ) {}

  async quote(user: AuthUserContext, dto: QuoteOrderDto) {
    const quote = await this.buildQuote(user, dto);

    return {
      data: {
        branchId: quote.branch.id,
        restaurantId: quote.branch.restaurantId,
        orderType: dto.orderType,
        subtotal: Number(quote.subtotal),
        taxAmount: Number(quote.taxAmount),
        deliveryFee: Number(quote.deliveryFee),
        discountAmount: Number(quote.discountAmount),
        totalAmount: Number(quote.totalAmount),
        couponCode: quote.appliedCouponCode,
        items: quote.lines.map((line) => ({
          menuItemId: line.menuItemId,
          menuItemName: line.menuItemName,
          variationId: line.variationId,
          variationName: line.variationName,
          quantity: line.quantity,
          unitPrice: Number(line.unitPrice),
          lineTotal: Number(line.lineTotal),
          note: line.note,
          snapshotModifiers: line.snapshotModifiers,
        })),
      },
      message: 'Order quote generated successfully',
    };
  }

  async create(user: AuthUserContext, dto: CreateOrderDto) {
    const quote = await this.buildQuote(user, dto);

    const branchSettings = this.readBranchSettings(quote.branch.settings);
    if (!this.isPaymentAllowed(branchSettings, dto.paymentMethod)) {
      throw new BadRequestException(
        'Payment method is not allowed for this branch',
      );
    }

    const customerId = this.resolveCustomerId(user);

    const data = await this.prisma.$transaction(async (tx) => {
      const order = await this.ordersRepository.create(
        {
          tenant: { connect: { id: quote.branch.tenantId } },
          restaurant: { connect: { id: quote.branch.restaurantId } },
          branch: { connect: { id: quote.branch.id } },
          customer: { connect: { id: customerId } },
          coupon: quote.couponId
            ? { connect: { id: quote.couponId } }
            : undefined,
          deliveryAddress: dto.deliveryAddressId
            ? { connect: { id: dto.deliveryAddressId } }
            : undefined,
          orderType: dto.orderType,
          paymentMethod: dto.paymentMethod,
          status: OrderStatus.PLACED,
          subtotal: quote.subtotal,
          taxAmount: quote.taxAmount,
          deliveryFee: quote.deliveryFee,
          discountAmount: quote.discountAmount,
          totalAmount: quote.totalAmount,
          customerNote: dto.customerNote,
          items: {
            create: quote.lines.map((line) => ({
              menuItem: { connect: { id: line.menuItemId } },
              menuItemName: line.menuItemName,
              variationId: line.variationId,
              variationName: line.variationName,
              unitPrice: line.unitPrice,
              quantity: line.quantity,
              lineTotal: line.lineTotal,
              note: line.note,
              snapshotModifiers:
                line.snapshotModifiers as unknown as Prisma.InputJsonValue,
            })),
          },
        },
        tx,
      );

      if (quote.couponId) {
        await this.couponsService.registerUsage(
          quote.couponId,
          customerId,
          order.id,
          tx,
        );
      }

      return order;
    });

    return {
      data,
      message: 'Order created successfully',
    };
  }

  async list(user: AuthUserContext, query: ListOrdersDto) {
    const restaurantId = this.resolveRestaurantId(user, query.restaurantId);
    const customerId =
      user.role === UserRoleEnum.CUSTOMER ? user.uid : undefined;
    const { items, total } = await this.ordersRepository.list(
      restaurantId,
      query,
      customerId,
    );

    return {
      data: items,
      message: 'Orders fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async details(user: AuthUserContext, id: string) {
    const order = await this.ordersRepository.findById(id);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    this.assertOrderAccess(user, order.restaurantId, order.customerId);

    return {
      data: order,
      message: 'Order fetched successfully',
    };
  }

  async updateStatus(
    user: AuthUserContext,
    id: string,
    dto: UpdateOrderStatusDto,
  ) {
    const order = await this.ordersRepository.findById(id);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    this.assertOrderAccess(user, order.restaurantId, order.customerId, true);

    if (!this.isValidStatusTransition(order.status, dto.status)) {
      throw new BadRequestException('Invalid order status transition');
    }

    const data = await this.ordersRepository.updateStatus(id, dto.status);

    return {
      data,
      message: 'Order status updated successfully',
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async cancel(user: AuthUserContext, id: string, _dto: CancelOrderDto) {
    const order = await this.ordersRepository.findById(id);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    this.assertOrderAccess(user, order.restaurantId, order.customerId);

    const terminalStatuses: OrderStatus[] = [
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
      OrderStatus.REJECTED,
    ];
    if (terminalStatuses.includes(order.status)) {
      throw new BadRequestException(
        'Order cannot be cancelled in current state',
      );
    }

    const data = await this.ordersRepository.cancel(id, user.uid);

    return {
      data,
      message: 'Order cancelled successfully',
    };
  }

  private async buildQuote(user: AuthUserContext, dto: QuoteOrderDto) {
    if (!dto.items.length) {
      throw new BadRequestException('At least one item is required');
    }

    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, deletedAt: null, isActive: true },
      select: {
        id: true,
        tenantId: true,
        restaurantId: true,
        settings: true,
      },
    });

    if (!branch) {
      throw new BadRequestException('Branch not found or inactive');
    }

    this.ensureBranchAccess(user, branch.restaurantId, branch.id);

    const settings = this.readBranchSettings(branch.settings);

    if (!settings.allowedOrderTypes.includes(dto.orderType)) {
      throw new BadRequestException(
        'Order type is not supported by this branch',
      );
    }

    const lines: QuoteLine[] = [];

    for (const requestedItem of dto.items) {
      const menuItem = await this.prisma.menuItem.findFirst({
        where: {
          id: requestedItem.menuItemId,
          restaurantId: branch.restaurantId,
          deletedAt: null,
          isActive: true,
        },
        include: {
          category: { select: { id: true } },
          variations: { where: { deletedAt: null, isActive: true } },
          modifierLinks: {
            include: {
              modifierGroup: {
                include: {
                  modifiers: {
                    where: { deletedAt: null, isActive: true },
                  },
                },
              },
            },
          },
          branchOverrides: {
            where: {
              branchId: branch.id,
            },
          },
        },
      });

      if (!menuItem) {
        throw new BadRequestException(
          `Menu item not found: ${requestedItem.menuItemId}`,
        );
      }

      const branchOverride = menuItem.branchOverrides[0];
      if (branchOverride && !branchOverride.isAvailable) {
        throw new BadRequestException(
          `Menu item unavailable at branch: ${menuItem.name}`,
        );
      }

      let unitPrice =
        branchOverride?.priceOverride ??
        (requestedItem.variationId
          ? this.resolveVariationPrice(
              menuItem.variations,
              requestedItem.variationId,
            )
          : menuItem.basePrice);

      let variationName: string | undefined;
      if (requestedItem.variationId) {
        const variation = menuItem.variations.find(
          (v) => v.id === requestedItem.variationId,
        );
        if (!variation) {
          throw new BadRequestException(
            `Variation not found for item: ${menuItem.name}`,
          );
        }
        variationName = variation.name;
        unitPrice = variation.price;
      }

      const snapshotModifiers: QuoteLine['snapshotModifiers'] = [];

      if (requestedItem.modifiers?.length) {
        for (const requestedModifier of requestedItem.modifiers) {
          const found = this.findModifier(
            menuItem.modifierLinks,
            requestedModifier.modifierId,
          );

          if (!found) {
            throw new BadRequestException(
              `Modifier not found for item: ${menuItem.name}`,
            );
          }

          const modifierQty = requestedModifier.quantity ?? 1;
          unitPrice = unitPrice.plus(found.priceDelta.mul(modifierQty));

          snapshotModifiers.push({
            modifierId: found.id,
            name: found.name,
            quantity: modifierQty,
            unitPrice: Number(found.priceDelta),
          });
        }
      }

      const lineTotal = unitPrice.mul(requestedItem.quantity);

      lines.push({
        menuItemId: menuItem.id,
        categoryId: menuItem.category.id,
        menuItemName: menuItem.name,
        variationId: requestedItem.variationId,
        variationName,
        quantity: requestedItem.quantity,
        unitPrice: unitPrice.toDecimalPlaces(2),
        lineTotal: lineTotal.toDecimalPlaces(2),
        note: requestedItem.note,
        snapshotModifiers,
      });
    }

    const subtotal = lines.reduce(
      (sum, line) => sum.plus(line.lineTotal),
      new Prisma.Decimal(0),
    );

    if (subtotal.lessThan(settings.deliveryConfig.minOrderAmount)) {
      throw new BadRequestException(
        'Subtotal is below branch minimum order amount',
      );
    }

    let deliveryFee = new Prisma.Decimal(0);
    if (dto.orderType === OrderTypeEnum.DELIVERY) {
      if (!dto.deliveryAddressId) {
        throw new BadRequestException(
          'deliveryAddressId is required for delivery orders',
        );
      }

      await this.assertAddressWithinRadius(
        user,
        dto.deliveryAddressId,
        branch.id,
        settings.deliveryConfig.radiusKm,
      );

      deliveryFee = new Prisma.Decimal(settings.deliveryConfig.deliveryFee);
      if (
        settings.deliveryConfig.isFreeDelivery &&
        settings.deliveryConfig.freeDeliveryThreshold > 0 &&
        subtotal.greaterThanOrEqualTo(
          settings.deliveryConfig.freeDeliveryThreshold,
        )
      ) {
        deliveryFee = new Prisma.Decimal(0);
      }
    }

    const taxAmount = subtotal
      .mul(settings.taxation.taxPercentage)
      .div(100)
      .toDecimalPlaces(2);

    let discountAmount = new Prisma.Decimal(0);
    let couponId: string | undefined;
    let appliedCouponCode: string | undefined;

    if (dto.couponCode) {
      const customerId = this.resolveCustomerId(user);
      const couponValidation = await this.couponsService.validateForCheckout({
        restaurantId: branch.restaurantId,
        branchId: branch.id,
        customerId,
        code: dto.couponCode,
        subtotal: Number(subtotal),
        menuItemIds: lines.map((line) => line.menuItemId),
        categoryIds: lines.map((line) => line.categoryId),
      });

      discountAmount = couponValidation.discountAmount;
      couponId = couponValidation.coupon.id;
      appliedCouponCode = couponValidation.coupon.code;
    }

    let totalAmount = subtotal
      .plus(taxAmount)
      .plus(deliveryFee)
      .minus(discountAmount);

    if (totalAmount.lessThan(new Prisma.Decimal(0))) {
      totalAmount = new Prisma.Decimal(0);
    }

    return {
      branch,
      lines,
      subtotal: subtotal.toDecimalPlaces(2),
      taxAmount,
      deliveryFee: deliveryFee.toDecimalPlaces(2),
      discountAmount: discountAmount.toDecimalPlaces(2),
      totalAmount: totalAmount.toDecimalPlaces(2),
      couponId,
      appliedCouponCode,
    };
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

  private resolveCustomerId(user: AuthUserContext): string {
    if (
      user.role !== UserRoleEnum.CUSTOMER &&
      user.role !== UserRoleEnum.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Only customer users can place orders');
    }

    return user.uid;
  }

  private ensureBranchAccess(
    user: AuthUserContext,
    restaurantId: string,
    branchId: string,
  ) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return;
    }

    if (user.rid !== restaurantId) {
      throw new ForbiddenException('Cross-restaurant access denied');
    }

    if (
      user.role === UserRoleEnum.BRANCH_ADMIN &&
      user.bid &&
      user.bid !== branchId
    ) {
      throw new ForbiddenException('Cross-branch access denied');
    }
  }

  private assertOrderAccess(
    user: AuthUserContext,
    restaurantId: string,
    customerId: string,
    adminOnly = false,
  ) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return;
    }

    if (user.role === UserRoleEnum.CUSTOMER) {
      if (adminOnly) {
        throw new ForbiddenException('Customers cannot perform this action');
      }

      if (user.uid !== customerId) {
        throw new ForbiddenException('Cross-customer access denied');
      }

      return;
    }

    if (user.rid !== restaurantId) {
      throw new ForbiddenException('Cross-restaurant access denied');
    }
  }

  private isValidStatusTransition(
    current: OrderStatus,
    next: OrderStatus,
  ): boolean {
    const transitions: Record<OrderStatus, OrderStatus[]> = {
      PLACED: [
        OrderStatus.CONFIRMED,
        OrderStatus.CANCELLED,
        OrderStatus.REJECTED,
      ],
      CONFIRMED: [
        OrderStatus.PREPARING,
        OrderStatus.CANCELLED,
        OrderStatus.REJECTED,
      ],
      PREPARING: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.CANCELLED],
      OUT_FOR_DELIVERY: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
      DELIVERED: [],
      CANCELLED: [],
      REJECTED: [],
    };

    return transitions[current].includes(next);
  }

  private isPaymentAllowed(
    settings: BranchSettings,
    paymentMethod: string,
  ): boolean {
    return settings.allowedPaymentMethods.includes(paymentMethod);
  }

  private resolveVariationPrice(
    variations: { id: string; price: Prisma.Decimal; name: string }[],
    variationId: string,
  ) {
    const variation = variations.find((item) => item.id === variationId);

    if (!variation) {
      throw new BadRequestException('Variation not found');
    }

    return variation.price;
  }

  private findModifier(
    links: {
      modifierGroup: {
        modifiers: { id: string; name: string; priceDelta: Prisma.Decimal }[];
      };
    }[],
    modifierId: string,
  ) {
    for (const link of links) {
      const found = link.modifierGroup.modifiers.find(
        (modifier) => modifier.id === modifierId,
      );
      if (found) {
        return found;
      }
    }

    return undefined;
  }

  private readBranchSettings(input: unknown): BranchSettings {
    const fallback: BranchSettings = {
      allowedOrderTypes: [OrderTypeEnum.DELIVERY, OrderTypeEnum.TAKEAWAY],
      allowedPaymentMethods: ['COD'],
      deliveryConfig: {
        radiusKm: 5,
        minOrderAmount: 0,
        deliveryFee: 0,
        isFreeDelivery: false,
        freeDeliveryThreshold: 0,
      },
      taxation: {
        taxPercentage: 0,
      },
    };

    if (!input || typeof input !== 'object') {
      return fallback;
    }

    const raw = input as Partial<BranchSettings>;

    return {
      allowedOrderTypes: raw.allowedOrderTypes ?? fallback.allowedOrderTypes,
      allowedPaymentMethods:
        raw.allowedPaymentMethods ?? fallback.allowedPaymentMethods,
      deliveryConfig: {
        radiusKm:
          raw.deliveryConfig?.radiusKm ?? fallback.deliveryConfig.radiusKm,
        minOrderAmount:
          raw.deliveryConfig?.minOrderAmount ??
          fallback.deliveryConfig.minOrderAmount,
        deliveryFee:
          raw.deliveryConfig?.deliveryFee ??
          fallback.deliveryConfig.deliveryFee,
        isFreeDelivery:
          raw.deliveryConfig?.isFreeDelivery ??
          fallback.deliveryConfig.isFreeDelivery,
        freeDeliveryThreshold:
          raw.deliveryConfig?.freeDeliveryThreshold ??
          fallback.deliveryConfig.freeDeliveryThreshold,
      },
      taxation: {
        taxPercentage:
          raw.taxation?.taxPercentage ?? fallback.taxation.taxPercentage,
      },
    };
  }

  private async assertAddressWithinRadius(
    user: AuthUserContext,
    deliveryAddressId: string,
    branchId: string,
    radiusKm: number,
  ) {
    const address = await this.prisma.address.findFirst({
      where: {
        id: deliveryAddressId,
        refType: 'USER',
        referenceId: user.uid,
        deletedAt: null,
        isActive: true,
      },
      select: {
        lat: true,
        lng: true,
      },
    });

    if (!address?.lat || !address?.lng) {
      throw new BadRequestException('Delivery address must include lat/lng');
    }

    const branchAddress = await this.prisma.address.findFirst({
      where: {
        refType: 'BRANCH',
        referenceId: branchId,
        deletedAt: null,
        isActive: true,
      },
      select: {
        lat: true,
        lng: true,
      },
    });

    if (!branchAddress?.lat || !branchAddress?.lng) {
      throw new BadRequestException('Branch location is missing lat/lng');
    }

    const distanceKm = this.calculateDistanceKm(
      Number(address.lat),
      Number(address.lng),
      Number(branchAddress.lat),
      Number(branchAddress.lng),
    );

    if (distanceKm > radiusKm) {
      throw new BadRequestException(
        'Delivery address is outside branch delivery radius',
      );
    }
  }

  private calculateDistanceKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return 6371 * c;
  }
}

type BranchSettings = {
  allowedOrderTypes: string[];
  allowedPaymentMethods: string[];
  deliveryConfig: {
    radiusKm: number;
    minOrderAmount: number;
    deliveryFee: number;
    isFreeDelivery: boolean;
    freeDeliveryThreshold: number;
  };
  taxation: {
    taxPercentage: number;
  };
};
