import { CartController } from './cart.controller';

describe('CartController', () => {
  it('passes compact add-item requests to the service response shortcut', () => {
    const cartService = { addItem: jest.fn() };
    const controller = new CartController(cartService as never);
    const user = {
      uid: 'customer-1',
      tid: 'tenant-1',
      rid: 'restaurant-1',
      role: 'CUSTOMER',
    };
    const dto = {
      branchId: 'branch-1',
      menuItemId: 'menu-item-1',
      quantity: 1,
    };

    void controller.addItem(user as never, dto, {
      customerId: 'customer-1',
      restaurantId: 'restaurant-1',
      compact: true,
    });

    expect(cartService.addItem).toHaveBeenCalledWith(
      user,
      dto,
      'customer-1',
      'restaurant-1',
      true,
    );
  });
});
