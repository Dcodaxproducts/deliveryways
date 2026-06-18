import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DeliverymanStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UserRoleEnum } from '../../common/enums/user-role.enum';
import { DeliverymenService } from './deliverymen.service';
import { DeliverymenRepository } from './deliverymen.repository';
import { OrdersService } from '../orders/orders.service';
import { AddressesService } from '../addresses/addresses.service';

describe('DeliverymenService', () => {
  let service: DeliverymenService;
  let repository: Partial<Record<keyof DeliverymenRepository, jest.Mock>>;
  let ordersService: Partial<Record<keyof OrdersService, jest.Mock>>;
  let addressesService: Partial<Record<keyof AddressesService, jest.Mock>>;

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
    twoFactorEnabled: false,
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
      listDeliveredOrdersForEarnings: jest.fn().mockResolvedValue([]),
    };

    ordersService = {
      assignDeliveryman: jest.fn().mockResolvedValue({
        id: 'order-1',
        status: 'OUT_FOR_DELIVERY',
        deliverymanId: 'dm-1',
      }),
      acceptDeliverymanOrder: jest.fn().mockResolvedValue({
        id: 'order-1',
        status: 'OUT_FOR_DELIVERY',
        deliverymanId: 'dm-1',
      }),
    };

    addressesService = {
      create: jest.fn(),
      list: jest.fn(),
      update: jest.fn(),
    };

    service = new DeliverymenService(
      repository as unknown as DeliverymenRepository,
      ordersService as unknown as OrdersService,
      addressesService as unknown as AddressesService,
      {
        branch: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'branch-1',
            restaurantId: 'restaurant-1',
            tenantId: 'tenant-1',
          }),
        },
        restaurant: {
          findFirst: jest.fn().mockResolvedValue({ id: 'restaurant-1' }),
          findUnique: jest.fn().mockResolvedValue({
            settings: { customerApp: { currency: 'PKR' } },
          }),
        },
        deliveryman: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      } as never,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  it('rejects assignment when deliveryman already has active delivery order', async () => {
    repository.findById!.mockResolvedValue({
      ...deliveryman,
      status: DeliverymanStatus.BUSY,
      orders: [{ id: 'active-order-1' }],
    });

    await expect(
      service.assignOrder(adminUser, 'dm-1', { orderId: 'order-2' }),
    ).rejects.toThrow('Deliveryman already has an active delivery order');
    expect(ordersService.assignDeliveryman).not.toHaveBeenCalled();
  });

  it('allows deliveryman to accept an order and marks deliveryman busy', async () => {
    const result = await service.acceptOrder(
      {
        uid: 'dm-1',
        role: 'DELIVERYMAN',
      } as never,
      { orderId: 'order-1' },
    );

    expect(ordersService.acceptDeliverymanOrder).toHaveBeenCalledWith(
      {
        uid: 'dm-1',
        role: 'DELIVERYMAN',
      },
      'order-1',
      'branch-1',
      'restaurant-1',
    );
    expect(repository.update).toHaveBeenCalledWith('dm-1', {
      status: DeliverymanStatus.BUSY,
    });
    expect(result.message).toBe('Order accepted by deliveryman successfully');
  });

  it('hashes admin-provided deliveryman password on create', async () => {
    jest
      .spyOn(bcrypt, 'hash')
      .mockResolvedValue('hashed-rider-password' as never);

    await service.create(adminUser, {
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      firstName: 'Wajih',
      lastName: 'Hassan',
      email: 'rider@example.com',
      phone: '03410279181',
      vehicleType: 'motor',
      vehicleNumber: '1234',
      password: 'Rider@123',
    });

    expect(bcrypt.hash).toHaveBeenCalledWith('Rider@123', 10);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        password: 'hashed-rider-password',
      }),
    );
  });

  it('allows public deliveryman signup with branch-derived scope', async () => {
    const prisma = (
      service as unknown as {
        prisma: { branch: { findFirst: jest.Mock } };
      }
    ).prisma;
    prisma.branch.findFirst.mockResolvedValueOnce({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      restaurant: {
        id: 'restaurant-1',
        isActive: true,
        deletedAt: null,
      },
    });
    jest
      .spyOn(bcrypt, 'hash')
      .mockResolvedValue('hashed-signup-password' as never);

    const result = await service.signup({
      branchId: 'branch-1',
      firstName: 'New',
      lastName: 'Rider',
      email: 'new.rider@example.com',
      phone: '03410000000',
      vehicleType: 'bike',
      vehicleNumber: 'RDR-1',
      password: 'Rider@123',
    });

    expect(bcrypt.hash).toHaveBeenCalledWith('Rider@123', 10);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant: { connect: { id: 'tenant-1' } },
        restaurant: { connect: { id: 'restaurant-1' } },
        branch: { connect: { id: 'branch-1' } },
        password: 'hashed-signup-password',
        status: DeliverymanStatus.OFFLINE,
        isActive: true,
      }),
    );
    expect(result.message).toBe('Deliveryman signup completed successfully');
  });

  it('rejects public deliveryman signup when restaurant scope mismatches branch', async () => {
    const prisma = (
      service as unknown as {
        prisma: { branch: { findFirst: jest.Mock } };
      }
    ).prisma;
    prisma.branch.findFirst.mockResolvedValueOnce({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      restaurant: {
        id: 'restaurant-1',
        isActive: true,
        deletedAt: null,
      },
    });

    await expect(
      service.signup({
        restaurantId: 'restaurant-2',
        branchId: 'branch-1',
        firstName: 'New',
        lastName: 'Rider',
        email: 'new.rider@example.com',
        phone: '03410000000',
        password: 'Rider@123',
      }),
    ).rejects.toThrow('Branch does not belong to restaurant');

    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects order accept when deliveryman already has active delivery order', async () => {
    repository.findById!.mockResolvedValue({
      ...deliveryman,
      orders: [{ id: 'active-order-1' }],
    });

    await expect(
      service.acceptOrder(
        {
          uid: 'dm-1',
          role: 'DELIVERYMAN',
        } as never,
        { orderId: 'order-2' },
      ),
    ).rejects.toThrow('Deliveryman already has an active delivery order');
    expect(ordersService.acceptDeliverymanOrder).not.toHaveBeenCalled();
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

  it('restores a deleted deliveryman when creating with the same email', async () => {
    const prisma = (
      service as unknown as {
        prisma: { deliveryman: { findFirst: jest.Mock } };
      }
    ).prisma;
    prisma.deliveryman.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'dm-deleted' });
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password' as never);
    repository.update!.mockResolvedValue({
      ...deliveryman,
      id: 'dm-deleted',
      email: 'rider@example.com',
      deletedAt: null,
      isActive: true,
    });

    await service.create(adminUser, {
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      firstName: 'Restored',
      lastName: 'Rider',
      email: 'Rider@Example.com',
      phone: '03410279181',
      vehicleType: 'motor',
      vehicleNumber: '1234',
      password: 'Rider@123',
    });

    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.update).toHaveBeenCalledWith(
      'dm-deleted',
      expect.objectContaining({
        email: 'rider@example.com',
        password: 'hashed-password',
        isActive: true,
        deletedAt: null,
        refreshTokenHash: null,
      }),
    );
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

  it('allows deliveryman to set own status online', async () => {
    repository.update!.mockResolvedValue({
      ...deliveryman,
      status: DeliverymanStatus.AVAILABLE,
    });

    const result = await service.updateMyStatus(
      {
        uid: 'dm-1',
        role: 'DELIVERYMAN',
      } as never,
      {
        status: 'ONLINE',
      },
    );

    expect(repository.update).toHaveBeenCalledWith('dm-1', {
      status: DeliverymanStatus.AVAILABLE,
    });
    expect(result.message).toBe(
      'Deliveryman availability updated successfully',
    );
  });

  it('returns driver profile with vehicle info', async () => {
    const result = await service.myProfile({
      uid: 'dm-1',
      role: 'DELIVERYMAN',
    } as never);

    expect(result.data.vehicle).toEqual({
      type: 'bike',
      number: 'ABC-123',
    });
    expect(result.data.profile.firstName).toBe('Bilal');
  });

  it('updates deliveryman own profile and vehicle info', async () => {
    repository.update!.mockResolvedValue({
      ...deliveryman,
      firstName: 'Updated',
      vehicleType: 'car',
      vehicleNumber: 'CAR-1',
    });

    const result = await service.updateMyProfile(
      {
        uid: 'dm-1',
        role: 'DELIVERYMAN',
      } as never,
      {
        firstName: 'Updated',
        vehicleType: 'car',
        vehicleNumber: 'CAR-1',
      },
    );

    expect(repository.update).toHaveBeenCalledWith('dm-1', {
      firstName: 'Updated',
      lastName: undefined,
      phone: undefined,
      vehicleType: 'car',
      vehicleNumber: 'CAR-1',
    });
    expect(result.data.vehicle).toEqual({
      type: 'car',
      number: 'CAR-1',
    });
  });

  it('returns deliveryman earnings summary and recent deliveries', async () => {
    const deliveredAt = new Date();
    repository.listDeliveredOrdersForEarnings!.mockResolvedValue([
      {
        id: 'order-1',
        status: 'DELIVERED',
        paymentStatus: 'PAID',
        orderTime: deliveredAt,
        deliveredAt,
        deliveryFee: { toString: () => '25.50' },
        totalAmount: { toString: () => '125.50' },
        branch: { id: 'branch-1', name: 'Main Branch' },
        customer: {
          id: 'customer-1',
          email: 'customer@example.com',
          profile: {
            firstName: 'Test',
            lastName: 'Customer',
            phone: '123',
          },
        },
        deliveryAddress: {
          street: 'Street 1',
          area: '12',
          city: 'Lahore',
          postalCode: '54000',
        },
      },
    ]);

    const result = await service.myEarnings({
      uid: 'dm-1',
      role: 'DELIVERYMAN',
    } as never);

    expect(repository.listDeliveredOrdersForEarnings).toHaveBeenCalledWith(
      'dm-1',
      expect.any(Date),
    );
    expect(result.data.summary.daily).toEqual(
      expect.objectContaining({
        deliveriesCount: 1,
        earningsAmount: 25.5,
      }),
    );
    expect(result.data.currency).toBe('PKR');
    expect(result.data.recentDeliveries[0]).toEqual(
      expect.objectContaining({
        id: 'order-1',
        earningAmount: 25.5,
      }),
    );
  });

  it('allows deliveryman to set own status offline', async () => {
    repository.update!.mockResolvedValue({
      ...deliveryman,
      status: DeliverymanStatus.OFFLINE,
    });

    await service.updateMyStatus(
      {
        uid: 'dm-1',
        role: 'DELIVERYMAN',
      } as never,
      {
        status: 'OFFLINE',
      },
    );

    expect(repository.update).toHaveBeenCalledWith('dm-1', {
      status: DeliverymanStatus.OFFLINE,
    });
  });

  it('allows deliveryman to update own status through id route with online payload', async () => {
    repository.update!.mockResolvedValue({
      ...deliveryman,
      status: DeliverymanStatus.AVAILABLE,
    });

    const result = await service.updateStatus(
      {
        uid: 'dm-1',
        role: 'DELIVERYMAN',
      } as never,
      'dm-1',
      {
        status: 'ONLINE',
      },
    );

    expect(repository.update).toHaveBeenCalledWith('dm-1', {
      status: DeliverymanStatus.AVAILABLE,
    });
    expect(result.message).toBe(
      'Deliveryman availability updated successfully',
    );
  });

  it('blocks deliveryman from updating another deliveryman status through id route', async () => {
    await expect(
      service.updateStatus(
        {
          uid: 'dm-1',
          role: 'DELIVERYMAN',
        } as never,
        'dm-2',
        {
          status: 'OFFLINE',
        },
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
