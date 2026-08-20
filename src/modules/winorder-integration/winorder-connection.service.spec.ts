import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserRoleEnum } from '../../common/enums';
import { WinOrderConnectionService } from './winorder-connection.service';

describe('WinOrderConnectionService', () => {
  const makeService = () => {
    const repository = {
      findBranch: jest.fn(),
      findByBranch: jest.fn(),
      findAuthenticationRecord: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      rotate: jest.fn(),
    };
    return {
      service: new WinOrderConnectionService(repository as never),
      repository,
    };
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('allows a branch admin to read only its own connection', async () => {
    const { service, repository } = makeService();
    repository.findBranch.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      name: 'Main',
    });
    repository.findByBranch.mockResolvedValue({
      id: 'connection-1',
      branchId: 'branch-1',
      username: 'wo_user',
      storeId: 41,
      isEnabled: true,
    });

    const result = await service.get(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        bid: 'branch-1',
        role: UserRoleEnum.BRANCH_ADMIN,
      },
      'branch-1',
    );

    expect(result.data).toEqual(
      expect.objectContaining({
        username: 'wo_user',
        endpointPath: '/winorder',
        storeSpecificEndpointPath: '/winorder/41',
      }),
    );
  });

  it('allows scoped staff to read its assigned WinOrder connection', async () => {
    const { service, repository } = makeService();
    repository.findBranch.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      name: 'Main',
    });
    repository.findByBranch.mockResolvedValue({
      id: 'connection-1',
      branchId: 'branch-1',
      username: 'wo_user',
      storeId: 41,
      isEnabled: true,
    });

    await service.get(
      {
        uid: 'staff-1',
        tid: 'tenant-1',
        role: UserRoleEnum.STAFF,
        restaurantAccess: {
          restaurantIds: ['restaurant-1'],
          branchIds: ['branch-1'],
        },
      },
      'branch-1',
    );

    expect(repository.findByBranch).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 'branch-1' }),
    );
  });

  it('creates a fixed-endpoint connection without a Store ID', async () => {
    const { service, repository } = makeService();
    repository.findBranch.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      name: 'Main',
    });
    repository.findByBranch.mockResolvedValue(null);
    repository.create.mockResolvedValue({
      id: 'connection-1',
      branchId: 'branch-1',
      username: 'wo_user',
      storeId: null,
      isEnabled: true,
    });
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('stored-hash' as never);

    const result = await service.create(
      { uid: 'admin-1', role: UserRoleEnum.SUPER_ADMIN },
      { branchId: 'branch-1' },
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 'branch-1' }),
      expect.objectContaining({ storeId: null, actorId: 'admin-1' }),
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        endpointPath: '/winorder',
        storeSpecificEndpointPath: null,
      }),
    );
  });

  it('allows a business admin to create a connection for another restaurant in its tenant', async () => {
    const { service, repository } = makeService();
    repository.findBranch.mockResolvedValue({
      id: 'branch-2',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-2',
      name: 'Main',
    });
    repository.findByBranch.mockResolvedValue(null);
    repository.create.mockResolvedValue({
      id: 'connection-1',
      branchId: 'branch-2',
      username: 'wo_user',
      storeId: null,
      isEnabled: true,
    });
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('stored-hash' as never);

    await service.create(
      {
        uid: 'admin-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: UserRoleEnum.BUSINESS_ADMIN,
      },
      { branchId: 'branch-2' },
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-2',
        branchId: 'branch-2',
      }),
      expect.objectContaining({ actorId: 'admin-1' }),
    );
  });

  it('blocks a business admin from creating a connection outside its tenant', async () => {
    const { service, repository } = makeService();
    repository.findBranch.mockResolvedValue({
      id: 'branch-2',
      tenantId: 'tenant-2',
      restaurantId: 'restaurant-2',
      name: 'Main',
    });

    await expect(
      service.create(
        {
          uid: 'admin-1',
          tid: 'tenant-1',
          rid: 'restaurant-1',
          role: UserRoleEnum.BUSINESS_ADMIN,
        },
        { branchId: 'branch-2' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('allows an optional Store ID to be cleared', async () => {
    const { service, repository } = makeService();
    repository.findBranch.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      name: 'Main',
    });
    repository.findByBranch.mockResolvedValue({
      id: 'connection-1',
      branchId: 'branch-1',
      username: 'wo_user',
      storeId: null,
      isEnabled: true,
    });

    await service.update(
      { uid: 'admin-1', role: UserRoleEnum.SUPER_ADMIN },
      'branch-1',
      { storeId: null },
    );

    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 'branch-1' }),
      expect.objectContaining({ storeId: null, actorId: 'admin-1' }),
    );
  });

  it('blocks branch-admin credential mutation', async () => {
    const { service, repository } = makeService();
    repository.findBranch.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      name: 'Main',
    });

    await expect(
      service.rotate(
        {
          uid: 'admin-1',
          tid: 'tenant-1',
          bid: 'branch-1',
          role: UserRoleEnum.BRANCH_ADMIN,
        },
        'branch-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns only scoped machine context for valid credentials', async () => {
    const { service, repository } = makeService();
    repository.findAuthenticationRecord.mockResolvedValue({
      id: 'connection-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      storeId: 41,
      passwordHash: 'stored-hash',
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

    await expect(service.authenticate('wo_user', 'secret')).resolves.toEqual({
      connectionId: 'connection-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      storeId: 41,
    });
  });

  it('accepts a matching store-specific machine route', () => {
    const { service } = makeService();

    expect(() =>
      service.assertStoreRoute(
        {
          connectionId: 'connection-1',
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          branchId: 'branch-1',
          storeId: 41,
        },
        41,
      ),
    ).not.toThrow();
  });

  it('rejects a store-specific route for another authenticated store', () => {
    const { service } = makeService();

    expect(() =>
      service.assertStoreRoute(
        {
          connectionId: 'connection-1',
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          branchId: 'branch-1',
          storeId: 41,
        },
        99,
      ),
    ).toThrow(UnauthorizedException);
  });

  it('keeps the legacy machine route available during migration', () => {
    const { service } = makeService();

    expect(() =>
      service.assertStoreRoute({
        connectionId: 'connection-1',
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
        storeId: null,
      }),
    ).not.toThrow();
  });

  it('uses a generic error for unknown credentials', async () => {
    const { service, repository } = makeService();
    repository.findAuthenticationRecord.mockResolvedValue(null);
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

    await expect(
      service.authenticate('unknown', 'wrong'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
