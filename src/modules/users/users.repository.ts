import { Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
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
