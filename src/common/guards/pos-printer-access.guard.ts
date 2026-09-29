import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StaffAccountType } from '@prisma/client';
import { PrismaService } from '../../database';
import { POS_PRINTER_ACCESS_KEY } from '../decorators/pos-printer-access.decorator';

type PosPrinterRequestUser = {
  uid?: string;
  actorType?: string;
  accountType?: StaffAccountType;
  tid?: string | null;
  rid?: string | null;
  bid?: string | null;
};

@Injectable()
export class PosPrinterAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: PosPrinterRequestUser;
    }>();
    const user = request.user;

    if (user?.accountType !== StaffAccountType.POS_PRINTER) {
      return true;
    }

    const allowed = this.reflector.getAllAndOverride<boolean>(
      POS_PRINTER_ACCESS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!allowed) {
      throw new ForbiddenException(
        'POS printer accounts can only access order management and table reservations',
      );
    }

    if (!user.uid || user.actorType !== 'STAFF') {
      throw new UnauthorizedException('Invalid POS printer session');
    }

    const staff = await this.prisma.staffUser.findUnique({
      where: { id: user.uid },
      select: {
        accountType: true,
        tenantId: true,
        restaurantId: true,
        branchId: true,
        isActive: true,
        deletedAt: true,
        staffRole: {
          select: { isActive: true, deletedAt: true },
        },
      },
    });

    if (
      !staff ||
      staff.accountType !== StaffAccountType.POS_PRINTER ||
      !staff.isActive ||
      staff.deletedAt ||
      !staff.staffRole.isActive ||
      staff.staffRole.deletedAt
    ) {
      throw new UnauthorizedException('POS printer account is inactive');
    }

    if (
      user.tid !== staff.tenantId ||
      user.rid !== staff.restaurantId ||
      user.bid !== staff.branchId
    ) {
      throw new UnauthorizedException('Invalid POS printer scope');
    }

    return true;
  }
}
