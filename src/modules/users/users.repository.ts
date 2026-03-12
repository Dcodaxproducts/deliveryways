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
        restaurantId: restaurantId ?? null,
        deletedAt: null,
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
