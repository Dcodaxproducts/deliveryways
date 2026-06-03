import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRoleEnum } from '../../common/enums';
import { LocalizationsRepository } from './localizations.repository';
import { LocalizationsService } from './localizations.service';

describe('LocalizationsService', () => {
  const makeService = () => {
    const repository = {
      findRestaurantScope: jest.fn(),
      findEntityScope: jest.fn(),
      upsert: jest.fn(),
      list: jest.fn(),
      deactivate: jest.fn(),
    };

    const service = new LocalizationsService(
      repository as unknown as LocalizationsRepository,
    );

    return { service, repository };
  };

  it('upserts only allowlisted translated fields', async () => {
    const { service, repository } = makeService();
    repository.findEntityScope.mockResolvedValue({
      id: 'item-1',
      restaurant: { tenantId: 'tenant-1' },
    });
    repository.upsert.mockResolvedValue({ id: 'translation-1' });

    await service.upsert(
      {
        uid: 'admin-1',
        role: UserRoleEnum.SUPER_ADMIN,
      },
      'menu_item',
      'item-1',
      'AR',
      {
        restaurantId: 'restaurant-1',
        fields: {
          name: ' برجر ',
          description: ' ',
          ingredients: null,
          basePrice: '1000',
        },
      },
    );

    expect(repository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        entityType: 'MENU_ITEM',
        entityId: 'item-1',
        locale: 'ar',
        fields: {
          name: 'برجر',
          ingredients: null,
        },
        isActive: true,
        userId: 'admin-1',
      }),
    );
  });

  it('rejects restaurant translations for a different restaurant id', async () => {
    const { service } = makeService();

    await expect(
      service.upsert(
        {
          uid: 'admin-1',
          role: UserRoleEnum.SUPER_ADMIN,
        },
        'RESTAURANT',
        'restaurant-2',
        'ar',
        {
          restaurantId: 'restaurant-1',
          fields: { name: 'Name' },
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects scoped admins outside their tenant restaurant', async () => {
    const { service, repository } = makeService();
    repository.findRestaurantScope.mockResolvedValue(null);

    await expect(
      service.upsert(
        {
          uid: 'admin-1',
          tid: 'tenant-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
        },
        'MENU_CATEGORY',
        'category-1',
        'ar',
        {
          restaurantId: 'restaurant-2',
          fields: { name: 'Category' },
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects payloads without supported fields', async () => {
    const { service, repository } = makeService();
    repository.findEntityScope.mockResolvedValue({
      id: 'item-1',
      restaurant: { tenantId: 'tenant-1' },
    });

    await expect(
      service.upsert(
        {
          uid: 'admin-1',
          role: UserRoleEnum.SUPER_ADMIN,
        },
        'MENU_ITEM',
        'item-1',
        'ar',
        {
          restaurantId: 'restaurant-1',
          fields: { basePrice: '1000' },
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
