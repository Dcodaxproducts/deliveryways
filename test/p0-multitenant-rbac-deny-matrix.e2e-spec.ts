import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StaffPanelType, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/filters';
import { ResponseInterceptor } from '../src/common/interceptors';
import { PrismaService } from '../src/database';

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
};

type LoginData = {
  accessToken: string;
};

type ActorCredentials = {
  email: string;
  password: string;
  role: UserRole;
  restaurantId?: string;
};

type TenantFixture = {
  tenantId: string;
  restaurantId: string;
  mainBranchId: string;
  siblingBranchId: string;
  ownerId: string;
  owner: ActorCredentials;
};

describe('P0 multi-tenant and RBAC deny matrix (isolated database)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const runId = `${Date.now()}-${process.pid}`;
  const password = 'P0-rbac-secure-123!';

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const login = async (actor: ActorCredentials): Promise<string> => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send(actor)
      .expect(201);
    const body = response.body as ApiEnvelope<LoginData>;
    return body.data.accessToken;
  };

  const createTenantFixture = async (
    label: string,
    passwordHash: string,
  ): Promise<TenantFixture> => {
    const tenant = await prisma.tenant.create({
      data: {
        name: `RBAC Tenant ${label} ${runId}`,
        slug: `rbac-tenant-${label.toLowerCase()}-${runId}`,
      },
    });
    const restaurant = await prisma.restaurant.create({
      data: {
        tenantId: tenant.id,
        name: `RBAC Restaurant ${label} ${runId}`,
        slug: `rbac-restaurant-${label.toLowerCase()}-${runId}`,
        subdomain: `rbac-${label.toLowerCase()}-${runId}`,
      },
    });
    const [mainBranch, siblingBranch] = await Promise.all([
      prisma.branch.create({
        data: {
          tenantId: tenant.id,
          restaurantId: restaurant.id,
          name: `RBAC ${label} Main`,
          isMain: true,
        },
      }),
      prisma.branch.create({
        data: {
          tenantId: tenant.id,
          restaurantId: restaurant.id,
          name: `RBAC ${label} Sibling`,
        },
      }),
    ]);
    const owner = await prisma.user.create({
      data: {
        email: `rbac-owner-${label.toLowerCase()}-${runId}@example.test`,
        password: passwordHash,
        role: UserRole.BUSINESS_ADMIN,
        tenantId: tenant.id,
        isVerified: true,
        isApproved: true,
        isActive: true,
      },
    });
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { ownerId: owner.id },
    });

    return {
      tenantId: tenant.id,
      restaurantId: restaurant.id,
      mainBranchId: mainBranch.id,
      siblingBranchId: siblingBranch.id,
      ownerId: owner.id,
      owner: {
        email: owner.email,
        password,
        role: UserRole.BUSINESS_ADMIN,
      },
    };
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();

    prisma = app.get(PrismaService);
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('enforces MT-RBAC-01 through MT-RBAC-09 without foreign mutations', async () => {
    const passwordHash = await bcrypt.hash(password, 10);
    const tenantA = await createTenantFixture('A', passwordHash);
    const tenantB = await createTenantFixture('B', passwordHash);

    const superAdmin = await prisma.user.create({
      data: {
        email: `rbac-superadmin-${runId}@example.test`,
        password: passwordHash,
        role: UserRole.SUPER_ADMIN,
        isVerified: true,
        isApproved: true,
        isActive: true,
      },
    });
    const branchAdmin = await prisma.user.create({
      data: {
        email: `rbac-branch-admin-${runId}@example.test`,
        password: passwordHash,
        role: UserRole.BRANCH_ADMIN,
        tenantId: tenantA.tenantId,
        restaurantId: tenantA.restaurantId,
        branchId: tenantA.mainBranchId,
        isVerified: true,
        isApproved: true,
        isActive: true,
      },
    });
    const customer = await prisma.user.create({
      data: {
        email: `rbac-customer-${runId}@example.test`,
        password: passwordHash,
        role: UserRole.CUSTOMER,
        tenantId: tenantA.tenantId,
        restaurantId: tenantA.restaurantId,
        branchId: tenantA.mainBranchId,
        isVerified: true,
        isApproved: true,
        isActive: true,
      },
    });
    const staffRole = await prisma.staffRole.create({
      data: {
        ownerUserId: tenantA.ownerId,
        panelType: StaffPanelType.BUSINESS_ADMIN,
        tenantId: tenantA.tenantId,
        restaurantId: tenantA.restaurantId,
        branchId: tenantA.mainBranchId,
        name: `RBAC Branch Reader ${runId}`,
        permissions: [{ access: 'branches', operations: ['read'] }],
        restaurantAccess: {
          restaurantIds: [tenantA.restaurantId],
          branchIds: [tenantA.mainBranchId],
        },
      },
    });
    const staff = await prisma.staffUser.create({
      data: {
        ownerUserId: staffRole.ownerUserId,
        staffRoleId: staffRole.id,
        panelType: StaffPanelType.BUSINESS_ADMIN,
        email: `rbac-staff-${runId}@example.test`,
        password: passwordHash,
        firstName: 'RBAC',
        lastName: 'Staff',
        tenantId: tenantA.tenantId,
        restaurantId: tenantA.restaurantId,
        branchId: tenantA.mainBranchId,
        restaurantAccess: {
          restaurantIds: [tenantA.restaurantId],
          branchIds: [tenantA.mainBranchId],
        },
      },
    });
    const foreignStaffRole = await prisma.staffRole.create({
      data: {
        ownerUserId: tenantB.ownerId,
        panelType: StaffPanelType.BUSINESS_ADMIN,
        tenantId: tenantB.tenantId,
        restaurantId: tenantB.restaurantId,
        branchId: tenantB.mainBranchId,
        name: `RBAC Foreign Role ${runId}`,
        permissions: [{ access: 'branches', operations: ['read'] }],
      },
    });
    const foreignStaff = await prisma.staffUser.create({
      data: {
        ownerUserId: tenantB.ownerId,
        staffRoleId: foreignStaffRole.id,
        panelType: StaffPanelType.BUSINESS_ADMIN,
        email: `rbac-foreign-staff-${runId}@example.test`,
        password: passwordHash,
        firstName: 'Foreign',
        lastName: 'Staff',
        tenantId: tenantB.tenantId,
        restaurantId: tenantB.restaurantId,
        branchId: tenantB.mainBranchId,
      },
    });

    const [superAdminToken, ownerToken, branchAdminToken, customerToken] =
      await Promise.all([
        login({
          email: superAdmin.email,
          password,
          role: UserRole.SUPER_ADMIN,
        }),
        login(tenantA.owner),
        login({
          email: branchAdmin.email,
          password,
          role: UserRole.BRANCH_ADMIN,
        }),
        login({
          email: customer.email,
          password,
          role: UserRole.CUSTOMER,
          restaurantId: tenantA.restaurantId,
        }),
      ]);
    const staffLoginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({ email: staff.email, password })
      .expect(201);
    const staffToken = (staffLoginResponse.body as ApiEnvelope<LoginData>).data
      .accessToken;

    await request(app.getHttpServer())
      .get(`/api/v1/tenants/${tenantB.tenantId}/analytics`)
      .set(auth(ownerToken))
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/restaurants/${tenantB.restaurantId}`)
      .set(auth(ownerToken))
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/branches/${tenantB.mainBranchId}`)
      .set(auth(ownerToken))
      .send({ name: 'FOREIGN MUTATION MUST NOT LAND' })
      .expect(403);
    expect(
      await prisma.branch.findUniqueOrThrow({
        where: { id: tenantB.mainBranchId },
      }),
    ).toMatchObject({ name: 'RBAC B Main' });
    await request(app.getHttpServer())
      .get(`/api/v1/staff-roles/${foreignStaffRole.id}`)
      .set(auth(ownerToken))
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/staff-management/${foreignStaff.id}`)
      .set(auth(ownerToken))
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set(auth(ownerToken))
      .set('x-tenant-id', tenantB.tenantId)
      .query({ restaurantId: tenantA.restaurantId })
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set(auth(ownerToken))
      .query({ tenantId: tenantB.tenantId })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/branches/${tenantA.mainBranchId}`)
      .set(auth(ownerToken))
      .send({ tenantId: tenantB.tenantId })
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/v1/branches/${tenantA.mainBranchId}`)
      .set(auth(branchAdminToken))
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/branches/${tenantA.mainBranchId}`)
      .set(auth(branchAdminToken))
      .send({ description: 'Allowed branch-admin update' })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/branches/${tenantA.siblingBranchId}`)
      .set(auth(branchAdminToken))
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/branches/${tenantA.siblingBranchId}`)
      .set(auth(branchAdminToken))
      .send({ description: 'Denied sibling branch-admin update' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/branches/${tenantB.mainBranchId}`)
      .set(auth(branchAdminToken))
      .send({ description: 'Denied branch-admin update' })
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/v1/branches/${tenantA.siblingBranchId}`)
      .set(auth(customerToken))
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/branches/${tenantB.mainBranchId}`)
      .set(auth(customerToken))
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/branches/${tenantA.mainBranchId}`)
      .set(auth(customerToken))
      .send({ description: 'Denied customer update' })
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/v1/branches/${tenantA.mainBranchId}`)
      .set(auth(staffToken))
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/branches/${tenantA.siblingBranchId}`)
      .set(auth(staffToken))
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/branches/${tenantB.mainBranchId}`)
      .set(auth(staffToken))
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/branches/${tenantA.mainBranchId}`)
      .set(auth(staffToken))
      .send({ description: 'Denied read-only staff update' })
      .expect(403);

    await prisma.staffRole.update({
      where: { id: staffRole.id },
      data: {
        permissions: [{ access: 'branches', operations: ['read', 'update'] }],
      },
    });
    await request(app.getHttpServer())
      .patch(`/api/v1/branches/${tenantA.mainBranchId}`)
      .set(auth(staffToken))
      .send({ description: 'Allowed staff update' })
      .expect(200);

    await prisma.staffUser.update({
      where: { id: staff.id },
      data: { isActive: false },
    });
    await request(app.getHttpServer())
      .get(`/api/v1/branches/${tenantA.mainBranchId}`)
      .set(auth(staffToken))
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({ email: staff.email, password })
      .expect(403);

    await prisma.staffUser.update({
      where: { id: staff.id },
      data: { isActive: true },
    });
    await prisma.staffRole.update({
      where: { id: staffRole.id },
      data: { isActive: false },
    });
    await request(app.getHttpServer())
      .get(`/api/v1/branches/${tenantA.mainBranchId}`)
      .set(auth(staffToken))
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({ email: staff.email, password })
      .expect(403);

    await prisma.staffRole.update({
      where: { id: staffRole.id },
      data: { isActive: true },
    });
    await prisma.staffUser.update({
      where: { id: staff.id },
      data: { deletedAt: new Date() },
    });
    await request(app.getHttpServer())
      .get(`/api/v1/branches/${tenantA.mainBranchId}`)
      .set(auth(staffToken))
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({ email: staff.email, password })
      .expect(401);

    await prisma.staffUser.update({
      where: { id: staff.id },
      data: { deletedAt: null },
    });
    await prisma.staffRole.update({
      where: { id: staffRole.id },
      data: { deletedAt: new Date() },
    });
    await request(app.getHttpServer())
      .get(`/api/v1/branches/${tenantA.mainBranchId}`)
      .set(auth(staffToken))
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({ email: staff.email, password })
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/v1/tenants/${tenantA.tenantId}`)
      .set(auth(superAdminToken))
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/tenants/${tenantB.tenantId}`)
      .set(auth(superAdminToken))
      .expect(200);

    const scopedResponses = await Promise.all([
      request(app.getHttpServer())
        .get('/api/v1/restaurants')
        .set(auth(ownerToken)),
      request(app.getHttpServer())
        .get('/api/v1/branches')
        .set(auth(ownerToken)),
      request(app.getHttpServer())
        .get('/api/v1/staff-roles')
        .set(auth(ownerToken)),
      request(app.getHttpServer())
        .get('/api/v1/staff-management')
        .set(auth(ownerToken)),
    ]);
    for (const response of scopedResponses) {
      expect(response.status).toBe(200);
      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain(tenantB.tenantId);
      expect(serialized).not.toContain(tenantB.restaurantId);
      expect(serialized).not.toContain(tenantB.mainBranchId);
      expect(serialized).not.toContain(tenantB.siblingBranchId);
    }
  }, 120_000);
});
