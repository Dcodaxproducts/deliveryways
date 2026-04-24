import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderType,
  PaymentMethod,
  Prisma,
  VariationPricingMode,
} from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import {
  OrderTypeEnum,
  PaymentMethodEnum,
  UserRoleEnum,
} from '../../common/enums';
import { isRestaurantMenuAvailableAt } from '../../common/utils';
import { ProfilesRepository } from '../profiles/profiles.repository';
import { StorageService } from '../storage/storage.service';
import { CreateOrderDto, QuoteOrderDto } from '../orders/dto';
import { OrdersService } from '../orders/orders.service';
import {
  AddCartItemDto,
  CartItemModifierDto,
  CartItemSectionDto,
  CheckoutCartDto,
  QuoteCartDto,
  UpdateCartAddressDto,
  UpdateCartCouponDto,
  UpdateCartDto,
  UpdateCartItemDto,
  UpdateCartOrderTypeDto,
} from './dto';
import { CartRepository } from './cart.repository';

interface CartSnapshotItem {
  id: string;
  menuItemId: string;
  variationId: string | null;
  quantity: number;
  note: string | null;
  modifiers: Prisma.JsonValue | null;
}

interface CartSnapshot {
  id: string;
  tenantId: string;
  restaurantId: string;
  branchId: string;
  customerId: string;
  restaurantMenuId: string | null;
  orderType: OrderType;
  deliveryAddressId: string | null;
  couponCode: string | null;
  paymentMethod: PaymentMethod | null;
  orderTime: Date | null;
  customerNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: CartSnapshotItem[];
}

interface ResolvedCartCustomerScope {
  id: string;
  tenantId: string | null;
  restaurantId: string | null;
}

interface ScopedBranch {
  id: string;
  tenantId: string;
  restaurantId: string;
}

@Injectable()
export class CartService {
  constructor(
    private readonly cartRepository: CartRepository,
    private readonly ordersService: OrdersService,
    private readonly profilesRepository: ProfilesRepository,
    private readonly storageService?: StorageService,
  ) {}

  async getCart(
    user: AuthUserContext,
    requestedCustomerId?: string,
    requestedRestaurantId?: string,
  ) {
    const customerId = await this.resolveCartCustomerId(
      user,
      requestedCustomerId,
      requestedRestaurantId,
    );
    const cart = await this.cartRepository.findByCustomerId(customerId);

    if (!cart) {
      return {
        data: await this.buildEmptyCart(customerId),
        message: 'Cart fetched successfully',
      };
    }

    return {
      data: await this.buildCartResponse(cart),
      message: 'Cart fetched successfully',
    };
  }

  async updateCart(
    user: AuthUserContext,
    dto: UpdateCartDto,
    requestedCustomerId?: string,
    requestedRestaurantId?: string,
  ) {
    const customerId = await this.resolveCartCustomerId(
      user,
      requestedCustomerId,
      requestedRestaurantId,
    );
    const cart = await this.cartRepository.findByCustomerId(customerId);

    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    const nextOrderType = dto.orderType
      ? this.toOrderTypeModel(dto.orderType)
      : cart.orderType;
    const nextDeliveryAddressId = await this.resolveUpdatedDeliveryAddressId(
      cart,
      customerId,
      undefined,
      nextOrderType,
    );

    await this.cartRepository.update(cart.id, {
      orderType: dto.orderType,
      paymentMethod: dto.paymentMethod,
      orderTime: dto.orderTime ? new Date(dto.orderTime) : undefined,
      customerNote:
        dto.customerNote !== undefined
          ? this.resolveOptionalString(dto.customerNote)
          : undefined,
      deliveryAddress:
        dto.orderType !== undefined
          ? nextDeliveryAddressId
            ? { connect: { id: nextDeliveryAddressId } }
            : { disconnect: true }
          : undefined,
      restaurantMenu:
        dto.restaurantMenuId !== undefined
          ? await this.resolveRestaurantMenuRelationInput(
              cart.restaurantId,
              cart.restaurantMenuId,
              dto.restaurantMenuId,
              cart.items.length,
              cart.orderTime,
            )
          : undefined,
    });

    const updatedCart = await this.getExistingCartOrThrow(
      user,
      requestedCustomerId,
      requestedRestaurantId,
    );

    return {
      data: await this.buildCartResponse(updatedCart),
      message: 'Cart updated successfully',
    };
  }

  async updateOrderType(
    user: AuthUserContext,
    dto: UpdateCartOrderTypeDto,
    requestedCustomerId?: string,
    requestedRestaurantId?: string,
  ) {
    return this.updateCart(
      user,
      dto,
      requestedCustomerId,
      requestedRestaurantId,
    );
  }

