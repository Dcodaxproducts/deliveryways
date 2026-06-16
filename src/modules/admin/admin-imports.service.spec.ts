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
    const couponsService = {
      create: jest.fn().mockResolvedValue({
        data: {
          id: 'coupon-1',
          code: 'SAVE20',
        },
      }),
    };
    const adminPromotionsService = {
      createPromotion: jest.fn().mockResolvedValue({
        data: {
          id: 'promotion-1',
          code: 'PROMO20',
        },
      }),
      createHappyHour: jest.fn().mockResolvedValue({
        data: {
          id: 'happy-hour-1',
          code: 'HAPPY50',
        },
      }),
    };

    const service = new AdminImportsService(
      deliverymenService as never,
      couponsService as never,
      adminPromotionsService as never,
    );

    return {
      service,
      deliverymenService,
      couponsService,
      adminPromotionsService,
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

  it('imports coupons from uploaded CSV rows', async () => {
    const { service, couponsService } = makeService();
    const csv = [
      'restaurantId,branchId,code,title,discountType,discountValue,startsAt,expiresAt',
      'restaurant-1,branch-1,SAVE20,Save 20,FLAT,20,2026-06-01T00:00:00.000Z,2026-06-30T23:59:59.000Z',
    ].join('\n');

    const result = await service.uploadCsv(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
        role: UserRoleEnum.BRANCH_ADMIN,
      },
      'coupons',
      {
        buffer: Buffer.from(csv),
        originalname: 'coupons.csv',
      },
    );

    expect(couponsService.create).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'admin-1' }),
      expect.objectContaining({
        code: 'SAVE20',
        discountType: 'FLAT',
        discountValue: 20,
      }),
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        type: 'coupons',
        totalRows: 1,
        imported: 1,
        failed: 0,
      }),
    );
  });

  it('imports promotions from uploaded CSV rows', async () => {
    const { service, adminPromotionsService } = makeService();
    const csv = [
      'restaurantId,title,discountType,discountValue,startsAt,expiresAt,scopeMenuItemIds,autoApply',
      'restaurant-1,Promo 20,PERCENTAGE,20,2026-06-01T00:00:00.000Z,2026-06-30T23:59:59.000Z,item-1|item-2,true',
    ].join('\n');

    await service.uploadCsv(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      'promotions',
      {
        buffer: Buffer.from(csv),
        originalname: 'promotions.csv',
      },
    );

    expect(adminPromotionsService.createPromotion).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'admin-1' }),
      expect.objectContaining({
        title: 'Promo 20',
        discountType: 'PERCENTAGE',
        scopeMenuItemIds: ['item-1', 'item-2'],
        autoApply: true,
      }),
    );
  });

  it('imports happy-hours from uploaded CSV rows', async () => {
    const { service, adminPromotionsService } = makeService();
    const csv = [
      'restaurantId,title,discountType,discountValue,startsAt,expiresAt,activeDays,dailyStartTime,dailyEndTime',
      'restaurant-1,Happy 50,PERCENTAGE,50,2026-06-01T00:00:00.000Z,2026-06-30T23:59:59.000Z,1|2|3,16:00,18:00',
    ].join('\n');

    await service.uploadCsv(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      'happy-hours',
      {
        buffer: Buffer.from(csv),
        originalname: 'happy-hours.csv',
      },
    );

    expect(adminPromotionsService.createHappyHour).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'admin-1' }),
      expect.objectContaining({
        title: 'Happy 50',
        activeDays: [1, 2, 3],
        dailyStartTime: '16:00',
        dailyEndTime: '18:00',
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
