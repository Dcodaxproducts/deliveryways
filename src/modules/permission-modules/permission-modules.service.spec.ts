import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PermissionModulesService } from './permission-modules.service';

describe('PermissionModulesService', () => {
  const makeRepository = () => ({
    create: jest.fn(),
    findById: jest.fn(),
    findByAccessKey: jest.fn(),
    list: jest.fn(),
    listActiveByAccessKeys: jest.fn(),
    update: jest.fn(),
  });

  it('normalizes created permission modules for FE catalog use', async () => {
    const repository = makeRepository();
    repository.findByAccessKey.mockResolvedValue(null);
    repository.create.mockImplementation(
      (data: Prisma.PermissionModuleCreateInput) =>
        Promise.resolve({
          id: 'permission-module-1',
          ...data,
        }),
    );
    const service = new PermissionModulesService(repository as never);

    const result = await service.create({
      accessKey: ' Kitchen-Display ',
      name: ' Kitchen Display ',
      defaultActions: [' Read ', 'WRITE', 'read'],
      sortOrder: 10,
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        accessKey: 'kitchen-display',
        name: 'Kitchen Display',
        defaultActions: ['read', 'write'],
        sortOrder: 10,
        isActive: true,
      }),
    );
    expect(result.message).toBe('Permission module created successfully');
  });

  it('rejects role permissions for unknown modules', async () => {
    const repository = makeRepository();
    repository.listActiveByAccessKeys.mockResolvedValue([]);
    const service = new PermissionModulesService(repository as never);

    await expect(
      service.validateActivePermissions([
        { access: 'unknown-module', operations: ['read'] },
      ]),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects role permission actions outside module defaults', async () => {
    const repository = makeRepository();
    repository.listActiveByAccessKeys.mockResolvedValue([
      { accessKey: 'reports', defaultActions: ['read'] },
    ]);
    const service = new PermissionModulesService(repository as never);

    await expect(
      service.validateActivePermissions([
        { access: 'reports', operations: ['write'] },
      ]),
    ).rejects.toThrow('Unsupported permission operation(s): reports:write');
  });
});
