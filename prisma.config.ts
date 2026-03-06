import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Load local env files with override to avoid stale/global DATABASE_URL conflicts
loadEnv({ path: '.env.local', override: true });
loadEnv({ path: '.env', override: true });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set. Please configure it in .env');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
});
