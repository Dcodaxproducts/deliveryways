import { BadRequestException } from '@nestjs/common';
import { UserRoleEnum } from '../../common/enums';
import { AdminImportsService } from './admin-imports.service';

describe('AdminImportsService', () => {
  const makeService = () => {
    const deliverymenService = {
      create: jest.fn().mockResolvedValue({
        data: {
          id: 'deliveryman-1',
          email: 'ali.rider@example.com',
        },
      }),
    };
    const staffManagementService = {
      create: jest.fn().mockResolvedValue({
        data: {
          id: 'staff-1',
          email: 'staff@example.com',
        },
      }),
    };
    const usersService = {
      findByEmailIncludingDeleted: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'customer-1',
        email: 'customer@example.com',
      }),
    };
    const prisma = {
      restaurant: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'restaurant-1',
          tenantId: 'tenant-1',
        }),
      },
      branch: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'branch-1',
        }),
      },
    };

    const service = new AdminImportsService(
      deliverymenService as never,
      staffManagementService as never,
      usersService as never,
      prisma as never,
    );

    return {
      service,
      deliverymenService,
      staffManagementService,
      usersService,
      prisma,
    };
  };

  it('imports deliverymen from uploaded CSV rows', async () => {
    const { service, deliverymenService } = makeService();
    const csv = [
      'restaurantId,branchId,firstName,lastName,email,phone,password,status',
      'restaurant-1,branch-1,Ali,Khan,ali.rider@example.com,+923001234567,Temp@12345,OFFLINE',
    ].join('\n');

    const result = await service.uploadCsv(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
        role: UserRoleEnum.BRANCH_ADMIN,
      },
      'deliverymen',
      {
        buffer: Buffer.from(csv),
        originalname: 'deliverymen.csv',
      },
    );

    expect(deliverymenService.create).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'admin-1' }),
      expect.objectContaining({
        branchId: 'branch-1',
        email: 'ali.rider@example.com',
      }),
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        type: 'deliverymen',
        totalRows: 1,
        imported: 1,
        failed: 0,
      }),
    );
  });

  it('rejects unsupported import type', async () => {
    const { service } = makeService();

    await expect(
      service.uploadCsv(
        {
          uid: 'admin-1',
          tid: 'tenant-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
        },
        'menus',
        { buffer: Buffer.from('email\nx@example.com') },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
