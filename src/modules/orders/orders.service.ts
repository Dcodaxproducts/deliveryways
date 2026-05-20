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
  PaymentStatus,
  PaymentTransactionType,
  Prisma,
} from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import {
  OrderTypeEnum,
  PaymentMethodEnum,
  UserRoleEnum,
} from '../../common/enums';
import { buildPaginationMeta } from '../../common/utils';
import { isRestaurantMenuAvailableAt } from '../../common/utils';
import { ChatService } from '../chat/chat.service';
import { PrismaService } from '../../database';
import { CouponsService } from '../coupons/coupons.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LoyaltyWalletService } from '../loyalty-wallet/loyalty-wallet.service';
import { OrderTrackingRealtimeService } from './order-tracking.realtime.service';
import { StorageService } from '../storage/storage.service';
import {
  CancelOrderDto,
  CreateOrderDto,
  ListOrdersDto,
  OrderItemModifierDto,
  QuoteOrderDto,
  UpdateOrderStatusDto,
} from './dto';
import { OrdersRepository } from './orders.repository';

interface OrderModifierLink {
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
  priceDelta: Prisma.Decimal;
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
  menuItemName: string;
  variationId?: string;
  variationName?: string;
  quantity: number;
  depositAmount: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
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

type QuoteCustomerContext = {
  customerId: string;
};

type QuoteBranchContext = {
  id: string;
  tenantId: string;
  restaurantId: string;
  settings: unknown;
};

type BuildQuoteOptions = {
  skipDeliveryAddressValidation?: boolean;
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
  ) {}

  async quote(user: AuthUserContext, dto: QuoteOrderDto) {
    const quote = await this.buildQuote(user, dto, {
      skipDeliveryAddressValidation: Boolean(dto.couponCode),
    });

    return {
      data: this.toQuoteResponseData(quote, dto),
      message: 'Order quote generated successfully',
    };
  }

  async quoteForCouponValidation(user: AuthUserContext, dto: QuoteOrderDto) {
    const quote = await this.buildQuote(user, dto, {
      skipDeliveryAddressValidation: true,
    });

    return {
      data: this.toQuoteResponseData(quote, dto),
      message: 'Order quote generated successfully',
    };
  }

