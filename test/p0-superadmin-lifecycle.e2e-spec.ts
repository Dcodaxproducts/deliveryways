import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BillingInterval,
  PackageBillingModel,
  PackagePayoutCycle,
  PaymentStatus,
  SubscriptionStatus,
  UserRole,
} from '@prisma/client';
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
  message: string;
};

type LoginData = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    role: string;
    tenantId: string | null;
  };
};

type RegistrationData = LoginData & {
  ownerId: string;
  tenantId: string;
  restaurantId: string;
  branchId: string;
  subscription: {
    id: string;
    packagePlanId: string;
    status: string;
    paymentStatus: string;
  };
};

type PackagePlanData = {
  id: string;
  name: string;
};

type SubscriptionData = {
  id: string;
  tenantId: string;
  restaurantId: string | null;
  packagePlanId: string;
  status: string;
  paymentStatus: string;
  note: string | null;
};

describe('P0 Superadmin tenant lifecycle (isolated database)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const runId = `${Date.now()}-${process.pid}`;
  const superAdminEmail = `p0-superadmin-${runId}@example.test`;
  const ownerEmail = `p0-owner-${runId}@example.test`;
  const superAdminPassword = 'P0-superadmin-secure-123!';
  const ownerPassword = 'P0-owner-secure-123!';
  const tenantName = `P0 Tenant ${runId}`;
  const restaurantName = `P0 Restaurant ${runId}`;
  const branchName = `P0 Main Branch ${runId}`;

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
    await prisma.user.create({
      data: {
        email: superAdminEmail,
        password: await bcrypt.hash(superAdminPassword, 10),
        role: UserRole.SUPER_ADMIN,
        isVerified: true,
        isApproved: true,
        isActive: true,
      },
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('protects login, onboarding, approval, subscription, isolation, and logout invariants', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/package-plans')
      .expect(401);

    const superAdminLoginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: superAdminEmail,
        password: superAdminPassword,
        role: UserRole.SUPER_ADMIN,
      })
      .expect(201);
    const superAdminLogin =
      superAdminLoginResponse.body as ApiEnvelope<LoginData>;

    expect(superAdminLogin.success).toBe(true);
    expect(superAdminLogin.data.user.role).toBe(UserRole.SUPER_ADMIN);
    const superAdminToken = superAdminLogin.data.accessToken;

    const initialPlanResponse = await request(app.getHttpServer())
      .post('/api/v1/admin/package-plans')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        name: `P0 Trial Plan ${runId}`,
        billingModel: PackageBillingModel.PLAN,
        billingInterval: BillingInterval.MONTHLY,
        planPrice: 49,
        payoutCycle: PackagePayoutCycle.WEEKLY,
        currency: 'EUR',
        trialDays: 14,
        isActive: true,
      })
      .expect(201);
    const initialPlan =
      initialPlanResponse.body as ApiEnvelope<PackagePlanData>;

    const registrationPayload = {
      packagePlanId: initialPlan.data.id,
      user: {
        email: ownerEmail,
        password: ownerPassword,
        firstName: 'P0',
        lastName: 'Owner',
      },
      tenant: { name: tenantName },
      restaurant: { name: restaurantName },
      branch: {
        name: branchName,
        street: '1 Acceptance Street',
        postalCode: '10115',
        city: 'Berlin',
        state: 'Berlin',
        country: 'Germany',
        lat: '52.520008',
        lng: '13.404954',
      },
    };

    const registrationResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register-tenant')
      .send(registrationPayload)
      .expect(201);
    const registration =
      registrationResponse.body as ApiEnvelope<RegistrationData>;

    expect(registration.success).toBe(true);
    expect(registration.data.user).toMatchObject({
      id: registration.data.ownerId,
      role: UserRole.BUSINESS_ADMIN,
      tenantId: registration.data.tenantId,
    });
    expect(registration.data.subscription).toMatchObject({
      packagePlanId: initialPlan.data.id,
      status: SubscriptionStatus.TRIALING,
      paymentStatus: PaymentStatus.PAID,
    });

    const bootstrap = await prisma.tenant.findUnique({
      where: { id: registration.data.tenantId },
      include: {
        restaurants: true,
        branches: true,
        users: true,
        tenantSubscriptions: true,
      },
    });

    expect(bootstrap).not.toBeNull();
    expect(bootstrap?.ownerId).toBe(registration.data.ownerId);
    expect(bootstrap?.restaurants).toHaveLength(1);
    expect(bootstrap?.restaurants[0]).toMatchObject({
      id: registration.data.restaurantId,
      tenantId: registration.data.tenantId,
    });
    expect(bootstrap?.branches).toHaveLength(1);
    expect(bootstrap?.branches[0]).toMatchObject({
      id: registration.data.branchId,
      restaurantId: registration.data.restaurantId,
      tenantId: registration.data.tenantId,
      isMain: true,
    });
    expect(bootstrap?.users).toHaveLength(1);
    expect(bootstrap?.users[0]).toMatchObject({
      id: registration.data.ownerId,
      role: UserRole.BUSINESS_ADMIN,
      isVerified: false,
      isApproved: false,
    });
    expect(bootstrap?.tenantSubscriptions).toHaveLength(1);

    await request(app.getHttpServer())
      .post('/api/v1/auth/register-tenant')
      .send(registrationPayload)
      .expect(400);

    expect(await prisma.tenant.count({ where: { name: tenantName } })).toBe(1);
    expect(
      await prisma.restaurant.count({ where: { name: restaurantName } }),
    ).toBe(1);
    expect(await prisma.branch.count({ where: { name: branchName } })).toBe(1);
    expect(
      await prisma.tenantSubscription.count({
        where: { tenantId: registration.data.tenantId },
      }),
    ).toBe(1);

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: ownerEmail,
        password: ownerPassword,
        role: UserRole.BUSINESS_ADMIN,
      })
      .expect(403);

    await request(app.getHttpServer())
      .patch(
        `/api/v1/admin/users/business-admins/${registration.data.ownerId}/approve`,
      )
      .set('Authorization', `Bearer ${registration.data.accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .patch(
        `/api/v1/admin/users/business-admins/${registration.data.ownerId}/approve`,
      )
      .set('Authorization', `Bearer ${superAdminToken}`)
      .expect(200);

    const approvedOwner = await prisma.user.findUniqueOrThrow({
      where: { id: registration.data.ownerId },
    });
    expect(approvedOwner).toMatchObject({
      isVerified: true,
      isApproved: true,
      isActive: true,
    });

    const ownerLoginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: ownerEmail,
        password: ownerPassword,
        role: UserRole.BUSINESS_ADMIN,
      })
      .expect(201);
    const ownerLogin = ownerLoginResponse.body as ApiEnvelope<LoginData>;

    expect(ownerLogin.data.user).toMatchObject({
      id: registration.data.ownerId,
      role: UserRole.BUSINESS_ADMIN,
      tenantId: registration.data.tenantId,
    });

    await request(app.getHttpServer())
      .get(`/api/v1/tenants/${registration.data.tenantId}/analytics`)
      .set('Authorization', `Bearer ${ownerLogin.data.accessToken}`)
      .set('x-tenant-id', 'foreign-tenant-id')
      .expect(403);

    const replacementPlanResponse = await request(app.getHttpServer())
      .post('/api/v1/admin/package-plans')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        name: `P0 Growth Plan ${runId}`,
        billingModel: PackageBillingModel.HYBRID,
        billingInterval: BillingInterval.YEARLY,
        planPrice: 99,
        commissionPercentage: 2.5,
        payoutCycle: PackagePayoutCycle.MONTHLY,
        currency: 'EUR',
        trialDays: 0,
        isActive: true,
      })
      .expect(201);
    const replacementPlan =
      replacementPlanResponse.body as ApiEnvelope<PackagePlanData>;

    const assignmentResponse = await request(app.getHttpServer())
      .post('/api/v1/admin/package-plans/subscriptions')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        tenantId: registration.data.tenantId,
        restaurantId: registration.data.restaurantId,
        packagePlanId: replacementPlan.data.id,
        status: SubscriptionStatus.ACTIVE,
        paymentStatus: PaymentStatus.PAID,
        note: 'P0 replacement subscription',
      })
      .expect(201);
    const assignment = assignmentResponse.body as ApiEnvelope<SubscriptionData>;

    expect(assignment.data).toMatchObject({
      tenantId: registration.data.tenantId,
      restaurantId: registration.data.restaurantId,
      packagePlanId: replacementPlan.data.id,
      status: SubscriptionStatus.ACTIVE,
      paymentStatus: PaymentStatus.PAID,
    });

    const subscriptionUpdateResponse = await request(app.getHttpServer())
      .patch(`/api/v1/admin/package-plans/subscriptions/${assignment.data.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        status: SubscriptionStatus.ACTIVE,
        paymentStatus: PaymentStatus.PAID,
        note: 'P0 lifecycle verified',
      })
      .expect(200);
    const updatedSubscription =
      subscriptionUpdateResponse.body as ApiEnvelope<SubscriptionData>;

    expect(updatedSubscription.data).toMatchObject({
      id: assignment.data.id,
      status: SubscriptionStatus.ACTIVE,
      paymentStatus: PaymentStatus.PAID,
      note: 'P0 lifecycle verified',
    });

    const subscriptions = await prisma.tenantSubscription.findMany({
      where: { tenantId: registration.data.tenantId },
      orderBy: { createdAt: 'asc' },
    });
    expect(subscriptions).toHaveLength(2);
    expect(subscriptions[0].status).toBe(SubscriptionStatus.CANCELLED);
    expect(subscriptions[1]).toMatchObject({
      id: assignment.data.id,
      status: SubscriptionStatus.ACTIVE,
      paymentStatus: PaymentStatus.PAID,
      packagePlanId: replacementPlan.data.id,
    });
    expect(
      subscriptions.filter(
        (item) =>
          item.status === SubscriptionStatus.TRIALING ||
          item.status === SubscriptionStatus.ACTIVE,
      ),
    ).toHaveLength(1);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${ownerLogin.data.accessToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: ownerLogin.data.refreshToken })
      .expect(401);

    const loggedOutOwner = await prisma.user.findUniqueOrThrow({
      where: { id: registration.data.ownerId },
    });
    expect(loggedOutOwner.refreshTokenHash).toBeNull();
  }, 60_000);
});