  async updateAddress(
    user: AuthUserContext,
    dto: UpdateCartAddressDto,
    requestedCustomerId?: string,
    requestedRestaurantId?: string,
  ) {
    const customerId = await this.resolveCartCustomerId(
      user,
      requestedCustomerId,
      requestedRestaurantId,
    );
    const cart = await this.cartRepository.findByCustomerId(customerId);

    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    const nextDeliveryAddressId = await this.resolveUpdatedDeliveryAddressId(
      cart,
      customerId,
      dto.deliveryAddressId,
      cart.orderType,
    );

    await this.cartRepository.update(cart.id, {
      deliveryAddress:
        dto.deliveryAddressId !== undefined
          ? nextDeliveryAddressId
            ? { connect: { id: nextDeliveryAddressId } }
            : { disconnect: true }
          : undefined,
    });

    const updatedCart = await this.getExistingCartOrThrow(
      user,
      requestedCustomerId,
      requestedRestaurantId,
    );

    if (!updatedCart.items.length) {
      throw new BadRequestException('Cart is empty');
    }

    const quote = await this.ordersService.quote(
      user,
      await this.toQuotePayload(updatedCart),
    );

    return {
      data: quote.data,
      message: 'Cart address updated successfully',
    };
  }

  async applyCoupon(
    user: AuthUserContext,
    dto: UpdateCartCouponDto,
    requestedCustomerId?: string,
    requestedRestaurantId?: string,
  ) {
    const customerId = await this.resolveCartCustomerId(
      user,
      requestedCustomerId,
      requestedRestaurantId,
    );
    const cart = await this.cartRepository.findByCustomerId(customerId);

    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    if (!cart.items.length) {
      throw new BadRequestException('Cart is empty');
    }

    const couponCode = this.resolveOptionalString(dto.couponCode);

    if (!couponCode) {
      throw new BadRequestException('couponCode is required');
    }

    const quotePayload = await this.toQuotePayload(cart);
    const quote = await this.ordersService.quoteForCouponValidation(user, {
      ...quotePayload,
      deliveryAddressId: undefined,
      couponCode,
    });

    await this.cartRepository.update(cart.id, {
      couponCode,
    });

    const updatedCart = await this.getExistingCartOrThrow(
      user,
      requestedCustomerId,
      requestedRestaurantId,
    );

    return {
      data: {
        cart: await this.buildCartResponse(updatedCart),
        quote: quote.data,
      },
      message: 'Cart coupon updated successfully',
    };
  }

  async removeCoupon(
    user: AuthUserContext,
    requestedCustomerId?: string,
    requestedRestaurantId?: string,
  ) {
    const customerId = await this.resolveCartCustomerId(
      user,
      requestedCustomerId,
      requestedRestaurantId,
    );
    const cart = await this.cartRepository.findByCustomerId(customerId);

    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    await this.cartRepository.update(cart.id, {
      couponCode: null,
    });

    const updatedCart = await this.getExistingCartOrThrow(
      user,
      requestedCustomerId,
      requestedRestaurantId,
    );

    return {
      data: await this.buildCartResponse(updatedCart),
      message: 'Cart coupon removed successfully',
    };
  }

  async addItem(
    user: AuthUserContext,
    dto: AddCartItemDto,
    requestedCustomerId?: string,
    requestedRestaurantId?: string,
  ) {
    const cart = await this.getCartForAddItem(user, dto, requestedCustomerId);
    await this.assertValidCartItem(cart.restaurantId, cart.branchId, {
      ...dto,
      restaurantMenuId: cart.restaurantMenuId ?? dto.restaurantMenuId,
    });

    await this.cartRepository.createItem({
      cart: { connect: { id: cart.id } },
      menuItemId: dto.menuItemId,
      variationId: dto.variationId,
      quantity: dto.quantity,
      note: dto.note,
      modifiers: this.packCartSelections(
        dto.modifiers,
        dto.sections,
      ) as unknown as Prisma.InputJsonValue,
    });

    const updatedCart = await this.getExistingCartOrThrow(
      user,
      requestedCustomerId,
      requestedRestaurantId,
    );

    return {
      data: await this.buildCartResponse(updatedCart),
      message: 'Item added to cart successfully',
    };
  }

  async updateItem(
    user: AuthUserContext,
    itemId: string,
    dto: UpdateCartItemDto,
    requestedCustomerId?: string,
    requestedRestaurantId?: string,
  ) {
    const customerId = await this.resolveCartCustomerId(
      user,
      requestedCustomerId,
      requestedRestaurantId,
    );
    const item = await this.cartRepository.findItemByIdForCustomer(
      itemId,
      customerId,
    );

    if (!item) {
      throw new NotFoundException('Cart item not found');
    }

    const nextPayload: AddCartItemDto = {
      menuItemId: item.menuItemId,
      restaurantMenuId: item.cart.restaurantMenuId ?? undefined,
      variationId:
        dto.variationId !== undefined
          ? (dto.variationId ?? undefined)
          : (item.variationId ?? undefined),
      quantity: dto.quantity ?? item.quantity,
      note:
        dto.note !== undefined
          ? (dto.note ?? undefined)
          : (item.note ?? undefined),
      modifiers:
        dto.modifiers !== undefined
          ? (dto.modifiers ?? undefined)
          : this.readModifiers(item.modifiers),
      sections:
        dto.sections !== undefined
          ? (dto.sections ?? undefined)
          : this.readSections(item.modifiers),
    };

    await this.assertValidCartItem(
      item.cart.restaurantId,
      item.cart.branchId,
      nextPayload,
    );

    await this.cartRepository.updateItem(item.id, {
      variationId:
        dto.variationId !== undefined
          ? this.resolveOptionalString(dto.variationId)
          : undefined,
      quantity: dto.quantity,
      note:
        dto.note !== undefined
          ? this.resolveOptionalString(dto.note)
          : undefined,
      modifiers:
        dto.modifiers !== undefined || dto.sections !== undefined
          ? (this.packCartSelections(
              dto.modifiers !== undefined
                ? (dto.modifiers ?? undefined)
                : this.readModifiers(item.modifiers),
              dto.sections !== undefined
                ? (dto.sections ?? undefined)
                : this.readSections(item.modifiers),
            ) as Prisma.InputJsonValue | undefined)
          : undefined,
    });

    const updatedCart = await this.getExistingCartOrThrow(
      user,
      requestedCustomerId,
      requestedRestaurantId,
    );

    return {
      data: await this.buildCartResponse(updatedCart),
      message: 'Cart item updated successfully',
    };
  }