  async create(user: AuthUserContext, dto: CreateOrderDto) {
    const quote = await this.buildQuote(user, dto);
    const currency = await this.resolveRestaurantCurrency(
      quote.branch.restaurantId,
    );

    const branchSettings = this.readBranchSettings(quote.branch.settings);
    if (!this.isPaymentAllowed(branchSettings, dto.paymentMethod)) {
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
          orderTime: new Date(dto.orderTime),
          isScheduled: this.isScheduledOrderTime(dto.orderTime),
          status: OrderStatus.PLACED,
          subtotal: quote.subtotal,
          taxAmount: quote.taxAmount,
          deliveryFee: quote.deliveryFee,
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
    }

    await this.notificationsService.notifyOrderPlaced(data.id);
    await this.emitTrackingUpdate(data.id);

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
    const { items, total } = await this.ordersRepository.list(
      restaurantId,
      query,
      customerId,
      deliverymanId,
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
      await this.assertOrderAccess(
        user,
        order.restaurantId,
        order.customerId,
        true,
      );
    }

    if (
      !this.isValidStatusTransition(order.orderType, order.status, dto.status)
    ) {
      throw new BadRequestException('Invalid order status transition');
    }

    this.assertDeliveryOtpForCompletion(order, dto);

    const data = await this.ordersRepository.updateStatus(id, dto.status);

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

    this.assertValidOrderTime(dto.orderTime);

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

    await this.ensureBranchAccess(user, branch.restaurantId, branch.id);

    const settings = this.readBranchSettings(branch.settings);
    this.assertBranchAcceptingOrders(settings);
    const customer = await this.resolveQuoteCustomer(
      user,
      branch,
      dto.customerId,
    );

    if (!settings.allowedOrderTypes.includes(dto.orderType)) {
      throw new BadRequestException(
        'Order type is not supported by this branch',
      );
    }

    const selectedMenu = dto.restaurantMenuId
      ? await this.resolveSelectedRestaurantMenu(
          branch.restaurantId,
          dto.restaurantMenuId,
          dto.orderTime,
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
        !selectedMenu.categoryIds.has(menuItem.category.id)
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

      if (requestedItem.modifiers?.length) {
        for (const requestedModifier of requestedItem.modifiers) {
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

      this.assertModifierSelectionLimits(
        menuItem,
        requestedItem.modifiers ?? [],
      );
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
            !selectedMenu.categoryIds.has(sectionItem.category.id)
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

          if (requestedItem.variationId && !sectionVariation) {
            throw new BadRequestException(
              `Variation not found for split section: ${sectionItem.name}`,
            );
          }

          variationName ??= sectionVariation?.name;

          const sectionPrice = this.resolveOrderItemBasePrice(
            {
              ...sectionItem,
              variations: sectionVariations,
            },
            sectionBranchOverride?.priceOverride,
            requestedItem.variationId,
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
        menuItemName: menuItem.name,
        variationId: requestedItem.variationId,
        variationName,
        quantity: requestedItem.quantity,
        depositAmount: depositAmount.toDecimalPlaces(2),
        unitPrice: unitPrice.toDecimalPlaces(2),
        lineTotal: lineTotal.toDecimalPlaces(2),
        note: requestedItem.note,
        snapshotModifiers,
        snapshotSections,
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
      if (!options.skipDeliveryAddressValidation && !dto.deliveryAddressId) {
        throw new BadRequestException(
          'deliveryAddressId is required for delivery orders',
        );
      }

      if (!options.skipDeliveryAddressValidation && dto.deliveryAddressId) {
        await this.assertAddressWithinRadius(
          customer.customerId,
          dto.deliveryAddressId,
          branch.id,
          settings.deliveryConfig.radiusKm,
        );
      }

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
      const couponValidation = await this.couponsService.validateForCheckout({
        restaurantId: branch.restaurantId,
        branchId: branch.id,
        customerId: customer.customerId,
        code: dto.couponCode,
        subtotal: Number(subtotal),
        menuItemIds: lines.map((line) => line.menuItemId),
        categoryIds: lines.map((line) => line.categoryId),
      });

      discountAmount = couponValidation.discountAmount;
      couponId = couponValidation.coupon.id;
      appliedCouponCode = couponValidation.coupon.code;
    }

    let totalBeforeBenefits = subtotal
      .plus(taxAmount)
      .plus(deliveryFee)
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
      lines,
      subtotal: subtotal.toDecimalPlaces(2),
      taxAmount,
      deliveryFee: deliveryFee.toDecimalPlaces(2),
      discountAmount: discountAmount.toDecimalPlaces(2),
      walletAppliedAmount: benefits.walletAppliedAmount,
      loyaltyDiscountAmount: benefits.loyaltyDiscountAmount,
      loyaltyPointsRedeemed: benefits.loyaltyPointsRedeemed,
      totalAmount: benefits.totalAmount,
      couponId,
      appliedCouponCode,
    };
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

    return this.readRestaurantCurrency(restaurant?.settings) ?? 'PKR';
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
    discountAmount: Prisma.Decimal;
    loyaltyDiscountAmount?: Prisma.Decimal;
    walletAppliedAmount?: Prisma.Decimal;
    payableAmount: Prisma.Decimal;
  }) {
    const loyaltyDiscountAmount =
      amounts.loyaltyDiscountAmount ?? new Prisma.Decimal(0);
    const walletAppliedAmount =
      amounts.walletAppliedAmount ?? new Prisma.Decimal(0);

    return {
      subtotal: Number(amounts.subtotal),
      taxAmount: Number(amounts.taxAmount),
      deliveryFee: Number(amounts.deliveryFee),
      discountAmount: Number(amounts.discountAmount),
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
      orderTime: dto.orderTime,
      isScheduled: this.isScheduledOrderTime(dto.orderTime),
      subtotal: amountSummary.subtotal,
      taxAmount: amountSummary.taxAmount,
      deliveryFee: amountSummary.deliveryFee,
      discountAmount: amountSummary.discountAmount,
      walletAppliedAmount: amountSummary.walletAppliedAmount,
      loyaltyDiscountAmount: amountSummary.loyaltyDiscountAmount,
      loyaltyPointsRedeemed: quote.loyaltyPointsRedeemed,
      totalAmount: amountSummary.totalAmount,
      payableAmount: amountSummary.payableAmount,
      couponCode: quote.appliedCouponCode,
      restaurantMenuId: dto.restaurantMenuId ?? null,
      items: quote.lines.map((line) => ({
        menuItemId: line.menuItemId,
        menuItemName: line.menuItemName,
        variationId: line.variationId,
        variationName: line.variationName,
        quantity: line.quantity,
        depositAmount: Number(line.depositAmount),
        unitPrice: Number(line.unitPrice),
        lineTotal: Number(line.lineTotal),
        note: line.note,
        snapshotModifiers: line.snapshotModifiers,
        snapshotSections: line.snapshotSections,
      })),
    };
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
      profile: {
        firstName: string;
        lastName: string;
        phone: string | null;
        avatarUrl: string | null;
      } | null;
    };
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
        discountAmount: order.discountAmount,
        loyaltyDiscountAmount: order.loyaltyDiscountAmount,
        walletAppliedAmount: order.walletAppliedAmount,
        payableAmount: order.totalAmount,
      }),
      customerNote: order.customerNote,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      restaurant: order.restaurant,
      branch: order.branch,
      coupon: order.coupon,
      customer: this.toCustomerSummary(order.customer),
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
        snapshotModifiers: this.readSnapshotModifiers(item.snapshotModifiers),
        snapshotSections: this.readSnapshotSections(item.snapshotModifiers),
      })),
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
      };
      coupon: { id: string; code: string; title: string } | null;
      customer: {
        id: string;
        email: string;
        profile: {
          firstName: string;
          lastName: string;
          phone: string | null;
          avatarUrl: string | null;
        } | null;
      };
      deliveryAddress: {
        id: string;
        street: string;
        area: string | null;
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
        discountAmount: order.discountAmount,
        loyaltyDiscountAmount: order.loyaltyDiscountAmount,
        walletAppliedAmount: order.walletAppliedAmount,
        payableAmount: order.totalAmount,
      }),
      customerNote: order.customerNote,
      assignedAt: order.assignedAt,
      deliveredAt: order.deliveredAt,
      paidAt: order.paidAt,
      cancelledAt: order.cancelledAt,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      restaurant: order.restaurant,
      branch: order.branch,
      coupon: order.coupon,
      customer: this.toCustomerSummary(order.customer),
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
        snapshotModifiers: this.readSnapshotModifiers(item.snapshotModifiers),
        snapshotSections: this.readSnapshotSections(item.snapshotModifiers),
      })),
      deliveryAddress: order.deliveryAddress
        ? {
            ...order.deliveryAddress,
            lat:
              order.deliveryAddress.lat !== null
                ? Number(order.deliveryAddress.lat)
                : null,
            lng:
              order.deliveryAddress.lng !== null
                ? Number(order.deliveryAddress.lng)
                : null,
          }
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
    profile: {
      firstName: string;
      lastName: string;
      phone: string | null;
      avatarUrl: string | null;
    } | null;
  }) {
    return {
      id: customer.id,
      email: customer.email,
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
          ? {
              ...branchAddress,
              lat:
                branchAddress.lat !== null ? Number(branchAddress.lat) : null,
              lng:
                branchAddress.lng !== null ? Number(branchAddress.lng) : null,
            }
          : null,
      },
      deliveryAddress: order.deliveryAddress
        ? {
            ...order.deliveryAddress,
            lat:
              order.deliveryAddress.lat !== null
                ? Number(order.deliveryAddress.lat)
                : null,
            lng:
              order.deliveryAddress.lng !== null
                ? Number(order.deliveryAddress.lng)
                : null,
          }
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

      return { customerId: user.uid };
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
      },
    });

    if (!customer) {
      throw new BadRequestException('Customer not found for this restaurant');
    }

    return { customerId: customer.id };
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

  private isValidStatusTransition(
    orderType: OrderType,
    current: OrderStatus,
    next: OrderStatus,
  ): boolean {
    const baseTransitions: Record<OrderStatus, OrderStatus[]> = {
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
  ): boolean {
    if (paymentMethod === 'WALLET') {
      return true;
    }

    return settings.allowedPaymentMethods.includes(paymentMethod);
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

    for (const link of this.getAvailableModifierLinks(item)) {
      const found = link.modifierGroup.modifierLinks.find(
        (modifierLink) => modifierLink.modifier.id === modifierId,
      )?.modifier;

      if (found) {
        return this.resolveModifierPricing(found, menuItemId, variationId);
      }
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
  ) {
    const totalSelected = modifiers.reduce(
      (sum, modifier) => sum + (modifier.quantity ?? 1),
      0,
    );
    const minSelect = menuItem.minSelect ?? 0;
    const maxSelect = menuItem.maxSelect ?? null;

    if ((menuItem.isRequired || minSelect > 0) && totalSelected < minSelect) {
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
  ) {
    if (!sections?.length) {
      return modifiers?.length ? modifiers : [];
    }

    return {
      modifiers: modifiers?.length ? modifiers : [],
      sections,
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

  private readBranchSettings(input: unknown): BranchSettings {
    const fallback: BranchSettings = {
      allowedOrderTypes: [OrderTypeEnum.DELIVERY, OrderTypeEnum.TAKEAWAY],
      allowedPaymentMethods: ['COD', 'WALLET'],
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
      temporaryClosure: null,
      holidayOpeningHours: [],
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
      temporaryClosure: raw.temporaryClosure ?? fallback.temporaryClosure,
      holidayOpeningHours:
        raw.holidayOpeningHours ?? fallback.holidayOpeningHours,
    };
  }

  private assertBranchAcceptingOrders(settings: BranchSettings) {
    const closure = settings.temporaryClosure;
    const holidayOpeningHour = this.resolveTodayHolidayOpeningHour(
      settings.holidayOpeningHours,
    );

    if (
      closure?.isClosed &&
      closure.closedUntil &&
      new Date(closure.closedUntil).getTime() <= Date.now()
    ) {
      // Expired closures reopen automatically; keep checking holiday rules.
    } else if (closure?.isClosed) {
      throw new BadRequestException({
        message: closure.message ?? 'Branch is temporarily closed',
        error: 'BRANCH_TEMPORARILY_CLOSED',
        details: {
          reason: closure.reason ?? null,
          closedUntil: closure.closedUntil ?? null,
        },
      });
    }

    if (holidayOpeningHour?.isClosed) {
      throw new BadRequestException({
        message: holidayOpeningHour.note ?? 'Branch is closed for holiday',
        error: 'BRANCH_HOLIDAY_CLOSED',
        details: {
          date: holidayOpeningHour.date,
          note: holidayOpeningHour.note ?? null,
        },
      });
    }
  }

  private resolveTodayHolidayOpeningHour(
    holidayOpeningHours: BranchHolidayOpeningHour[],
  ): BranchHolidayOpeningHour | null {
    const today = new Date().toISOString().slice(0, 10);
    return holidayOpeningHours.find((item) => item.date === today) ?? null;
  }

  private async assertAddressWithinRadius(
    customerId: string,
    deliveryAddressId: string,
    branchId: string,
    radiusKm: number,
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
        lat: true,
        lng: true,
      },
    });

    if (!address?.lat || !address?.lng) {
      throw new BadRequestException('Delivery address must include lat/lng');
    }

    const branchAddress = await this.prisma.address.findFirst({
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
  date: string;
  isClosed: boolean;
  openTime?: string | null;
  closeTime?: string | null;
  note?: string | null;
};

type BranchSettings = {
  allowedOrderTypes: string[];
  allowedPaymentMethods: string[];
  temporaryClosure: BranchTemporaryClosure | null;
  holidayOpeningHours: BranchHolidayOpeningHour[];
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
