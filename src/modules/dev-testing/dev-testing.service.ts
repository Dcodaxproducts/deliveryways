import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AddressRefType, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../database';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { AuthService } from '../auth/auth.service';
import { RegisterTenantDto } from '../auth/dto';
import { InventoryCategoryService } from '../inventory/category/category.service';
import { InventoryItemService } from '../inventory/item/item.service';
import { MenuCategoryService } from '../menu/category/category.service';
import { MenuItemService } from '../menu/item/item.service';
import { MenuVariationService } from '../menu/variation/variation.service';
import { UsersService } from '../users/users.service';
import { DevBootstrapStoreDto, DevTestingUserIdentifierDto } from './dto';

type ResolvedDevUser = {
  id: string;
  email: string;
  role: UserRole;
  restaurantId: string | null;
  isApproved: boolean;
};

type DevLookupAccount = {
  accountType: 'user' | 'staff' | 'deliveryman';
  id: string;
  email: string;
  role: string;
  restaurantId: string | null;
  branchId?: string | null;
  isActive: boolean;
  deletedAt: Date | null;
};

@Injectable()
export class DevTestingService {
  constructor(
    private readonly authService: AuthService,
    private readonly menuCategoryService: MenuCategoryService,
    private readonly menuItemService: MenuItemService,
    private readonly menuVariationService: MenuVariationService,
    private readonly inventoryCategoryService: InventoryCategoryService,
    private readonly inventoryItemService: InventoryItemService,
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  async bootstrapStore(dto: DevBootstrapStoreDto) {
    const suffix = Date.now().toString().slice(-6);
    const normalizedBase = (dto.baseName ?? 'Seed Store').trim();
    const ownerPassword = dto.ownerPassword ?? 'Pass@12345';
    const customerPassword = dto.customerPassword ?? 'Pass@12345';
    const packagePlanId =
      dto.packagePlanId ?? (await this.resolveBootstrapPackagePlanId());

    const registerPayload: RegisterTenantDto = {
      packagePlanId,
      user: {
        email: dto.ownerEmail ?? `owner.${suffix}@deliveryways.dev`,
        password: ownerPassword,
        firstName: 'Seed',
        lastName: 'Owner',
      },
      tenant: {
        name: `${normalizedBase} Tenant`,
      },
      restaurant: {
        name: `${normalizedBase} Restaurant`,
      },
      branch: {
        name: `${normalizedBase} Main Branch`,
        street: 'Main Boulevard',
        city: 'Lahore',
        state: 'Punjab',
        country: 'Pakistan',
        lat: '31.5204',
        lng: '74.3587',
      },
    };

    const tenantResult = await this.authService.registerTenant(registerPayload);

    const ownerContext: AuthUserContext = {
      uid: tenantResult.data.ownerId,
      role: UserRoleEnum.BUSINESS_ADMIN,
      tid: tenantResult.data.tenantId,
      rid: tenantResult.data.restaurantId,
      bid: tenantResult.data.branchId,
    };

    const burgerCategory = await this.menuCategoryService.create(ownerContext, {
      name: 'Burgers',
      slug: `burgers-${suffix}`,
      isActive: true,
    });

    await this.menuCategoryService.create(ownerContext, {
      name: 'Drinks',
      slug: `drinks-${suffix}`,
      isActive: true,
    });

    const zingerItem = await this.menuItemService.create(ownerContext, {
      categoryId: burgerCategory.data.id,
      name: 'Zinger Burger',
      slug: `zinger-burger-${suffix}`,
      basePrice: 650,
      prepTimeMinutes: 20,
      dietaryFlags: ['NON_VEG'],
      allergenFlags: ['GLUTEN'],
      isActive: true,
    });

    await this.menuVariationService.create(ownerContext, {
      restaurantId: ownerContext.rid,
      name: 'Large',
      price: 740,
      sortOrder: 1,
      isDefault: false,
      isActive: true,
    });

    const inventoryCategory = await this.inventoryCategoryService.create(
      ownerContext,
      {
        name: 'Protein',
        slug: `protein-${suffix}`,
        isActive: true,
      },
    );

    await this.inventoryItemService.create(ownerContext, {
      inventoryCategoryId: inventoryCategory.data.id,
      name: 'Chicken Fillet',
      sku: `CHK-${suffix}`,
      unit: 'pcs',
      currentQty: 200,
      reorderLevel: 30,
      costPerUnit: 120,
    });

    const customerEmail =
      dto.customerEmail ?? `customer.${suffix}@deliveryways.dev`;

    await this.authService.registerCustomer({
      restaurantId: tenantResult.data.restaurantId,
      email: customerEmail,
      password: customerPassword,
      firstName: 'Seed',
      lastName: 'Customer',
      phone: '+923001234567',
    });

    return {
      data: {
        owner: {
          email: registerPayload.user.email,
          password: ownerPassword,
        },
        customer: {
          email: customerEmail,
          password: customerPassword,
        },
        ids: {
          tenantId: tenantResult.data.tenantId,
          restaurantId: tenantResult.data.restaurantId,
          branchId: tenantResult.data.branchId,
          categoryId: burgerCategory.data.id,
          menuItemId: zingerItem.data.id,
        },
      },
      message: 'Development store bootstrap completed successfully',
    };
  }

  private async resolveBootstrapPackagePlanId(): Promise<string> {
    const packagePlan = await this.prisma.packagePlan.findFirst({
      where: {
        isActive: true,
        deletedAt: null,
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select: { id: true },
    });

    if (!packagePlan) {
      throw new BadRequestException(
        'Active package plan is required for dev store bootstrap',
      );
    }

    return packagePlan.id;
  }

  async approveUser(dto: DevTestingUserIdentifierDto) {
    const user = await this.resolveSingleUser(dto);

    if (!this.approvableRoles.has(user.role)) {
      throw new BadRequestException(
        'Only business admin, branch admin, or customer accounts can be approved',
      );
    }

    if (user.isApproved) {
      return {
        data: {
          id: user.id,
          email: user.email,
          role: user.role,
          restaurantId: user.restaurantId,
          isApproved: user.isApproved,
        },
        message: 'User already approved',
      };
    }

    const updated = await this.usersService.setApprovalStatus(user.id, true);

    return {
      data: {
        id: updated.id,
        email: updated.email,
        role: updated.role,
        restaurantId: updated.restaurantId,
        isApproved: updated.isApproved,
      },
      message: 'User approved successfully',
    };
  }

  async deleteUser(dto: DevTestingUserIdentifierDto) {
    const user = await this.resolveSingleUser(dto);

    if (user.role === UserRole.SUPER_ADMIN) {
      throw new BadRequestException(
        'Super admin accounts cannot be deleted via dev-testing endpoint',
      );
    }

    if (user.role === UserRole.CUSTOMER) {
      await this.deleteCustomerWithDependencies(user);
    } else {
      await this.deleteNonCustomerUser(user);
    }

    return {
      data: {
        id: user.id,
        email: user.email,
        role: user.role,
        restaurantId: user.restaurantId,
        deleted: true,
      },
      message: 'User deleted successfully',
    };
  }

  async lookupAccountsByEmail(email: string) {
    const normalizedEmail = email.trim().toLowerCase();

    const [users, staffUsers, deliverymen] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          email: { equals: normalizedEmail, mode: 'insensitive' },
        },
        select: {
          id: true,
          email: true,
          role: true,
          restaurantId: true,
          isActive: true,
          deletedAt: true,
        },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.staffUser.findMany({
        where: {
          email: { equals: normalizedEmail, mode: 'insensitive' },
        },
        select: {
          id: true,
          email: true,
          panelType: true,
          restaurantId: true,
          branchId: true,
          isActive: true,
          deletedAt: true,
        },
        orderBy: [{ createdAt: 'asc' }],
      }),
      this.prisma.deliveryman.findMany({
        where: {
          email: { equals: normalizedEmail, mode: 'insensitive' },
        },
        select: {
          id: true,
          email: true,
          restaurantId: true,
          branchId: true,
          status: true,
          isActive: true,
          deletedAt: true,
        },
        orderBy: [{ createdAt: 'asc' }],
      }),
    ]);

