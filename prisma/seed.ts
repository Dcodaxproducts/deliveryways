import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for seeding');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function main(): Promise<void> {
  const superAdminEmail =
    process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@deliveryways.local';
  const superAdminPassword = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'Admin@123';

  const passwordHash = await bcrypt.hash(superAdminPassword, 10);

  const existing = await prisma.user.findFirst({
    where: {
      email: superAdminEmail,
      restaurantId: null,
    },
    include: { profile: true },
  });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        password: passwordHash,
        role: UserRole.SUPER_ADMIN,
        isVerified: true,
        isActive: true,
        deletedAt: null,
        profile: existing.profile
          ? {
              update: {
                firstName: 'Super',
                lastName: 'Admin',
                bio: 'System super admin user',
              },
            }
          : {
              create: {
                firstName: 'Super',
                lastName: 'Admin',
                bio: 'System super admin user',
              },
            },
      },
    });
  } else {
    await prisma.user.create({
      data: {
        email: superAdminEmail,
        password: passwordHash,
        role: UserRole.SUPER_ADMIN,
        isVerified: true,
        isActive: true,
        profile: {
          create: {
            firstName: 'Super',
            lastName: 'Admin',
            bio: 'System super admin user',
          },
        },
      },
    });
  }

  console.log('✅ Seed completed');
  console.log(`Super admin email: ${superAdminEmail}`);
  console.log(`Super admin password: ${superAdminPassword}`);
}

main()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
