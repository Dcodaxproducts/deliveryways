import { AddressesService } from './addresses.service';

describe('AddressesService', () => {
  const makeService = () => {
    const addressesRepository = {
      create: jest.fn(),
      listForUser: jest.fn(),
      findUserAddressById: jest.fn(),
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
