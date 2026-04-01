import { ForbiddenException, NotFoundException } from '@nestjs/common';
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
});
