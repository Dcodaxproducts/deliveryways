import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRoleEnum } from '../../common/enums';
import { EmployeesRepository } from './employees.repository';
import { EmployeesService } from './employees.service';

describe('EmployeesService', () => {
  let service: EmployeesService;
  let repository: Partial<Record<keyof EmployeesRepository, jest.Mock>>;

  const adminUser = {
    uid: 'user-1',
    tid: 'tenant-1',
    rid: 'restaurant-1',
    role: UserRoleEnum.BUSINESS_ADMIN,
  };

  const employee = {
    id: 'emp-1',
    email: 'staff@example.com',
    role: UserRoleEnum.BRANCH_STAFF,
    tenantId: 'tenant-1',
    restaurantId: 'restaurant-1',
    branchId: 'branch-1',
    isActive: true,
    isVerified: true,
    isApproved: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    profile: {
      firstName: 'Bilal',
      lastName: 'Shah',
      phone: '+923001112233',
      avatarUrl: null,
      bio: null,
    },
    branch: { id: 'branch-1', name: 'Main Branch' },
  };

  beforeEach(() => {
    repository = {
      findById: jest.fn().mockResolvedValue(employee),
      findByEmail: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(employee),
      update: jest.fn().mockResolvedValue({ ...employee, isActive: false }),
      list: jest.fn().mockResolvedValue({ items: [employee], total: 1 }),
      softDelete: jest.fn().mockResolvedValue({
        ...employee,
        isActive: false,
        deletedAt: new Date(),
      }),
    };

    service = new EmployeesService(
      repository as never,
      {
        branch: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'branch-1',
            restaurantId: 'restaurant-1',
            tenantId: 'tenant-1',
          }),
        },
      } as never,
    );
  });

  it('creates an employee in the scoped restaurant/branch', async () => {
    const result = await service.create(adminUser, {
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      email: 'staff@example.com',
      password: 'Secret123!',
      profile: {
        firstName: 'Bilal',
        lastName: 'Shah',
        phone: '+923001112233',
      },
    });

    expect(repository.create).toHaveBeenCalled();
    expect(result.message).toBe('Employee created successfully');
  });

  it('rejects duplicate employee email in the same restaurant', async () => {
    repository.findByEmail!.mockResolvedValueOnce({ id: 'emp-2' });

    await expect(
      service.create(adminUser, {
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
        email: 'staff@example.com',
        password: 'Secret123!',
        profile: {
          firstName: 'Bilal',
          lastName: 'Shah',
        },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('locks branch admins to their own branch employee records', async () => {
    await expect(
      service.details(
        {
          uid: 'user-2',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          bid: 'branch-2',
          role: UserRoleEnum.BRANCH_ADMIN,
        },
        'emp-1',
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('updates employee status', async () => {
    const result = await service.updateStatus(adminUser, 'emp-1', {
      isActive: false,
    });

    expect(repository.update).toHaveBeenCalledWith('emp-1', {
      isActive: false,
      refreshTokenHash: null,
    });
    expect(result.message).toBe('Employee status updated successfully');
  });
});
