import { Test } from '@nestjs/testing';
import { PaymentMethod, Prisma, ServiceChargeType } from '@prisma/client';
import { UserRoleEnum } from '../../common/enums';
import { StorageService } from '../storage/storage.service';
import { GlobalSettingsRepository } from './global-settings.repository';
import { DEFAULT_CUSTOMER_EMAIL_TEMPLATES } from './email-templates';
import {
  GlobalSettingsService,
  PaymentMethodSettingsShape,
} from './global-settings.service';

const emptyLandingPage = {
  hero: {
    eyebrowEn: null,
    eyebrowDe: null,
    headingEn: null,
    headingDe: null,
    subheadingEn: null,
    subheadingDe: null,
  },
  contentEn: null,
  contentDe: null,
};

const emptyLandingPages = {
  services: emptyLandingPage,
  pricing: emptyLandingPage,
  about: emptyLandingPage,
  privacyPolicy: emptyLandingPage,
  support: emptyLandingPage,
  termsOfService: emptyLandingPage,
  contact: emptyLandingPage,
};

const emptyLandingHomeBlock = {
  headingEn: null,
  headingDe: null,
  descriptionEn: null,
  descriptionDe: null,
  checklistEn: [],
  checklistDe: [],
  imageUrl: null,
  isVisible: true,
};

const emptyLandingHome = {
  hero: {
    badgeEn: null,
    badgeDe: null,
    headingEn: null,
    headingDe: null,
    subheadingEn: null,
    subheadingDe: null,
    imageUrl: null,
    primaryCtaEn: null,
    primaryCtaDe: null,
    primaryCtaUrl: null,
    secondaryCtaEn: null,
    secondaryCtaDe: null,
    secondaryCtaUrl: null,
  },
  featuredRestaurants: {
    headingEn: null,
    headingDe: null,
    restaurantIds: [],
    isVisible: true,
  },
  growth: emptyLandingHomeBlock,
  orderManagement: emptyLandingHomeBlock,
  appDownload: {
    headingEn: null,
    headingDe: null,
    descriptionEn: null,
    descriptionDe: null,
    backgroundImageUrl: null,
    googlePlayUrl: null,
    appStoreUrl: null,
    isVisible: true,
  },
};

