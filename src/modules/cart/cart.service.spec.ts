import { BadRequestException } from '@nestjs/common';
import { OrderType } from '@prisma/client';
import { UserRoleEnum } from '../../common/enums';
import { CartService } from './cart.service';

describe('CartService', () => {
  const makeService = () => {
    const cartRepository = {
      findByCustomerId: jest.fn(),
      findActiveBranch: jest.fn(),
      findOwnedAddress: jest.fn(),
      findMenuItemForCart: jest.fn(),
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
    expect(result.data.quote).toBeNull();
    expect(cartRepository.findByCustomerId).toHaveBeenCalledWith('user-1');
  });

  it('rejects branch switch when cart still has items', async () => {
    const { service, cartRepository } = makeService();
    cartRepository.findByCustomerId.mockResolvedValue({
      id: 'cart-1',
      branchId: 'branch-1',
      orderType: OrderType.DELIVERY,
      items: [{ id: 'item-1' }],
    });
    cartRepository.findActiveBranch.mockResolvedValue({
      id: 'branch-2',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
    });

    await expect(
      service.updateContext(
        {
          uid: 'user-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          role: UserRoleEnum.CUSTOMER,
        },
        { branchId: 'branch-2' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns quote error instead of failing cart fetch when quote is invalid', async () => {
    const { service, cartRepository, ordersService } = makeService();
    cartRepository.findByCustomerId.mockResolvedValue({
      id: 'cart-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'user-1',
      orderType: OrderType.DELIVERY,
      deliveryAddressId: null,
      couponCode: null,
      customerNote: null,
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
    ordersService.quote.mockRejectedValue(
      new BadRequestException(
        'deliveryAddressId is required for delivery orders',
      ),
    );

    const result = await service.getCart({
      uid: 'user-1',
      tid: 'tenant-1',
      rid: 'restaurant-1',
      role: UserRoleEnum.CUSTOMER,
    });

    expect(result.data.quote).toBeNull();
    expect(result.data.quoteError).toBe(
      'deliveryAddressId is required for delivery orders',
    );
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
        orderType: OrderType.DELIVERY,
        deliveryAddressId: null,
        couponCode: null,
        customerNote: null,
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
      orderType: OrderType.DELIVERY,
      deliveryAddressId: null,
      couponCode: null,
      customerNote: null,
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
    const buildCartResponseSpy = jest
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
      orderType: OrderType.DELIVERY,
    });
    expect(cartRepository.createItem).toHaveBeenCalledWith({
      cart: { connect: { id: 'cart-1' } },
      menuItemId: 'menu-1',
      variationId: undefined,
      quantity: 2,
      note: undefined,
      modifiers: undefined,
    });
    expect(result.message).toBe('Item added to cart successfully');
    buildCartResponseSpy.mockRestore();
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

  it('includes customerId when building order quote payload from cart', () => {
    const { service } = makeService();

    const payload = (
      service as unknown as {
        toQuotePayload: (cart: {
          branchId: string;
          customerId: string;
          orderType: OrderType;
          deliveryAddressId: string | null;
          couponCode: string | null;
          items: {
            id: string;
            menuItemId: string;
            variationId: string | null;
            quantity: number;
            note: string | null;
            modifiers: null;
          }[];
        }) => {
          branchId: string;
          customerId?: string;
        };
      }
    ).toQuotePayload({
      branchId: 'branch-1',
      customerId: 'customer-1',
      orderType: OrderType.DELIVERY,
      deliveryAddressId: null,
      couponCode: null,
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

    expect(payload.customerId).toBe('customer-1');
    expect(payload.branchId).toBe('branch-1');
  });
});
