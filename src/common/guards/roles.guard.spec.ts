import { ExecutionContext, RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { RolesEnum } from '../enums';
import { RolesGuard } from './roles.guard';

type TestUser = {
  uid?: string;
  role?: string;
  actorType?: string;
  ownerUserId?: string;
  staffRoleId?: string;
  panelType?: string;
  tid?: string | null;
  rid?: string | null;
  bid?: string | null;
  restaurantAccess?: {
    restaurantIds?: string[];
    branchIds?: string[];
    allRestaurants?: boolean;
    hasAllRestaurantsAccess?: boolean;
  } | null;
};

type PrismaMock = {
  staffUser: {
    findUnique: jest.Mock;
  };
  restaurant?: {
    findFirst: jest.Mock;
  };
  branch?: {
    findFirst: jest.Mock;
  };
};

type ScopeLookupArgs = {
  where: { id: string };
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
      get: jest.fn((key: string, target: (...args: never[]) => unknown) => {
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

    return new RolesGuard(reflector, {
      restaurant: {
        findFirst: jest.fn().mockImplementation((args: ScopeLookupArgs) => ({
          id: args.where.id,
          tenantId: 'tenant-1',
        })),
      },
      branch: {
        findFirst: jest.fn().mockImplementation((args: ScopeLookupArgs) => ({
          id: args.where.id,
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
        })),
      },
      ...prisma,
    } as never);
  };

  const createContext = (
    user: TestUser,
    request?: {
      query?: Record<string, unknown>;
      body?: Record<string, unknown>;
      params?: Record<string, unknown>;
    },
  ): ExecutionContext =>
    ({
      getHandler: () => handler,
      getClass: () => controller,
      switchToHttp: () => ({
        getRequest: () => ({ user, ...request }),
      }),
    }) as unknown as ExecutionContext;

  const activeStaffRole = (
    permissions: Array<{ access: string; operations: string[] }>,
  ) => ({
    ownerUserId: 'owner-1',
    staffRoleId: 'role-1',
    panelType: 'SUPER_ADMIN',
    tenantId: null,
    restaurantId: null,
    branchId: null,
    restaurantAccess: {
      restaurantIds: ['restaurant-1'],
      branchIds: [],
      allRestaurants: false,
      hasAllRestaurantsAccess: false,
    },
    isActive: true,
    deletedAt: null,
    ownerUser: {
      tenantId: 'tenant-1',
      restaurantId: null,
      branchId: null,
    },
    staffRole: {
      isActive: true,
      deletedAt: null,
      permissions,
      restaurantAccess: null,
      tenantId: 'tenant-1',
      restaurantId: null,
      branchId: null,
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
      guard.canActivate(
        createContext({ uid: 'business-1', role: RolesEnum.BUSINESS_ADMIN }),
      ),
    ).resolves.toBe(true);
    expect(prisma.staffUser.findUnique).not.toHaveBeenCalled();
  });

  it('allows STAFF to read dashboard stats with dashboard permission', async () => {
    const prisma: PrismaMock = {
      staffUser: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
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
      guard.canActivate(
        createContext({ uid: 'staff-1', role: RolesEnum.STAFF }),
      ),
    ).resolves.toBe(true);
  });

  it('allows STAFF to read order summary stats with order permission', async () => {
    const prisma: PrismaMock = {
      staffUser: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            activeStaffRole([
              { access: 'order-management', operations: ['read'] },
            ]),
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
      guard.canActivate(
        createContext({ uid: 'staff-1', role: RolesEnum.STAFF }),
      ),
    ).resolves.toBe(true);
  });

  it.each(['orders/trend', 'revenue/trend'])(
    'allows STAFF with reports permission to read %s',
    async (handlerPath) => {
      const prisma: PrismaMock = {
        staffUser: {
          findUnique: jest
            .fn()
            .mockResolvedValue(
              activeStaffRole([
                { access: 'reports-payouts', operations: ['read'] },
              ]),
            ),
        },
      };
      const guard = createGuard({
        roles: [
          RolesEnum.SUPER_ADMIN,
          RolesEnum.BUSINESS_ADMIN,
          RolesEnum.BRANCH_ADMIN,
        ],
        controllerPath: 'admin/dashboard',
        handlerPath,
        method: RequestMethod.GET,
        prisma,
      });
      const user: TestUser = { uid: 'staff-1', role: RolesEnum.STAFF };

      await expect(
        guard.canActivate(
          createContext(user, {
            query: { restaurantId: 'restaurant-1' },
          }),
        ),
      ).resolves.toBe(true);
      expect(user).toMatchObject({
        tid: 'tenant-1',
        rid: 'restaurant-1',
      });
    },
  );

  it('allows STAFF to read global settings as an essential app dependency', async () => {
    const prisma: PrismaMock = {
      staffUser: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
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
      guard.canActivate(
        createContext({ uid: 'staff-1', role: RolesEnum.STAFF }),
      ),
    ).resolves.toBe(true);
  });

  it('keeps STAFF global settings writes permission-protected', async () => {
    const prisma: PrismaMock = {
      staffUser: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            activeStaffRole([{ access: 'orders', operations: ['read'] }]),
          ),
      },
    };
    const guard = createGuard({
      roles: [RolesEnum.SUPER_ADMIN],
      controllerPath: 'admin/global-settings',
      method: RequestMethod.PATCH,
      prisma,
    });

    await expect(
      guard.canActivate(
        createContext({ uid: 'staff-1', role: RolesEnum.STAFF }),
      ),
    ).rejects.toThrow('Your role does not have access to this action');
  });

  it('allows STAFF actor tokens with underscore access and list operation aliases', async () => {
    const prisma: PrismaMock = {
      staffUser: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            activeStaffRole([
              { access: 'staff_management', operations: ['list'] },
            ]),
          ),
      },
    };
    const guard = createGuard({
      roles: [
        RolesEnum.SUPER_ADMIN,
        RolesEnum.BUSINESS_ADMIN,
        RolesEnum.BRANCH_ADMIN,
      ],
      controllerPath: 'staff-management',
      method: RequestMethod.GET,
      prisma,
    });
    const user: TestUser = {
      uid: 'staff-1',
      role: 'CUSTOMER',
      actorType: 'STAFF',
    };

    await expect(guard.canActivate(createContext(user))).resolves.toBe(true);
    expect(user.ownerUserId).toBe('owner-1');
    expect(user.staffRoleId).toBe('role-1');
    expect(user.panelType).toBe('SUPER_ADMIN');
    expect(user.restaurantAccess?.restaurantIds).toEqual(['restaurant-1']);
  });

  it.each([
    ['create', RequestMethod.POST, 'create'],
    ['update', RequestMethod.PATCH, 'update'],
    ['delete', RequestMethod.DELETE, 'delete'],
  ])(
    'allows STAFF to %s staff-management with matching employees permission',
    async (_label, method, operation) => {
      const prisma: PrismaMock = {
        staffUser: {
          findUnique: jest
            .fn()
            .mockResolvedValue(
              activeStaffRole([
                { access: 'employees', operations: [operation] },
              ]),
            ),
        },
      };
      const guard = createGuard({
        roles: [
          RolesEnum.SUPER_ADMIN,
          RolesEnum.BUSINESS_ADMIN,
          RolesEnum.BRANCH_ADMIN,
        ],
        controllerPath: 'staff-management',
        handlerPath: method === RequestMethod.POST ? '' : ':id',
        method,
        prisma,
      });

      await expect(
        guard.canActivate(
          createContext({ uid: 'staff-1', role: RolesEnum.STAFF }),
        ),
      ).resolves.toBe(true);
    },
  );

  it('rejects STAFF staff-management writes when only read permission is assigned', async () => {
    const prisma: PrismaMock = {
      staffUser: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            activeStaffRole([{ access: 'employees', operations: ['read'] }]),
          ),
      },
    };
    const guard = createGuard({
      roles: [
        RolesEnum.SUPER_ADMIN,
        RolesEnum.BUSINESS_ADMIN,
        RolesEnum.BRANCH_ADMIN,
      ],
      controllerPath: 'staff-management',
      method: RequestMethod.POST,
      prisma,
    });

    await expect(
      guard.canActivate(
        createContext({ uid: 'staff-1', role: RolesEnum.STAFF }),
      ),
    ).rejects.toThrow('Your role does not have access to this action');
  });

  it('allows STAFF to read staff-roles with employees permission', async () => {
    const prisma: PrismaMock = {
      staffUser: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            activeStaffRole([{ access: 'employees', operations: ['read'] }]),
          ),
      },
    };
    const guard = createGuard({
      roles: [
        RolesEnum.SUPER_ADMIN,
        RolesEnum.BUSINESS_ADMIN,
        RolesEnum.BRANCH_ADMIN,
      ],
      controllerPath: 'staff-roles',
      method: RequestMethod.GET,
      prisma,
    });

    await expect(
      guard.canActivate(
        createContext({ uid: 'staff-1', role: RolesEnum.STAFF }),
      ),
    ).resolves.toBe(true);
  });

  it('allows STAFF to read restaurants with dashboard permission for dashboard data dependencies', async () => {
    const prisma: PrismaMock = {
      staffUser: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
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
      guard.canActivate(
        createContext({ uid: 'staff-1', role: RolesEnum.STAFF }),
      ),
    ).resolves.toBe(true);
  });

  it('allows STAFF to update menu item subroutes with main menu-management permission', async () => {
    const prisma: PrismaMock = {
      staffUser: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            activeStaffRole([
              { access: 'menu-management', operations: ['update'] },
            ]),
          ),
      },
    };
    const guard = createGuard({
      roles: [RolesEnum.BUSINESS_ADMIN, RolesEnum.BRANCH_ADMIN],
      controllerPath: 'menu/items',
      handlerPath: ':id',
      method: RequestMethod.PATCH,
      prisma,
    });

    await expect(
      guard.canActivate(
        createContext({ uid: 'staff-1', role: RolesEnum.STAFF }),
      ),
    ).resolves.toBe(true);
  });

  it('allows STAFF to read deals with main menu-management permission', async () => {
    const prisma: PrismaMock = {
      staffUser: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            activeStaffRole([
              { access: 'menu-management', operations: ['read'] },
            ]),
          ),
      },
    };
    const guard = createGuard({
      roles: [
        RolesEnum.SUPER_ADMIN,
        RolesEnum.BUSINESS_ADMIN,
        RolesEnum.BRANCH_ADMIN,
      ],
      controllerPath: 'admin/deals',
      method: RequestMethod.GET,
      prisma,
    });
    const user: TestUser = { uid: 'staff-1', role: RolesEnum.STAFF };

    await expect(
      guard.canActivate(
        createContext(user, {
          query: { restaurantId: 'restaurant-1' },
        }),
      ),
    ).resolves.toBe(true);
    expect(user).toMatchObject({
      tid: 'tenant-1',
      rid: 'restaurant-1',
    });
  });

  it('hydrates STAFF restaurant context for deal category menu items', async () => {
    const prisma: PrismaMock = {
      staffUser: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            activeStaffRole([
              { access: 'menu-management', operations: ['read'] },
            ]),
          ),
      },
    };
    const guard = createGuard({
      roles: [
        RolesEnum.SUPER_ADMIN,
        RolesEnum.BUSINESS_ADMIN,
        RolesEnum.BRANCH_ADMIN,
        RolesEnum.STAFF,
      ],
      controllerPath: 'menu/items',
      method: RequestMethod.GET,
      prisma,
    });
    const user: TestUser = { uid: 'staff-1', role: RolesEnum.STAFF };

    await expect(
      guard.canActivate(
        createContext(user, {
          query: {
            restaurantId: 'restaurant-1',
            categoryId: 'category-1',
          },
        }),
      ),
    ).resolves.toBe(true);
    expect(user).toMatchObject({
      tid: 'tenant-1',
      rid: 'restaurant-1',
    });
  });

  it.each([
    {
      name: 'invoice history',
      permission: 'reports-payouts',
      controllerPath: 'admin/reports',
      handlerPath: 'generated-invoices',
    },
    {
      name: 'table reservations',
      permission: 'table-reservations',
      controllerPath: 'customer-app',
      handlerPath: 'admin/table-reservations',
    },
  ])(
    'hydrates selected restaurant tenant context for STAFF $name',
    async ({ permission, controllerPath, handlerPath }) => {
      const prisma: PrismaMock = {
        staffUser: {
          findUnique: jest
            .fn()
            .mockResolvedValue(
              activeStaffRole([{ access: permission, operations: ['read'] }]),
            ),
        },
      };
      const guard = createGuard({
        roles: [
          RolesEnum.SUPER_ADMIN,
          RolesEnum.BUSINESS_ADMIN,
          RolesEnum.BRANCH_ADMIN,
        ],
        controllerPath,
        handlerPath,
        method: RequestMethod.GET,
        prisma,
      });
      const user: TestUser = { uid: 'staff-1', role: RolesEnum.STAFF };

      await expect(
        guard.canActivate(
          createContext(user, {
            query: { restaurantId: 'restaurant-1' },
          }),
        ),
      ).resolves.toBe(true);
      expect(user).toMatchObject({
        tid: 'tenant-1',
        rid: 'restaurant-1',
      });
    },
  );

  it('denies STAFF requests outside assigned restaurants before service access', async () => {
    const prisma: PrismaMock = {
      staffUser: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            activeStaffRole([
              { access: 'menu-management', operations: ['read'] },
            ]),
          ),
      },
    };
    const guard = createGuard({
      roles: [
        RolesEnum.SUPER_ADMIN,
        RolesEnum.BUSINESS_ADMIN,
        RolesEnum.BRANCH_ADMIN,
      ],
      controllerPath: 'admin/deals',
      method: RequestMethod.GET,
      prisma,
    });

    await expect(
      guard.canActivate(
        createContext(
          { uid: 'staff-1', role: RolesEnum.STAFF },
          { query: { restaurantId: 'restaurant-2' } },
        ),
      ),
    ).rejects.toThrow('Staff account is not assigned to this restaurant');
  });

  it('keeps all-restaurants STAFF access inside the owner tenant', async () => {
    const staff = {
      ...activeStaffRole([{ access: 'menu-management', operations: ['read'] }]),
      tenantId: null,
      restaurantAccess: {
        restaurantIds: [],
        branchIds: [],
        allRestaurants: true,
        hasAllRestaurantsAccess: true,
      },
      staffRole: {
        ...activeStaffRole([]).staffRole,
        permissions: [{ access: 'menu-management', operations: ['read'] }],
        tenantId: null,
      },
    };
    const prisma: PrismaMock = {
      staffUser: {
        findUnique: jest.fn().mockResolvedValue(staff),
      },
      restaurant: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const guard = createGuard({
      roles: [
        RolesEnum.SUPER_ADMIN,
        RolesEnum.BUSINESS_ADMIN,
        RolesEnum.BRANCH_ADMIN,
      ],
      controllerPath: 'admin/deals',
      method: RequestMethod.GET,
      prisma,
    });

    await expect(
      guard.canActivate(
        createContext(
          { uid: 'staff-1', role: RolesEnum.STAFF },
          { query: { restaurantId: 'restaurant-from-another-tenant' } },
        ),
      ),
    ).rejects.toThrow('Staff account is not assigned to this restaurant');
    expect(prisma.restaurant?.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'restaurant-from-another-tenant',
        deletedAt: null,
        isActive: true,
        tenantId: 'tenant-1',
      },
      select: { id: true, tenantId: true },
    });
  });

  it('hydrates and validates selected branch context for STAFF requests', async () => {
    const staff = {
      ...activeStaffRole([
        { access: 'table-reservations', operations: ['read'] },
      ]),
      restaurantAccess: {
        restaurantIds: ['restaurant-1'],
        branchIds: ['branch-1'],
        allRestaurants: false,
        hasAllRestaurantsAccess: false,
      },
    };
    const prisma: PrismaMock = {
      staffUser: {
        findUnique: jest.fn().mockResolvedValue(staff),
      },
    };
    const guard = createGuard({
      roles: [
        RolesEnum.SUPER_ADMIN,
        RolesEnum.BUSINESS_ADMIN,
        RolesEnum.BRANCH_ADMIN,
      ],
      controllerPath: 'customer-app',
      handlerPath: 'admin/table-reservations',
      method: RequestMethod.GET,
      prisma,
    });
    const user: TestUser = { uid: 'staff-1', role: RolesEnum.STAFF };

    await expect(
      guard.canActivate(
        createContext(user, {
          query: {
            restaurantId: 'restaurant-1',
            branchId: 'branch-1',
          },
        }),
      ),
    ).resolves.toBe(true);
    expect(user).toMatchObject({
      tid: 'tenant-1',
      rid: 'restaurant-1',
      bid: 'branch-1',
    });
  });

  it('allows STAFF to read group orders with main order-management permission', async () => {
    const prisma: PrismaMock = {
      staffUser: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            activeStaffRole([
              { access: 'order-management', operations: ['read'] },
            ]),
          ),
      },
    };
    const guard = createGuard({
      roles: [
        RolesEnum.SUPER_ADMIN,
        RolesEnum.BUSINESS_ADMIN,
        RolesEnum.BRANCH_ADMIN,
      ],
      controllerPath: 'group-orders',
      method: RequestMethod.GET,
      prisma,
    });

    await expect(
      guard.canActivate(
        createContext({ uid: 'staff-1', role: RolesEnum.STAFF }),
      ),
    ).resolves.toBe(true);
  });

  it('allows STAFF to update restaurant content with content-management permission', async () => {
    const prisma: PrismaMock = {
      staffUser: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            activeStaffRole([
              { access: 'content-management', operations: ['update'] },
            ]),
          ),
      },
    };
    const guard = createGuard({
      roles: [RolesEnum.BUSINESS_ADMIN, RolesEnum.BRANCH_ADMIN],
      controllerPath: 'restaurants',
      handlerPath: ':id/legal-profile',
      method: RequestMethod.PATCH,
      prisma,
    });

    await expect(
      guard.canActivate(
        createContext({ uid: 'staff-1', role: RolesEnum.STAFF }),
      ),
    ).resolves.toBe(true);
  });

  it('keeps old menu submodule aliases working for nested menu routes', async () => {
    const prisma: PrismaMock = {
      staffUser: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            activeStaffRole([{ access: 'menu-items', operations: ['read'] }]),
          ),
      },
    };
    const guard = createGuard({
      roles: [RolesEnum.BUSINESS_ADMIN, RolesEnum.BRANCH_ADMIN],
      controllerPath: 'menu/items',
      method: RequestMethod.GET,
      prisma,
    });

    await expect(
      guard.canActivate(
        createContext({ uid: 'staff-1', role: RolesEnum.STAFF }),
      ),
    ).resolves.toBe(true);
  });

  it('allows STAFF to read contact submissions with the main sidebar permission', async () => {
    const prisma: PrismaMock = {
      staffUser: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            activeStaffRole([
              { access: 'contact-submissions', operations: ['read'] },
            ]),
          ),
      },
    };
    const guard = createGuard({
      roles: [RolesEnum.BUSINESS_ADMIN, RolesEnum.BRANCH_ADMIN],
      controllerPath: 'contact-submissions',
      method: RequestMethod.GET,
      prisma,
    });

    await expect(
      guard.canActivate(
        createContext({ uid: 'staff-1', role: RolesEnum.STAFF }),
      ),
    ).resolves.toBe(true);
  });

  it('allows STAFF restaurant reads as essential app dependencies', async () => {
    const prisma: PrismaMock = {
      staffUser: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            activeStaffRole([{ access: 'orders', operations: ['read'] }]),
          ),
      },
    };
    const guard = createGuard({
      roles: [RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN],
      controllerPath: 'restaurants',
      handlerPath: ':id',
      method: RequestMethod.GET,
      prisma,
    });
    const user: TestUser = { uid: 'staff-1', role: RolesEnum.STAFF };

    await expect(guard.canActivate(createContext(user))).resolves.toBe(true);
    expect(user.restaurantAccess?.restaurantIds).toEqual(['restaurant-1']);
  });

  it('keeps STAFF restaurant writes permission-protected', async () => {
    const prisma: PrismaMock = {
      staffUser: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            activeStaffRole([{ access: 'orders', operations: ['read'] }]),
          ),
      },
    };
    const guard = createGuard({
      roles: [RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN],
      controllerPath: 'restaurants',
      handlerPath: ':id',
      method: RequestMethod.PATCH,
      prisma,
    });

    await expect(
      guard.canActivate(
        createContext({ uid: 'staff-1', role: RolesEnum.STAFF }),
      ),
    ).rejects.toThrow('Your role does not have access to this action');
  });
});
