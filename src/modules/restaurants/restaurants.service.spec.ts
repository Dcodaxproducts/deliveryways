import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRoleEnum } from '../../common/enums';
import { RestaurantsRepository } from './restaurants.repository';
import { RestaurantsService } from './restaurants.service';
import { TenantsService } from '../tenants/tenants.service';

describe('RestaurantsService notification settings', () => {
  let service: RestaurantsService;
  let repository: {
    findById: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(async () => {
    repository = {
      findById: jest.fn(),
      update: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        RestaurantsService,
        {
          provide: RestaurantsRepository,
          useValue: repository,
        },
        {
          provide: TenantsService,
          useValue: {
            findById: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(RestaurantsService);
  });

  it('returns notification settings from restaurant settings json', async () => {
    repository.findById.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      deletedAt: null,
      settings: {
        notificationSettings: {
          emailAddress: 'ops@example.com',
          phoneNumber: '+923001234567',
          whatsappNumber: '+923009876543',
          notificationTypes: {
            newOrder: { email: true, sms: true, whatsapp: false },
            orderCancelled: { email: true, sms: false, whatsapp: true },
            printerError: { email: true, sms: false, whatsapp: true },
            dailyReport: { email: true, sms: true, whatsapp: false },
            payoutUpdate: { email: true, sms: false, whatsapp: true },
          },
        },
      },
    });

    const result = await service.notificationSettings(
      {
        role: UserRoleEnum.BUSINESS_ADMIN,
        tid: 'tenant-1',
      } as never,
      'restaurant-1',
    );

    expect(result.data).toEqual({
      restaurantId: 'restaurant-1',
      emailAddress: 'ops@example.com',
      phoneNumber: '+923001234567',
      whatsappNumber: '+923009876543',
      notificationTypes: {
        newOrder: { email: true, sms: true, whatsapp: false },
        orderCancelled: { email: true, sms: false, whatsapp: true },
        printerError: { email: true, sms: false, whatsapp: true },
        dailyReport: { email: true, sms: true, whatsapp: false },
        payoutUpdate: { email: true, sms: false, whatsapp: true },
      },
    });
  });

  it('updates notification settings and preserves existing matrix values', async () => {
    repository.findById.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      deletedAt: null,
      settings: {
        notificationSettings: {
          emailAddress: 'old@example.com',
          phoneNumber: '+923001234567',
          notificationTypes: {
            newOrder: { email: true, sms: true, whatsapp: false },
            orderCancelled: { email: true, sms: false, whatsapp: false },
            printerError: { email: false, sms: false, whatsapp: false },
            dailyReport: { email: true, sms: false, whatsapp: false },
            payoutUpdate: { email: false, sms: false, whatsapp: false },
          },
        },
      },
    });
    repository.update.mockResolvedValue({
      id: 'restaurant-1',
      settings: {
        notificationSettings: {
          emailAddress: 'ops@example.com',
          phoneNumber: '+923001234567',
          whatsappNumber: '+923009876543',
          notificationTypes: {
            newOrder: { email: true, sms: true, whatsapp: false },
            orderCancelled: { email: true, sms: false, whatsapp: true },
            printerError: { email: false, sms: false, whatsapp: false },
            dailyReport: { email: true, sms: false, whatsapp: false },
            payoutUpdate: { email: false, sms: false, whatsapp: true },
          },
        },
      },
    });

    const result = await service.updateNotificationSettings(
      {
        role: UserRoleEnum.BUSINESS_ADMIN,
        tid: 'tenant-1',
      } as never,
      'restaurant-1',
      {
        emailAddress: 'ops@example.com',
        whatsappNumber: '+923009876543',
        notificationTypes: {
          orderCancelled: { whatsapp: true },
          payoutUpdate: { whatsapp: true },
        },
      },
    );

    expect(repository.update).toHaveBeenCalledWith(
      'restaurant-1',
      {
        settings: {
          notificationSettings: {
            emailAddress: 'ops@example.com',
            phoneNumber: '+923001234567',
            whatsappNumber: '+923009876543',
            notificationTypes: {
              newOrder: { email: true, sms: true, whatsapp: false },
              orderCancelled: { email: true, sms: false, whatsapp: true },
              printerError: { email: false, sms: false, whatsapp: false },
              dailyReport: { email: true, sms: false, whatsapp: false },
              payoutUpdate: { email: false, sms: false, whatsapp: true },
            },
          },
        },
      },
      undefined,
    );
    expect(result.data.notificationTypes.payoutUpdate).toEqual({
      email: false,
      sms: false,
      whatsapp: true,
    });
  });

  it('rejects email channel selection without an email address', async () => {
    repository.findById.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      deletedAt: null,
      settings: null,
    });

    await expect(
      service.updateNotificationSettings(
        {
          role: UserRoleEnum.BUSINESS_ADMIN,
          tid: 'tenant-1',
        } as never,
        'restaurant-1',
        {
          notificationTypes: {
            newOrder: { email: true },
          },
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks business admins from other tenants', async () => {
    repository.findById.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-2',
      deletedAt: null,
      settings: null,
    });

    await expect(
      service.notificationSettings(
        {
          role: UserRoleEnum.BUSINESS_ADMIN,
          tid: 'tenant-1',
        } as never,
        'restaurant-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
