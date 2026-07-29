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

  async existsByEmailAndRole(options: {
    email: string;
    role: UserRole;
    restaurantId?: string;
  }) {
    const count = await this.prisma.user.count({
      where: {
        email: options.email,
        role: options.role,
        deletedAt: null,
        ...(options.restaurantId !== undefined
          ? { restaurantId: options.restaurantId }
          : {}),
      },
    });

    return count > 0;
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        profile: true,
      },
    });
  }

  async findManyForDevResolution(options: {
    id?: string;
    email?: string;
    restaurantId?: string;
    role?: UserRole;
    includeDeleted?: boolean;
  }) {
    return this.prisma.user.findMany({
      where: {
        ...(options.id ? { id: options.id } : {}),
        ...(options.email ? { email: options.email } : {}),
        ...(options.restaurantId ? { restaurantId: options.restaurantId } : {}),
        ...(options.role ? { role: options.role } : {}),
        ...(options.includeDeleted ? {} : { deletedAt: null }),
      },
      include: {
        profile: true,
      },
      orderBy: {
        createdAt: 'desc',
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
    return this.prisma.$transaction(async (tx) => {
      const users = await tx.user.findMany({
        where: { email: { in: emails } },
        select: { id: true },
      });
      const userIds = users.map((user) => user.id);

      if (userIds.length === 0) {
        return { count: 0 };
      }

      const [orders, hostedGroupOrders, ownedStaffRoles] = await Promise.all([
        tx.order.findMany({
          where: { customerId: { in: userIds } },
          select: { id: true },
        }),
        tx.groupOrderSession.findMany({
          where: { hostUserId: { in: userIds } },
          select: { id: true },
        }),
        tx.staffRole.findMany({
          where: { ownerUserId: { in: userIds } },
          select: { id: true },
        }),
      ]);
      const orderIds = orders.map((order) => order.id);
      const hostedGroupOrderIds = hostedGroupOrders.map(
        (session) => session.id,
      );
      const ownedStaffRoleIds = ownedStaffRoles.map((role) => role.id);

      await tx.tenant.updateMany({
        where: { ownerId: { in: userIds } },
        data: { ownerId: null },
      });
      await tx.branch.updateMany({
        where: { managerId: { in: userIds } },
        data: { managerId: null },
      });
      await tx.inventoryMovement.updateMany({
        where: { createdByUserId: { in: userIds } },
        data: { createdByUserId: null },
      });
      await tx.contactSubmission.updateMany({
        where: { customerId: { in: userIds } },
        data: { customerId: null },
      });
      await tx.contactSubmission.updateMany({
        where: { repliedById: { in: userIds } },
        data: { repliedById: null },
      });
      await tx.posOrderDraft.updateMany({
        where: { customerId: { in: userIds } },
        data: { customerId: null },
      });
      await tx.groupOrderSession.updateMany({
        where: { finalOrderId: { in: orderIds } },
        data: { finalOrderId: null },
      });
      await tx.generatedInvoice.updateMany({
        where: {
          OR: [{ customerId: { in: userIds } }, { orderId: { in: orderIds } }],
        },
        data: {
          customerId: null,
          orderId: null,
        },
      });
      await tx.restaurantWalletTransaction.updateMany({
        where: { orderId: { in: orderIds } },
        data: {
          orderId: null,
          paymentTransactionId: null,
        },
      });

      await tx.pushDeviceToken.deleteMany({
        where: { userId: { in: userIds } },
      });
      await tx.notification.deleteMany({
        where: {
          OR: [
            { recipientUserId: { in: userIds } },
            { orderId: { in: orderIds } },
            {
              paymentTransaction: {
                orderId: { in: orderIds },
              },
            },
          ],
        },
      });
      await tx.chatMessage.updateMany({
        where: { senderUserId: { in: userIds } },
        data: { senderUserId: null },
      });
      await tx.chatThread.deleteMany({
        where: {
          OR: [{ customerId: { in: userIds } }, { orderId: { in: orderIds } }],
        },
      });

      await tx.groupOrderParticipant.deleteMany({
        where: { userId: { in: userIds } },
      });
      await tx.groupOrderSession.deleteMany({
        where: { id: { in: hostedGroupOrderIds } },
      });
      await tx.couponUsage.deleteMany({
        where: { customerId: { in: userIds } },
      });
      await tx.orderReview.deleteMany({
        where: { customerId: { in: userIds } },
      });
      await tx.walletTransaction.deleteMany({
        where: { customerId: { in: userIds } },
      });
      await tx.loyaltyTransaction.deleteMany({
        where: { customerId: { in: userIds } },
      });
      await tx.walletAccount.deleteMany({
        where: { customerId: { in: userIds } },
      });
      await tx.loyaltyAccount.deleteMany({
        where: { customerId: { in: userIds } },
      });

      await tx.paymentTransaction.deleteMany({
        where: { orderId: { in: orderIds } },
      });
      await tx.orderItem.deleteMany({
        where: { orderId: { in: orderIds } },
      });
      await tx.order.deleteMany({
        where: { id: { in: orderIds } },
      });
      await tx.cart.deleteMany({
        where: { customerId: { in: userIds } },
      });

      const ownedStaffUsers = await tx.staffUser.findMany({
        where: {
          OR: [
            { ownerUserId: { in: userIds } },
            { staffRoleId: { in: ownedStaffRoleIds } },
          ],
        },
        select: { id: true },
      });
      const ownedStaffUserIds = ownedStaffUsers.map(
        (staffUser) => staffUser.id,
      );

      await tx.chatThread.updateMany({
        where: { assignedStaffUserId: { in: ownedStaffUserIds } },
        data: { assignedStaffUserId: null },
      });
      await tx.chatMessage.updateMany({
        where: { senderStaffUserId: { in: ownedStaffUserIds } },
        data: { senderStaffUserId: null },
      });
      await tx.staffUser.deleteMany({
        where: { id: { in: ownedStaffUserIds } },
      });
      await tx.staffRole.deleteMany({
        where: { id: { in: ownedStaffRoleIds } },
      });

      await tx.profile.deleteMany({
        where: { userId: { in: userIds } },
      });
      await tx.address.deleteMany({
        where: {
          referenceId: { in: userIds },
          refType: 'USER',
        },
      });

      return tx.user.deleteMany({
        where: { id: { in: userIds } },
      });
    });
  }

  async deleteManyByIds(ids: string[]) {
    return this.prisma.user.deleteMany({
      where: {
        id: { in: ids },
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
