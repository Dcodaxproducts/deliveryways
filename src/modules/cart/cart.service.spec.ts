import { BadRequestException } from '@nestjs/common';
import {
  OrderTypeEnum,
  PaymentMethodEnum,
  UserRoleEnum,
} from '../../common/enums';
import { CartService } from './cart.service';

describe('CartService', () => {
  const makeService = () => {
    const cartRepository = {
      findByCustomerId: jest.fn(),
      findActiveBranch: jest.fn(),
      findMenuItemForCart: jest.fn(),
      findMenuItemsForResponse: jest.fn(),
      findActiveCustomer: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      createItem: jest.fn(),
      findItemByIdForCustomer: jest.fn(),
      updateItem: jest.fn(),
      deleteItem: jest.fn(),
      deleteByCustomerId: jest.fn(),
    };

    const ordersService = {
      quote: jest.fn(),
      create: jest.fn(),
    };

    const service = new CartService(
      cartRepository as never,
      ordersService as never,
    );

    return { service, cartRepository, ordersService };
  };

  it('returns an empty cart when customer cart does not exist', async () => {
    const { service, cartRepository } = makeService();
    cartRepository.findByCustomerId.mockResolvedValue(null);

    const result = await service.getCart({
      uid: 'user-1',
      tid: 'tenant-1',
      rid: 'restaurant-1',
      role: UserRoleEnum.CUSTOMER,
    });

    expect(result.data.items).toEqual([]);
    expect(cartRepository.findByCustomerId).toHaveBeenCalledWith('user-1');
  });

  it('returns populated cart item details without auto-quote', async () => {
    const { service, cartRepository, ordersService } = makeService();
    cartRepository.findByCustomerId.mockResolvedValue({
      id: 'cart-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [
        {
          id: 'item-1',
          menuItemId: 'menu-1',
          variationId: null,
          quantity: 1,
          note: null,
          modifiers: null,
        },
      ],
    });
    cartRepository.findMenuItemsForResponse.mockResolvedValue([
      {
        id: 'menu-1',
        name: 'Burger',
        slug: 'burger',
        description: 'Beef burger',
        imageUrl: 'burger.png',
        basePrice: 450,
        category: { id: 'cat-1', name: 'Burgers', imageUrl: null },
        variations: [],
        branchOverrides: [],
      },
    ]);

    const result = await service.getCart({
      uid: 'user-1',
      tid: 'tenant-1',
      rid: 'restaurant-1',
      role: UserRoleEnum.CUSTOMER,
    });

    const firstItem = result.data.items[0] as {
      menuItemId: string;
      menuItem: { name: string } | null;
    };
    expect(firstItem.menuItem?.name).toBe('Burger');
    expect(firstItem.menuItemId).toBe('menu-1');
    expect(ordersService.quote).not.toHaveBeenCalled();
  });

  it('requires customerId for business-admin cart access', async () => {
    const { service } = makeService();

    await expect(
      (
        service as unknown as {
          resolveCartCustomerId: (
            user: {
              uid: string;
              tid?: string;
              rid?: string;
              role: UserRoleEnum;
            },
            requestedCustomerId?: string,
          ) => Promise<string>;
        }
      ).resolveCartCustomerId({
        uid: 'admin-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows business-admin cart access when customer belongs to same restaurant', async () => {
    const { service, cartRepository } = makeService();
    cartRepository.findActiveCustomer.mockResolvedValue({ id: 'customer-1' });

    const customerId = await (
      service as unknown as {
        resolveCartCustomerId: (
          user: {
            uid: string;
            tid?: string;
            rid?: string;
            role: UserRoleEnum;
          },
          requestedCustomerId?: string,
        ) => Promise<string>;
      }
    ).resolveCartCustomerId(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      'customer-1',
    );

    expect(customerId).toBe('customer-1');
    expect(cartRepository.findActiveCustomer).toHaveBeenCalledWith(
      'customer-1',
      'tenant-1',
      'restaurant-1',
    );
  });

  it('creates cart on first add-item when cart does not exist', async () => {
    const { service, cartRepository } = makeService();
    cartRepository.findByCustomerId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'cart-1',
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
        customerId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [],
      });
    cartRepository.findActiveBranch.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
    });
    cartRepository.create.mockResolvedValue({
      id: 'cart-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [],
    });
    cartRepository.findMenuItemForCart.mockResolvedValue({
      id: 'menu-1',
      name: 'Burger',
      variations: [],
      modifierLinks: [],
      branchOverrides: [],
    });
    cartRepository.createItem.mockResolvedValue({ id: 'item-1' });
    jest
      .spyOn(service as never, 'buildCartResponse' as never)
      .mockResolvedValue({ id: 'cart-1', items: [] } as never);

    const result = await service.addItem(
      {
        uid: 'user-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      {
        branchId: 'branch-1',
        menuItemId: 'menu-1',
        quantity: 2,
      },
    );

    expect(cartRepository.create).toHaveBeenCalledWith({
      tenant: { connect: { id: 'tenant-1' } },
      restaurant: { connect: { id: 'restaurant-1' } },
      branch: { connect: { id: 'branch-1' } },
      customer: { connect: { id: 'user-1' } },
    });
    expect(result.message).toBe('Item added to cart successfully');
  });

  it('requires branchId on first add-item when cart does not exist', async () => {
    const { service, cartRepository } = makeService();
    cartRepository.findByCustomerId.mockResolvedValue(null);

    await expect(
      service.addItem(
        {
          uid: 'user-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          role: UserRoleEnum.CUSTOMER,
        },
        {
          menuItemId: 'menu-1',
          quantity: 1,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('includes checkout-only fields when building cart quote payload', () => {
    const { service } = makeService();

    const payload = (
      service as unknown as {
        toQuotePayload: (
          cart: {
            branchId: string;
            customerId: string;
            items: {
              id: string;
              menuItemId: string;
              variationId: string | null;
              quantity: number;
              note: string | null;
              modifiers: null;
            }[];
          },
          dto: {
            orderType: 'DELIVERY';
            deliveryAddressId?: string | null;
            couponCode?: string | null;
            orderTime: string;
          },
        ) => {
          branchId: string;
          customerId?: string;
          deliveryAddressId?: string;
          orderTime: string;
        };
      }
    ).toQuotePayload(
      {
        branchId: 'branch-1',
        customerId: 'customer-1',
        items: [
          {
            id: 'item-1',
            menuItemId: 'menu-1',
            variationId: null,
            quantity: 1,
            note: null,
            modifiers: null,
          },
        ],
      },
      {
        orderType: 'DELIVERY',
        deliveryAddressId: 'address-1',
        couponCode: 'SAVE10',
        orderTime: '2026-03-24T19:30:00.000Z',
      },
    );

    expect(payload.customerId).toBe('customer-1');
    expect(payload.branchId).toBe('branch-1');
    expect(payload.deliveryAddressId).toBe('address-1');
    expect(payload.orderTime).toBe('2026-03-24T19:30:00.000Z');
  });

  it('creates order from cart without frontend resending branchId or items', async () => {
    const { service, cartRepository, ordersService } = makeService();
    cartRepository.findByCustomerId.mockResolvedValue({
      id: 'cart-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [
        {
          id: 'item-1',
          menuItemId: 'menu-1',
          variationId: null,
          quantity: 1,
          note: null,
          modifiers: null,
        },
      ],
    });
    ordersService.create.mockResolvedValue({
      data: { id: 'order-1' },
      message: 'Order created successfully',
    });

    const result = await service.checkout(
      {
        uid: 'customer-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      {
        orderType: OrderTypeEnum.DELIVERY,
        deliveryAddressId: 'address-1',
        couponCode: 'SAVE10',
        orderTime: '2026-03-24T19:30:00.000Z',
        paymentMethod: PaymentMethodEnum.COD,
      },
    );

    expect(ordersService.create).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        branchId: 'branch-1',
        items: [expect.objectContaining({ menuItemId: 'menu-1' })],
        paymentMethod: PaymentMethodEnum.COD,
      }),
    );
    expect(cartRepository.deleteByCustomerId).toHaveBeenCalledWith(
      'customer-1',
    );
    expect(result.message).toBe('Order created from cart successfully');
  });
});
