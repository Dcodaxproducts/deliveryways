import { BadRequestException } from '@nestjs/common';
import { GroupOrderParticipantStatus } from '@prisma/client';
import { OrderTypeEnum, UserRoleEnum } from '../../common/enums';
import { GroupOrdersService } from './group-orders.service';

describe('GroupOrdersService', () => {
  const makeService = () => {
    const groupOrdersRepository = {
      findActiveBranch: jest.fn(),
      findActiveSessionByHost: jest.fn(),
      findOwnedAddress: jest.fn(),
      createSession: jest.fn(),
      findSessionByInviteCode: jest.fn(),
      findParticipant: jest.fn(),
      createParticipant: jest.fn(),
      updateParticipant: jest.fn(),
      findSessionById: jest.fn(),
      findMenuItemsForResponse: jest.fn(),
    };

    const ordersService = {
      create: jest.fn(),
      quoteForCouponValidation: jest.fn(),
    };

    const service = new GroupOrdersService(
      groupOrdersRepository as never,
      ordersService as never,
    );

    return { service, groupOrdersRepository, ordersService };
  };

  const customerUser = {
    uid: 'customer-1',
    tid: 'tenant-1',
    rid: 'restaurant-1',
    role: UserRoleEnum.CUSTOMER,
  };

  it('blocks creating a new group order when host already has an active session', async () => {
    const { service, groupOrdersRepository } = makeService();
    groupOrdersRepository.findActiveBranch.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
    });
    groupOrdersRepository.findActiveSessionByHost.mockResolvedValue({
      id: 'session-1',
    });

    await expect(
      service.create(customerUser, {
        branchId: 'branch-1',
        orderType: OrderTypeEnum.TAKEAWAY,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(groupOrdersRepository.createSession).not.toHaveBeenCalled();
  });

  it('blocks host from joining their own group order', async () => {
    const { service, groupOrdersRepository } = makeService();
    groupOrdersRepository.findSessionByInviteCode.mockResolvedValue({
      id: 'session-1',
      inviteCode: 'INVITE123',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      hostUserId: 'customer-1',
      status: 'OPEN',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      participants: [
        {
          id: 'participant-host',
          userId: 'customer-1',
          status: GroupOrderParticipantStatus.ACTIVE,
          isHost: true,
        },
      ],
    });

    await expect(
      service.join(customerUser, { inviteCode: 'INVITE123' }),
    ).rejects.toThrow('Host is already part of this group order');

    expect(groupOrdersRepository.createParticipant).not.toHaveBeenCalled();
    expect(groupOrdersRepository.updateParticipant).not.toHaveBeenCalled();
  });

  it('blocks joining the same group order twice while already active', async () => {
    const { service, groupOrdersRepository } = makeService();
    groupOrdersRepository.findSessionByInviteCode.mockResolvedValue({
      id: 'session-1',
      inviteCode: 'INVITE123',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      hostUserId: 'host-1',
      status: 'OPEN',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      participants: [
        {
          id: 'participant-1',
          userId: 'customer-1',
          status: GroupOrderParticipantStatus.ACTIVE,
          isHost: false,
        },
      ],
    });
    groupOrdersRepository.findParticipant.mockResolvedValue({
      id: 'participant-1',
      sessionId: 'session-1',
      userId: 'customer-1',
      status: GroupOrderParticipantStatus.ACTIVE,
    });

    await expect(
      service.join(customerUser, { inviteCode: 'INVITE123' }),
    ).rejects.toThrow('You are already part of this group order');

    expect(groupOrdersRepository.createParticipant).not.toHaveBeenCalled();
    expect(groupOrdersRepository.updateParticipant).not.toHaveBeenCalled();
  });
});
