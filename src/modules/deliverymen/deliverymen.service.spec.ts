import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DeliverymanStatus } from '@prisma/client';
import { UserRoleEnum } from '../../common/enums/user-role.enum';
import { DeliverymenService } from './deliverymen.service';
import { DeliverymenRepository } from './deliverymen.repository';
import { OrdersService } from '../orders/orders.service';

describe('DeliverymenService', () => {
  let service: DeliverymenService;
  let repository: Partial<Record<keyof DeliverymenRepository, jest.Mock>>;
  let ordersService: Partial<Record<keyof OrdersService, jest.Mock>>;

  const adminUser = {
    uid: 'user-1',
    tid: 'tenant-1',
    rid: 'restaurant-1',
    role: UserRoleEnum.BUSINESS_ADMIN,
  };

  const deliveryman = {
    id: 'dm-1',
    tenantId: 'tenant-1',
    restaurantId: 'restaurant-1',
    branchId: 'branch-1',
    firstName: 'Bilal',
    lastName: 'Shah',
    email: 'bilal@example.com',
    phone: '+923001112233',
    vehicleType: 'bike',
    vehicleNumber: 'ABC-123',
    status: DeliverymanStatus.AVAILABLE,
    isActive: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    branch: { id: 'branch-1', name: 'Main Branch' },
    orders: [],
  };

  beforeEach(() => {
    repository = {
      findById: jest.fn().mockResolvedValue(deliveryman),
      update: jest
        .fn()
        .mockResolvedValue({ ...deliveryman, status: DeliverymanStatus.BUSY }),
      create: jest.fn().mockResolvedValue(deliveryman),
    };

    ordersService = {
      assignDeliveryman: jest.fn().mockResolvedValue({
        id: 'order-1',
        status: 'OUT_FOR_DELIVERY',
        deliverymanId: 'dm-1',
      }),
    };

    service = new DeliverymenService(
      repository as unknown as DeliverymenRepository,
      ordersService as unknown as OrdersService,
      {
        branch: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'branch-1',
            restaurantId: 'restaurant-1',
            tenantId: 'tenant-1',
          }),
        },
        deliveryman: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      } as never,
    );
  });

  it('assigns order and marks deliveryman busy', async () => {
    const result = await service.assignOrder(adminUser, 'dm-1', {
      orderId: 'order-1',
    });

    expect(ordersService.assignDeliveryman).toHaveBeenCalledWith(
      adminUser,
      'order-1',
      'dm-1',
      'branch-1',
      'restaurant-1',
    );
    expect(repository.update).toHaveBeenCalledWith('dm-1', {
      status: DeliverymanStatus.BUSY,
    });
    expect(result.message).toBe('Order assigned to deliveryman successfully');
  });

  it('rejects assignment when deliveryman is offline', async () => {
    repository.findById!.mockResolvedValue({
      ...deliveryman,
      status: DeliverymanStatus.OFFLINE,
    });

    await expect(
      service.assignOrder(adminUser, 'dm-1', { orderId: 'order-1' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('blocks branch admins from cross-branch deliverymen', async () => {
    await expect(
      service.details(
        {
          uid: 'user-2',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          bid: 'branch-2',
          role: UserRoleEnum.BRANCH_ADMIN,
        },
        'dm-1',
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects duplicate deliveryman email in the same restaurant', async () => {
    const prisma = (
      service as unknown as {
        prisma: { deliveryman: { findFirst: jest.Mock } };
      }
    ).prisma;
    prisma.deliveryman.findFirst.mockResolvedValueOnce({ id: 'dm-2' });

    await expect(
      service.create(adminUser, {
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
        firstName: 'Wajih',
        lastName: 'Hassan',
        email: 'test10@gmail.com',
        phone: '03410279181',
        vehicleType: 'motor',
        vehicleNumber: '1234',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate deliveryman phone in the same branch', async () => {
    const prisma = (
      service as unknown as {
        prisma: { deliveryman: { findFirst: jest.Mock } };
      }
    ).prisma;
    prisma.deliveryman.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'dm-3' });

    await expect(
      service.create(adminUser, {
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
        firstName: 'Wajih',
        lastName: 'Hassan',
        email: 'test11@gmail.com',
        phone: '03410279181',
        vehicleType: 'motor',
        vehicleNumber: '1234',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(repository.create).not.toHaveBeenCalled();
  });
});
