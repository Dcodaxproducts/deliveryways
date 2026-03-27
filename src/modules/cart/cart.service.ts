import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderType, PaymentMethod, Prisma } from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import {
  OrderTypeEnum,
  PaymentMethodEnum,
  UserRoleEnum,
} from '../../common/enums';
import { ProfilesRepository } from '../profiles/profiles.repository';
import { CreateOrderDto, QuoteOrderDto } from '../orders/dto';
import { OrdersService } from '../orders/orders.service';
import {
  AddCartItemDto,
  CartItemModifierDto,
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

@Injectable()
export class CartService {
  constructor(
    private readonly cartRepository: CartRepository,
    private readonly ordersService: OrdersService,
    private readonly profilesRepository: ProfilesRepository,
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

    const quote = await this.ordersService.quote(user, {
      ...(await this.toQuotePayload(cart)),
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
    await this.assertValidCartItem(cart.restaurantId, cart.branchId, dto);

    await this.cartRepository.createItem({
      cart: { connect: { id: cart.id } },
      menuItemId: dto.menuItemId,
      variationId: dto.variationId,
      quantity: dto.quantity,
      note: dto.note,
      modifiers: dto.modifiers as unknown as Prisma.InputJsonValue,
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
        dto.modifiers !== undefined
          ? (dto.modifiers as unknown as Prisma.InputJsonValue | undefined)
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
    const customerId = await this.resolveCartCustomerId(
      user,
      requestedCustomerId,
      requestedRestaurantId,
    );
    const existingCart = await this.cartRepository.findByCustomerId(customerId);

    if (existingCart) {
      if (dto.branchId && dto.branchId !== existingCart.branchId) {
        throw new BadRequestException(
          'Clear cart before switching to another branch',
        );
      }

      return existingCart;
    }

    if (!dto.branchId) {
      throw new BadRequestException(
        'branchId is required when creating cart from add-to-cart',
      );
    }

    const branch = await this.cartRepository.findActiveBranch(dto.branchId);
    if (!branch) {
      throw new BadRequestException('Branch not found or inactive');
    }

    const tenantId = this.getRequiredTenantId(user);
    const restaurantId = this.resolveRequestedRestaurantId(
      user,
      requestedRestaurantId,
    );
    this.ensureRestaurantAccess(
      user,
      branch.restaurantId,
      requestedRestaurantId,
    );

    if (branch.tenantId !== tenantId || branch.restaurantId !== restaurantId) {
      throw new ForbiddenException(
        'You cannot access resources outside your restaurant',
      );
    }

    return this.cartRepository.create({
      tenant: { connect: { id: branch.tenantId } },
      restaurant: { connect: { id: branch.restaurantId } },
      branch: { connect: { id: branch.id } },
      customer: { connect: { id: customerId } },
    });
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

    return {
      id: cart.id,
      restaurantId: cart.restaurantId,
      branchId: cart.branchId,
      customerId: cart.customerId,
      orderType: cart.orderType,
      deliveryAddressId: effectiveDeliveryAddressId,
      couponCode: cart.couponCode,
      paymentMethod: cart.paymentMethod,
      orderTime: cart.orderTime,
      customerNote: cart.customerNote,
      items: cart.items.map((item) => {
        const menuItem = menuItemMap.get(item.menuItemId);
        const selectedVariation = menuItem?.variations.find(
          (variation) => variation.id === item.variationId,
        );
        const branchOverride = menuItem?.branchOverrides?.[0];
        const unitPrice =
          selectedVariation?.price ??
          branchOverride?.priceOverride ??
          menuItem?.basePrice ??
          null;

        return {
          id: item.id,
          menuItemId: item.menuItemId,
          variationId: item.variationId,
          quantity: item.quantity,
          note: item.note,
          modifiers: this.readModifiers(item.modifiers),
          menuItem: menuItem
            ? {
                id: menuItem.id,
                name: menuItem.name,
                slug: menuItem.slug,
                description: menuItem.description,
                imageUrl: menuItem.imageUrl,
                category: menuItem.category,
                isAvailable: branchOverride?.isAvailable ?? true,
                unitPrice,
                selectedVariation: selectedVariation
                  ? {
                      id: selectedVariation.id,
                      name: selectedVariation.name,
                      price: selectedVariation.price,
                    }
                  : null,
                modifierGroups: menuItem.modifierLinks.map((link) => ({
                  id: link.modifierGroup.id,
                  name: link.modifierGroup.name,
                  minSelect: link.modifierGroup.minSelect,
                  maxSelect: link.modifierGroup.maxSelect,
                  isRequired: link.modifierGroup.isRequired,
                  sortOrder: link.sortOrder,
                  modifiers: link.modifierGroup.modifiers.map((modifier) => ({
                    id: modifier.id,
                    name: modifier.name,
                    priceDelta: modifier.priceDelta,
                  })),
                })),
              }
            : null,
        };
      }),
      createdAt: cart.createdAt,
      updatedAt: cart.updatedAt,
    };
  }

  private async toQuotePayload(cart: CartSnapshot): Promise<QuoteOrderDto> {
    return {
      branchId: cart.branchId,
      customerId: cart.customerId,
      orderType: this.toOrderTypeEnum(cart.orderType),
      deliveryAddressId:
        cart.orderType === OrderType.DELIVERY
          ? ((await this.resolveEffectiveDeliveryAddressId(cart)) ?? undefined)
          : undefined,
      couponCode: cart.couponCode ?? undefined,
      orderTime: new Date().toISOString(),
      items: cart.items.map((item) => ({
        menuItemId: item.menuItemId,
        variationId: item.variationId ?? undefined,
        quantity: item.quantity,
        modifiers: this.readModifiers(item.modifiers),
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
        link.modifierGroup.modifiers.some(
          (candidate) => candidate.id === modifier.modifierId,
        ),
      );

      if (!found) {
        throw new BadRequestException(
          `Modifier not found for item: ${menuItem.name}`,
        );
      }
    }
  }

  private readModifiers(
    input: Prisma.JsonValue | null,
  ): CartItemModifierDto[] | undefined {
    if (!Array.isArray(input)) {
      return undefined;
    }

    const modifiers: CartItemModifierDto[] = [];

    for (const item of input) {
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

  private ensureRestaurantAccess(
    user: AuthUserContext,
    restaurantId: string,
    requestedRestaurantId?: string,
  ) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return;
    }

    const allowedRestaurantId = this.resolveRequestedRestaurantId(
      user,
      requestedRestaurantId,
    );

    if (allowedRestaurantId !== restaurantId) {
      throw new ForbiddenException(
        'You cannot access resources outside your restaurant',
      );
    }
  }

  private async resolveCartCustomerId(
    user: AuthUserContext,
    requestedCustomerId?: string,
    requestedRestaurantId?: string,
  ) {
    if (user.role === UserRoleEnum.CUSTOMER) {
      if (requestedCustomerId && requestedCustomerId !== user.uid) {
        throw new BadRequestException(
          'Customers can only manage their own cart',
        );
      }

      return user.uid;
    }

    if (!requestedCustomerId) {
      throw new BadRequestException(
        'customerId is required when managing cart on behalf of a customer',
      );
    }

    const tenantId = this.getRequiredTenantId(user);
    const restaurantId = this.resolveRequestedRestaurantId(
      user,
      requestedRestaurantId,
    );
    const customer = await this.cartRepository.findActiveCustomer(
      requestedCustomerId,
      tenantId,
      restaurantId,
    );

    if (!customer) {
      throw new BadRequestException('Customer not found for this restaurant');
    }

    return customer.id;
  }

  private resolveRequestedRestaurantId(
    user: AuthUserContext,
    requestedRestaurantId?: string,
  ) {
    if (user.rid) {
      return user.rid;
    }

    if (requestedRestaurantId) {
      return requestedRestaurantId;
    }

    throw new ForbiddenException('Restaurant context is required');
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
