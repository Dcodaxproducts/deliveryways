import 'reflect-metadata';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UserRoleEnum } from '../../common/enums';
import { UsersService } from '../users/users.service';
import { DevTestingService } from './dev-testing.service';

describe('DevTestingService', () => {
  let service: DevTestingService;
  let usersService: Partial<Record<keyof UsersService, jest.Mock>>;
  let prisma: { $transaction: jest.Mock };

  beforeEach(() => {
    usersService = {
      findManyForDevResolution: jest.fn(),
      setApprovalStatus: jest.fn(),
      deleteManyByIds: jest.fn(),
    };

    prisma = {
      $transaction: jest.fn(async (callback: (tx: any) => unknown) =>
        callback({
          branch: { updateMany: jest.fn() },
          inventoryMovement: { updateMany: jest.fn() },
          notification: { deleteMany: jest.fn() },
          chatMessage: { deleteMany: jest.fn() },
          profile: { deleteMany: jest.fn() },
          user: { delete: jest.fn() },
        }),
      ),
    };

    service = new DevTestingService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      usersService as unknown as UsersService,
      prisma as never,
    );
  });

  it('approves a single matched user by email and restaurant scope', async () => {
    usersService.findManyForDevResolution!.mockResolvedValue([
      {
        id: 'customer-1',
        email: 'customer@example.com',
        role: UserRoleEnum.CUSTOMER,
        restaurantId: 'restaurant-1',
        isApproved: false,
      },
    ]);
    usersService.setApprovalStatus!.mockResolvedValue({
      id: 'customer-1',
      email: 'customer@example.com',
      role: UserRoleEnum.CUSTOMER,
      restaurantId: 'restaurant-1',
      isApproved: true,
    });

    const result = await service.approveUser({
      email: 'customer@example.com',
      role: UserRoleEnum.CUSTOMER,
      restaurantId: 'restaurant-1',
    });

    expect(usersService.findManyForDevResolution).toHaveBeenCalledWith({
      id: undefined,
      email: 'customer@example.com',
      role: UserRoleEnum.CUSTOMER,
      restaurantId: 'restaurant-1',
    });
    expect(usersService.setApprovalStatus).toHaveBeenCalledWith(
      'customer-1',
      true,
    );
    expect(result.data.isApproved).toBe(true);
  });

  it('rejects ambiguous email matches', async () => {
    usersService.findManyForDevResolution!.mockResolvedValue([
      {
        id: 'customer-1',
        email: 'shared@example.com',
        role: UserRoleEnum.CUSTOMER,
        restaurantId: 'restaurant-1',
        isApproved: false,
      },
      {
        id: 'customer-2',
        email: 'shared@example.com',
        role: UserRoleEnum.CUSTOMER,
        restaurantId: 'restaurant-2',
        isApproved: false,
      },
    ]);

    await expect(
      service.approveUser({
        email: 'shared@example.com',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('deletes a single matched user by id', async () => {
    usersService.findManyForDevResolution!.mockResolvedValue([
      {
        id: 'branch-admin-1',
        email: 'branch@example.com',
        role: UserRoleEnum.BRANCH_ADMIN,
        restaurantId: 'restaurant-1',
        isApproved: true,
      },
    ]);
    const result = await service.deleteUser({
      id: 'branch-admin-1',
    });

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(result.data.deleted).toBe(true);
  });

  it('throws not found when no user matches', async () => {
    usersService.findManyForDevResolution!.mockResolvedValue([]);

    await expect(
      service.deleteUser({
        email: 'missing@example.com',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
