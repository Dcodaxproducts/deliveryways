import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  CouponDealSelectionMode,
  OrderType,
  PaymentMethod,
  Prisma,
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
import { CouponsService } from '../coupons/coupons.service';
import {
  AddCartItemDto,
  CartItemModifierDto,
  CartItemModifierSelectionDto,
  CartItemSectionDto,
  CheckoutCartDto,
  QuoteCartDto,
  UpdateCartAddressDto,
  UpdateCartCouponDto,
  UpdateCartDealDto,
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
  tipAmount: Prisma.Decimal;
  customerNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: CartSnapshotItem[];
}

interface CartModifierLink {
  sortOrder: number;
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
      sortOrder: number;
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

interface CartModifierPricingSource {
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
}

interface CartDirectModifierOverride {
  modifierId?: string;
  priceDelta: Prisma.Decimal;
  isRequired?: boolean;
  modifier: CartModifierPricingSource;
}

interface CartModifierSource {
  id: string;
  name?: string;
  isRequired?: boolean;
  minSelect?: number;
  maxSelect?: number | null;
  minQuantity?: number;
  maxQuantity?: number | null;
  modifierLinks: CartModifierLink[];
  modifierPriceOverrides?: CartDirectModifierOverride[];
  category?: {
    modifierLinks?: CartModifierLink[];
  };
}

interface ResolvedCartCustomerScope {
  id: string;
  tenantId: string | null;
  restaurantId: string | null;
}

interface CartResponseDealLine {
  id: string;
  dealId: string | null;
  menuItemId: string;
  categoryId: string | null;
  categoryIds: string[];
  quantity: number;
  prepTimeMinutes?: number | null;
  unitPrice: number | null;
  unitPriceWithModifiers: number | null;
  depositTotal: number;
  lineTotal: number | null;
}

export interface CartResponseItem extends CartResponseDealLine {
  type: 'ITEM';
  variationId: string | null;
  note: string | null;
  modifiers: CartItemModifierDto[];
  selectedModifiers: unknown[];
  sections: CartItemSectionDto[] | undefined;
  selectedSections: unknown[];
  modifiersTotal: number;
  depositAmount: number;
  menuItem: unknown;
}

export interface CartResponseDealItem {
  id: string;
  type: 'DEAL';
  dealId: string;
  cartItemIds: string[];
  menuItemIds: string[];
  quantity: number;
  unitPrice: number;
  modifiersTotal: number;
  unitPriceWithModifiers: number;
  depositAmount: number;
  depositTotal: number;
  lineTotal: number;
  deal: {
    id: string;
    code: string;
    title: string;
    description: string | null;
    imageUrl: string | null;
    fixedPrice: number;
  };
  includedItems: CartResponseItem[];
}

export type CartDisplayItem = CartResponseItem | CartResponseDealItem;

interface ScopedBranch {
  id: string;
  tenantId: string;
  restaurantId: string;
  settings?: unknown;
}

interface CartBranchTemporaryClosure {
  isClosed: boolean;
  closedUntil?: string | null;
  reason?: string | null;
  message?: string | null;
}

interface CartBranchHolidayOpeningHour {
  date?: string;
  fromDate?: string;
  toDate?: string;
  isClosed: boolean;
  openTime?: string | null;
  closeTime?: string | null;
  note?: string | null;
}

@Injectable()
export class CartService {
  constructor(
    private readonly cartRepository: CartRepository,
    private readonly ordersService: OrdersService,
    private readonly profilesRepository: ProfilesRepository,
    private readonly storageService?: StorageService,
    @Optional() private readonly couponsService?: CouponsService,
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
      data: await this.buildCartResponse(cart, user),
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
      return {
        data: await this.buildEmptyCart(customerId, {
          orderType: dto.orderType,
        }),
        message: 'Cart updated successfully',
      };
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
      orderTime:
        dto.orderTime || dto.scheduledDeliveryAt
          ? new Date(dto.orderTime ?? dto.scheduledDeliveryAt!)
          : undefined,
      tipAmount:
        dto.tipAmount !== undefined
          ? new Prisma.Decimal(dto.tipAmount).toDecimalPlaces(2)
          : undefined,
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
    const validatedDto = await this.assertValidCartItem(
      cart.restaurantId,
      cart.branchId,
      {
        ...dto,
        restaurantMenuId: cart.restaurantMenuId ?? dto.restaurantMenuId,
      },
    );

    const packedSelections = this.packCartSelections(
      this.resolveSelectedModifiers(validatedDto),
      validatedDto.sections,
      validatedDto.dealId,
      validatedDto.modifierSelections,
    );
    const matchingItem = cart.items.find((item) =>
      this.isSameCartSelection(item, {
        menuItemId: validatedDto.menuItemId,
        variationId: validatedDto.variationId ?? null,
        note: this.resolveOptionalString(validatedDto.note) ?? null,
        modifiers: packedSelections as Prisma.JsonValue | null | undefined,
      }),
    );

    if (matchingItem) {
      await this.assertValidCartItem(cart.restaurantId, cart.branchId, {
        ...validatedDto,
        quantity: matchingItem.quantity + dto.quantity,
        restaurantMenuId: cart.restaurantMenuId ?? dto.restaurantMenuId,
      });

      await this.cartRepository.updateItem(matchingItem.id, {
        quantity: matchingItem.quantity + dto.quantity,
      });
    } else {
      await this.cartRepository.createItem({
        cart: { connect: { id: cart.id } },
        menuItemId: validatedDto.menuItemId,
        variationId: validatedDto.variationId,
        quantity: validatedDto.quantity,
        note: this.resolveOptionalString(validatedDto.note),
        modifiers: packedSelections as unknown as Prisma.InputJsonValue,
      });
    }

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
      modifierSelections:
        dto.modifierSelections !== undefined
          ? (dto.modifierSelections ?? undefined)
          : this.readModifierSelections(item.modifiers),
      sections:
        dto.sections !== undefined
          ? (dto.sections ?? undefined)
          : this.readSections(item.modifiers),
      dealId: this.readDealId(item.modifiers),
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
        dto.modifiers !== undefined ||
        dto.sections !== undefined ||
        dto.modifierSelections !== undefined
          ? (this.packCartSelections(
              dto.modifierSelections !== undefined
                ? this.flattenModifierSelections(dto.modifierSelections ?? [])
                : dto.modifiers !== undefined
                  ? (dto.modifiers ?? undefined)
                  : this.readModifiers(item.modifiers),
              dto.sections !== undefined
                ? (dto.sections ?? undefined)
                : this.readSections(item.modifiers),
              this.readDealId(item.modifiers),
              dto.modifierSelections !== undefined
                ? (dto.modifierSelections ?? undefined)
                : this.readModifierSelections(item.modifiers),
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

  async updateDeal(
    user: AuthUserContext,
    dealId: string,
    dto: UpdateCartDealDto,
    requestedCustomerId?: string,
    requestedRestaurantId?: string,
  ) {
    const cart = await this.getExistingCartOrThrow(
      user,
      requestedCustomerId,
      requestedRestaurantId,
    );
    const dealItems = this.findCartItemsByDealId(cart, dealId);

    if (!dealItems.length) {
      throw new NotFoundException('Cart deal not found');
    }

    await this.cartRepository.updateItems(
      dealItems.map((item) => item.id),
      { quantity: dto.quantity },
    );

    const updatedCart = await this.getExistingCartOrThrow(
      user,
      requestedCustomerId,
      requestedRestaurantId,
    );

    return {
      data: await this.buildCartResponse(updatedCart),
      message: 'Cart deal updated successfully',
    };
  }

  async removeDeal(
    user: AuthUserContext,
    dealId: string,
    requestedCustomerId?: string,
    requestedRestaurantId?: string,
  ) {
    const cart = await this.getExistingCartOrThrow(
      user,
      requestedCustomerId,
      requestedRestaurantId,
    );
    const dealItems = this.findCartItemsByDealId(cart, dealId);

    if (!dealItems.length) {
      throw new NotFoundException('Cart deal not found');
    }

    await this.cartRepository.deleteItems(dealItems.map((item) => item.id));

    const updatedCart = await this.cartRepository.findByCustomerId(
      cart.customerId,
    );

    return {
      data: updatedCart
        ? await this.buildCartResponse(updatedCart)
        : await this.buildEmptyCart(cart.customerId),
      message: 'Cart deal removed successfully',
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

  private findCartItemsByDealId(cart: CartSnapshot, dealId: string) {
    return cart.items.filter(
      (item) => this.readDealId(item.modifiers) === dealId,
    );
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
    const requestedOrderType = dto.orderType
      ? this.toOrderTypeModel(dto.orderType)
      : undefined;

    if (existingCart) {
      if (requestedBranchId && requestedBranchId !== existingCart.branchId) {
        const hasBlockingItems = await this.cartHasBlockingItems(existingCart);

        if (!hasBlockingItems) {
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
            ...(existingCart.items.length ? { items: { deleteMany: {} } } : {}),
            ...(requestedOrderType ? { orderType: requestedOrderType } : {}),
            deliveryAddress:
              requestedOrderType && requestedOrderType !== OrderType.DELIVERY
                ? { disconnect: true }
                : undefined,
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
          ...(requestedOrderType ? { orderType: requestedOrderType } : {}),
          deliveryAddress:
            requestedOrderType && requestedOrderType !== OrderType.DELIVERY
              ? { disconnect: true }
              : undefined,
          restaurantMenu: restaurantMenu
            ? { connect: { id: restaurantMenu.id } }
            : { disconnect: true },
        });
      }

      if (requestedOrderType && requestedOrderType !== existingCart.orderType) {
        return this.cartRepository.update(existingCart.id, {
          orderType: requestedOrderType,
          deliveryAddress:
            requestedOrderType !== OrderType.DELIVERY
              ? { disconnect: true }
              : undefined,
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
      ...(requestedOrderType ? { orderType: requestedOrderType } : {}),
      restaurantMenu: restaurantMenu
        ? { connect: { id: restaurantMenu.id } }
        : undefined,
    });
  }

  private async cartHasBlockingItems(cart: CartSnapshot) {
    if (!cart.items.length) {
      return false;
    }

    const menuItems = await this.cartRepository.findMenuItemsForResponse(
      [...new Set(cart.items.map((item) => item.menuItemId))],
      cart.restaurantId,
      cart.branchId,
    );

    return menuItems.length > 0;
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

    this.assertBranchAcceptingCarts(branch.settings);

    return branch;
  }

  private assertBranchAcceptingCarts(settings: unknown) {
    const temporaryClosure = this.readTemporaryClosure(settings);
    const holidayOpeningHour = this.readTodayHolidayOpeningHour(settings);

    if (
      temporaryClosure?.isClosed &&
      temporaryClosure.closedUntil &&
      new Date(temporaryClosure.closedUntil).getTime() <= Date.now()
    ) {
      // Expired closures reopen automatically; keep checking holiday rules.
    } else if (temporaryClosure?.isClosed) {
      throw new BadRequestException({
        message: temporaryClosure.message ?? 'Branch is temporarily closed',
        error: 'BRANCH_TEMPORARILY_CLOSED',
        details: {
          reason: temporaryClosure.reason ?? null,
          closedUntil: temporaryClosure.closedUntil ?? null,
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

    return;
  }

  private readTemporaryClosure(
    settings: unknown,
  ): CartBranchTemporaryClosure | null {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return null;
    }

    const temporaryClosure = (settings as { temporaryClosure?: unknown })
      .temporaryClosure;

    if (
      !temporaryClosure ||
      typeof temporaryClosure !== 'object' ||
      Array.isArray(temporaryClosure)
    ) {
      return null;
    }

    return temporaryClosure as CartBranchTemporaryClosure;
  }

  private readTodayHolidayOpeningHour(
    settings: unknown,
  ): CartBranchHolidayOpeningHour | null {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return null;
    }

    const holidayOpeningHours = (settings as { holidayOpeningHours?: unknown })
      .holidayOpeningHours;
    if (!Array.isArray(holidayOpeningHours)) {
      return null;
    }

    const today = new Date().toISOString().slice(0, 10);
    const holidayOpeningHour = holidayOpeningHours.find(
      (item): item is CartBranchHolidayOpeningHour =>
        !!item &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        this.isHolidayDateMatch(item as CartBranchHolidayOpeningHour, today),
    );

    return holidayOpeningHour ?? null;
  }

  private isHolidayDateMatch(item: CartBranchHolidayOpeningHour, date: string) {
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

  private async buildCartResponse(cart: CartSnapshot, user?: AuthUserContext) {
    const menuItems = await this.cartRepository.findMenuItemsForResponse(
      [...new Set(cart.items.map((item) => item.menuItemId))],
      cart.restaurantId,
      cart.branchId,
    );
    const menuItemMap = new Map(menuItems.map((item) => [item.id, item]));
    const defaultAddressId = await this.getDefaultAddressId(cart.customerId);
    const effectiveDeliveryAddressId =
      cart.deliveryAddressId ?? defaultAddressId;

    const items = await Promise.all(
      cart.items.map(async (cartItem) => {
        const menuItem = menuItemMap.get(cartItem.menuItemId);
        const selectedVariation = menuItem?.variations.find(
          (variation) => variation.id === cartItem.variationId,
        );
        const branchOverride = menuItem?.branchOverrides?.[0];
        const selectedVariationOverride =
          selectedVariation?.itemPriceOverrides?.find(
            (itemOverride) => itemOverride.menuItemId === menuItem?.id,
          );
        const baseUnitPrice =
          selectedVariation && menuItem
            ? this.resolveVariationPrice(
                selectedVariation,
                branchOverride?.priceOverride ?? menuItem.basePrice,
                menuItem.id,
                cart.orderType,
              )
            : (branchOverride?.priceOverride ?? menuItem?.basePrice ?? null);
        let unitPrice =
          baseUnitPrice === null || baseUnitPrice === undefined || !menuItem
            ? null
            : new Prisma.Decimal(baseUnitPrice).plus(
                selectedVariation &&
                  this.variationHasPickupPrice(
                    selectedVariation,
                    menuItem.id,
                    cart.orderType,
                  )
                  ? new Prisma.Decimal(0)
                  : this.resolveOrderTypePriceAdjustment(
                      menuItem,
                      cart.orderType,
                    ),
              );
        const selectedModifiers = this.readModifiers(cartItem.modifiers) ?? [];
        const sections = this.readSections(cartItem.modifiers);
        const selectedModifierDetails = menuItem
          ? selectedModifiers.map((selectedModifier) => {
              const modifier = this.findAvailableModifier(
                menuItem,
                selectedModifier.modifierId,
              );
              const priceDelta = modifier
                ? this.resolveModifierPriceDelta(
                    modifier,
                    menuItem.id,
                    cartItem.variationId,
                  )
                : new Prisma.Decimal(0);

              return {
                modifierId: selectedModifier.modifierId,
                name: modifier?.name ?? null,
                quantity: selectedModifier.quantity ?? 1,
                unitPrice: Number(priceDelta),
                total: Number(priceDelta.mul(selectedModifier.quantity ?? 1)),
              };
            })
          : [];
        const selectedSectionDetails = [];

        if (menuItem && sections?.length && this.supportsSplitPizza(menuItem)) {
          const splitItems = await this.cartRepository.findSplitSectionItems(
            [...new Set(sections.map((section) => section.menuItemId))],
            cart.restaurantId,
            cart.branchId,
          );
          const splitItemMap = new Map(
            splitItems.map((item) => [item.id, item]),
          );
          const sectionUnitPrices: Prisma.Decimal[] = [];

          for (const section of sections) {
            const sectionItem = splitItemMap.get(section.menuItemId);
            if (!sectionItem) {
              continue;
            }

            const sectionVariation = sectionItem.variations.find(
              (variation) => variation.id === cartItem.variationId,
            );
            const sectionBranchOverride = sectionItem.branchOverrides[0];
            const sectionVariationOverride =
              sectionVariation?.itemPriceOverrides?.find(
                (itemOverride) => itemOverride.menuItemId === sectionItem.id,
              );
            const sectionBasePrice = sectionVariation
              ? this.resolveVariationPrice(
                  sectionVariation,
                  sectionBranchOverride?.priceOverride ?? sectionItem.basePrice,
                  sectionItem.id,
                  cart.orderType,
                )
              : (sectionBranchOverride?.priceOverride ?? sectionItem.basePrice);
            const sectionUnitPrice = new Prisma.Decimal(sectionBasePrice).plus(
              sectionVariation &&
                this.variationHasPickupPrice(
                  sectionVariation,
                  sectionItem.id,
                  cart.orderType,
                )
                ? new Prisma.Decimal(0)
                : this.resolveOrderTypePriceAdjustment(
                    sectionItem,
                    cart.orderType,
                  ),
            );
            sectionUnitPrices.push(sectionUnitPrice);

            selectedSectionDetails.push({
              slot: section.slot,
              menuItemId: sectionItem.id,
              menuItemName: sectionItem.name,
              unitPrice: Number(sectionUnitPrice),
              selectedVariation: sectionVariation
                ? {
                    id: sectionVariation.id,
                    name: sectionVariation.name,
                    description:
                      sectionVariationOverride?.displayText ??
                      sectionVariation.description ??
                      null,
                    displayText: sectionVariationOverride?.displayText ?? null,
                    price: Number(
                      this.resolveVariationPrice(
                        sectionVariation,
                        sectionBranchOverride?.priceOverride ??
                          sectionItem.basePrice,
                        sectionItem.id,
                        cart.orderType,
                      ),
                    ),
                    pickupPrice:
                      sectionVariationOverride?.pickupPrice !== undefined &&
                      sectionVariationOverride?.pickupPrice !== null
                        ? Number(sectionVariationOverride.pickupPrice)
                        : null,
                  }
                : null,
            });
          }

          if (sectionUnitPrices.length) {
            unitPrice = Prisma.Decimal.max(...sectionUnitPrices);
          }
        }

        const modifiersTotal = selectedModifierDetails.reduce(
          (total, modifier) => total.plus(modifier.total),
          new Prisma.Decimal(0),
        );
        const unitPriceWithModifiers = unitPrice
          ? unitPrice.plus(modifiersTotal)
          : null;
        const depositAmount =
          menuItem?.depositAmount !== undefined &&
          menuItem.depositAmount !== null
            ? new Prisma.Decimal(menuItem.depositAmount)
            : new Prisma.Decimal(0);
        const depositTotal = depositAmount.mul(cartItem.quantity);
        const lineTotal = unitPriceWithModifiers
          ? unitPriceWithModifiers.mul(cartItem.quantity).plus(depositTotal)
          : null;

        return {
          id: cartItem.id,
          type: 'ITEM' as const,
          menuItemId: cartItem.menuItemId,
          dealId: this.readDealId(cartItem.modifiers) ?? null,
          categoryId: menuItem?.categoryId ?? null,
          categoryIds: [
            ...(menuItem?.categoryId ? [menuItem.categoryId] : []),
            ...((menuItem?.categoryLinks ?? []).map(
              (entry) => entry.menuCategoryId,
            ) ?? []),
          ],
          variationId: cartItem.variationId,
          quantity: cartItem.quantity,
          prepTimeMinutes: menuItem?.prepTimeMinutes ?? null,
          note: cartItem.note,
          modifiers: selectedModifiers,
          selectedModifiers: selectedModifierDetails,
          sections,
          selectedSections: selectedSectionDetails,
          unitPrice: unitPrice ? Number(unitPrice) : unitPrice,
          modifiersTotal: Number(modifiersTotal),
          unitPriceWithModifiers: unitPriceWithModifiers
            ? Number(unitPriceWithModifiers)
            : unitPriceWithModifiers,
          depositAmount: Number(depositAmount),
          depositTotal: Number(depositTotal),
          lineTotal: lineTotal ? Number(lineTotal) : lineTotal,
          menuItem: menuItem
            ? {
                id: menuItem.id,
                name: menuItem.name,
                slug: menuItem.slug,
                description: menuItem.description,
                imageUrl: menuItem.imageUrl,
                category: menuItem.category
                  ? {
                      id: menuItem.category.id,
                      name: menuItem.category.name,
                      imageUrl: menuItem.category.imageUrl,
                    }
                  : null,
                isAvailable: branchOverride?.isAvailable ?? true,
                pricingMode: menuItem.pricingMode,
                prepTimeMinutes: menuItem.prepTimeMinutes ?? null,
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
                      description:
                        selectedVariationOverride?.displayText ??
                        selectedVariation.description ??
                        null,
                      displayText:
                        selectedVariationOverride?.displayText ?? null,
                      price: Number(
                        this.resolveVariationPrice(
                          selectedVariation,
                          branchOverride?.priceOverride ?? menuItem.basePrice,
                          menuItem.id,
                          cart.orderType,
                        ),
                      ),
                      pickupPrice:
                        selectedVariationOverride?.pickupPrice !== undefined &&
                        selectedVariationOverride?.pickupPrice !== null
                          ? Number(selectedVariationOverride.pickupPrice)
                          : null,
                    }
                  : null,
                modifiers: this.mapCartDirectModifiers(
                  menuItem,
                  cartItem.variationId,
                ),
              }
            : null,
        };
      }),
    );
    const pricedItems = await this.applyFixedDealPricingToCartItems(
      items,
      cart,
    );
    const displayItems = await this.groupDealItemsForCartResponse(
      pricedItems,
      cart,
    );

    const quote = user?.uid
      ? await this.getCartQuoteForResponse(user, cart)
      : null;

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
      tipAmount: Number(cart.tipAmount),
      customerNote: cart.customerNote,
      items: displayItems,
      ...(quote ? this.extractCartBillSummary(quote.data) : {}),
      ...(quote ? { quote: quote.data } : {}),
      createdAt: cart.createdAt,
      updatedAt: cart.updatedAt,
    });
  }

  private extractCartBillSummary(quoteData: unknown) {
    if (!quoteData || typeof quoteData !== 'object') {
      return {};
    }

    const quote = quoteData as Record<string, unknown>;
    const keys = [
      'subtotal',
      'taxAmount',
      'deliveryFee',
      'serviceChargeAmount',
      'chargeBreakdown',
      'tipAmount',
      'discountAmount',
      'walletAppliedAmount',
      'loyaltyDiscountAmount',
      'loyaltyPointsRedeemed',
      'totalAmount',
      'payableAmount',
      'couponCode',
      'appliedPromotion',
    ];

    return Object.fromEntries(
      keys
        .filter((key) => quote[key] !== undefined)
        .map((key) => [key, quote[key]]),
    );
  }

  private async applyFixedDealPricingToCartItems<
    T extends CartResponseDealLine,
  >(items: T[], cart: CartSnapshot): Promise<T[]> {
    const dealIds = [
      ...new Set(
        items
          .map((item) => item.dealId)
          .filter((dealId): dealId is string => typeof dealId === 'string'),
      ),
    ];

    if (!dealIds.length || !this.couponsService) {
      return items;
    }

    let pricedItems = items;

    for (const dealId of dealIds) {
      const pricing = await this.couponsService.getActiveFixedPriceDealPricing(
        cart.restaurantId,
        cart.branchId,
        dealId,
      );

      if (!pricing) {
        continue;
      }

      const dealItemIndexes = this.findDealItemIndexes(
        pricedItems,
        dealId,
        pricing,
      );
      const dealQuantity = this.resolveDealGroupQuantity(
        pricedItems,
        dealItemIndexes,
        pricing,
      );

      if (!dealItemIndexes.length || !dealQuantity) {
        continue;
      }

      const fixedTotal = pricing.fixedPrice.mul(dealQuantity);
      const merchandiseTotals = dealItemIndexes.map((index) => {
        const item = pricedItems[index];
        return new Prisma.Decimal(item.lineTotal ?? 0).minus(item.depositTotal);
      });
      const allocations = this.allocateFixedDealTotal(
        merchandiseTotals,
        fixedTotal,
      );
      const allocationByIndex = new Map(
        dealItemIndexes.map((itemIndex, allocationIndex) => [
          itemIndex,
          allocations[allocationIndex],
        ]),
      );

      pricedItems = pricedItems.map((item, index) => {
        const allocatedMerchandiseTotal = allocationByIndex.get(index);
        if (!allocatedMerchandiseTotal) {
          return item;
        }

        const unitPrice = allocatedMerchandiseTotal
          .div(item.quantity)
          .toDecimalPlaces(2);
        const lineTotal = allocatedMerchandiseTotal
          .plus(item.depositTotal)
          .toDecimalPlaces(2);

        return {
          ...item,
          unitPrice: Number(unitPrice),
          unitPriceWithModifiers: Number(unitPrice),
          lineTotal: Number(lineTotal),
        };
      });
    }

    return pricedItems;
  }

  private async groupDealItemsForCartResponse(
    items: CartResponseItem[],
    cart: CartSnapshot,
  ): Promise<CartDisplayItem[]> {
    const dealIds = [
      ...new Set(
        items
          .map((item) => item.dealId)
          .filter((dealId): dealId is string => typeof dealId === 'string'),
      ),
    ];

    if (!dealIds.length || !this.couponsService) {
      return items;
    }

    const groupedIndexes = new Set<number>();
    const groupedByFirstIndex = new Map<number, CartResponseDealItem>();

    for (const dealId of dealIds) {
      const pricing = await this.couponsService.getActiveFixedPriceDealPricing(
        cart.restaurantId,
        cart.branchId,
        dealId,
      );

      if (!pricing) {
        continue;
      }

      const dealItemIndexes = this.findDealItemIndexes(items, dealId, pricing);
      const dealQuantity = this.resolveDealGroupQuantity(
        items,
        dealItemIndexes,
        pricing,
      );

      if (!dealItemIndexes.length || !dealQuantity) {
        continue;
      }

      const includedItems = dealItemIndexes.map((index) => items[index]);
      const depositTotal = includedItems.reduce(
        (sum, item) => sum.plus(item.depositTotal),
        new Prisma.Decimal(0),
      );
      const lineTotal = includedItems.reduce(
        (sum, item) => sum.plus(item.lineTotal ?? 0),
        new Prisma.Decimal(0),
      );
      const firstIndex = dealItemIndexes[0];

      dealItemIndexes.forEach((index) => groupedIndexes.add(index));
      groupedByFirstIndex.set(firstIndex, {
        id: `deal:${dealId}`,
        type: 'DEAL',
        dealId,
        cartItemIds: includedItems.map((item) => item.id),
        menuItemIds: includedItems.map((item) => item.menuItemId),
        quantity: dealQuantity,
        unitPrice: Number(pricing.fixedPrice),
        modifiersTotal: 0,
        unitPriceWithModifiers: Number(pricing.fixedPrice),
        depositAmount: Number(depositTotal.div(dealQuantity)),
        depositTotal: Number(depositTotal),
        lineTotal: Number(lineTotal),
        deal: {
          id: pricing.dealId,
          code: pricing.code,
          title: pricing.title,
          description: pricing.description,
          imageUrl: pricing.imageUrl,
          fixedPrice: Number(pricing.fixedPrice),
        },
        includedItems,
      });
    }

    return items.flatMap((item, index): CartDisplayItem[] => {
      const groupedItem = groupedByFirstIndex.get(index);
      if (groupedItem) {
        return [groupedItem];
      }

      return groupedIndexes.has(index) ? [] : [item];
    });
  }

  private findDealItemIndexes<T extends CartResponseDealLine>(
    items: T[],
    dealId: string,
    pricing: Awaited<
      ReturnType<CouponsService['getActiveFixedPriceDealPricing']>
    >,
  ) {
    if (!pricing) {
      return [];
    }

    if (pricing.selectionMode === CouponDealSelectionMode.FLEXIBLE_ITEMS) {
      return items.flatMap((item, index) =>
        item.dealId === dealId && this.isFlexibleDealEligibleItem(item, pricing)
          ? [index]
          : [],
      );
    }

    const requiredItemIds = new Set(pricing.menuItemIds);

    return items.flatMap((item, index) =>
      item.dealId === dealId && requiredItemIds.has(item.menuItemId)
        ? [index]
        : [],
    );
  }

  private resolveDealGroupQuantity<T extends CartResponseDealLine>(
    items: T[],
    dealItemIndexes: number[],
    pricing: Awaited<
      ReturnType<CouponsService['getActiveFixedPriceDealPricing']>
    >,
  ) {
    if (!pricing || !dealItemIndexes.length) {
      return 0;
    }

    if (pricing.selectionMode === CouponDealSelectionMode.FLEXIBLE_ITEMS) {
      return this.resolveFlexibleDealGroupQuantity(
        dealItemIndexes.map((index) => items[index]),
        pricing,
      );
    }

    const presentItemIds = new Set(
      dealItemIndexes.map((index) => items[index].menuItemId),
    );
    const isComplete = pricing.menuItemIds.every((menuItemId) =>
      presentItemIds.has(menuItemId),
    );
    const firstQuantity = items[dealItemIndexes[0]]?.quantity;
    const hasSingleQuantity =
      firstQuantity !== undefined &&
      dealItemIndexes.every((index) => items[index].quantity === firstQuantity);

    return isComplete && hasSingleQuantity && firstQuantity ? firstQuantity : 0;
  }

  private resolveFlexibleDealGroupQuantity<T extends CartResponseDealLine>(
    items: T[],
    pricing: NonNullable<
      Awaited<ReturnType<CouponsService['getActiveFixedPriceDealPricing']>>
    >,
  ) {
    const categoryScopes = pricing.categoryScopes.filter(
      (scope) => scope.itemLimit && scope.itemLimit > 0,
    );

    if (categoryScopes.length) {
      const quantities = categoryScopes.map((scope) => {
        const selectedQuantity = items
          .filter((item) => item.categoryIds.includes(scope.menuCategoryId))
          .reduce((sum, item) => sum + item.quantity, 0);

        return Math.floor(selectedQuantity / (scope.itemLimit ?? 1));
      });

      return quantities.length ? Math.min(...quantities) : 0;
    }

    const requiredQuantity = pricing.requiredQuantity ?? 0;
    if (requiredQuantity < 1) {
      return 0;
    }

    const selectedQuantity = items.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );

    return Math.floor(selectedQuantity / requiredQuantity);
  }

  private isFlexibleDealEligibleItem<T extends CartResponseDealLine>(
    item: T,
    pricing: NonNullable<
      Awaited<ReturnType<CouponsService['getActiveFixedPriceDealPricing']>>
    >,
  ) {
    return (
      pricing.menuItemIds.includes(item.menuItemId) ||
      pricing.categoryScopes.some((scope) =>
        item.categoryIds.includes(scope.menuCategoryId),
      )
    );
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

  private async getCartQuoteForResponse(
    user: AuthUserContext,
    cart: CartSnapshot,
  ) {
    try {
      return await this.ordersService.quote(
        user,
        await this.toQuotePayload(cart),
      );
    } catch (error) {
      if (
        this.isDeliveryCoverageError(error) ||
        this.isMissingDeliveryAddressError(error) ||
        this.isModifierSelectionLimitError(error) ||
        this.isMinimumOrderAmountError(error)
      ) {
        return null;
      }

      throw error;
    }
  }

  private isDeliveryCoverageError(error: unknown) {
    if (!(error instanceof BadRequestException)) {
      return false;
    }

    const normalizedMessage = this.getBadRequestMessage(error);
    const deliveryMessage =
      typeof normalizedMessage === 'string'
        ? normalizedMessage.toLowerCase()
        : null;

    return (
      deliveryMessage !== null &&
      (deliveryMessage.includes('outside branch delivery radius') ||
        deliveryMessage.includes('outside branch delivery zones') ||
        deliveryMessage.includes('outside branch delivery zone bands') ||
        deliveryMessage.includes('delivery address must include lat/lng') ||
        deliveryMessage.includes('branch delivery zones are not configured') ||
        deliveryMessage.includes(
          'branch delivery zone bands are not configured',
        ) ||
        deliveryMessage.includes(
          'must include postalcode for postal-code delivery pricing',
        ) ||
        (deliveryMessage.includes('postal code') &&
          (deliveryMessage.includes('not serviceable') ||
            deliveryMessage.includes('not in deliveryzone') ||
            deliveryMessage.includes('not in delivery zone') ||
            deliveryMessage.includes('service area'))) ||
        (deliveryMessage.includes('delivery address') &&
          deliveryMessage.includes('service area')))
    );
  }

  private isMissingDeliveryAddressError(error: unknown) {
    if (!(error instanceof BadRequestException)) {
      return false;
    }

    const normalizedMessage = this.getBadRequestMessage(error);

    return (
      typeof normalizedMessage === 'string' &&
      normalizedMessage
        .toLowerCase()
        .includes('deliveryaddressid or guestdeliveryaddress is required')
    );
  }

  private isModifierSelectionLimitError(error: unknown) {
    if (!(error instanceof BadRequestException)) {
      return false;
    }

    const normalizedMessage = this.getBadRequestMessage(error);

    return (
      typeof normalizedMessage === 'string' &&
      (normalizedMessage.includes('requires at least') ||
        normalizedMessage.includes('allows at most')) &&
      normalizedMessage.includes('modifier selection(s)')
    );
  }

  private isMinimumOrderAmountError(error: unknown) {
    if (!(error instanceof BadRequestException)) {
      return false;
    }

    const normalizedMessage = this.getBadRequestMessage(error);

    return (
      typeof normalizedMessage === 'string' &&
      normalizedMessage.includes('Subtotal is below') &&
      normalizedMessage.includes('minimum order amount')
    );
  }

  private getBadRequestMessage(error: BadRequestException) {
    const response = error.getResponse();
    const message =
      typeof response === 'string'
        ? response
        : typeof response === 'object' &&
            response !== null &&
            'message' in response
          ? (response as { message?: unknown }).message
          : error.message;

    return Array.isArray(message) ? message.join(' ') : message;
  }

  private async resolveMediaResponse<T>(data: T) {
    return (await this.storageService?.resolveMediaUrlsDeep(data)) ?? data;
  }

  private normalizeVariations<
    T extends {
      price?: Prisma.Decimal | null;
      itemPriceOverrides?: Array<{
        menuItemId: string;
        price: Prisma.Decimal;
        pickupPrice?: Prisma.Decimal | null;
        displayText?: string | null;
      }>;
    },
  >(variations: T[] | undefined | null, menuItemId?: string) {
    return (variations ?? []).map((variation) => {
      const override = variation.itemPriceOverrides?.find(
        (itemOverride) => itemOverride.menuItemId === menuItemId,
      );

      return {
        ...variation,
        price: override?.price ?? variation.price ?? new Prisma.Decimal(0),
        pickupPrice: override?.pickupPrice ?? null,
        displayText: override?.displayText ?? null,
      };
    });
  }

  private resolveVariationPrice(
    variation: {
      price: Prisma.Decimal;
      itemPriceOverrides?: Array<{
        menuItemId: string;
        price: Prisma.Decimal;
        pickupPrice?: Prisma.Decimal | null;
        displayText?: string | null;
      }>;
    },
    basePrice: Prisma.Decimal,
    menuItemId?: string,
    orderType?: OrderType,
  ) {
    const override = variation.itemPriceOverrides?.find(
      (itemOverride) => itemOverride.menuItemId === menuItemId,
    );

    if (orderType === OrderType.TAKEAWAY && override?.pickupPrice) {
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
    orderType: OrderType,
  ) {
    return (
      orderType === OrderType.TAKEAWAY &&
      !!variation.itemPriceOverrides?.find(
        (itemOverride) =>
          itemOverride.menuItemId === menuItemId && !!itemOverride.pickupPrice,
      )
    );
  }

  private async toQuotePayload(cart: CartSnapshot): Promise<QuoteOrderDto> {
    const orderType = this.toOrderTypeEnum(cart.orderType);

    return {
      branchId: cart.branchId,
      customerId: cart.customerId,
      restaurantMenuId: cart.restaurantMenuId ?? undefined,
      orderType,
      deliveryAddressId:
        cart.orderType === OrderType.DELIVERY
          ? ((await this.resolveEffectiveDeliveryAddressId(cart)) ?? undefined)
          : undefined,
      couponCode: cart.couponCode ?? undefined,
      tipAmount: Number(cart.tipAmount),
      orderTime:
        cart.orderTime?.toISOString() ??
        (orderType === OrderTypeEnum.DELIVERY
          ? new Date().toISOString()
          : undefined),
      items: cart.items.map((item) => {
        const dealId = this.readDealId(item.modifiers);

        return {
          menuItemId: item.menuItemId,
          dealId,
          variationId: dealId ? undefined : (item.variationId ?? undefined),
          quantity: item.quantity,
          modifiers: this.readModifiers(item.modifiers),
          sections: dealId ? undefined : this.readSections(item.modifiers),
          note: item.note ?? undefined,
        };
      }),
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
        dto.scheduledDeliveryAt ??
        cart.orderTime?.toISOString() ??
        (cart.orderType === OrderType.DELIVERY
          ? new Date().toISOString()
          : undefined),
      paymentMethod: this.resolveCheckoutPaymentMethod(cart, dto),
      walletAmount: dto.walletAmount,
      loyaltyPoints: dto.loyaltyPoints,
      guestContact: dto.guestContact,
      guestDeliveryAddress: dto.guestDeliveryAddress,
      tipAmount: dto.tipAmount ?? Number(cart.tipAmount),
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
  ): Promise<AddCartItemDto> {
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

    const explicitDealId = this.resolveOptionalString(dto.dealId);
    const explicitDealOptions = explicitDealId
      ? await this.getReadyMadeDealItemOptions(
          restaurantId,
          branchId,
          explicitDealId,
          menuItem.id,
        )
      : null;
    const inferredDealId = explicitDealId
      ? (explicitDealOptions?.dealId ?? null)
      : await this.findReadyMadeDealIdForItem(
          restaurantId,
          branchId,
          menuItem.id,
        );

    if (explicitDealId && !inferredDealId) {
      throw new BadRequestException(
        `Deal not found for item: ${menuItem.name}`,
      );
    }

    const validatedDto = inferredDealId
      ? {
          ...dto,
          dealId: inferredDealId,
          variationId: explicitDealOptions?.forcedVariationId ?? undefined,
          modifiers: undefined,
          modifierSelections: undefined,
          sections: undefined,
        }
      : dto;

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
        !this.itemMatchesMenuCategories(menuItem, restaurantMenu.categoryIds)
      ) {
        throw new BadRequestException(
          `Menu item is not available in selected menu: ${menuItem.name}`,
        );
      }
    }

    if (validatedDto.variationId) {
      const variation = menuItem.variations.find(
        (item) => item.id === validatedDto.variationId,
      );
      if (!variation) {
        throw new BadRequestException(
          `Variation not found for item: ${menuItem.name}`,
        );
      }
    }

    for (const modifier of this.resolveSelectedModifiers(validatedDto) ?? []) {
      const found = this.findAvailableModifier(menuItem, modifier.modifierId);

      if (!found) {
        throw new BadRequestException(
          `Modifier not found for item: ${menuItem.name}`,
        );
      }
    }

    this.assertItemQuantityLimits(menuItem, dto.quantity);
    if (!inferredDealId) {
      this.assertModifierSelectionLimits(
        menuItem,
        validatedDto.modifiers ?? [],
        validatedDto.modifierSelections ?? [],
      );
    }

    await this.assertValidSplitSections(menuItem, branchId, validatedDto);

    return validatedDto;
  }

  private async getReadyMadeDealItemOptions(
    restaurantId: string,
    branchId: string,
    dealId: string,
    menuItemId: string,
  ) {
    const options =
      (await this.couponsService?.getActiveFixedPriceDealItemOptions?.(
        restaurantId,
        branchId,
        dealId,
        menuItemId,
      )) ?? null;

    if (options) {
      return options;
    }

    const isFixedDealItem =
      (await this.couponsService?.isActiveFixedPriceDealItem(
        restaurantId,
        branchId,
        dealId,
        menuItemId,
      )) ?? false;

    return isFixedDealItem ? { dealId, forcedVariationId: null } : null;
  }

  private async findReadyMadeDealIdForItem(
    restaurantId: string,
    branchId: string,
    menuItemId: string,
  ) {
    return (
      (await this.couponsService?.findActiveFixedPriceDealIdForItem?.(
        restaurantId,
        branchId,
        menuItemId,
      )) ?? null
    );
  }

  private assertModifierSelectionLimits(
    menuItem: CartModifierSource,
    modifiers: CartItemModifierDto[],
    modifierSelections: CartItemModifierSelectionDto[] = [],
  ) {
    if (this.getAvailableModifierLinks(menuItem).length) {
      this.assertGroupedModifierSelectionLimits(
        menuItem,
        modifierSelections.length
          ? modifierSelections
          : this.groupFlatModifierSelections(menuItem, modifiers),
      );
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

  private groupFlatModifierSelections(
    menuItem: CartModifierSource,
    modifiers: CartItemModifierDto[],
  ): CartItemModifierSelectionDto[] {
    const selectionsByGroupId = new Map<string, CartItemModifierSelectionDto>();

    for (const modifier of modifiers) {
      for (const link of this.getAvailableModifierLinks(menuItem)) {
        const hasModifier = link.modifierGroup.modifierLinks.some(
          (modifierLink) => modifierLink.modifier.id === modifier.modifierId,
        );

        if (!hasModifier) {
          continue;
        }

        const selection = selectionsByGroupId.get(link.modifierGroup.id) ?? {
          modifierGroupId: link.modifierGroup.id,
          modifiers: [],
        };
        selection.modifiers.push(modifier);
        selectionsByGroupId.set(link.modifierGroup.id, selection);
        break;
      }
    }

    return [...selectionsByGroupId.values()];
  }

  private assertGroupedModifierSelectionLimits(
    menuItem: CartModifierSource,
    modifierSelections: CartItemModifierSelectionDto[],
  ) {
    const availableLinks = this.getAvailableModifierLinks(menuItem);
    const linksByGroupId = new Map(
      availableLinks.map((link) => [link.modifierGroup.id, link]),
    );
    const selectionsByGroupId = new Map<string, CartItemModifierSelectionDto>();

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
      const selectionType = link.selectionType ?? 'SINGLE';
      const minSelect = link.minSelect ?? link.modifierGroup.minSelect;
      const maxSelect = link.maxSelect ?? link.modifierGroup.maxSelect;

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
    menuItem: CartModifierSource,
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
    }
  }

  private getAvailableModifierLinks(item: CartModifierSource) {
    return [...(item.category?.modifierLinks ?? []), ...item.modifierLinks];
  }

  private findAvailableModifier(
    item: CartModifierSource,
    modifierId: string,
  ): CartModifierPricingSource | undefined {
    const directModifier = item.modifierPriceOverrides?.find(
      (override) => override.modifier.id === modifierId,
    );

    if (directModifier) {
      return {
        ...directModifier.modifier,
        itemPriceOverrides: [
          ...(directModifier.modifier.itemPriceOverrides ?? []),
          { menuItemId: item.id, priceDelta: directModifier.priceDelta },
        ],
      };
    }

    for (const link of this.getAvailableModifierLinks(item)) {
      const modifier = link.modifierGroup.modifierLinks.find(
        (modifierLink) => modifierLink.modifier.id === modifierId,
      )?.modifier;

      if (modifier) {
        return modifier;
      }
    }

    return undefined;
  }

  private mapCartDirectModifiers(
    item: CartModifierSource,
    variationId: string | null,
  ) {
    return (item.modifierPriceOverrides ?? []).map((override) => {
      const modifier = {
        ...override.modifier,
        itemPriceOverrides: [
          ...(override.modifier.itemPriceOverrides ?? []),
          { menuItemId: item.id, priceDelta: override.priceDelta },
        ],
      };

      return {
        id: modifier.id,
        name: modifier.name,
        sortOrder: 0,
        priceDelta: Number(
          this.resolveModifierPriceDelta(modifier, item.id, variationId),
        ),
        isRequired: override.isRequired ?? false,
      };
    });
  }

  private mapCartModifierGroups(
    item: CartModifierSource,
    variationId: string | null,
  ) {
    const seenGroupIds = new Set<string>();

    return this.getAvailableModifierLinks(item)
      .filter((link) => {
        if (seenGroupIds.has(link.modifierGroup.id)) {
          return false;
        }

        seenGroupIds.add(link.modifierGroup.id);
        return true;
      })
      .map((link) => ({
        id: link.modifierGroup.id,
        name: link.modifierGroup.name,
        selectionType: link.selectionType ?? 'SINGLE',
        minSelect: link.minSelect ?? link.modifierGroup.minSelect,
        maxSelect: link.maxSelect ?? link.modifierGroup.maxSelect,
        isRequired: (link.minSelect ?? link.modifierGroup.minSelect) > 0,
        sortOrder: link.sortOrder,
        modifiers: link.modifierGroup.modifierLinks.map(
          ({ modifier, sortOrder }) => ({
            id: modifier.id,
            name: modifier.name,
            sortOrder,
            priceDelta: Number(
              this.resolveModifierPriceDelta(modifier, item.id, variationId),
            ),
          }),
        ),
      }));
  }

  private resolveModifierPriceDelta(
    modifier: CartModifierPricingSource,
    menuItemId: string,
    variationId: string | null,
  ) {
    const variationOverride = modifier.variationPriceOverrides?.find(
      (item) =>
        item.menuItemId === menuItemId && item.variationId === variationId,
    );
    const legacyVariationOverride = modifier.variationPriceOverrides?.find(
      (item) => item.menuItemId === null && item.variationId === variationId,
    );
    const itemOverride = modifier.itemPriceOverrides?.find(
      (item) => item.menuItemId === menuItemId,
    );

    return (
      variationOverride?.priceDelta ??
      legacyVariationOverride?.priceDelta ??
      itemOverride?.priceDelta ??
      modifier.priceDelta
    );
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

  private readModifierSelections(
    input: Prisma.JsonValue | null,
  ): CartItemModifierSelectionDto[] | undefined {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return undefined;
    }

    const rawSelections = (input as { modifierSelections?: unknown })
      .modifierSelections;
    if (!Array.isArray(rawSelections)) {
      return undefined;
    }

    const selections: CartItemModifierSelectionDto[] = [];

    for (const item of rawSelections) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        continue;
      }

      const raw = item as {
        modifierGroupId?: unknown;
        modifiers?: unknown;
      };
      if (
        typeof raw.modifierGroupId !== 'string' ||
        !Array.isArray(raw.modifiers)
      ) {
        continue;
      }

      const modifiers = this.readModifiers(raw.modifiers as Prisma.JsonValue);
      selections.push({
        modifierGroupId: raw.modifierGroupId,
        modifiers: modifiers ?? [],
      });
    }

    return selections.length ? selections : undefined;
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
      });
    }

    return sections.length ? sections : undefined;
  }

  private readDealId(input: Prisma.JsonValue | null): string | undefined {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return undefined;
    }

    const dealId = (input as { dealId?: unknown }).dealId;
    return typeof dealId === 'string' ? dealId : undefined;
  }

  private packCartSelections(
    modifiers?: CartItemModifierDto[],
    sections?: CartItemSectionDto[],
    dealId?: string,
    modifierSelections?: CartItemModifierSelectionDto[],
  ) {
    if (!sections?.length && !dealId && !modifierSelections?.length) {
      return modifiers?.length ? modifiers : undefined;
    }

    return {
      ...(dealId ? { dealId } : {}),
      modifiers: modifiers?.length ? modifiers : [],
      ...(modifierSelections?.length ? { modifierSelections } : {}),
      ...(sections?.length
        ? {
            sections: sections.map((section) => ({
              slot: section.slot,
              menuItemId: section.menuItemId,
            })),
          }
        : {}),
    };
  }

  private resolveSelectedModifiers(dto: {
    modifiers?: CartItemModifierDto[];
    modifierSelections?: CartItemModifierSelectionDto[];
  }) {
    return dto.modifierSelections?.length
      ? this.flattenModifierSelections(dto.modifierSelections)
      : dto.modifiers;
  }

  private flattenModifierSelections(
    modifierSelections: CartItemModifierSelectionDto[],
  ): CartItemModifierDto[] | undefined {
    const modifiers = modifierSelections.flatMap((selection) =>
      selection.modifiers.map((modifier) => ({
        modifierId: modifier.modifierId,
        quantity: modifier.quantity,
      })),
    );

    return modifiers.length ? modifiers : undefined;
  }

  private isSameCartSelection(
    existing: CartSnapshotItem,
    incoming: {
      menuItemId: string;
      variationId: string | null;
      note: string | null;
      modifiers: Prisma.JsonValue | null | undefined;
    },
  ) {
    return (
      existing.menuItemId === incoming.menuItemId &&
      (existing.variationId ?? null) === incoming.variationId &&
      (this.resolveOptionalString(existing.note) ?? null) === incoming.note &&
      this.stableJson(existing.modifiers ?? null) ===
        this.stableJson(incoming.modifiers ?? null)
    );
  }

  private stableJson(value: Prisma.JsonValue | null): string {
    return JSON.stringify(this.sortJson(value));
  }

  private sortJson(value: Prisma.JsonValue | null): Prisma.JsonValue | null {
    if (!value || typeof value !== 'object') {
      return value;
    }

    if (Array.isArray(value)) {
      return value
        .map((item) => this.sortJson(item))
        .sort((left, right) =>
          JSON.stringify(left).localeCompare(JSON.stringify(right)),
        );
    }

    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, this.sortJson(item as Prisma.JsonValue)]),
    ) as Prisma.JsonObject;
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

  private itemMatchesMenuCategories(
    item: {
      category: { id: string };
      categoryLinks?: Array<{ menuCategoryId: string }>;
    },
    categoryIds: Set<string>,
  ) {
    return [
      item.category.id,
      ...(item.categoryLinks ?? []).map((link) => link.menuCategoryId),
    ].some((categoryId) => categoryIds.has(categoryId));
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

  private async buildEmptyCart(
    customerId: string,
    overrides: Partial<{
      orderType: OrderTypeEnum;
    }> = {},
  ) {
    const defaultAddressId = await this.getDefaultAddressId(customerId);

    return {
      id: null,
      restaurantId: null,
      branchId: null,
      customerId,
      restaurantMenuId: null,
      orderType: overrides.orderType ?? OrderType.DELIVERY,
      deliveryAddressId: defaultAddressId,
      couponCode: null,
      paymentMethod: null,
      orderTime: null,
      tipAmount: 0,
      customerNote: null,
      items: [],
      createdAt: null,
      updatedAt: null,
    };
  }
}
