import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StaffAccountType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UserRoleEnum } from '../../common/enums';
import { PosPrinterRepository } from './pos-printer.repository';
import { PosPrinterService } from './pos-printer.service';

describe('PosPrinterService security boundaries', () => {
  const repository = {
    findBranch: jest.fn(),
    findByEmail: jest.fn(),
    findByUsernameNormalized: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    list: jest.fn(),
    update: jest.fn(),
    deactivatePushTokens: jest.fn(),
  };
  const service = new PosPrinterService(
    repository as unknown as PosPrinterRepository,
  );
  const businessAdmin = {
    uid: 'owner-1',
    role: UserRoleEnum.BUSINESS_ADMIN,
    tid: 'tenant-1',
  };
  const branchAdmin = {
    uid: 'branch-owner-1',
    role: UserRoleEnum.BRANCH_ADMIN,
    tid: 'tenant-1',
    rid: 'restaurant-1',
    bid: 'branch-1',
  };
  const dto = {
    email: 'printer@example.com',
    password: 'Password@123',
    firstName: 'POS',
    lastName: 'Printer',
    branchId: 'branch-1',
  };
  const account = {
    id: 'printer-1',
    ownerUserId: 'owner-1',
    email: dto.email,
    username: null,
    displayName: 'POS Printer',
    firstName: 'POS',
    lastName: 'Printer',
    accountType: StaffAccountType.POS_PRINTER,
    tenantId: 'tenant-1',
    restaurantId: 'restaurant-1',
    branchId: 'branch-1',
    isActive: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    branch: { id: 'branch-1', name: 'Main' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findByEmail.mockResolvedValue(null);
    repository.findByUsernameNormalized.mockResolvedValue(null);
    repository.findBranch.mockResolvedValue({
      id: 'branch-1',
      name: 'Main',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
    });
    repository.create.mockResolvedValue(account);
    repository.findById.mockResolvedValue(account);
    repository.update.mockResolvedValue(account);
    repository.deactivatePushTokens.mockResolvedValue({ count: 1 });
    repository.list.mockResolvedValue([account]);
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hash' as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it('normalizes a globally unique username and persists display name', async () => {
    await service.create(businessAdmin, {
      username: 'Front.Counter',
      displayName: 'Front Counter Printer',
      password: 'Password@123',
      branchId: 'branch-1',
    });

    expect(repository.findByUsernameNormalized).toHaveBeenCalledWith(
      'front.counter',
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'Front.Counter',
        usernameNormalized: 'front.counter',
        displayName: 'Front Counter Printer',
      }),
    );
  });

  it('rejects provisioning across tenant boundaries', async () => {
    repository.findBranch.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-2',
      restaurantId: 'restaurant-2',
    });
    await expect(service.create(businessAdmin, dto)).rejects.toThrow(
      ForbiddenException,
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects branch admins crossing restaurant or branch scope', async () => {
    repository.findBranch.mockResolvedValue({
      id: 'branch-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-2',
    });
    await expect(
      service.create(branchAdmin, { ...dto, branchId: undefined }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects owner lifecycle actions against another owner account', async () => {
    repository.findById.mockResolvedValue({
      ...account,
      ownerUserId: 'owner-2',
    });
    await expect(
      service.updateStatus(businessAdmin, 'printer-1', { isActive: false }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('revokes refresh and access sessions on deactivation', async () => {
    await service.updateStatus(businessAdmin, 'printer-1', { isActive: false });
    expect(repository.update).toHaveBeenCalledWith('printer-1', {
      isActive: false,
      refreshTokenHash: null,
      authVersion: { increment: 1 },
    });
  });

  it('revokes refresh and access sessions on owner password reset', async () => {
    await service.resetPassword(businessAdmin, 'printer-1', {
      newPassword: 'AnotherPassword@123',
    });
    expect(repository.update).toHaveBeenCalledWith(
      'printer-1',
      expect.objectContaining({
        password: 'hash',
        plainPassword: null,
        refreshTokenHash: null,
        authVersion: { increment: 1 },
      }),
    );
  });

  it('treats a soft-deleted email as a controlled conflict', async () => {
    repository.findByEmail.mockResolvedValue({
      id: 'deleted-printer',
      deletedAt: new Date(),
    });
    await expect(service.create(businessAdmin, dto)).rejects.toThrow(
      ConflictException,
    );
  });

  it('converts a concurrent email unique race into a controlled conflict', async () => {
    repository.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique race', {
        code: 'P2002',
        clientVersion: '7.4.2',
      }),
    );
    await expect(service.create(businessAdmin, dto)).rejects.toThrow(
      ConflictException,
    );
  });

  it('does not expose out-of-scope accounts as missing lifecycle targets', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(
      service.resetPassword(businessAdmin, 'missing', {
        newPassword: 'AnotherPassword@123',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
