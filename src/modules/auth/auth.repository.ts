import { Injectable } from '@nestjs/common';
import { AddressRefType, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../database';
import { QueryDto } from '../../common/dto';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUserByEmail(email: string, restaurantId?: string) {
    return this.prisma.user.findFirst({
      where: {
        email,
        restaurantId: restaurantId ?? null,
        deletedAt: null,
      },
      include: {
        profile: true,
      },
    });
  }

  async findUserById(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
      },
    });
  }

  async createTenantOnboarding(payload: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    tenantName: string;
    tenantSlug: string;
    restaurantName: string;
    restaurantSlug: string;
    branchName: string;
    street: string;
    area?: string;
    city: string;
    state: string;
    country: string;
    verificationToken: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const owner = await tx.user.create({
        data: {
          email: payload.email,
          password: payload.password,
          role: UserRole.BUSINESS_ADMIN,
          isVerified: false,
          verificationToken: payload.verificationToken,
        },
      });

      const tenant = await tx.tenant.create({
        data: {
          name: payload.tenantName,
          slug: payload.tenantSlug,
          ownerId: owner.id,
        },
      });

      const restaurant = await tx.restaurant.create({
        data: {
          tenantId: tenant.id,
          name: payload.restaurantName,
          slug: payload.restaurantSlug,
        },
      });

      const branch = await tx.branch.create({
        data: {
          tenantId: tenant.id,
          restaurantId: restaurant.id,
          name: payload.branchName,
          isMain: true,
        },
      });

      await tx.address.create({
        data: {
          tenantId: tenant.id,
          referenceId: branch.id,
          refType: AddressRefType.BRANCH,
          street: payload.street,
          area: payload.area,
          city: payload.city,
          state: payload.state,
          country: payload.country,
        },
      });

      await tx.user.update({
        where: { id: owner.id },
        data: {
          tenantId: tenant.id,
          restaurantId: restaurant.id,
          branchId: branch.id,
        },
      });

      await tx.profile.create({
        data: {
          userId: owner.id,
          firstName: payload.firstName,
          lastName: payload.lastName,
        },
      });

      return {
        ownerId: owner.id,
        tenantId: tenant.id,
        restaurantId: restaurant.id,
        branchId: branch.id,
        email: owner.email,
      };
    });
  }

  async findRestaurantById(restaurantId: string) {
    return this.prisma.restaurant.findFirst({
      where: {
        id: restaurantId,
        deletedAt: null,
      },
    });
  }

  async createCustomer(payload: {
    email: string;
    password: string;
    restaurantId: string;
    tenantId: string;
    firstName: string;
    lastName: string;
    phone?: string;
    verificationToken: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: payload.email,
          password: payload.password,
          role: UserRole.CUSTOMER,
          restaurantId: payload.restaurantId,
          tenantId: payload.tenantId,
          isVerified: false,
          verificationToken: payload.verificationToken,
        },
      });

      await tx.profile.create({
        data: {
          userId: user.id,
          firstName: payload.firstName,
          lastName: payload.lastName,
          phone: payload.phone,
        },
      });

      return user;
    });
  }

  async verifyUserEmail(email: string, token: string) {
    return this.prisma.user.updateMany({
      where: {
        email,
        verificationToken: token,
        deletedAt: null,
      },
      data: {
        isVerified: true,
        verificationToken: null,
      },
    });
  }

  async setVerificationToken(email: string, token: string | null) {
    return this.prisma.user.updateMany({
      where: {
        email,
        deletedAt: null,
      },
      data: {
        verificationToken: token,
      },
    });
  }

  async setRefreshTokenHash(userId: string, tokenHash: string | null) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        refreshTokenHash: tokenHash,
      },
    });
  }

  async softDeleteUser(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
        isActive: false,
        deleteAfter: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  }

  async cancelDeleteUser(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: null,
        isActive: true,
        deleteAfter: null,
      },
    });
  }

  async updatePassword(userId: string, hashedPassword: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
      },
    });
  }

  async listUsers(query: QueryDto, where: Prisma.UserWhereInput) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: {
          [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc',
        },
        include: {
          profile: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total };
  }
}
