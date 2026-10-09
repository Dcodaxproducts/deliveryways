import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import {
  applyDevelopmentPizzaFixture,
  assertDevelopmentFixtureSafety,
  cleanupDevelopmentPizzaFixture,
  getDevelopmentFixtureSummary,
  verifyDevelopmentPizzaFixture,
} from './fixtures/development-pizza.fixture';

type FixtureAction = 'dry-run' | 'apply' | 'verify' | 'cleanup';

function readAction(): FixtureAction {
  const argument = process.argv.find((value) => value.startsWith('--action='));
  const action = argument?.split('=')[1] ?? 'dry-run';
  if (!['dry-run', 'apply', 'verify', 'cleanup'].includes(action)) {
    throw new Error(
      'Unsupported fixture action. Use dry-run | apply | verify | cleanup.',
    );
  }
  return action as FixtureAction;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const parsedUrl = assertDevelopmentFixtureSafety({
    nodeEnv: process.env.NODE_ENV,
    confirmation: process.env.DELIVERYWAYS_DEV_FIXTURE_CONFIRM,
    databaseUrl,
  });
  const action = readAction();
  const summary = getDevelopmentFixtureSummary(
    process.env.CUSTOMER_APP_BASE_DOMAIN ?? 'localhost',
  );

  console.log(
    JSON.stringify(
      {
        action,
        database: {
          host: parsedUrl.hostname,
          port: parsedUrl.port || '5432',
          name: decodeURIComponent(parsedUrl.pathname.replace(/^\//, '')),
        },
        mutation: action === 'apply' || action === 'cleanup',
        planned: summary,
      },
      null,
      2,
    ),
  );

  if (action === 'dry-run') {
    return;
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  try {
    if (action === 'apply') {
      const applied = await applyDevelopmentPizzaFixture(prisma);
      console.log(JSON.stringify({ status: 'applied', ...applied }, null, 2));
      return;
    }
    if (action === 'verify') {
      const verified = await verifyDevelopmentPizzaFixture(prisma);
      console.log(JSON.stringify({ status: 'verified', ...verified }, null, 2));
      return;
    }

    await cleanupDevelopmentPizzaFixture(prisma);
    console.log(
      JSON.stringify(
        { status: 'cleaned', fixtureTag: summary.fixtureTag },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error('Development fixture failed: ' + message);
  process.exitCode = 1;
});
