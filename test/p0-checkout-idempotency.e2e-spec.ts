import { TestingModule, Test } from '@nestjs/testing';
import {
  OrderType,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
  Prisma,
  UserRole,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database';
import { CartService } from '../src/modules/cart/cart.service';
import { GlobalSettingsService } from '../src/modules/global-settings/global-settings.service';
import { OrdersService } from '../src/modules/orders/orders.service';

describe('P0 checkout idempotency persistence (isolated database)', () => {
  let moduleFixture: TestingModule;
  let prisma: PrismaService;
  let cartService: CartService;
  let globalSettingsService: GlobalSettingsService;
  let ordersService: OrdersService;
  const runId = `${Date.now()}-${process.pid}`;

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = moduleFixture.get(PrismaService);
    cartService = moduleFixture.get(CartService);
    globalSettingsService = moduleFixture.get(GlobalSettingsService);
    ordersService = moduleFixture.get(OrdersService);
  }, 60_000);

  afterAll(async () => {
    await moduleFixture.close();
  });

  it('replays concurrent CartService checkout with one order and one payment effect', async () => {
    await globalSettingsService.getCartExpiryMinutes();
    const tenant = await prisma.tenant.create({
      data: {
        name: `Checkout Service Tenant ${runId}`,
        slug: `checkout-service-tenant-${runId}`,
      },
    });
    const restaurant = await prisma.restaurant.create({
      data: {
        tenantId: tenant.id,
        name: `Checkout Service Restaurant ${runId}`,
        slug: `checkout-service-restaurant-${runId}`,
        subdomain: `checkout-service-${runId}`,
      },
    });
    const branch = await prisma.branch.create({
      data: {
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        name: 'Checkout Service Branch',
      },
    });
    await prisma.loyaltyProgram.create({
      data: {
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        isActive: false,
      },
    });
    const customer = await prisma.user.create({
      data: {
        email: `checkout-service-${runId}@example.test`,
        password: 'not-used',
        role: UserRole.CUSTOMER,
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        branchId: branch.id,
        isVerified: true,
        isApproved: true,
      },
    });
    const category = await prisma.menuCategory.create({
      data: {
        restaurantId: restaurant.id,
        name: 'Checkout Service',
        slug: `checkout-service-${runId}`,
      },
    });
    const menuItem = await prisma.menuItem.create({
      data: {
        restaurantId: restaurant.id,
        categoryId: category.id,
        name: 'Concurrent checkout item',
        slug: `checkout-service-item-${runId}`,
        basePrice: 10,
      },
    });
    const cart = await prisma.cart.create({
      data: {
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        branchId: branch.id,
        customerId: customer.id,
        orderType: OrderType.TAKEAWAY,
        paymentMethod: PaymentMethod.COD,
        items: {
          create: { menuItemId: menuItem.id, quantity: 2 },
        },
      },
    });
    const user = {
      uid: customer.id,
      tid: tenant.id,
      rid: restaurant.id,
      role: UserRole.CUSTOMER,
    };
    const dto = {
      idempotencyKey: '717648d5-1084-4f4b-b8af-5b331584ee6e',
      cartId: cart.id,
      cartVersion: cart.updatedAt.toISOString(),
      cartRevision: cart.revision,
      paymentMethod: PaymentMethod.COD,
    };

    const results = await Promise.all([
      cartService.checkout(user as never, dto as never),
      cartService.checkout(user as never, dto as never),
    ]);
    expect(results[0].data.id).toBe(results[1].data.id);
    const orderId = results[0].data.id;
    await expect(
      prisma.order.count({
        where: {
          customerId: customer.id,
          checkoutIdempotencyKey: dto.idempotencyKey,
        },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.paymentTransaction.count({ where: { orderId } }),
    ).resolves.toBe(1);
    await expect(
      prisma.loyaltyTransaction.count({ where: { orderId } }),
    ).resolves.toBe(0);
    await expect(
      prisma.loyaltyAccount.count({ where: { customerId: customer.id } }),
    ).resolves.toBe(0);
    await expect(prisma.cart.count({ where: { id: cart.id } })).resolves.toBe(
      0,
    );
    await expect(
      prisma.orderItem.findMany({
        where: { orderId },
        select: { menuItemId: true, quantity: true },
      }),
    ).resolves.toEqual([{ menuItemId: menuItem.id, quantity: 2 }]);
    await expect(
      cartService.checkout(
        user as never,
        {
          ...dto,
          customerNote: 'different request',
        } as never,
      ),
    ).rejects.toThrow(
      'Idempotency key was already used with a different checkout request',
    );
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
            revision: checkoutCart.revision,
          },
        });
        expect(consumed.count).toBe(1);
        const order = await tx.order.create({
          data: orderData(guest.id, atomicKey, 'c'.repeat(64)),
        });
        await tx.paymentTransaction.create({
          data: {
            orderId: order.id,
            tenantId: tenant.id,
            restaurantId: restaurant.id,
            branchId: branch.id,
            paymentMethod: PaymentMethod.COD,
            type: PaymentTransactionType.CHARGE,
            status: PaymentStatus.PENDING,
            amount: new Prisma.Decimal(10),
            currency: 'EUR',
          },
        });
        return order;
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
    const committedOrder = atomicConcurrent.find(
      (result) => result.status === 'fulfilled',
    );
    if (!committedOrder || committedOrder.status !== 'fulfilled') {
      throw new Error('Expected one committed checkout order');
    }
    const committedOrderId = committedOrder.value.id;
    await expect(
      prisma.paymentTransaction.count({
        where: { orderId: committedOrderId },
      }),
    ).resolves.toBe(1);

    const replayContext = {
      tenantId: tenant.id,
      restaurantId: restaurant.id,
      customerId: guest.id,
      idempotencyKey: atomicKey,
      requestHash: 'c'.repeat(64),
      cartId: checkoutCart.id,
      cartVersion: checkoutCart.updatedAt,
      cartRevision: checkoutCart.revision,
    };
    await expect(
      ordersService.resolveCheckoutIdempotency(replayContext),
    ).resolves.toMatchObject({ data: { id: committedOrderId } });
    await expect(
      ordersService.resolveCheckoutIdempotency({
        ...replayContext,
        requestHash: 'f'.repeat(64),
      }),
    ).rejects.toThrow(
      'Idempotency key was already used with a different checkout request',
    );

    const [differentKeyCustomer, staleCustomer, rollbackCustomer] =
      await Promise.all(
        ['different-key', 'stale', 'rollback'].map((scope) =>
          prisma.user.create({
            data: {
              email: `idem-${scope}-${runId}@example.test`,
              password: 'not-used',
              role: UserRole.CUSTOMER,
              tenantId: tenant.id,
              restaurantId: restaurant.id,
              branchId: branch.id,
              isVerified: true,
              isApproved: true,
            },
          }),
        ),
      );

    const differentKeyCart = await prisma.cart.create({
      data: {
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        branchId: branch.id,
        customerId: differentKeyCustomer.id,
        orderType: OrderType.TAKEAWAY,
      },
    });
    const consumeWithKey = (idempotencyKey: string) =>
      prisma.$transaction(async (tx) => {
        const consumed = await tx.cart.deleteMany({
          where: {
            id: differentKeyCart.id,
            tenantId: tenant.id,
            restaurantId: restaurant.id,
            customerId: differentKeyCustomer.id,
            updatedAt: differentKeyCart.updatedAt,
            revision: differentKeyCart.revision,
          },
        });
        if (consumed.count !== 1) {
          throw new Error('stale cart');
        }
        return tx.order.create({
          data: orderData(
            differentKeyCustomer.id,
            idempotencyKey,
            'd'.repeat(64),
          ),
        });
      });
    const differentKeys = await Promise.allSettled([
      consumeWithKey('0b83a855-3e53-4d8b-8d36-7fa3678f2468'),
      consumeWithKey('42e7a537-003d-45e8-9f57-a65394765b95'),
    ]);
    expect(
      differentKeys.filter(({ status }) => status === 'fulfilled'),
    ).toHaveLength(1);
    await expect(
      prisma.order.count({ where: { customerId: differentKeyCustomer.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.cart.count({ where: { id: differentKeyCart.id } }),
    ).resolves.toBe(0);

    const staleCart = await prisma.cart.create({
      data: {
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        branchId: branch.id,
        customerId: staleCustomer.id,
        orderType: OrderType.TAKEAWAY,
      },
    });
    await prisma.$transaction(async (tx) => {
      await tx.cartItem.create({
        data: {
          cartId: staleCart.id,
          menuItemId: `removed-menu-item-${runId}`,
          quantity: 1,
        },
      });
      await tx.cart.update({
        where: { id: staleCart.id },
        data: { revision: { increment: 1 } },
      });
    });
    const staleConsume = await prisma.cart.deleteMany({
      where: {
        id: staleCart.id,
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        customerId: staleCustomer.id,
        updatedAt: staleCart.updatedAt,
        revision: staleCart.revision,
      },
    });
    expect(staleConsume.count).toBe(0);
    await expect(
      prisma.cart.findUniqueOrThrow({ where: { id: staleCart.id } }),
    ).resolves.toMatchObject({ revision: staleCart.revision + 1 });
    await expect(
      prisma.cartItem.count({ where: { cartId: staleCart.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.order.count({ where: { customerId: staleCustomer.id } }),
    ).resolves.toBe(0);

    const rollbackCart = await prisma.cart.create({
      data: {
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        branchId: branch.id,
        customerId: rollbackCustomer.id,
        orderType: OrderType.TAKEAWAY,
      },
    });
    const failedKey = '0e856b82-1655-4894-b621-cd9b2ddba6a3';
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.cart.delete({ where: { id: rollbackCart.id } });
        await tx.order.create({
          data: orderData(rollbackCustomer.id, failedKey, 'e'.repeat(64)),
        });
        throw new Error('forced checkout failure');
      }),
    ).rejects.toThrow('forced checkout failure');
    await expect(
      prisma.cart.count({ where: { id: rollbackCart.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.order.count({
        where: {
          customerId: rollbackCustomer.id,
          checkoutIdempotencyKey: failedKey,
        },
      }),
    ).resolves.toBe(0);

    await expect(
      prisma.order.create({ data: orderData(guest.id, key, hash) }),
    ).resolves.toMatchObject({ customerId: guest.id });
  });
});
