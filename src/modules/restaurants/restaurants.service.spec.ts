import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRoleEnum } from '../../common/enums';
import { RestaurantsRepository } from './restaurants.repository';
import { RestaurantsService } from './restaurants.service';
import { TenantsService } from '../tenants/tenants.service';
import { StorageService } from '../storage/storage.service';
import { GlobalSettingsService } from '../global-settings/global-settings.service';

describe('RestaurantsService notification settings', () => {
  let service: RestaurantsService;
  let repository: {
    create: jest.Mock;
    findBySlug: jest.Mock;
    findBySubdomain: jest.Mock;
    findByCustomDomain: jest.Mock;
    findById: jest.Mock;
    findFirstByTenantId: jest.Mock;
    listByTenant: jest.Mock;
    update: jest.Mock<
      Promise<unknown>,
      [string, Record<string, unknown>, unknown?]
    >;
  };

  beforeEach(async () => {
    repository = {
      create: jest.fn(),
      findBySlug: jest.fn(),
      findBySubdomain: jest.fn(),
      findByCustomDomain: jest.fn(),
      findById: jest.fn(),
      findFirstByTenantId: jest.fn(),
      listByTenant: jest.fn(),
      update: jest.fn<
        Promise<unknown>,
        [string, Record<string, unknown>, unknown?]
      >(),
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
        {
          provide: StorageService,
          useValue: {
            resolveViewUrl: jest.fn(
              (value: string | null | undefined) => value ?? null,
            ),
            resolveMediaUrlsDeep: jest.fn(<T>(value: T) => value),
          },
        },
        {
          provide: GlobalSettingsService,
          useValue: {
            getDefaultCurrencyCode: jest.fn().mockResolvedValue('PKR'),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(RestaurantsService);
  });

  it('generates unique immutable slug and subdomain values from the name', async () => {
    repository.findBySlug
      .mockResolvedValueOnce({ id: 'existing', slug: 'burger-house' })
      .mockResolvedValueOnce(null);
    repository.findBySubdomain
      .mockResolvedValueOnce({ id: 'existing', subdomain: 'burger-house' })
      .mockResolvedValueOnce(null);
    repository.findByCustomDomain.mockResolvedValue(null);
    repository.create.mockImplementation((data: unknown) => data);

    const result = await service.create('tenant-1', {
      name: 'Burger House!',
      customDomain: 'Orders.BurgerHouse.COM.',
    });

    expect(result).toEqual(
      expect.objectContaining({
        name: 'Burger House!',
        slug: 'burger-house-2',
        subdomain: 'burger-house-2',
        customDomain: 'orders.burgerhouse.com',
      }),
    );
  });

  it('does not change slug or subdomain when the restaurant name changes', async () => {
    repository.findById.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      name: 'Old Name',
      slug: 'old-name',
      subdomain: 'old-name',
      deletedAt: null,
    });
    repository.update.mockResolvedValue({ id: 'restaurant-1' });

    await service.update(
      {
        uid: 'business-admin-1',
        tid: 'tenant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      } as never,
      'restaurant-1',
      { name: 'New Name' },
    );

    expect(repository.update).toHaveBeenCalledWith(
      'restaurant-1',
      expect.any(Object),
      undefined,
    );
    expect(repository.update.mock.calls[0]?.[1]).not.toHaveProperty('slug');
    expect(repository.update.mock.calls[0]?.[1]).not.toHaveProperty(
      'subdomain',
    );
  });

  it('rejects a custom domain assigned to another restaurant', async () => {
    repository.findById.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      deletedAt: null,
    });
    repository.findByCustomDomain.mockResolvedValue({
      id: 'restaurant-2',
      customDomain: 'orders.example.com',
    });

    await expect(
      service.update(
        {
          uid: 'business-admin-1',
          tid: 'tenant-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
        } as never,
        'restaurant-1',
        { customDomain: 'Orders.Example.com' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('filters STAFF restaurant lists to assigned restaurantAccess ids', async () => {
    repository.listByTenant.mockResolvedValue({
      items: [
        {
          id: 'restaurant-1',
          tenantId: 'tenant-1',
          deletedAt: null,
          isActive: true,
          settings: null,
        },
      ],
      total: 1,
    });

    const query = {
      page: 1,
      limit: 10,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
    };

    const result = await service.list(
      {
        uid: 'staff-1',
        role: UserRoleEnum.STAFF,
        actorType: 'STAFF',
        tid: null,
        rid: null,
        restaurantAccess: {
          restaurantIds: ['restaurant-1'],
          branchIds: [],
        },
      } as never,
      query as never,
    );

    expect(repository.listByTenant).toHaveBeenCalledWith(
      undefined,
      query,
      false,
      false,
      false,
      ['restaurant-1'],
    );
    expect(result.data).toHaveLength(1);
  });

  it('allows STAFF restaurant details only for assigned restaurants', async () => {
    repository.findById.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      deletedAt: null,
      isActive: true,
      settings: null,
    });

    await expect(
      service.details(
        {
          uid: 'staff-1',
          role: UserRoleEnum.STAFF,
          actorType: 'STAFF',
          restaurantAccess: {
            restaurantIds: ['restaurant-1'],
            branchIds: [],
          },
        } as never,
        'restaurant-1',
      ),
    ).resolves.toMatchObject({ message: 'Restaurant fetched successfully' });

    repository.findById.mockResolvedValue({
      id: 'restaurant-2',
      tenantId: 'tenant-1',
      deletedAt: null,
      isActive: true,
      settings: null,
    });

    await expect(
      service.details(
        {
          uid: 'staff-1',
          role: UserRoleEnum.STAFF,
          actorType: 'STAFF',
          restaurantAccess: {
            restaurantIds: ['restaurant-1'],
            branchIds: [],
          },
        } as never,
        'restaurant-2',
      ),
    ).rejects.toThrow(
      'You cannot access resources outside your assigned restaurants',
    );
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
          aboutUs: '<p>Family-owned restaurant since 2020.</p>',
          allergenPdfUrl: 'https://cdn.example.com/allergens.pdf',
          faqs: [
            {
              id: 'faq-1',
              question: 'Q1',
              answer: 'A1',
              category: 'Orders',
              status: 'PUBLISHED',
              visibility: 'PUBLIC',
            },
          ],
        },
      },
      supportContact: {
        email: 'support@example.com',
      },
      branding: {
        primaryColor: '#FF0000',
        secondaryColor: '#000000',
        fontFamily: 'Inter',
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
    expect(result.data.aboutUs).toBe(
      '<p>Family-owned restaurant since 2020.</p>',
    );
    expect(result.data.allergenPdfUrl).toBe(
      'https://cdn.example.com/allergens.pdf',
    );
    expect(result.data.faqCategories).toEqual([
      'Orders',
      'Delivery',
      'Payments',
      'Policy',
    ]);
    expect(result.data.faqs).toEqual([
      {
        id: 'faq-1',
        question: 'Q1',
        answer: 'A1',
        category: 'Orders',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        createdByUserId: null,
        createdAt: null,
        updatedAt: null,
      },
    ]);
    expect(result.data.restaurantId).toBe('restaurant-1');
    expect(result.data.config).toEqual({
      currency: 'PKR',
      branding: {
        primaryColor: '#FF0000',
        secondaryColor: '#000000',
        fontFamily: 'Inter',
      },
    });
  });

  it('uses global customer app currency config when restaurant settings include another currency', async () => {
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
        customerApp: {
          currency: 'AED',
        },
      },
      supportContact: null,
    });

    const result = await service.customerAppContentFromContext({
      role: UserRoleEnum.CUSTOMER,
      rid: 'restaurant-1',
    } as never);

    expect(result.data.config).toEqual({ currency: 'PKR', branding: {} });
  });

  it('updates restaurant legal profile without replacing other settings', async () => {
    repository.findById.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      deletedAt: null,
      settings: {
        customerApp: {
          privacyPolicy: 'Privacy text',
        },
        legalProfile: {
          legalBusinessName: 'Old Legal Name',
        },
      },
    });
    repository.update.mockResolvedValue({
      id: 'restaurant-1',
      settings: {
        customerApp: {
          privacyPolicy: 'Privacy text',
        },
        legalProfile: {
          legalBusinessName: 'DeliveryWays Kitchen LLC',
          ownerName: 'Ali Khan',
          taxNumber: 'VAT-123',
          businessAddress: {
            city: 'Lahore',
            country: 'Pakistan',
          },
          contractText: 'Contract terms',
        },
      },
    });

    const result = await service.updateLegalProfile(
      {
        role: UserRoleEnum.BUSINESS_ADMIN,
        tid: 'tenant-1',
        rid: 'restaurant-1',
      } as never,
      'restaurant-1',
      {
        ownerName: 'Ali Khan',
        legalBusinessName: 'DeliveryWays Kitchen LLC',
        taxNumber: 'VAT-123',
        businessAddress: {
          city: 'Lahore',
          country: 'Pakistan',
        },
        contractText: 'Contract terms',
      },
    );

    expect(repository.update).toHaveBeenCalledWith(
      'restaurant-1',
      {
        settings: {
          customerApp: {
            privacyPolicy: 'Privacy text',
          },
          legalProfile: {
            legalBusinessName: 'DeliveryWays Kitchen LLC',
            ownerName: 'Ali Khan',
            taxNumber: 'VAT-123',
            businessAddress: {
              city: 'Lahore',
              country: 'Pakistan',
            },
            contractText: 'Contract terms',
          },
        },
      },
      undefined,
    );
    expect(result.data.legalProfile).toEqual({
      ownerName: 'Ali Khan',
      legalBusinessName: 'DeliveryWays Kitchen LLC',
      taxNumber: 'VAT-123',
      businessAddress: {
        city: 'Lahore',
        country: 'Pakistan',
        shopNumber: null,
      },
      contractText: 'Contract terms',
    });
  });

  it('returns restaurant legal profile with legacy billing tax fallback', async () => {
    repository.findById.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      deletedAt: null,
      settings: {
        billing: {
          ownerName: 'Billing Owner',
          legalBusinessName: 'Billing Legal Name',
          taxNumber: 'VAT-456',
          businessAddress: {
            city: 'Karachi',
          },
        },
        customerApp: {
          contractText: 'Legacy contract',
        },
      },
    });

    const result = await service.legalProfile(
      {
        role: UserRoleEnum.BRANCH_ADMIN,
        tid: 'tenant-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
      } as never,
      'restaurant-1',
    );

    expect(result.data.legalProfile).toEqual({
      ownerName: 'Billing Owner',
      legalBusinessName: 'Billing Legal Name',
      taxNumber: 'VAT-456',
      businessAddress: {
        city: 'Karachi',
        shopNumber: null,
      },
      contractText: 'Legacy contract',
    });
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
        about_us: 'Legacy about',
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
    expect(result.data.aboutUs).toBe('Legacy about');
    expect(result.data.faqs).toEqual([
      {
        id: 'legacy:0',
        question: 'Legacy Q',
        answer: 'Legacy A',
        category: null,
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        createdByUserId: null,
        createdAt: null,
        updatedAt: null,
      },
    ]);
    expect(result.data.supportContact).toEqual({
      email: 'support@example.com',
      phone: '1234567898',
    });
  });

  it('updates restaurant-managed about us content without replacing other customer content', async () => {
    repository.findById.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      deletedAt: null,
      settings: {
        customerApp: {
          privacyPolicy: 'Privacy text',
          helpSupport: 'Help text',
        },
      },
      supportContact: null,
    });
    repository.update.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      deletedAt: null,
      name: 'Demo Restaurant',
      slug: null,
      logoUrl: null,
      coverImage: null,
      tagline: null,
      bio: null,
      settings: {
        customerApp: {
          privacyPolicy: 'Privacy text',
          helpSupport: 'Help text',
          aboutUs: '<p>About the restaurant</p>',
        },
      },
      supportContact: null,
    });

    const result = await service.updateCustomerAppContent(
      {
        role: UserRoleEnum.BUSINESS_ADMIN,
        tid: 'tenant-1',
        rid: 'restaurant-1',
      } as never,
      'restaurant-1',
      { aboutUs: '<p>About the restaurant</p>' },
    );

    expect(repository.update).toHaveBeenCalledWith(
      'restaurant-1',
      {
        settings: {
          customerApp: {
            privacyPolicy: 'Privacy text',
            helpSupport: 'Help text',
            aboutUs: '<p>About the restaurant</p>',
          },
        },
        supportContact: undefined,
      },
      undefined,
    );
    expect(result.data.aboutUs).toBe('<p>About the restaurant</p>');
  });

  it('allows branch admins to fetch restaurant customer app content for their restaurant', async () => {
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
      settings: {},
      supportContact: null,
      branding: {
        primaryColor: '#FF0000',
        secondaryColor: '#000000',
        fontFamily: 'Inter',
      },
    });

    const result = await service.customerAppContent(
      {
        role: UserRoleEnum.BRANCH_ADMIN,
        tid: 'tenant-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
      } as never,
      'restaurant-1',
    );

    expect(result.data.config.branding).toEqual({
      primaryColor: '#FF0000',
      secondaryColor: '#000000',
      fontFamily: 'Inter',
    });
  });

  it('blocks branch admins from fetching another restaurant customer app content', async () => {
    repository.findById
      .mockResolvedValueOnce({
        id: 'restaurant-2',
        tenantId: 'tenant-1',
        deletedAt: null,
        settings: {},
        supportContact: null,
      })
      .mockResolvedValueOnce({
        id: 'restaurant-2',
        tenantId: 'tenant-1',
        deletedAt: null,
      });

    await expect(
      service.customerAppContent(
        {
          role: UserRoleEnum.BRANCH_ADMIN,
          tid: 'tenant-1',
          rid: 'restaurant-1',
          bid: 'branch-1',
        } as never,
        'restaurant-2',
      ),
    ).rejects.toThrow('You cannot access resources outside your restaurant');
  });

  it('lists categorized customer app faqs for admins', async () => {
    repository.findById.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      deletedAt: null,
      settings: {
        customerApp: {
          faqs: [
            {
              id: 'faq-1',
              question: 'How do refunds work?',
              answer: 'Refunds are processed within 5 business days.',
              category: 'Payments',
              status: 'DRAFT',
              visibility: 'AUTHENTICATED',
              createdByUserId: 'admin-1',
              createdAt: '2026-04-20T10:00:00.000Z',
              updatedAt: '2026-04-20T10:05:00.000Z',
            },
          ],
        },
      },
    });

    const result = await service.customerAppFaqs(
      {
        role: UserRoleEnum.BUSINESS_ADMIN,
        tid: 'tenant-1',
        rid: 'restaurant-1',
      } as never,
      'restaurant-1',
    );

    expect(result.data.categories).toEqual([
      'Orders',
      'Delivery',
      'Payments',
      'Policy',
    ]);
    expect(result.data.items).toHaveLength(1);
    expect(result.data.items[0].category).toBe('Payments');
    expect(result.data.items[0].status).toBe('DRAFT');
  });

  it('allows business admin faq access when token rid is null but restaurant belongs to same tenant', async () => {
    repository.findById.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      deletedAt: null,
      settings: {
        customerApp: {
          faqs: [],
        },
      },
    });

    const result = await service.customerAppFaqs(
      {
        role: UserRoleEnum.BUSINESS_ADMIN,
        tid: 'tenant-1',
        rid: null,
      } as never,
      'restaurant-1',
    );

    expect(result.data.restaurantId).toBe('restaurant-1');
    expect(repository.findById).toHaveBeenCalledWith('restaurant-1');
  });

  it('creates a structured faq entry', async () => {
    repository.findById.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      deletedAt: null,
      settings: { customerApp: { faqs: [] } },
    });
    repository.update.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      deletedAt: null,
      settings: {},
    });

    const result = await service.createCustomerAppFaq(
      {
        uid: 'admin-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
        tid: 'tenant-1',
        rid: 'restaurant-1',
      } as never,
      'restaurant-1',
      {
        question: ' How do I track my order? ',
        category: 'Orders',
        answer: ' Use the live order screen. ',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
      },
    );

    expect(repository.update).toHaveBeenCalled();
    expect(result.data.question).toBe('How do I track my order?');
    expect(result.data.answer).toBe('Use the live order screen.');
    expect(result.data.category).toBe('Orders');
    expect(result.data.createdByUserId).toBe('admin-1');
  });

  it('updates an existing structured faq entry', async () => {
    repository.findById.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      deletedAt: null,
      settings: {
        customerApp: {
          faqs: [
            {
              id: 'faq-1',
              question: 'Old question',
              answer: 'Old answer',
              category: 'Orders',
              status: 'DRAFT',
              visibility: 'PUBLIC',
              createdByUserId: 'admin-1',
              createdAt: '2026-04-20T10:00:00.000Z',
              updatedAt: '2026-04-20T10:00:00.000Z',
            },
          ],
        },
      },
    });
    repository.update.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      deletedAt: null,
      settings: {},
    });

    const result = await service.updateCustomerAppFaq(
      {
        role: UserRoleEnum.BUSINESS_ADMIN,
        tid: 'tenant-1',
        rid: 'restaurant-1',
      } as never,
      'restaurant-1',
      'faq-1',
      {
        answer: 'Updated answer',
        status: 'PUBLISHED',
      },
    );

    expect(result.data.id).toBe('faq-1');
    expect(result.data.answer).toBe('Updated answer');
    expect(result.data.status).toBe('PUBLISHED');
  });

  it('removes a faq entry', async () => {
    repository.findById.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      deletedAt: null,
      settings: {
        customerApp: {
          faqs: [
            {
              id: 'faq-1',
              question: 'Question',
              answer: 'Answer',
              category: 'Orders',
              status: 'PUBLISHED',
              visibility: 'PUBLIC',
            },
          ],
        },
      },
    });
    repository.update.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      deletedAt: null,
      settings: {},
    });

    const result = await service.removeCustomerAppFaq(
      {
        role: UserRoleEnum.BUSINESS_ADMIN,
        tid: 'tenant-1',
        rid: 'restaurant-1',
      } as never,
      'restaurant-1',
      'faq-1',
    );

    expect(result.data).toEqual({ id: 'faq-1' });
    expect(repository.update).toHaveBeenCalled();
  });

  it('normalizes invalid media placeholders in customer app content output', async () => {
    repository.findById.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      deletedAt: null,
      name: 'Demo Restaurant',
      slug: 'demo-restaurant',
      logoUrl: '[object Object]',
      coverImage: ' undefined ',
      tagline: null,
      bio: null,
      settings: {},
      supportContact: null,
    });

    const result = await service.customerAppContentFromContext({
      role: UserRoleEnum.CUSTOMER,
      rid: 'restaurant-1',
    } as never);

    expect(result.data.restaurant.logoUrl).toBeNull();
    expect(result.data.restaurant.coverImage).toBeNull();
  });

  it('normalizes invalid media placeholders before restaurant updates', async () => {
    repository.update.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      deletedAt: null,
      settings: null,
    });

    await service.updateImages(
      {
        role: UserRoleEnum.BUSINESS_ADMIN,
        tid: 'tenant-1',
        rid: 'restaurant-1',
      } as never,
      'restaurant-1',
      {
        logoUrl: '[object Object]',
        coverImage: ' https://cdn.example.com/cover.png ',
      },
    );

    expect(repository.update).toHaveBeenCalledWith(
      'restaurant-1',
      {
        logoUrl: null,
        coverImage: 'https://cdn.example.com/cover.png',
      },
      undefined,
    );
  });

  it('returns notification settings from tenant restaurant settings json', async () => {
    repository.findFirstByTenantId.mockResolvedValue({
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

    const result = await service.notificationSettings({
      role: UserRoleEnum.BUSINESS_ADMIN,
      tid: 'tenant-1',
    } as never);

    expect(repository.findFirstByTenantId).toHaveBeenCalledWith('tenant-1');
    expect(result.data).toEqual({
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
    repository.findFirstByTenantId.mockResolvedValue({
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
    repository.findFirstByTenantId.mockResolvedValue({
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
        {
          notificationTypes: {
            newOrder: { email: true },
          },
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires tenant context for notification settings', async () => {
    await expect(
      service.notificationSettings({
        role: UserRoleEnum.SUPER_ADMIN,
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws when tenant has no restaurant for notification settings', async () => {
    repository.findFirstByTenantId.mockResolvedValue(null);

    await expect(
      service.notificationSettings({
        role: UserRoleEnum.BUSINESS_ADMIN,
        tid: 'tenant-1',
      } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows super admin to update restaurant service charge', async () => {
    repository.findById.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      deletedAt: null,
      logoUrl: null,
      coverImage: null,
      isActive: true,
      settings: null,
    });
    repository.update.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      deletedAt: null,
      logoUrl: null,
      coverImage: null,
      isActive: true,
      settings: {
        serviceCharge: { isEnabled: true, type: 'PERCENTAGE', value: 7.5 },
      },
    });

    const result = await service.updateServiceCharge(
      { uid: 'super-1', role: UserRoleEnum.SUPER_ADMIN } as never,
      'restaurant-1',
      { isEnabled: true, type: 'PERCENTAGE', value: 7.5 },
    );

    expect(repository.update).toHaveBeenCalledWith(
      'restaurant-1',
      {
        settings: {
          serviceCharge: {
            isEnabled: true,
            type: 'PERCENTAGE',
            value: 7.5,
          },
        },
      },
      undefined,
    );
    expect(result.data.serviceCharge).toEqual({
      isEnabled: true,
      type: 'PERCENTAGE',
      value: 7.5,
    });
  });

  it('prevents business admin from overwriting restaurant service charge through generic settings update', async () => {
    repository.findById.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      deletedAt: null,
      logoUrl: null,
      coverImage: null,
      isActive: true,
      settings: {
        legalProfile: {
          legalBusinessName: 'Protected Legal Name',
          taxNumber: 'VAT-123',
        },
        serviceCharge: { isEnabled: true, type: 'PERCENTAGE', value: 5 },
      },
    });
    repository.update.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      deletedAt: null,
      logoUrl: null,
      coverImage: null,
      isActive: true,
      settings: {
        branding: { theme: 'dark' },
        legalProfile: {
          legalBusinessName: 'Protected Legal Name',
          taxNumber: 'VAT-123',
        },
        serviceCharge: { isEnabled: true, type: 'PERCENTAGE', value: 5 },
      },
    });

    await service.update(
      {
        uid: 'business-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
        tid: 'tenant-1',
        rid: 'restaurant-1',
      } as never,
      'restaurant-1',
      {
        settings: {
          branding: { theme: 'dark' },
          legalProfile: {},
          serviceCharge: { isEnabled: false, type: 'AMOUNT', value: 0 },
        },
      },
    );

    const [, updateData, tx] = repository.update.mock.calls[0] as [
      string,
      { settings: Record<string, unknown> },
      undefined,
    ];

    expect(updateData.settings).toMatchObject({
      branding: { theme: 'dark' },
      legalProfile: {
        legalBusinessName: 'Protected Legal Name',
        taxNumber: 'VAT-123',
      },
      serviceCharge: { isEnabled: true, type: 'PERCENTAGE', value: 5 },
    });
    expect(updateData.settings).not.toHaveProperty('transactionFee');
    expect(tx).toBeUndefined();
  });

  it('prevents super admin from replacing legal profile through generic settings update', async () => {
    repository.findById.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      deletedAt: null,
      logoUrl: null,
      coverImage: null,
      isActive: true,
      settings: {
        legalProfile: {
          legalBusinessName: 'Protected Legal Name',
          taxNumber: 'VAT-123',
          contractText: 'Protected agreement',
        },
        customerApp: { giftCardsEnabled: false },
      },
    });
    repository.update.mockResolvedValue({
      id: 'restaurant-1',
      tenantId: 'tenant-1',
      deletedAt: null,
      logoUrl: null,
      coverImage: null,
      isActive: true,
      settings: {
        legalProfile: {
          legalBusinessName: 'Protected Legal Name',
          taxNumber: 'VAT-123',
          contractText: 'Protected agreement',
        },
        customerApp: { giftCardsEnabled: true },
      },
    });

    await service.update(
      {
        uid: 'super-admin-1',
        role: UserRoleEnum.SUPER_ADMIN,
      } as never,
      'restaurant-1',
      {
        settings: {
          legalProfile: null,
          customerApp: { giftCardsEnabled: true },
        },
      },
    );

    const [, updateData] = repository.update.mock.calls[0] as [
      string,
      { settings: Record<string, unknown> },
      undefined,
    ];

    expect(updateData.settings).toMatchObject({
      legalProfile: {
        legalBusinessName: 'Protected Legal Name',
        taxNumber: 'VAT-123',
        contractText: 'Protected agreement',
      },
      customerApp: { giftCardsEnabled: true },
    });
  });
});