  async removeItem(
    user: AuthUserContext,
    itemId: string,
    requestedCustomerId?: string,
    requestedRestaurantId?: string,
  ) {
    const customerId = await this.resolveCartCustomerId(
      user,
      requestedCustomerId,
      requestedRestaurantId,
    );
    const item = await this.cartRepository.findItemByIdForCustomer(
      itemId,
      customerId,
    );

    if (!item) {
      throw new NotFoundException('Cart item not found');
    }

    await this.cartRepository.deleteItem(item.id);
    const cart = await this.cartRepository.findByCustomerId(
      item.cart.customerId,
    );

    return {
      data: cart
        ? await this.buildCartResponse(cart)
        : await this.buildEmptyCart(item.cart.customerId),
      message: 'Cart item removed successfully',
    };
  }

  async clearCart(
    user: AuthUserContext,
    requestedCustomerId?: string,
    requestedRestaurantId?: string,
  ) {
    const customerId = await this.resolveCartCustomerId(
      user,
      requestedCustomerId,
      requestedRestaurantId,
    );
    const cart = await this.cartRepository.findByCustomerId(customerId);

    if (cart) {
      await this.cartRepository.deleteByCustomerId(customerId);
    }

    return {
      data: await this.buildEmptyCart(customerId),
      message: 'Cart cleared successfully',
    };
  }

  async quote(
    user: AuthUserContext,
    _dto: QuoteCartDto,
    requestedCustomerId?: string,
    requestedRestaurantId?: string,
  ) {
    const cart = await this.getExistingCartOrThrow(
      user,
      requestedCustomerId,
      requestedRestaurantId,
    );
    if (!cart.items.length) {
      throw new BadRequestException('Cart is empty');
    }

    const quote = await this.ordersService.quote(
      user,
      await this.toQuotePayload(cart),
    );
    return {
      data: quote.data,
      message: 'Cart quote generated successfully',
    };
  }

  async checkout(
    user: AuthUserContext,
    dto: CheckoutCartDto,
    requestedCustomerId?: string,
    requestedRestaurantId?: string,
  ) {
    const cart = await this.getExistingCartOrThrow(
      user,
      requestedCustomerId,
      requestedRestaurantId,
    );
    if (!cart.items.length) {
      throw new BadRequestException('Cart is empty');
    }

    const order = await this.ordersService.create(
      user,
      await this.toCreateOrderPayload(cart, dto),
    );

    await this.cartRepository.deleteByCustomerId(cart.customerId);

    return {
      data: order.data,
      message: 'Order created from cart successfully',
    };
  }

  private async getExistingCartOrThrow(
    user: AuthUserContext,
    requestedCustomerId?: string,
    requestedRestaurantId?: string,
  ) {
    const customerId = await this.resolveCartCustomerId(
      user,
      requestedCustomerId,
      requestedRestaurantId,
    );
    const cart = await this.cartRepository.findByCustomerId(customerId);

    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    return cart;
  }

