import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Prisma, StaffActivityAction } from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { buildPaginationMeta } from '../../common/utils';
import { ListStaffActivityLogsDto } from './dto';
import { StaffActivityLogsRepository } from './staff-activity-logs.repository';

export interface RecordStaffActivityInput {
  staffUserId: string;
  action: StaffActivityAction;
  module: string;
  targetType?: string;
  targetId?: string;
  restaurantId?: string;
  branchId?: string;
  httpMethod?: string;
  requestPath?: string;
  statusCode?: number;
  ipAddress?: string;
  userAgent?: string;
  changedFields?: string[];
}

type ResolvedLocation = {
  restaurantId?: string;
  restaurantName?: string;
  branchId?: string;
  branchName?: string;
};

@Injectable()
export class StaffActivityLogsService {
  private readonly logger = new Logger(StaffActivityLogsService.name);

  constructor(private readonly repository: StaffActivityLogsRepository) {}

  async record(input: RecordStaffActivityInput): Promise<void> {
    try {
      const staff = await this.repository.findStaffIdentity(input.staffUserId);
      if (!staff || staff.deletedAt) {
        return;
      }

      const location = await this.resolveLocation(
        input.restaurantId,
        input.branchId,
      );
      const module = this.limit(input.module, 120) || 'platform';

      await this.repository.create({
        ownerUserId: staff.ownerUserId,
        staffUserId: staff.id,
        staffEmail: staff.email,
        staffName: `${staff.firstName} ${staff.lastName}`.trim(),
        staffRoleId: staff.staffRoleId,
        staffRoleName: staff.staffRole?.name,
        panelType: staff.panelType,
        action: input.action,
        module,
        description: this.buildDescription(input.action, module, location),
        targetType: this.limit(input.targetType, 120),
        targetId: this.limit(input.targetId, 191),
        restaurantId: location.restaurantId,
        restaurantName: location.restaurantName,
        branchId: location.branchId,
        branchName: location.branchName,
        httpMethod: this.limit(input.httpMethod, 12),
        requestPath: this.limit(input.requestPath, 500),
        statusCode: input.statusCode,
        ipAddress: this.limit(input.ipAddress, 100),
        userAgent: this.limit(input.userAgent, 500),
        changedFields: this.normalizeChangedFields(input.changedFields),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown audit write error';
      this.logger.warn(`Staff activity log write failed: ${message}`);
    }
  }

  async list(user: AuthUserContext, query: ListStaffActivityLogsDto) {
    this.assertSuperAdminOwner(user);

    const where = this.buildListWhere(user.uid, query);
    const { items, total } = await this.repository.list(where, query);

    return {
      data: items,
      message: 'Staff activity logs fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  private assertSuperAdminOwner(user: AuthUserContext): void {
    if (user.role !== UserRoleEnum.SUPER_ADMIN || user.actorType === 'STAFF') {
      throw new ForbiddenException(
        'Only the owning super admin can view staff activity logs',
      );
    }
  }

  private buildListWhere(
    ownerUserId: string,
    query: ListStaffActivityLogsDto,
  ): Prisma.StaffActivityLogWhereInput {
    const occurredAt =
      query.from || query.to
        ? {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: this.endOfDay(query.to) } : {}),
          }
        : undefined;

    return {
      ownerUserId,
      ...(query.staffUserId ? { staffUserId: query.staffUserId } : {}),
      ...(query.restaurantId ? { restaurantId: query.restaurantId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.module ? { module: query.module } : {}),
      ...(occurredAt ? { occurredAt } : {}),
      ...(query.search
        ? {
            OR: [
              { staffName: { contains: query.search, mode: 'insensitive' } },
              { staffEmail: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
              {
                restaurantName: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              { branchName: { contains: query.search, mode: 'insensitive' } },
              { targetId: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private async resolveLocation(
    restaurantId?: string,
    branchId?: string,
  ): Promise<ResolvedLocation> {
    const location = await this.repository.findLocation(restaurantId, branchId);
    if (!location) {
      return {
        restaurantId,
        branchId,
      };
    }

    if ('restaurant' in location) {
      return {
        restaurantId: location.restaurant.id,
        restaurantName: location.restaurant.name,
        branchId: location.id,
        branchName: location.name,
      };
    }

    return {
      restaurantId: location.id,
      restaurantName: location.name,
      branchId,
    };
  }

  private buildDescription(
    action: StaffActivityAction,
    module: string,
    location: ResolvedLocation,
  ): string {
    if (action === StaffActivityAction.LOGIN) {
      return 'Logged in to Superadmin';
    }
    if (action === StaffActivityAction.LOGOUT) {
      return 'Logged out of Superadmin';
    }

    const verb: Record<StaffActivityAction, string> = {
      LOGIN: 'Logged in to',
      LOGOUT: 'Logged out of',
      CREATE: 'Created a record in',
      UPDATE: 'Updated a record in',
      DELETE: 'Deleted a record from',
      OTHER: 'Performed an action in',
    };
    const scope = location.branchName
      ? ` for ${location.branchName} (${location.restaurantName ?? 'restaurant'})`
      : location.restaurantName
        ? ` for ${location.restaurantName}`
        : '';

    return `${verb[action]} ${this.humanize(module)}${scope}`;
  }

  private humanize(value: string): string {
    return value
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  private normalizeChangedFields(fields?: string[]): string[] {
    const sensitiveParts = [
      'authorization',
      'card',
      'credential',
      'cvv',
      'otp',
      'password',
      'secret',
      'token',
    ];

    return [...new Set(fields ?? [])]
      .map((field) => field.trim())
      .filter(
        (field) =>
          Boolean(field) &&
          !sensitiveParts.some((part) => field.toLowerCase().includes(part)),
      )
      .slice(0, 100);
  }

  private endOfDay(value: string): Date {
    const date = new Date(value);
    date.setUTCHours(23, 59, 59, 999);
    return date;
  }

  private limit(value: string | undefined, max: number): string | undefined {
    const normalized = value?.trim();
    return normalized ? normalized.slice(0, max) : undefined;
  }
}
