import { ForbiddenException } from '@nestjs/common';
import { PosService } from './pos.service';
import { UserRoleEnum } from '../../common/enums';

describe('PosService', () => {
  const makeService = () => {
    const posRepository = {
      findActiveBranch: jest.fn(),
      findScopedCustomer: jest.fn(),
      createDraft: jest.fn(),
      listDrafts: jest.fn(),
      findDraftById: jest.fn(),
      updateDraft: jest.fn(),
    };

    const service = new PosService(posRepository as never);

    return { service, posRepository };
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
    posRepository.createDraft.mockResolvedValue({
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
    });

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
});
