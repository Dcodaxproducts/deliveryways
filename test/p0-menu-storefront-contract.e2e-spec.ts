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

describe('P0 menu-to-storefront contract journey (isolated database)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const runId = `${Date.now()}-${process.pid}`;
  const password = 'P0-storefront-secure-123!';

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const login = async (actor: {
    email: string;
    password: string;
    role: UserRole;
    restaurantId?: string;
  }): Promise<string> => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send(actor)
      .expect(201);
    const body = response.body as ApiEnvelope<LoginData>;
    return body.data.accessToken;
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

  it('propagates partner menu state to the public storefront contract (MS-01 to MS-06)', async () => {
    const passwordHash = await bcrypt.hash(password, 10);

    // --- Seed tenant fixture (two branches, business owner, customer) ---
    const tenant = await prisma.tenant.create({
      data: {
        name: `MS Tenant ${runId}`,
        slug: `ms-tenant-${runId}`,
      },
    });
    const restaurant = await prisma.restaurant.create({
      data: {
        tenantId: tenant.id,
        name: `MS Restaurant ${runId}`,
        slug: `ms-restaurant-${runId}`,
        subdomain: `ms-${runId}`,
      },
    });
    const [mainBranch, siblingBranch] = await Promise.all([
      prisma.branch.create({
        data: {
          tenantId: tenant.id,
          restaurantId: restaurant.id,
          name: 'MS Main',
          isMain: true,
        },
      }),
      prisma.branch.create({
        data: {
          tenantId: tenant.id,
          restaurantId: restaurant.id,
          name: 'MS Sibling',
        },
      }),
    ]);
    const owner = await prisma.user.create({
      data: {
        email: `ms-owner-${runId}@example.test`,
        password: passwordHash,
        role: UserRole.BUSINESS_ADMIN,
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        isVerified: true,
        isApproved: true,
        isActive: true,
      },
    });
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { ownerId: owner.id },
    });
    const customer = await prisma.user.create({
      data: {
        email: `ms-customer-${runId}@example.test`,
        password: passwordHash,
        role: UserRole.CUSTOMER,
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        branchId: mainBranch.id,
        isVerified: true,
        isApproved: true,
        isActive: true,
      },
    });

    const ownerToken = await login({
      email: owner.email,
      password,
      role: UserRole.BUSINESS_ADMIN,
    });
    const customerToken = await login({
      email: customer.email,
      password,
      role: UserRole.CUSTOMER,
      restaurantId: restaurant.id,
    });

    const staffRole = await prisma.staffRole.create({
      data: {
        ownerUserId: owner.id,
        panelType: StaffPanelType.BUSINESS_ADMIN,
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        branchId: mainBranch.id,
        name: 'MS Override Manager ' + runId,
        permissions: [{ access: 'menu', operations: ['write'] }],
        restaurantAccess: {
          restaurantIds: [restaurant.id],
          branchIds: [mainBranch.id, siblingBranch.id],
        },
      },
    });
    await prisma.staffUser.create({
      data: {
        ownerUserId: owner.id,
        staffRoleId: staffRole.id,
        panelType: StaffPanelType.BUSINESS_ADMIN,
        email: 'ms-staff-' + runId + '@example.test',
        password: passwordHash,
        firstName: 'MS',
        lastName: 'Staff',
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        branchId: mainBranch.id,
      },
    });
    const staffLoginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({
        email: 'ms-staff-' + runId + '@example.test',
        password,
      })
      .expect(201);
    const staffToken = (staffLoginResponse.body as ApiEnvelope<LoginData>).data
      .accessToken;

    // --- MS-01: partner menu creation reflects on storefront ---
    const categoryResponse = await request(app.getHttpServer())
      .post('/api/v1/menu/categories')
      .set(auth(ownerToken))
      .send({
        name: `MS Category ${runId}`,
        slug: `ms-category-${runId}`,
        restaurantId: restaurant.id,
      })
      .expect(201);
    const category = (categoryResponse.body as ApiEnvelope<{ id: string }>)
      .data;

    const itemResponse = await request(app.getHttpServer())
      .post('/api/v1/menu/items')
      .set(auth(ownerToken))
      .send({
        name: `MS Signature Burger ${runId}`,
        categoryId: category.id,
        restaurantId: restaurant.id,
        basePrice: 12.5,
      })
      .expect(201);
    const item = (
      itemResponse.body as ApiEnvelope<{ id: string; slug: string }>
    ).data;

    const priceItemResponse = await request(app.getHttpServer())
      .post('/api/v1/menu/items')
      .set(auth(ownerToken))
      .send({
        name: `MS Price Probe ${runId}`,
        categoryId: category.id,
        restaurantId: restaurant.id,
        basePrice: 20,
      })
      .expect(201);
    const priceItem = (priceItemResponse.body as ApiEnvelope<{ id: string }>)
      .data;

    await request(app.getHttpServer())
      .post('/api/v1/menus')
      .set(auth(ownerToken))
      .send({
        name: `MS Menu ${runId}`,
        slug: `ms-menu-${runId}`,
        restaurantId: restaurant.id,
        itemIds: [item.id, priceItem.id],
      })
      .expect(201);

    const mainListResponse = await request(app.getHttpServer())
      .get('/api/v1/customer-app/items')
      .query({
        restaurantId: restaurant.id,
        branchId: mainBranch.id,
        limit: 50,
      })
      .expect(200);
    const mainListRaw = JSON.stringify(mainListResponse.body);
    expect(mainListRaw).toContain(`MS Signature Burger ${runId}`);

    // --- MS-02: branch availability override ---
    await request(app.getHttpServer())
      .post('/api/v1/menu/branch-overrides/items')
      .set(auth(staffToken))
      .send({
        branchId: siblingBranch.id,
        menuItemId: item.id,
        isAvailable: false,
      })
      .expect(201);

    const siblingListResponse = await request(app.getHttpServer())
      .get('/api/v1/customer-app/items')
      .query({
        restaurantId: restaurant.id,
        branchId: siblingBranch.id,
        limit: 50,
      })
      .expect(200);
    expect(JSON.stringify(siblingListResponse.body)).not.toContain(
      `MS Signature Burger ${runId}`,
    );
    const mainAfterOverride = await request(app.getHttpServer())
      .get('/api/v1/customer-app/items')
      .query({
        restaurantId: restaurant.id,
        branchId: mainBranch.id,
        limit: 50,
      })
      .expect(200);
    expect(JSON.stringify(mainAfterOverride.body)).toContain(
      `MS Signature Burger ${runId}`,
    );

    // --- MS-03: branch price override ---
    await request(app.getHttpServer())
      .post('/api/v1/menu/branch-overrides/items')
      .set(auth(staffToken))
      .send({
        branchId: mainBranch.id,
        menuItemId: priceItem.id,
        priceOverride: 17.25,
      })
      .expect(201);

    const mainPriceList = await request(app.getHttpServer())
      .get('/api/v1/customer-app/items')
      .query({
        restaurantId: restaurant.id,
        branchId: mainBranch.id,
        limit: 50,
      })
      .expect(200);
    const mainPriceRaw = JSON.stringify(mainPriceList.body);
    expect(mainPriceRaw).toContain(`MS Price Probe ${runId}`);
    expect(mainPriceRaw).toContain('17.25');

    // --- MS-04: unavailable item ordering denial ---
    const cartResponse = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set(auth(customerToken))
      .send({
        branchId: siblingBranch.id,
        menuItemId: item.id,
        quantity: 1,
      })
      .expect((res) => {
        expect([400, 403, 404, 409, 422]).toContain(res.status);
      });
    expect(cartResponse.body).toMatchObject({ success: false });

    // --- MS-05: deleted item non-disclosure ---
    await request(app.getHttpServer())
      .delete(`/api/v1/menu/items/${item.id}`)
      .set(auth(ownerToken))
      .expect((res) => {
        expect([200, 201]).toContain(res.status);
      });

    const afterDelete = await request(app.getHttpServer())
      .get('/api/v1/customer-app/items')
      .query({
        restaurantId: restaurant.id,
        branchId: mainBranch.id,
        limit: 50,
      })
      .expect(200);
    expect(JSON.stringify(afterDelete.body)).not.toContain(
      `MS Signature Burger ${runId}`,
    );

    await request(app.getHttpServer())
      .get(`/api/v1/customer-app/items/${item.slug}`)
      .query({ restaurantId: restaurant.id })
      .expect(404);

    // --- MS-06: cross-tenant storefront isolation ---
    const foreignTenant = await prisma.tenant.create({
      data: {
        name: `MS Foreign Tenant ${runId}`,
        slug: `ms-foreign-tenant-${runId}`,
      },
    });
    const foreignRestaurant = await prisma.restaurant.create({
      data: {
        tenantId: foreignTenant.id,
        name: `MS Foreign Restaurant ${runId}`,
        slug: `ms-foreign-restaurant-${runId}`,
        subdomain: `ms-foreign-${runId}`,
      },
    });
    const foreignList = await request(app.getHttpServer())
      .get('/api/v1/customer-app/items')
      .query({ restaurantId: foreignRestaurant.id, limit: 50 })
      .expect(200);
    const foreignRaw = JSON.stringify(foreignList.body);
    expect(foreignRaw).not.toContain(`MS Signature Burger ${runId}`);
    expect(foreignRaw).not.toContain(`MS Price Probe ${runId}`);

    // Data invariant: override rows remain tenant-scoped
    const overrides = await prisma.branchMenuItemOverride.findMany({
      where: { menuItemId: { in: [item.id, priceItem.id] } },
    });
    for (const override of overrides) {
      const menuItem = await prisma.menuItem.findUniqueOrThrow({
        where: { id: override.menuItemId },
      });
      expect(menuItem.restaurantId).toBe(restaurant.id);
    }
  }, 120_000);
});