    const accounts: DevLookupAccount[] = [
      ...users.map((item) => ({
        accountType: 'user' as const,
        id: item.id,
        email: item.email,
        role: item.role,
        restaurantId: item.restaurantId,
        isActive: item.isActive,
        deletedAt: item.deletedAt,
      })),
      ...staffUsers.map((item) => ({
        accountType: 'staff' as const,
        id: item.id,
        email: item.email,
        role: item.panelType,
        restaurantId: item.restaurantId,
        branchId: item.branchId,
        isActive: item.isActive,
        deletedAt: item.deletedAt,
      })),
      ...deliverymen.map((item) => ({
        accountType: 'deliveryman' as const,
        id: item.id,
        email: item.email,
        role: item.status,
        restaurantId: item.restaurantId,
        branchId: item.branchId,
        isActive: item.isActive,
        deletedAt: item.deletedAt,
      })),
    ];

    return {
      data: {
        email: normalizedEmail,
        totalAccounts: accounts.length,
        accounts,
      },
      message:
        accounts.length > 0
          ? 'Accounts fetched successfully'
          : 'No accounts found for this email',
    };
  }

  private readonly approvableRoles = new Set<UserRole>([
    UserRoleEnum.BUSINESS_ADMIN,
    UserRoleEnum.BRANCH_ADMIN,
    UserRoleEnum.CUSTOMER,
  ]);

  private async resolveSingleUser(
    dto: DevTestingUserIdentifierDto,
  ): Promise<ResolvedDevUser> {
    const matches = await this.usersService.findManyForDevResolution({
      id: dto.id,
      email: dto.email?.trim().toLowerCase(),
      restaurantId: dto.restaurantId,
      role: dto.role as UserRole | undefined,
    });

    if (matches.length === 0) {
      throw new NotFoundException('User not found');
    }

    if (matches.length > 1) {
      throw new BadRequestException({
        message:
          'Multiple users matched this email. Please provide role and/or restaurantId, or use id instead.',
        error: 'AMBIGUOUS_USER_IDENTIFIER',
        details: {
          email: dto.email?.trim().toLowerCase(),
          matchCount: matches.length,
          identifiers: matches.map((match) => ({
            id: match.id,
            role: match.role,
            restaurantId: match.restaurantId,
          })),
        },
      });
    }

    return matches[0] as ResolvedDevUser;
  }

  private async deleteCustomerWithDependencies(user: ResolvedDevUser) {
    try {
      await this.prisma.$transaction(async (tx) => {
        const orders = await tx.order.findMany({
          where: { customerId: user.id },
          select: { id: true },
        });
        const orderIds = orders.map((order) => order.id);

        const paymentTransactions = orderIds.length
          ? await tx.paymentTransaction.findMany({
              where: { orderId: { in: orderIds } },
              select: { id: true },
            })
          : [];
        const paymentTransactionIds = paymentTransactions.map(
          (transaction) => transaction.id,
        );

        await tx.notification.deleteMany({
          where: {
            OR: [
              { recipientUserId: user.id },
              ...(orderIds.length > 0 ? [{ orderId: { in: orderIds } }] : []),
              ...(paymentTransactionIds.length > 0
                ? [{ paymentTransactionId: { in: paymentTransactionIds } }]
                : []),
            ],
          },
        });

        await tx.chatMessage.deleteMany({
          where: { senderUserId: user.id },
        });
        await tx.chatThread.deleteMany({
          where: { customerId: user.id },
        });

        await tx.groupOrderParticipant.deleteMany({
          where: { userId: user.id },
        });
        await tx.groupOrderSession.deleteMany({
          where: { hostUserId: user.id },
        });

        await tx.posOrderDraft.deleteMany({
          where: { customerId: user.id },
        });

        await tx.couponUsage.deleteMany({
          where: { customerId: user.id },
        });
        await tx.walletTransaction.deleteMany({
          where: { customerId: user.id },
        });
        await tx.loyaltyTransaction.deleteMany({
          where: { customerId: user.id },
        });

        if (orderIds.length > 0) {
          await tx.paymentTransaction.deleteMany({
            where: { orderId: { in: orderIds } },
          });
          await tx.orderItem.deleteMany({
            where: { orderId: { in: orderIds } },
          });
        }

        await tx.order.deleteMany({
          where: { customerId: user.id },
        });

        await tx.walletAccount.deleteMany({
          where: { customerId: user.id },
        });
        await tx.loyaltyAccount.deleteMany({
          where: { customerId: user.id },
        });

        await tx.cart.deleteMany({
          where: { customerId: user.id },
        });
        await tx.address.deleteMany({
          where: {
            referenceId: user.id,
            refType: AddressRefType.USER,
          },
        });
        await tx.profile.deleteMany({
          where: { userId: user.id },
        });
        await tx.user.delete({
          where: { id: user.id },
        });
      });
    } catch (error) {
      this.rethrowDeleteError(user, error);
    }
  }

  private async deleteNonCustomerUser(user: ResolvedDevUser) {
    if (user.role === UserRole.BUSINESS_ADMIN) {
      const blockers = await this.getBusinessAdminDeletionBlockers(user.id);
      const hasBlockers = Object.values(blockers).some((count) => count > 0);

      if (hasBlockers) {
        throw new BadRequestException({
          message:
            'Business admin cannot be deleted until owned tenant/staff records are removed or reassigned.',
          error: 'USER_DELETE_BLOCKED',
          details: {
            userId: user.id,
            email: user.email,
            role: user.role,
            blockers,
          },
        });
      }
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.branch.updateMany({
          where: { managerId: user.id },
          data: { managerId: null },
        });
        await tx.inventoryMovement.updateMany({
          where: { createdByUserId: user.id },
          data: { createdByUserId: null },
        });
        await tx.notification.deleteMany({
          where: { recipientUserId: user.id },
        });
        await tx.chatMessage.deleteMany({
          where: { senderUserId: user.id },
        });
        await tx.profile.deleteMany({
          where: { userId: user.id },
        });
        await tx.user.delete({
          where: { id: user.id },
        });
      });
    } catch (error) {
      this.rethrowDeleteError(user, error);
    }
  }

  private async getBusinessAdminDeletionBlockers(userId: string) {
    const [tenantOwnerships, staffRoles, staffUsers] =
      await this.prisma.$transaction([
        this.prisma.tenant.count({ where: { ownerId: userId } }),
        this.prisma.staffRole.count({ where: { ownerUserId: userId } }),
        this.prisma.staffUser.count({ where: { ownerUserId: userId } }),
      ]);

    return {
      tenantOwnerships,
      staffRoles,
      staffUsers,
    };
  }

  private rethrowDeleteError(user: ResolvedDevUser, error: unknown): never {
    if (
      error instanceof BadRequestException ||
      error instanceof NotFoundException
    ) {
      throw error;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      throw new BadRequestException({
        message:
          'User deletion is blocked by related records that are not safe to delete automatically.',
        error: 'USER_DELETE_BLOCKED',
        details: {
          userId: user.id,
          email: user.email,
          role: user.role,
          prismaCode: error.code,
        },
      });
    }

    throw error;
  }
}