describe('GlobalSettingsService', () => {
  let service: GlobalSettingsService;
  let repositoryImpl: {
    ensureSingleton: (
      data: Prisma.GlobalSettingCreateInput,
    ) => Promise<unknown>;
    updateSingleton: (
      update: Prisma.GlobalSettingUpdateInput,
      create: Prisma.GlobalSettingCreateInput,
    ) => Promise<unknown>;
  };
  let ensureSingletonSpy: jest.SpiedFunction<
    typeof repositoryImpl.ensureSingleton
  >;
  let updateSingletonSpy: jest.SpiedFunction<
    typeof repositoryImpl.updateSingleton
  >;
  const resolveViewUrl = jest.fn();

  beforeEach(async () => {
    resolveViewUrl.mockReset();
    resolveViewUrl.mockImplementation((url: string | null | undefined) =>
      Promise.resolve(url ?? null),
    );
    repositoryImpl = {
      ensureSingleton(data: Prisma.GlobalSettingCreateInput) {
        return Promise.resolve(data);
      },
      updateSingleton(
        _update: Prisma.GlobalSettingUpdateInput,
        create: Prisma.GlobalSettingCreateInput,
      ) {
        return Promise.resolve(create);
      },
    };

    ensureSingletonSpy = jest.spyOn(repositoryImpl, 'ensureSingleton');
    updateSingletonSpy = jest.spyOn(repositoryImpl, 'updateSingleton');

    const moduleRef = await Test.createTestingModule({
      providers: [
        GlobalSettingsService,
        {
          provide: GlobalSettingsRepository,
          useValue: repositoryImpl,
        },
        {
          provide: StorageService,
          useValue: { resolveViewUrl },
        },
      ],
    }).compile();

    service = moduleRef.get(GlobalSettingsService);
  });

  it('creates/returns singleton settings on get', async () => {
    ensureSingletonSpy.mockResolvedValue({
      scopeKey: 'GLOBAL',
      defaultCurrency: 'PKR',
      notificationSettings: null,
    });

    const result = await service.getSettings();

    expect(ensureSingletonSpy).toHaveBeenCalledTimes(1);
    expect(ensureSingletonSpy).toHaveBeenCalledWith(
      expect.objectContaining({ defaultLanguage: 'de' }),
    );
    expect(result).toEqual({
      data: {
        scopeKey: 'GLOBAL',
        defaultCurrency: 'PKR',
        landingPageSettings: {
          businessName: 'DeliveryWay',
          logoUrl: null,
          footerDescription: null,
          supportEmail: null,
          supportPhone: null,
          address: null,
          copyrightText: `© ${new Date().getFullYear()} DeliveryWay. All rights reserved.`,
          socialLinks: {
            facebook: null,
            twitter: null,
            instagram: null,
            youtube: null,
          },
          home: emptyLandingHome,
          pages: emptyLandingPages,
          faqs: [],
        },
        paymentMethods: [
          {
            code: PaymentMethod.COD,
            label: 'Cash on delivery',
            isActive: true,
          },
          {
            code: PaymentMethod.CARD_ON_DELIVERY,
            label: 'Card on delivery',
            isActive: true,
          },
          {
            code: PaymentMethod.STRIPE,
            label: 'Stripe',
            isActive: false,
          },
          {
            code: PaymentMethod.PAYPAL,
            label: 'PayPal',
            isActive: true,
          },
          {
            code: PaymentMethod.EASYPAISA,
            label: 'Easypaisa',
            isActive: false,
          },
          {
            code: PaymentMethod.JAZZCASH,
            label: 'JazzCash',
            isActive: false,
          },
          {
            code: PaymentMethod.BANK_TRANSFER,
            label: 'Bank transfer',
            isActive: false,
          },
          {
            code: PaymentMethod.WALLET,
            label: 'Wallet',
            isActive: true,
          },
        ],
        serviceCharge: {
          configScope: 'RESTAURANT',
          message:
            'Service charge is configured per restaurant by super admin.',
        },
        transactionFee: {
          configScope: 'GLOBAL',
          message: 'Transaction fee is configured at platform/global level.',
        },
        notificationSettings: {
          emailAddress: null,
          phoneNumber: null,
          whatsappNumber: null,
          emailTemplates: DEFAULT_CUSTOMER_EMAIL_TEMPLATES,
          notificationTypes: {
            newOrder: { email: false, sms: false, whatsapp: false },
            orderCancelled: { email: false, sms: false, whatsapp: false },
            printerError: { email: false, sms: false, whatsapp: false },
            dailyReport: { email: false, sms: false, whatsapp: false },
            payoutUpdate: { email: false, sms: false, whatsapp: false },
          },
        },
        taxTypes: [
          {
            code: 'STANDARD',
            label: 'Standard tax',
            percentage: 0,
            isActive: true,
            isDefault: true,
          },
          {
            code: 'REDUCED',
            label: 'Reduced tax',
            percentage: 0,
            isActive: true,
            isDefault: false,
          },
          {
            code: 'ZERO',
            label: 'Zero tax',
            percentage: 0,
            isActive: true,
            isDefault: false,
          },
        ],
      },
      message: 'Global settings fetched successfully',
    });
  });

  it('normalizes and updates singleton settings', async () => {
    ensureSingletonSpy.mockResolvedValue({
      scopeKey: 'GLOBAL',
      notificationSettings: {
        emailAddress: 'old@example.com',
        phoneNumber: '+923001234567',
        whatsappNumber: null,
        notificationTypes: {
          newOrder: { email: true, sms: false, whatsapp: false },
          orderCancelled: { email: false, sms: false, whatsapp: false },
          printerError: { email: false, sms: false, whatsapp: false },
          dailyReport: { email: false, sms: false, whatsapp: false },
          payoutUpdate: { email: false, sms: false, whatsapp: false },
        },
      },
    });
    updateSingletonSpy.mockResolvedValue({
      scopeKey: 'GLOBAL',
      defaultCurrency: 'USD',
      primaryColor: '#FF6B00',
      timezone: 'UTC',
      notificationSettings: {
        emailAddress: 'old@example.com',
        phoneNumber: '+923001234567',
        whatsappNumber: '+923009876543',
        notificationTypes: {
          newOrder: { email: true, sms: false, whatsapp: false },
          orderCancelled: { email: false, sms: false, whatsapp: true },
          printerError: { email: false, sms: false, whatsapp: false },
          dailyReport: { email: false, sms: false, whatsapp: false },
          payoutUpdate: { email: false, sms: false, whatsapp: false },
        },
      },
    });

    await service.updateSettings(
      { uid: 'user-1', role: UserRoleEnum.SUPER_ADMIN },
      {
        defaultCurrency: 'usd',
        primaryColor: '#ff6b00',
        timezone: 'UTC',
        cartExpiryMinutes: 90,
        globalTaxPercentage: 5,
        serviceChargeEnabled: true,
        serviceChargeType: ServiceChargeType.PERCENTAGE,
        serviceChargeValue: 8.5,
        notificationSettings: {
          whatsappNumber: '+923009876543',
          notificationTypes: {
            orderCancelled: { whatsapp: true },
          },
        },
      },
    );

    expect(ensureSingletonSpy).toHaveBeenCalledTimes(1);
    expect(updateSingletonSpy).toHaveBeenCalledTimes(1);
    const [updateData, createData] = updateSingletonSpy.mock.calls[0];

    expect(updateData).toMatchObject({
      defaultCurrency: 'USD',
      primaryColor: '#FF6B00',
      timezone: 'UTC',
      cartExpiryMinutes: 90,
      updatedBy: 'user-1',
    });
    expect(updateData.globalTaxPercentage).toBeInstanceOf(Prisma.Decimal);
    expect(updateData).not.toHaveProperty('serviceChargeEnabled');
    expect(updateData).not.toHaveProperty('serviceChargeType');
    expect(updateData).not.toHaveProperty('serviceChargeValue');
    expect(updateData).toMatchObject({
      notificationSettings: {
        emailAddress: 'old@example.com',
        phoneNumber: '+923001234567',
        whatsappNumber: '+923009876543',
        notificationTypes: {
          newOrder: { email: true, sms: false, whatsapp: false },
          orderCancelled: { email: false, sms: false, whatsapp: true },
          printerError: { email: false, sms: false, whatsapp: false },
          dailyReport: { email: false, sms: false, whatsapp: false },
          payoutUpdate: { email: false, sms: false, whatsapp: false },
        },
      },
    });
    expect(createData).toMatchObject({
      scopeKey: 'GLOBAL',
      createdBy: 'user-1',
      updatedBy: 'user-1',
      defaultCurrency: 'USD',
      primaryColor: '#FF6B00',
      timezone: 'UTC',
      cartExpiryMinutes: 90,
    });
    expect(createData).toMatchObject({
      serviceChargeEnabled: false,
      serviceChargeType: ServiceChargeType.PERCENTAGE,
    });
    expect(createData.serviceChargeValue).toEqual(new Prisma.Decimal(0));
  });

  it('returns configured cart expiry minutes', async () => {
    ensureSingletonSpy.mockResolvedValue({
      scopeKey: 'GLOBAL',
      cartExpiryMinutes: 45,
    });

    await expect(service.getCartExpiryMinutes()).resolves.toBe(45);
  });

  it('returns public landing-page settings with safe defaults', async () => {
    resolveViewUrl.mockResolvedValue('https://signed.example.com/logo.png');
    ensureSingletonSpy.mockResolvedValue({
      scopeKey: 'GLOBAL',
      landingPageSettings: {
        businessName: 'DeliveryWay Germany',
        logoUrl: 'https://cdn.example.com/logo.png',
        socialLinks: { instagram: 'https://instagram.com/deliveryway' },
        faqs: [
          {
            id: 'faq-second',
            questionEn: 'Second?',
            answerEn: 'Second.',
            questionDe: 'Zweite?',
            answerDe: 'Zweite.',
            isActive: false,
            sortOrder: 2,
          },
          {
            id: 'faq-first',
            questionEn: 'First?',
            answerEn: 'First.',
            questionDe: 'Erste?',
            answerDe: 'Erste.',
            isActive: true,
            sortOrder: 1,
          },
        ],
      },
    });

    await expect(service.getPublicLandingPageSettings()).resolves.toEqual({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: expect.objectContaining({
        businessName: 'DeliveryWay Germany',
        logoUrl: 'https://signed.example.com/logo.png',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        socialLinks: expect.objectContaining({
          instagram: 'https://instagram.com/deliveryway',
          facebook: null,
        }),
        faqs: [expect.objectContaining({ id: 'faq-first', isActive: true })],
      }),
      message: 'Landing page settings fetched successfully',
    });
    expect(resolveViewUrl).toHaveBeenCalledWith(
      'https://cdn.example.com/logo.png',
    );
  });

  it('merges landing-page settings without clearing unspecified values', async () => {
    ensureSingletonSpy.mockResolvedValue({
      scopeKey: 'GLOBAL',
      notificationSettings: null,
      paymentMethods: null,
      taxTypes: null,
      landingPageSettings: {
        businessName: 'DeliveryWay',
        supportEmail: 'old@example.com',
        socialLinks: { facebook: 'https://facebook.com/old' },
        faqs: [
          {
            id: 'existing',
            questionEn: 'Existing?',
            answerEn: 'Existing.',
            questionDe: 'Bestehend?',
            answerDe: 'Bestehend.',
            isActive: true,
            sortOrder: 0,
          },
        ],
      },
    });

    await service.updateSettings(
      { uid: 'admin-1', role: UserRoleEnum.SUPER_ADMIN },
      {
        landingPageSettings: {
          supportEmail: 'new@example.com',
          socialLinks: { instagram: 'https://instagram.com/new' },
        },
      },
    );

    const [update] = updateSingletonSpy.mock.calls[0];
    expect(update).toMatchObject({
      landingPageSettings: {
        businessName: 'DeliveryWay',
        supportEmail: 'new@example.com',
        socialLinks: {
          facebook: 'https://facebook.com/old',
          instagram: 'https://instagram.com/new',
        },
        pages: emptyLandingPages,
        faqs: [
          {
            id: 'existing',
            questionEn: 'Existing?',
            answerEn: 'Existing.',
            questionDe: 'Bestehend?',
            answerDe: 'Bestehend.',
            isActive: true,
            sortOrder: 0,
          },
        ],
      },
    });
  });

  it('merges managed homepage sections without clearing sibling fields', async () => {
    ensureSingletonSpy.mockResolvedValue({
      scopeKey: 'GLOBAL',
      landingPageSettings: {
        home: {
          hero: {
            headingEn: 'Run your restaurant from one place',
            headingDe: 'Verwalten Sie Ihr Restaurant zentral',
          },
          featuredRestaurants: {
            headingEn: 'Featured restaurants',
            restaurantIds: ['restaurant-1'],
            isVisible: true,
          },
          growth: {
            headingEn: 'Grow faster',
            checklistEn: ['Manage orders'],
            isVisible: true,
          },
        },
      },
    });
    updateSingletonSpy.mockImplementation((update) =>
      Promise.resolve({
        scopeKey: 'GLOBAL',
        landingPageSettings: update.landingPageSettings,
      }),
    );

    const result = await service.updateLandingPageSettings(
      { uid: 'admin-1', role: UserRoleEnum.SUPER_ADMIN },
      {
        home: {
          hero: { subheadingEn: 'One platform for every order.' },
          featuredRestaurants: { restaurantIds: ['restaurant-2'] },
          growth: { isVisible: false },
        },
      },
    );

    expect(result.data.home.hero).toMatchObject({
      headingEn: 'Run your restaurant from one place',
      headingDe: 'Verwalten Sie Ihr Restaurant zentral',
      subheadingEn: 'One platform for every order.',
    });
    expect(result.data.home.featuredRestaurants).toMatchObject({
      headingEn: 'Featured restaurants',
      restaurantIds: ['restaurant-2'],
      isVisible: true,
    });
    expect(result.data.home.growth).toMatchObject({
      headingEn: 'Grow faster',
      checklistEn: ['Manage orders'],
      isVisible: false,
    });
  });

  it('updates bilingual landing pages and sanitizes rich text', async () => {
    ensureSingletonSpy.mockResolvedValue({
      scopeKey: 'GLOBAL',
      landingPageSettings: {
        supportEmail: 'old@example.com',
        pages: {
          about: {
            hero: { headingEn: 'Old heading' },
            contentEn: '<p>Old content</p>',
          },
        },
      },
    });
    updateSingletonSpy.mockImplementation((update) =>
      Promise.resolve({
        scopeKey: 'GLOBAL',
        landingPageSettings: update.landingPageSettings,
      }),
    );

    const result = await service.updateLandingPageSettings(
      { uid: 'admin-1', role: UserRoleEnum.SUPER_ADMIN },
      {
        pages: {
          about: {
            hero: {
              headingEn: 'About DeliveryWay',
              headingDe: 'Über DeliveryWay',
            },
            contentEn:
              '<h2 onclick="alert(1)">Story</h2><script>alert(1)</script>',
            contentDe: '<p>Unsere Geschichte</p>',
          },
        },
      },
    );

    const [update] = updateSingletonSpy.mock.calls[0];
    expect(update).toMatchObject({
      updatedBy: 'admin-1',
      landingPageSettings: {
        supportEmail: 'old@example.com',
        pages: {
          about: {
            hero: {
              headingEn: 'About DeliveryWay',
              headingDe: 'Über DeliveryWay',
            },
            contentEn: '<h2>Story</h2>',
            contentDe: '<p>Unsere Geschichte</p>',
          },
        },
      },
    });
    expect(result.data.pages.about.contentEn).toBe('<h2>Story</h2>');
  });

  it('keeps deprecated platform service charge config available for fallback reads', async () => {
    ensureSingletonSpy.mockResolvedValue({
      scopeKey: 'GLOBAL',
      serviceChargeEnabled: true,
      serviceChargeType: ServiceChargeType.PERCENTAGE,
      serviceChargeValue: new Prisma.Decimal(7.5),
    });

    await expect(service.getServiceChargeConfig()).resolves.toEqual({
      isEnabled: true,
      type: ServiceChargeType.PERCENTAGE,
      value: 7.5,
    });
  });

  it('returns platform payment methods with defaults and stored overrides', async () => {
    ensureSingletonSpy.mockResolvedValue({
      scopeKey: 'GLOBAL',
      paymentMethods: [
        {
          code: PaymentMethod.STRIPE,
          label: 'Card payment',
          isActive: true,
        },
      ],
    });

    const result = await service.getPaymentMethods();
    const paymentMethods = result.data;

    expect(paymentMethods).toContainEqual({
      code: PaymentMethod.COD,
      label: 'Cash on delivery',
      isActive: true,
    });
    expect(paymentMethods).toContainEqual({
      code: PaymentMethod.STRIPE,
      label: 'Card payment',
      isActive: true,
    });
    expect(result.message).toBe('Payment methods fetched successfully');
  });

  it('updates platform payment methods and rejects duplicate codes', async () => {
    ensureSingletonSpy.mockResolvedValue({
      scopeKey: 'GLOBAL',
      paymentMethods: null,
    });
    updateSingletonSpy.mockResolvedValue({
      scopeKey: 'GLOBAL',
      paymentMethods: [
        {
          code: PaymentMethod.COD,
          label: 'Pay cash',
          isActive: true,
        },
        {
          code: PaymentMethod.STRIPE,
          label: 'Stripe',
          isActive: true,
        },
      ],
    });

    await service.updatePaymentMethods(
      { uid: 'user-1', role: UserRoleEnum.SUPER_ADMIN },
      {
        paymentMethods: [
          {
            code: PaymentMethod.COD,
            label: 'Pay cash',
            isActive: true,
          },
          {
            code: PaymentMethod.STRIPE,
            isActive: true,
          },
        ],
      },
    );

    const [updateData] = updateSingletonSpy.mock.calls[0];
    const paymentMethods =
      updateData.paymentMethods as unknown as PaymentMethodSettingsShape[];

    expect(updateData.updatedBy).toBe('user-1');
    expect(paymentMethods).toContainEqual({
      code: PaymentMethod.COD,
      label: 'Pay cash',
      isActive: true,
    });
    expect(paymentMethods).toContainEqual({
      code: PaymentMethod.STRIPE,
      label: 'Stripe',
      isActive: true,
    });

    await expect(
      service.updatePaymentMethods(
        { uid: 'user-1', role: UserRoleEnum.SUPER_ADMIN },
        {
          paymentMethods: [
            {
              code: PaymentMethod.COD,
            },
            {
              code: PaymentMethod.COD,
            },
          ],
        },
      ),
    ).rejects.toThrow('Duplicate payment method code');
  });

  it('updates platform tax types and rejects duplicate codes', async () => {
    ensureSingletonSpy.mockResolvedValue({
      scopeKey: 'GLOBAL',
      globalTaxPercentage: new Prisma.Decimal(19),
      taxTypes: null,
    });

    await service.updateTaxTypes(
      { uid: 'user-1', role: UserRoleEnum.SUPER_ADMIN },
      {
        taxTypes: [
          {
            code: 'standard',
            label: 'Standard VAT',
            percentage: 19,
            isActive: true,
            isDefault: true,
          },
          {
            code: 'reduced',
            label: 'Reduced VAT',
            percentage: 7,
            isActive: true,
          },
        ],
      },
    );

    const [updateData] = updateSingletonSpy.mock.calls[0];
    expect(updateData.updatedBy).toBe('user-1');
    expect(updateData.taxTypes).toEqual([
      {
        code: 'STANDARD',
        label: 'Standard VAT',
        percentage: 19,
        isActive: true,
        isDefault: true,
      },
      {
        code: 'REDUCED',
        label: 'Reduced VAT',
        percentage: 7,
        isActive: true,
        isDefault: false,
      },
      {
        code: 'ZERO',
        label: 'Zero tax',
        percentage: 0,
        isActive: true,
        isDefault: false,
      },
    ]);

    await expect(
      service.updateTaxTypes(
        { uid: 'user-1', role: UserRoleEnum.SUPER_ADMIN },
        {
          taxTypes: [
            { code: 'standard', percentage: 19 },
            { code: 'STANDARD', percentage: 19 },
          ],
        },
      ),
    ).rejects.toThrow('Duplicate tax type code');
  });

  it('ignores deprecated global service charge update fields', async () => {
    ensureSingletonSpy.mockResolvedValue({
      scopeKey: 'GLOBAL',
      notificationSettings: null,
    });
    updateSingletonSpy.mockResolvedValue({ scopeKey: 'GLOBAL' });

    await service.updateSettings(
      { uid: 'user-1', role: UserRoleEnum.SUPER_ADMIN },
      {
        serviceChargeEnabled: true,
        serviceChargeType: ServiceChargeType.PERCENTAGE,
        serviceChargeValue: 101,
      },
    );

    const [updateData] = updateSingletonSpy.mock.calls[0];
    expect(updateData).not.toHaveProperty('serviceChargeEnabled');
    expect(updateData).not.toHaveProperty('serviceChargeType');
    expect(updateData).not.toHaveProperty('serviceChargeValue');
  });

  it('rejects notification channels without required contact values', async () => {
    ensureSingletonSpy.mockResolvedValue({
      scopeKey: 'GLOBAL',
      notificationSettings: null,
    });

    await expect(
      service.updateSettings(
        { uid: 'user-1', role: UserRoleEnum.SUPER_ADMIN },
        {
          notificationSettings: {
            notificationTypes: {
              newOrder: { email: true },
            },
          },
        },
      ),
    ).rejects.toThrow(
      'emailAddress is required when email notifications are selected',
    );
  });
});
