import { Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { AdminListQueryDto } from '../../common/dto';
import { PrismaService } from '../../database';
import { PrismaTx } from '../../common/types';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx) {
    return tx ?? this.prisma;
  }

  async create(data: Prisma.UserCreateInput, tx?: PrismaTx) {
    return this.client(tx).user.create({ data });
  }

  async update(id: string, data: Prisma.UserUpdateInput, tx?: PrismaTx) {
    return this.client(tx).user.update({ where: { id }, data });
  }

  async findByEmail(email: string, restaurantId?: string) {
    return this.prisma.user.findFirst({
      where: {
        email,
        deletedAt: null,
        ...(restaurantId !== undefined ? { restaurantId } : {}),
      },
      include: { profile: true },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { profile: true },
    });
  }

  async listCustomers(
    tenantId: string,
    query: AdminListQueryDto & {
      restaurantId?: string;
      isVerified?: boolean;
      isActive?: boolean;
    },
    withDeleted = false,
  ) {
    const where: Prisma.UserWhereInput = {
      tenantId,
      role: UserRole.CUSTOMER,
      ...(query.restaurantId ? { restaurantId: query.restaurantId } : {}),
      ...(query.isVerified !== undefined
        ? { isVerified: query.isVerified }
        : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(withDeleted ? {} : { deletedAt: null }),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' } },
              {
                profile: {
                  OR: [
                    {
                      firstName: {
                        contains: query.search,
                        mode: 'insensitive',
                      },
                    },
                    {
                      lastName: { contains: query.search, mode: 'insensitive' },
                    },
                    { phone: { contains: query.search, mode: 'insensitive' } },
                  ],
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: { profile: true },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: {
          [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc',
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total };
  }

  async updateByEmail(
    email: string,
    data: Prisma.UserUpdateManyMutationInput,
    restaurantId?: string,
  ) {
    return this.prisma.user.updateMany({
      where: {
        email,
        deletedAt: null,
        ...(restaurantId !== undefined ? { restaurantId } : {}),
      },
      data,
    });
  }

  async verifyUserEmailByOtp(userId: string, otp: string, now: Date) {
    return this.prisma.user.updateMany({
      where: {
        id: userId,
        verificationOtp: otp,
        verificationOtpExpiresAt: { gte: now },
        deletedAt: null,
      },
      data: {
        isVerified: true,
        verificationOtp: null,
        verificationOtpExpiresAt: null,
        verificationOtpAttempts: 0,
      },
    });
  }

  async incrementVerificationOtpAttempts(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        verificationOtpAttempts: { increment: 1 },
      },
    });
  }

  async forceDeleteUsersByEmails(emails: string[]) {
    const users = await this.prisma.user.findMany({
      where: { email: { in: emails } },
      select: {
        id: true,
        email: true,
        role: true,
        _count: {
          select: {
            tenantOwned: true,
            managedBranches: true,
            createdMovements: true,
            customerOrders: true,
            couponUsages: true,
          },
        },
      },
    });

    const foundEmails = new Set(users.map((user) => user.email.toLowerCase()));
    const notFound = emails.filter(
      (email) => !foundEmails.has(email.toLowerCase()),
    );

    const deleted: string[] = [];
    const blocked: Array<{ email: string; reasons: string[] }> = [];

    for (const user of users) {
      const reasons: string[] = [];

      if (user.role === UserRole.SUPER_ADMIN) {
        reasons.push('super admin accounts cannot be force deleted');
      }

      if (user._count.tenantOwned > 0) {
        reasons.push('user is assigned as tenant owner');
      }

      if (user._count.managedBranches > 0) {
        reasons.push('user is assigned as branch manager');
      }

      if (user._count.createdMovements > 0) {
        reasons.push('user has inventory movement history');
      }

      if (user._count.customerOrders > 0) {
        reasons.push('user has order history');
      }

      if (user._count.couponUsages > 0) {
        reasons.push('user has coupon usage history');
      }

      if (reasons.length > 0) {
        blocked.push({ email: user.email, reasons });
        continue;
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.profile.deleteMany({
          where: { userId: user.id },
        });

        await tx.user.delete({
          where: { id: user.id },
        });
      });

      deleted.push(user.email);
    }

    return {
      requestedCount: emails.length,
      deletedCount: deleted.length,
      blockedCount: blocked.length,
      notFoundCount: notFound.length,
      deleted,
      blocked,
      notFound,
    };
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

  async createBusinessAdmin(
    payload: {
      email: string;
      password: string;
      verificationToken: string;
      tenantId: string;
      restaurantId: string;
      branchId: string;
    },
    tx?: PrismaTx,
  ) {
    return this.create(
      {
        email: payload.email,
        password: payload.password,
        role: UserRole.BUSINESS_ADMIN,
        isVerified: false,
        verificationToken: payload.verificationToken,
        tenant: { connect: { id: payload.tenantId } },
        restaurant: { connect: { id: payload.restaurantId } },
        branch: { connect: { id: payload.branchId } },
      },
      tx,
    );
  }
}