  private async getCartForAddItem(
    user: AuthUserContext,
    dto: AddCartItemDto,
    requestedCustomerId?: string,
    requestedRestaurantId?: string,
  ) {
    void requestedRestaurantId;

    const customer = await this.resolveCartCustomerScope(
      user,
      requestedCustomerId,
    );
    const existingCart = await this.cartRepository.findByCustomerId(
      customer.id,
    );
    const requestedBranchId = this.resolveOptionalString(dto.branchId);
    const requestedRestaurantMenuId = this.resolveOptionalString(
      dto.restaurantMenuId,
    );

    if (existingCart) {
      if (requestedBranchId && requestedBranchId !== existingCart.branchId) {
        if (!existingCart.items.length) {
          const branch = await this.resolveScopedBranch(
            customer,
            requestedBranchId,
          );

          const restaurantMenu = requestedRestaurantMenuId
            ? await this.requireRestaurantMenu(
                requestedRestaurantMenuId,
                branch.restaurantId,
                existingCart.orderTime,
              )
            : null;

          return this.cartRepository.update(existingCart.id, {
            tenant: { connect: { id: branch.tenantId } },
            restaurant: { connect: { id: branch.restaurantId } },
            branch: { connect: { id: branch.id } },
            restaurantMenu: restaurantMenu
              ? { connect: { id: restaurantMenu.id } }
              : undefined,
          });
        }

        throw new BadRequestException(
          'Cart already contains items from another branch. Clear it before switching branches',
        );
      }

      if (
        requestedRestaurantMenuId !== undefined &&
        requestedRestaurantMenuId !== existingCart.restaurantMenuId
      ) {
        if (existingCart.items.length) {
          throw new BadRequestException(
            'Clear cart items before changing selected menu',
          );
        }

        const restaurantMenu = requestedRestaurantMenuId
          ? await this.requireRestaurantMenu(
              requestedRestaurantMenuId,
              existingCart.restaurantId,
              existingCart.orderTime,
            )
          : null;

        return this.cartRepository.update(existingCart.id, {
          restaurantMenu: restaurantMenu
            ? { connect: { id: restaurantMenu.id } }
            : { disconnect: true },
        });
      }

      return existingCart;
    }

    if (!requestedBranchId) {
      throw new BadRequestException(
        'branchId is required when creating cart from add-to-cart',
      );
    }

    const branch = await this.resolveScopedBranch(customer, requestedBranchId);
    const restaurantMenu = requestedRestaurantMenuId
      ? await this.requireRestaurantMenu(
          requestedRestaurantMenuId,
          branch.restaurantId,
        )
      : null;

    return this.cartRepository.create({
      tenant: { connect: { id: branch.tenantId } },
      restaurant: { connect: { id: branch.restaurantId } },
      branch: { connect: { id: branch.id } },
      customer: { connect: { id: customer.id } },
      restaurantMenu: restaurantMenu
        ? { connect: { id: restaurantMenu.id } }
        : undefined,
    });
  }

  private async resolveScopedBranch(
    customer: ResolvedCartCustomerScope,
    branchId: string,
  ): Promise<ScopedBranch> {
    const branch = await this.cartRepository.findActiveBranch(branchId);
    if (!branch) {
      throw new BadRequestException('Branch not found or inactive');
    }

    if (
      branch.tenantId !== customer.tenantId ||
      branch.restaurantId !== customer.restaurantId
    ) {
      throw new ForbiddenException(
        'You cannot access resources outside your restaurant',
      );
    }

    return branch;
  }

