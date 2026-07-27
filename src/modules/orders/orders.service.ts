import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import {
  AddressRefType,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
  Prisma,
  ServiceChargeType,
  CouponDealSelectionMode,
  CouponCampaignKind,
} from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import {
  OrderTypeEnum,
  PaymentMethodEnum,
  UserRoleEnum,
} from '../../common/enums';
import { PrismaTx } from '../../common/types';
import { buildPaginationMeta } from '../../common/utils';
import { isRestaurantMenuAvailableAt } from '../../common/utils';
import { ChatService } from '../chat/chat.service';
import { PrismaService } from '../../database';
import { CouponsService } from '../coupons/coupons.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LoyaltyWalletService } from '../loyalty-wallet/loyalty-wallet.service';
import {
  GlobalSettingsService,
  ServiceChargeSettingsShape,
} from '../global-settings/global-settings.service';
import { OrderTrackingRealtimeService } from './order-tracking.realtime.service';
import { StorageService } from '../storage/storage.service';
import {
  CancelOrderDto,
  CreateOrderDto,
  GuestOrderContactDto,
  GuestOrderDeliveryAddressDto,
  ListOrdersDto,
  OrderItemModifierDto,
  OrderItemModifierSelectionDto,
  QuoteOrderDto,
  SubmitOrderReviewDto,
  UpdateOrderStatusDto,
} from './dto';
import { OrdersRepository } from './orders.repository';

const DEFAULT_SCHEDULE_TIMEZONE = 'Asia/Karachi';

interface OrderModifierLink {
  selectionType?: 'SINGLE' | 'MULTIPLE';
  minSelect?: number;
  maxSelect?: number;
  modifierGroup: {
    id: string;
    name: string;
    minSelect: number;
    maxSelect: number;
    isRequired: boolean;
    modifierLinks: Array<{
      modifier: {
        id: string;
        name: string;
        priceDelta: Prisma.Decimal;
        itemPriceOverrides?: Array<{
          menuItemId: string;
          priceDelta: Prisma.Decimal;
        }>;
        variationPriceOverrides?: Array<{
          menuItemId: string | null;
          variationId: string;
          priceDelta: Prisma.Decimal;
        }>;
      };
    }>;
  };
}

interface OrderDirectModifierOverride {
  modifierId?: string;
  priceDelta: Prisma.Decimal;
  isRequired?: boolean;
  modifier: {
    id: string;
    name: string;
    priceDelta: Prisma.Decimal;
    itemPriceOverrides?: Array<{
      menuItemId: string;
      priceDelta: Prisma.Decimal;
    }>;
    variationPriceOverrides?: Array<{
      menuItemId: string | null;
      variationId: string;
      priceDelta: Prisma.Decimal;
    }>;
  };
}

interface OrderVariationModifierOverride {
  modifierId: string;
  priceDelta: Prisma.Decimal;
  modifier: OrderDirectModifierOverride['modifier'];
}

interface OrderModifierSource {
  id: string;
  name?: string;
  isRequired?: boolean;
  minSelect?: number;
  maxSelect?: number | null;
  minQuantity?: number;
  maxQuantity?: number | null;
  modifierLinks: OrderModifierLink[];
  modifierPriceOverrides?: OrderDirectModifierOverride[];
  variations?: Array<{
    id: string;
    modifierPriceOverrides?: OrderVariationModifierOverride[];
  }>;
  category?: {
    modifierLinks?: OrderModifierLink[];
  };
}

type QuoteLine = {
  menuItemId: string;
  categoryId: string;
  categoryIds: string[];
  menuItemName: string;
  dealId?: string;
  variationId?: string;
  variationName?: string;
  quantity: number;
  depositAmount: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  taxTypeCode?: string | null;
  taxPercentage?: Prisma.Decimal | null;
  note?: string;
  snapshotModifiers?: {
    modifierId: string;
    name: string;
    quantity: number;
    unitPrice: number;
  }[];
  snapshotSections?: {
    slot: 'LEFT' | 'RIGHT';
    menuItemId: string;
    menuItemName: string;
    unitPrice: number;
  }[];
};

type OrderDisplayItemSource = {
  id: string;
  menuItemId: string;
  menuItemName: string;
  variationId: string | null;
  variationName: string | null;
  unitPrice: Prisma.Decimal;
  depositAmount: Prisma.Decimal;
  quantity: number;
  lineTotal: Prisma.Decimal;
  note: string | null;
  snapshotModifiers: Prisma.JsonValue | null;
  menuItem?: { imageUrl: string | null } | null;
};

type OrderDisplayItemResponse = {
  id: string;
  menuItemId: string;
  menuItemName: string;
  imageUrl: string | null;
  variationId: string | null;
  variationName: string | null;
  quantity: number;
  unitPrice: number;
  depositAmount: number;
  lineTotal: number;
  note: string | null;
  snapshotModifiers: unknown[];
  snapshotSections: unknown[];
};

type AppliedPromotionQuoteMetadata = {
  id: string;
  title: string;
  applyMode: string;
  autoApply: boolean;
  discountType: string;
  discountValue: number;
  discountAmount: number;
  kind?: string;
  scopeMenuItemId?: string | null;
  scopeCategoryId?: string | null;
  scopeMenuItems?: Array<{ menuItem?: { id?: string } }>;
  scopeCategories?: Array<{ menuCategory?: { id?: string } }>;
};

type QuoteCustomerContext = {
  customerId: string;
  isGuest: boolean;
};

type QuoteBranchContext = {
  id: string;
  tenantId: string;
  restaurantId: string;
  settings: unknown;
  restaurant?: { settings: unknown } | null;
};

type DeliveryAddressContext = {
  id: string;
  lat: Prisma.Decimal | null;
  lng: Prisma.Decimal | null;
  postalCode: string | null;
};

type BranchLocationContext = {
  lat: Prisma.Decimal | null;
  lng: Prisma.Decimal | null;
};

