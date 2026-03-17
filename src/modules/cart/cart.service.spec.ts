import { BadRequestException } from '@nestjs/common';
import { OrderType } from '@prisma/client';
import { CartService } from './cart.service';

describe('CartService', () => {
  const makeService = () => {
    const cartRepository = {
      findByCustomerId: jest.fn(),
      findActiveBranch: jest.fn(),
      findOwnedAddress: jest.fn(),
      findMenuItemForCart: jest.fn(),
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
      role: 'CUSTOMER' as never,
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
          role: 'CUSTOMER' as never,
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
      role: 'CUSTOMER' as never,
    });

    expect(result.data.quote).toBeNull();
    expect(result.data.quoteError).toBe(
      'deliveryAddressId is required for delivery orders',
    );
  });
});
