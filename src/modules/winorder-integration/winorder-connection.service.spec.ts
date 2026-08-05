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
      }),
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
      passwordHash: 'stored-hash',
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

    await expect(service.authenticate('wo_user', 'secret')).resolves.toEqual({
      connectionId: 'connection-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
    });
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
