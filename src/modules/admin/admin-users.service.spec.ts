import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRoleEnum } from '../../common/enums';
import { AdminUsersService } from './admin-users.service';

describe('AdminUsersService', () => {
  describe('updateCustomerStatus', () => {
    it('blocks a tenant-scoped customer for business admin', async () => {
      const usersService = {
        findCustomerById: jest.fn().mockResolvedValue({
          id: 'customer-1',
          isActive: true,
        }),
        setActiveStatus: jest.fn().mockResolvedValue({
          id: 'customer-1',
          isActive: false,
        }),
      };

      const service = new AdminUsersService(usersService as never, {} as never);

      const result = await service.updateCustomerStatus(
        {
          uid: 'admin-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
          tid: 'tenant-1',
        } as never,
        'customer-1',
        { isActive: false },
      );

      expect(usersService.findCustomerById).toHaveBeenCalledWith('customer-1', {
        tenantId: 'tenant-1',
        restaurantId: undefined,
      });
      expect(usersService.setActiveStatus).toHaveBeenCalledWith(
        'customer-1',
        false,
      );
      expect(result).toEqual({
        data: {
          id: 'customer-1',
          isActive: false,
        },
        message: 'Customer blocked successfully',
      });
    });

    it('requires restaurant context for branch admin', async () => {
      const service = new AdminUsersService({} as never, {} as never);

      await expect(
        service.updateCustomerStatus(
          {
            uid: 'branch-admin-1',
            role: UserRoleEnum.BRANCH_ADMIN,
            tid: 'tenant-1',
          } as never,
          'customer-1',
          { isActive: false },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns not found when customer is outside scope', async () => {
      const usersService = {
        findCustomerById: jest.fn().mockResolvedValue(null),
        setActiveStatus: jest.fn(),
      };

      const service = new AdminUsersService(usersService as never, {} as never);

      await expect(
        service.updateCustomerStatus(
          {
            uid: 'super-admin-1',
            role: UserRoleEnum.SUPER_ADMIN,
          } as never,
          'customer-404',
          { isActive: true },
        ),
      ).rejects.toThrow(NotFoundException);
      expect(usersService.setActiveStatus).not.toHaveBeenCalled();
    });

    it('returns idempotent response when status is unchanged', async () => {
      const usersService = {
        findCustomerById: jest.fn().mockResolvedValue({
          id: 'customer-1',
          isActive: true,
        }),
        setActiveStatus: jest.fn(),
      };

      const service = new AdminUsersService(usersService as never, {} as never);

      const result = await service.updateCustomerStatus(
        {
          uid: 'super-admin-1',
          role: UserRoleEnum.SUPER_ADMIN,
        } as never,
        'customer-1',
        { isActive: true },
      );

      expect(usersService.setActiveStatus).not.toHaveBeenCalled();
      expect(result).toEqual({
        data: {
          id: 'customer-1',
          isActive: true,
        },
        message: 'Customer is already active',
      });
    });
  });

  describe('updateCustomer', () => {
    it('updates customer profile details for business admin', async () => {
      const usersService = {
        findCustomerById: jest.fn().mockResolvedValue({
          id: 'customer-1',
          email: 'old@test.com',
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          profile: {
            firstName: 'Old',
            lastName: 'Name',
            avatarUrl: null,
            phone: '03000000000',
            bio: null,
          },
        }),
        findByEmail: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({
          id: 'customer-1',
          email: 'new@test.com',
          profile: {
            firstName: 'Bilal',
            lastName: 'Shah',
            avatarUrl: null,
            phone: '03001234567',
            bio: 'VIP customer',
          },
        }),
      };

      const service = new AdminUsersService(usersService as never, {} as never);

      const result = await service.updateCustomer(
        {
          uid: 'business-admin-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
          tid: 'tenant-1',
        } as never,
        'customer-1',
        {
          email: 'new@test.com',
          firstName: 'Bilal',
          lastName: 'Shah',
          phone: '03001234567',
          bio: 'VIP customer',
        },
      );

      expect(usersService.findByEmail).toHaveBeenCalledWith(
        'new@test.com',
        'restaurant-1',
      );
      expect(usersService.update).toHaveBeenCalledWith('customer-1', {
        email: 'new@test.com',
        profile: {
          firstName: 'Bilal',
          lastName: 'Shah',
          avatarUrl: undefined,
          phone: '03001234567',
          bio: 'VIP customer',
        },
      });
      expect(result).toEqual({
        data: {
          id: 'customer-1',
          email: 'new@test.com',
          profile: {
            firstName: 'Bilal',
            lastName: 'Shah',
            avatarUrl: null,
            phone: '03001234567',
            bio: 'VIP customer',
          },
        },
        message: 'Customer updated successfully',
      });
    });

    it('rejects duplicate email inside same restaurant', async () => {
      const usersService = {
        findCustomerById: jest.fn().mockResolvedValue({
          id: 'customer-1',
          email: 'old@test.com',
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          profile: {
            firstName: 'Old',
            lastName: 'Name',
            avatarUrl: null,
            phone: null,
            bio: null,
          },
        }),
        findByEmail: jest.fn().mockResolvedValue({
          id: 'customer-2',
        }),
        update: jest.fn(),
      };

      const service = new AdminUsersService(usersService as never, {} as never);

      await expect(
        service.updateCustomer(
          {
            uid: 'business-admin-1',
            role: UserRoleEnum.BUSINESS_ADMIN,
            tid: 'tenant-1',
          } as never,
          'customer-1',
          { email: 'duplicate@test.com' },
        ),
      ).rejects.toThrow(BadRequestException);
      expect(usersService.update).not.toHaveBeenCalled();
    });
  });

  describe('removeUser', () => {
    it('allows business admin to soft delete a tenant customer', async () => {
      const usersService = {
        findById: jest.fn().mockResolvedValue({
          id: 'customer-1',
          role: UserRoleEnum.CUSTOMER,
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          deletedAt: null,
        }),
        softDeleteUser: jest.fn().mockResolvedValue({
          id: 'customer-1',
          role: UserRoleEnum.CUSTOMER,
          isActive: false,
          deletedAt: new Date('2026-04-01T11:00:00.000Z'),
          deleteAfter: new Date('2026-05-01T11:00:00.000Z'),
        }),
      };

      const service = new AdminUsersService(usersService as never, {} as never);

      const result = await service.removeUser(
        {
          uid: 'business-admin-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
          tid: 'tenant-1',
        } as never,
        'customer-1',
      );

      expect(usersService.softDeleteUser).toHaveBeenCalledWith('customer-1');
      expect(result).toEqual({
        data: {
          id: 'customer-1',
          role: UserRoleEnum.CUSTOMER,
          isActive: false,
          deletedAt: new Date('2026-04-01T11:00:00.000Z'),
          deleteAfter: new Date('2026-05-01T11:00:00.000Z'),
        },
        message: 'User scheduled for deletion in 30 days',
      });
    });

    it('allows business admin to soft delete a tenant branch admin', async () => {
      const usersService = {
        findById: jest.fn().mockResolvedValue({
          id: 'branch-admin-2',
          role: UserRoleEnum.BRANCH_ADMIN,
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          deletedAt: null,
        }),
        softDeleteUser: jest.fn().mockResolvedValue({
          id: 'branch-admin-2',
          role: UserRoleEnum.BRANCH_ADMIN,
          isActive: false,
          deletedAt: new Date('2026-04-01T11:00:00.000Z'),
          deleteAfter: new Date('2026-05-01T11:00:00.000Z'),
        }),
      };

      const service = new AdminUsersService(usersService as never, {} as never);

      await service.removeUser(
        {
          uid: 'business-admin-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
          tid: 'tenant-1',
        } as never,
        'branch-admin-2',
      );

      expect(usersService.softDeleteUser).toHaveBeenCalledWith(
        'branch-admin-2',
      );
    });

    it('allows branch admin to soft delete a customer in the same restaurant', async () => {
      const usersService = {
        findById: jest.fn().mockResolvedValue({
          id: 'customer-1',
          role: UserRoleEnum.CUSTOMER,
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          deletedAt: null,
        }),
        softDeleteUser: jest.fn().mockResolvedValue({
          id: 'customer-1',
          role: UserRoleEnum.CUSTOMER,
          isActive: false,
          deletedAt: new Date('2026-04-01T11:00:00.000Z'),
          deleteAfter: new Date('2026-05-01T11:00:00.000Z'),
        }),
      };

      const service = new AdminUsersService(usersService as never, {} as never);

      await service.removeUser(
        {
          uid: 'branch-admin-1',
          role: UserRoleEnum.BRANCH_ADMIN,
          tid: 'tenant-1',
          rid: 'restaurant-1',
          bid: 'branch-1',
        } as never,
        'customer-1',
      );

      expect(usersService.softDeleteUser).toHaveBeenCalledWith('customer-1');
    });

    it('prevents branch admin from deleting a branch admin user', async () => {
      const usersService = {
        findById: jest.fn().mockResolvedValue({
          id: 'branch-admin-2',
          role: UserRoleEnum.BRANCH_ADMIN,
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          deletedAt: null,
        }),
        softDeleteUser: jest.fn(),
      };

      const service = new AdminUsersService(usersService as never, {} as never);

      await expect(
        service.removeUser(
          {
            uid: 'branch-admin-1',
            role: UserRoleEnum.BRANCH_ADMIN,
            tid: 'tenant-1',
            rid: 'restaurant-1',
            bid: 'branch-1',
          } as never,
          'branch-admin-2',
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(usersService.softDeleteUser).not.toHaveBeenCalled();
    });

    it('prevents deleting own account through admin delete route', async () => {
      const usersService = {
        findById: jest.fn().mockResolvedValue({
          id: 'business-admin-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
          tenantId: 'tenant-1',
          restaurantId: null,
          deletedAt: null,
        }),
        softDeleteUser: jest.fn(),
      };

      const service = new AdminUsersService(usersService as never, {} as never);

      await expect(
        service.removeUser(
          {
            uid: 'business-admin-1',
            role: UserRoleEnum.BUSINESS_ADMIN,
            tid: 'tenant-1',
          } as never,
          'business-admin-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(usersService.softDeleteUser).not.toHaveBeenCalled();
    });
  });
});
