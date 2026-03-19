import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderType, Prisma } from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import { OrderTypeEnum, UserRoleEnum } from '../../common/enums';
import { OrdersService } from '../orders/orders.service';
import { QuoteOrderDto } from '../orders/dto';
import {
  AddCartItemDto,
  CartItemModifierDto,
  UpdateCartContextDto,
  UpdateCartItemDto,
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
  ) {}

  async getCart(user: AuthUserContext, requestedCustomerId?: string) {
    const customerId = await this.resolveCartCustomerId(user, requestedCustomerId);
    const cart = await this.cartRepository.findByCustomerId(customerId);

    if (!cart) {
      return {
        data: this.buildEmptyCart(),
        message: 'Cart fetched successfully',
      };
    }

    return {
      data: await this.buildCartResponse(user, cart),
      message: 'Cart fetched successfully',
    };
  }

  async updateContext(
    user: AuthUserContext,
    dto: UpdateCartContextDto,
    requestedCustomerId?: string,
  ) {
    const customerId = await this.resolveCartCustomerId(user, requestedCustomerId);
    const tenantId = this.getRequiredTenantId(user);
    const existingCart = await this.cartRepository.findByCustomerId(customerId);

    const branchId = dto.branchId ?? existingCart?.branchId;
    if (!branchId) {
      throw new BadRequestException('branchId is required to set cart context');
    }

    const branch = await this.cartRepository.findActiveBranch(branchId);
    if (!branch) {
      throw new BadRequestException('Branch not found or inactive');
    }

    this.ensureRestaurantAccess(user, branch.restaurantId);

    if (
      existingCart &&
      existingCart.branchId !== branch.id &&
      existingCart.items.length > 0
    ) {
      throw new BadRequestException(
        'Clear cart before switching to another branch',
      );
    }

    const orderType =
      dto.orderType ?? existingCart?.orderType ?? OrderType.DELIVERY;
    const deliveryAddressId = this.resolveOptionalString(dto.deliveryAddressId);
    if (deliveryAddressId) {
      await this.assertOwnedAddress(tenantId, customerId, deliveryAddressId);
    }

    const deliveryAddressRelation = deliveryAddressId
      ? { connect: { id: deliveryAddressId } }
      : dto.deliveryAddressId !== undefined
        ? { disconnect: true }
        : undefined;

    const couponCode = this.resolveOptionalString(dto.couponCode);
    const customerNote = this.resolveOptionalString(dto.customerNote);

    const cart = existingCart
      ? await this.cartRepository.update(existingCart.id, {
          tenant: { connect: { id: branch.tenantId } },
          restaurant: { connect: { id: branch.restaurantId } },
          branch: { connect: { id: branch.id } },
          orderType,
          deliveryAddress: deliveryAddressRelation,
          couponCode,
          customerNote,
        })
      : await this.cartRepository.create({
          tenant: { connect: { id: branch.tenantId } },
          restaurant: { connect: { id: branch.restaurantId } },
          branch: { connect: { id: branch.id } },
          customer: { connect: { id: customerId } },
          orderType,
          deliveryAddress: deliveryAddressId
            ? { connect: { id: deliveryAddressId } }
            : undefined,
          couponCode,
          customerNote,
        });

    return {
      data: await this.buildCartResponse(user, cart),
      message: 'Cart updated successfully',
    };
  }

  async addItem(
    user: AuthUserContext,
    dto: AddCartItemDto,
    requestedCustomerId?: string,
  ) {
    const cart = await this.getExistingCartOrThrow(user, requestedCustomerId);
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
    );

    return {
      data: await this.buildCartResponse(user, updatedCart),
      message: 'Item added to cart successfully',
    };
  }

  async updateItem(
    user: AuthUserContext,
    itemId: string,
    dto: UpdateCartItemDto,
    requestedCustomerId?: string,
  ) {
    const customerId = await this.resolveCartCustomerId(user, requestedCustomerId);
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
    );

    return {
      data: await this.buildCartResponse(user, updatedCart),
      message: 'Cart item updated successfully',
    };
  }

  async removeItem(
    user: AuthUserContext,
    itemId: string,
    requestedCustomerId?: string,
  ) {
    const customerId = await this.resolveCartCustomerId(user, requestedCustomerId);
    const item = await this.cartRepository.findItemByIdForCustomer(
      itemId,
      customerId,
    );

    if (!item) {
      throw new NotFoundException('Cart item not found');
    }

    await this.cartRepository.deleteItem(item.id);
    const cart = await this.cartRepository.findByCustomerId(item.cart.customerId);

    return {
      data: cart
        ? await this.buildCartResponse(user, cart)
        : this.buildEmptyCart(),
      message: 'Cart item removed successfully',
    };
  }

  async clearCart(user: AuthUserContext, requestedCustomerId?: string) {
    const customerId = await this.resolveCartCustomerId(user, requestedCustomerId);
    const cart = await this.cartRepository.findByCustomerId(customerId);

    if (cart) {
      await this.cartRepository.deleteByCustomerId(customerId);
    }

    return {
      data: this.buildEmptyCart(),
      message: 'Cart cleared successfully',
    };
  }

  async quote(user: AuthUserContext, requestedCustomerId?: string) {
    const cart = await this.getExistingCartOrThrow(user, requestedCustomerId);
    if (!cart.items.length) {
      throw new BadRequestException('Cart is empty');
    }

    const quote = await this.ordersService.quote(user, this.toQuotePayload(cart));
    return {
      data: quote.data,
      message: 'Cart quote generated successfully',
    };
  }

  private async getExistingCartOrThrow(
    user: AuthUserContext,
    requestedCustomerId?: string,
  ) {
    const customerId = await this.resolveCartCustomerId(user, requestedCustomerId);
    const cart = await this.cartRepository.findByCustomerId(customerId);

    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    return cart;
  }

  private async buildCartResponse(user: AuthUserContext, cart: CartSnapshot) {
    let quote: Awaited<ReturnType<OrdersService['quote']>>['data'] | null = null;
    let quoteError: string | null = null;

    if (cart.items.length) {
      try {
        quote = (await this.ordersService.quote(user, this.toQuotePayload(cart)))
          .data;
      } catch (error) {
        if (error instanceof HttpException) {
          quoteError = error.message;
        } else {
          throw error;
        }
      }
    }

    return {
      id: cart.id,
      tenantId: cart.tenantId,
      restaurantId: cart.restaurantId,
      branchId: cart.branchId,
      customerId: cart.customerId,
      orderType: cart.orderType,
      deliveryAddressId: cart.deliveryAddressId,
      couponCode: cart.couponCode,
      customerNote: cart.customerNote,
      items: cart.items.map((item) => ({
        id: item.id,
        menuItemId: item.menuItemId,
        variationId: item.variationId,
        quantity: item.quantity,
        note: item.note,
        modifiers: this.readModifiers(item.modifiers),
      })),
      quote,
      quoteError,
      createdAt: cart.createdAt,
      updatedAt: cart.updatedAt,
    };
  }

  private toQuotePayload(cart: CartSnapshot): QuoteOrderDto {
    return {
      branchId: cart.branchId,
      customerId: cart.customerId,
      orderType: cart.orderType as OrderTypeEnum,
      deliveryAddressId: cart.deliveryAddressId ?? undefined,
      couponCode: cart.couponCode ?? undefined,
      items: cart.items.map((item) => ({
        menuItemId: item.menuItemId,
        variationId: item.variationId ?? undefined,
        quantity: item.quantity,
        modifiers: this.readModifiers(item.modifiers),
        note: item.note ?? undefined,
      })),
    };
  }

  private async assertOwnedAddress(
    tenantId: string,
    customerId: string,
    deliveryAddressId: string,
  ) {
    const address = await this.cartRepository.findOwnedAddress(
      deliveryAddressId,
      tenantId,
      customerId,
    );

    if (!address) {
      throw new BadRequestException('Delivery address not found');
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

  private ensureRestaurantAccess(user: AuthUserContext, restaurantId: string) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return;
    }

    if (!user.rid || user.rid !== restaurantId) {
      throw new ForbiddenException(
        'You cannot access resources outside your restaurant',
      );
    }
  }

  private async resolveCartCustomerId(
    user: AuthUserContext,
    requestedCustomerId?: string,
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
    const restaurantId = this.getRequiredRestaurantId(user);
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

  private getRequiredRestaurantId(user: AuthUserContext) {
    if (!user.rid) {
      throw new ForbiddenException('Restaurant context is required');
    }

    return user.rid;
  }

  private getRequiredTenantId(user: AuthUserContext) {
    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    return user.tid;
  }

  private buildEmptyCart() {
    return {
      id: null,
      tenantId: null,
      restaurantId: null,
      branchId: null,
      customerId: null,
      orderType: OrderTypeEnum.DELIVERY,
      deliveryAddressId: null,
      couponCode: null,
      customerNote: null,
      items: [],
      quote: null,
      quoteError: null,
      createdAt: null,
      updatedAt: null,
    };
  }
}
