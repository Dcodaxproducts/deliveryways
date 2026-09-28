import { TestingModule, Test } from '@nestjs/testing';
import { OrderType, PaymentMethod, Prisma, UserRole } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database';

describe('P0 checkout idempotency persistence (isolated database)', () => {
  let moduleFixture: TestingModule;
  let prisma: PrismaService;
  const runId = `${Date.now()}-${process.pid}`;

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = moduleFixture.get(PrismaService);
  }, 60_000);

  afterAll(async () => {
    await moduleFixture.close();
  });

  it('arbitrates concurrent retries, rolls back failed attempts, and isolates authenticated and guest scopes', async () => {
    const tenant = await prisma.tenant.create({
      data: {
        name: `Idempotency Tenant ${runId}`,
        slug: `idem-tenant-${runId}`,
      },
    });
    const restaurant = await prisma.restaurant.create({
      data: {
        tenantId: tenant.id,
        name: `Idempotency Restaurant ${runId}`,
        slug: `idem-restaurant-${runId}`,
        subdomain: `idem-${runId}`,
      },
    });
    const branch = await prisma.branch.create({
      data: {
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        name: 'Idempotency Branch',
      },
    });
    const [customer, guest] = await Promise.all([
      prisma.user.create({
        data: {
          email: `idem-customer-${runId}@example.test`,
          password: 'not-used',
          role: UserRole.CUSTOMER,
          tenantId: tenant.id,
          restaurantId: restaurant.id,
          branchId: branch.id,
          isVerified: true,
          isApproved: true,
        },
      }),
      prisma.user.create({
        data: {
          email: `idem-guest-${runId}@guest.feastflow.local`,
          password: 'not-used',
          role: UserRole.CUSTOMER,
          tenantId: tenant.id,
          restaurantId: restaurant.id,
          branchId: branch.id,
          isGuest: true,
          isVerified: true,
          isApproved: true,
        },
      }),
    ]);

    const key = '8b5cb490-a31b-4d88-a8db-776e8a6eb1cb';
    const hash = 'a'.repeat(64);
    const orderData = (
      customerId: string,
      idempotencyKey: string,
      requestHash: string,
    ) => ({
      tenantId: tenant.id,
      restaurantId: restaurant.id,
      branchId: branch.id,
      customerId,
      checkoutIdempotencyKey: idempotencyKey,
      checkoutRequestHash: requestHash,
      orderType: OrderType.TAKEAWAY,
      paymentMethod: PaymentMethod.COD,
      subtotal: new Prisma.Decimal(10),
      totalAmount: new Prisma.Decimal(10),
    });

    const concurrent = await Promise.allSettled([
      prisma.order.create({ data: orderData(customer.id, key, hash) }),
      prisma.order.create({ data: orderData(customer.id, key, hash) }),
    ]);
    expect(
      concurrent.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      concurrent.filter(({ status }) => status === 'rejected'),
    ).toHaveLength(1);
    await expect(
      prisma.order.count({
        where: {
          tenantId: tenant.id,
          restaurantId: restaurant.id,
          customerId: customer.id,
          checkoutIdempotencyKey: key,
        },
      }),
    ).resolves.toBe(1);

    const rollbackKey = '4d931f45-e93c-4a83-a456-b0cc677461a8';
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.order.create({
          data: orderData(customer.id, rollbackKey, 'b'.repeat(64)),
        });
        throw new Error('forced rollback');
      }),
    ).rejects.toThrow('forced rollback');
    await expect(
      prisma.order.create({
        data: orderData(customer.id, rollbackKey, 'b'.repeat(64)),
      }),
    ).resolves.toMatchObject({ checkoutIdempotencyKey: rollbackKey });

    const checkoutCart = await prisma.cart.create({
      data: {
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        branchId: branch.id,
        customerId: guest.id,
        orderType: OrderType.TAKEAWAY,
      },
    });
    const atomicKey = 'c3e3e3d0-09d2-4f97-a57d-f86d93ea2be5';
    const consumeCartAndCreateOrder = () =>
      prisma.$transaction(async (tx) => {
        const consumed = await tx.cart.deleteMany({
          where: {
            id: checkoutCart.id,
            tenantId: tenant.id,
            restaurantId: restaurant.id,
            customerId: guest.id,
            updatedAt: checkoutCart.updatedAt,
          },
        });
        expect(consumed.count).toBe(1);
        return tx.order.create({
          data: orderData(guest.id, atomicKey, 'c'.repeat(64)),
        });
      });

    const atomicConcurrent = await Promise.allSettled([
      consumeCartAndCreateOrder(),
      consumeCartAndCreateOrder(),
    ]);
    expect(
      atomicConcurrent.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      atomicConcurrent.filter(({ status }) => status === 'rejected'),
    ).toHaveLength(1);
    await expect(
      prisma.order.count({
        where: { customerId: guest.id, checkoutIdempotencyKey: atomicKey },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.cart.count({ where: { id: checkoutCart.id } }),
    ).resolves.toBe(0);

    await expect(
      prisma.order.create({ data: orderData(guest.id, key, hash) }),
    ).resolves.toMatchObject({ customerId: guest.id });
  });
});
