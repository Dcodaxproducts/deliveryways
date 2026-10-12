import { StaffPanelType } from '@prisma/client';
import { AuthUserContext } from '../common/decorators';
import { UserRoleEnum } from '../common/enums';
import {
  RealtimeDeliveryAuthorizationService,
  RealtimeEntity,
  RealtimeSubject,
  realtimeSubjectKey,
} from './realtime-delivery-authorization.service';

type Rows = {
  users?: Array<Record<string, unknown>>;
  staff?: Array<Record<string, unknown>>;
  deliverymen?: Array<Record<string, unknown>>;
  order?: Record<string, unknown> | null;
  thread?: Record<string, unknown> | null;
};

const makeService = (rows: Rows) => {
  const prisma = {
    user: { findMany: jest.fn().mockResolvedValue(rows.users ?? []) },
    staffUser: { findMany: jest.fn().mockResolvedValue(rows.staff ?? []) },
    deliveryman: {
      findMany: jest.fn().mockResolvedValue(rows.deliverymen ?? []),
    },
    order: { findUnique: jest.fn().mockResolvedValue(rows.order ?? null) },
    chatThread: {
      findUnique: jest.fn().mockResolvedValue(rows.thread ?? null),
    },
  };
  return {
    prisma,
    service: new RealtimeDeliveryAuthorizationService(prisma as never),
  };
};

const entity = (overrides: Partial<RealtimeEntity> = {}): RealtimeEntity => ({
  kind: 'order',
  id: 'order-1',
  customerId: 'customer-1',
  deliverymanId: null,
  assignedStaffUserId: null,
  tenantId: 'tenant-1',
  restaurantId: 'restaurant-1',
  branchId: 'branch-1',
  ...overrides,
});

const subject = (socketId: string, user: AuthUserContext): RealtimeSubject => ({
  key: realtimeSubjectKey(socketId, user),
  user,
});

const customerRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'customer-1',
  role: UserRoleEnum.CUSTOMER,
  tenantId: null,
  restaurantId: null,
  branchId: null,
  authVersion: 2,
  isActive: true,
  deletedAt: null,
  ...overrides,
});
const customerUser = (ver: number): AuthUserContext => ({
  uid: 'customer-1',
  role: UserRoleEnum.CUSTOMER,
  ver,
});

const staffRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'staff-1',
  tenantId: 'tenant-1',
  restaurantId: 'restaurant-1',
  branchId: 'branch-1',
  staffRoleId: 'role-1',
  authVersion: 1,
  isActive: true,
  deletedAt: null,
  panelType: StaffPanelType.BRANCH_ADMIN,
  restaurantAccess: null,
  staffRole: {
    isActive: true,
    deletedAt: null,
    restaurantAccess: null,
    permissions: [
      { access: 'chat', operations: ['read'] },
      { access: 'orders', operations: ['view'] },
    ],
  },
  ...overrides,
});
const staffUser = (
  overrides: Partial<AuthUserContext> = {},
): AuthUserContext => ({
  uid: 'staff-1',
  role: UserRoleEnum.STAFF,
  actorType: 'STAFF',
  tid: 'tenant-1',
  rid: 'restaurant-1',
  bid: 'branch-1',
  staffRoleId: 'role-1',
  panelType: StaffPanelType.BRANCH_ADMIN,
  ver: 1,
  ...overrides,
});

