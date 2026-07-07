import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRoleEnum } from '../../common/enums';
import { PosService } from './pos.service';

describe('PosService', () => {
  const makeDraft = (overrides: Record<string, unknown> = {}) => ({
    id: 'draft-1',
    tenantId: 'tenant-1',
    restaurantId: 'restaurant-1',
    branchId: 'branch-1',
    createdByActorId: 'admin-1',
    createdByActorType: 'USER',
    customerId: null,
    orderType: 'TAKEAWAY',
    paymentMethod: 'COD',
    guestName: 'Walk-in',
    guestPhone: null,
    tableLabel: null,
    guestCount: null,
    couponCode: null,
    note: null,
    status: 'OPEN',
    checkedOutAt: null,
    finalOrderId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    restaurant: {
      id: 'restaurant-1',
      name: 'Restaurant',
      slug: 'restaurant',
      logoUrl: null,
      coverImage: null,
    },
    branch: { id: 'branch-1', name: 'Main', coverImage: null },
    customer: null,
    items: [],
    ...overrides,
  });

  const makeService = () => {
    const posRepository = {
      findActiveBranch: jest.fn(),
      findScopedCustomer: jest.fn(),
      createDraft: jest.fn(),
      listDrafts: jest.fn(),
      findDraftById: jest.fn(),
      updateDraft: jest.fn(),
      createDraftItem: jest.fn(),
      findDraftItem: jest.fn(),
      updateDraftItem: jest.fn(),
      deleteDraftItem: jest.fn(),
      findDraftItemDetails: jest
        .fn()
        .mockResolvedValue({ menuItems: [], variations: [] }),
      findCustomerProfileMetadata: jest.fn(),
      upsertCustomerProfileMetadata: jest.fn(),
    };

    const ordersService = {
      quote: jest.fn().mockResolvedValue({
        data: {
          subtotal: 0,
          taxAmount: 0,
          deliveryFee: 0,
          serviceChargeType: null,
          serviceChargeValue: null,
          serviceChargeAmount: 0,
          chargeBreakdown: [],
          tipAmount: 0,
          discountAmount: 0,
          walletAppliedAmount: 0,
          loyaltyDiscountAmount: 0,
          loyaltyPointsRedeemed: 0,
          totalAmount: 0,
          payableAmount: 0,
          appliedPromotion: null,
          items: [],
        },
      }),
      create: jest.fn(),
    };

    const usersService = {
      create: jest.fn().mockResolvedValue({ id: 'guest-customer-1' }),
    };

    const service = new PosService(
      posRepository as never,
      ordersService as never,
      usersService as never,
    );

    return { service, posRepository, ordersService, usersService };
  };

  it('creates takeaway POS draft for branch admin within branch scope', async () => {
    const { service, posRepository } = makeService();
    posRepository.findActiveBranch.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      name: 'Main',
      coverImage: null,
      settings: null,
    });
    posRepository.createDraft.mockResolvedValue(makeDraft());

    const result = await service.create(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
        role: UserRoleEnum.BRANCH_ADMIN,
      },
      {
        branchId: 'branch-1',
        orderType: 'TAKEAWAY' as never,
        paymentMethod: 'COD' as never,
        guestName: 'Walk-in',
      },
    );

    expect(posRepository.createDraft).toHaveBeenCalled();
    expect(result.message).toBe('POS draft created successfully');
    expect(result.data.orderType).toBe('TAKEAWAY');
  });

  it('blocks branch-scoped actors from creating drafts in another branch', async () => {
    const { service, posRepository } = makeService();
    posRepository.findActiveBranch.mockResolvedValue({
      id: 'branch-2',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      settings: null,
    });

    await expect(
      service.create(
        {
          uid: 'staff-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          bid: 'branch-1',
          role: UserRoleEnum.STAFF,
        },
        {
          branchId: 'branch-2',
          orderType: 'TAKEAWAY' as never,
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates a walk-in reservation in POS by creating a guest customer', async () => {
    const { service, posRepository, usersService } = makeService();
    posRepository.findActiveBranch.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      name: 'Main',
      coverImage: null,
      settings: { tableReservationsEnabled: true },
    });
    usersService.create.mockResolvedValue({ id: 'guest-customer-1' });
    posRepository.findCustomerProfileMetadata.mockResolvedValue({
      metadata: null,
    });
    posRepository.upsertCustomerProfileMetadata.mockResolvedValue({
      id: 'profile-1',
    });

    const result = await service.createWalkInReservation(
      {
        uid: 'staff-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
        role: UserRoleEnum.STAFF,
      },
      {
        branchId: 'branch-1',
        guestName: 'Walk In Guest',
        guestPhone: '03001234567',
        reservationDate: '2999-03-30T19:30:00.000Z',
        guestCount: 4,
        note: 'Window side if possible',
      },
    );

    expect(usersService.create).toHaveBeenCalled();
    expect(posRepository.upsertCustomerProfileMetadata).toHaveBeenCalled();
    expect(result.data.customerId).toBe('guest-customer-1');
    expect(result.data.guestCount).toBe(4);
    expect(result.message).toBe(
      'Walk-in table reservation created successfully',
    );
  });

  it('blocks POS walk-in reservation when branch reservations are disabled', async () => {
    const { service, posRepository } = makeService();
    posRepository.findActiveBranch.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      settings: { tableReservationsEnabled: false },
    });

    await expect(
      service.createWalkInReservation(
        {
          uid: 'staff-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          bid: 'branch-1',
          role: UserRoleEnum.STAFF,
        },
        {
          branchId: 'branch-1',
          guestName: 'Walk In Guest',
          reservationDate: '2999-03-30T19:30:00.000Z',
          guestCount: 4,
        },
      ),
    ).rejects.toThrow('Table reservations are not enabled for this branch');
  });

  it('adds an item to an open POS draft', async () => {
    const { service, posRepository } = makeService();
    posRepository.findDraftById
      .mockResolvedValueOnce(makeDraft())
      .mockResolvedValueOnce(
        makeDraft({
          items: [
            {
              id: 'item-1',
              menuItemId: 'menu-1',
              variationId: null,
              quantity: 2,
              note: 'No onions',
              modifiers: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        }),
      );

    const result = await service.addItem(
      {
        uid: 'staff-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
        role: UserRoleEnum.STAFF,
      },
      'draft-1',
      {
        menuItemId: 'menu-1',
        quantity: 2,
        note: 'No onions',
      },
    );

    expect(posRepository.createDraftItem).toHaveBeenCalled();
    expect(result.data.itemCount).toBe(1);
    expect(result.message).toBe('POS draft item added successfully');
  });

  it('stores grouped modifier selections for POS draft items', async () => {
    const { service, posRepository, ordersService } = makeService();
    posRepository.findDraftById
      .mockResolvedValueOnce(makeDraft())
      .mockResolvedValueOnce(
        makeDraft({
          customerId: 'customer-1',
          items: [
            {
              id: 'item-1',
              menuItemId: 'menu-1',
              variationId: null,
              quantity: 1,
              note: null,
              modifiers: {
                modifiers: [{ modifierId: 'modifier-1', quantity: 2 }],
                modifierSelections: [
                  {
                    modifierGroupId: 'group-1',
                    modifiers: [{ modifierId: 'modifier-1', quantity: 2 }],
                  },
                ],
              },
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        }),
      );
    ordersService.quote.mockResolvedValue({
      data: {
        subtotal: 12,
        taxAmount: 0,
        deliveryFee: 0,
        serviceChargeType: null,
        serviceChargeValue: null,
        serviceChargeAmount: 0,
        chargeBreakdown: [],
        tipAmount: 0,
        discountAmount: 0,
        walletAppliedAmount: 0,
        loyaltyDiscountAmount: 0,
        loyaltyPointsRedeemed: 0,
        totalAmount: 12,
        payableAmount: 12,
        appliedPromotion: null,
        items: [
          {
            menuItemId: 'menu-1',
            menuItemName: 'Menu item',
            variationId: null,
            variationName: null,
            quantity: 1,
            unitPrice: 10,
            depositAmount: 0,
            lineTotal: 12,
            taxTypeCode: null,
            taxPercentage: null,
            snapshotModifiers: [
              {
                modifierId: 'modifier-1',
                modifierGroupId: 'group-1',
                quantity: 2,
                unitPrice: 1,
                total: 2,
              },
            ],
            snapshotSections: [],
          },
        ],
      },
    });

    await service.addItem(
      {
        uid: 'staff-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
        role: UserRoleEnum.STAFF,
      },
      'draft-1',
      {
        menuItemId: 'menu-1',
        quantity: 1,
        modifierSelections: [
          {
            modifierGroupId: 'group-1',
            modifierId: 'modifier-1',
            quantity: 2,
          },
        ],
      },
    );

    expect(posRepository.createDraftItem).toHaveBeenCalledWith(
      expect.objectContaining({
        modifiers: {
          modifiers: [{ modifierId: 'modifier-1', quantity: 2 }],
          modifierSelections: [
            {
              modifierGroupId: 'group-1',
              modifiers: [{ modifierId: 'modifier-1', quantity: 2 }],
            },
          ],
        },
      }),
    );
    expect(ordersService.quote).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        items: [
          expect.objectContaining({
            modifiers: [{ modifierId: 'modifier-1', quantity: 2 }],
            modifierSelections: [
              {
                modifierGroupId: 'group-1',
                modifiers: [{ modifierId: 'modifier-1', quantity: 2 }],
              },
            ],
          }),
        ],
      }),
    );
  });

  it('quotes walk-in POS grouped modifiers and exposes Flutter selection fields', async () => {
    const { service, posRepository, ordersService, usersService } =
      makeService();
    posRepository.findDraftById.mockResolvedValue(
      makeDraft({
        items: [
          {
            id: 'item-1',
            menuItemId: 'menu-1',
            variationId: null,
            quantity: 1,
            note: null,
            modifiers: {
              modifiers: [
                { modifierId: 'tagliatelle', quantity: 1 },
                { modifierId: 'parmesan', quantity: 2 },
              ],
              modifierSelections: [
                {
                  modifierGroupId: 'pasta-group',
                  modifiers: [{ modifierId: 'tagliatelle', quantity: 1 }],
                },
                {
                  modifierGroupId: 'extras-group',
                  modifiers: [{ modifierId: 'parmesan', quantity: 2 }],
                },
              ],
            },
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      }),
    );
    ordersService.quote.mockResolvedValue({
      data: {
        subtotal: 18.1,
        taxAmount: 0,
        deliveryFee: 0,
        serviceChargeType: 'PERCENTAGE',
        serviceChargeValue: 10,
        serviceChargeAmount: 1.9,
        chargeBreakdown: [],
        tipAmount: 0,
        discountAmount: 0,
        walletAppliedAmount: 0,
        loyaltyDiscountAmount: 0,
        loyaltyPointsRedeemed: 0,
        totalAmount: 20,
        payableAmount: 20,
        appliedPromotion: null,
        items: [
          {
            menuItemId: 'menu-1',
            menuItemName: 'Pasta',
            variationId: null,
            variationName: null,
            quantity: 1,
            unitPrice: 18.1,
            depositAmount: 0,
            lineTotal: 18.1,
            taxTypeCode: null,
            taxPercentage: null,
            snapshotModifiers: [
              {
                modifierId: 'tagliatelle',
                modifierGroupId: 'pasta-group',
                quantity: 1,
                unitPrice: 1,
                total: 1,
              },
              {
                modifierId: 'parmesan',
                modifierGroupId: 'extras-group',
                quantity: 2,
                unitPrice: 4,
                total: 8,
              },
            ],
            snapshotSections: [],
          },
        ],
      },
    });

    const result = await service.details(
      {
        uid: 'staff-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
        role: UserRoleEnum.STAFF,
      },
      'draft-1',
    );

    expect(usersService.create).toHaveBeenCalled();
    expect(posRepository.updateDraft).toHaveBeenCalledWith('draft-1', {
      customer: { connect: { id: 'guest-customer-1' } },
    });
    expect(ordersService.quote).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        customerId: 'guest-customer-1',
        items: [
          expect.objectContaining({
            modifiers: [
              { modifierId: 'tagliatelle', quantity: 1 },
              { modifierId: 'parmesan', quantity: 2 },
            ],
            modifierSelections: [
              {
                modifierGroupId: 'pasta-group',
                modifiers: [{ modifierId: 'tagliatelle', quantity: 1 }],
              },
              {
                modifierGroupId: 'extras-group',
                modifiers: [{ modifierId: 'parmesan', quantity: 2 }],
              },
            ],
          }),
        ],
      }),
    );
    expect(result.data).toMatchObject({
      customerId: 'guest-customer-1',
      pricingStatus: 'QUOTED',
      subtotal: 18.1,
      serviceChargeAmount: 1.9,
      totalAmount: 20,
      payableAmount: 20,
    });
    expect(result.data.items[0]).toMatchObject({
      lineTotal: 18.1,
      modifierSelections: [
        {
          modifierGroupId: 'pasta-group',
          modifiers: [{ modifierId: 'tagliatelle', quantity: 1 }],
        },
        {
          modifierGroupId: 'extras-group',
          modifiers: [{ modifierId: 'parmesan', quantity: 2 }],
        },
      ],
      selectedModifiers: [
        expect.objectContaining({ modifierId: 'tagliatelle', total: 1 }),
        expect.objectContaining({
          modifierId: 'parmesan',
          quantity: 2,
          total: 8,
        }),
      ],
      snapshotModifiers: [
        expect.objectContaining({ modifierId: 'tagliatelle', total: 1 }),
        expect.objectContaining({
          modifierId: 'parmesan',
          quantity: 2,
          total: 8,
        }),
      ],
    });
  });

  it('includes menu item details in POS draft item responses', async () => {
    const { service, posRepository, ordersService } = makeService();
    posRepository.findDraftById.mockResolvedValue(
      makeDraft({
        customerId: 'customer-1',
        items: [
          {
            id: 'item-1',
            menuItemId: 'menu-1',
            variationId: 'variation-1',
            quantity: 1,
            note: null,
            modifiers: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      }),
    );
    posRepository.findDraftItemDetails.mockResolvedValue({
      menuItems: [
        {
          id: 'menu-1',
          name: 'Chicken Burger',
          slug: 'chicken-burger',
          description: 'Crispy chicken burger',
          imageUrl: 'burger.jpg',
          basePrice: { toString: () => '450' },
          pricingMode: 'SINGLE',
          category: {
            id: 'category-1',
            name: 'Burgers',
            imageUrl: null,
          },
        },
      ],
      variations: [
        {
          id: 'variation-1',
          name: 'Large',
          price: { toString: () => '550' },
        },
      ],
    });
    ordersService.quote.mockResolvedValue({
      data: {
        subtotal: 450,
        taxAmount: 45,
        deliveryFee: 0,
        serviceChargeType: null,
        serviceChargeValue: null,
        serviceChargeAmount: 0,
        chargeBreakdown: [],
        tipAmount: 0,
        discountAmount: 0,
        walletAppliedAmount: 0,
        loyaltyDiscountAmount: 0,
        loyaltyPointsRedeemed: 0,
        totalAmount: 495,
        payableAmount: 495,
        appliedPromotion: null,
        items: [
          {
            menuItemId: 'menu-1',
            menuItemName: 'Chicken Burger',
            variationId: 'variation-1',
            variationName: 'Large',
            quantity: 1,
            unitPrice: 450,
            depositAmount: 0,
            lineTotal: 450,
            taxTypeCode: 'VAT',
            taxPercentage: 10,
            snapshotModifiers: [],
            snapshotSections: [],
          },
        ],
      },
    });

    const result = await service.details(
      {
        uid: 'staff-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
        role: UserRoleEnum.STAFF,
      },
      'draft-1',
    );

    expect(posRepository.findDraftItemDetails).toHaveBeenCalledWith(
      'restaurant-1',
      ['menu-1'],
      ['variation-1'],
    );
    expect(ordersService.quote).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        branchId: 'branch-1',
        customerId: 'customer-1',
        orderType: 'TAKEAWAY',
      }),
    );
    expect(result.data).toMatchObject({
      subtotal: 450,
      taxAmount: 45,
      totalAmount: 495,
      payableAmount: 495,
    });
    expect(result.data.quote).toMatchObject({
      subtotal: 450,
      totalAmount: 495,
    });
    const responseItem = result.data.items[0];
    expect(responseItem.menuItemId).toBe('menu-1');
    expect(responseItem.menuItemName).toBe('Chicken Burger');
    expect(responseItem.imageUrl).toBe('burger.jpg');
    expect(responseItem.variationId).toBe('variation-1');
    expect(responseItem.variationName).toBe('Large');
    expect(responseItem.unitPrice).toBe(450);
    expect(responseItem.lineTotal).toBe(450);
    expect(responseItem.taxTypeCode).toBe('VAT');
    expect(responseItem.taxPercentage).toBe(10);
    expect(responseItem.menuItem).toMatchObject({
      id: 'menu-1',
      name: 'Chicken Burger',
      basePrice: 450,
    });
    expect(responseItem.variation).toMatchObject({
      id: 'variation-1',
      name: 'Large',
      price: 550,
    });
  });

  it('returns POS draft details when quote cannot be calculated for missing modifiers', async () => {
    const { service, posRepository, ordersService } = makeService();
    posRepository.findDraftById.mockResolvedValue(
      makeDraft({
        customerId: 'customer-1',
        items: [
          {
            id: 'item-1',
            menuItemId: 'menu-1',
            variationId: null,
            quantity: 1,
            note: null,
            modifiers: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      }),
    );
    posRepository.findDraftItemDetails.mockResolvedValue({
      menuItems: [
        {
          id: 'menu-1',
          name: 'test item 23',
          slug: 'test-item-23',
          description: null,
          imageUrl: null,
          basePrice: { toString: () => '100' },
          pricingMode: 'SINGLE',
          category: null,
        },
      ],
      variations: [],
    });
    ordersService.quote.mockRejectedValue(
      new BadRequestException(
        'test item 23 requires modifier selection(s): Extra Cheese',
      ),
    );

    const result = await service.details(
      {
        uid: 'staff-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
        role: UserRoleEnum.STAFF,
      },
      'draft-1',
    );

    expect(result.data).toMatchObject({
      pricingStatus: 'DRAFT_BASE_PRICE',
      subtotal: 100,
      taxAmount: 0,
      totalAmount: 100,
      payableAmount: 100,
    });
    expect(result.data.quote).toMatchObject({
      subtotal: 100,
      totalAmount: 100,
      payableAmount: 100,
    });
    expect(result.data.items[0]).toMatchObject({
      menuItemId: 'menu-1',
      menuItemName: 'test item 23',
      unitPrice: 100,
      lineTotal: 100,
    });
  });

  it('checks out walk-in POS draft by creating a guest customer and final order', async () => {
    const { service, posRepository, ordersService, usersService } =
      makeService();
    posRepository.findDraftById.mockResolvedValue(
      makeDraft({
        paymentMethod: 'COD',
        items: [
          {
            id: 'item-1',
            menuItemId: 'menu-1',
            variationId: null,
            quantity: 2,
            note: null,
            modifiers: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      }),
    );
    usersService.create.mockResolvedValue({ id: 'guest-customer-1' });
    ordersService.create.mockResolvedValue({
      data: { id: 'order-1', status: 'PLACED' },
      message: 'Order created successfully',
    });
    posRepository.updateDraft.mockResolvedValue(
      makeDraft({
        customerId: 'guest-customer-1',
        status: 'CHECKED_OUT',
        finalOrderId: 'order-1',
        checkedOutAt: new Date(),
        items: [
          {
            id: 'item-1',
            menuItemId: 'menu-1',
            variationId: null,
            quantity: 2,
            note: null,
            modifiers: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      }),
    );

    const result = await service.checkout(
      {
        uid: 'staff-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
        role: UserRoleEnum.STAFF,
      },
      'draft-1',
    );

    expect(usersService.create).toHaveBeenCalled();
    expect(ordersService.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        customerId: 'guest-customer-1',
        branchId: 'branch-1',
        paymentMethod: 'COD',
      }),
    );
    expect(result.data.order.id).toBe('order-1');
    expect(result.data.draft.finalOrderId).toBe('order-1');
    expect(result.message).toBe('POS order checked out successfully');
  });
});