  private async buildCartResponse(cart: CartSnapshot) {
    const menuItems = await this.cartRepository.findMenuItemsForResponse(
      [...new Set(cart.items.map((item) => item.menuItemId))],
      cart.restaurantId,
      cart.branchId,
    );
    const menuItemMap = new Map(menuItems.map((item) => [item.id, item]));
    const defaultAddressId = await this.getDefaultAddressId(cart.customerId);
    const effectiveDeliveryAddressId =
      cart.deliveryAddressId ?? defaultAddressId;

    return this.resolveMediaResponse({
      id: cart.id,
      restaurantId: cart.restaurantId,
      branchId: cart.branchId,
      customerId: cart.customerId,
      restaurantMenuId: cart.restaurantMenuId,
      orderType: cart.orderType,
      deliveryAddressId: effectiveDeliveryAddressId,
      couponCode: cart.couponCode,
      paymentMethod: cart.paymentMethod,
      orderTime: cart.orderTime,
      customerNote: cart.customerNote,
      items: cart.items.map((cartItem) => {
        const menuItem = menuItemMap.get(cartItem.menuItemId);
        const selectedVariation = menuItem?.variations.find(
          (variation) => variation.id === cartItem.variationId,
        );
        const branchOverride = menuItem?.branchOverrides?.[0];
        const baseUnitPrice =
          selectedVariation && menuItem
            ? this.resolveVariationPrice(
                selectedVariation,
                branchOverride?.priceOverride ?? menuItem.basePrice,
              )
            : branchOverride?.priceOverride ?? menuItem?.basePrice ?? null;
        const unitPrice =
          baseUnitPrice === null || baseUnitPrice === undefined || !menuItem
            ? null
            : new Prisma.Decimal(baseUnitPrice).plus(
                this.resolveOrderTypePriceAdjustment(menuItem, cart.orderType),
              );

        return {
          id: cartItem.id,
          menuItemId: cartItem.menuItemId,
          variationId: cartItem.variationId,
          quantity: cartItem.quantity,
          note: cartItem.note,
          modifiers: this.readModifiers(cartItem.modifiers),
          sections: this.readSections(cartItem.modifiers),
          menuItem: menuItem
            ? {
                id: menuItem.id,
                name: menuItem.name,
                slug: menuItem.slug,
                description: menuItem.description,
                imageUrl: menuItem.imageUrl,
                category: menuItem.category
                  ? {
                      ...menuItem.category,
                      variations: this.normalizeVariations(
                        menuItem.category.variations,
                      ),
                    }
                  : null,
                isAvailable: branchOverride?.isAvailable ?? true,
                pricingMode: menuItem.pricingMode,
                unitPrice: unitPrice ? Number(unitPrice) : unitPrice,
                deliveryPriceAdjustment:
                  menuItem.deliveryPriceAdjustment !== undefined &&
                  menuItem.deliveryPriceAdjustment !== null
                    ? Number(menuItem.deliveryPriceAdjustment)
                    : null,
                takeawayPriceAdjustment:
                  menuItem.takeawayPriceAdjustment !== undefined &&
                  menuItem.takeawayPriceAdjustment !== null
                    ? Number(menuItem.takeawayPriceAdjustment)
                    : null,
                depositAmount:
                  menuItem.depositAmount !== undefined &&
                  menuItem.depositAmount !== null
                    ? Number(menuItem.depositAmount)
                    : null,
                supportsSplitPizza: this.supportsSplitPizza(menuItem),
                splitPizza: this.supportsSplitPizza(menuItem)
                  ? {
                      enabled: true,
                      slots: ['LEFT', 'RIGHT'],
                      pricingRule: 'HIGHEST_HALF',
                      allowedFlavors: (menuItem.category.items ?? []).map(
                        (candidate) => ({
                          id: candidate.id,
                          name: candidate.name,
                          slug: candidate.slug,
                        }),
                      ),
                    }
                  : null,
                selectedVariation: selectedVariation
                  ? {
                      id: selectedVariation.id,
                      name: selectedVariation.name,
                      description: selectedVariation.description ?? null,
                      price: Number(
                        this.resolveVariationPrice(
                          selectedVariation,
                          branchOverride?.priceOverride ?? menuItem.basePrice,
                        ),
                      ),
                      pricingMode:
                        selectedVariation.pricingMode ??
                        VariationPricingMode.FIXED,
                      adjustmentValue:
                        selectedVariation.adjustmentValue !== undefined &&
                        selectedVariation.adjustmentValue !== null
                          ? Number(selectedVariation.adjustmentValue)
                          : null,
                    }
                  : null,
                modifierGroups: menuItem.modifierLinks.map((link) => ({
                  id: link.modifierGroup.id,
                  name: link.modifierGroup.name,
                  minSelect: link.modifierGroup.minSelect,
                  maxSelect: link.modifierGroup.maxSelect,
                  isRequired: link.modifierGroup.isRequired,
                  sortOrder: link.sortOrder,
                  modifiers: link.modifierGroup.modifierLinks.map(
                    ({ modifier, sortOrder }) => ({
                      id: modifier.id,
                      name: modifier.name,
                      sortOrder,
                      priceDelta: Number(
                        modifier.variationPriceOverrides?.find(
                          (variationOverride) =>
                            variationOverride.variationId ===
                            cartItem.variationId,
                        )?.priceDelta ??
                          modifier.itemPriceOverrides?.find(
                            (itemOverride) =>
                              itemOverride.menuItemId === menuItem.id,
                          )?.priceDelta ??
                          modifier.priceDelta,
                      ),
                    }),
                  ),
                })),
              }
            : null,
        };
      }),
      createdAt: cart.createdAt,
      updatedAt: cart.updatedAt,
    });
  }

  private async resolveMediaResponse<T>(data: T) {
    return (await this.storageService?.resolveMediaUrlsDeep(data)) ?? data;
  }

  private normalizeVariations<T extends {
    pricingMode?: VariationPricingMode | null;
    price?: Prisma.Decimal | null;
  }>(variations: T[] | undefined | null) {
    return (variations ?? []).map((variation) => ({
      ...variation,
      price:
        variation.pricingMode === VariationPricingMode.FIXED
          ? variation.price ?? new Prisma.Decimal(0)
          : null,
    }));
  }

  private resolveVariationPrice(
    variation: {
      price: Prisma.Decimal;
      pricingMode?: VariationPricingMode;
      adjustmentValue?: Prisma.Decimal | null;
    },
    basePrice: Prisma.Decimal,
  ) {
    if (variation.pricingMode === VariationPricingMode.FLAT_ADJUSTMENT) {
      return basePrice.plus(variation.adjustmentValue ?? new Prisma.Decimal(0));
    }

    if (
      variation.pricingMode === VariationPricingMode.PERCENTAGE_ADJUSTMENT
    ) {
      return basePrice.plus(
        basePrice.mul(variation.adjustmentValue ?? new Prisma.Decimal(0)).div(100),
      );
    }

    return variation.price;
  }

  private async toQuotePayload(cart: CartSnapshot): Promise<QuoteOrderDto> {
    return {
      branchId: cart.branchId,
      customerId: cart.customerId,
      restaurantMenuId: cart.restaurantMenuId ?? undefined,
      orderType: this.toOrderTypeEnum(cart.orderType),
      deliveryAddressId:
        cart.orderType === OrderType.DELIVERY
          ? ((await this.resolveEffectiveDeliveryAddressId(cart)) ?? undefined)
          : undefined,
      couponCode: cart.couponCode ?? undefined,
      orderTime: cart.orderTime?.toISOString() ?? new Date().toISOString(),
      items: cart.items.map((item) => ({
        menuItemId: item.menuItemId,
        variationId: item.variationId ?? undefined,
        quantity: item.quantity,
        modifiers: this.readModifiers(item.modifiers),
        sections: this.readSections(item.modifiers),
        note: item.note ?? undefined,
      })),
    };
  }