describe('RealtimeDeliveryAuthorizationService', () => {
  it('decides per socket: one uid with a current and a revoked session', async () => {
    const { service } = makeService({ users: [customerRow()] });
    const current = subject('socket-current', customerUser(2));
    const revoked = subject('socket-revoked', customerUser(1));
    expect(current.key).not.toBe(revoked.key);
    const allowed = await service.authorize([revoked, current], entity());
    expect(allowed.has(current.key)).toBe(true);
    expect(allowed.has(revoked.key)).toBe(false);
  });

  it('treats the same uid on two sockets with the same claims as two separate keys', async () => {
    const { service } = makeService({ users: [customerRow()] });
    const a = subject('a', customerUser(2));
    const b = subject('b', customerUser(2));
    const allowed = await service.authorize([a, b], entity());
    expect([...allowed].sort()).toEqual([a.key, b.key].sort());
  });

  it('revokes customers when ownership moves or the account is deactivated', async () => {
    const owner = subject('s', customerUser(2));
    const { service } = makeService({ users: [customerRow()] });
    expect((await service.authorize([owner], entity())).size).toBe(1);
    expect(
      (await service.authorize([owner], entity({ customerId: 'someone-else' })))
        .size,
    ).toBe(0);
    const inactive = makeService({
      users: [customerRow({ isActive: false })],
    }).service;
    expect((await inactive.authorize([owner], entity())).size).toBe(0);
    const deleted = makeService({
      users: [customerRow({ deletedAt: new Date() })],
    }).service;
    expect((await deleted.authorize([owner], entity())).size).toBe(0);
  });

  it('rejects a session whose claimed scope no longer matches the account', async () => {
    const admin: AuthUserContext = {
      uid: 'admin-1',
      role: UserRoleEnum.BRANCH_ADMIN,
      tid: 'tenant-1',
      rid: 'restaurant-1',
      bid: 'branch-1',
      ver: 1,
    };
    const row = (overrides: Record<string, unknown> = {}) => ({
      id: 'admin-1',
      role: UserRoleEnum.BRANCH_ADMIN,
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      authVersion: 1,
      isActive: true,
      deletedAt: null,
      ...overrides,
    });
    const s = subject('s', admin);
    expect(
      (await makeService({ users: [row()] }).service.authorize([s], entity()))
        .size,
    ).toBe(1);
    // Admin moved to another branch while the socket still holds the old claim.
    expect(
      (
        await makeService({
          users: [row({ branchId: 'branch-2' })],
        }).service.authorize([s], entity())
      ).size,
    ).toBe(0);
    // Entity belongs to a different branch than the admin's.
    expect(
      (
        await makeService({ users: [row()] }).service.authorize(
          [s],
          entity({ branchId: 'branch-9' }),
        )
      ).size,
    ).toBe(0);
  });

  it('applies chat assignment: only the assignee (or anyone when unassigned) among staff', async () => {
    const { service } = makeService({ staff: [staffRow()] });
    const s = subject('s', staffUser());
    const chat = (assigned: string | null) =>
      entity({ kind: 'chat', id: 'thread-1', assignedStaffUserId: assigned });
    expect((await service.authorize([s], chat(null))).size).toBe(1);
    expect((await service.authorize([s], chat('staff-1'))).size).toBe(1);
    expect((await service.authorize([s], chat('staff-2'))).size).toBe(0);
  });

  it('revalidates staff role, permission, scope and auth version', async () => {
    const s = subject('s', staffUser());
    const check = async (row: Record<string, unknown>, e = entity()) =>
      (await makeService({ staff: [row] }).service.authorize([s], e)).size;
    expect(await check(staffRow(), entity({ kind: 'chat' }))).toBe(1);
    expect(
      await check(staffRow({ authVersion: 2 }), entity({ kind: 'chat' })),
    ).toBe(0);
    expect(
      await check(
        staffRow({
          staffRole: {
            ...staffRow().staffRole,
            permissions: [{ access: 'orders', operations: ['read'] }],
          },
        }),
        entity({ kind: 'chat' }),
      ),
    ).toBe(0);
    expect(
      await check(
        staffRow({ staffRole: { ...staffRow().staffRole, isActive: false } }),
      ),
    ).toBe(0);
    expect(await check(staffRow({ branchId: 'branch-2' }))).toBe(0);
    expect(await check(staffRow(), entity({ branchId: 'branch-3' }))).toBe(0);
    expect(await check(staffRow({ staffRoleId: 'role-2' }))).toBe(0);
  });

  it('lets only the currently assigned deliveryman through', async () => {
    const user: AuthUserContext = {
      uid: 'deliveryman-1',
      role: 'DELIVERYMAN',
      actorType: 'DELIVERYMAN',
      tid: 'tenant-1',
      rid: 'restaurant-1',
      bid: 'branch-1',
      ver: 1,
    };
    const row = {
      id: 'deliveryman-1',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-1',
      branchId: 'branch-1',
      authVersion: 1,
      isActive: true,
      deletedAt: null,
    };
    const { service } = makeService({ deliverymen: [row] });
    const s = subject('s', user);
    expect(
      (await service.authorize([s], entity({ deliverymanId: 'deliveryman-1' })))
        .size,
    ).toBe(1);
    expect(
      (await service.authorize([s], entity({ deliverymanId: 'deliveryman-2' })))
        .size,
    ).toBe(0);
    expect(
      (await service.authorize([s], entity({ deliverymanId: null }))).size,
    ).toBe(0);
  });

  it('batches account reads: one query per actor class regardless of socket count', async () => {
    const { service, prisma } = makeService({ users: [customerRow()] });
    const subjects = Array.from({ length: 250 }, (_, index) =>
      subject('s' + index, customerUser(2)),
    );
    await service.authorize(subjects, entity());
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.staffUser.findMany).not.toHaveBeenCalled();
    expect(prisma.deliveryman.findMany).not.toHaveBeenCalled();
    const where = (prisma.user.findMany.mock.calls as unknown[][])[0][0] as {
      where: { id: { in: string[] } };
    };
    expect(where.where.id.in).toEqual(['customer-1']);
  });

  it('resolves the current order and thread scope', async () => {
    const order = {
      customerId: 'c',
      deliverymanId: null,
      tenantId: 't',
      restaurantId: 'r',
      branchId: 'b',
    };
    const thread = { ...order, assignedStaffUserId: 'staff-1' };
    const { service, prisma } = makeService({ order, thread });
    expect(await service.resolveEntity({ kind: 'order', id: 'o1' })).toEqual({
      ...order,
      kind: 'order',
      id: 'o1',
      assignedStaffUserId: null,
    });
    expect(await service.resolveEntity({ kind: 'chat', id: 't1' })).toEqual({
      ...thread,
      kind: 'chat',
      id: 't1',
    });
    prisma.order.findUnique.mockResolvedValue(null);
    expect(
      await service.resolveEntity({ kind: 'order', id: 'gone' }),
    ).toBeNull();
  });
});