type BuildQuoteOptions = {
  skipDeliveryAddressValidation?: boolean;
  enforceMinimumOrderAmount?: boolean;
  skipOrderTimeAvailabilityValidation?: boolean;
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersRepository: OrdersRepository,
    private readonly couponsService: CouponsService,
    private readonly notificationsService: NotificationsService,
    private readonly chatService: ChatService,
    private readonly orderTrackingRealtimeService: OrderTrackingRealtimeService,
    private readonly storageService?: StorageService,
    private readonly loyaltyWalletService?: LoyaltyWalletService,
    private readonly globalSettingsService?: GlobalSettingsService,
  ) {}

  async quote(user: AuthUserContext, dto: QuoteOrderDto) {
    const quote = await this.buildQuote(user, dto, {
      skipDeliveryAddressValidation: Boolean(dto.couponCode),
      enforceMinimumOrderAmount: false,
    });

    return {
      data: this.toQuoteResponseData(quote, dto),
      message: 'Order quote generated successfully',
    };
  }

  async quoteForCouponValidation(user: AuthUserContext, dto: QuoteOrderDto) {
    const quote = await this.buildQuote(user, dto, {
      skipDeliveryAddressValidation: true,
      enforceMinimumOrderAmount: false,
      skipOrderTimeAvailabilityValidation: true,
    });

    return {
      data: this.toQuoteResponseData(quote, dto),
      message: 'Order quote generated successfully',
    };
  }

  async assertDeliveryAddressCoverage(
    user: AuthUserContext,
    dto: {
      branchId: string;
      customerId?: string;
      deliveryAddressId: string;
    },
  ) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, deletedAt: null, isActive: true },
      select: {
        id: true,
        tenantId: true,
        restaurantId: true,
        settings: true,
        restaurant: {
          select: { settings: true },
        },
      },
    });

    if (!branch) {
      throw new BadRequestException('Branch not found or inactive');
    }

    await this.ensureBranchAccess(user, branch.restaurantId, branch.id);
    const customer = await this.resolveQuoteCustomer(
      user,
      branch,
      dto.customerId,
    );
    const settings = this.readBranchSettings(
      branch.settings,
      branch.restaurant?.settings,
    );

    await this.assertDeliveryAddressInCoverage(
      customer.customerId,
      dto.deliveryAddressId,
      branch.id,
      settings.deliveryConfig,
    );
  }

  async create(user: AuthUserContext, dto: CreateOrderDto) {
    const quote = await this.buildQuote(user, dto);
    const currency = await this.resolveRestaurantCurrency(
      quote.branch.restaurantId,
    );
    this.assertGuestContactForOrder(quote.customer, dto.guestContact);

    const branchSettings = this.readBranchSettings(quote.branch.settings);
    const activeGlobalPaymentMethods =
      await this.resolveActiveGlobalPaymentMethods();
    if (
      !this.isPaymentAllowed(
        branchSettings,
        dto.paymentMethod,
        activeGlobalPaymentMethods,
      )
    ) {
      throw new BadRequestException(
        'Payment method is not allowed for this branch',
      );
    }

    this.assertWalletPaymentCoverage(dto.paymentMethod, quote);

    const customerId = quote.customer.customerId;
    const initialPaymentStatus = this.resolveInitialPaymentStatus(
      dto.paymentMethod,
      quote,
    );

    const data = await this.prisma.$transaction(async (tx) => {
      const processedAt =
        initialPaymentStatus === PaymentStatus.PAID ? new Date() : undefined;
      await this.assertDineInTableCapacity(
        tx,
        dto.orderType,
        quote.branch.id,
        quote.orderTime,
        branchSettings,
      );
      const guestDeliveryAddress = dto.guestDeliveryAddress
        ? await this.createGuestDeliveryAddress(
            tx,
            quote.branch.tenantId,
            customerId,
            dto.guestDeliveryAddress,
          )
        : null;

      if (quote.customer.isGuest && dto.guestContact) {
        await this.updateGuestContact(
          tx,
          customerId,
          dto.guestContact,
          quote.branch.restaurantId,
        );
      }
      const deliveryAddressId =
        dto.deliveryAddressId ?? guestDeliveryAddress?.id;

      const order = await this.ordersRepository.create(
        {
          tenant: { connect: { id: quote.branch.tenantId } },
          restaurant: { connect: { id: quote.branch.restaurantId } },
          branch: { connect: { id: quote.branch.id } },
          customer: { connect: { id: customerId } },
          coupon: quote.couponId
            ? { connect: { id: quote.couponId } }
            : undefined,
          deliveryAddress: deliveryAddressId
            ? { connect: { id: deliveryAddressId } }
            : undefined,
          orderType: dto.orderType,
          paymentMethod: dto.paymentMethod,
          orderTime: quote.orderTime ? new Date(quote.orderTime) : null,
          isScheduled: quote.orderTime
            ? this.isScheduledOrderTime(quote.orderTime)
            : false,
          status: this.resolveInitialOrderStatus(dto.paymentMethod),
          subtotal: quote.subtotal,
          taxAmount: quote.taxAmount,
          deliveryFee: quote.deliveryFee,
          serviceChargeType: quote.serviceChargeType,
          serviceChargeValue: quote.serviceChargeValue,
          serviceChargeAmount: quote.serviceChargeAmount,
          tipAmount: quote.tipAmount,
          discountAmount: quote.discountAmount,
          walletAppliedAmount: quote.walletAppliedAmount,
          loyaltyDiscountAmount: quote.loyaltyDiscountAmount,
          loyaltyPointsRedeemed: quote.loyaltyPointsRedeemed,
          totalAmount: quote.totalAmount,
          paymentStatus: initialPaymentStatus,
          paidAt: processedAt,
          deliveryOtp:
            dto.orderType === OrderTypeEnum.DELIVERY
              ? this.generateDeliveryOtp()
              : undefined,
          customerNote: dto.customerNote,
          items: {
            create: quote.lines.map((line) => ({
              menuItem: { connect: { id: line.menuItemId } },
              menuItemName: line.menuItemName,
              variationId: line.variationId,
              variationName: line.variationName,
              unitPrice: line.unitPrice,
              depositAmount: line.depositAmount,
              quantity: line.quantity,
              lineTotal: line.lineTotal,
              note: line.note,
              snapshotModifiers: this.packOrderSelections(
                line.snapshotModifiers,
                line.snapshotSections,
                line.dealId,
              ) as unknown as Prisma.InputJsonValue,
            })),
          },
        },
        tx,
      );

      await this.loyaltyWalletService!.applyOrderBenefits(
        tx,
        {
          customerId,
          tenantId: quote.branch.tenantId,
          restaurantId: quote.branch.restaurantId,
          branchId: quote.branch.id,
        },
        {
          id: order.id,
          walletAppliedAmount: quote.walletAppliedAmount,
          loyaltyDiscountAmount: quote.loyaltyDiscountAmount,
          loyaltyPointsRedeemed: quote.loyaltyPointsRedeemed,
        },
        user.uid,
      );

      await tx.paymentTransaction.create({
        data: {
          orderId: order.id,
          tenantId: quote.branch.tenantId,
          restaurantId: quote.branch.restaurantId,
          branchId: quote.branch.id,
          paymentMethod: dto.paymentMethod,
          type: PaymentTransactionType.CHARGE,
          status: initialPaymentStatus,
          amount: this.resolvePaymentTransactionAmount(
            dto.paymentMethod,
            quote,
          ),
          currency,
          processedAt,
          note:
            dto.paymentMethod === PaymentMethodEnum.WALLET
              ? 'Order paid fully via wallet balance'
              : undefined,
        },
      });

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

    if (initialPaymentStatus === PaymentStatus.PAID) {
      await this.loyaltyWalletService!.awardPointsForPaidOrder(
        data.id,
        undefined,
        user.uid,
      );
    } else if (data.status === OrderStatus.PLACED) {
      await this.loyaltyWalletService!.awardPointsForPaidOrder(
        data.id,
        undefined,
        user.uid,
        { allowUnpaid: true },
      );
    }

    if (data.status === OrderStatus.PLACED) {
      await this.notificationsService.notifyOrderPlaced(data.id);
      await this.emitTrackingUpdate(data.id);
    }

    return {
      data: this.toOrderMutationResponse(data),
      message: 'Order created successfully',
    };
  }

  async list(user: AuthUserContext, query: ListOrdersDto) {
    const isDeliveryman = user.role === 'DELIVERYMAN';
    const restaurantId = isDeliveryman
      ? undefined
      : await this.resolveRestaurantId(user, query.restaurantId);
    const customerId =
      user.role === UserRoleEnum.CUSTOMER ? user.uid : undefined;
    const deliverymanId = isDeliveryman ? user.uid : undefined;
    const excludeUnpaidStripePending =
      user.role === UserRoleEnum.BUSINESS_ADMIN ||
      user.role === UserRoleEnum.BRANCH_ADMIN;
    const { items, total } = await this.ordersRepository.list(
      restaurantId,
      query,
      customerId,
      deliverymanId,
      excludeUnpaidStripePending,
    );

    return {
      data: await this.resolveMediaResponse(
        await Promise.all(items.map((item) => this.toOrderListResponse(item))),
      ),
      message: 'Orders fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async details(user: AuthUserContext, id: string) {
    const order = await this.ordersRepository.findById(id);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (user.role === 'DELIVERYMAN') {
      this.assertDeliverymanOrderAccess(user, order.deliverymanId);
    } else {
      await this.assertOrderAccess(user, order.restaurantId, order.customerId);
    }

    return {
      data: await this.resolveMediaResponse(
        await this.toOrderDetailsResponse(order, user.role !== 'DELIVERYMAN'),
      ),
      message: 'Order fetched successfully',
    };
  }

  async submitReview(
    user: AuthUserContext,
    id: string,
    dto: SubmitOrderReviewDto,
  ) {
    if (user.role !== UserRoleEnum.CUSTOMER) {
      throw new ForbiddenException('Only customers can review orders');
    }

    const order = await this.ordersRepository.findReviewContextById(id);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.customerId !== user.uid) {
      throw new ForbiddenException('You cannot review this order');
    }

    if (!this.isCompletedOrder(order.orderType, order.status)) {
      throw new BadRequestException('Only completed orders can be reviewed');
    }

    if (order.review) {
      throw new BadRequestException('Order has already been reviewed');
    }

    const comment = dto.comment?.trim();
    const data = await this.ordersRepository.createReview({
      tenant: { connect: { id: order.tenantId } },
      restaurant: { connect: { id: order.restaurantId } },
      branch: { connect: { id: order.branchId } },
      order: { connect: { id: order.id } },
      customer: { connect: { id: order.customerId } },
      rating: dto.rating,
      comment: comment ? comment : undefined,
    });

    return {
      data,
      message: 'Order review submitted successfully',
    };
  }

  async tracking(user: AuthUserContext, id: string) {
    const data = await this.getTrackingSnapshot(user, id);

    return {
      data: await this.resolveMediaResponse(data),
      message: 'Order tracking fetched successfully',
    };
  }

  private async resolveMediaResponse<T>(data: T) {
    return (await this.storageService?.resolveMediaUrlsDeep(data)) ?? data;
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

    if (user.role === 'DELIVERYMAN') {
      this.assertDeliverymanOrderAccess(user, order.deliverymanId);

      if (!this.isValidDeliverymanStatusTransition(order, dto.status)) {
        throw new ForbiddenException(
          'Deliveryman cannot update this order to the requested status',
        );
      }
    } else {
      await this.ensureBranchAccess(user, order.restaurantId, order.branchId);
    }

    const isExternalDeliveryDispatch = this.isExternalDeliveryDispatch(
      order,
      dto,
    );

    if (
      !isExternalDeliveryDispatch &&
      !this.isValidStatusTransition(order.orderType, order.status, dto.status)
    ) {
      throw new BadRequestException('Invalid order status transition');
    }

    const acceptedOrderTime = this.resolveAcceptedOrderTime(order, dto);
    this.assertDeliveryOtpForCompletion(order, dto);

    const data = await this.ordersRepository.updateStatus(
      id,
      dto.status,
      acceptedOrderTime,
    );

    await this.notificationsService.notifyOrderStatusChanged(data.id);
    await this.chatService.syncDeliveryThreadForOrderLifecycle(
      data.id,
      dto.status,
    );
    await this.emitTrackingUpdate(data.id);

    return {
      data: this.toOrderMutationResponse(data),
      message: 'Order status updated successfully',
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async cancel(user: AuthUserContext, id: string, _dto: CancelOrderDto) {
    const order = await this.ordersRepository.findById(id);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    await this.assertOrderAccess(user, order.restaurantId, order.customerId);

    const terminalStatuses: OrderStatus[] = [
      OrderStatus.DELIVERED,
      OrderStatus.PICKED_UP,
      OrderStatus.SERVED,
      OrderStatus.CANCELLED,
      OrderStatus.REJECTED,
    ];
    if (terminalStatuses.includes(order.status)) {
      throw new BadRequestException(
        'Order cannot be cancelled in current state',
      );
    }

    const data = await this.ordersRepository.cancel(id, user.uid);

    await this.notificationsService.notifyOrderStatusChanged(data.id);
    await this.chatService.syncDeliveryThreadForOrderLifecycle(
      data.id,
      OrderStatus.CANCELLED,
    );
    await this.emitTrackingUpdate(data.id);

    return {
      data: this.toOrderMutationResponse(data),
      message: 'Order cancelled successfully',
    };
  }

  async assignDeliveryman(
    user: AuthUserContext,
    orderId: string,
    deliverymanId: string,
    deliverymanBranchId: string,
    deliverymanRestaurantId: string,
  ) {
    const order = await this.ordersRepository.findById(orderId);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    await this.assertOrderAccess(
      user,
      order.restaurantId,
      order.customerId,
      true,
    );

    return this.assignDeliverymanToOrder(
      order,
      deliverymanId,
      deliverymanBranchId,
      deliverymanRestaurantId,
    );
  }

  async acceptDeliverymanOrder(
    user: AuthUserContext,
    orderId: string,
    deliverymanBranchId: string,
    deliverymanRestaurantId: string,
  ) {
    if (user.role !== 'DELIVERYMAN') {
      throw new ForbiddenException('Only deliverymen can accept orders');
    }

    const order = await this.ordersRepository.findById(orderId);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.deliverymanId) {
      throw new BadRequestException(
        'Order is already assigned to a deliveryman',
      );
    }

    return this.assignDeliverymanToOrder(
      order,
      user.uid,
      deliverymanBranchId,
      deliverymanRestaurantId,
    );
  }

  async getTrackingSnapshot(user: AuthUserContext, id: string) {
    const order = await this.ordersRepository.findTrackingById(id);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    await this.assertTrackingAccess(user, {
      restaurantId: order.restaurantId,
      customerId: order.customerId,
      deliverymanId: order.deliverymanId,
    });

    return this.toOrderTrackingResponse(order);
  }

  async getTrackingSnapshotForRealtime(id: string) {
    const order = await this.ordersRepository.findTrackingById(id);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return this.toOrderTrackingResponse(order);
  }

  async emitTrackingUpdatesForDeliveryman(deliverymanId: string) {
    const orders = await this.prisma.order.findMany({
      where: {
        deliverymanId,
        status: OrderStatus.OUT_FOR_DELIVERY,
      },
      select: { id: true },
    });

    await Promise.all(orders.map((order) => this.emitTrackingUpdate(order.id)));
  }

  private async buildQuote(
    user: AuthUserContext,
    dto: QuoteOrderDto,
    options: BuildQuoteOptions = {},
  ) {
    if (!dto.items.length) {
      throw new BadRequestException('At least one item is required');
    }

    const orderTime = this.resolveQuoteOrderTime(dto);

    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, deletedAt: null, isActive: true },
      select: {
        id: true,
        tenantId: true,
        restaurantId: true,
        settings: true,
        restaurant: {
          select: { settings: true },
        },
      },
    });

    if (!branch) {
      throw new BadRequestException('Branch not found or inactive');
    }

    await this.ensureBranchAccess(user, branch.restaurantId, branch.id);

    const settings = this.readBranchSettings(
      branch.settings,
      branch.restaurant?.settings,
    );
    const enforceMinimumOrderAmount = options.enforceMinimumOrderAmount ?? true;
    const scheduleTimeZone = await this.resolveScheduleTimeZone();

    if (!options.skipOrderTimeAvailabilityValidation) {
      this.assertBranchAcceptingOrders(settings, orderTime, scheduleTimeZone);
    }
    const customer = await this.resolveQuoteCustomer(
      user,
      branch,
      dto.customerId,
    );
    this.assertGuestCheckoutAddressRules(customer, dto);

    if (!settings.allowedOrderTypes.includes(dto.orderType)) {
      throw new BadRequestException(
        'Order type is not supported by this branch',
      );
    }

    if (!options.skipOrderTimeAvailabilityValidation) {
      this.assertDeliveryOrderWithinHours(
        settings,
        dto.orderType,
        orderTime,
        scheduleTimeZone,
      );
    }

    const selectedMenu = dto.restaurantMenuId
      ? await this.resolveSelectedRestaurantMenu(
          branch.restaurantId,
          dto.restaurantMenuId,
          orderTime ?? new Date().toISOString(),
        )
      : null;

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
          category: {
            select: {
              id: true,
              variations: {
                where: { deletedAt: null, isActive: true },
                include: {
                  modifierPriceOverrides: {
                    include: {
                      modifier: {
                        include: {
                          itemPriceOverrides: true,
                          variationPriceOverrides: true,
                        },
                      },
                    },
                  },
                  itemPriceOverrides: true,
                },
              },
              variationLinks: {
                where: {
                  isActive: true,
                  variation: { deletedAt: null, isActive: true },
                },
                include: {
                  variation: {
                    include: {
                      modifierPriceOverrides: {
                        include: {
                          modifier: {
                            include: {
                              itemPriceOverrides: true,
                              variationPriceOverrides: true,
                            },
                          },
                        },
                      },
                      itemPriceOverrides: true,
                    },
                  },
                },
                orderBy: [{ sortOrder: 'asc' }],
              },
              modifierLinks: {
                orderBy: [{ sortOrder: 'asc' }],
                include: {
                  modifierGroup: {
                    include: {
                      modifierLinks: {
                        where: {
                          modifier: { deletedAt: null, isActive: true },
                        },
                        include: {
                          modifier: {
                            include: {
                              itemPriceOverrides: true,
                              variationPriceOverrides: true,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          modifierLinks: {
            include: {
              modifierGroup: {
                include: {
                  modifierLinks: {
                    where: {
                      modifier: { deletedAt: null, isActive: true },
                    },
                    include: {
                      modifier: {
                        include: {
                          itemPriceOverrides: true,
                          variationPriceOverrides: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          modifierPriceOverrides: {
            include: {
              modifier: {
                include: {
                  itemPriceOverrides: true,
                  variationPriceOverrides: true,
                },
              },
            },
          },
          variationPriceOverrides: {
            include: {
              variation: {
                include: {
                  modifierPriceOverrides: {
                    include: {
                      modifier: {
                        include: {
                          itemPriceOverrides: true,
                          variationPriceOverrides: true,
                        },
                      },
                    },
                  },
                  itemPriceOverrides: true,
                },
              },
            },
          },
          categoryLinks: { select: { menuCategoryId: true } },
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

      if (
        selectedMenu &&
        !selectedMenu.directItemIds.has(menuItem.id) &&
        !this.itemMatchesMenuCategories(menuItem, selectedMenu.categoryIds)
      ) {
        throw new BadRequestException(
          `Menu item is not available in selected menu: ${menuItem.name}`,
        );
      }

      const hasSplitSections = !!requestedItem.sections?.length;
      const menuItemVariations = this.resolveItemVariations(menuItem);
      const parentVariation = requestedItem.variationId
        ? menuItemVariations.find((v) => v.id === requestedItem.variationId)
        : undefined;
      let unitPrice = this.resolveOrderItemBasePrice(
        {
          ...menuItem,
          variations: menuItemVariations,
        },
        branchOverride?.priceOverride,
        hasSplitSections ? undefined : requestedItem.variationId,
      ).plus(this.resolveOrderTypePriceAdjustment(menuItem, dto.orderType));
      const depositAmount = menuItem.depositAmount ?? new Prisma.Decimal(0);
      const explicitDealId = this.resolveOptionalString(requestedItem.dealId);
      const readyMadeDealId = explicitDealId
        ? (await this.isReadyMadeDealItem(
            branch.restaurantId,
            branch.id,
            explicitDealId,
            menuItem.id,
          ))
          ? explicitDealId
          : null
        : await this.findReadyMadeDealIdForItem(
            branch.restaurantId,
            branch.id,
            menuItem.id,
          );

      if (explicitDealId && !readyMadeDealId) {
        throw new BadRequestException(
          `Deal not found for item: ${menuItem.name}`,
        );
      }

      if (readyMadeDealId) {
        this.assertNoDealCustomizations(requestedItem, menuItem.name, {
          allowModifiers: true,
          allowVariation: true,
        });
      }
      const requestedModifiers =
        this.resolveRequestedOrderItemModifiers(requestedItem);

      let variationName: string | undefined;

      if (requestedItem.variationId) {
        if (!parentVariation && !hasSplitSections) {
          throw new BadRequestException(
            `Variation not found for item: ${menuItem.name}`,
          );
        }

        if (parentVariation) {
          variationName = parentVariation.name;
          unitPrice = this.resolveVariationPrice(
            menuItemVariations,
            requestedItem.variationId,
            branchOverride?.priceOverride ?? menuItem.basePrice,
            menuItem.id,
            dto.orderType,
          ).plus(
            this.variationHasPickupPrice(
              parentVariation,
              menuItem.id,
              dto.orderType,
            )
              ? new Prisma.Decimal(0)
              : this.resolveOrderTypePriceAdjustment(menuItem, dto.orderType),
          );
        }
      }

      const snapshotModifiers: QuoteLine['snapshotModifiers'] = [];
      const snapshotSections: QuoteLine['snapshotSections'] = [];

      if (requestedModifiers.length) {
        for (const requestedModifier of requestedModifiers) {
          const found = this.findModifier(
            {
              ...menuItem,
              variations: this.resolveItemVariations(
                menuItem,
              ) as OrderModifierSource['variations'],
            },
            requestedModifier.modifierId,
            menuItem.id,
            requestedItem.variationId,
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

      if (!readyMadeDealId || requestedModifiers.length) {
        this.assertModifierSelectionLimits(
          menuItem,
          requestedModifiers,
          requestedItem.modifierSelections ?? [],
        );
      }
      this.assertItemQuantityLimits(menuItem, requestedItem.quantity);

      if (requestedItem.sections?.length) {
        if (!this.supportsSplitPizza(menuItem)) {
          throw new BadRequestException(
            `Split pizza is not enabled for item: ${menuItem.name}`,
          );
        }

        if (requestedItem.sections.length !== 2) {
          throw new BadRequestException(
            'Split pizza requires exactly 2 sections',
          );
        }

        const slots = new Set(
          requestedItem.sections.map((section) => section.slot),
        );
        if (!slots.has('LEFT') || !slots.has('RIGHT') || slots.size !== 2) {
          throw new BadRequestException(
            'Split pizza sections must include one LEFT and one RIGHT section',
          );
        }

        const splitItems = await this.prisma.menuItem.findMany({
          where: {
            id: {
              in: [
                ...new Set(
                  requestedItem.sections.map((section) => section.menuItemId),
                ),
              ],
            },
            restaurantId: branch.restaurantId,
            deletedAt: null,
            isActive: true,
          },
          include: {
            modifierLinks: {
              include: {
                modifierGroup: {
                  include: {
                    modifierLinks: {
                      where: {
                        modifier: { deletedAt: null, isActive: true },
                      },
                      include: {
                        modifier: {
                          include: {
                            itemPriceOverrides: true,
                            variationPriceOverrides: true,
                          },
                        },
                      },
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
            categoryLinks: { select: { menuCategoryId: true } },
            category: {
              select: {
                id: true,
                variations: {
                  where: { deletedAt: null, isActive: true },
                  include: {
                    itemPriceOverrides: true,
                  },
                },
                variationLinks: {
                  where: {
                    isActive: true,
                    variation: { deletedAt: null, isActive: true },
                  },
                  include: {
                    variation: { include: { itemPriceOverrides: true } },
                  },
                  orderBy: [{ sortOrder: 'asc' }],
                },
                modifierLinks: {
                  orderBy: [{ sortOrder: 'asc' }],
                  include: {
                    modifierGroup: {
                      include: {
                        modifierLinks: {
                          where: {
                            modifier: { deletedAt: null, isActive: true },
                          },
                          include: {
                            modifier: {
                              include: {
                                itemPriceOverrides: true,
                                variationPriceOverrides: true,
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        });
        const splitItemMap = new Map(splitItems.map((item) => [item.id, item]));
        const sectionUnitPrices: Prisma.Decimal[] = [];

        for (const section of requestedItem.sections) {
          const sectionItem = splitItemMap.get(section.menuItemId);
          if (!sectionItem) {
            throw new BadRequestException(
              `Split section flavor not found for item: ${menuItem.name}`,
            );
          }

          const sectionBranchOverride = sectionItem.branchOverrides[0];
          if (sectionBranchOverride && !sectionBranchOverride.isAvailable) {
            throw new BadRequestException(
              `Split section flavor unavailable at branch: ${sectionItem.name}`,
            );
          }

          if (
            selectedMenu &&
            !selectedMenu.directItemIds.has(sectionItem.id) &&
            !this.itemMatchesMenuCategories(
              sectionItem,
              selectedMenu.categoryIds,
            )
          ) {
            throw new BadRequestException(
              `Split section flavor is not available in selected menu: ${sectionItem.name}`,
            );
          }

          const sectionVariations = this.resolveItemVariations(sectionItem);
          const sectionVariation = requestedItem.variationId
            ? sectionVariations.find(
                (item) => item.id === requestedItem.variationId,
              )
            : undefined;

          variationName ??= sectionVariation?.name;

          const sectionPrice = this.resolveOrderItemBasePrice(
            {
              ...sectionItem,
              variations: sectionVariations,
            },
            sectionBranchOverride?.priceOverride,
            sectionVariation ? requestedItem.variationId : undefined,
          ).plus(
            this.resolveOrderTypePriceAdjustment(sectionItem, dto.orderType),
          );

          sectionUnitPrices.push(sectionPrice);

          snapshotSections.push({
            slot: section.slot,
            menuItemId: sectionItem.id,
            menuItemName: sectionItem.name,
            unitPrice: Number(sectionPrice.toDecimalPlaces(2)),
          });
        }

        unitPrice = Prisma.Decimal.max(...sectionUnitPrices).plus(
          snapshotModifiers.reduce(
            (sum, modifier) => sum.plus(modifier.unitPrice * modifier.quantity),
            new Prisma.Decimal(0),
          ),
        );
      }

      const lineTotal = unitPrice
        .plus(depositAmount)
        .mul(requestedItem.quantity);

      lines.push({
        menuItemId: menuItem.id,
        categoryId: menuItem.category.id,
        categoryIds: this.itemCategoryIds(menuItem),
        menuItemName: menuItem.name,
        dealId: readyMadeDealId ?? requestedItem.dealId,
        variationId: requestedItem.variationId,
        variationName,
        quantity: requestedItem.quantity,
        depositAmount: depositAmount.toDecimalPlaces(2),
        unitPrice: unitPrice.toDecimalPlaces(2),
        lineTotal: lineTotal.toDecimalPlaces(2),
        taxTypeCode: menuItem.taxTypeCode ?? null,
        taxPercentage:
          menuItem.taxPercentage !== undefined &&
          menuItem.taxPercentage !== null
            ? new Prisma.Decimal(menuItem.taxPercentage)
            : null,
        note: requestedItem.note,
        snapshotModifiers,
        snapshotSections,
      });
    }

    const pricedLines = await this.applyFixedDealPricingToQuoteLines(
      lines,
      branch.restaurantId,
      branch.id,
    );
    const subtotal = pricedLines.reduce(
      (sum, line) => sum.plus(line.lineTotal),
      new Prisma.Decimal(0),
    );

    let deliveryFee = new Prisma.Decimal(0);
    const branchMinOrderAmount = new Prisma.Decimal(
      settings.deliveryConfig.minOrderAmount,
    );
    if (dto.orderType === OrderTypeEnum.DELIVERY) {
      if (
        !options.skipDeliveryAddressValidation &&
        !dto.deliveryAddressId &&
        !dto.guestDeliveryAddress
      ) {
        throw new BadRequestException(
          'deliveryAddressId or guestDeliveryAddress is required for delivery orders',
        );
      }

      if (!options.skipDeliveryAddressValidation) {
        if (dto.deliveryAddressId) {
          deliveryFee = await this.resolveDeliveryFeeForAddress(
            customer.customerId,
            dto.deliveryAddressId,
            branch.id,
            settings.deliveryConfig,
            subtotal,
            enforceMinimumOrderAmount,
          );
        } else if (dto.guestDeliveryAddress) {
          deliveryFee = await this.resolveDeliveryFeeForGuestAddress(
            dto.guestDeliveryAddress,
            branch.id,
            settings.deliveryConfig,
            subtotal,
            enforceMinimumOrderAmount,
          );
        }
      }

      if (options.skipDeliveryAddressValidation) {
        if (enforceMinimumOrderAmount) {
          this.assertMinimumOrderAmount(
            subtotal,
            branchMinOrderAmount,
            'branch',
          );
        }
        deliveryFee = new Prisma.Decimal(settings.deliveryConfig.deliveryFee);
      }

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

    const taxAmount = this.resolveQuoteTaxAmount(
      pricedLines,
      settings.taxation.taxPercentage,
    );
    const restaurantServiceChargeConfig = this.resolveRestaurantServiceCharge(
      branch.restaurant?.settings,
      settings.serviceCharge,
    );
    const serviceCharge = this.resolveServiceCharge(
      restaurantServiceChargeConfig,
      subtotal,
    );
    const tipAmount = this.resolveTipAmount(dto.tipAmount);

    let discountAmount = new Prisma.Decimal(0);
    let couponId: string | undefined;
    let appliedCouponCode: string | undefined;
    let appliedPromotion: AppliedPromotionQuoteMetadata | undefined;

    const promotionInput = {
      restaurantId: branch.restaurantId,
      branchId: branch.id,
      customerId: customer.customerId,
      subtotal: Number(subtotal),
      menuItemIds: pricedLines.map((line) => line.menuItemId),
      categoryIds: [
        ...new Set(pricedLines.flatMap((line) => line.categoryIds)),
      ],
      lineItems: pricedLines.map((line) => ({
        menuItemId: line.menuItemId,
        categoryId: line.categoryId,
        categoryIds: line.categoryIds,
        dealId: line.dealId,
        quantity: line.quantity,
        unitPrice: Number(line.unitPrice),
        lineTotal: Number(line.lineTotal),
      })),
    };

    if (dto.couponCode) {
      const couponValidation = await this.couponsService.validateForCheckout({
        ...promotionInput,
        code: dto.couponCode,
      });

      discountAmount = couponValidation.discountAmount;
      couponId = couponValidation.coupon.id;
      appliedCouponCode = couponValidation.coupon.code;
      appliedPromotion = {
        id: couponValidation.coupon.id,
        title: couponValidation.coupon.title,
        applyMode: couponValidation.coupon.applyMode,
        autoApply: couponValidation.coupon.autoApply,
        discountType: couponValidation.coupon.discountType,
        discountValue: Number(couponValidation.coupon.discountValue),
        discountAmount: Number(discountAmount.toDecimalPlaces(2)),
        kind: couponValidation.coupon.kind,
        scopeMenuItemId: couponValidation.coupon.scopeMenuItemId,
        scopeCategoryId: couponValidation.coupon.scopeCategoryId,
        scopeMenuItems: couponValidation.coupon.scopeMenuItems,
        scopeCategories: couponValidation.coupon.scopeCategories,
      };
    } else {
      const autoPromotion =
        typeof this.couponsService.findBestAutoApplyPromotion === 'function'
          ? await this.couponsService.findBestAutoApplyPromotion(promotionInput)
          : null;

      if (autoPromotion) {
        discountAmount = autoPromotion.discountAmount;
        couponId = autoPromotion.coupon.id;
        appliedPromotion = {
          id: autoPromotion.coupon.id,
          title: autoPromotion.coupon.title,
          applyMode: autoPromotion.coupon.applyMode,
          autoApply: autoPromotion.coupon.autoApply,
          discountType: autoPromotion.coupon.discountType,
          discountValue: Number(autoPromotion.coupon.discountValue),
          discountAmount: Number(discountAmount.toDecimalPlaces(2)),
          kind: autoPromotion.coupon.kind,
          scopeMenuItemId: autoPromotion.coupon.scopeMenuItemId,
          scopeCategoryId: autoPromotion.coupon.scopeCategoryId,
          scopeMenuItems: autoPromotion.coupon.scopeMenuItems,
          scopeCategories: autoPromotion.coupon.scopeCategories,
        };
      }
    }

    let totalBeforeBenefits = subtotal
      .plus(deliveryFee)
      .plus(serviceCharge.amount)
      .plus(tipAmount)
      .minus(discountAmount);

    if (totalBeforeBenefits.lessThan(new Prisma.Decimal(0))) {
      totalBeforeBenefits = new Prisma.Decimal(0);
    }

    const benefits = await this.loyaltyWalletService!.calculateQuoteBenefits({
      customerId: customer.customerId,
      tenantId: branch.tenantId,
      restaurantId: branch.restaurantId,
      branchId: branch.id,
      subtotal,
      totalBeforeBenefits,
      requestedWalletAmount: this.resolveRequestedWalletAmount(
        dto,
        totalBeforeBenefits,
      ),
      requestedLoyaltyPoints: dto.loyaltyPoints,
    });

    return {
      branch,
      customer,
      lines: pricedLines,
      subtotal: subtotal.toDecimalPlaces(2),
      taxAmount,
      deliveryFee: deliveryFee.toDecimalPlaces(2),
      serviceChargeType: serviceCharge.type,
      serviceChargeValue: serviceCharge.value,
      serviceChargeAmount: serviceCharge.amount,
      chargeBreakdown: await this.buildChargeBreakdown(
        pricedLines,
        settings.taxation.taxPercentage,
        taxAmount,
        serviceCharge,
      ),
      tipAmount,
      discountAmount: discountAmount.toDecimalPlaces(2),
      walletAppliedAmount: benefits.walletAppliedAmount,
      loyaltyDiscountAmount: benefits.loyaltyDiscountAmount,
      loyaltyPointsRedeemed: benefits.loyaltyPointsRedeemed,
      totalAmount: benefits.totalAmount,
      couponId,
      appliedCouponCode,
      appliedPromotion,
      orderTime,
    };
  }

  private async applyFixedDealPricingToQuoteLines(
    lines: QuoteLine[],
    restaurantId: string,
    branchId: string,
  ): Promise<QuoteLine[]> {
    const dealIds = [
      ...new Set(
        lines
          .map((line) => line.dealId)
          .filter((dealId): dealId is string => typeof dealId === 'string'),
      ),
    ];

    let pricedLines = lines;

    for (const dealId of dealIds) {
      const pricing =
        typeof this.couponsService.getActiveFixedPriceDealPricing === 'function'
          ? await this.couponsService.getActiveFixedPriceDealPricing(
              restaurantId,
              branchId,
              dealId,
            )
          : null;

      if (!pricing) {
        continue;
      }

      pricedLines = this.applyFixedDealPricingForDeal(
        pricedLines,
        dealId,
        pricing,
      );
    }

    return pricedLines;
  }

  private applyFixedDealPricingForDeal(
    lines: QuoteLine[],
    dealId: string,
    pricing: NonNullable<
      Awaited<ReturnType<CouponsService['getActiveFixedPriceDealPricing']>>
    >,
  ) {
    const dealGroups =
      pricing.selectionMode === CouponDealSelectionMode.FLEXIBLE_ITEMS
        ? this.findFlexibleDealQuoteGroups(lines, dealId, pricing)
        : this.findFixedDealQuoteLineGroups(lines, dealId, pricing);

    if (!dealGroups.length) {
      return lines;
    }

    const groupedQuantityByIndex = new Map<number, number>();
    const allocatedMerchandiseByIndex = new Map<number, Prisma.Decimal>();

    for (const dealGroup of dealGroups) {
      const fixedTotal = pricing.fixedPrice.mul(dealGroup.quantity);
      const merchandiseTotals = dealGroup.entries.map((entry) => {
        const line = lines[entry.index];
        const modifierTotal = this.sumQuoteLineModifierUnitTotal(line);
        const merchandiseUnitTotal = line.lineTotal
          .minus(line.depositAmount.mul(line.quantity))
          .minus(modifierTotal.mul(line.quantity))
          .div(line.quantity);

        return merchandiseUnitTotal.mul(entry.quantity);
      });
      const allocations = this.allocateFixedDealTotal(
        merchandiseTotals,
        fixedTotal,
      );

      dealGroup.entries.forEach((entry, allocationIndex) => {
        groupedQuantityByIndex.set(
          entry.index,
          (groupedQuantityByIndex.get(entry.index) ?? 0) + entry.quantity,
        );
        allocatedMerchandiseByIndex.set(
          entry.index,
          (
            allocatedMerchandiseByIndex.get(entry.index) ??
            new Prisma.Decimal(0)
          ).plus(allocations[allocationIndex]),
        );
      });
    }

    return lines.map((line, index) => {
      const groupedQuantity = groupedQuantityByIndex.get(index) ?? 0;
      const allocatedMerchandiseTotal = allocatedMerchandiseByIndex.get(index);
      if (!groupedQuantity || !allocatedMerchandiseTotal) {
        return line;
      }

      const modifierTotal = this.sumQuoteLineModifierUnitTotal(line);
      const rawMerchandiseTotal = line.lineTotal
        .minus(line.depositAmount.mul(line.quantity))
        .minus(modifierTotal.mul(line.quantity));
      const rawMerchandiseUnitTotal = rawMerchandiseTotal.div(line.quantity);
      const ungroupedQuantity = Math.max(line.quantity - groupedQuantity, 0);
      const merchandiseTotal = allocatedMerchandiseTotal.plus(
        rawMerchandiseUnitTotal.mul(ungroupedQuantity),
      );
      const lineTotal = merchandiseTotal
        .plus(modifierTotal.mul(line.quantity))
        .plus(line.depositAmount.mul(line.quantity))
        .toDecimalPlaces(2);
      const unitPrice = lineTotal
        .minus(line.depositAmount.mul(line.quantity))
        .div(line.quantity)
        .toDecimalPlaces(2);

      return {
        ...line,
        unitPrice,
        lineTotal,
      };
    });
  }

  private sumQuoteLineModifierUnitTotal(line: QuoteLine) {
    return (line.snapshotModifiers ?? []).reduce(
      (sum, modifier) =>
        sum.plus(new Prisma.Decimal(modifier.unitPrice).mul(modifier.quantity)),
      new Prisma.Decimal(0),
    );
  }

  private findFixedDealQuoteLineGroups(
    lines: QuoteLine[],
    dealId: string,
    pricing: NonNullable<
      Awaited<ReturnType<CouponsService['getActiveFixedPriceDealPricing']>>
    >,
  ): Array<{
    entries: Array<{ index: number; quantity: number }>;
    quantity: number;
  }> {
    const dealLineIndexes = this.findFixedDealQuoteLineIndexes(
      lines,
      dealId,
      pricing,
    );
    const dealQuantity = this.resolveFixedDealQuoteQuantity(
      lines,
      dealLineIndexes,
      pricing,
    );

    if (!dealLineIndexes.length || !dealQuantity) {
      return [];
    }

    return [
      {
        entries: dealLineIndexes.map((index) => ({
          index,
          quantity: lines[index].quantity,
        })),
        quantity: dealQuantity,
      },
    ];
  }

  private findFlexibleDealQuoteGroups(
    lines: QuoteLine[],
    dealId: string,
    pricing: NonNullable<
      Awaited<ReturnType<CouponsService['getActiveFixedPriceDealPricing']>>
    >,
  ): Array<{
    entries: Array<{ index: number; quantity: number }>;
    quantity: number;
  }> {
    const eligibleIndexes = lines.flatMap((line, index) =>
      line.dealId === dealId && this.isFlexibleDealQuoteLine(line, pricing)
        ? [index]
        : [],
    );

    if (!eligibleIndexes.length) {
      return [];
    }

    const compactEntries = (indexes: number[]) => {
      const counts = new Map<number, number>();
      indexes.forEach((index) =>
        counts.set(index, (counts.get(index) ?? 0) + 1),
      );

      return [...counts.entries()]
        .map(([index, quantity]) => ({ index, quantity }))
        .sort((left, right) => left.index - right.index);
    };
    const unitsForIndexes = (indexes: number[]) =>
      indexes.flatMap((index) =>
        Array.from({ length: lines[index].quantity }, () => index),
      );
    const categoryScopes = pricing.categoryScopes.filter(
      (scope) => scope.itemLimit && scope.itemLimit > 0,
    );

    if (categoryScopes.length) {
      const unitsByScope = categoryScopes.map((scope) =>
        unitsForIndexes(
          eligibleIndexes.filter((index) =>
            this.quoteLineMatchesDealCategoryScope(lines[index], scope),
          ),
        ),
      );

      if (unitsByScope.some((scopeUnits) => !scopeUnits.length)) {
        return [];
      }

      const groupCount = Math.min(
        ...unitsByScope.map((scopeUnits, scopeIndex) =>
          Math.floor(
            scopeUnits.length / (categoryScopes[scopeIndex].itemLimit ?? 1),
          ),
        ),
      );

      return Array.from({ length: groupCount }, (_, groupIndex) => {
        const groupUnits = unitsByScope.flatMap((scopeUnits, scopeIndex) => {
          const itemLimit = categoryScopes[scopeIndex].itemLimit ?? 1;
          const start = groupIndex * itemLimit;
          return scopeUnits.slice(start, start + itemLimit);
        });

        return {
          entries: compactEntries(groupUnits),
          quantity: 1,
        };
      }).filter((group) => group.entries.length > 0);
    }

    const requiredQuantity = pricing.requiredQuantity ?? 0;
    if (requiredQuantity < 1) {
      return [];
    }

    const units = unitsForIndexes(eligibleIndexes);
    const groupCount = Math.floor(units.length / requiredQuantity);

    return Array.from({ length: groupCount }, (_, groupIndex) => {
      const start = groupIndex * requiredQuantity;
      return {
        entries: compactEntries(units.slice(start, start + requiredQuantity)),
        quantity: 1,
      };
    }).filter((group) => group.entries.length > 0);
  }

  private findFixedDealQuoteLineIndexes(
    lines: QuoteLine[],
    dealId: string,
    pricing: NonNullable<
      Awaited<ReturnType<CouponsService['getActiveFixedPriceDealPricing']>>
    >,
  ) {
    if (pricing.selectionMode === CouponDealSelectionMode.FLEXIBLE_ITEMS) {
      return lines.flatMap((line, index) =>
        line.dealId === dealId && this.isFlexibleDealQuoteLine(line, pricing)
          ? [index]
          : [],
      );
    }

    const requiredItemIds = new Set(pricing.menuItemIds);
    return lines.flatMap((line, index) =>
      line.dealId === dealId && requiredItemIds.has(line.menuItemId)
        ? [index]
        : [],
    );
  }

  private resolveFixedDealQuoteQuantity(
    lines: QuoteLine[],
    dealLineIndexes: number[],
    pricing: NonNullable<
      Awaited<ReturnType<CouponsService['getActiveFixedPriceDealPricing']>>
    >,
  ) {
    if (!dealLineIndexes.length) {
      return 0;
    }

    if (pricing.selectionMode === CouponDealSelectionMode.FLEXIBLE_ITEMS) {
      return this.resolveFlexibleDealQuoteQuantity(
        dealLineIndexes.map((index) => lines[index]),
        pricing,
      );
    }

    const presentItemIds = new Set(
      dealLineIndexes.map((index) => lines[index].menuItemId),
    );
    const isComplete = pricing.menuItemIds.every((menuItemId) =>
      presentItemIds.has(menuItemId),
    );
    const firstQuantity = lines[dealLineIndexes[0]]?.quantity;
    const hasSingleQuantity =
      firstQuantity !== undefined &&
      dealLineIndexes.every((index) => lines[index].quantity === firstQuantity);

    return isComplete && hasSingleQuantity && firstQuantity ? firstQuantity : 0;
  }

  private resolveFlexibleDealQuoteQuantity(
    lines: QuoteLine[],
    pricing: NonNullable<
      Awaited<ReturnType<CouponsService['getActiveFixedPriceDealPricing']>>
    >,
  ) {
    const categoryScopes = pricing.categoryScopes.filter(
      (scope) => scope.itemLimit && scope.itemLimit > 0,
    );

    if (categoryScopes.length) {
      const quantities = categoryScopes.map((scope) => {
        const selectedQuantity = lines
          .filter((line) => this.quoteLineMatchesDealCategoryScope(line, scope))
          .reduce((sum, line) => sum + line.quantity, 0);

        return Math.floor(selectedQuantity / (scope.itemLimit ?? 1));
      });

      return quantities.length ? Math.min(...quantities) : 0;
    }

    const requiredQuantity = pricing.requiredQuantity ?? 0;
    if (requiredQuantity < 1) {
      return 0;
    }

    const selectedQuantity = lines.reduce(
      (sum, line) => sum + line.quantity,
      0,
    );

    return Math.floor(selectedQuantity / requiredQuantity);
  }

  private quoteLineMatchesDealCategoryScope(
    line: QuoteLine,
    scope: {
      menuCategoryId: string;
      menuItemIds?: string[];
    },
  ) {
    if (!line.categoryIds.includes(scope.menuCategoryId)) {
      return false;
    }

    return (
      !scope.menuItemIds?.length || scope.menuItemIds.includes(line.menuItemId)
    );
  }

  private isFlexibleDealQuoteLine(
    line: QuoteLine,
    pricing: NonNullable<
      Awaited<ReturnType<CouponsService['getActiveFixedPriceDealPricing']>>
    >,
  ) {
    return (
      pricing.menuItemIds.includes(line.menuItemId) ||
      pricing.categoryScopes.some((scope) =>
        this.quoteLineMatchesDealCategoryScope(line, scope),
      )
    );
  }

  private resolveQuoteTaxAmount(
    lines: QuoteLine[],
    fallbackTaxPercentage: number,
  ) {
    return lines
      .reduce((sum, line) => {
        const taxPercentage =
          line.taxPercentage ?? new Prisma.Decimal(fallbackTaxPercentage);

        return sum.plus(line.lineTotal.mul(taxPercentage).div(100));
      }, new Prisma.Decimal(0))
      .toDecimalPlaces(2);
  }

  private allocateFixedDealTotal(
    currentTotals: Prisma.Decimal[],
    fixedTotal: Prisma.Decimal,
  ) {
    if (!currentTotals.length) {
      return [];
    }

    const currentSubtotal = currentTotals.reduce(
      (sum, total) => sum.plus(total),
      new Prisma.Decimal(0),
    );
    const allocations: Prisma.Decimal[] = [];
    let allocated = new Prisma.Decimal(0);

    currentTotals.forEach((currentTotal, index) => {
      if (index === currentTotals.length - 1) {
        allocations.push(fixedTotal.minus(allocated).toDecimalPlaces(2));
        return;
      }

      const allocation = currentSubtotal.greaterThan(0)
        ? fixedTotal.mul(currentTotal).div(currentSubtotal).toDecimalPlaces(2)
        : fixedTotal.div(currentTotals.length).toDecimalPlaces(2);
      allocations.push(allocation);
      allocated = allocated.plus(allocation);
    });

    return allocations;
  }

  private resolveRequestedWalletAmount(
    dto: Pick<CreateOrderDto | QuoteOrderDto, 'walletAmount'> & {
      paymentMethod?: string;
    },
    totalBeforeBenefits: Prisma.Decimal,
  ) {
    if (dto.paymentMethod === PaymentMethodEnum.WALLET) {
      return Number(totalBeforeBenefits.toDecimalPlaces(2));
    }

    return dto.walletAmount;
  }

  private async resolveRestaurantCurrency(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { settings: true },
    });

    return (
      (await this.globalSettingsService?.getDefaultCurrencyCode()) ??
      this.readRestaurantCurrency(restaurant?.settings) ??
      'PKR'
    );
  }

  private readRestaurantCurrency(
    settings: Prisma.JsonValue | null | undefined,
  ) {
    return (
      this.readFirstJsonString(settings, [
        ['currency'],
        ['customerApp', 'currency'],
        ['checkout', 'currency'],
        ['payments', 'currency'],
        ['defaultCurrency'],
      ])?.toUpperCase() ?? null
    );
  }

  private readFirstJsonString(
    source: Prisma.JsonValue | null | undefined,
    paths: string[][],
  ) {
    for (const path of paths) {
      let current: unknown = source;

      for (const key of path) {
        if (!current || typeof current !== 'object' || Array.isArray(current)) {
          current = null;
          break;
        }

        current = (current as Record<string, unknown>)[key];
      }

      if (typeof current === 'string' && current.trim().length > 0) {
        return current.trim();
      }
    }

    return null;
  }

  private buildAmountSummary(amounts: {
    subtotal: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
    deliveryFee: Prisma.Decimal;
    serviceChargeAmount?: Prisma.Decimal;
    tipAmount?: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    loyaltyDiscountAmount?: Prisma.Decimal;
    walletAppliedAmount?: Prisma.Decimal;
    payableAmount: Prisma.Decimal;
  }) {
    const loyaltyDiscountAmount =
      amounts.loyaltyDiscountAmount ?? new Prisma.Decimal(0);
    const walletAppliedAmount =
      amounts.walletAppliedAmount ?? new Prisma.Decimal(0);
    const serviceChargeAmount =
      amounts.serviceChargeAmount ?? new Prisma.Decimal(0);
    const tipAmount = amounts.tipAmount ?? new Prisma.Decimal(0);

    return {
      subtotal: Number(amounts.subtotal),
      taxAmount: Number(amounts.taxAmount),
      deliveryFee: Number(amounts.deliveryFee),
      serviceChargeAmount: Number(serviceChargeAmount),
      transactionFeeAmount: 0,
      tipAmount: Number(tipAmount),
      discountAmount: Number(amounts.discountAmount),
      hasDiscount: amounts.discountAmount.greaterThan(0),
      totalBeforeDiscount: Number(
        amounts.payableAmount
          .plus(walletAppliedAmount)
          .plus(amounts.discountAmount),
      ),
      loyaltyDiscountAmount: Number(loyaltyDiscountAmount),
      walletAppliedAmount: Number(walletAppliedAmount),
      totalAmount: Number(amounts.payableAmount.plus(walletAppliedAmount)),
      payableAmount: Number(amounts.payableAmount),
    };
  }

  private assertWalletPaymentCoverage(
    paymentMethod: string,
    quote: Awaited<ReturnType<OrdersService['buildQuote']>>,
  ) {
    if (paymentMethod !== 'WALLET') {
      return;
    }

    if (quote.totalAmount.greaterThan(0)) {
      throw new BadRequestException(
        'Insufficient wallet balance for wallet payment',
      );
    }
  }

  private resolveInitialOrderStatus(paymentMethod: PaymentMethodEnum) {
    return paymentMethod === PaymentMethodEnum.STRIPE
      ? OrderStatus.PAYMENT_PENDING
      : OrderStatus.PLACED;
  }

  private resolveInitialPaymentStatus(
    paymentMethod: string,
    quote: Awaited<ReturnType<OrdersService['buildQuote']>>,
  ) {
    if (
      paymentMethod === 'WALLET' &&
      quote.totalAmount.equals(0) &&
      quote.walletAppliedAmount.greaterThan(0)
    ) {
      return PaymentStatus.PAID;
    }

    return PaymentStatus.PENDING;
  }

  private resolvePaymentTransactionAmount(
    paymentMethod: string,
    quote: Awaited<ReturnType<OrdersService['buildQuote']>>,
  ) {
    if (paymentMethod === 'WALLET') {
      return quote.walletAppliedAmount;
    }

    return quote.totalAmount;
  }

  private toQuoteResponseData(
    quote: Awaited<ReturnType<OrdersService['buildQuote']>>,
    dto: QuoteOrderDto,
  ) {
    const amountSummary = this.buildAmountSummary({
      subtotal: quote.subtotal,
      taxAmount: quote.taxAmount,
      deliveryFee: quote.deliveryFee,
      serviceChargeAmount: quote.serviceChargeAmount,
      tipAmount: quote.tipAmount,
      discountAmount: quote.discountAmount,
      loyaltyDiscountAmount: quote.loyaltyDiscountAmount,
      walletAppliedAmount: quote.walletAppliedAmount,
      payableAmount: quote.totalAmount,
    });

    return {
      branchId: quote.branch.id,
      restaurantId: quote.branch.restaurantId,
      customerId: quote.customer.customerId,
      orderType: dto.orderType,
      orderTime: quote.orderTime,
      isScheduled: quote.orderTime
        ? this.isScheduledOrderTime(quote.orderTime)
        : false,
      subtotal: amountSummary.subtotal,
      taxAmount: amountSummary.taxAmount,
      deliveryFee: amountSummary.deliveryFee,
      serviceChargeType: quote.serviceChargeType,
      serviceChargeValue: quote.serviceChargeValue
        ? Number(quote.serviceChargeValue)
        : null,
      serviceChargeAmount: amountSummary.serviceChargeAmount,
      transactionFeeType: null,
      transactionFeeValue: null,
      transactionFeeAmount: 0,
      chargeBreakdown: quote.chargeBreakdown,
      tipAmount: amountSummary.tipAmount,
      discountAmount: amountSummary.discountAmount,
      walletAppliedAmount: amountSummary.walletAppliedAmount,
      loyaltyDiscountAmount: amountSummary.loyaltyDiscountAmount,
      loyaltyPointsRedeemed: quote.loyaltyPointsRedeemed,
      totalAmount: amountSummary.totalAmount,
      payableAmount: amountSummary.payableAmount,
      couponCode: quote.appliedCouponCode,
      appliedPromotion: quote.appliedPromotion
        ? this.toAppliedPromotionQuoteResponse(quote.appliedPromotion)
        : null,
      restaurantMenuId: dto.restaurantMenuId ?? null,
      items: quote.lines.map((line) => ({
        menuItemId: line.menuItemId,
        menuItemName: line.menuItemName,
        dealId: line.dealId,
        variationId: line.variationId,
        variationName: line.variationName,
        quantity: line.quantity,
        depositAmount: Number(line.depositAmount),
        unitPrice: Number(line.unitPrice),
        lineTotal: Number(line.lineTotal),
        taxTypeCode: line.taxTypeCode ?? null,
        taxPercentage: line.taxPercentage ? Number(line.taxPercentage) : null,
        note: line.note,
        snapshotModifiers: line.snapshotModifiers,
        snapshotSections: line.snapshotSections,
        ...this.resolveQuoteLineDiscountMetadata(line, quote.appliedPromotion),
      })),
    };
  }

  private toAppliedPromotionQuoteResponse(
    promotion: AppliedPromotionQuoteMetadata,
  ) {
    return {
      id: promotion.id,
      title: promotion.title,
      applyMode: promotion.applyMode,
      autoApply: promotion.autoApply,
      discountType: promotion.discountType,
      discountValue: promotion.discountValue,
      discountAmount: promotion.discountAmount,
    };
  }

  private resolveQuoteLineDiscountMetadata(
    line: QuoteLine,
    promotion: AppliedPromotionQuoteMetadata | undefined,
  ) {
    const empty = {
      promotion: null,
      happyHour: null,
      promotionDiscountAmount: 0,
      discountedUnitPrice: null,
      discountedLineTotal: null,
    };

    if (
      !promotion ||
      promotion.discountAmount <= 0 ||
      !this.quoteLineMatchesPromotion(line, promotion)
    ) {
      return empty;
    }

    const discountAmount = this.resolveQuoteLineDiscountAmount(line, promotion);

    if (discountAmount.lessThanOrEqualTo(0)) {
      return empty;
    }

    const discountedLineTotal = Prisma.Decimal.max(
      line.lineTotal.minus(discountAmount),
      new Prisma.Decimal(0),
    ).toDecimalPlaces(2);
    const discountedUnitPrice = discountedLineTotal
      .div(Math.max(1, line.quantity))
      .toDecimalPlaces(2);
    const payload = {
      promotionId: promotion.id,
      id: promotion.id,
      title: promotion.title,
      applyMode: promotion.applyMode,
      discountType: promotion.discountType,
      discountValue: promotion.discountValue,
      discountAmount: Number(discountAmount.toDecimalPlaces(2)),
      discountedLineTotal: Number(discountedLineTotal),
    };

    return {
      promotion:
        promotion.kind === CouponCampaignKind.HAPPY_HOUR ? null : payload,
      happyHour:
        promotion.kind === CouponCampaignKind.HAPPY_HOUR ? payload : null,
      promotionDiscountAmount: Number(discountAmount.toDecimalPlaces(2)),
      discountedUnitPrice: Number(discountedUnitPrice),
      discountedLineTotal: Number(discountedLineTotal),
    };
  }

  private quoteLineMatchesPromotion(
    line: QuoteLine,
    promotion: AppliedPromotionQuoteMetadata,
  ) {
    const menuItemIds = this.collectPromotionMenuItemIds(promotion);
    const categoryIds = this.collectPromotionCategoryIds(promotion);

    if (!menuItemIds.length && !categoryIds.length) {
      return true;
    }

    return (
      menuItemIds.includes(line.menuItemId) ||
      line.categoryIds.some((categoryId) => categoryIds.includes(categoryId))
    );
  }

  private collectPromotionMenuItemIds(
    promotion: AppliedPromotionQuoteMetadata,
  ) {
    return [
      ...new Set([
        ...(promotion.scopeMenuItemId ? [promotion.scopeMenuItemId] : []),
        ...(promotion.scopeMenuItems ?? [])
          .map((entry) => entry.menuItem?.id)
          .filter((id): id is string => typeof id === 'string'),
      ]),
    ];
  }

  private collectPromotionCategoryIds(
    promotion: AppliedPromotionQuoteMetadata,
  ) {
    return [
      ...new Set([
        ...(promotion.scopeCategoryId ? [promotion.scopeCategoryId] : []),
        ...(promotion.scopeCategories ?? [])
          .map((entry) => entry.menuCategory?.id)
          .filter((id): id is string => typeof id === 'string'),
      ]),
    ];
  }

  private resolveQuoteLineDiscountAmount(
    line: QuoteLine,
    promotion: AppliedPromotionQuoteMetadata,
  ) {
    if (line.dealId) {
      return new Prisma.Decimal(0);
    }

    if (promotion.applyMode === 'ORDER_TOTAL') {
      return this.resolveProportionalQuoteLineDiscount(line, promotion);
    }

    if (promotion.discountType === 'FLAT') {
      return Prisma.Decimal.min(
        line.lineTotal,
        new Prisma.Decimal(promotion.discountValue).mul(
          Math.max(1, line.quantity),
        ),
      ).toDecimalPlaces(2);
    }

    if (promotion.discountType === 'FIXED_PRICE') {
      return Prisma.Decimal.max(
        line.lineTotal.minus(promotion.discountValue),
        new Prisma.Decimal(0),
      ).toDecimalPlaces(2);
    }

    return this.resolveProportionalQuoteLineDiscount(line, promotion);
  }

  private resolveProportionalQuoteLineDiscount(
    line: QuoteLine,
    promotion: AppliedPromotionQuoteMetadata,
  ) {
    if (promotion.discountType === 'PERCENTAGE') {
      return Prisma.Decimal.min(
        line.lineTotal,
        line.lineTotal.mul(promotion.discountValue).div(100),
      ).toDecimalPlaces(2);
    }

    return Prisma.Decimal.min(
      line.lineTotal,
      new Prisma.Decimal(promotion.discountValue),
    ).toDecimalPlaces(2);
  }

  private resolveOrderItemBasePrice(
    menuItem: {
      [key: string]: unknown;
      id: string;
      basePrice: Prisma.Decimal;
      variations: Array<{
        id: string;
        name?: string;
        price: Prisma.Decimal;
      }>;
    },
    branchPriceOverride: Prisma.Decimal | null | undefined,
    variationId?: string,
  ) {
    if (variationId) {
      return this.resolveVariationPrice(
        menuItem.variations as Array<{
          id: string;
          name: string;
          price: Prisma.Decimal;
          itemPriceOverrides?: Array<{
            menuItemId: string;
            price: Prisma.Decimal;
            pickupPrice: Prisma.Decimal | null;
            displayText: string | null;
          }>;
        }>,
        variationId,
        branchPriceOverride ?? menuItem.basePrice,
        menuItem.id,
        undefined,
      );
    }

    return branchPriceOverride ?? menuItem.basePrice;
  }

  private resolveOrderTypePriceAdjustment(
    menuItem: {
      [key: string]: unknown;
      pricingMode?: string | null;
      deliveryPriceAdjustment?: Prisma.Decimal | null;
      takeawayPriceAdjustment?: Prisma.Decimal | null;
    },
    orderType: OrderTypeEnum,
  ) {
    if (menuItem.pricingMode !== 'MULTIPLE') {
      return new Prisma.Decimal(0);
    }

    if (orderType === OrderTypeEnum.DELIVERY) {
      return menuItem.deliveryPriceAdjustment ?? new Prisma.Decimal(0);
    }

    if (orderType === OrderTypeEnum.TAKEAWAY) {
      return menuItem.takeawayPriceAdjustment ?? new Prisma.Decimal(0);
    }

    return new Prisma.Decimal(0);
  }

  private resolveQuoteOrderTime(dto: QuoteOrderDto) {
    if (dto.orderTime) {
      this.assertValidOrderTime(dto.orderTime);
      return dto.orderTime;
    }

    return dto.orderType === OrderTypeEnum.DELIVERY
      ? new Date().toISOString()
      : null;
  }

  private assertValidOrderTime(orderTime: string) {
    const date = new Date(orderTime);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('orderTime must be a valid ISO datetime');
    }
  }

  private isScheduledOrderTime(orderTime: string | Date) {
    const scheduledAt =
      orderTime instanceof Date ? orderTime : new Date(orderTime);
    return scheduledAt.getTime() > Date.now();
  }

  private async resolveSelectedRestaurantMenu(
    restaurantId: string,
    restaurantMenuId: string,
    orderTime: string,
  ) {
    const menu = await this.prisma.restaurantMenu.findFirst({
      where: {
        id: restaurantMenuId,
        restaurantId,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        isTimed: true,
        timingConfig: true,
        items: {
          where: { isActive: true },
          select: { menuItemId: true },
        },
        categories: {
          select: { menuCategoryId: true },
        },
      },
    });

    if (!menu) {
      throw new BadRequestException('Selected menu not found or inactive');
    }

    if (
      menu.isTimed &&
      !isRestaurantMenuAvailableAt(menu.timingConfig, orderTime)
    ) {
      throw new BadRequestException(
        'Selected menu is not available at requested order time',
      );
    }

    return {
      id: menu.id,
      directItemIds: new Set(menu.items.map((item) => item.menuItemId)),
      categoryIds: new Set(
        menu.categories.map((category) => category.menuCategoryId),
      ),
    };
  }

  private itemMatchesMenuCategories(
    item: {
      category: { id: string };
      categoryLinks?: Array<{ menuCategoryId: string }>;
    },
    categoryIds: Set<string>,
  ) {
    return this.itemCategoryIds(item).some((categoryId) =>
      categoryIds.has(categoryId),
    );
  }

  private itemCategoryIds(item: {
    category: { id: string };
    categoryLinks?: Array<{ menuCategoryId: string }>;
  }) {
    return [
      item.category.id,
      ...(item.categoryLinks ?? []).map((link) => link.menuCategoryId),
    ];
  }

  private toOrderMutationResponse<
    T extends {
      tenantId?: string | null;
      deliveryOtp?: string | null;
      subtotal?: Prisma.Decimal;
      taxAmount?: Prisma.Decimal;
      deliveryFee?: Prisma.Decimal;
      discountAmount?: Prisma.Decimal;
      loyaltyDiscountAmount?: Prisma.Decimal;
      walletAppliedAmount?: Prisma.Decimal;
      totalAmount?: Prisma.Decimal;
    },
  >(
    order: T,
  ): Omit<T, 'tenantId' | 'deliveryOtp'> & { payableAmount?: number } {
    const rest = { ...order } as T & {
      tenantId?: string | null;
      deliveryOtp?: string | null;
    };
    delete rest.tenantId;
    delete rest.deliveryOtp;

    const payableAmount = rest.totalAmount;
    if (
      rest.subtotal === undefined ||
      rest.taxAmount === undefined ||
      rest.deliveryFee === undefined ||
      rest.discountAmount === undefined ||
      rest.loyaltyDiscountAmount === undefined ||
      rest.walletAppliedAmount === undefined ||
      payableAmount === undefined
    ) {
      return rest;
    }

    return {
      ...rest,
      ...this.buildAmountSummary({
        subtotal: rest.subtotal,
        taxAmount: rest.taxAmount,
        deliveryFee: rest.deliveryFee,
        discountAmount: rest.discountAmount,
        loyaltyDiscountAmount: rest.loyaltyDiscountAmount,
        walletAppliedAmount: rest.walletAppliedAmount,
        payableAmount,
      }),
    };
  }

  private async toOrderListResponse(order: {
    id: string;
    branchId: string;
    customerId: string;
    orderType: OrderType;
    paymentMethod: string;
    orderTime?: Date | null;
    isScheduled?: boolean;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    subtotal: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
    deliveryFee: Prisma.Decimal;
    serviceChargeType?: ServiceChargeType | null;
    serviceChargeValue?: Prisma.Decimal | null;
    serviceChargeAmount: Prisma.Decimal;
    tipAmount: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    walletAppliedAmount: Prisma.Decimal;
    loyaltyDiscountAmount: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
    customerNote: string | null;
    createdAt: Date;
    updatedAt: Date;
    restaurant: {
      id: string;
      name: string;
      slug: string;
      logoUrl: string | null;
      coverImage: string | null;
    };
    branch: {
      id: string;
      name: string;
      logoUrl: string | null;
      coverImage: string | null;
    };
    coupon: { id: string; code: string; title: string } | null;
    customer: {
      id: string;
      email: string;
      isGuest?: boolean;
      profile: {
        firstName: string;
        lastName: string;
        phone: string | null;
        avatarUrl: string | null;
        metadata?: Prisma.JsonValue | null;
      } | null;
    };
    deliveryAddress: {
      id: string;
      street: string;
      area: string | null;
      postalCode: string | null;
      city: string;
      state: string;
      country: string;
      lat: Prisma.Decimal | null;
      lng: Prisma.Decimal | null;
    } | null;
    deliveryman: {
      id: string;
      firstName: string;
      lastName: string;
      phone: string;
      status: string;
    } | null;
    items: Array<{
      id: string;
      menuItemId: string;
      menuItemName: string;
      variationId: string | null;
      variationName: string | null;
      unitPrice: Prisma.Decimal;
      quantity: number;
      lineTotal: Prisma.Decimal;
      depositAmount: Prisma.Decimal;
      note: string | null;
      snapshotModifiers: Prisma.JsonValue | null;
      menuItem: { imageUrl: string | null } | null;
    }>;
    sourceGroupOrder?: {
      id: string;
      inviteCode: string;
      hostUserId: string;
      status: string;
      participants: Array<{
        id: string;
        userId: string;
        isHost: boolean;
        status: string;
        joinedAt: Date;
        leftAt: Date | null;
        user: {
          id: string;
          email: string;
          isGuest: boolean;
          profile: {
            firstName: string;
            lastName: string;
            phone: string | null;
            avatarUrl: string | null;
          } | null;
        };
      }>;
      items: Array<{
        id: string;
        participantId: string;
        menuItemId: string;
        variationId: string | null;
        quantity: number;
        note: string | null;
        modifiers: Prisma.JsonValue | null;
        createdAt: Date;
        updatedAt: Date;
      }>;
    } | null;
  }) {
    const groupParticipants = await this.toGroupOrderParticipantsWithItems(
      order.sourceGroupOrder,
      order.branchId,
    );

    return {
      id: order.id,
      branchId: order.branchId,
      customerId: order.customerId,
      orderType: order.orderType,
      paymentMethod: order.paymentMethod,
      orderTime: order.orderTime ?? null,
      isScheduled:
        order.isScheduled ??
        (order.orderTime ? this.isScheduledOrderTime(order.orderTime) : false),
      status: order.status,
      paymentStatus: order.paymentStatus,
      ...this.buildAmountSummary({
        subtotal: order.subtotal,
        taxAmount: order.taxAmount,
        deliveryFee: order.deliveryFee,
        serviceChargeAmount: order.serviceChargeAmount,
        tipAmount: order.tipAmount,
        discountAmount: order.discountAmount,
        loyaltyDiscountAmount: order.loyaltyDiscountAmount,
        walletAppliedAmount: order.walletAppliedAmount,
        payableAmount: order.totalAmount,
      }),
      serviceChargeType: order.serviceChargeType ?? null,
      serviceChargeValue: order.serviceChargeValue
        ? Number(order.serviceChargeValue)
        : null,
      transactionFeeType: null,
      transactionFeeValue: null,
      customerNote: order.customerNote,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      restaurant: order.restaurant,
      branch: order.branch,
      coupon: order.coupon,
      customer: this.toCustomerSummary(order.customer),
      deliveryAddress: order.deliveryAddress
        ? this.toCustomerAddressResponse(order.deliveryAddress)
        : null,
      deliveryman: order.deliveryman,
      isGroupOrder: Boolean(order.sourceGroupOrder),
      groupOrderSessionId: order.sourceGroupOrder?.id ?? null,
      groupOrderInviteCode: order.sourceGroupOrder?.inviteCode ?? null,
      participantCount: groupParticipants.length,
      participants: groupParticipants,
      itemCount: order.items.length,
      itemsPreview: order.items.map((item) => ({
        id: item.id,
        menuItemId: item.menuItemId,
        menuItemName: item.menuItemName,
        imageUrl: item.menuItem?.imageUrl ?? null,
        variationId: item.variationId,
        variationName: item.variationName,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        depositAmount: Number(item.depositAmount),
        lineTotal: Number(item.lineTotal),
        note: item.note,
        dealId: this.readSnapshotDealId(item.snapshotModifiers),
        itemType: this.readSnapshotDealId(item.snapshotModifiers)
          ? 'DEAL'
          : 'ITEM',
        snapshotModifiers: this.readSnapshotModifiers(item.snapshotModifiers),
        snapshotSections: this.readSnapshotSections(item.snapshotModifiers),
      })),
      displayItems: this.buildOrderDisplayItems(order.items),
    };
  }

  private async toOrderDetailsResponse(
    order: {
      id: string;
      tenantId: string;
      restaurantId: string;
      branchId: string;
      customerId: string;
      couponId: string | null;
      deliveryAddressId: string | null;
      deliverymanId: string | null;
      deliveryOtp: string | null;
      orderType: OrderType;
      paymentMethod: string;
      orderTime?: Date | null;
      isScheduled?: boolean;
      status: OrderStatus;
      paymentStatus: PaymentStatus;
      subtotal: Prisma.Decimal;
      taxAmount: Prisma.Decimal;
      deliveryFee: Prisma.Decimal;
      serviceChargeType?: ServiceChargeType | null;
      serviceChargeValue?: Prisma.Decimal | null;
      serviceChargeAmount: Prisma.Decimal;
      tipAmount: Prisma.Decimal;
      discountAmount: Prisma.Decimal;
      walletAppliedAmount: Prisma.Decimal;
      loyaltyDiscountAmount: Prisma.Decimal;
      totalAmount: Prisma.Decimal;
      customerNote: string | null;
      assignedAt: Date | null;
      deliveredAt: Date | null;
      paidAt: Date | null;
      cancelledAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      restaurant: {
        id: string;
        name: string;
        slug: string;
        logoUrl: string | null;
        coverImage: string | null;
      };
      branch: {
        id: string;
        name: string;
        logoUrl: string | null;
        coverImage: string | null;
        settings?: Prisma.JsonValue | null;
      };
      coupon: { id: string; code: string; title: string } | null;
      customer: {
        id: string;
        email: string;
        isGuest?: boolean;
        profile: {
          firstName: string;
          lastName: string;
          phone: string | null;
          avatarUrl: string | null;
          metadata?: Prisma.JsonValue | null;
        } | null;
      };
      deliveryAddress: {
        id: string;
        street: string;
        area: string | null;
        postalCode: string | null;
        city: string;
        state: string;
        country: string;
        lat: Prisma.Decimal | null;
        lng: Prisma.Decimal | null;
      } | null;
      deliveryman: {
        id: string;
        firstName: string;
        lastName: string;
        phone: string;
        status: string;
        vehicleType: string | null;
        vehicleNumber: string | null;
      } | null;
      transactions: Array<{
        id: string;
        paymentMethod: string;
        type: PaymentTransactionType;
        status: PaymentStatus;
        amount: Prisma.Decimal;
        currency: string;
        providerRef: string | null;
        note: string | null;
        processedAt: Date | null;
        createdAt: Date;
      }>;
      sourceGroupOrder?: {
        id: string;
        inviteCode: string;
        hostUserId: string;
        status: string;
        participants: Array<{
          id: string;
          userId: string;
          isHost: boolean;
          status: string;
          joinedAt: Date;
          leftAt: Date | null;
          user: {
            id: string;
            email: string;
            isGuest: boolean;
            profile: {
              firstName: string;
              lastName: string;
              phone: string | null;
              avatarUrl: string | null;
            } | null;
          };
        }>;
        items: Array<{
          id: string;
          participantId: string;
          menuItemId: string;
          variationId: string | null;
          quantity: number;
          note: string | null;
          modifiers: Prisma.JsonValue | null;
          createdAt: Date;
          updatedAt: Date;
        }>;
      } | null;
      items: Array<{
        id: string;
        menuItemId: string;
        menuItemName: string;
        variationId: string | null;
        variationName: string | null;
        unitPrice: Prisma.Decimal;
        depositAmount: Prisma.Decimal;
        quantity: number;
        lineTotal: Prisma.Decimal;
        note: string | null;
        snapshotModifiers: Prisma.JsonValue | null;
        menuItem: {
          id: string;
          slug: string;
          imageUrl: string | null;
          category: { id: string; name: string; imageUrl: string | null };
        };
      }>;
    },
    includeDeliveryOtp = false,
  ) {
    const groupParticipants = await this.toGroupOrderParticipantsWithItems(
      order.sourceGroupOrder,
      order.branchId,
    );
    const availablePaymentMethods = this.readBranchSettings(
      order.branch.settings,
    ).allowedPaymentMethods;
    const branch = {
      id: order.branch.id,
      name: order.branch.name,
      logoUrl: order.branch.logoUrl,
      coverImage: order.branch.coverImage,
    };

    return {
      id: order.id,
      restaurantId: order.restaurantId,
      branchId: order.branchId,
      customerId: order.customerId,
      couponId: order.couponId,
      deliveryAddressId: order.deliveryAddressId,
      deliverymanId: order.deliverymanId,
      deliveryOtp: includeDeliveryOtp ? order.deliveryOtp : null,
      orderType: order.orderType,
      paymentMethod: order.paymentMethod,
      orderTime: order.orderTime ?? null,
      isScheduled:
        order.isScheduled ??
        (order.orderTime ? this.isScheduledOrderTime(order.orderTime) : false),
      status: order.status,
      paymentStatus: order.paymentStatus,
      ...this.buildAmountSummary({
        subtotal: order.subtotal,
        taxAmount: order.taxAmount,
        deliveryFee: order.deliveryFee,
        serviceChargeAmount: order.serviceChargeAmount,
        tipAmount: order.tipAmount,
        discountAmount: order.discountAmount,
        loyaltyDiscountAmount: order.loyaltyDiscountAmount,
        walletAppliedAmount: order.walletAppliedAmount,
        payableAmount: order.totalAmount,
      }),
      serviceChargeType: order.serviceChargeType ?? null,
      serviceChargeValue: order.serviceChargeValue
        ? Number(order.serviceChargeValue)
        : null,
      transactionFeeType: null,
      transactionFeeValue: null,
      customerNote: order.customerNote,
      assignedAt: order.assignedAt,
      deliveredAt: order.deliveredAt,
      paidAt: order.paidAt,
      cancelledAt: order.cancelledAt,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      restaurant: order.restaurant,
      branch,
      coupon: order.coupon,
      customer: this.toCustomerSummary(order.customer),
      availablePaymentMethods,
      paymentOptions: {
        selected: order.paymentMethod,
        available: availablePaymentMethods,
      },
      isGroupOrder: Boolean(order.sourceGroupOrder),
      groupOrderSessionId: order.sourceGroupOrder?.id ?? null,
      groupOrderInviteCode: order.sourceGroupOrder?.inviteCode ?? null,
      participantCount: groupParticipants.length,
      participants: groupParticipants,
      itemCount: order.items.length,
      itemsPreview: order.items.map((item) => ({
        id: item.id,
        menuItemId: item.menuItemId,
        menuItemName: item.menuItemName,
        imageUrl: item.menuItem?.imageUrl ?? null,
        variationId: item.variationId ?? '',
        variationName: item.variationName,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        depositAmount: Number(item.depositAmount),
        lineTotal: Number(item.lineTotal),
        note: item.note,
        dealId: this.readSnapshotDealId(item.snapshotModifiers),
        itemType: this.readSnapshotDealId(item.snapshotModifiers)
          ? 'DEAL'
          : 'ITEM',
        snapshotModifiers: this.readSnapshotModifiers(item.snapshotModifiers),
        snapshotSections: this.readSnapshotSections(item.snapshotModifiers),
      })),
      displayItems: this.buildOrderDisplayItems(order.items),
      deliveryAddress: order.deliveryAddress
        ? this.toCustomerAddressResponse(order.deliveryAddress)
        : null,
      deliveryman: order.deliveryman,
      transactions: order.transactions.map((transaction) => ({
        ...transaction,
        amount: Number(transaction.amount),
      })),
      items: order.items.map((item) => ({
        id: item.id,
        menuItemId: item.menuItemId,
        menuItemName: item.menuItemName,
        variationId: item.variationId,
        variationName: item.variationName,
        unitPrice: Number(item.unitPrice),
        depositAmount: Number(item.depositAmount),
        quantity: item.quantity,
        lineTotal: Number(item.lineTotal),
        note: item.note,
        dealId: this.readSnapshotDealId(item.snapshotModifiers),
        itemType: this.readSnapshotDealId(item.snapshotModifiers)
          ? 'DEAL'
          : 'ITEM',
        snapshotModifiers: this.readSnapshotModifiers(item.snapshotModifiers),
        snapshotSections: this.readSnapshotSections(item.snapshotModifiers),
        menuItem: item.menuItem,
      })),
    };
  }

  private async toGroupOrderParticipantsWithItems(
    sourceGroupOrder:
      | {
          participants: Array<{
            id: string;
            userId: string;
            isHost: boolean;
            status: string;
            joinedAt: Date;
            leftAt: Date | null;
            user: {
              id: string;
              email: string;
              isGuest: boolean;
              profile: {
                firstName: string;
                lastName: string;
                phone: string | null;
                avatarUrl: string | null;
              } | null;
            };
          }>;
          items: Array<{
            id: string;
            participantId: string;
            menuItemId: string;
            variationId: string | null;
            quantity: number;
            note: string | null;
            modifiers: Prisma.JsonValue | null;
            createdAt: Date;
            updatedAt: Date;
          }>;
        }
      | null
      | undefined,
    branchId: string,
  ) {
    if (!sourceGroupOrder) {
      return [];
    }

    const menuItemIds = [
      ...new Set(sourceGroupOrder.items.map((item) => item.menuItemId)),
    ];

    const menuItems = menuItemIds.length
      ? await this.prisma.menuItem
          .findMany({
            where: {
              id: { in: menuItemIds },
            },
            include: {
              category: {
                select: {
                  id: true,
                  name: true,
                  imageUrl: true,
                  variations: {
                    where: { deletedAt: null, isActive: true },
                    include: {
                      modifierPriceOverrides: {
                        include: {
                          modifier: {
                            include: {
                              itemPriceOverrides: true,
                              variationPriceOverrides: true,
                            },
                          },
                        },
                      },
                    },
                    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
                  },
                  variationLinks: {
                    where: {
                      isActive: true,
                      variation: { deletedAt: null, isActive: true },
                    },
                    include: {
                      variation: {
                        include: {
                          modifierPriceOverrides: {
                            include: {
                              modifier: {
                                include: {
                                  itemPriceOverrides: true,
                                  variationPriceOverrides: true,
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                    orderBy: [{ sortOrder: 'asc' }],
                  },
                },
              },
              modifierLinks: {
                orderBy: [{ sortOrder: 'asc' }],
                include: {
                  modifierGroup: {
                    include: {
                      modifierLinks: {
                        where: {
                          modifier: { deletedAt: null, isActive: true },
                        },
                        include: {
                          modifier: {
                            include: {
                              itemPriceOverrides: true,
                              variationPriceOverrides: true,
                            },
                          },
                        },
                        orderBy: [
                          { sortOrder: 'asc' },
                          { modifier: { createdAt: 'asc' } },
                        ],
                      },
                    },
                  },
                },
              },
              modifierPriceOverrides: {
                include: {
                  modifier: {
                    include: {
                      itemPriceOverrides: true,
                      variationPriceOverrides: true,
                    },
                  },
                },
              },
              variationPriceOverrides: {
                include: {
                  variation: {
                    include: {
                      modifierPriceOverrides: {
                        include: {
                          modifier: {
                            include: {
                              itemPriceOverrides: true,
                              variationPriceOverrides: true,
                            },
                          },
                        },
                      },
                      itemPriceOverrides: true,
                    },
                  },
                },
              },
              branchOverrides: {
                where: { branchId },
              },
            },
          })
          .then((items) =>
            items.map((item) => ({
              ...item,
              variations: this.resolveItemVariations(item),
            })),
          )
      : [];

    const menuItemMap = new Map(
      menuItems.map((menuItem) => [menuItem.id, menuItem]),
    );

    return sourceGroupOrder.participants.map((participant) => ({
      ...this.toGroupOrderParticipantSummary(participant),
      items: sourceGroupOrder.items
        .filter((item) => item.participantId === participant.id)
        .map((item) => ({
          id: item.id,
          menuItemId: item.menuItemId,
          variationId: item.variationId ?? '',
          quantity: item.quantity,
          note: item.note,
          modifiers: item.modifiers ?? [],
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          menuItem: menuItemMap.get(item.menuItemId) ?? null,
        })),
    }));
  }

  private toGroupOrderParticipantSummary(participant: {
    id: string;
    userId: string;
    isHost: boolean;
    status: string;
    joinedAt: Date;
    leftAt: Date | null;
    user: {
      id: string;
      email: string;
      isGuest: boolean;
      profile: {
        firstName: string;
        lastName: string;
        phone: string | null;
        avatarUrl: string | null;
      } | null;
    };
  }) {
    return {
      id: participant.id,
      userId: participant.userId,
      isHost: participant.isHost,
      status: participant.status,
      joinedAt: participant.joinedAt,
      leftAt: participant.leftAt,
      user: this.toUserSummary(participant.user),
    };
  }

  private toCustomerSummary(customer: {
    id: string;
    email: string;
    isGuest?: boolean;
    profile: {
      firstName: string;
      lastName: string;
      phone: string | null;
      avatarUrl: string | null;
      metadata?: Prisma.JsonValue | null;
    } | null;
  }) {
    const guestEmail = this.readGuestContactEmail(customer.profile?.metadata);

    return {
      id: customer.id,
      email: customer.isGuest ? (guestEmail ?? customer.email) : customer.email,
      isGuest: customer.isGuest ?? false,
      firstName: customer.profile?.firstName ?? null,
      lastName: customer.profile?.lastName ?? null,
      fullName:
        customer.profile?.firstName || customer.profile?.lastName
          ? `${customer.profile?.firstName ?? ''} ${customer.profile?.lastName ?? ''}`.trim()
          : null,
      phone: customer.profile?.phone ?? null,
      avatarUrl: customer.profile?.avatarUrl ?? null,
    };
  }

  private readGuestContactEmail(metadata: Prisma.JsonValue | null | undefined) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return null;
    }

    const guestContact = (metadata as { guestContact?: unknown }).guestContact;
    if (
      !guestContact ||
      typeof guestContact !== 'object' ||
      Array.isArray(guestContact)
    ) {
      return null;
    }

    const email = (guestContact as { email?: unknown }).email;
    return typeof email === 'string' && email.trim() ? email : null;
  }

  private toUserSummary(user: {
    id: string;
    email: string;
    isGuest: boolean;
    profile: {
      firstName: string;
      lastName: string;
      phone: string | null;
      avatarUrl: string | null;
    } | null;
  }) {
    return {
      id: user.id,
      email: user.email,
      isGuest: user.isGuest,
      firstName: user.profile?.firstName ?? null,
      lastName: user.profile?.lastName ?? null,
      phone: user.profile?.phone ?? null,
      avatarUrl: user.profile?.avatarUrl ?? null,
    };
  }

  private async toOrderTrackingResponse(order: {
    id: string;
    tenantId: string;
    restaurantId: string;
    branchId: string;
    customerId: string;
    deliveryAddressId: string | null;
    deliverymanId: string | null;
    orderType: OrderType;
    paymentStatus: PaymentStatus;
    paymentMethod: string;
    orderTime: Date | null;
    isScheduled: boolean;
    status: OrderStatus;
    assignedAt: Date | null;
    deliveredAt: Date | null;
    paidAt: Date | null;
    cancelledAt: Date | null;
    customerNote: string | null;
    createdAt: Date;
    updatedAt: Date;
    branch: {
      id: string;
      name: string;
      logoUrl: string | null;
      coverImage: string | null;
    };
    deliveryAddress: {
      id: string;
      street: string;
      area: string | null;
      postalCode: string | null;
      city: string;
      state: string;
      country: string;
      lat: Prisma.Decimal | null;
      lng: Prisma.Decimal | null;
    } | null;
    deliveryman: {
      id: string;
      firstName: string;
      lastName: string;
      phone: string;
      status: string;
      vehicleType: string | null;
      vehicleNumber: string | null;
      currentLat: Prisma.Decimal | null;
      currentLng: Prisma.Decimal | null;
      locationUpdatedAt: Date | null;
    } | null;
  }) {
    const branchAddress = await this.prisma.address.findFirst({
      where: {
        refType: AddressRefType.BRANCH,
        referenceId: order.branchId,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        street: true,
        area: true,
        postalCode: true,
        city: true,
        state: true,
        country: true,
        lat: true,
        lng: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    const stages = this.getTrackingStages(order.orderType);
    const activeStageIndex = stages.findIndex(
      (stage) => stage === order.status,
    );
    const resolvedStageIndex = activeStageIndex >= 0 ? activeStageIndex : 0;
    const progressPercent = Math.round(
      ((resolvedStageIndex + 1) / stages.length) * 100,
    );

    return {
      id: order.id,
      tenantId: order.tenantId,
      restaurantId: order.restaurantId,
      branchId: order.branchId,
      customerId: order.customerId,
      deliveryAddressId: order.deliveryAddressId,
      deliverymanId: order.deliverymanId,
      orderType: order.orderType,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      orderTime: order.orderTime,
      isScheduled: order.isScheduled,
      status: order.status,
      customerNote: order.customerNote,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      assignedAt: order.assignedAt,
      deliveredAt: order.deliveredAt,
      paidAt: order.paidAt,
      cancelledAt: order.cancelledAt,
      supportsRealtime: true,
      trackingMode:
        order.orderType === OrderType.DELIVERY
          ? 'STATUS_AND_LOCATION'
          : 'STATUS_ONLY',
      currentStage: order.status,
      progressPercent,
      branch: {
        ...order.branch,
        address: branchAddress
          ? this.toBranchAddressResponse(branchAddress)
          : null,
      },
      deliveryAddress: order.deliveryAddress
        ? this.toCustomerAddressResponse(order.deliveryAddress)
        : null,
      deliveryman: order.deliveryman
        ? {
            ...order.deliveryman,
            currentLat:
              order.deliveryman.currentLat !== null
                ? Number(order.deliveryman.currentLat)
                : null,
            currentLng:
              order.deliveryman.currentLng !== null
                ? Number(order.deliveryman.currentLng)
                : null,
            locationUpdatedAt: order.deliveryman.locationUpdatedAt,
          }
        : null,
      timeline: stages.map((stage, index) => ({
        status: stage,
        label: this.toTrackingLabel(stage),
        completed: index < resolvedStageIndex,
        active: stage === order.status,
        pending: index > resolvedStageIndex,
        at: this.resolveTrackingStageTimestamp(stage, order),
      })),
    };
  }

  private getTrackingStages(orderType: OrderType): OrderStatus[] {
    if (orderType === OrderType.TAKEAWAY) {
      return [
        OrderStatus.PLACED,
        OrderStatus.CONFIRMED,
        OrderStatus.PREPARING,
        OrderStatus.READY_FOR_PICKUP,
        OrderStatus.PICKED_UP,
      ];
    }

    if (orderType === OrderType.DINE_IN) {
      return [
        OrderStatus.PLACED,
        OrderStatus.CONFIRMED,
        OrderStatus.PREPARING,
        OrderStatus.READY_TO_SERVE,
        OrderStatus.SERVED,
      ];
    }

    return [
      OrderStatus.PLACED,
      OrderStatus.CONFIRMED,
      OrderStatus.PREPARING,
      OrderStatus.OUT_FOR_DELIVERY,
      OrderStatus.DELIVERED,
    ];
  }

  private toTrackingLabel(status: OrderStatus): string {
    const labels: Record<OrderStatus, string> = {
      PAYMENT_PENDING: 'Payment pending',
      PLACED: 'Order placed',
      CONFIRMED: 'Order confirmed',
      PREPARING: 'Preparing order',
      READY_FOR_PICKUP: 'Ready for pickup',
      PICKED_UP: 'Picked up',
      READY_TO_SERVE: 'Ready to serve',
      SERVED: 'Served',
      OUT_FOR_DELIVERY: 'Out for delivery',
      DELIVERED: 'Delivered',
      CANCELLED: 'Cancelled',
      REJECTED: 'Rejected',
    };

    return labels[status];
  }

  private resolveTrackingStageTimestamp(
    stage: OrderStatus,
    order: {
      status: OrderStatus;
      createdAt: Date;
      updatedAt: Date;
      assignedAt: Date | null;
      deliveredAt: Date | null;
      cancelledAt: Date | null;
    },
  ) {
    if (stage === OrderStatus.PLACED) {
      return order.createdAt;
    }

    if (stage === OrderStatus.OUT_FOR_DELIVERY) {
      return order.assignedAt;
    }

    if (
      stage === OrderStatus.DELIVERED ||
      stage === OrderStatus.PICKED_UP ||
      stage === OrderStatus.SERVED
    ) {
      return order.deliveredAt;
    }

    return stage === order.status ? order.updatedAt : null;
  }

  private async resolveRestaurantId(
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

      return requestedRestaurantId;
    }

    if (this.isStaffActor(user)) {
      return this.resolveStaffRestaurantId(user, requestedRestaurantId);
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

  private resolveStaffRestaurantId(
    user: AuthUserContext,
    requestedRestaurantId?: string,
  ): string | undefined {
    if (user.restaurantAccess?.allRestaurants) {
      return requestedRestaurantId ?? user.rid;
    }

    const allowedRestaurantIds = user.restaurantAccess?.restaurantIds ?? [];
    const fallbackRestaurantId = user.rid ?? allowedRestaurantIds[0];
    const restaurantId = requestedRestaurantId ?? fallbackRestaurantId;

    if (!restaurantId) {
      throw new ForbiddenException('Restaurant context is required');
    }

    if (
      !allowedRestaurantIds.includes(restaurantId) &&
      user.rid !== restaurantId
    ) {
      throw new ForbiddenException(
        'You cannot access resources outside your assigned restaurants',
      );
    }

    return restaurantId;
  }

  private isStaffActor(user: AuthUserContext): boolean {
    return user.actorType === 'STAFF' || user.role === UserRoleEnum.STAFF;
  }

  private async resolveQuoteCustomer(
    user: AuthUserContext,
    branch: QuoteBranchContext,
    requestedCustomerId?: string,
  ): Promise<QuoteCustomerContext> {
    if (user.role === UserRoleEnum.CUSTOMER) {
      if (requestedCustomerId && requestedCustomerId !== user.uid) {
        throw new BadRequestException(
          'Customers can only place orders for themselves',
        );
      }

      return { customerId: user.uid, isGuest: user.isGuest === true };
    }

    if (!requestedCustomerId) {
      throw new BadRequestException(
        'customerId is required when placing an order on behalf of a customer',
      );
    }

    const customer = await this.prisma.user.findFirst({
      where: {
        id: requestedCustomerId,
        tenantId: branch.tenantId,
        restaurantId: branch.restaurantId,
        role: 'CUSTOMER',
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        isGuest: true,
      },
    });

    if (!customer) {
      throw new BadRequestException('Customer not found for this restaurant');
    }

    return { customerId: customer.id, isGuest: customer.isGuest };
  }

  private assertGuestCheckoutAddressRules(
    customer: QuoteCustomerContext,
    dto: QuoteOrderDto,
  ) {
    if (!dto.guestDeliveryAddress) {
      return;
    }

    if (!customer.isGuest) {
      throw new BadRequestException(
        'guestDeliveryAddress can only be used by guest customers',
      );
    }

    if (dto.deliveryAddressId) {
      throw new BadRequestException(
        'Use either deliveryAddressId or guestDeliveryAddress, not both',
      );
    }
  }

  private assertGuestContactForOrder(
    customer: QuoteCustomerContext,
    guestContact?: GuestOrderContactDto,
  ) {
    if (!customer.isGuest) {
      if (guestContact) {
        throw new BadRequestException(
          'guestContact can only be used by guest customers',
        );
      }

      return;
    }

    if (!guestContact) {
      throw new BadRequestException(
        'guestContact is required for guest orders',
      );
    }

    if (guestContact.privacyPolicyAccepted !== true) {
      throw new BadRequestException(
        'privacyPolicyAccepted is required for guest orders',
      );
    }
  }

  private async createGuestDeliveryAddress(
    tx: PrismaTx,
    tenantId: string,
    customerId: string,
    dto: GuestOrderDeliveryAddressDto,
  ) {
    return tx.address.create({
      data: {
        tenantId,
        referenceId: customerId,
        refType: AddressRefType.USER,
        street: dto.street,
        area: dto.houseNumber ?? dto.area,
        postalCode: dto.postalCode,
        city: dto.city,
        state: dto.state,
        country: dto.country,
        lat: dto.lat,
        lng: dto.lng,
      },
      select: {
        id: true,
      },
    });
  }

  private async updateGuestContact(
    tx: PrismaTx,
    customerId: string,
    dto: GuestOrderContactDto,
    restaurantId: string,
  ) {
    const existingProfile = await tx.profile.findUnique({
      where: { userId: customerId },
      select: { metadata: true },
    });
    const metadata = this.toGuestContactMetadata(
      existingProfile?.metadata,
      dto,
      restaurantId,
    );

    await tx.profile.upsert({
      where: { userId: customerId },
      update: {
        firstName: dto.firstName?.trim() || 'Guest',
        lastName: dto.lastName?.trim() || 'Customer',
        phone: dto.phone,
        metadata,
      },
      create: {
        userId: customerId,
        firstName: dto.firstName?.trim() || 'Guest',
        lastName: dto.lastName?.trim() || 'Customer',
        phone: dto.phone,
        metadata,
      },
    });
  }

  private toGuestContactMetadata(
    existingMetadata: Prisma.JsonValue | null | undefined,
    dto: GuestOrderContactDto,
    restaurantId: string,
  ): Prisma.InputJsonValue {
    const metadata =
      existingMetadata &&
      typeof existingMetadata === 'object' &&
      !Array.isArray(existingMetadata)
        ? ({ ...existingMetadata } as Prisma.JsonObject)
        : {};

    return {
      ...metadata,
      guestContact: {
        email: dto.email.trim().toLowerCase(),
        phone: dto.phone,
        privacyPolicyAccepted: true,
        privacyPolicyAcceptedAt: new Date().toISOString(),
        privacyPolicyLink: this.buildPrivacyPolicyLink(restaurantId),
      },
    };
  }

  private buildPrivacyPolicyLink(restaurantId: string) {
    return `/api/v1/public-content/privacy-policy?restaurantId=${encodeURIComponent(
      restaurantId,
    )}`;
  }

  private async ensureBranchAccess(
    user: AuthUserContext,
    restaurantId: string,
    branchId: string,
  ) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return;
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      if (!user.tid) {
        throw new ForbiddenException('Tenant context is required');
      }

      await this.assertRestaurantInTenant(user.tid, restaurantId);
    } else if (user.rid !== restaurantId) {
      throw new ForbiddenException(
        'You cannot access resources outside your restaurant',
      );
    }

    if (
      user.role === UserRoleEnum.BRANCH_ADMIN &&
      user.bid &&
      user.bid !== branchId
    ) {
      throw new ForbiddenException(
        'You cannot access resources outside your branch',
      );
    }
  }

  private async assignDeliverymanToOrder(
    order: {
      id: string;
      orderType: OrderType;
      status: OrderStatus;
      restaurantId: string;
      branchId: string;
      deliverymanId?: string | null;
    },
    deliverymanId: string,
    deliverymanBranchId: string,
    deliverymanRestaurantId: string,
  ) {
    if (order.orderType !== OrderType.DELIVERY) {
      throw new BadRequestException('Only delivery orders can be assigned');
    }

    const blockedStatuses: OrderStatus[] = [
      OrderStatus.CANCELLED,
      OrderStatus.REJECTED,
      OrderStatus.DELIVERED,
      OrderStatus.PICKED_UP,
      OrderStatus.SERVED,
    ];

    if (blockedStatuses.includes(order.status)) {
      throw new BadRequestException(
        'Order cannot receive a deliveryman in current state',
      );
    }

    if (order.restaurantId !== deliverymanRestaurantId) {
      throw new ForbiddenException('Cross-restaurant assignment denied');
    }

    if (order.branchId !== deliverymanBranchId) {
      throw new BadRequestException(
        'Deliveryman branch does not match order branch',
      );
    }

    if (order.deliverymanId && order.deliverymanId !== deliverymanId) {
      throw new BadRequestException(
        'Order is already assigned to another deliveryman',
      );
    }

    const data = await this.ordersRepository.assignDeliveryman(
      order.id,
      deliverymanId,
    );

    await this.notificationsService.notifyOrderStatusChanged(data.id);
    await this.chatService.ensureDeliveryThreadForOrder(data.id, deliverymanId);
    await this.emitTrackingUpdate(data.id);

    return this.toOrderMutationResponse(data);
  }

  private async assertOrderAccess(
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

  private assertDeliverymanOrderAccess(
    user: AuthUserContext,
    deliverymanId: string | null,
  ) {
    if (!deliverymanId || deliverymanId !== user.uid) {
      throw new ForbiddenException('Cross-deliveryman access denied');
    }
  }

  private async assertTrackingAccess(
    user: AuthUserContext,
    order: {
      restaurantId: string;
      customerId: string;
      deliverymanId: string | null;
    },
  ) {
    if (user.role === 'DELIVERYMAN') {
      this.assertDeliverymanOrderAccess(user, order.deliverymanId);
      return;
    }

    await this.assertOrderAccess(user, order.restaurantId, order.customerId);
  }

  private async emitTrackingUpdate(orderId: string) {
    try {
      const snapshot = await this.getTrackingSnapshotForRealtime(orderId);
      this.orderTrackingRealtimeService.emitTrackingUpdate(snapshot);
    } catch {
      return;
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

  private isCompletedOrder(orderType: OrderType, status: OrderStatus) {
    if (orderType === OrderType.DELIVERY) {
      return status === OrderStatus.DELIVERED;
    }

    if (orderType === OrderType.TAKEAWAY) {
      return status === OrderStatus.PICKED_UP;
    }

    return status === OrderStatus.SERVED;
  }

  private isValidStatusTransition(
    orderType: OrderType,
    current: OrderStatus,
    next: OrderStatus,
  ): boolean {
    const baseTransitions: Record<OrderStatus, OrderStatus[]> = {
      PAYMENT_PENDING: [OrderStatus.CANCELLED],
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
      PREPARING: this.getPreparingTransitions(orderType),
      READY_FOR_PICKUP: [OrderStatus.PICKED_UP, OrderStatus.CANCELLED],
      PICKED_UP: [],
      READY_TO_SERVE: [OrderStatus.SERVED, OrderStatus.CANCELLED],
      SERVED: [],
      OUT_FOR_DELIVERY: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
      DELIVERED: [],
      CANCELLED: [],
      REJECTED: [],
    };

    return (baseTransitions[current] ?? []).includes(next);
  }

  private isExternalDeliveryDispatch(
    order: { orderType: OrderType; status: OrderStatus },
    dto: UpdateOrderStatusDto,
  ): boolean {
    if (dto.deliveryFulfillmentMode !== 'EXTERNAL') {
      return false;
    }

    return (
      order.orderType === OrderType.DELIVERY &&
      dto.status === OrderStatus.OUT_FOR_DELIVERY &&
      (order.status === OrderStatus.CONFIRMED ||
        order.status === OrderStatus.PREPARING)
    );
  }

  private isValidDeliverymanStatusTransition(
    order: { orderType: OrderType; status: OrderStatus },
    next: OrderStatus,
  ): boolean {
    return (
      order.orderType === OrderType.DELIVERY &&
      order.status === OrderStatus.OUT_FOR_DELIVERY &&
      next === OrderStatus.DELIVERED
    );
  }

  private resolveAcceptedOrderTime(
    order: { status: OrderStatus },
    dto: UpdateOrderStatusDto,
  ) {
    const isAcceptance =
      order.status === OrderStatus.PLACED &&
      dto.status === OrderStatus.CONFIRMED;

    if (!isAcceptance) {
      if (dto.orderTime) {
        throw new BadRequestException(
          'orderTime can only be set when accepting an order',
        );
      }

      return undefined;
    }

    if (!dto.orderTime) {
      throw new BadRequestException(
        'orderTime is required when accepting an order',
      );
    }

    this.assertValidOrderTime(dto.orderTime);
    return new Date(dto.orderTime);
  }

  private assertDeliveryOtpForCompletion(
    order: {
      orderType: OrderType;
      status: OrderStatus;
      deliveryOtp?: string | null;
    },
    dto: UpdateOrderStatusDto,
  ) {
    if (
      order.orderType !== OrderType.DELIVERY ||
      order.status !== OrderStatus.OUT_FOR_DELIVERY ||
      dto.status !== OrderStatus.DELIVERED
    ) {
      return;
    }

    const expectedOtp = order.deliveryOtp?.trim();
    if (!expectedOtp) {
      throw new BadRequestException(
        'Delivery OTP is not configured for this order',
      );
    }

    const providedOtp = dto.deliveryOtp?.trim();
    if (!providedOtp) {
      throw new BadRequestException(
        'deliveryOtp is required to complete delivery',
      );
    }

    if (providedOtp !== expectedOtp) {
      throw new BadRequestException('Invalid delivery OTP');
    }
  }

  private getPreparingTransitions(orderType: OrderType): OrderStatus[] {
    if (orderType === OrderType.TAKEAWAY) {
      return [OrderStatus.READY_FOR_PICKUP, OrderStatus.CANCELLED];
    }

    if (orderType === OrderType.DINE_IN) {
      return [OrderStatus.READY_TO_SERVE, OrderStatus.CANCELLED];
    }

    return [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.CANCELLED];
  }

  private isPaymentAllowed(
    settings: BranchSettings,
    paymentMethod: string,
    activeGlobalPaymentMethods: string[] = [],
  ): boolean {
    if (paymentMethod === 'WALLET' || paymentMethod === 'PAYPAL') {
      return true;
    }

    return (
      settings.allowedPaymentMethods.includes(paymentMethod) ||
      activeGlobalPaymentMethods.includes(paymentMethod)
    );
  }

  private async resolveActiveGlobalPaymentMethods(): Promise<string[]> {
    const globalSettingDelegate = (
      this.prisma as unknown as {
        globalSetting?: {
          findUnique: (args: {
            where: { scopeKey: string };
            select: { paymentMethods: boolean };
          }) => Promise<{ paymentMethods: Prisma.JsonValue | null } | null>;
        };
      }
    ).globalSetting;

    if (!globalSettingDelegate) {
      return [];
    }

    const settings = await globalSettingDelegate.findUnique({
      where: { scopeKey: 'GLOBAL' },
      select: { paymentMethods: true },
    });

    return this.readActiveGlobalPaymentMethods(settings?.paymentMethods);
  }

  private readActiveGlobalPaymentMethods(
    source: Prisma.JsonValue | null | undefined,
  ): string[] {
    if (!Array.isArray(source)) {
      return [];
    }

    return source.flatMap((row) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        return [];
      }

      const code = (row as { code?: unknown }).code;
      const isActive = (row as { isActive?: unknown }).isActive;

      if (
        typeof code === 'string' &&
        Object.values(PaymentMethod).includes(code as PaymentMethod) &&
        isActive === true
      ) {
        return [code];
      }

      return [];
    });
  }

  private resolveItemVariations(item: {
    variationPriceOverrides?: Array<{
      menuItemId: string;
      price: Prisma.Decimal;
      pickupPrice?: Prisma.Decimal | null;
      displayText?: string | null;
      variation: {
        id: string;
        name: string;
        price: Prisma.Decimal;
        modifierPriceOverrides?: Array<{
          modifierId: string;
          priceDelta: Prisma.Decimal;
        }>;
        itemPriceOverrides?: Array<{
          menuItemId: string;
          price: Prisma.Decimal;
          pickupPrice?: Prisma.Decimal | null;
          displayText?: string | null;
        }>;
      };
    }>;
    category: Parameters<OrdersService['resolveCategoryVariations']>[0];
  }) {
    return item.variationPriceOverrides?.length
      ? item.variationPriceOverrides.map((override) => ({
          ...override.variation,
          price: override.price,
          pickupPrice: override.pickupPrice ?? null,
          displayText: override.displayText ?? null,
          itemPriceOverrides: [
            { ...override, menuItemId: override.menuItemId },
          ],
        }))
      : this.resolveCategoryVariations(item.category);
  }

  private resolveCategoryVariations(category: {
    variations?: Array<{
      id: string;
      name: string;
      price: Prisma.Decimal;
      modifierPriceOverrides?: Array<{
        modifierId: string;
        priceDelta: Prisma.Decimal;
      }>;
      itemPriceOverrides?: Array<{
        menuItemId: string;
        price: Prisma.Decimal;
        pickupPrice?: Prisma.Decimal | null;
        displayText?: string | null;
      }>;
    }>;
    variationLinks?: Array<{
      sortOrder: number;
      isDefault: boolean;
      isActive: boolean;
      variation: {
        id: string;
        name: string;
        price: Prisma.Decimal;
        modifierPriceOverrides?: Array<{
          modifierId: string;
          priceDelta: Prisma.Decimal;
        }>;
        itemPriceOverrides?: Array<{
          menuItemId: string;
          price: Prisma.Decimal;
          pickupPrice?: Prisma.Decimal | null;
          displayText?: string | null;
        }>;
      };
    }>;
  }) {
    return category.variationLinks?.length
      ? category.variationLinks.map((link) => ({
          ...link.variation,
          sortOrder: link.sortOrder,
          isDefault: link.isDefault,
          isActive: link.isActive,
        }))
      : (category.variations ?? []);
  }

  private resolveVariationPrice(
    variations: {
      id: string;
      price: Prisma.Decimal;
      name: string;
      modifierPriceOverrides?: {
        modifierId: string;
        priceDelta: Prisma.Decimal;
      }[];
      itemPriceOverrides?: Array<{
        menuItemId: string;
        price: Prisma.Decimal;
        pickupPrice?: Prisma.Decimal | null;
        displayText?: string | null;
      }>;
    }[],
    variationId: string,
    basePrice: Prisma.Decimal,
    menuItemId?: string,
    orderType?: OrderTypeEnum | OrderType,
  ) {
    const variation = variations.find((item) => item.id === variationId);

    if (!variation) {
      throw new BadRequestException('Variation not found');
    }

    const override = variation.itemPriceOverrides?.find(
      (item) => item.menuItemId === menuItemId,
    );

    if (orderType === OrderTypeEnum.TAKEAWAY && override?.pickupPrice) {
      return override.pickupPrice;
    }

    return override?.price ?? variation.price ?? basePrice;
  }

  private variationHasPickupPrice(
    variation: {
      itemPriceOverrides?: Array<{
        menuItemId: string;
        pickupPrice?: Prisma.Decimal | null;
      }>;
    },
    menuItemId: string,
    orderType: OrderTypeEnum | OrderType,
  ) {
    return (
      orderType === OrderTypeEnum.TAKEAWAY &&
      !!variation.itemPriceOverrides?.find(
        (itemOverride) =>
          itemOverride.menuItemId === menuItemId && !!itemOverride.pickupPrice,
      )
    );
  }

  private findModifier(
    item: OrderModifierSource,
    modifierId: string,
    menuItemId?: string,
    variationId?: string,
  ) {
    const variationModifier = item.variations
      ?.find((variation) => variation.id === variationId)
      ?.modifierPriceOverrides?.find(
        (override) => override.modifierId === modifierId,
      );

    if (variationModifier) {
      return this.resolveModifierPricing(
        {
          ...variationModifier.modifier,
          variationPriceOverrides: [
            ...(variationModifier.modifier.variationPriceOverrides ?? []),
            {
              menuItemId: item.id,
              variationId: variationId as string,
              priceDelta: variationModifier.priceDelta,
            },
          ],
        },
        menuItemId,
        variationId,
      );
    }

    for (const link of this.getAvailableModifierLinks(item)) {
      const found = link.modifierGroup.modifierLinks.find(
        (modifierLink) => modifierLink.modifier.id === modifierId,
      )?.modifier;

      if (found) {
        return this.resolveModifierPricing(found, menuItemId, variationId);
      }
    }

    const directModifier = item.modifierPriceOverrides?.find(
      (override) => override.modifier.id === modifierId,
    );

    if (directModifier) {
      return this.resolveModifierPricing(
        {
          ...directModifier.modifier,
          itemPriceOverrides: [
            ...(directModifier.modifier.itemPriceOverrides ?? []),
            { menuItemId: item.id, priceDelta: directModifier.priceDelta },
          ],
        },
        menuItemId,
        variationId,
      );
    }

    return undefined;
  }

  private resolveModifierPricing(
    modifier: OrderDirectModifierOverride['modifier'],
    menuItemId?: string,
    variationId?: string,
  ) {
    const variationOverride = modifier.variationPriceOverrides?.find(
      (item) =>
        item.menuItemId === menuItemId && item.variationId === variationId,
    );
    const legacyVariationOverride = modifier.variationPriceOverrides?.find(
      (item) => item.menuItemId === null && item.variationId === variationId,
    );
    const override = modifier.itemPriceOverrides?.find(
      (item) => item.menuItemId === menuItemId,
    );

    return {
      ...modifier,
      priceDelta:
        variationOverride?.priceDelta ??
        legacyVariationOverride?.priceDelta ??
        override?.priceDelta ??
        modifier.priceDelta,
    };
  }

  private getAvailableModifierLinks(item: OrderModifierSource) {
    return [...(item.category?.modifierLinks ?? []), ...item.modifierLinks];
  }

  private assertModifierSelectionLimits(
    menuItem: OrderModifierSource,
    modifiers: OrderItemModifierDto[],
    modifierSelections: OrderItemModifierSelectionDto[] = [],
  ) {
    if (
      this.getAvailableModifierLinks(menuItem).length &&
      modifierSelections.length
    ) {
      this.assertGroupedModifierSelectionLimits(menuItem, modifierSelections);
      return;
    }

    if (menuItem.modifierPriceOverrides?.length) {
      const selectedModifierIds = new Set(
        modifiers
          .filter((modifier) => (modifier.quantity ?? 1) > 0)
          .map((modifier) => modifier.modifierId),
      );
      const missingRequiredModifiers = menuItem.modifierPriceOverrides.filter(
        (override) =>
          (override.isRequired ?? false) &&
          !selectedModifierIds.has(override.modifierId ?? override.modifier.id),
      );

      if (missingRequiredModifiers.length) {
        throw new BadRequestException(
          `${menuItem.name ?? 'Menu item'} requires modifier selection(s): ${missingRequiredModifiers
            .map((override) => override.modifier.name)
            .join(', ')}`,
        );
      }

      return;
    }

    const totalSelected = modifiers.reduce(
      (sum, modifier) => sum + (modifier.quantity ?? 1),
      0,
    );
    const isRequired = menuItem.isRequired ?? false;
    const minSelect = isRequired ? (menuItem.minSelect ?? 1) : 0;
    const maxSelect = isRequired ? (menuItem.maxSelect ?? null) : 1;

    if (isRequired && totalSelected < minSelect) {
      throw new BadRequestException(
        `${menuItem.name ?? 'Menu item'} requires at least ${minSelect} modifier selection(s)`,
      );
    }

    if (maxSelect !== null && totalSelected > maxSelect) {
      throw new BadRequestException(
        `${menuItem.name ?? 'Menu item'} allows at most ${maxSelect} modifier selection(s)`,
      );
    }
  }

  private async isReadyMadeDealItem(
    restaurantId: string,
    branchId: string,
    dealId: string,
    menuItemId: string,
  ) {
    return this.couponsService.isActiveFixedPriceDealItem(
      restaurantId,
      branchId,
      dealId,
      menuItemId,
    );
  }

  private async findReadyMadeDealIdForItem(
    restaurantId: string,
    branchId: string,
    menuItemId: string,
  ) {
    return (
      (await this.couponsService.findActiveFixedPriceDealIdForItem?.(
        restaurantId,
        branchId,
        menuItemId,
      )) ?? null
    );
  }

  private resolveOptionalString(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
  }

  private assertNoDealCustomizations(
    item: {
      variationId?: string;
      modifiers?: OrderItemModifierDto[];
      modifierSelections?: Array<{ modifiers?: OrderItemModifierDto[] }>;
      sections?: unknown[];
    },
    itemName?: string,
    options: { allowModifiers?: boolean; allowVariation?: boolean } = {},
  ) {
    const hasBlockedModifiers =
      !options.allowModifiers &&
      (!!item.modifiers?.length ||
        !!item.modifierSelections?.some((selection) =>
          selection.modifiers?.some((modifier) => (modifier.quantity ?? 1) > 0),
        ));

    const hasBlockedVariation = !options.allowVariation && !!item.variationId;

    if (hasBlockedVariation || hasBlockedModifiers || item.sections?.length) {
      throw new BadRequestException(
        `${itemName ?? 'Deal item'} does not support customization selections`,
      );
    }
  }

  private resolveRequestedOrderItemModifiers(item: {
    modifiers?: OrderItemModifierDto[];
    modifierSelections?: Array<{ modifiers?: OrderItemModifierDto[] }>;
  }): OrderItemModifierDto[] {
    return item.modifierSelections?.length
      ? item.modifierSelections.flatMap(
          (selection) => selection.modifiers ?? [],
        )
      : (item.modifiers ?? []);
  }

  private assertGroupedModifierSelectionLimits(
    menuItem: OrderModifierSource,
    modifierSelections: OrderItemModifierSelectionDto[],
  ) {
    const availableLinks = this.getAvailableModifierLinks(menuItem);
    const linksByGroupId = new Map(
      availableLinks.map((link) => [link.modifierGroup.id, link]),
    );
    const selectionsByGroupId = new Map<
      string,
      OrderItemModifierSelectionDto
    >();

    for (const selection of modifierSelections) {
      if (selectionsByGroupId.has(selection.modifierGroupId)) {
        throw new BadRequestException(
          'Modifier selections must contain unique modifierGroupIds',
        );
      }

      const link = linksByGroupId.get(selection.modifierGroupId);
      if (!link) {
        throw new BadRequestException(
          `Modifier group not found for item: ${menuItem.name ?? 'Menu item'}`,
        );
      }

      selectionsByGroupId.set(selection.modifierGroupId, selection);
      const modifierIds = new Set(
        link.modifierGroup.modifierLinks.map(
          (modifierLink) => modifierLink.modifier.id,
        ),
      );
      const selectedIds = selection.modifiers.map(
        (modifier) => modifier.modifierId,
      );

      if (new Set(selectedIds).size !== selectedIds.length) {
        throw new BadRequestException(
          'Modifier group selections must contain unique modifierIds',
        );
      }

      if (selectedIds.some((modifierId) => !modifierIds.has(modifierId))) {
        throw new BadRequestException(
          `Modifier selection contains invalid option for group: ${link.modifierGroup.name}`,
        );
      }

      const totalSelected = selection.modifiers.reduce(
        (sum, modifier) => sum + (modifier.quantity ?? 1),
        0,
      );
      const minSelect = link.minSelect ?? link.modifierGroup.minSelect;
      const maxSelect = link.maxSelect ?? link.modifierGroup.maxSelect;
      const selectionType =
        link.selectionType ?? (maxSelect > 1 ? 'MULTIPLE' : 'SINGLE');

      if (selectionType === 'SINGLE' && totalSelected > 1) {
        throw new BadRequestException(
          `${link.modifierGroup.name} allows only one modifier selection`,
        );
      }

      if (totalSelected < minSelect) {
        throw new BadRequestException(
          `${link.modifierGroup.name} requires at least ${minSelect} modifier selection(s)`,
        );
      }

      if (totalSelected > maxSelect) {
        throw new BadRequestException(
          `${link.modifierGroup.name} allows at most ${maxSelect} modifier selection(s)`,
        );
      }
    }

    for (const link of availableLinks) {
      const minSelect = link.minSelect ?? link.modifierGroup.minSelect;
      if (minSelect < 1 || selectionsByGroupId.has(link.modifierGroup.id)) {
        continue;
      }

      throw new BadRequestException(
        `${link.modifierGroup.name} requires at least ${minSelect} modifier selection(s)`,
      );
    }
  }

  private assertItemQuantityLimits(
    menuItem: OrderModifierSource,
    quantity: number,
  ) {
    const minQuantity = menuItem.minQuantity ?? 1;
    const maxQuantity = menuItem.maxQuantity ?? null;

    if (quantity < minQuantity) {
      throw new BadRequestException(
        `${menuItem.name ?? 'Menu item'} requires at least ${minQuantity} item(s)`,
      );
    }

    if (maxQuantity !== null && quantity > maxQuantity) {
      throw new BadRequestException(
        `${menuItem.name ?? 'Menu item'} allows at most ${maxQuantity} item(s)`,
      );
    }
  }

  private packOrderSelections(
    modifiers?: QuoteLine['snapshotModifiers'],
    sections?: QuoteLine['snapshotSections'],
    dealId?: string,
  ) {
    if (!sections?.length && !dealId) {
      return modifiers?.length ? modifiers : [];
    }

    return {
      ...(dealId ? { dealId } : {}),
      modifiers: modifiers?.length ? modifiers : [],
      ...(sections?.length ? { sections } : {}),
    };
  }

  private readSnapshotDealId(input: Prisma.JsonValue | null) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return null;
    }

    const dealId = (input as { dealId?: unknown }).dealId;
    return typeof dealId === 'string' && dealId.trim() ? dealId : null;
  }

  private buildOrderDisplayItems(items: OrderDisplayItemSource[]) {
    const displayItems: Array<
      | {
          type: 'DEAL';
          dealId: string;
          quantity: number;
          lineTotal: number;
          items: OrderDisplayItemResponse[];
        }
      | ({ type: 'ITEM'; dealId: null } & OrderDisplayItemResponse)
    > = [];
    const dealIndexes = new Map<string, number>();

    for (const item of items) {
      const dealId = this.readSnapshotDealId(item.snapshotModifiers);
      const displayItem = this.toOrderDisplayItem(item);

      if (!dealId) {
        displayItems.push({ type: 'ITEM', dealId: null, ...displayItem });
        continue;
      }

      const existingIndex = dealIndexes.get(dealId);
      if (existingIndex !== undefined) {
        const existing = displayItems[existingIndex];
        if (existing.type === 'DEAL') {
          existing.items.push(displayItem);
          existing.quantity += displayItem.quantity;
          existing.lineTotal = Number(
            (existing.lineTotal + displayItem.lineTotal).toFixed(2),
          );
        }
        continue;
      }

      dealIndexes.set(dealId, displayItems.length);
      displayItems.push({
        type: 'DEAL',
        dealId,
        quantity: displayItem.quantity,
        lineTotal: displayItem.lineTotal,
        items: [displayItem],
      });
    }

    return displayItems;
  }

  private toOrderDisplayItem(
    item: OrderDisplayItemSource,
  ): OrderDisplayItemResponse {
    return {
      id: item.id,
      menuItemId: item.menuItemId,
      menuItemName: item.menuItemName,
      imageUrl: item.menuItem?.imageUrl ?? null,
      variationId: item.variationId,
      variationName: item.variationName,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      depositAmount: Number(item.depositAmount),
      lineTotal: Number(item.lineTotal),
      note: item.note,
      snapshotModifiers: this.readSnapshotModifiers(item.snapshotModifiers),
      snapshotSections: this.readSnapshotSections(item.snapshotModifiers),
    };
  }

  private readSnapshotModifiers(input: Prisma.JsonValue | null) {
    if (Array.isArray(input)) {
      return input;
    }

    if (!input || typeof input !== 'object') {
      return [];
    }

    return Array.isArray((input as { modifiers?: unknown }).modifiers)
      ? (input as { modifiers: unknown[] }).modifiers
      : [];
  }

  private readSnapshotSections(input: Prisma.JsonValue | null) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return [];
    }

    return Array.isArray((input as { sections?: unknown }).sections)
      ? (input as { sections: unknown[] }).sections
      : [];
  }

  private supportsSplitPizza(menuItem: { dietaryFlags?: unknown }) {
    return Array.isArray(menuItem.dietaryFlags)
      ? menuItem.dietaryFlags.includes('__SPLIT_PIZZA_ENABLED__')
      : false;
  }

  private readBranchSettings(
    input: unknown,
    scheduleFallbackInput?: unknown,
  ): BranchSettings {
    const fallback: BranchSettings = {
      allowedOrderTypes: [OrderTypeEnum.DELIVERY, OrderTypeEnum.TAKEAWAY],
      allowedPaymentMethods: ['COD', 'CARD_ON_DELIVERY', 'PAYPAL', 'WALLET'],
      deliveryConfig: {
        mode: 'RADIUS',
        radiusKm: 5,
        minOrderAmount: 0,
        deliveryFee: 0,
        isFreeDelivery: false,
        freeDeliveryThreshold: 0,
        zones: [],
        zoneBands: [],
        postalCodeRules: [],
      },
      taxation: {
        taxPercentage: 0,
      },
      serviceCharge: {
        isEnabled: false,
        type: ServiceChargeType.PERCENTAGE,
        value: 0,
      },
      openingHours: [],
      deliveryHours: [],
      temporaryClosure: null,
      holidayOpeningHours: [],
      tableReservationsEnabled: false,
      tableReservationAutoAccept: false,
      tableCount: 0,
    };

    const raw =
      input && typeof input === 'object'
        ? (input as Partial<BranchSettings>)
        : ({} as Partial<BranchSettings>);
    const scheduleFallback = this.readBranchScheduleFallback(
      scheduleFallbackInput,
    );

    return {
      allowedOrderTypes: raw.allowedOrderTypes ?? fallback.allowedOrderTypes,
      allowedPaymentMethods: this.withPlatformPaymentMethods(
        raw.allowedPaymentMethods ?? fallback.allowedPaymentMethods,
      ),
      deliveryConfig: {
        mode: raw.deliveryConfig?.mode ?? fallback.deliveryConfig.mode,
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
        zones: raw.deliveryConfig?.zones ?? fallback.deliveryConfig.zones,
        zoneBands:
          raw.deliveryConfig?.zoneBands ?? fallback.deliveryConfig.zoneBands,
        postalCodeRules:
          raw.deliveryConfig?.postalCodeRules ??
          fallback.deliveryConfig.postalCodeRules,
      },
      taxation: {
        taxPercentage:
          raw.taxation?.taxPercentage ?? fallback.taxation.taxPercentage,
      },
      serviceCharge: {
        isEnabled:
          raw.serviceCharge?.isEnabled ?? fallback.serviceCharge.isEnabled,
        type: raw.serviceCharge?.type ?? fallback.serviceCharge.type,
        value: raw.serviceCharge?.value ?? fallback.serviceCharge.value,
      },
      temporaryClosure: raw.temporaryClosure ?? fallback.temporaryClosure,
      holidayOpeningHours: Array.isArray(raw.holidayOpeningHours)
        ? raw.holidayOpeningHours
        : (scheduleFallback.holidayOpeningHours ??
          fallback.holidayOpeningHours),
      openingHours: this.resolveConfiguredScheduleHours(
        raw.openingHours,
        scheduleFallback.openingHours ?? fallback.openingHours,
      ),
      deliveryHours: this.resolveConfiguredScheduleHours(
        raw.deliveryHours,
        this.hasConfiguredScheduleHours(raw.openingHours)
          ? fallback.deliveryHours
          : (scheduleFallback.deliveryHours ?? fallback.deliveryHours),
      ),
      tableReservationsEnabled:
        raw.tableReservationsEnabled ?? fallback.tableReservationsEnabled,
      tableReservationAutoAccept:
        raw.tableReservationAutoAccept ?? fallback.tableReservationAutoAccept,
      tableCount: raw.tableCount ?? fallback.tableCount,
    };
  }

  private readBranchScheduleFallback(input: unknown) {
    if (!input || typeof input !== 'object') {
      return {
        openingHours: undefined,
        deliveryHours: undefined,
        holidayOpeningHours: undefined,
      };
    }

    const raw = input as Partial<BranchSettings>;

    return {
      openingHours: this.hasUsableScheduleHours(raw.openingHours)
        ? raw.openingHours
        : undefined,
      deliveryHours: this.hasUsableScheduleHours(raw.deliveryHours)
        ? raw.deliveryHours
        : undefined,
      holidayOpeningHours:
        Array.isArray(raw.holidayOpeningHours) && raw.holidayOpeningHours.length
          ? raw.holidayOpeningHours
          : undefined,
    };
  }

  private resolveConfiguredScheduleHours(
    primary: BranchDeliveryHour[] | undefined,
    fallback: BranchDeliveryHour[],
  ): BranchDeliveryHour[] {
    return this.hasUsableScheduleHours(primary) ? (primary ?? []) : fallback;
  }

  private hasConfiguredScheduleHours(input: BranchDeliveryHour[] | undefined) {
    return this.hasUsableScheduleHours(input);
  }

  private hasUsableScheduleHours(input: BranchDeliveryHour[] | undefined) {
    return (
      Array.isArray(input) &&
      input.some((item) => !item.isClosed && item.openTime && item.closeTime)
    );
  }

  private async assertDineInTableCapacity(
    tx: PrismaTx,
    orderType: OrderTypeEnum,
    branchId: string,
    orderTime: string | null,
    settings: BranchSettings,
  ) {
    if (orderType !== OrderTypeEnum.DINE_IN) {
      return;
    }

    if (!settings.tableReservationsEnabled && !settings.tableCount) {
      return;
    }

    if (!orderTime) {
      throw new BadRequestException(
        'orderTime is required for table reservations',
      );
    }

    const tableCount = settings.tableCount ?? 0;
    if (tableCount <= 0) {
      throw new BadRequestException(
        'No tables are available for reservations at this branch',
      );
    }

    const activeReservations = await tx.order.count({
      where: {
        branchId,
        orderType: OrderType.DINE_IN,
        orderTime: new Date(orderTime),
        status: {
          notIn: [
            OrderStatus.CANCELLED,
            OrderStatus.REJECTED,
            OrderStatus.SERVED,
          ],
        },
      },
    });

    if (activeReservations >= tableCount) {
      throw new BadRequestException(
        'No tables are available for the selected time slot',
      );
    }
  }

  private withPlatformPaymentMethods(methods: string[]) {
    return [...new Set([...methods, 'COD', 'PAYPAL'])];
  }

  private async resolvePlatformServiceChargeConfig(
    fallback: BranchSettings['serviceCharge'],
  ): Promise<ServiceChargeSettingsShape> {
    if (this.globalSettingsService) {
      return this.globalSettingsService.getServiceChargeConfig();
    }

    const globalSettingDelegate = (
      this.prisma as unknown as {
        globalSetting?: {
          findUnique: (args: {
            where: { scopeKey: string };
            select: {
              serviceChargeEnabled: boolean;
              serviceChargeType: boolean;
              serviceChargeValue: boolean;
            };
          }) => Promise<{
            serviceChargeEnabled: boolean;
            serviceChargeType: ServiceChargeType;
            serviceChargeValue: Prisma.Decimal;
          } | null>;
        };
      }
    ).globalSetting;

    if (!globalSettingDelegate) {
      return fallback;
    }

    const settings = await globalSettingDelegate.findUnique({
      where: { scopeKey: 'GLOBAL' },
      select: {
        serviceChargeEnabled: true,
        serviceChargeType: true,
        serviceChargeValue: true,
      },
    });

    if (!settings) {
      return {
        isEnabled: false,
        type: ServiceChargeType.PERCENTAGE,
        value: 0,
      };
    }

    return {
      isEnabled: settings.serviceChargeEnabled,
      type: settings.serviceChargeType,
      value: Number(settings.serviceChargeValue),
    };
  }

  private resolveRestaurantServiceCharge(
    restaurantSettingsInput: unknown,
    legacyBranchFallback: BranchSettings['serviceCharge'],
  ): ServiceChargeSettingsShape {
    const restaurantSettings = this.asRecord(restaurantSettingsInput);
    const serviceCharge = this.asRecord(restaurantSettings.serviceCharge);
    const source = Object.keys(serviceCharge).length
      ? serviceCharge
      : legacyBranchFallback;

    return {
      isEnabled: Boolean(source.isEnabled),
      type:
        source.type === ServiceChargeType.AMOUNT
          ? ServiceChargeType.AMOUNT
          : ServiceChargeType.PERCENTAGE,
      value: this.toFiniteNumber(source.value, 0),
    };
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private resolveServiceCharge(
    config: BranchSettings['serviceCharge'],
    subtotal: Prisma.Decimal,
  ) {
    const type = config.type ?? ServiceChargeType.PERCENTAGE;
    const value = new Prisma.Decimal(config.value ?? 0).toDecimalPlaces(2);

    if (!config.isEnabled || value.lessThanOrEqualTo(0)) {
      return {
        type: null,
        value: null,
        amount: new Prisma.Decimal(0),
      };
    }

    const amount =
      type === ServiceChargeType.PERCENTAGE
        ? subtotal.mul(value).div(100)
        : value;

    return {
      type,
      value,
      amount: amount.toDecimalPlaces(2),
    };
  }

  private async buildChargeBreakdown(
    lines: QuoteLine[],
    fallbackTaxPercentage: number,
    totalTaxAmount: Prisma.Decimal,
    serviceCharge: {
      type: ServiceChargeType | null;
      value: Prisma.Decimal | null;
      amount: Prisma.Decimal;
    },
  ) {
    const taxTypes = await this.resolveGlobalTaxTypes(fallbackTaxPercentage);
    const taxTypeMap = new Map(
      taxTypes.map((taxType) => [taxType.code, taxType]),
    );
    const taxes = new Map<
      string,
      {
        code: string;
        label: string;
        percentage: number;
        amount: Prisma.Decimal;
      }
    >();

    for (const line of lines) {
      const percentage = Number(
        line.taxPercentage ?? new Prisma.Decimal(fallbackTaxPercentage),
      );
      const configuredTaxType = line.taxTypeCode
        ? taxTypeMap.get(line.taxTypeCode)
        : undefined;
      const code = configuredTaxType?.code ?? line.taxTypeCode ?? 'STANDARD';
      const label = configuredTaxType?.label ?? code;
      const existing = taxes.get(code);
      const amount = line.lineTotal
        .mul(new Prisma.Decimal(percentage))
        .div(100)
        .toDecimalPlaces(2);

      taxes.set(code, {
        code,
        label,
        percentage,
        amount: (existing?.amount ?? new Prisma.Decimal(0)).plus(amount),
      });
    }

    return {
      taxes: Array.from(taxes.values()).map((tax) => ({
        ...tax,
        amount: Number(tax.amount.toDecimalPlaces(2)),
      })),
      availableTaxTypes: taxTypes,
      totalTaxAmount: Number(totalTaxAmount.toDecimalPlaces(2)),
      serviceCharges: serviceCharge.amount.greaterThan(0)
        ? [
            {
              code: 'SERVICE_CHARGE',
              label: 'Service charge',
              type: serviceCharge.type,
              value: serviceCharge.value ? Number(serviceCharge.value) : null,
              amount: Number(serviceCharge.amount.toDecimalPlaces(2)),
            },
          ]
        : [],
      totalServiceChargeAmount: Number(serviceCharge.amount.toDecimalPlaces(2)),
      transactionFees: [],
      totalTransactionFeeAmount: 0,
    };
  }

  private async resolveGlobalTaxTypes(fallbackTaxPercentage: number) {
    const globalSettingDelegate = (
      this.prisma as unknown as {
        globalSetting?: {
          findUnique: (args: {
            where: { scopeKey: string };
            select: { taxTypes: boolean; globalTaxPercentage: boolean };
          }) => Promise<{
            taxTypes: Prisma.JsonValue | null;
            globalTaxPercentage: Prisma.Decimal;
          } | null>;
        };
      }
    ).globalSetting;
    const settings = globalSettingDelegate
      ? await globalSettingDelegate.findUnique({
          where: { scopeKey: 'GLOBAL' },
          select: { taxTypes: true, globalTaxPercentage: true },
        })
      : null;
    const fallback = [
      {
        code: 'STANDARD',
        label: 'Standard tax',
        percentage: Number(
          (settings?.globalTaxPercentage ?? fallbackTaxPercentage).toString(),
        ),
        isActive: true,
        isDefault: true,
      },
    ];

    if (!Array.isArray(settings?.taxTypes)) {
      return fallback;
    }

    const taxTypes = settings.taxTypes.flatMap((row) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        return [];
      }
      const value = row as Record<string, unknown>;
      const code =
        typeof value.code === 'string' ? value.code.trim().toUpperCase() : '';
      if (!code) {
        return [];
      }

      return [
        {
          code,
          label:
            typeof value.label === 'string' && value.label.trim()
              ? value.label.trim()
              : code,
          percentage: this.toFiniteNumber(value.percentage, 0),
          isActive: typeof value.isActive === 'boolean' ? value.isActive : true,
          isDefault:
            typeof value.isDefault === 'boolean' ? value.isDefault : false,
        },
      ];
    });

    return taxTypes.length ? taxTypes : fallback;
  }

  private toFiniteNumber(value: unknown, fallback: number) {
    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value)
          : NaN;

    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private resolveTipAmount(tipAmount?: number) {
    return new Prisma.Decimal(tipAmount ?? 0).toDecimalPlaces(2);
  }

  private assertBranchAcceptingOrders(
    settings: BranchSettings,
    orderTime: string | null,
    timeZone = DEFAULT_SCHEDULE_TIMEZONE,
  ) {
    const closure = settings.temporaryClosure;
    const holidayOpeningHour = this.resolveHolidayOpeningHourForOrderTime(
      settings.holidayOpeningHours,
      orderTime,
      timeZone,
    );

    if (this.isOrderTimeBlockedByTemporaryClosure(closure, orderTime)) {
      throw new BadRequestException({
        message: closure?.message ?? 'Branch is temporarily closed',
        error: 'BRANCH_TEMPORARILY_CLOSED',
        details: {
          reason: closure?.reason ?? null,
          closedUntil: closure?.closedUntil ?? null,
        },
      });
    }

    if (holidayOpeningHour?.isClosed) {
      throw new BadRequestException({
        message: holidayOpeningHour.note ?? 'Branch is closed for holiday',
        error: 'BRANCH_HOLIDAY_CLOSED',
        details: {
          date: holidayOpeningHour.date ?? null,
          fromDate: holidayOpeningHour.fromDate ?? null,
          toDate: holidayOpeningHour.toDate ?? null,
          note: holidayOpeningHour.note ?? null,
        },
      });
    }
  }

  private isOrderTimeBlockedByTemporaryClosure(
    closure: BranchTemporaryClosure | null,
    orderTime: string | null,
  ) {
    if (!closure?.isClosed) {
      return false;
    }

    if (!closure.closedUntil) {
      return true;
    }

    const closedUntil = new Date(closure.closedUntil).getTime();
    if (!Number.isFinite(closedUntil)) {
      return true;
    }

    const now = Date.now();
    if (closedUntil <= now) {
      return false;
    }

    if (!orderTime) {
      return true;
    }

    const requestedAt = new Date(orderTime).getTime();
    if (!Number.isFinite(requestedAt)) {
      return true;
    }

    return requestedAt <= closedUntil;
  }

  private assertDeliveryOrderWithinHours(
    settings: BranchSettings,
    orderType: OrderTypeEnum,
    orderTime: string | null,
    timeZone = DEFAULT_SCHEDULE_TIMEZONE,
  ) {
    if (
      orderType !== OrderTypeEnum.DELIVERY &&
      orderType !== OrderTypeEnum.TAKEAWAY
    ) {
      return;
    }

    const availabilityMessage =
      orderType === OrderTypeEnum.TAKEAWAY
        ? 'Pickup is not available at requested order time'
        : 'Delivery is not available at requested order time';

    const effectiveOrderTime = orderTime ?? new Date().toISOString();
    const local = this.getScheduleLocalParts(effectiveOrderTime, timeZone);
    const holidayOpeningHour = local
      ? this.resolveHolidayOpeningHourForDate(
          settings.holidayOpeningHours,
          local.date,
        )
      : null;
    const baseSchedule = this.resolveOrderTypeSchedule(settings, orderType);

    if (!holidayOpeningHour && !baseSchedule.length) {
      return;
    }

    const daySchedule = holidayOpeningHour
      ? this.toHolidayDeliveryHour(local?.dayOfWeek, holidayOpeningHour)
      : local
        ? baseSchedule.find((item) => item.dayOfWeek === local.dayOfWeek)
        : null;

    if (
      !local ||
      !daySchedule ||
      daySchedule.isClosed ||
      !daySchedule.openTime ||
      !daySchedule.closeTime
    ) {
      throw new BadRequestException(availabilityMessage);
    }

    const openMinutes = this.parseScheduleTimeMinutes(daySchedule.openTime);
    const closeMinutes = this.parseScheduleTimeMinutes(daySchedule.closeTime);

    if (openMinutes === null || closeMinutes === null) {
      throw new BadRequestException(availabilityMessage);
    }

    const inDeliveryWindow =
      openMinutes <= closeMinutes
        ? local.minutes >= openMinutes && local.minutes < closeMinutes
        : local.minutes >= openMinutes || local.minutes < closeMinutes;

    if (!inDeliveryWindow) {
      throw new BadRequestException(availabilityMessage);
    }

    const isInBreak = (daySchedule.breakTimes ?? []).some((breakTime) => {
      const startMinutes = this.parseScheduleTimeMinutes(breakTime.startTime);
      const endMinutes = this.parseScheduleTimeMinutes(breakTime.endTime);

      if (startMinutes === null || endMinutes === null) {
        return false;
      }

      return local.minutes >= startMinutes && local.minutes < endMinutes;
    });

    if (isInBreak) {
      throw new BadRequestException(availabilityMessage);
    }
  }

  private resolveOrderTypeSchedule(
    settings: BranchSettings,
    orderType: OrderTypeEnum,
  ) {
    const openingHours = settings.openingHours ?? [];

    if (orderType === OrderTypeEnum.TAKEAWAY) {
      return openingHours;
    }

    const deliveryHours = settings.deliveryHours ?? [];
    return deliveryHours.length ? deliveryHours : openingHours;
  }

  private resolveHolidayOpeningHourForDate(
    holidayOpeningHours: BranchHolidayOpeningHour[] | undefined,
    date: string,
  ): BranchHolidayOpeningHour | null {
    if (!Array.isArray(holidayOpeningHours)) {
      return null;
    }

    return (
      holidayOpeningHours.find((item) => this.isHolidayDateMatch(item, date)) ??
      null
    );
  }

  private resolveHolidayOpeningHourForOrderTime(
    holidayOpeningHours: BranchHolidayOpeningHour[] | undefined,
    orderTime: string | null,
    timeZone = DEFAULT_SCHEDULE_TIMEZONE,
  ): BranchHolidayOpeningHour | null {
    const local = this.getScheduleLocalParts(orderTime, timeZone);
    return local
      ? this.resolveHolidayOpeningHourForDate(holidayOpeningHours, local.date)
      : this.resolveTodayHolidayOpeningHour(
          holidayOpeningHours ?? [],
          timeZone,
        );
  }

  private toHolidayDeliveryHour(
    dayOfWeek: BranchScheduleDay | undefined,
    holidayOpeningHour: BranchHolidayOpeningHour,
  ): BranchDeliveryHour | null {
    if (!dayOfWeek) {
      return null;
    }

    return {
      dayOfWeek,
      isClosed: holidayOpeningHour.isClosed,
      openTime: holidayOpeningHour.openTime,
      closeTime: holidayOpeningHour.closeTime,
      breakTimes: [],
    };
  }

  private getScheduleLocalParts(
    orderTime: string | null,
    timeZone = DEFAULT_SCHEDULE_TIMEZONE,
  ) {
    if (!orderTime) {
      return null;
    }

    const localParts = this.parseTimezoneLessScheduleParts(orderTime);
    if (localParts) {
      return localParts;
    }

    const date = new Date(orderTime);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'long',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const dayOfWeek = parts
      .find((part) => part.type === 'weekday')
      ?.value.toUpperCase();
    const rawHour = Number(parts.find((part) => part.type === 'hour')?.value);
    const hour = rawHour === 24 ? 0 : rawHour;
    const minute = Number(parts.find((part) => part.type === 'minute')?.value);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;

    if (
      !this.isScheduleDay(dayOfWeek) ||
      Number.isNaN(hour) ||
      Number.isNaN(minute) ||
      !year ||
      !month ||
      !day
    ) {
      return null;
    }

    return {
      date: `${year}-${month}-${day}`,
      dayOfWeek,
      minutes: hour * 60 + minute,
    };
  }

  private parseTimezoneLessScheduleParts(orderTime: string) {
    const match =
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d{1,3})?)?$/.exec(
        orderTime,
      );

    if (!match) {
      return null;
    }

    const [, year, month, day, hourValue, minuteValue] = match;
    const hour = Number(hourValue);
    const minute = Number(minuteValue);
    const date = new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day)),
    );
    const dayOfWeek = date
      .toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
      .toUpperCase();

    if (
      !this.isScheduleDay(dayOfWeek) ||
      Number.isNaN(hour) ||
      Number.isNaN(minute) ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      return null;
    }

    return {
      date: `${year}-${month}-${day}`,
      dayOfWeek,
      minutes: hour * 60 + minute,
    };
  }

  private async resolveScheduleTimeZone() {
    try {
      const timezone = (await this.globalSettingsService?.getSettings())?.data
        ?.timezone;

      return timezone || DEFAULT_SCHEDULE_TIMEZONE;
    } catch {
      return DEFAULT_SCHEDULE_TIMEZONE;
    }
  }

  private isScheduleDay(value: unknown): value is BranchScheduleDay {
    return (
      typeof value === 'string' &&
      [
        'MONDAY',
        'TUESDAY',
        'WEDNESDAY',
        'THURSDAY',
        'FRIDAY',
        'SATURDAY',
        'SUNDAY',
      ].includes(value)
    );
  }

  private parseScheduleTimeMinutes(value: unknown): number | null {
    if (typeof value !== 'string') {
      return null;
    }

    const match = value.match(/^(\d{2}):(\d{2})$/);
    if (!match) {
      return null;
    }

    const hour = Number(match[1]);
    const minute = Number(match[2]);

    if (
      Number.isNaN(hour) ||
      Number.isNaN(minute) ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      return null;
    }

    return hour * 60 + minute;
  }

  private resolveTodayHolidayOpeningHour(
    holidayOpeningHours: BranchHolidayOpeningHour[],
    timeZone = DEFAULT_SCHEDULE_TIMEZONE,
  ): BranchHolidayOpeningHour | null {
    const today = this.getScheduleLocalParts(
      new Date().toISOString(),
      timeZone,
    )?.date;
    return today
      ? (holidayOpeningHours.find((item) =>
          this.isHolidayDateMatch(item, today),
        ) ?? null)
      : null;
  }

  private isHolidayDateMatch(item: BranchHolidayOpeningHour, date: string) {
    if (item.date) {
      return item.date === date;
    }

    return (
      !!item.fromDate &&
      !!item.toDate &&
      item.fromDate <= date &&
      item.toDate >= date
    );
  }

  private async resolveDeliveryFeeForAddress(
    customerId: string,
    deliveryAddressId: string,
    branchId: string,
    deliveryConfig: BranchSettings['deliveryConfig'],
    subtotal: Prisma.Decimal,
    enforceMinimumOrderAmount: boolean,
  ) {
    const { address, branchAddress } = await this.resolveDeliveryLocations(
      customerId,
      deliveryAddressId,
      branchId,
    );

    switch (deliveryConfig.mode) {
      case 'ZONE':
        return this.resolveZoneDeliveryFee(
          address,
          deliveryConfig.zones ?? [],
          subtotal,
          deliveryConfig.minOrderAmount,
          enforceMinimumOrderAmount,
        );
      case 'ZONE_BANDS':
        return this.resolveZoneBandDeliveryFee(
          address,
          branchAddress,
          deliveryConfig.zoneBands ?? [],
          subtotal,
          deliveryConfig.minOrderAmount,
          enforceMinimumOrderAmount,
        );
      case 'POSTAL_CODE':
        return this.resolvePostalCodeDeliveryFee(
          address,
          deliveryConfig.postalCodeRules ?? [],
          subtotal,
          deliveryConfig.minOrderAmount,
          enforceMinimumOrderAmount,
        );
      case 'RADIUS':
      default:
        if (enforceMinimumOrderAmount) {
          this.assertMinimumOrderAmount(
            subtotal,
            new Prisma.Decimal(deliveryConfig.minOrderAmount),
            'branch',
          );
        }
        return this.resolveRadiusDeliveryFee(
          address,
          branchAddress,
          deliveryConfig.radiusKm,
          deliveryConfig.deliveryFee,
        );
    }
  }

  private async resolveDeliveryFeeForGuestAddress(
    guestDeliveryAddress: GuestOrderDeliveryAddressDto,
    branchId: string,
    deliveryConfig: BranchSettings['deliveryConfig'],
    subtotal: Prisma.Decimal,
    enforceMinimumOrderAmount: boolean,
  ) {
    const address = this.toGuestDeliveryAddressContext(guestDeliveryAddress);
    const branchAddress = await this.resolveBranchAddress(branchId);

    switch (deliveryConfig.mode) {
      case 'ZONE':
        return this.resolveZoneDeliveryFee(
          address,
          deliveryConfig.zones ?? [],
          subtotal,
          deliveryConfig.minOrderAmount,
          enforceMinimumOrderAmount,
        );
      case 'ZONE_BANDS':
        return this.resolveZoneBandDeliveryFee(
          address,
          branchAddress,
          deliveryConfig.zoneBands ?? [],
          subtotal,
          deliveryConfig.minOrderAmount,
          enforceMinimumOrderAmount,
        );
      case 'POSTAL_CODE':
        return this.resolvePostalCodeDeliveryFee(
          address,
          deliveryConfig.postalCodeRules ?? [],
          subtotal,
          deliveryConfig.minOrderAmount,
          enforceMinimumOrderAmount,
        );
      case 'RADIUS':
      default:
        if (enforceMinimumOrderAmount) {
          this.assertMinimumOrderAmount(
            subtotal,
            new Prisma.Decimal(deliveryConfig.minOrderAmount),
            'branch',
          );
        }
        return this.resolveRadiusDeliveryFee(
          address,
          branchAddress,
          deliveryConfig.radiusKm,
          deliveryConfig.deliveryFee,
        );
    }
  }

  private async assertDeliveryAddressInCoverage(
    customerId: string,
    deliveryAddressId: string,
    branchId: string,
    deliveryConfig: BranchSettings['deliveryConfig'],
  ) {
    const { address, branchAddress } = await this.resolveDeliveryLocations(
      customerId,
      deliveryAddressId,
      branchId,
    );

    switch (deliveryConfig.mode) {
      case 'ZONE':
        this.assertAddressInDeliveryZone(address, deliveryConfig.zones ?? []);
        return;
      case 'ZONE_BANDS':
        this.assertAddressInDeliveryZoneBand(
          address,
          branchAddress,
          deliveryConfig.zoneBands ?? [],
        );
        return;
      case 'POSTAL_CODE':
        this.assertAddressPostalCodeServiceable(
          address,
          deliveryConfig.postalCodeRules ?? [],
        );
        return;
      case 'RADIUS':
      default:
        this.assertAddressInDeliveryRadius(
          address,
          branchAddress,
          deliveryConfig.radiusKm,
        );
    }
  }

  private async resolveDeliveryLocations(
    customerId: string,
    deliveryAddressId: string,
    branchId: string,
  ) {
    const address = await this.prisma.address.findFirst({
      where: {
        id: deliveryAddressId,
        refType: 'USER',
        referenceId: customerId,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        lat: true,
        lng: true,
        postalCode: true,
      },
    });

    if (!address) {
      throw new BadRequestException('Delivery address not found');
    }

    const branchAddress = await this.resolveBranchAddress(branchId);

    return { address, branchAddress };
  }

  private toCustomerAddressResponse<
    T extends {
      area?: string | null;
      lat?: Prisma.Decimal | number | null;
      lng?: Prisma.Decimal | number | null;
    },
  >(address: T) {
    return {
      ...address,
      houseNumber: address.area ?? null,
      lat:
        address.lat !== null && address.lat !== undefined
          ? Number(address.lat)
          : null,
      lng:
        address.lng !== null && address.lng !== undefined
          ? Number(address.lng)
          : null,
    };
  }

  private toBranchAddressResponse<
    T extends {
      area?: string | null;
      lat?: Prisma.Decimal | number | null;
      lng?: Prisma.Decimal | number | null;
    },
  >(address: T) {
    return {
      ...address,
      shopNumber: address.area ?? null,
      lat:
        address.lat !== null && address.lat !== undefined
          ? Number(address.lat)
          : null,
      lng:
        address.lng !== null && address.lng !== undefined
          ? Number(address.lng)
          : null,
    };
  }

  private async resolveBranchAddress(branchId: string) {
    return this.prisma.address.findFirst({
      where: {
        refType: AddressRefType.BRANCH,
        referenceId: branchId,
        deletedAt: null,
        isActive: true,
        lat: { not: null },
        lng: { not: null },
      },
      select: {
        lat: true,
        lng: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  private toGuestDeliveryAddressContext(
    address: GuestOrderDeliveryAddressDto,
  ): DeliveryAddressContext {
    return {
      id: 'guest-delivery-address',
      lat: new Prisma.Decimal(address.lat),
      lng: new Prisma.Decimal(address.lng),
      postalCode: address.postalCode ?? null,
    };
  }

  private resolveRadiusDeliveryFee(
    address: DeliveryAddressContext,
    branchAddress: BranchLocationContext | null,
    radiusKm: number,
    deliveryFee: number,
  ) {
    this.assertAddressInDeliveryRadius(address, branchAddress, radiusKm);

    return new Prisma.Decimal(deliveryFee);
  }

  private assertAddressInDeliveryRadius(
    address: DeliveryAddressContext,
    branchAddress: BranchLocationContext | null,
    radiusKm: number,
  ) {
    if (!address.lat || !address.lng) {
      throw new BadRequestException('Delivery address must include lat/lng');
    }

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

  private resolveZoneDeliveryFee(
    address: DeliveryAddressContext,
    zones: DeliveryZoneConfig[],
    subtotal: Prisma.Decimal,
    branchMinOrderAmount: number,
    enforceMinimumOrderAmount: boolean,
  ) {
    const match = this.assertAddressInDeliveryZone(address, zones);

    if (enforceMinimumOrderAmount) {
      this.assertMinimumOrderAmount(
        subtotal,
        new Prisma.Decimal(match.minOrderAmount ?? branchMinOrderAmount),
        'zone',
      );
    }

    if (
      match.freeDeliveryThreshold !== undefined &&
      match.freeDeliveryThreshold > 0 &&
      subtotal.greaterThanOrEqualTo(match.freeDeliveryThreshold)
    ) {
      return new Prisma.Decimal(0);
    }

    return new Prisma.Decimal(match.deliveryFee);
  }

  private resolveZoneBandDeliveryFee(
    address: DeliveryAddressContext,
    branchAddress: BranchLocationContext | null,
    zoneBands: DeliveryZoneBandConfig[],
    subtotal: Prisma.Decimal,
    branchMinOrderAmount: number,
    enforceMinimumOrderAmount: boolean,
  ) {
    const matchedBand = this.assertAddressInDeliveryZoneBand(
      address,
      branchAddress,
      zoneBands,
    );

    if (enforceMinimumOrderAmount) {
      this.assertMinimumOrderAmount(
        subtotal,
        new Prisma.Decimal(matchedBand.minOrderAmount ?? branchMinOrderAmount),
        'zone',
      );
    }

    if (
      matchedBand.freeDeliveryThreshold !== undefined &&
      matchedBand.freeDeliveryThreshold > 0 &&
      subtotal.greaterThanOrEqualTo(matchedBand.freeDeliveryThreshold)
    ) {
      return new Prisma.Decimal(0);
    }

    return new Prisma.Decimal(matchedBand.deliveryFee);
  }

  private assertAddressInDeliveryZone(
    address: DeliveryAddressContext,
    zones: DeliveryZoneConfig[],
  ) {
    if (!address.lat || !address.lng) {
      throw new BadRequestException('Delivery address must include lat/lng');
    }

    if (!zones.length) {
      throw new BadRequestException('Branch delivery zones are not configured');
    }

    const match = zones.find((zone) =>
      this.isPointInPolygon(
        Number(address.lat),
        Number(address.lng),
        zone.polygon,
      ),
    );

    if (!match) {
      throw new BadRequestException(
        'Delivery address is outside branch delivery zones',
      );
    }

    return match;
  }

  private assertAddressInDeliveryZoneBand(
    address: DeliveryAddressContext,
    branchAddress: BranchLocationContext | null,
    zoneBands: DeliveryZoneBandConfig[],
  ) {
    if (!address.lat || !address.lng) {
      throw new BadRequestException('Delivery address must include lat/lng');
    }

    if (!branchAddress?.lat || !branchAddress?.lng) {
      throw new BadRequestException('Branch location is missing lat/lng');
    }

    if (!zoneBands.length) {
      throw new BadRequestException(
        'Branch delivery zone bands are not configured',
      );
    }

    const distanceKm = this.calculateDistanceKm(
      Number(address.lat),
      Number(address.lng),
      Number(branchAddress.lat),
      Number(branchAddress.lng),
    );

    const sortedBands = [...zoneBands].sort((a, b) => a.fromKm - b.fromKm);
    const matchedBand = sortedBands.find((band, index) => {
      const isLastBand = index === sortedBands.length - 1;
      return (
        distanceKm >= band.fromKm &&
        (isLastBand ? distanceKm <= band.toKm : distanceKm < band.toKm)
      );
    });

    if (!matchedBand) {
      throw new BadRequestException(
        'Delivery address is outside branch delivery zone bands',
      );
    }

    return matchedBand;
  }

  private assertMinimumOrderAmount(
    subtotal: Prisma.Decimal,
    minOrderAmount: Prisma.Decimal,
    scope: 'branch' | 'zone',
  ) {
    if (subtotal.lessThan(minOrderAmount)) {
      const shortfall = minOrderAmount.minus(subtotal).toDecimalPlaces(2);
      const normalizedSubtotal = subtotal.toDecimalPlaces(2);
      const normalizedMinimum = minOrderAmount.toDecimalPlaces(2);

      throw new BadRequestException({
        message: `Subtotal is below ${scope} minimum order amount. Add ${shortfall.toFixed(2)} more to checkout.`,
        error: 'MINIMUM_ORDER_AMOUNT_NOT_MET',
        details: {
          scope,
          subtotal: Number(normalizedSubtotal),
          minOrderAmount: Number(normalizedMinimum),
          shortfall: Number(shortfall),
        },
      });
    }
  }

  private resolvePostalCodeDeliveryFee(
    address: DeliveryAddressContext,
    postalCodeRules: DeliveryPostalCodeRule[],
    subtotal: Prisma.Decimal,
    branchMinOrderAmount: number,
    enforceMinimumOrderAmount: boolean,
  ) {
    const matchedRule = this.assertAddressPostalCodeServiceable(
      address,
      postalCodeRules,
    );

    if (enforceMinimumOrderAmount) {
      this.assertMinimumOrderAmount(
        subtotal,
        new Prisma.Decimal(matchedRule.minOrderAmount ?? branchMinOrderAmount),
        'zone',
      );
    }

    if (
      matchedRule.freeDeliveryThreshold !== undefined &&
      matchedRule.freeDeliveryThreshold > 0 &&
      subtotal.greaterThanOrEqualTo(matchedRule.freeDeliveryThreshold)
    ) {
      return new Prisma.Decimal(0);
    }

    return new Prisma.Decimal(matchedRule.deliveryFee);
  }

  private assertAddressPostalCodeServiceable(
    address: DeliveryAddressContext,
    postalCodeRules: DeliveryPostalCodeRule[],
  ) {
    const postalCode = this.normalizePostalCode(address.postalCode);

    if (!postalCode) {
      throw new BadRequestException(
        'Delivery address must include postalCode for postal-code delivery pricing',
      );
    }

    const matchedRule = postalCodeRules.find(
      (rule) => this.normalizePostalCode(rule.postalCode) === postalCode,
    );

    if (!matchedRule) {
      throw new BadRequestException(
        'Delivery address postal code is not serviceable for this branch',
      );
    }

    return matchedRule;
  }

  private normalizePostalCode(value: string | null | undefined) {
    const normalized = value?.trim().toUpperCase() ?? '';
    return normalized.length ? normalized : null;
  }

  private isPointInPolygon(
    lat: number,
    lng: number,
    polygon: DeliveryZoneCoordinate[],
  ) {
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lng;
      const yi = polygon[i].lat;
      const xj = polygon[j].lng;
      const yj = polygon[j].lat;

      const intersects =
        yi > lat !== yj > lat &&
        lng < ((xj - xi) * (lat - yi)) / (yj - yi || Number.EPSILON) + xi;

      if (intersects) {
        inside = !inside;
      }
    }

    return inside;
  }

  private generateDeliveryOtp(): string {
    return randomInt(100000, 1000000).toString();
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

type BranchTemporaryClosure = {
  isClosed: boolean;
  closedUntil?: string | null;
  reason?: string | null;
  message?: string | null;
};

type BranchHolidayOpeningHour = {
  date?: string;
  fromDate?: string;
  toDate?: string;
  isClosed: boolean;
  openTime?: string | null;
  closeTime?: string | null;
  note?: string | null;
};

type BranchScheduleDay =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY';

type BranchDeliveryHourBreak = {
  startTime: string;
  endTime: string;
};

type BranchDeliveryHour = {
  dayOfWeek: BranchScheduleDay;
  isClosed: boolean;
  openTime?: string | null;
  closeTime?: string | null;
  breakTimes?: BranchDeliveryHourBreak[];
};

type BranchSettings = {
  allowedOrderTypes: string[];
  allowedPaymentMethods: string[];
  temporaryClosure: BranchTemporaryClosure | null;
  holidayOpeningHours: BranchHolidayOpeningHour[];
  openingHours: BranchDeliveryHour[];
  deliveryHours: BranchDeliveryHour[];
  tableReservationsEnabled: boolean;
  tableReservationAutoAccept: boolean;
  tableCount: number;
  deliveryConfig: {
    mode: 'RADIUS' | 'ZONE' | 'ZONE_BANDS' | 'POSTAL_CODE';
    radiusKm: number;
    minOrderAmount: number;
    deliveryFee: number;
    isFreeDelivery: boolean;
    freeDeliveryThreshold: number;
    zones: DeliveryZoneConfig[];
    zoneBands: DeliveryZoneBandConfig[];
    postalCodeRules: DeliveryPostalCodeRule[];
  };
  taxation: {
    taxPercentage: number;
  };
  serviceCharge: {
    isEnabled: boolean;
    type: ServiceChargeType;
    value: number;
  };
};

type DeliveryZoneCoordinate = {
  lat: number;
  lng: number;
};

type DeliveryZoneConfig = {
  name: string;
  deliveryFee: number;
  minOrderAmount?: number;
  freeDeliveryThreshold?: number;
  polygon: DeliveryZoneCoordinate[];
};

type DeliveryZoneBandConfig = {
  fromKm: number;
  toKm: number;
  deliveryFee: number;
  minOrderAmount?: number;
  freeDeliveryThreshold?: number;
};

type DeliveryPostalCodeRule = {
  postalCode: string;
  deliveryFee: number;
  minOrderAmount?: number;
  freeDeliveryThreshold?: number;
};
