import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
      findRestaurantMenuById: jest.fn(),
      findMenuItemForCart: jest.fn(),
      findSplitSectionItems: jest.fn(),
      findMenuItemsForResponse: jest.fn(),
      findActiveCustomer: jest.fn(),
      findOwnedAddress: jest.fn(),
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
      quoteForCouponValidation: jest.fn(),
      assertDeliveryAddressCoverage: jest.fn(),
      create: jest.fn(),
    };

    const profilesRepository = {
      findByUserId: jest.fn(),
    };

    const storageService = {
      resolveMediaUrlsDeep: jest.fn((data: unknown) => Promise.resolve(data)),
    };

    const service = new CartService(
      cartRepository as never,
      ordersService as never,
      profilesRepository as never,
      storageService as never,
    );

    return {
      service,
      cartRepository,
      ordersService,
      profilesRepository,
      storageService,
    };
  };

  it('returns an empty cart when customer cart does not exist', async () => {
    const { service, cartRepository, profilesRepository } = makeService();
    cartRepository.findByCustomerId.mockResolvedValue(null);
    profilesRepository.findByUserId.mockResolvedValue({
      metadata: { defaultAddressId: 'address-1' },
    });
    const result = await service.getCart({
      uid: 'user-1',
      tid: 'tenant-1',
      rid: 'restaurant-1',
      role: UserRoleEnum.CUSTOMER,
    });

    expect(result.data.items).toEqual([]);
    expect(result.data.deliveryAddressId).toBe('address-1');
    expect(result.data).not.toHaveProperty('selectedAddressId');
    expect(result.data).not.toHaveProperty('defaultAddressId');
    expect(result.data).not.toHaveProperty('tenantId');
    expect(cartRepository.findByCustomerId).toHaveBeenCalledWith('user-1');
  });

  it('returns populated cart item details and selected address state', async () => {
    const {
      service,
      cartRepository,
      profilesRepository,
      ordersService,
      storageService,
    } = makeService();
    cartRepository.findByCustomerId.mockResolvedValue({
      id: 'cart-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'user-1',
      orderType: 'DELIVERY',
      deliveryAddressId: null,
      couponCode: 'SAVE10',
      paymentMethod: null,
      orderTime: null,
      customerNote: 'Less spicy',
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
        pricingMode: 'MULTIPLE',
        basePrice: 450,
        deliveryPriceAdjustment: 50,
        takeawayPriceAdjustment: 20,
        depositAmount: 50,
        category: { id: 'cat-1', name: 'Burgers', imageUrl: null },
        variations: [],
        modifierLinks: [],
        branchOverrides: [],
      },
    ]);
    profilesRepository.findByUserId.mockResolvedValue({
      metadata: { defaultAddressId: 'address-1' },
    });
    ordersService.quote.mockResolvedValue({
      data: { deliveryFee: 250, totalAmount: 800 },
      message: 'Order quote generated successfully',
    });

    const result = await service.getCart({
      uid: 'user-1',
      tid: 'tenant-1',
      rid: 'restaurant-1',
      role: UserRoleEnum.CUSTOMER,
    });

    const firstItem = result.data.items[0] as {
      menuItemId: string;
      depositAmount: number;
      depositTotal: number;
      lineTotal: number;
      menuItem: {
        name: string;
        depositAmount: number | null;
        unitPrice: number | null;
      } | null;
    };
    expect(firstItem.menuItem?.name).toBe('Burger');
    expect(firstItem.menuItem?.unitPrice).toBe(500);
    expect(firstItem.menuItem?.depositAmount).toBe(50);
    expect(firstItem.depositAmount).toBe(50);
    expect(firstItem.depositTotal).toBe(50);
    expect(firstItem.lineTotal).toBe(550);
    expect(firstItem.menuItemId).toBe('menu-1');
    expect(result.data.deliveryAddressId).toBe('address-1');
    expect(result.data).not.toHaveProperty('selectedAddressId');
    expect(result.data).not.toHaveProperty('defaultAddressId');
    expect(result.data).not.toHaveProperty('tenantId');
    expect(result.data.couponCode).toBe('SAVE10');
    const mediaPayload = storageService.resolveMediaUrlsDeep.mock
      .calls[0]?.[0] as
      | { items?: Array<{ menuItem?: { imageUrl?: string | null } }> }
      | undefined;
    expect(mediaPayload?.items?.[0]?.menuItem?.imageUrl).toBe('burger.png');
    expect(ordersService.quote).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'user-1' }),
      expect.objectContaining({
        branchId: 'branch-1',
        customerId: 'user-1',
        orderType: OrderTypeEnum.DELIVERY,
      }),
    );
    expect(
      (result.data as { quote?: { deliveryFee: number; totalAmount: number } })
        .quote,
    ).toEqual({ deliveryFee: 250, totalAmount: 800 });
  });

  it('returns cart without quote when saved address is outside delivery coverage', async () => {
    const { service, cartRepository, profilesRepository, ordersService } =
      makeService();
    cartRepository.findByCustomerId.mockResolvedValue({
      id: 'cart-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'user-1',
      orderType: 'DELIVERY',
      deliveryAddressId: 'address-1',
      couponCode: null,
      paymentMethod: null,
      orderTime: null,
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
    cartRepository.findMenuItemsForResponse.mockResolvedValue([
      {
        id: 'menu-1',
        name: 'Burger',
        slug: 'burger',
        description: null,
        imageUrl: null,
        pricingMode: 'SINGLE',
        basePrice: new Prisma.Decimal(500),
        deliveryPriceAdjustment: 0,
        takeawayPriceAdjustment: 0,
        depositAmount: 0,
        category: { id: 'cat-1', name: 'Burgers', imageUrl: null, items: [] },
        variations: [],
        modifierLinks: [],
        branchOverrides: [],
      },
    ]);
    profilesRepository.findByUserId.mockResolvedValue({ metadata: {} });
    ordersService.quote.mockRejectedValue(
      new BadRequestException(
        'Delivery address is outside branch delivery radius',
      ),
    );

    const result = await service.getCart({
      uid: 'user-1',
      tid: 'tenant-1',
      rid: 'restaurant-1',
      role: UserRoleEnum.CUSTOMER,
    });

    expect(result.data.items).toHaveLength(1);
    expect(result.data).not.toHaveProperty('quote');
  });

  it('uses exact item variation price in cart totals', async () => {
    const { service, cartRepository, profilesRepository } = makeService();
    cartRepository.findByCustomerId.mockResolvedValue({
      id: 'cart-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'user-1',
      orderType: 'DELIVERY',
      deliveryAddressId: null,
      couponCode: null,
      paymentMethod: null,
      orderTime: null,
      customerNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [
        {
          id: 'item-1',
          menuItemId: 'menu-1',
          variationId: 'var-1',
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
        pricingMode: 'SINGLE',
        basePrice: new Prisma.Decimal(500),
        deliveryPriceAdjustment: 0,
        takeawayPriceAdjustment: 0,
        depositAmount: 0,
        category: {
          id: 'cat-1',
          name: 'Burgers',
          imageUrl: null,
          variations: [
            {
              id: 'var-1',
              name: 'Large',
              price: new Prisma.Decimal(110),
            },
          ],
        },
        variations: [
          {
            id: 'var-1',
            name: 'Large',
            description: null,
            price: new Prisma.Decimal(110),
          },
        ],
        modifierLinks: [],
        branchOverrides: [],
      },
    ]);
    profilesRepository.findByUserId.mockResolvedValue({ metadata: {} });

    const result = await service.getCart({
      uid: 'user-1',
      tid: 'tenant-1',
      rid: 'restaurant-1',
      role: UserRoleEnum.CUSTOMER,
    });

    const firstItem = result.data.items[0] as {
      menuItem: {
        unitPrice: number | null;
        selectedVariation: {
          price: number;
          pickupPrice: number | null;
        } | null;
        category: { id: string; name: string; imageUrl: string | null };
      } | null;
    };
    expect(firstItem.menuItem?.unitPrice).toBe(110);
    expect(firstItem.menuItem?.selectedVariation?.price).toBe(110);
    expect(firstItem.menuItem?.selectedVariation?.pickupPrice).toBeNull();
    expect(firstItem.menuItem?.category).toEqual({
      id: 'cat-1',
      name: 'Burgers',
      imageUrl: null,
    });
  });

  it('exposes selected variation pickup price in cart response', async () => {
    const { service, cartRepository, profilesRepository } = makeService();
    cartRepository.findByCustomerId.mockResolvedValue({
      id: 'cart-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'user-1',
      orderType: 'TAKEAWAY',
      deliveryAddressId: null,
      couponCode: null,
      paymentMethod: null,
      orderTime: null,
      customerNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [
        {
          id: 'item-1',
          menuItemId: 'menu-1',
          variationId: 'var-1',
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
        pricingMode: 'MULTIPLE',
        basePrice: new Prisma.Decimal(500),
        deliveryPriceAdjustment: new Prisma.Decimal(0),
        takeawayPriceAdjustment: new Prisma.Decimal(20),
        depositAmount: 0,
        category: {
          id: 'cat-1',
          name: 'Burgers',
          imageUrl: null,
          variations: [],
        },
        variations: [
          {
            id: 'var-1',
            name: 'Large',
            description: null,
            price: new Prisma.Decimal(550),
            itemPriceOverrides: [
              {
                menuItemId: 'menu-1',
                price: new Prisma.Decimal(550),
                pickupPrice: new Prisma.Decimal(600),
                displayText: 'Large pickup',
              },
            ],
          },
        ],
        modifierLinks: [],
        branchOverrides: [],
      },
    ]);
    profilesRepository.findByUserId.mockResolvedValue({ metadata: {} });

    const result = await service.getCart({
      uid: 'user-1',
      tid: 'tenant-1',
      rid: 'restaurant-1',
      role: UserRoleEnum.CUSTOMER,
    });

    const firstItem = result.data.items[0] as {
      unitPrice: number | null;
      menuItem: {
        selectedVariation: {
          price: number;
          pickupPrice: number | null;
          displayText: string | null;
        } | null;
      } | null;
    };

    expect(firstItem.unitPrice).toBe(600);
    expect(firstItem.menuItem?.selectedVariation).toEqual({
      price: 600,
      pickupPrice: 600,
      displayText: 'Large pickup',
      id: 'var-1',
      name: 'Large',
      description: 'Large pickup',
    });
  });

  it('uses pickup variation prices and highest section price for split pizza cart totals', async () => {
    const { service, cartRepository, profilesRepository } = makeService();
    cartRepository.findByCustomerId.mockResolvedValue({
      id: 'cart-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'user-1',
      orderType: 'TAKEAWAY',
      deliveryAddressId: null,
      couponCode: null,
      paymentMethod: null,
      orderTime: null,
      customerNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [
        {
          id: 'item-1',
          menuItemId: 'menu-parent',
          variationId: 'var-large',
          quantity: 1,
          note: null,
          modifiers: {
            modifiers: [],
            sections: [
              { slot: 'LEFT', menuItemId: 'flavor-1' },
              { slot: 'RIGHT', menuItemId: 'flavor-2' },
            ],
          },
        },
      ],
    });
    cartRepository.findMenuItemsForResponse.mockResolvedValue([
      {
        id: 'menu-parent',
        name: 'Half And Half Pizza',
        slug: 'half-and-half-pizza',
        description: null,
        imageUrl: null,
        pricingMode: 'SINGLE',
        basePrice: new Prisma.Decimal(900),
        deliveryPriceAdjustment: new Prisma.Decimal(0),
        takeawayPriceAdjustment: new Prisma.Decimal(0),
        depositAmount: new Prisma.Decimal(0),
        dietaryFlags: ['__SPLIT_PIZZA_ENABLED__'],
        category: {
          id: 'cat-pizza',
          name: 'Pizza',
          imageUrl: null,
          items: [
            { id: 'flavor-1', name: 'Fajita Pizza', slug: 'fajita-pizza' },
            {
              id: 'flavor-2',
              name: 'Pepperoni Pizza',
              slug: 'pepperoni-pizza',
            },
          ],
        },
        variations: [
          {
            id: 'var-large',
            name: 'Large',
            description: null,
            price: new Prisma.Decimal(900),
            itemPriceOverrides: [],
          },
        ],
        modifierLinks: [],
        branchOverrides: [],
      },
    ]);
    cartRepository.findSplitSectionItems.mockResolvedValue([
      {
        id: 'flavor-1',
        name: 'Fajita Pizza',
        basePrice: new Prisma.Decimal(1000),
        pricingMode: 'MULTIPLE',
        deliveryPriceAdjustment: new Prisma.Decimal(0),
        takeawayPriceAdjustment: new Prisma.Decimal(200),
        variations: [
          {
            id: 'var-large',
            name: 'Large',
            price: new Prisma.Decimal(1200),
            itemPriceOverrides: [
              {
                menuItemId: 'flavor-1',
                price: new Prisma.Decimal(1200),
                pickupPrice: new Prisma.Decimal(1300),
                displayText: 'Fajita large pickup',
              },
            ],
          },
        ],
        category: { variations: [] },
        branchOverrides: [],
      },
      {
        id: 'flavor-2',
        name: 'Pepperoni Pizza',
        basePrice: new Prisma.Decimal(1100),
        pricingMode: 'MULTIPLE',
        deliveryPriceAdjustment: new Prisma.Decimal(0),
        takeawayPriceAdjustment: new Prisma.Decimal(200),
        variations: [
          {
            id: 'var-large',
            name: 'Large',
            price: new Prisma.Decimal(1400),
            itemPriceOverrides: [
              {
                menuItemId: 'flavor-2',
                price: new Prisma.Decimal(1400),
                pickupPrice: new Prisma.Decimal(1500),
              },
            ],
          },
        ],
        category: { variations: [] },
        branchOverrides: [],
      },
    ]);
    profilesRepository.findByUserId.mockResolvedValue({ metadata: {} });

    const result = await service.getCart({
      uid: 'user-1',
      tid: 'tenant-1',
      rid: 'restaurant-1',
      role: UserRoleEnum.CUSTOMER,
    });

    const firstItem = result.data.items[0] as {
      unitPrice: number | null;
      lineTotal: number | null;
      selectedSections: Array<{
        menuItemId: string;
        unitPrice: number;
        selectedVariation: {
          id: string;
          name: string;
          price: number;
          pickupPrice: number | null;
        } | null;
      }>;
    };
    expect(firstItem.selectedSections).toEqual([
      {
        slot: 'LEFT',
        menuItemId: 'flavor-1',
        menuItemName: 'Fajita Pizza',
        unitPrice: 1300,
        selectedVariation: {
          id: 'var-large',
          name: 'Large',
          description: 'Fajita large pickup',
          displayText: 'Fajita large pickup',
          price: 1300,
          pickupPrice: 1300,
        },
      },
      {
        slot: 'RIGHT',
        menuItemId: 'flavor-2',
        menuItemName: 'Pepperoni Pizza',
        unitPrice: 1500,
        selectedVariation: {
          id: 'var-large',
          name: 'Large',
          description: null,
          displayText: null,
          price: 1500,
          pickupPrice: 1500,
        },
      },
    ]);
    expect(firstItem.unitPrice).toBe(1500);
    expect(firstItem.lineTotal).toBe(1500);
  });

  it('prices selected category modifiers with variation overrides in cart response', async () => {
    const { service, cartRepository, profilesRepository } = makeService();
    cartRepository.findByCustomerId.mockResolvedValue({
      id: 'cart-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'user-1',
      orderType: 'DELIVERY',
      deliveryAddressId: null,
      couponCode: null,
      paymentMethod: null,
      orderTime: null,
      customerNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [
        {
          id: 'cart-item-1',
          menuItemId: 'menu-1',
          variationId: 'variation-1',
          quantity: 1,
          note: null,
          modifiers: [{ modifierId: 'modifier-1', quantity: 1 }],
        },
      ],
    });
    cartRepository.findMenuItemsForResponse.mockResolvedValue([
      {
        id: 'menu-1',
        name: 'Salad',
        slug: 'salad',
        description: null,
        imageUrl: null,
        pricingMode: 'SINGLE',
        basePrice: new Prisma.Decimal(100),
        deliveryPriceAdjustment: new Prisma.Decimal(0),
        takeawayPriceAdjustment: new Prisma.Decimal(0),
        depositAmount: new Prisma.Decimal(0),
        category: {
          id: 'category-1',
          name: 'Salads',
          imageUrl: null,
          items: [],
          variations: [
            {
              id: 'variation-1',
              name: 'Medium',
              description: null,
              price: new Prisma.Decimal(100),
              itemPriceOverrides: [],
              modifierPriceOverrides: [],
            },
          ],
          modifierLinks: [
            {
              sortOrder: 0,
              modifierGroup: {
                id: 'group-1',
                name: 'Toppings',
                minSelect: 0,
                maxSelect: 3,
                isRequired: false,
                modifierLinks: [
                  {
                    sortOrder: 0,
                    modifier: {
                      id: 'modifier-1',
                      name: 'Avocado',
                      priceDelta: new Prisma.Decimal(3),
                      itemPriceOverrides: [],
                      variationPriceOverrides: [
                        {
                          menuItemId: null,
                          variationId: 'variation-1',
                          priceDelta: new Prisma.Decimal(21),
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
        variations: [
          {
            id: 'variation-1',
            name: 'Medium',
            description: null,
            price: new Prisma.Decimal(100),
            itemPriceOverrides: [],
          },
        ],
        modifierLinks: [],
        branchOverrides: [],
      },
    ]);
    profilesRepository.findByUserId.mockResolvedValue({ metadata: {} });

    const result = await service.getCart({
      uid: 'user-1',
      tid: 'tenant-1',
      rid: 'restaurant-1',
      role: UserRoleEnum.CUSTOMER,
    });

    const firstItem = result.data.items[0] as {
      selectedModifiers: Array<{ unitPrice: number; total: number }>;
      modifiersTotal: number;
      unitPriceWithModifiers: number;
      lineTotal: number;
      menuItem: Record<string, unknown> | null;
    };
    expect(firstItem.selectedModifiers[0].unitPrice).toBe(21);
    expect(firstItem.modifiersTotal).toBe(21);
    expect(firstItem.unitPriceWithModifiers).toBe(121);
    expect(firstItem.lineTotal).toBe(121);
    expect('modifierGroups' in (firstItem.menuItem ?? {})).toBe(false);
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
              rid?: string | null;
              role: UserRoleEnum;
            },
            requestedCustomerId?: string,
            requestedRestaurantId?: string,
          ) => Promise<string>;
        }
      ).resolveCartCustomerId({
        uid: 'admin-1',
        tid: 'tenant-1',
        rid: null,
        role: UserRoleEnum.BUSINESS_ADMIN,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows business-admin cart access with customerId only', async () => {
    const { service, cartRepository } = makeService();
    cartRepository.findActiveCustomer.mockResolvedValue({
      id: 'customer-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
    });

    const customerId = await (
      service as unknown as {
        resolveCartCustomerId: (
          user: {
            uid: string;
            tid?: string;
            rid?: string | null;
            role: UserRoleEnum;
          },
          requestedCustomerId?: string,
          requestedRestaurantId?: string,
        ) => Promise<string>;
      }
    ).resolveCartCustomerId(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        rid: null,
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      'customer-1',
    );

    expect(customerId).toBe('customer-1');
    expect(cartRepository.findActiveCustomer).toHaveBeenCalledWith(
      'customer-1',
      'tenant-1',
    );
  });

  it('blocks branch-admin cart access for customers outside the branch restaurant scope', async () => {
    const { service, cartRepository } = makeService();
    cartRepository.findActiveCustomer.mockResolvedValue({
      id: 'customer-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-2',
    });

    await expect(
      (
        service as unknown as {
          resolveCartCustomerId: (
            user: {
              uid: string;
              tid?: string;
              rid?: string | null;
              bid?: string | null;
              role: UserRoleEnum;
            },
            requestedCustomerId?: string,
            requestedRestaurantId?: string,
          ) => Promise<string>;
        }
      ).resolveCartCustomerId(
        {
          uid: 'branch-admin-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          bid: 'branch-1',
          role: UserRoleEnum.BRANCH_ADMIN,
        },
        'customer-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates cart on first add-item when cart does not exist', async () => {
    const { service, cartRepository, profilesRepository } = makeService();
    cartRepository.findByCustomerId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'cart-1',
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
        customerId: 'user-1',
        orderType: 'DELIVERY',
        deliveryAddressId: null,
        couponCode: null,
        paymentMethod: null,
        orderTime: null,
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
      orderType: 'DELIVERY',
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
    profilesRepository.findByUserId.mockResolvedValue({ metadata: {} });
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

  it('uses requested takeaway order type before delivery coverage on first add-item', async () => {
    const { service, cartRepository, ordersService } = makeService();
    cartRepository.findByCustomerId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'cart-1',
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
        customerId: 'user-1',
        orderType: 'TAKEAWAY',
        deliveryAddressId: null,
        couponCode: null,
        paymentMethod: null,
        orderTime: null,
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
      orderType: 'TAKEAWAY',
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
        quantity: 1,
        orderType: OrderTypeEnum.TAKEAWAY,
      },
    );

    expect(cartRepository.create).toHaveBeenCalledWith({
      tenant: { connect: { id: 'tenant-1' } },
      restaurant: { connect: { id: 'restaurant-1' } },
      branch: { connect: { id: 'branch-1' } },
      customer: { connect: { id: 'user-1' } },
      orderType: 'TAKEAWAY',
    });
    expect(ordersService.assertDeliveryAddressCoverage).not.toHaveBeenCalled();
    expect(result.message).toBe('Item added to cart successfully');
  });

  it('checks delivery coverage before adding an item', async () => {
    const { service, cartRepository, profilesRepository, ordersService } =
      makeService();
    cartRepository.findByCustomerId.mockResolvedValue({
      id: 'cart-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'user-1',
      orderType: 'DELIVERY',
      deliveryAddressId: 'address-1',
      couponCode: null,
      paymentMethod: null,
      orderTime: null,
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
    profilesRepository.findByUserId.mockResolvedValue({ metadata: {} });
    ordersService.assertDeliveryAddressCoverage.mockRejectedValue(
      new BadRequestException(
        'Delivery address is outside branch delivery radius',
      ),
    );

    await expect(
      service.addItem(
        {
          uid: 'user-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          role: UserRoleEnum.CUSTOMER,
        },
        {
          branchId: 'branch-1',
          menuItemId: 'menu-1',
          quantity: 1,
        },
      ),
    ).rejects.toThrow('Delivery address is outside branch delivery radius');
    expect(ordersService.assertDeliveryAddressCoverage).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'user-1' }),
      {
        branchId: 'branch-1',
        customerId: 'user-1',
        deliveryAddressId: 'address-1',
      },
    );
    expect(cartRepository.createItem).not.toHaveBeenCalled();
  });

  it('blocks add-item while branch is temporarily closed', async () => {
    const { service, cartRepository } = makeService();
    cartRepository.findByCustomerId.mockResolvedValue(null);
    cartRepository.findActiveBranch.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      settings: {
        temporaryClosure: {
          isClosed: true,
          reason: 'Kitchen maintenance',
          message: 'We are closed for maintenance',
        },
      },
    });

    await expect(
      service.addItem(
        {
          uid: 'user-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          role: UserRoleEnum.CUSTOMER,
        },
        {
          branchId: 'branch-1',
          menuItemId: 'menu-1',
          quantity: 1,
        },
      ),
    ).rejects.toMatchObject({
      response: {
        error: 'BRANCH_TEMPORARILY_CLOSED',
      },
    });
  });

  it('increments quantity for identical cart item selections', async () => {
    const { service, cartRepository, profilesRepository } = makeService();
    const existingCart = {
      id: 'cart-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'user-1',
      orderType: 'DELIVERY',
      deliveryAddressId: null,
      couponCode: null,
      paymentMethod: null,
      orderTime: null,
      customerNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [
        {
          id: 'cart-item-1',
          menuItemId: 'menu-1',
          variationId: 'variation-1',
          quantity: 2,
          note: null,
          modifiers: [{ modifierId: 'modifier-1', quantity: 1 }],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    };
    cartRepository.findByCustomerId
      .mockResolvedValueOnce(existingCart)
      .mockResolvedValueOnce({
        ...existingCart,
        items: [{ ...existingCart.items[0], quantity: 5 }],
      });
    cartRepository.findMenuItemForCart.mockResolvedValue({
      id: 'menu-1',
      name: 'Burger',
      category: { id: 'category-1', items: [], modifierLinks: [] },
      variations: [{ id: 'variation-1', isActive: true }],
      modifierLinks: [],
      modifierPriceOverrides: [{ modifier: { id: 'modifier-1' } }],
      branchOverrides: [],
    });
    profilesRepository.findByUserId.mockResolvedValue({ metadata: {} });
    jest
      .spyOn(service as never, 'buildCartResponse' as never)
      .mockResolvedValue({ id: 'cart-1', items: [] } as never);

    await service.addItem(
      {
        uid: 'user-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      {
        branchId: 'branch-1',
        menuItemId: 'menu-1',
        variationId: 'variation-1',
        quantity: 3,
        modifiers: [{ modifierId: 'modifier-1', quantity: 1 }],
      },
    );

    expect(cartRepository.updateItem).toHaveBeenCalledWith('cart-item-1', {
      quantity: 5,
    });
    expect(cartRepository.createItem).not.toHaveBeenCalled();
  });

  it('allows modifiers inherited from the item category', async () => {
    const { service, cartRepository, profilesRepository } = makeService();
    const existingCart = {
      id: 'cart-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'user-1',
      orderType: 'DELIVERY',
      deliveryAddressId: null,
      couponCode: null,
      paymentMethod: null,
      orderTime: null,
      customerNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [],
    };
    cartRepository.findByCustomerId
      .mockResolvedValueOnce(existingCart)
      .mockResolvedValueOnce(existingCart);
    cartRepository.findMenuItemForCart.mockResolvedValue({
      id: 'menu-1',
      name: 'Salad',
      category: {
        id: 'category-1',
        items: [],
        modifierLinks: [
          {
            modifierGroup: {
              modifierLinks: [{ modifier: { id: 'modifier-1' } }],
            },
          },
        ],
      },
      variations: [],
      modifierLinks: [],
      branchOverrides: [],
    });
    cartRepository.createItem.mockResolvedValue({ id: 'item-1' });
    profilesRepository.findByUserId.mockResolvedValue({ metadata: {} });
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
        quantity: 1,
        modifiers: [{ modifierId: 'modifier-1', quantity: 1 }],
      },
    );

    expect(result.message).toBe('Item added to cart successfully');
    expect(cartRepository.createItem).toHaveBeenCalledWith(
      expect.objectContaining({
        modifiers: [{ modifierId: 'modifier-1', quantity: 1 }],
      }),
    );
  });

  it('rejects cart modifier selections above item maxSelect', async () => {
    const { service, cartRepository } = makeService();
    const existingCart = {
      id: 'cart-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'user-1',
      orderType: 'DELIVERY',
      deliveryAddressId: null,
      couponCode: null,
      paymentMethod: null,
      orderTime: null,
      customerNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [],
    };
    cartRepository.findByCustomerId.mockResolvedValue(existingCart);
    cartRepository.findMenuItemForCart.mockResolvedValue({
      id: 'menu-1',
      name: 'Burger',
      isRequired: false,
      minSelect: 0,
      maxSelect: 1,
      category: { id: 'category-1', items: [], modifierLinks: [] },
      variations: [],
      modifierLinks: [
        {
          modifierGroup: {
            id: 'group-1',
            name: 'Sauces',
            minSelect: 0,
            maxSelect: 99,
            isRequired: false,
            modifierLinks: [
              { modifier: { id: 'modifier-1' } },
              { modifier: { id: 'modifier-2' } },
            ],
          },
        },
      ],
      branchOverrides: [],
    });

    await expect(
      service.addItem(
        {
          uid: 'user-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          role: UserRoleEnum.CUSTOMER,
        },
        {
          branchId: 'branch-1',
          menuItemId: 'menu-1',
          quantity: 1,
          modifiers: [
            { modifierId: 'modifier-1', quantity: 1 },
            { modifierId: 'modifier-2', quantity: 1 },
          ],
        },
      ),
    ).rejects.toThrow('Burger allows at most 1 modifier selection(s)');
  });

  it('rejects cart item quantity above item maxQuantity', async () => {
    const { service, cartRepository } = makeService();
    cartRepository.findByCustomerId.mockResolvedValue({
      id: 'cart-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'user-1',
      orderType: 'DELIVERY',
      deliveryAddressId: null,
      couponCode: null,
      paymentMethod: null,
      orderTime: null,
      customerNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [],
    });
    cartRepository.findMenuItemForCart.mockResolvedValue({
      id: 'menu-1',
      name: 'Burger',
      isRequired: false,
      minSelect: 0,
      maxSelect: null,
      minQuantity: 1,
      maxQuantity: 2,
      category: { id: 'category-1', items: [], modifierLinks: [] },
      variations: [],
      modifierLinks: [],
      branchOverrides: [],
    });

    await expect(
      service.addItem(
        {
          uid: 'user-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          role: UserRoleEnum.CUSTOMER,
        },
        {
          branchId: 'branch-1',
          menuItemId: 'menu-1',
          quantity: 3,
        },
      ),
    ).rejects.toThrow('Burger allows at most 2 item(s)');
  });

  it('rejects cart item quantity below item minQuantity', async () => {
    const { service, cartRepository } = makeService();
    cartRepository.findByCustomerId.mockResolvedValue({
      id: 'cart-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'user-1',
      orderType: 'DELIVERY',
      deliveryAddressId: null,
      couponCode: null,
      paymentMethod: null,
      orderTime: null,
      customerNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [],
    });
    cartRepository.findMenuItemForCart.mockResolvedValue({
      id: 'menu-1',
      name: 'Burger',
      isRequired: false,
      minSelect: 0,
      maxSelect: null,
      minQuantity: 2,
      maxQuantity: 5,
      category: { id: 'category-1', items: [], modifierLinks: [] },
      variations: [],
      modifierLinks: [],
      branchOverrides: [],
    });

    await expect(
      service.addItem(
        {
          uid: 'user-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          role: UserRoleEnum.CUSTOMER,
        },
        {
          branchId: 'branch-1',
          menuItemId: 'menu-1',
          quantity: 1,
        },
      ),
    ).rejects.toThrow('Burger requires at least 2 item(s)');
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

  it('allows adding another item to an existing cart from the same branch', async () => {
    const { service, cartRepository, profilesRepository } = makeService();
    const existingCart = {
      id: 'cart-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'user-1',
      orderType: 'DELIVERY',
      deliveryAddressId: null,
      couponCode: null,
      paymentMethod: null,
      orderTime: null,
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
    };
    cartRepository.findByCustomerId
      .mockResolvedValueOnce(existingCart)
      .mockResolvedValueOnce({
        ...existingCart,
        items: [
          ...existingCart.items,
          {
            id: 'item-2',
            menuItemId: 'menu-2',
            variationId: null,
            quantity: 1,
            note: null,
            modifiers: null,
          },
        ],
      });
    cartRepository.findMenuItemForCart.mockResolvedValue({
      id: 'menu-2',
      name: 'Fries',
      variations: [],
      modifierLinks: [],
      branchOverrides: [],
    });
    cartRepository.createItem.mockResolvedValue({ id: 'item-2' });
    profilesRepository.findByUserId.mockResolvedValue({ metadata: {} });
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
        menuItemId: 'menu-2',
        quantity: 1,
      },
    );

    expect(cartRepository.create).not.toHaveBeenCalled();
    expect(cartRepository.createItem).toHaveBeenCalledWith({
      cart: { connect: { id: 'cart-1' } },
      menuItemId: 'menu-2',
      variationId: undefined,
      quantity: 1,
      note: undefined,
      modifiers: undefined,
    });
    expect(result.message).toBe('Item added to cart successfully');
  });

  it('stores split pizza sections in cart items', async () => {
    const { service, cartRepository, profilesRepository } = makeService();
    const existingCart = {
      id: 'cart-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'user-1',
      orderType: 'DELIVERY',
      deliveryAddressId: null,
      couponCode: null,
      paymentMethod: null,
      orderTime: null,
      customerNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [],
    };
    cartRepository.findByCustomerId
      .mockResolvedValueOnce(existingCart)
      .mockResolvedValueOnce(existingCart);
    cartRepository.findMenuItemForCart.mockResolvedValue({
      id: 'menu-parent',
      name: 'Half And Half Pizza',
      restaurantId: 'restaurant-1',
      dietaryFlags: ['__SPLIT_PIZZA_ENABLED__'],
      category: { id: 'cat-pizza', items: [] },
      variations: [],
      modifierLinks: [],
      branchOverrides: [],
    });
    cartRepository.findSplitSectionItems.mockResolvedValue([
      {
        id: 'flavor-1',
        name: 'Fajita Pizza',
        modifierLinks: [],
        branchOverrides: [],
      },
      {
        id: 'flavor-2',
        name: 'Pepperoni Pizza',
        modifierLinks: [],
        branchOverrides: [],
      },
    ]);
    cartRepository.createItem.mockResolvedValue({ id: 'item-2' });
    profilesRepository.findByUserId.mockResolvedValue({ metadata: {} });
    jest
      .spyOn(service as never, 'buildCartResponse' as never)
      .mockResolvedValue({ id: 'cart-1', items: [] } as never);

    await service.addItem(
      {
        uid: 'user-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      {
        branchId: 'branch-1',
        menuItemId: 'menu-parent',
        quantity: 1,
        sections: [
          { slot: 'LEFT', menuItemId: 'flavor-1' },
          { slot: 'RIGHT', menuItemId: 'flavor-2' },
        ],
      },
    );

    expect(cartRepository.createItem).toHaveBeenCalledWith(
      expect.objectContaining({
        modifiers: {
          modifiers: [],
          sections: [
            { slot: 'LEFT', menuItemId: 'flavor-1' },
            { slot: 'RIGHT', menuItemId: 'flavor-2' },
          ],
        },
      }),
    );
  });

  it('retargets an empty cart when customer switches branches', async () => {
    const { service, cartRepository, profilesRepository } = makeService();
    const existingCart = {
      id: 'cart-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'user-1',
      orderType: 'DELIVERY',
      deliveryAddressId: null,
      couponCode: null,
      paymentMethod: null,
      orderTime: null,
      customerNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [],
    };
    cartRepository.findByCustomerId
      .mockResolvedValueOnce(existingCart)
      .mockResolvedValueOnce({
        ...existingCart,
        branchId: 'branch-2',
      });
    cartRepository.findActiveBranch.mockResolvedValue({
      id: 'branch-2',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
    });
    cartRepository.update.mockResolvedValue({
      ...existingCart,
      branchId: 'branch-2',
    });
    cartRepository.findMenuItemForCart.mockResolvedValue({
      id: 'menu-2',
      name: 'Fries',
      variations: [],
      modifierLinks: [],
      branchOverrides: [],
    });
    cartRepository.createItem.mockResolvedValue({ id: 'item-2' });
    profilesRepository.findByUserId.mockResolvedValue({ metadata: {} });
    jest
      .spyOn(service as never, 'buildCartResponse' as never)
      .mockResolvedValue({ id: 'cart-1', branchId: 'branch-2' } as never);

    const result = await service.addItem(
      {
        uid: 'user-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      {
        branchId: 'branch-2',
        menuItemId: 'menu-2',
        quantity: 1,
      },
    );

    expect(cartRepository.update).toHaveBeenCalledWith('cart-1', {
      tenant: { connect: { id: 'tenant-1' } },
      restaurant: { connect: { id: 'restaurant-1' } },
      branch: { connect: { id: 'branch-2' } },
    });
    expect(result.message).toBe('Item added to cart successfully');
  });

  it('retargets cart when only stale hidden items remain from the previous branch', async () => {
    const { service, cartRepository, profilesRepository } = makeService();
    const existingCart = {
      id: 'cart-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'user-1',
      orderType: 'DELIVERY',
      deliveryAddressId: null,
      couponCode: null,
      paymentMethod: null,
      orderTime: null,
      customerNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [
        {
          id: 'item-stale',
          menuItemId: 'menu-missing',
          variationId: null,
          quantity: 1,
          note: null,
          modifiers: null,
        },
      ],
    };
    cartRepository.findByCustomerId
      .mockResolvedValueOnce(existingCart)
      .mockResolvedValueOnce({
        ...existingCart,
        branchId: 'branch-2',
        items: [{ id: 'item-2', menuItemId: 'menu-2', quantity: 1 }],
      });
    cartRepository.findMenuItemsForResponse.mockResolvedValueOnce([]);
    cartRepository.findActiveBranch.mockResolvedValue({
      id: 'branch-2',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
    });
    cartRepository.update.mockResolvedValue({
      ...existingCart,
      branchId: 'branch-2',
      items: [],
    });
    cartRepository.findMenuItemForCart.mockResolvedValue({
      id: 'menu-2',
      name: 'Fries',
      variations: [],
      modifierLinks: [],
      branchOverrides: [],
    });
    cartRepository.createItem.mockResolvedValue({ id: 'item-2' });
    profilesRepository.findByUserId.mockResolvedValue({ metadata: {} });
    jest
      .spyOn(service as never, 'buildCartResponse' as never)
      .mockResolvedValue({ id: 'cart-1', branchId: 'branch-2' } as never);

    const result = await service.addItem(
      {
        uid: 'user-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      {
        branchId: 'branch-2',
        menuItemId: 'menu-2',
        quantity: 1,
      },
    );

    expect(cartRepository.update).toHaveBeenCalledWith('cart-1', {
      tenant: { connect: { id: 'tenant-1' } },
      restaurant: { connect: { id: 'restaurant-1' } },
      branch: { connect: { id: 'branch-2' } },
      items: { deleteMany: {} },
    });
    expect(result.message).toBe('Item added to cart successfully');
  });

  it('updates cart order type without cart id in route', async () => {
    const { service, cartRepository, profilesRepository } = makeService();
    const cart = {
      id: 'cart-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      orderType: 'DELIVERY',
      deliveryAddressId: 'address-1',
      couponCode: null,
      paymentMethod: null,
      orderTime: null,
      customerNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [],
    };
    cartRepository.findByCustomerId
      .mockResolvedValueOnce(cart)
      .mockResolvedValueOnce({
        ...cart,
        orderType: 'TAKEAWAY',
        deliveryAddressId: null,
      });
    cartRepository.findMenuItemsForResponse.mockResolvedValue([]);
    cartRepository.update.mockResolvedValue({
      ...cart,
      orderType: 'TAKEAWAY',
      deliveryAddressId: null,
    });
    profilesRepository.findByUserId.mockResolvedValue({ metadata: {} });

    const result = await service.updateCart(
      {
        uid: 'customer-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      {
        orderType: OrderTypeEnum.TAKEAWAY,
      },
    );

    expect(cartRepository.update).toHaveBeenCalledWith(
      'cart-1',
      expect.objectContaining({
        orderType: OrderTypeEnum.TAKEAWAY,
        deliveryAddress: { disconnect: true },
      }),
    );
    expect(result.message).toBe('Cart updated successfully');
  });

  it('updates cart checkout draft fields in patch route', async () => {
    const { service, cartRepository, profilesRepository } = makeService();
    const cart = {
      id: 'cart-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      orderType: 'DELIVERY',
      deliveryAddressId: 'address-1',
      couponCode: null,
      paymentMethod: null,
      orderTime: null,
      customerNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [],
    };
    cartRepository.findByCustomerId
      .mockResolvedValueOnce(cart)
      .mockResolvedValueOnce({
        ...cart,
        paymentMethod: PaymentMethodEnum.COD,
        orderTime: new Date('2026-03-24T19:30:00.000Z'),
        customerNote: 'Ring the bell',
      });
    cartRepository.findMenuItemsForResponse.mockResolvedValue([]);
    cartRepository.update.mockResolvedValue({
      ...cart,
      paymentMethod: PaymentMethodEnum.COD,
      orderTime: new Date('2026-03-24T19:30:00.000Z'),
      customerNote: 'Ring the bell',
    });
    profilesRepository.findByUserId.mockResolvedValue({ metadata: {} });

    const result = await service.updateCart(
      {
        uid: 'customer-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      {
        paymentMethod: PaymentMethodEnum.COD,
        orderTime: '2026-03-24T19:30:00.000Z',
        customerNote: 'Ring the bell',
      },
    );

    expect(cartRepository.update).toHaveBeenCalledWith(
      'cart-1',
      expect.objectContaining({
        paymentMethod: PaymentMethodEnum.COD,
        orderTime: new Date('2026-03-24T19:30:00.000Z'),
        customerNote: 'Ring the bell',
      }),
    );
    expect(result.message).toBe('Cart updated successfully');
  });

  it('updates cart address and returns refreshed quote', async () => {
    const { service, cartRepository, profilesRepository, ordersService } =
      makeService();
    const cart = {
      id: 'cart-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      orderType: 'DELIVERY',
      deliveryAddressId: null,
      couponCode: 'SAVE10',
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
    };
    cartRepository.findByCustomerId
      .mockResolvedValueOnce(cart)
      .mockResolvedValueOnce({
        ...cart,
        deliveryAddressId: 'address-1',
      });
    cartRepository.findOwnedAddress.mockResolvedValue({ id: 'address-1' });
    profilesRepository.findByUserId.mockResolvedValue({ metadata: {} });
    ordersService.quote.mockResolvedValue({
      data: { totalAmount: 900, deliveryFee: 100 },
      message: 'Order quote generated successfully',
    });

    const result = await service.updateAddress(
      {
        uid: 'customer-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      { deliveryAddressId: 'address-1' },
    );

    expect(cartRepository.update).toHaveBeenCalledWith('cart-1', {
      deliveryAddress: { connect: { id: 'address-1' } },
    });
    expect(ordersService.quote).toHaveBeenCalled();
    expect(result.message).toBe('Cart address updated successfully');
  });

  it('throws when updating order type before cart exists', async () => {
    const { service, cartRepository } = makeService();
    cartRepository.findByCustomerId.mockResolvedValue(null);

    await expect(
      service.updateCart(
        {
          uid: 'customer-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          role: UserRoleEnum.CUSTOMER,
        },
        { orderType: OrderTypeEnum.DELIVERY },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('validates coupon before saving it to cart without requiring delivery coordinates', async () => {
    const { service, cartRepository, profilesRepository, ordersService } =
      makeService();
    const cart = {
      id: 'cart-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      orderType: 'DELIVERY',
      deliveryAddressId: null,
      couponCode: null,
      paymentMethod: null,
      orderTime: null,
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
    };
    cartRepository.findByCustomerId
      .mockResolvedValueOnce(cart)
      .mockResolvedValueOnce({
        ...cart,
        couponCode: 'SAVE10',
      });
    cartRepository.update.mockResolvedValue({
      ...cart,
      couponCode: 'SAVE10',
    });
    cartRepository.findMenuItemsForResponse.mockResolvedValue([]);
    profilesRepository.findByUserId.mockResolvedValue({
      metadata: { defaultAddressId: 'address-without-coordinates' },
    });
    ordersService.quoteForCouponValidation.mockResolvedValue({
      data: {
        couponCode: 'SAVE10',
        discountAmount: 100,
        totalAmount: 400,
      },
      message: 'Order quote generated successfully',
    });

    const result = await service.applyCoupon(
      {
        uid: 'customer-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      { couponCode: 'SAVE10' },
    );

    expect(ordersService.quoteForCouponValidation).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        couponCode: 'SAVE10',
        branchId: 'branch-1',
        deliveryAddressId: undefined,
      }),
    );
    expect(ordersService.quote).not.toHaveBeenCalled();
    expect(cartRepository.update).toHaveBeenCalledWith('cart-1', {
      couponCode: 'SAVE10',
    });
    expect(result.data.quote.discountAmount).toBe(100);
    expect(result.data.cart.couponCode).toBe('SAVE10');
    expect(result.message).toBe('Cart coupon updated successfully');
  });

  it('removes coupon through dedicated cart coupon action', async () => {
    const { service, cartRepository, profilesRepository } = makeService();
    const cart = {
      id: 'cart-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      orderType: 'DELIVERY',
      deliveryAddressId: null,
      couponCode: 'SAVE10',
      customerNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      items: [],
    };
    cartRepository.findByCustomerId
      .mockResolvedValueOnce(cart)
      .mockResolvedValueOnce({
        ...cart,
        couponCode: null,
      });
    cartRepository.update.mockResolvedValue({
      ...cart,
      couponCode: null,
    });
    cartRepository.findMenuItemsForResponse.mockResolvedValue([]);
    profilesRepository.findByUserId.mockResolvedValue({ metadata: {} });

    const result = await service.removeCoupon({
      uid: 'customer-1',
      tid: 'tenant-1',
      rid: 'restaurant-1',
      role: UserRoleEnum.CUSTOMER,
    });

    expect(cartRepository.update).toHaveBeenCalledWith('cart-1', {
      couponCode: null,
    });
    expect(result.message).toBe('Cart coupon removed successfully');
  });

  it('builds quote payload from cart state and default address', async () => {
    const { service, profilesRepository } = makeService();
    profilesRepository.findByUserId.mockResolvedValue({
      metadata: { defaultAddressId: 'address-1' },
    });

    const payload = await (
      service as unknown as {
        toQuotePayload: (
          cart: {
            branchId: string;
            customerId: string;
            restaurantMenuId?: string | null;
            orderType: 'DELIVERY';
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
          },
          orderTime?: string,
        ) => Promise<{
          branchId: string;
          customerId?: string;
          restaurantMenuId?: string;
          deliveryAddressId?: string;
          orderTime: string;
        }>;
      }
    ).toQuotePayload(
      {
        branchId: 'branch-1',
        customerId: 'customer-1',
        restaurantMenuId: 'menu-1',
        orderType: 'DELIVERY',
        deliveryAddressId: null,
        couponCode: 'SAVE10',
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
      undefined,
    );

    expect(payload.customerId).toBe('customer-1');
    expect(payload.branchId).toBe('branch-1');
    expect(payload.restaurantMenuId).toBe('menu-1');
    expect(payload.deliveryAddressId).toBe('address-1');
    expect(payload.orderTime).toEqual(expect.any(String));
  });

  it('uses saved cart order time when building quote payload', async () => {
    const { service, profilesRepository } = makeService();
    profilesRepository.findByUserId.mockResolvedValue({
      metadata: { defaultAddressId: 'address-1' },
    });

    const payload = await (
      service as unknown as {
        toQuotePayload: (cart: {
          branchId: string;
          customerId: string;
          restaurantMenuId: string | null;
          orderType: 'DELIVERY';
          deliveryAddressId: string | null;
          couponCode: string | null;
          orderTime: Date | null;
          items: {
            id: string;
            menuItemId: string;
            variationId: string | null;
            quantity: number;
            note: string | null;
            modifiers: null;
          }[];
        }) => Promise<{ orderTime: string }>;
      }
    ).toQuotePayload({
      branchId: 'branch-1',
      customerId: 'customer-1',
      restaurantMenuId: null,
      orderType: 'DELIVERY',
      deliveryAddressId: null,
      couponCode: 'SAVE10',
      orderTime: new Date('2026-03-24T19:30:00.000Z'),
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

    expect(payload.orderTime).toBe('2026-03-24T19:30:00.000Z');
  });

  it('falls back to saved cart checkout fields when omitted at checkout', async () => {
    const { service, cartRepository, ordersService, profilesRepository } =
      makeService();
    cartRepository.findByCustomerId.mockResolvedValue({
      id: 'cart-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      orderType: 'DELIVERY',
      deliveryAddressId: 'address-1',
      couponCode: 'SAVE10',
      paymentMethod: PaymentMethodEnum.COD,
      orderTime: new Date('2026-03-24T19:30:00.000Z'),
      customerNote: 'Saved note',
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
    profilesRepository.findByUserId.mockResolvedValue({ metadata: {} });
    ordersService.create.mockResolvedValue({
      data: { id: 'order-1' },
      message: 'Order created successfully',
    });

    await service.checkout(
      {
        uid: 'customer-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.CUSTOMER,
      },
      {},
    );

    expect(ordersService.create).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        paymentMethod: PaymentMethodEnum.COD,
        customerNote: 'Saved note',
        orderTime: '2026-03-24T19:30:00.000Z',
      }),
    );
  });

  it('creates order from cart using checkout note, order time, and payment method', async () => {
    const { service, cartRepository, ordersService, profilesRepository } =
      makeService();
    cartRepository.findByCustomerId.mockResolvedValue({
      id: 'cart-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      customerId: 'customer-1',
      orderType: 'DELIVERY',
      deliveryAddressId: 'address-1',
      couponCode: 'SAVE10',
      paymentMethod: PaymentMethodEnum.COD,
      orderTime: new Date('2026-03-24T19:30:00.000Z'),
      customerNote: 'Please call',
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
    profilesRepository.findByUserId.mockResolvedValue({ metadata: {} });
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
        paymentMethod: PaymentMethodEnum.COD,
        orderTime: '2026-03-24T19:30:00.000Z',
        customerNote: 'Please call before delivery',
      },
    );

    expect(ordersService.create).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        branchId: 'branch-1',
        items: [expect.objectContaining({ menuItemId: 'menu-1' })],
        deliveryAddressId: 'address-1',
        paymentMethod: PaymentMethodEnum.COD,
        customerNote: 'Please call before delivery',
        orderType: OrderTypeEnum.DELIVERY,
        orderTime: '2026-03-24T19:30:00.000Z',
      }),
    );
    expect(cartRepository.deleteByCustomerId).toHaveBeenCalledWith(
      'customer-1',
    );
    expect(result.message).toBe('Order created from cart successfully');
  });
});
