import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { StaffAccountType, StaffPanelType } from '@prisma/client';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { Public, PosPrinterAccess } from '../decorators';
import { PrismaService } from '../../database';
import { JwtStrategy } from '../../modules/auth/strategies/jwt.strategy';
import { OptionalJwtAuthGuard } from '../../modules/storage/optional-jwt-auth.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PosPrinterAccessGuard } from './pos-printer-access.guard';
import { ConfigService } from '@nestjs/config';

@Controller('guard-order')
class GuardOrderController {
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('storage-presign')
  storagePresign() {
    return { ok: true };
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('gift-card-purchase')
  giftCardPurchase() {
    return { ok: true };
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('payment-customer')
  paymentCustomer() {
    return { ok: true };
  }

  @PosPrinterAccess()
  @Get('orders')
  orders() {
    return { ok: true };
  }
}

describe('global POS guard order (integration)', () => {
  let app: INestApplication<App>;
  let token: string;
  const staff = {
    authVersion: 3,
    deletedAt: null,
    isActive: true,
    tenantId: 'tenant-1',
    restaurantId: 'restaurant-1',
    branchId: 'branch-1',
    ownerUserId: 'owner-1',
    staffRoleId: 'role-1',
    panelType: StaffPanelType.BRANCH_ADMIN,
    accountType: StaffAccountType.POS_PRINTER,
    staffRole: { isActive: true, deletedAt: null },
  };

  beforeAll(async () => {
    const prisma = {
      staffUser: { findUnique: jest.fn().mockResolvedValue(staff) },
    };
    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: 'guard-order-secret' }),
      ],
      controllers: [GuardOrderController],
      providers: [
        OptionalJwtAuthGuard,
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback: string) =>
              key === 'JWT_ACCESS_SECRET' ? 'guard-order-secret' : fallback,
          },
        },
        { provide: PrismaService, useValue: prisma },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: PosPrinterAccessGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    token = await moduleRef.get(JwtService).signAsync({
      uid: 'printer-1',
      actorType: 'STAFF',
      role: 'STAFF',
      tid: 'tenant-1',
      rid: 'restaurant-1',
      bid: 'branch-1',
      ownerUserId: 'owner-1',
      staffRoleId: 'role-1',
      panelType: StaffPanelType.BRANCH_ADMIN,
      accountType: StaffAccountType.POS_PRINTER,
      ver: 3,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(['storage-presign', 'gift-card-purchase', 'payment-customer'])(
    'classifies and denies POS bearer before public/optional route %s',
    (path) =>
      request(app.getHttpServer())
        .get('/guard-order/' + path)
        .set('Authorization', 'Bearer ' + token)
        .expect(403),
  );

  it('preserves anonymous access to public/optional routes', () =>
    request(app.getHttpServer())
      .get('/guard-order/storage-presign')
      .expect(200));

  it('permits only explicitly marked order-management routes', () =>
    request(app.getHttpServer())
      .get('/guard-order/orders')
      .set('Authorization', 'Bearer ' + token)
      .expect(200));

  it('invalidates an existing access token immediately after session version changes', async () => {
    staff.authVersion = 4;
    await request(app.getHttpServer())
      .get('/guard-order/orders')
      .set('Authorization', 'Bearer ' + token)
      .expect(401);
    staff.authVersion = 3;
  });
});
