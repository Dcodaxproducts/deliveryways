import { ForbiddenException } from '@nestjs/common';
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
    };

    const ordersService = {
      quote: jest.fn(),
      create: jest.fn(),
    };

    const usersService = {
      create: jest.fn(),
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

  it('checks out walk-in POS draft by creating a guest customer and final order', async () => {
    const { service, posRepository, ordersService, usersService } = makeService();
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
