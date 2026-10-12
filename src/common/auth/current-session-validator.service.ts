import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../database';
import { AuthUserContext } from '../decorators';

@Injectable()
export class CurrentSessionValidator {
  constructor(private readonly prisma: PrismaService) {}

  async assertCurrentSession(
    user: AuthUserContext,
    allowSoftDeleted = false,
  ): Promise<void> {
    if (!user.uid || !Number.isInteger(user.ver)) {
      throw new UnauthorizedException('Session is no longer valid');
    }

    if (user.actorType === 'STAFF') {
      await this.assertStaffSession(user, allowSoftDeleted);
      return;
    }

    if (user.actorType === 'DELIVERYMAN' || user.role === 'DELIVERYMAN') {
      await this.assertDeliverymanSession(user, allowSoftDeleted);
      return;
    }

    await this.assertUserSession(user, allowSoftDeleted);
  }

  private async assertStaffSession(
    user: AuthUserContext,
    allowSoftDeleted: boolean,
  ): Promise<void> {
    const staff = await this.prisma.staffUser.findUnique({
      where: { id: user.uid },
      select: {
        authVersion: true,
        deletedAt: true,
        isActive: true,
        tenantId: true,
        restaurantId: true,
        branchId: true,
        ownerUserId: true,
        staffRoleId: true,
        panelType: true,
        accountType: true,
        staffRole: { select: { isActive: true, deletedAt: true } },
      },
    });

    if (
      !staff ||
      staff.authVersion !== user.ver ||
      !staff.isActive ||
      staff.tenantId !== (user.tid ?? null) ||
      staff.restaurantId !== (user.rid ?? null) ||
      staff.branchId !== (user.bid ?? null) ||
      staff.ownerUserId !== user.ownerUserId ||
      staff.staffRoleId !== user.staffRoleId ||
      staff.panelType !== user.panelType ||
      staff.accountType !== user.accountType ||
      !staff.staffRole.isActive ||
      staff.staffRole.deletedAt
    ) {
      throw new UnauthorizedException('Session is no longer valid');
    }

    if (staff.deletedAt && !allowSoftDeleted) {
      throw new ForbiddenException({
        message: 'Staff account has been deleted',
        error: 'ACCOUNT_DELETED',
        details: {
          deletionScheduled: false,
          canCancelDeletion: false,
        },
      });
    }
  }

  private async assertDeliverymanSession(
    user: AuthUserContext,
    allowSoftDeleted: boolean,
  ): Promise<void> {
    const deliveryman = await this.prisma.deliveryman.findUnique({
      where: { id: user.uid },
      select: {
        authVersion: true,
        deletedAt: true,
        isActive: true,
        tenantId: true,
        restaurantId: true,
        branchId: true,
      },
    });

    if (
      !deliveryman ||
      deliveryman.authVersion !== user.ver ||
      !deliveryman.isActive ||
      deliveryman.tenantId !== user.tid ||
      deliveryman.restaurantId !== user.rid ||
      deliveryman.branchId !== user.bid
    ) {
      throw new UnauthorizedException('Session is no longer valid');
    }

    if (deliveryman.deletedAt && !allowSoftDeleted) {
      throw new ForbiddenException({
        message: 'Deliveryman account has been deleted',
        error: 'ACCOUNT_DELETED',
        details: {
          deletionScheduled: false,
          canCancelDeletion: false,
        },
      });
    }
  }

  private async assertUserSession(
    user: AuthUserContext,
    allowSoftDeleted: boolean,
  ): Promise<void> {
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.uid },
      select: {
        deletedAt: true,
        deleteAfter: true,
        role: true,
        tenantId: true,
        restaurantId: true,
        branchId: true,
        authVersion: true,
        isActive: true,
      },
    });

    if (
      !dbUser ||
      dbUser.authVersion !== user.ver ||
      !dbUser.isActive ||
      String(dbUser.role) !== String(user.role) ||
      dbUser.tenantId !== (user.tid ?? null) ||
      dbUser.restaurantId !== (user.rid ?? null) ||
      dbUser.branchId !== (user.bid ?? null)
    ) {
      throw new UnauthorizedException('Session is no longer valid');
    }

    if (allowSoftDeleted) return;

    if (dbUser.deletedAt) {
      if (dbUser.deleteAfter && dbUser.deleteAfter > new Date()) {
        throw new ForbiddenException({
          message:
            'Your account is scheduled to delete. Request cancel deletion in order to cancel.',
          error: 'ACCOUNT_DELETION_SCHEDULED',
          details: {
            deletionScheduled: true,
            canCancelDeletion: true,
            deleteAfter: dbUser.deleteAfter.toISOString(),
          },
        });
      }

      throw new ForbiddenException({
        message: 'Account has been deleted',
        error: 'ACCOUNT_DELETED',
        details: {
          deletionScheduled: false,
          canCancelDeletion: false,
        },
      });
    }

    if (
      dbUser.role === 'BRANCH_ADMIN' &&
      dbUser.branchId &&
      dbUser.tenantId &&
      dbUser.restaurantId
    ) {
      const branch = await this.prisma.branch.findFirst({
        where: {
          id: dbUser.branchId,
          tenantId: dbUser.tenantId,
          restaurantId: dbUser.restaurantId,
        },
        select: { deletedAt: true },
      });

      if (branch?.deletedAt) {
        throw new ForbiddenException({
          message:
            'Your account is scheduled to delete. Request cancel deletion in order to cancel.',
          error: 'ACCOUNT_DELETION_SCHEDULED',
          details: {
            deletionScheduled: true,
            canCancelDeletion: true,
            deleteAfter: null,
            reason: 'ASSIGNED_BRANCH_SOFT_DELETED',
          },
        });
      }
    }
  }
}
