import { ExecutionContext, RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { RolesEnum } from '../enums';
import { RolesGuard } from './roles.guard';

type TestUser = { uid?: string; role?: string; actorType?: string };

type PrismaMock = {
  staffUser: {
    findUnique: jest.Mock;
  };
};

describe('RolesGuard staff role permissions', () => {
  const handler = function handler() {};
  const controller = function controller() {};

  const createGuard = ({
    roles,
    controllerPath,
    handlerPath,
    method,
    prisma,
  }: {
    roles: RolesEnum[];
    controllerPath: string;
    handlerPath?: string;
    method: RequestMethod;
    prisma: PrismaMock;
  }) => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(roles),
      get: jest.fn((key: string, target: Function) => {
        if (key === PATH_METADATA && target === controller) {
          return controllerPath;
        }
        if (key === PATH_METADATA && target === handler) {
          return handlerPath ?? '';
        }
        if (key === METHOD_METADATA && target === handler) {
          return method;
        }
        return undefined;
      }),
    } as unknown as Reflector;

    return new RolesGuard(reflector, prisma as never);
  };

  const createContext = (user: TestUser): ExecutionContext =>
    ({
      getHandler: () => handler,
      getClass: () => controller,
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  const activeStaffRole = (permissions: Array<{ access: string; operations: string[] }>) => ({
    isActive: true,
    deletedAt: null,
    staffRole: {
      isActive: true,
      deletedAt: null,
      permissions,
    },
  });

  it('keeps existing direct role access behavior', async () => {
    const prisma: PrismaMock = { staffUser: { findUnique: jest.fn() } };
    const guard = createGuard({
      roles: [RolesEnum.BUSINESS_ADMIN],
      controllerPath: 'restaurants',
      method: RequestMethod.GET,
      prisma,
    });

    await expect(
      guard.canActivate(createContext({ uid: 'business-1', role: RolesEnum.BUSINESS_ADMIN })),
    ).resolves.toBe(true);
    expect(prisma.staffUser.findUnique).not.toHaveBeenCalled();
  });

  it('allows STAFF to read dashboard stats with dashboard permission', async () => {
    const prisma: PrismaMock = {
      staffUser: {
        findUnique: jest.fn().mockResolvedValue(
          activeStaffRole([{ access: 'dashboard', operations: ['read'] }]),
        ),
      },
    };
    const guard = createGuard({
      roles: [RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN],
      controllerPath: 'admin/dashboard',
      handlerPath: 'orders/stats',
      method: RequestMethod.GET,
      prisma,
    });

    await expect(
      guard.canActivate(createContext({ uid: 'staff-1', role: RolesEnum.STAFF })),
    ).resolves.toBe(true);
  });

  it('allows STAFF to read global settings with settings permission', async () => {
    const prisma: PrismaMock = {
      staffUser: {
        findUnique: jest.fn().mockResolvedValue(
          activeStaffRole([{ access: 'settings', operations: ['read'] }]),
        ),
      },
    };
    const guard = createGuard({
      roles: [RolesEnum.SUPER_ADMIN],
      controllerPath: 'admin/global-settings',
      method: RequestMethod.GET,
      prisma,
    });

    await expect(
      guard.canActivate(createContext({ uid: 'staff-1', role: RolesEnum.STAFF })),
    ).resolves.toBe(true);
  });

  it('allows STAFF to read restaurants with dashboard permission for dashboard data dependencies', async () => {
    const prisma: PrismaMock = {
      staffUser: {
        findUnique: jest.fn().mockResolvedValue(
          activeStaffRole([{ access: 'dashboard', operations: ['read'] }]),
        ),
      },
    };
    const guard = createGuard({
      roles: [RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN],
      controllerPath: 'restaurants',
      method: RequestMethod.GET,
      prisma,
    });

    await expect(
      guard.canActivate(createContext({ uid: 'staff-1', role: RolesEnum.STAFF })),
    ).resolves.toBe(true);
  });

  it('rejects STAFF when assigned role lacks the mapped route permission', async () => {
    const prisma: PrismaMock = {
      staffUser: {
        findUnique: jest.fn().mockResolvedValue(
          activeStaffRole([{ access: 'orders', operations: ['read'] }]),
        ),
      },
    };
    const guard = createGuard({
      roles: [RolesEnum.SUPER_ADMIN],
      controllerPath: 'admin/global-settings',
      method: RequestMethod.GET,
      prisma,
    });

    await expect(
      guard.canActivate(createContext({ uid: 'staff-1', role: RolesEnum.STAFF })),
    ).rejects.toThrow('Your role does not have access to this action');
  });
});
