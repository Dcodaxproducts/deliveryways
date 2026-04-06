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

  it('returns populated restaurant details in customer app content', async () => {
    repository.findById.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      deletedAt: null,
      name: 'Demo Restaurant',
      slug: 'demo-restaurant',
      logoUrl: 'https://cdn.example.com/logo.png',
      coverImage: 'https://cdn.example.com/cover.png',
      tagline: 'Best food in town',
      bio: 'Longer restaurant bio',
      settings: {
        customerApp: {
          privacyPolicy: 'privacy',
          helpSupport: 'help',
          faqs: [{ question: 'Q1', answer: 'A1' }],
        },
      },
      supportContact: {
        email: 'support@example.com',
      },
    });

    const result = await service.customerAppContentFromContext({
      role: UserRoleEnum.CUSTOMER,
      rid: 'restaurant-1',
    } as never);

    expect(result.data.restaurant).toEqual({
      id: 'restaurant-1',
      name: 'Demo Restaurant',
      slug: 'demo-restaurant',
      logoUrl: 'https://cdn.example.com/logo.png',
      coverImage: 'https://cdn.example.com/cover.png',
      tagline: 'Best food in town',
      bio: 'Longer restaurant bio',
    });
    expect(result.data.privacyPolicy).toBe('privacy');
    expect(result.data.helpSupport).toBe('help');
    expect(result.data.faqs).toEqual([{ question: 'Q1', answer: 'A1' }]);
    expect(result.data.restaurantId).toBe('restaurant-1');
  });

  it('reads legacy top-level customer app content keys too', async () => {
    repository.findById.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      deletedAt: null,
      name: 'Demo Restaurant',
      slug: 'demo-restaurant',
      logoUrl: null,
      coverImage: null,
      tagline: null,
      bio: null,
      settings: {
        privacy_policy: 'Legacy privacy',
        help_support: 'Legacy help',
        faqs: [
          { question: '  Legacy Q  ', answer: '  Legacy A  ' },
          { question: '   ', answer: 'Ignored' },
        ],
      },
      supportContact: {
        email: 'support@example.com',
        phone: '1234567898',
      },
    });

    const result = await service.customerAppContentFromContext({
      role: UserRoleEnum.CUSTOMER,
      rid: 'restaurant-1',
    } as never);

    expect(result.data.privacyPolicy).toBe('Legacy privacy');
    expect(result.data.helpSupport).toBe('Legacy help');
    expect(result.data.faqs).toEqual([
      { question: 'Legacy Q', answer: 'Legacy A' },
    ]);
    expect(result.data.supportContact).toEqual({
      email: 'support@example.com',
      phone: '1234567898',
    });
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
