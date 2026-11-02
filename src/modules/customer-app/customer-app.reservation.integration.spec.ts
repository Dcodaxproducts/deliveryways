import { PrismaService } from '../../database';
import { CustomerAppRepository } from './customer-app.repository';

const describeDatabase =
  process.env.RUN_RESERVATION_DB_TESTS === '1' ? describe : describe.skip;

describeDatabase('CustomerAppRepository reservation concurrency', () => {
  let prisma: PrismaService;
  let repository: CustomerAppRepository;
  const tenantId = 'reservation-concurrency-tenant';
  const restaurantId = 'reservation-concurrency-restaurant';
  const branchId = 'reservation-concurrency-branch';

  beforeAll(async () => {
    prisma = new PrismaService();
    repository = new CustomerAppRepository(prisma);
    await prisma.$executeRawUnsafe(
      'INSERT INTO tenants (id, name, slug, is_active, created_at, updated_at) VALUES ($1, $2, $3, true, now(), now()) ON CONFLICT (id) DO NOTHING',
      tenantId,
      'Concurrency Tenant',
      tenantId,
    );
    await prisma.$executeRawUnsafe(
      'INSERT INTO restaurants (id, tenant_id, name, slug, subdomain, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, true, now(), now()) ON CONFLICT (id) DO NOTHING',
      restaurantId,
      tenantId,
      'Concurrency Restaurant',
      restaurantId,
      restaurantId,
    );
    await prisma.$executeRawUnsafe(
      'INSERT INTO branches (id, tenant_id, restaurant_id, name, is_main, is_active, created_at, updated_at) VALUES ($1, $2, $3, $4, true, true, now(), now()) ON CONFLICT (id) DO NOTHING',
      branchId,
      tenantId,
      restaurantId,
      'Concurrency Branch',
    );
  });

  afterEach(async () => {
    await prisma.tableReservation.deleteMany({ where: { branchId } });
  });

  afterAll(async () => {
    await prisma.branch.deleteMany({ where: { id: branchId } });
    await prisma.restaurant.deleteMany({ where: { id: restaurantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  const createInput = (clientRequestId: string) => ({
    tenantId,
    restaurantId,
    branchId,
    customerId: null,
    reservationDate: new Date('2099-03-30T19:30:00.000Z'),
    durationMinutes: 30,
    guestCount: 4,
    note: null,
    guestName: 'Concurrency Guest',
    guestEmail: 'guest@example.com',
    guestPhone: '+491701234567',
    idempotencyScope: `guest:${restaurantId}`,
    clientRequestId,
    requestFingerprint: 'a'.repeat(64),
    autoAccept: true,
    tableCount: 2,
  });

  it('creates one row for concurrent retries with the same key', async () => {
    const key = '10000000-0000-4000-8000-000000000001';
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        repository.createTableReservationAtomic(createInput(key)),
      ),
    );

    expect(new Set(results.map((result) => result.reservation.id)).size).toBe(
      1,
    );
    expect(results.filter((result) => result.created)).toHaveLength(1);
    await expect(
      prisma.tableReservation.count({ where: { branchId } }),
    ).resolves.toBe(1);
  });

  it('serializes concurrent auto-accept writes at branch capacity', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        repository.createTableReservationAtomic(
          createInput(
            `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
          ),
        ),
      ),
    );

    expect(
      results.filter((result) => result.reservation.status === 'CONFIRMED'),
    ).toHaveLength(2);
    await expect(
      prisma.tableReservation.count({
        where: { branchId, status: 'CONFIRMED' },
      }),
    ).resolves.toBe(2);
  });
});
