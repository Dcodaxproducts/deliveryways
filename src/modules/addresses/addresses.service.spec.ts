import { ForbiddenException } from '@nestjs/common';
import { AddressesService } from './addresses.service';

describe('AddressesService', () => {
  const makeService = () => {
    const addressesRepository = {
      create: jest.fn(),
      listForUser: jest.fn(),
      findUserAddressById: jest.fn(),
      findActiveCustomer: jest.fn(),
      findActiveBranch: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    };

    const profilesRepository = {
      findByUserId: jest.fn(),
      upsertMetadata: jest.fn(),
    };

    const service = new AddressesService(
      addressesRepository as never,
      profilesRepository as never,
    );

    return { service, addressesRepository, profilesRepository };
  };

  it('sets first created address as default when none exists', async () => {
    const { service, addressesRepository, profilesRepository } = makeService();
    profilesRepository.findByUserId.mockResolvedValue(null);
    addressesRepository.create.mockResolvedValue({ id: 'address-1' });

    const result = await service.create(
      {
        uid: 'user-1',
        tid: 'tenant-1',
        role: 'CUSTOMER',
      } as never,
      {
        street: 'Street 1',
        city: 'Lahore',
        state: 'Punjab',
        country: 'Pakistan',
        lat: '31.5204',
        lng: '74.3587',
      },
    );

    expect(profilesRepository.upsertMetadata).toHaveBeenCalledWith('user-1', {
      defaultAddressId: 'address-1',
    });
    expect(result.data.isDefault).toBe(true);
  });

  it('marks listed addresses with isDefault flag', async () => {
    const { service, addressesRepository, profilesRepository } = makeService();
    profilesRepository.findByUserId.mockResolvedValue({
      metadata: { defaultAddressId: 'address-2' },
    });
    addressesRepository.listForUser.mockResolvedValue({
      items: [{ id: 'address-1' }, { id: 'address-2' }],
      total: 2,
    });

    const result = await service.list(
      {
        uid: 'user-1',
        tid: 'tenant-1',
        role: 'CUSTOMER',
      } as never,
      {
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      },
    );

    expect(result.data).toEqual([
      { id: 'address-1', isDefault: false },
      { id: 'address-2', isDefault: true },
    ]);
  });

  it('allows business admin to fetch customer addresses by customerId', async () => {
    const { service, addressesRepository, profilesRepository } = makeService();
    addressesRepository.findActiveCustomer.mockResolvedValue({
      id: 'customer-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
    });
    profilesRepository.findByUserId.mockResolvedValue({
      metadata: { defaultAddressId: 'address-2' },
    });
    addressesRepository.listForUser.mockResolvedValue({
      items: [{ id: 'address-1' }, { id: 'address-2' }],
      total: 2,
    });

    const result = await service.list(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        role: 'BUSINESS_ADMIN',
      } as never,
      {
        customerId: 'customer-1',
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'DESC',
      },
    );

    expect(addressesRepository.findActiveCustomer).toHaveBeenCalledWith(
      'customer-1',
      'tenant-1',
    );
    expect(addressesRepository.listForUser).toHaveBeenCalledWith(
      'tenant-1',
      'customer-1',
      expect.objectContaining({ customerId: 'customer-1' }),
    );
    expect(result.data[1]).toEqual({ id: 'address-2', isDefault: true });
  });

  it('enforces optional branch scope for business admin customer address fetch', async () => {
    const { service, addressesRepository } = makeService();
    addressesRepository.findActiveCustomer.mockResolvedValue({
      id: 'customer-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
    });
    addressesRepository.findActiveBranch.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-2',
    });

    await expect(
      service.list(
        {
          uid: 'admin-1',
          tid: 'tenant-1',
          role: 'BUSINESS_ADMIN',
        } as never,
        {
          customerId: 'customer-1',
          branchId: 'branch-1',
          page: 1,
          limit: 10,
          sortBy: 'createdAt',
          sortOrder: 'DESC',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('clears defaultAddressId when deleting the default address', async () => {
    const { service, addressesRepository, profilesRepository } = makeService();
    profilesRepository.findByUserId.mockResolvedValue({
      metadata: { defaultAddressId: 'address-1' },
    });
    addressesRepository.findUserAddressById.mockResolvedValue({
      id: 'address-1',
    });
    addressesRepository.softDelete.mockResolvedValue({ id: 'address-1' });

    await service.remove(
      {
        uid: 'user-1',
        tid: 'tenant-1',
        role: 'CUSTOMER',
      } as never,
      'address-1',
    );

    expect(profilesRepository.upsertMetadata).toHaveBeenCalledWith('user-1', {
      defaultAddressId: null,
    });
  });
});