  private async toCreateOrderPayload(
    cart: CartSnapshot,
    dto: CheckoutCartDto,
  ): Promise<CreateOrderDto> {
    return {
      ...(await this.toQuotePayload(cart)),
      orderTime:
        dto.orderTime ??
        cart.orderTime?.toISOString() ??
        new Date().toISOString(),
      paymentMethod: this.resolveCheckoutPaymentMethod(cart, dto),
      walletAmount: dto.walletAmount,
      loyaltyPoints: dto.loyaltyPoints,
      customerNote:
        dto.customerNote !== undefined
          ? (this.resolveOptionalString(dto.customerNote) ?? undefined)
          : (cart.customerNote ?? undefined),
    };
  }

  private async resolveUpdatedDeliveryAddressId(
    cart: CartSnapshot,
    customerId: string,
    requestedDeliveryAddressId: string | null | undefined,
    orderType: OrderType,
  ) {
    if (requestedDeliveryAddressId === undefined) {
      return orderType === OrderType.DELIVERY ? cart.deliveryAddressId : null;
    }

    const nextDeliveryAddressId = this.resolveOptionalString(
      requestedDeliveryAddressId,
    );

    if (!nextDeliveryAddressId) {
      return null;
    }

    if (orderType !== OrderType.DELIVERY) {
      return null;
    }

    const address = await this.cartRepository.findOwnedAddress(
      nextDeliveryAddressId,
      cart.tenantId,
      customerId,
    );

    if (!address) {
      throw new BadRequestException('Delivery address not found');
    }

    return address.id;
  }

  private async resolveEffectiveDeliveryAddressId(cart: CartSnapshot) {
    if (cart.orderType !== OrderType.DELIVERY) {
      return undefined;
    }

    return (
      cart.deliveryAddressId ??
      (await this.getDefaultAddressId(cart.customerId))
    );
  }

  private async getDefaultAddressId(customerId: string) {
    const profile = await this.profilesRepository.findByUserId(customerId);
    const metadata = this.asObject(profile?.metadata);

    return typeof metadata.defaultAddressId === 'string'
      ? metadata.defaultAddressId
      : null;
  }

