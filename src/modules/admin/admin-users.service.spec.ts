import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PaymentStatus, SubscriptionStatus } from '@prisma/client';
import { UserRoleEnum } from '../../common/enums';
import { AdminUsersService } from './admin-users.service';

describe('AdminUsersService', () => {
  describe('listCustomers', () => {
    it('scopes staff customer lists to the selected assigned restaurant', async () => {
      const usersService = {
        listCustomers: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      };
      const service = new AdminUsersService(usersService as never, {} as never);

      await service.listCustomers(
        {
          uid: 'staff-1',
          role: UserRoleEnum.STAFF,
          tid: 'tenant-1',
          rid: 'restaurant-1',
          restaurantAccess: { restaurantIds: ['restaurant-1'] },
        } as never,
        {
          page: 1,
          limit: 20,
          restaurantId: 'restaurant-1',
        } as never,
      );

      expect(usersService.listCustomers).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ restaurantId: 'restaurant-1' }),
        false,
      );
    });

    it('rejects staff customer lists outside assigned restaurants', async () => {
      const usersService = { listCustomers: jest.fn() };
      const service = new AdminUsersService(usersService as never, {} as never);

      await expect(
        service.listCustomers(
          {
            uid: 'staff-1',
            role: UserRoleEnum.STAFF,
            tid: 'tenant-1',
            restaurantAccess: { restaurantIds: ['restaurant-1'] },
          } as never,
          {
            page: 1,
            limit: 20,
            restaurantId: 'restaurant-2',
          } as never,
        ),
      ).rejects.toThrow('Staff account is not assigned to this restaurant');
      expect(usersService.listCustomers).not.toHaveBeenCalled();
    });
  });

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

  describe('removeCustomer', () => {
    it('allows assigned Customer Management staff to delete only a scoped customer', async () => {
      const usersService = {
        findCustomerById: jest.fn().mockResolvedValue({
          id: 'customer-1',
          restaurantId: 'restaurant-1',
        }),
        softDeleteUser: jest.fn().mockResolvedValue({
          id: 'customer-1',
          role: UserRoleEnum.CUSTOMER,
          isActive: false,
          deletedAt: new Date('2026-07-30T10:00:00.000Z'),
          deleteAfter: new Date('2026-08-29T10:00:00.000Z'),
        }),
      };
      const service = new AdminUsersService(usersService as never, {} as never);

      await expect(
        service.removeCustomer(
          {
            uid: 'staff-1',
            role: UserRoleEnum.STAFF,
            tid: 'tenant-1',
            rid: 'restaurant-1',
            restaurantAccess: { restaurantIds: ['restaurant-1'] },
          } as never,
          'customer-1',
        ),
      ).resolves.toMatchObject({
        data: { id: 'customer-1', role: UserRoleEnum.CUSTOMER },
      });
      expect(usersService.softDeleteUser).toHaveBeenCalledWith('customer-1');
    });

    it('rejects staff customer access outside assigned restaurants', async () => {
      const usersService = {
        findCustomerById: jest.fn().mockResolvedValue({
          id: 'customer-2',
          restaurantId: 'restaurant-2',
        }),
        softDeleteUser: jest.fn(),
      };
      const service = new AdminUsersService(usersService as never, {} as never);

      await expect(
        service.removeCustomer(
          {
            uid: 'staff-1',
            role: UserRoleEnum.STAFF,
            tid: 'tenant-1',
            rid: 'restaurant-1',
            restaurantAccess: { restaurantIds: ['restaurant-1'] },
          } as never,
          'customer-2',
        ),
      ).rejects.toThrow('Staff account is not assigned to this restaurant');
      expect(usersService.softDeleteUser).not.toHaveBeenCalled();
    });
  });

  describe('approveBusinessAdmin', () => {
    it('marks a pending business admin approved and verified', async () => {
      const usersService = {
        findById: jest.fn().mockResolvedValue({
          id: 'business-admin-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
          isApproved: false,
          isVerified: false,
          deletedAt: null,
          tenantId: 'tenant-1',
        }),
        setApprovalStatus: jest.fn().mockResolvedValue({
          id: 'business-admin-1',
          isApproved: true,
          isVerified: true,
        }),
      };
      const prisma = {
        tenantSubscription: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'subscription-1',
            paymentStatus: PaymentStatus.PAID,
            packagePlan: {
              billingModel: 'PLAN',
              planPrice: { greaterThan: () => true },
              trialDays: 0,
            },
          }),
        },
      };

      const service = new AdminUsersService(
        usersService as never,
        prisma as never,
      );

      const result = await service.approveBusinessAdmin(
        {
          uid: 'super-admin-1',
          role: UserRoleEnum.SUPER_ADMIN,
        } as never,
        'business-admin-1',
      );

      expect(usersService.setApprovalStatus).toHaveBeenCalledWith(
        'business-admin-1',
        true,
      );
      expect(result).toEqual({
        data: {
          id: 'business-admin-1',
          isApproved: true,
          isVerified: true,
        },
        message: 'Business admin approved successfully',
      });
    });

    it('repairs an approved business admin that is still unverified', async () => {
      const usersService = {
        findById: jest.fn().mockResolvedValue({
          id: 'business-admin-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
          isApproved: true,
          isVerified: false,
          deletedAt: null,
        }),
        setApprovalStatus: jest.fn().mockResolvedValue({
          id: 'business-admin-1',
          isApproved: true,
          isVerified: true,
        }),
      };

      const service = new AdminUsersService(usersService as never, {} as never);

      await service.approveBusinessAdmin(
        {
          uid: 'super-admin-1',
          role: UserRoleEnum.SUPER_ADMIN,
        } as never,
        'business-admin-1',
      );

      expect(usersService.setApprovalStatus).toHaveBeenCalledWith(
        'business-admin-1',
        true,
      );
    });

    it('blocks approval until a paid package subscription is paid', async () => {
      const usersService = {
        findById: jest.fn().mockResolvedValue({
          id: 'business-admin-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
          isApproved: false,
          isVerified: true,
          deletedAt: null,
          tenantId: 'tenant-1',
        }),
        setApprovalStatus: jest.fn(),
      };
      const prisma = {
        tenantSubscription: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'subscription-1',
            paymentStatus: PaymentStatus.PENDING,
            packagePlan: {
              billingModel: 'PLAN',
              planPrice: { greaterThan: () => true },
              trialDays: 0,
            },
          }),
        },
      };

      const service = new AdminUsersService(
        usersService as never,
        prisma as never,
      );

      await expect(
        service.approveBusinessAdmin(
          {
            uid: 'super-admin-1',
            role: UserRoleEnum.SUPER_ADMIN,
          } as never,
          'business-admin-1',
        ),
      ).rejects.toThrow(
        'Package payment must be completed before business admin approval',
      );
      expect(usersService.setApprovalStatus).not.toHaveBeenCalled();
    });

    it('allows unpaid approval when selected package has a trial', async () => {
      const usersService = {
        findById: jest.fn().mockResolvedValue({
          id: 'business-admin-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
          isApproved: false,
          isVerified: true,
          deletedAt: null,
          tenantId: 'tenant-1',
        }),
        setApprovalStatus: jest.fn().mockResolvedValue({
          id: 'business-admin-1',
          isApproved: true,
          isVerified: true,
        }),
      };
      const prisma = {
        tenantSubscription: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'subscription-1',
            paymentStatus: PaymentStatus.PENDING,
            packagePlan: {
              billingModel: 'PLAN',
              planPrice: { greaterThan: () => true },
              trialDays: 14,
            },
          }),
        },
      };

      const service = new AdminUsersService(
        usersService as never,
        prisma as never,
      );

      await service.approveBusinessAdmin(
        {
          uid: 'super-admin-1',
          role: UserRoleEnum.SUPER_ADMIN,
        } as never,
        'business-admin-1',
      );

      expect(usersService.setApprovalStatus).toHaveBeenCalledWith(
        'business-admin-1',
        true,
      );
    });

    it('rejects a business admin and refunds paid subscription charges', async () => {
      const usersService = {
        findById: jest.fn().mockResolvedValue({
          id: 'business-admin-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
          isApproved: false,
          isVerified: true,
          isActive: true,
          deletedAt: null,
          tenantId: 'tenant-1',
        }),
        setActiveStatus: jest.fn().mockResolvedValue({
          id: 'business-admin-1',
          isApproved: false,
          isVerified: true,
          isActive: false,
        }),
      };
      const prisma = {
        tenantSubscription: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'subscription-1',
            paymentStatus: PaymentStatus.PAID,
            status: SubscriptionStatus.ACTIVE,
            packagePlan: {
              billingModel: 'PLAN',
              planPrice: { greaterThan: () => true },
              trialDays: 0,
            },
          }),
        },
      };
      const paymentsService = {
        refundTenantSubscriptionForRejection: jest.fn().mockResolvedValue({
          subscriptionId: 'subscription-1',
          refunded: true,
          refunds: [
            {
              sourcePaymentTransactionId: 'payment-1',
              refundTransactionId: 'refund-1',
              amount: 1200,
              currency: 'PKR',
            },
          ],
          refundedAmount: 1200,
        }),
      };

      const service = new AdminUsersService(
        usersService as never,
        prisma as never,
        paymentsService as never,
      );

      const result = await service.rejectBusinessAdmin(
        {
          uid: 'super-admin-1',
          role: UserRoleEnum.SUPER_ADMIN,
        } as never,
        'business-admin-1',
        { reason: 'Documents rejected' },
      );

      expect(
        paymentsService.refundTenantSubscriptionForRejection,
      ).toHaveBeenCalledWith({
        actorId: 'super-admin-1',
        subscriptionId: 'subscription-1',
        reason: 'Documents rejected',
      });
      expect(usersService.setActiveStatus).toHaveBeenCalledWith(
        'business-admin-1',
        false,
      );
      expect(result.message).toBe(
        'Business admin rejected and subscription payment refunded successfully',
      );
    });
  });
});
