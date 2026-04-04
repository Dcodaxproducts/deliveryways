import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { UserRoleEnum } from '../../common/enums';
import { GlobalSettingsRepository } from './global-settings.repository';
import { GlobalSettingsService } from './global-settings.service';

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
    });

    const result = await service.getSettings();

    expect(ensureSingletonSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      data: {
        scopeKey: 'GLOBAL',
        defaultCurrency: 'PKR',
      },
      message: 'Global settings fetched successfully',
    });
  });

  it('normalizes and updates singleton settings', async () => {
    updateSingletonSpy.mockResolvedValue({
      scopeKey: 'GLOBAL',
      defaultCurrency: 'USD',
      primaryColor: '#FF6B00',
      timezone: 'UTC',
    });

    await service.updateSettings(
      { uid: 'user-1', role: UserRoleEnum.SUPER_ADMIN },
      {
        defaultCurrency: 'usd',
        primaryColor: '#ff6b00',
        timezone: 'UTC',
        globalTaxPercentage: 5,
      },
    );

    expect(updateSingletonSpy).toHaveBeenCalledTimes(1);
    const [updateData, createData] = updateSingletonSpy.mock.calls[0];

    expect(updateData).toMatchObject({
      defaultCurrency: 'USD',
      primaryColor: '#FF6B00',
      timezone: 'UTC',
      updatedBy: 'user-1',
    });
    expect(updateData.globalTaxPercentage).toBeInstanceOf(Prisma.Decimal);
    expect(createData).toMatchObject({
      scopeKey: 'GLOBAL',
      createdBy: 'user-1',
      updatedBy: 'user-1',
      defaultCurrency: 'USD',
      primaryColor: '#FF6B00',
      timezone: 'UTC',
    });
  });
});
