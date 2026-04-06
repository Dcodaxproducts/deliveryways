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
          email: { enabled: true, emailAddress: 'ops@example.com' },
          sms: { enabled: false, phoneNumber: '+923001234567' },
          whatsapp: { enabled: true, phoneNumber: '+923009876543' },
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
      email: { enabled: true, emailAddress: 'ops@example.com' },
      sms: { enabled: false, phoneNumber: '+923001234567' },
      whatsapp: { enabled: true, phoneNumber: '+923009876543' },
    });
  });

  it('updates notification settings and preserves existing channels', async () => {
    repository.findById.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      deletedAt: null,
      settings: {
        notificationSettings: {
          email: { enabled: true, emailAddress: 'old@example.com' },
          sms: { enabled: false, phoneNumber: '+923001234567' },
        },
      },
    });
    repository.update.mockResolvedValue({
      id: 'restaurant-1',
      settings: {
        notificationSettings: {
          email: { enabled: true, emailAddress: 'ops@example.com' },
          sms: { enabled: false, phoneNumber: '+923001234567' },
          whatsapp: { enabled: true, phoneNumber: '+923009876543' },
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
        email: { emailAddress: 'ops@example.com' },
        whatsapp: { enabled: true, phoneNumber: '+923009876543' },
      },
    );

    expect(repository.update).toHaveBeenCalledWith(
      'restaurant-1',
      {
        settings: {
          notificationSettings: {
            email: { enabled: true, emailAddress: 'ops@example.com' },
            sms: { enabled: false, phoneNumber: '+923001234567' },
            whatsapp: { enabled: true, phoneNumber: '+923009876543' },
          },
        },
      },
      undefined,
    );
    expect(result.data.whatsapp).toEqual({
      enabled: true,
      phoneNumber: '+923009876543',
    });
  });

  it('rejects enabled email notifications without an email address', async () => {
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
          email: { enabled: true },
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
