import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
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

type AuthData = {
  accessToken: string;
  user: {
    id: string;
    role: UserRole;
  };
  verificationOtp?: string;
};

type OtpData = {
  resetOtp?: string;
  verificationOtp?: string;
};

describe('P0 shared-email auth isolation (isolated database)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const runId = `${Date.now()}-${process.pid}`;
  const sharedEmail = `shared-auth-${runId}@example.test`;
  const googleSharedEmail = `shared-google-${runId}@example.test`;
  const adminPassword = 'Admin-secure-123!';
  const customerPassword = 'Customer-secure-123!';
  const changedCustomerPassword = 'Customer-changed-456!';
  const originalGoogleClientId = process.env.GOOGLE_CLIENT_ID;

  beforeAll(async () => {
    process.env.GOOGLE_CLIENT_ID = 'p0-google-client';

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

    if (originalGoogleClientId === undefined) {
      delete process.env.GOOGLE_CLIENT_ID;
    } else {
      process.env.GOOGLE_CLIENT_ID = originalGoogleClientId;
    }
  });

  it('keeps customer registration, login, Google, OTP, reset, and deletion recovery isolated from admins', async () => {
    const tenant = await prisma.tenant.create({
      data: {
        name: `Shared Auth Tenant ${runId}`,
        slug: `shared-auth-tenant-${runId}`,
      },
    });
    const restaurant = await prisma.restaurant.create({
      data: {
        tenantId: tenant.id,
        name: `Shared Auth Restaurant ${runId}`,
        slug: `shared-auth-restaurant-${runId}`,
        subdomain: `shared-auth-${runId}`,
      },
    });
    const branch = await prisma.branch.create({
      data: {
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        name: 'Shared Auth Main',
        isMain: true,
      },
    });
    const adminPasswordHash = await bcrypt.hash(adminPassword, 10);
    const admin = await prisma.user.create({
      data: {
        email: sharedEmail,
        password: adminPasswordHash,
        role: UserRole.BRANCH_ADMIN,
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        branchId: branch.id,
        isVerified: true,
        isApproved: true,
        isActive: true,
      },
    });

    const registrationResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register-customer')
      .send({
        email: sharedEmail,
        password: customerPassword,
        restaurantId: restaurant.id,
        firstName: 'Shared',
        lastName: 'Customer',
      })
      .expect(201);
    const registration = registrationResponse.body as ApiEnvelope<AuthData>;
    expect(registration.data.user.role).toBe(UserRole.CUSTOMER);

    const sharedIdentities = await prisma.user.findMany({
      where: { email: sharedEmail, restaurantId: restaurant.id },
      orderBy: { role: 'asc' },
    });
    expect(sharedIdentities.map((user) => user.role)).toEqual([
      UserRole.BRANCH_ADMIN,
      UserRole.CUSTOMER,
    ]);
    const customer = sharedIdentities.find(
      (user) => user.role === UserRole.CUSTOMER,
    );
    expect(customer).toBeDefined();

    const customerLoginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: sharedEmail,
        password: customerPassword,
        restaurantId: restaurant.id,
      })
      .expect(201);
    const customerLogin = customerLoginResponse.body as ApiEnvelope<AuthData>;
    expect(customerLogin.data.user).toMatchObject({
      id: customer?.id,
      role: UserRole.CUSTOMER,
    });

    const adminLoginResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: sharedEmail,
        password: adminPassword,
        role: UserRole.BRANCH_ADMIN,
      })
      .expect(201);
    const adminLogin = adminLoginResponse.body as ApiEnvelope<AuthData>;
    expect(adminLogin.data.user).toMatchObject({
      id: admin.id,
      role: UserRole.BRANCH_ADMIN,
    });

    const duplicateRegistrationResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register-customer')
      .send({
        email: sharedEmail,
        password: customerPassword,
        restaurantId: restaurant.id,
        firstName: 'Duplicate',
        lastName: 'Customer',
      })
      .expect(400);
    expect(duplicateRegistrationResponse.body).toMatchObject({
      success: false,
      error: { message: 'Email already exists' },
    });

    const verificationResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/resend-otp')
      .send({
        email: sharedEmail,
        restaurantId: restaurant.id,
        purpose: 'VERIFICATION',
      })
      .expect(201);
    const verification = verificationResponse.body as ApiEnvelope<OtpData>;
    expect(verification.data.verificationOtp).toMatch(/^\d{6}$/);

    const passwordResetResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: sharedEmail, restaurantId: restaurant.id })
      .expect(201);
    const passwordReset = passwordResetResponse.body as ApiEnvelope<OtpData>;
    expect(passwordReset.data.resetOtp).toMatch(/^\d{6}$/);

    const identitiesAfterOtp = await prisma.user.findMany({
      where: { id: { in: [admin.id, customer?.id as string] } },
    });
    const adminAfterOtp = identitiesAfterOtp.find(
      (user) => user.id === admin.id,
    );
    const customerAfterOtp = identitiesAfterOtp.find(
      (user) => user.id === customer?.id,
    );
    expect(adminAfterOtp).toMatchObject({
      verificationOtp: null,
      resetPasswordOtp: null,
    });
    expect(customerAfterOtp).toMatchObject({
      verificationOtp: verification.data.verificationOtp,
      resetPasswordOtp: passwordReset.data.resetOtp,
    });

    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({
        email: sharedEmail,
        restaurantId: restaurant.id,
        otp: passwordReset.data.resetOtp,
        newPassword: changedCustomerPassword,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: sharedEmail,
        password: changedCustomerPassword,
        restaurantId: restaurant.id,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: sharedEmail,
        password: adminPassword,
        role: UserRole.BRANCH_ADMIN,
      })
      .expect(201);

    await prisma.user.update({
      where: { id: customer?.id as string },
      data: {
        isActive: false,
        deletedAt: new Date(),
        deleteAfter: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    const cancelDeletionResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/cancel-deletion-login')
      .send({
        email: sharedEmail,
        password: changedCustomerPassword,
        restaurantId: restaurant.id,
      })
      .expect(201);
    const cancelDeletion = cancelDeletionResponse.body as ApiEnvelope<AuthData>;
    expect(cancelDeletion.data.user).toMatchObject({
      id: customer?.id,
      role: UserRole.CUSTOMER,
    });

    await prisma.user.create({
      data: {
        email: googleSharedEmail,
        password: adminPasswordHash,
        role: UserRole.BRANCH_ADMIN,
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        branchId: branch.id,
        isVerified: true,
        isApproved: true,
        isActive: true,
      },
    });
    const googleFetch = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        aud: 'p0-google-client',
        email: googleSharedEmail,
        email_verified: 'true',
        given_name: 'Google',
        family_name: 'Customer',
      }),
    } as never);

    try {
      const googleLoginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/google-login')
        .send({
          idToken: 'p0-valid-google-id-token',
          restaurantId: restaurant.id,
        })
        .expect(201);
      const googleLogin = googleLoginResponse.body as ApiEnvelope<AuthData>;
      expect(googleLogin.data.user.role).toBe(UserRole.CUSTOMER);
    } finally {
      googleFetch.mockRestore();
    }

    const googleIdentities = await prisma.user.findMany({
      where: { email: googleSharedEmail, restaurantId: restaurant.id },
      orderBy: { role: 'asc' },
    });
    expect(googleIdentities.map((user) => user.role)).toEqual([
      UserRole.BRANCH_ADMIN,
      UserRole.CUSTOMER,
    ]);
  }, 60_000);
});
