import { Test } from '@nestjs/testing';
import { PaymentMethod, Prisma } from '@prisma/client';
import { UserRoleEnum } from '../../common/enums';
import { GlobalSettingsRepository } from './global-settings.repository';
import {
  GlobalSettingsService,
  PaymentMethodSettingsShape,
} from './global-settings.service';

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

  beforeEach(async () => {
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
    expect(result).toEqual({
      data: {
        scopeKey: 'GLOBAL',
        defaultCurrency: 'PKR',
        paymentMethods: [
          {
            code: PaymentMethod.COD,
            label: 'Cash on delivery',
            isActive: true,
          },
          {
            code: PaymentMethod.STRIPE,
            label: 'Stripe',
            isActive: false,
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
        notificationSettings: {
          emailAddress: null,
          phoneNumber: null,
          whatsappNumber: null,
          notificationTypes: {
            newOrder: { email: false, sms: false, whatsapp: false },
            orderCancelled: { email: false, sms: false, whatsapp: false },
            printerError: { email: false, sms: false, whatsapp: false },
            dailyReport: { email: false, sms: false, whatsapp: false },
            payoutUpdate: { email: false, sms: false, whatsapp: false },
          },
        },
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
        globalTaxPercentage: 5,
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
      updatedBy: 'user-1',
    });
    expect(updateData.globalTaxPercentage).toBeInstanceOf(Prisma.Decimal);
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