  private asObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }

  private toOrderTypeEnum(orderType: OrderType): OrderTypeEnum {
    switch (orderType) {
      case OrderType.DELIVERY:
        return OrderTypeEnum.DELIVERY;
      case OrderType.TAKEAWAY:
        return OrderTypeEnum.TAKEAWAY;
      case OrderType.DINE_IN:
        return OrderTypeEnum.DINE_IN;
      default:
        return OrderTypeEnum.DELIVERY;
    }
  }

  private resolveCheckoutPaymentMethod(
    cart: CartSnapshot,
    dto: CheckoutCartDto,
  ): PaymentMethodEnum {
    const paymentMethod = dto.paymentMethod ?? cart.paymentMethod;

    if (!paymentMethod) {
      throw new BadRequestException(
        'paymentMethod is required in cart or checkout',
      );
    }

    return paymentMethod as PaymentMethodEnum;
  }

  private toOrderTypeModel(orderType: OrderTypeEnum): OrderType {
    switch (orderType) {
      case OrderTypeEnum.TAKEAWAY:
        return OrderType.TAKEAWAY;
      case OrderTypeEnum.DINE_IN:
        return OrderType.DINE_IN;
      case OrderTypeEnum.DELIVERY:
      default:
        return OrderType.DELIVERY;
    }
  }

  private async assertValidCartItem(
    restaurantId: string,
    branchId: string,
    dto: AddCartItemDto,
  ) {
    const menuItem = await this.cartRepository.findMenuItemForCart(
      dto.menuItemId,
      restaurantId,
      branchId,
    );

    if (!menuItem) {
      throw new BadRequestException(`Menu item not found: ${dto.menuItemId}`);
    }

    const branchOverride = menuItem.branchOverrides[0];
    if (branchOverride && !branchOverride.isAvailable) {
      throw new BadRequestException(
        `Menu item unavailable at branch: ${menuItem.name}`,
      );
    }

    const selectedRestaurantMenuId = this.resolveOptionalString(
      dto.restaurantMenuId,
    );

    if (selectedRestaurantMenuId) {
      const restaurantMenu = await this.requireRestaurantMenu(
        selectedRestaurantMenuId,
        restaurantId,
      );

      if (
        !restaurantMenu.directItemIds.has(menuItem.id) &&
        !restaurantMenu.categoryIds.has(menuItem.category.id)
      ) {
        throw new BadRequestException(
          `Menu item is not available in selected menu: ${menuItem.name}`,
        );
      }
    }

    if (dto.variationId) {
      const variation = menuItem.variations.find(
        (item) => item.id === dto.variationId,
      );
      if (!variation) {
        throw new BadRequestException(
          `Variation not found for item: ${menuItem.name}`,
        );
      }
    }

    for (const modifier of dto.modifiers ?? []) {
      const found = menuItem.modifierLinks.some((link) =>
        link.modifierGroup.modifierLinks.some(
          (candidate) => candidate.modifier.id === modifier.modifierId,
        ),
      );

      if (!found) {
        throw new BadRequestException(
          `Modifier not found for item: ${menuItem.name}`,
        );
      }
    }

    await this.assertValidSplitSections(menuItem, branchId, dto);
  }

  private async assertValidSplitSections(
    menuItem: Awaited<ReturnType<CartRepository['findMenuItemForCart']>>,
    branchId: string,
    dto: AddCartItemDto,
  ) {
    if (!menuItem) {
      return;
    }

    const sections = dto.sections;
    if (!sections?.length) {
      return;
    }

    if (!this.supportsSplitPizza(menuItem)) {
      throw new BadRequestException(
        `Split pizza is not enabled for item: ${menuItem.name}`,
      );
    }

    if (sections.length !== 2) {
      throw new BadRequestException('Split pizza requires exactly 2 sections');
    }

    const slots = new Set(sections.map((section) => section.slot));
    if (!slots.has('LEFT') || !slots.has('RIGHT') || slots.size !== 2) {
      throw new BadRequestException(
        'Split pizza sections must include one LEFT and one RIGHT section',
      );
    }

    const splitItems = await this.cartRepository.findSplitSectionItems(
      [...new Set(sections.map((section) => section.menuItemId))],
      menuItem.restaurantId,
      branchId,
      menuItem.category.id,
    );
    const splitItemMap = new Map(splitItems.map((item) => [item.id, item]));

    for (const section of sections) {
      const sectionItem = splitItemMap.get(section.menuItemId);
      if (!sectionItem) {
        throw new BadRequestException(
          `Split section flavor not found for item: ${menuItem.name}`,
        );
      }

      const branchOverride = sectionItem.branchOverrides[0];
      if (branchOverride && !branchOverride.isAvailable) {
        throw new BadRequestException(
          `Split section flavor unavailable at branch: ${sectionItem.name}`,
        );
      }

      for (const modifier of section.modifiers ?? []) {
        const found = sectionItem.modifierLinks.some((link) =>
          link.modifierGroup.modifierLinks.some(
            (candidate) => candidate.modifier.id === modifier.modifierId,
          ),
        );

        if (!found) {
          throw new BadRequestException(
            `Modifier not found for split section item: ${sectionItem.name}`,
          );
        }
      }
    }
  }

  private readModifiers(
    input: Prisma.JsonValue | null,
  ): CartItemModifierDto[] | undefined {
    const source = Array.isArray(input)
      ? input
      : input && typeof input === 'object' && !Array.isArray(input)
        ? ((input as { modifiers?: unknown }).modifiers ?? undefined)
        : undefined;

    if (!Array.isArray(source)) {
      return undefined;
    }

    const modifiers: CartItemModifierDto[] = [];

    for (const item of source) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        continue;
      }

      const raw = item as { modifierId?: unknown; quantity?: unknown };
      if (typeof raw.modifierId !== 'string') {
        continue;
      }

      modifiers.push({
        modifierId: raw.modifierId,
        quantity: typeof raw.quantity === 'number' ? raw.quantity : 1,
      });
    }

    return modifiers.length ? modifiers : undefined;
  }

  private readSections(
    input: Prisma.JsonValue | null,
  ): CartItemSectionDto[] | undefined {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return undefined;
    }

    const rawSections = (input as { sections?: unknown }).sections;
    if (!Array.isArray(rawSections)) {
      return undefined;
    }

    const sections: CartItemSectionDto[] = [];

    for (const item of rawSections) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        continue;
      }

      const raw = item as {
        slot?: unknown;
        menuItemId?: unknown;
        modifiers?: Prisma.JsonValue | null;
      };

      if (
        (raw.slot !== 'LEFT' && raw.slot !== 'RIGHT') ||
        typeof raw.menuItemId !== 'string'
      ) {
        continue;
      }

      sections.push({
        slot: raw.slot,
        menuItemId: raw.menuItemId,
        modifiers: this.readModifiers(raw.modifiers ?? null),
      });
    }

    return sections.length ? sections : undefined;
  }

  private packCartSelections(
    modifiers?: CartItemModifierDto[],
    sections?: CartItemSectionDto[],
  ) {
    if (!sections?.length) {
      return modifiers?.length ? modifiers : undefined;
    }

    return {
      modifiers: modifiers?.length ? modifiers : [],
      sections: sections.map((section) => ({
        slot: section.slot,
        menuItemId: section.menuItemId,
        modifiers: section.modifiers?.length ? section.modifiers : [],
      })),
    };
  }

  private supportsSplitPizza(menuItem: { dietaryFlags?: unknown }) {
    return Array.isArray(menuItem.dietaryFlags)
      ? menuItem.dietaryFlags.includes('__SPLIT_PIZZA_ENABLED__')
      : false;
  }

  private resolveOrderTypePriceAdjustment(
    menuItem: {
      [key: string]: unknown;
      pricingMode?: string | null;
      deliveryPriceAdjustment?: Prisma.Decimal | null;
      takeawayPriceAdjustment?: Prisma.Decimal | null;
    },
    orderType: OrderType,
  ) {
    if (menuItem.pricingMode !== 'MULTIPLE') {
      return new Prisma.Decimal(0);
    }

    if (orderType === OrderType.DELIVERY) {
      return menuItem.deliveryPriceAdjustment ?? new Prisma.Decimal(0);
    }

    if (orderType === OrderType.TAKEAWAY) {
      return menuItem.takeawayPriceAdjustment ?? new Prisma.Decimal(0);
    }

    return new Prisma.Decimal(0);
  }

  private resolveOptionalString(value: string | null | undefined) {
    if (value === undefined) {
      return undefined;
    }

    if (value === null) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private async resolveRestaurantMenuRelationInput(
    restaurantId: string,
    currentRestaurantMenuId: string | null,
    requestedRestaurantMenuId: string | null,
    itemCount: number,
    orderTime: Date | null,
  ) {
    const nextRestaurantMenuId = this.resolveOptionalString(
      requestedRestaurantMenuId,
    );

    if (nextRestaurantMenuId === currentRestaurantMenuId) {
      return undefined;
    }

    if (itemCount > 0) {
      throw new BadRequestException(
        'Clear cart items before changing selected menu',
      );
    }

    if (!nextRestaurantMenuId) {
      return { disconnect: true };
    }

    const restaurantMenu = await this.requireRestaurantMenu(
      nextRestaurantMenuId,
      restaurantId,
      orderTime,
    );

    return { connect: { id: restaurantMenu.id } };
  }

  private async requireRestaurantMenu(
    restaurantMenuId: string,
    restaurantId: string,
    orderTime?: Date | null,
  ) {
    const restaurantMenu = await this.cartRepository.findRestaurantMenuById(
      restaurantMenuId,
      restaurantId,
    );

    if (!restaurantMenu) {
      throw new BadRequestException('Selected menu not found or inactive');
    }

    if (
      restaurantMenu.isTimed &&
      !isRestaurantMenuAvailableAt(
        restaurantMenu.timingConfig,
        orderTime ?? new Date(),
      )
    ) {
      throw new BadRequestException(
        'Selected menu is not available at requested order time',
      );
    }

    return {
      id: restaurantMenu.id,
      directItemIds: new Set(
        restaurantMenu.items.map((item) => item.menuItemId),
      ),
      categoryIds: new Set(
        restaurantMenu.categories.map((category) => category.menuCategoryId),
      ),
    };
  }

  private async resolveCartCustomerId(
    user: AuthUserContext,
    requestedCustomerId?: string,
    requestedRestaurantId?: string,
  ) {
    void requestedRestaurantId;

    const customer = await this.resolveCartCustomerScope(
      user,
      requestedCustomerId,
    );

    return customer.id;
  }

  private async resolveCartCustomerScope(
    user: AuthUserContext,
    requestedCustomerId?: string,
  ): Promise<ResolvedCartCustomerScope> {
    if (user.role === UserRoleEnum.CUSTOMER) {
      if (requestedCustomerId && requestedCustomerId !== user.uid) {
        throw new BadRequestException(
          'Customers can only manage their own cart',
        );
      }

      return {
        id: user.uid,
        tenantId: user.tid ?? null,
        restaurantId: user.rid ?? null,
      };
    }

    if (!requestedCustomerId) {
      throw new BadRequestException(
        'customerId is required when managing cart on behalf of a customer',
      );
    }

    const customer = await this.cartRepository.findActiveCustomer(
      requestedCustomerId,
      user.role === UserRoleEnum.SUPER_ADMIN
        ? undefined
        : this.getRequiredTenantId(user),
    );

    if (!customer?.tenantId || !customer.restaurantId) {
      throw new BadRequestException('Customer not found');
    }

    if (
      user.role === UserRoleEnum.BRANCH_ADMIN &&
      user.rid &&
      customer.restaurantId !== user.rid
    ) {
      throw new ForbiddenException(
        'You cannot access resources outside your restaurant',
      );
    }

    return customer;
  }

  private getRequiredTenantId(user: AuthUserContext) {
    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    return user.tid;
  }

  private async buildEmptyCart(customerId: string) {
    const defaultAddressId = await this.getDefaultAddressId(customerId);

    return {
      id: null,
      restaurantId: null,
      branchId: null,
      customerId,
      restaurantMenuId: null,
      orderType: OrderType.DELIVERY,
      deliveryAddressId: defaultAddressId,
      couponCode: null,
      paymentMethod: null,
      orderTime: null,
      customerNote: null,
      items: [],
      createdAt: null,
      updatedAt: null,
    };
  }
}
