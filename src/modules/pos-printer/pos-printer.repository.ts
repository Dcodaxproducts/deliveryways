import { Injectable } from '@nestjs/common';
import { Prisma, StaffAccountType, StaffPanelType } from '@prisma/client';
import { PrismaService } from '../../database';

const POS_PRINTER_ROLE_NAME = 'POS Printer';
const POS_PRINTER_ROLE_KEY_PREFIX = 'POS_PRINTER';

const POS_PRINTER_PERMISSIONS: Prisma.InputJsonValue = [
  {
    access: 'order-management',
    operations: ['read', 'create', 'update', 'delete'],
  },
  {
    access: 'table-reservations',
    operations: ['read', 'update'],
  },
];

@Injectable()
export class PosPrinterRepository {
  constructor(private readonly prisma: PrismaService) {}

  findBranch(id: string) {
    return this.prisma.branch.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, name: true, tenantId: true, restaurantId: true },
    });
  }

  findByEmail(email: string) {
    return this.prisma.staffUser.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, deletedAt: true },
    });
  }

  findByUsernameNormalized(usernameNormalized: string) {
    return this.prisma.staffUser.findUnique({
      where: { usernameNormalized },
      select: { id: true, deletedAt: true },
    });
  }

  create(input: {
    ownerUserId: string;
    panelType: StaffPanelType;
    tenantId: string;
    restaurantId: string;
    branchId: string;
    email: string;
    username?: string;
    usernameNormalized?: string;
    displayName: string;
    password: string;
    firstName: string;
    lastName: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const restaurantAccess: Prisma.InputJsonValue = {
        restaurantIds: [input.restaurantId],
        branchIds: [input.branchId],
        allRestaurants: false,
        hasAllRestaurantsAccess: false,
      };
      const systemKey = [
        POS_PRINTER_ROLE_KEY_PREFIX,
        input.ownerUserId,
        input.branchId,
      ].join(':');
      const role = await tx.staffRole.upsert({
        where: { systemKey },
        update: {},
        create: {
          ownerUserId: input.ownerUserId,
          panelType: input.panelType,
          tenantId: input.tenantId,
          restaurantId: input.restaurantId,
          branchId: input.branchId,
          systemKey,
          name: POS_PRINTER_ROLE_NAME,
          description:
            'System-managed least-privilege role for POS printer accounts',
          permissions: POS_PRINTER_PERMISSIONS,
          restaurantAccess,
        },
      });

      return tx.staffUser.create({
        data: {
          ownerUserId: input.ownerUserId,
          staffRoleId: role.id,
          panelType: input.panelType,
          accountType: StaffAccountType.POS_PRINTER,
          email: input.email,
          username: input.username,
          usernameNormalized: input.usernameNormalized,
          displayName: input.displayName,
          password: input.password,
          plainPassword: null,
          firstName: input.firstName,
          lastName: input.lastName,
          tenantId: input.tenantId,
          restaurantId: input.restaurantId,
          branchId: input.branchId,
          restaurantAccess,
          isVerified: true,
          isApproved: true,
          isActive: true,
        },
        include: { branch: { select: { id: true, name: true } } },
      });
    });
  }

  findById(id: string) {
    return this.prisma.staffUser.findFirst({
      where: { id, accountType: StaffAccountType.POS_PRINTER },
      include: { branch: { select: { id: true, name: true } } },
    });
  }

  list(where: Prisma.StaffUserWhereInput) {
    return this.prisma.staffUser.findMany({
      where,
      include: { branch: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  deactivatePushTokens(id: string) {
    return this.prisma.pushDeviceToken.updateMany({
      where: { staffUserId: id, isActive: true },
      data: { isActive: false },
    });
  }

  update(id: string, data: Prisma.StaffUserUpdateInput) {
    return this.prisma.staffUser.update({
      where: { id },
      data,
      include: { branch: { select: { id: true, name: true } } },
    });
  }
}
