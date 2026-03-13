import * as bcrypt from 'bcrypt';
import { PrismaClient, UserRole } from '@prisma/client';

export async function seedDemo(prisma: PrismaClient): Promise<void> {
  const tenantSlug = process.env.SEED_DEMO_TENANT_SLUG ?? 'demo-tenant';
  const restaurantSlug =
    process.env.SEED_DEMO_RESTAURANT_SLUG ?? 'demo-restaurant';
  const businessAdminEmail =
    process.env.SEED_DEMO_BUSINESS_ADMIN_EMAIL ??
    'owner@demo.deliveryways.local';
  const businessAdminPassword =
    process.env.SEED_DEMO_BUSINESS_ADMIN_PASSWORD ?? 'Owner@123';

  const tenant =
    (await prisma.tenant.findUnique({ where: { slug: tenantSlug } })) ??
    (await prisma.tenant.create({
      data: {
        name: 'Demo Tenant',
        slug: tenantSlug,
        isActive: true,
      },
    }));

  const restaurant =
    (await prisma.restaurant.findUnique({ where: { slug: restaurantSlug } })) ??
    (await prisma.restaurant.create({
      data: {
        name: 'Demo Restaurant',
        slug: restaurantSlug,
        tenantId: tenant.id,
        isActive: true,
      },
    }));

  const branch =
    (await prisma.branch.findFirst({
      where: {
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        name: 'Main Branch',
      },
    })) ??
    (await prisma.branch.create({
      data: {
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        name: 'Main Branch',
        isMain: true,
        isActive: true,
      },
    }));

  const passwordHash = await bcrypt.hash(businessAdminPassword, 10);
  const existingAdmin = await prisma.user.findFirst({
    where: {
      email: businessAdminEmail,
      restaurantId: restaurant.id,
    },
    include: { profile: true },
  });

  if (existingAdmin) {
    await prisma.user.update({
      where: { id: existingAdmin.id },
      data: {
        password: passwordHash,
        role: UserRole.BUSINESS_ADMIN,
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        branchId: branch.id,
        isVerified: true,
        isApproved: true,
        isActive: true,
        deletedAt: null,
        profile: existingAdmin.profile
          ? {
              update: {
                firstName: 'Demo',
                lastName: 'Owner',
              },
            }
          : {
              create: {
                firstName: 'Demo',
                lastName: 'Owner',
              },
            },
      },
    });
  } else {
    await prisma.user.create({
      data: {
        email: businessAdminEmail,
        password: passwordHash,
        role: UserRole.BUSINESS_ADMIN,
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        branchId: branch.id,
        isVerified: true,
        isApproved: true,
        isActive: true,
        profile: {
          create: {
            firstName: 'Demo',
            lastName: 'Owner',
          },
        },
      },
    });
  }

  console.log('✅ Demo seed completed');
  console.log(`Demo tenant slug: ${tenant.slug}`);
  console.log(`Demo restaurant slug: ${restaurant.slug}`);
  console.log(`Business admin email: ${businessAdminEmail}`);
  console.log(`Business admin password: ${businessAdminPassword}`);
}
