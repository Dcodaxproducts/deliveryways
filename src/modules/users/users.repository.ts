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
      include: {
        profile: true,
      },
    });
  }

  async findByEmailIncludingDeleted(email: string, restaurantId?: string) {
    return this.prisma.user.findFirst({
      where: {
        email,
        ...(restaurantId !== undefined ? { restaurantId } : {}),
      },
      include: {
        profile: true,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        profile: true,
      },
    });
  }

  async listCustomers(
    tenantId: string | undefined,
    query: AdminListQueryDto & {
      restaurantId?: string;
      isVerified?: boolean;
      isActive?: boolean;
    },
    withDeleted = false,
  ) {
    const where: Prisma.UserWhereInput = {
      ...(tenantId ? { tenantId } : {}),
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
        include: this.customerIncludeConfig,
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

  async findCustomerById(
    id: string,
    options?: {
      tenantId?: string;
      restaurantId?: string;
      withDeleted?: boolean;
    },
  ) {
    return this.prisma.user.findFirst({
      where: {
        id,
        role: UserRole.CUSTOMER,
        ...(options?.tenantId ? { tenantId: options.tenantId } : {}),
        ...(options?.restaurantId
          ? { restaurantId: options.restaurantId }
          : {}),
        ...(options?.withDeleted ? {} : { deletedAt: null }),
      },
      include: this.customerIncludeConfig,
    });
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
    return this.prisma.user.deleteMany({
      where: {
        email: { in: emails },
      },
    });
  }

  async createBusinessAdmin(
    payload: {
      email: string;
      password: string;
      tenantId: string;
      restaurantId: string;
      branchId: string;
      verificationToken: string;
    },
    tx?: PrismaTx,
  ) {
    return this.client(tx).user.create({
      data: {
        email: payload.email,
        password: payload.password,
        role: UserRole.BUSINESS_ADMIN,
        tenant: { connect: { id: payload.tenantId } },
        verificationToken: payload.verificationToken,
      },
    });
  }

  async softDeleteUser(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
        refreshTokenHash: null,
        deleteAfter: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  }

  async cancelDeleteUser(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: {
        deletedAt: null,
        isActive: true,
        deleteAfter: null,
      },
    });
  }

  private readonly customerIncludeConfig = {
    profile: true,
    tenant: { select: { id: true, name: true, slug: true } },
    restaurant: {
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        coverImage: true,
      },
    },
    branch: {
      select: {
        id: true,
        name: true,
        coverImage: true,
      },
    },
    cart: {
      select: {
        id: true,
      },
    },
    customerOrders: {
      select: {
        id: true,
      },
    },
    couponUsages: {
      select: {
        id: true,
      },
    },
    _count: {
      select: {
        couponUsages: true,
        customerOrders: true,
      },
    },
  } satisfies Prisma.UserInclude;
}
