import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { seedBase } from './seeds/base.seed';
import { seedDemo } from './seeds/demo.seed';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for seeding');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function main(): Promise<void> {
  const modeArg = process.argv.find((arg) => arg.startsWith('--mode='));
  const mode = (
    modeArg?.split('=')[1] ??
    process.env.SEED_MODE ??
    'base'
  ).toLowerCase();

  if (mode === 'base') {
    await seedBase(prisma);
    return;
  }

  if (mode === 'demo') {
    await seedDemo(prisma);
    return;
  }

  if (mode === 'all') {
    await seedBase(prisma);
    await seedDemo(prisma);
    return;
  }

  throw new Error(`Unsupported SEED mode: ${mode}. Use base | demo | all`);
}

main()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
