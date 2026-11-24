import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import {
  applyPartnerFixture,
  assertPartnerFixtureSafety,
  cleanupPartnerFixture,
  getPartnerFixtureSummary,
  inspectPartnerFixtureTarget,
  PartnerFixtureTarget,
  validatePartnerFixtureTarget,
  verifyPartnerFixture,
} from './fixtures/development-partner.fixture';

type FixtureAction = 'dry-run' | 'apply' | 'verify' | 'cleanup';

function argument(name: string): string {
  return (
    process.argv
      .find((value) => value.startsWith('--' + name + '='))
      ?.slice(name.length + 3) ?? ''
  );
}

function readAction(): FixtureAction {
  const action = argument('action') || 'dry-run';
  if (!['dry-run', 'apply', 'verify', 'cleanup'].includes(action)) {
    throw new Error(
      'Unsupported fixture action. Use dry-run | apply | verify | cleanup.',
    );
  }
  return action as FixtureAction;
}

function readTarget(): PartnerFixtureTarget {
  return validatePartnerFixtureTarget({
    tenantId: argument('tenant-id'),
    restaurantId: argument('restaurant-id'),
    partnerEmail: argument('partner-email'),
  });
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const parsedUrl = assertPartnerFixtureSafety({
    nodeEnv: process.env.NODE_ENV,
    confirmation: process.env.DELIVERYWAYS_DEV_FIXTURE_CONFIRM,
    databaseUrl,
  });
  const action = readAction();
  const target = readTarget();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  try {
    const context = await inspectPartnerFixtureTarget(prisma, target);
    process.stdout.write(
      JSON.stringify(
        {
          action,
          mutation: action === 'apply' || action === 'cleanup',
          database: {
            host: parsedUrl.hostname,
            port: parsedUrl.port || '5432',
            name: decodeURIComponent(parsedUrl.pathname.replace(/^\//, '')),
          },
          planned: getPartnerFixtureSummary(target),
          validated: {
            branchId: context.branchId,
            partnerUserId: context.partnerUserId,
            existingLoyaltyProgram: Boolean(context.loyaltyProgramId),
          },
        },
        null,
        2,
      ) + '\n',
    );
    if (action === 'dry-run') return;
    const result =
      action === 'apply'
        ? await applyPartnerFixture(prisma, target)
        : action === 'verify'
          ? await verifyPartnerFixture(prisma, target)
          : await cleanupPartnerFixture(prisma, target);
    process.stdout.write(
      JSON.stringify(
        {
          status:
            action === 'apply'
              ? 'applied'
              : action === 'verify'
                ? 'verified'
                : 'cleaned',
          ...result,
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  process.stderr.write('Development partner fixture failed: ' + message + '\n');
  process.exitCode = 1;
});
