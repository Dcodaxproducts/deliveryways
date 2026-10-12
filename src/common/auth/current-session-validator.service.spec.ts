import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRoleEnum } from '../enums';
import { AuthUserContext } from '../decorators';
import { CurrentSessionValidator } from './current-session-validator.service';
import { getRequiredJwtAccessSecret } from './jwt-access-secret';

describe('CurrentSessionValidator', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    staffUser: { findUnique: jest.fn() },
    deliveryman: { findUnique: jest.fn() },
    branch: { findFirst: jest.fn() },
  };
  const validator = new CurrentSessionValidator(prisma as never);
  const baseUser: AuthUserContext = {
    uid: 'user-1',
    actorType: 'USER',
    role: UserRoleEnum.CUSTOMER,
    tid: 'tenant-1',
    rid: 'restaurant-1',
    bid: 'branch-1',
    ver: 3,
  };
  const validUser = {
    deletedAt: null,
    deleteAfter: null,
    role: UserRoleEnum.CUSTOMER,
    tenantId: 'tenant-1',
    restaurantId: 'restaurant-1',
    branchId: 'branch-1',
    authVersion: 3,
    isActive: true,
  };
  const staffUser: AuthUserContext = {
    uid: 'staff-1',
    actorType: 'STAFF',
    role: UserRoleEnum.STAFF,
    tid: 'tenant-1',
    rid: 'restaurant-1',
    bid: 'branch-1',
    ownerUserId: 'owner-1',
    staffRoleId: 'role-1',
    panelType: 'RESTAURANT',
    accountType: 'STANDARD',
    ver: 5,
  };
  const validStaff = {
    authVersion: 5,
    deletedAt: null,
    isActive: true,
    tenantId: 'tenant-1',
    restaurantId: 'restaurant-1',
    branchId: 'branch-1',
    ownerUserId: 'owner-1',
    staffRoleId: 'role-1',
    panelType: 'RESTAURANT',
    accountType: 'STANDARD',
    staffRole: { isActive: true, deletedAt: null },
  };
  const deliverymanUser: AuthUserContext = {
    uid: 'deliveryman-1',
    actorType: 'DELIVERYMAN',
    role: 'DELIVERYMAN',
    tid: 'tenant-1',
    rid: 'restaurant-1',
    bid: 'branch-1',
    ver: 7,
  };
  const validDeliveryman = {
    authVersion: 7,
    deletedAt: null,
    isActive: true,
    tenantId: 'tenant-1',
    restaurantId: 'restaurant-1',
    branchId: 'branch-1',
  };

  beforeEach(() => jest.clearAllMocks());

  it('rejects an authVersion mismatch', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...validUser,
      authVersion: 4,
    });
    await expect(
      validator.assertCurrentSession(baseUser),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each([
    ['user', baseUser, prisma.user.findUnique, validUser],
    ['staff', staffUser, prisma.staffUser.findUnique, validStaff],
    [
      'deliveryman',
      deliverymanUser,
      prisma.deliveryman.findUnique,
      validDeliveryman,
    ],
  ])('rejects a disabled %s', async (_name, user, query, record) => {
    query.mockResolvedValue({ ...record, isActive: false });
    await expect(validator.assertCurrentSession(user)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it.each([
    ['user', baseUser, prisma.user.findUnique, validUser],
    ['staff', staffUser, prisma.staffUser.findUnique, validStaff],
    [
      'deliveryman',
      deliverymanUser,
      prisma.deliveryman.findUnique,
      validDeliveryman,
    ],
  ])('rejects a deleted %s', async (_name, user, query, record) => {
    query.mockResolvedValue({ ...record, deletedAt: new Date('2026-01-01') });
    await expect(validator.assertCurrentSession(user)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects token scope after the database scope changes', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...validUser,
      branchId: 'branch-2',
    });
    await expect(
      validator.assertCurrentSession(baseUser),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects staff assigned to an inactive role', async () => {
    prisma.staffUser.findUnique.mockResolvedValue({
      ...validStaff,
      staffRole: { isActive: false, deletedAt: null },
    });
    await expect(
      validator.assertCurrentSession(staffUser),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects branch admins assigned to a deleted branch', async () => {
    const branchAdmin = {
      ...baseUser,
      role: UserRoleEnum.BRANCH_ADMIN,
    };
    prisma.user.findUnique.mockResolvedValue({
      ...validUser,
      role: UserRoleEnum.BRANCH_ADMIN,
    });
    prisma.branch.findFirst.mockResolvedValue({
      deletedAt: new Date('2026-01-01'),
    });
    await expect(
      validator.assertCurrentSession(branchAdmin),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('getRequiredJwtAccessSecret', () => {
  it('fails startup configuration when JWT_ACCESS_SECRET is missing', () => {
    const config = { get: jest.fn().mockReturnValue(undefined) };
    expect(() =>
      getRequiredJwtAccessSecret(config as unknown as ConfigService),
    ).toThrow('JWT_ACCESS_SECRET is required');
  });
});
