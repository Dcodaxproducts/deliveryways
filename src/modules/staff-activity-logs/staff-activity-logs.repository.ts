import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database';
import { ListStaffActivityLogsDto } from './dto';

@Injectable()
export class StaffActivityLogsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findStaffIdentity(id: string) {
    return this.prisma.staffUser.findUnique({
      where: { id },
      select: {
        id: true,
        ownerUserId: true,
        email: true,
        firstName: true,
        lastName: true,
        staffRoleId: true,
        panelType: true,
        deletedAt: true,
        staffRole: {
          select: {
            name: true,
          },
        },
      },
    });
  }

  findLocation(restaurantId?: string, branchId?: string) {
    if (branchId) {
      return this.prisma.branch.findUnique({
        where: { id: branchId },
        select: {
          id: true,
          name: true,
          restaurant: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
    }

    if (restaurantId) {
      return this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: {
          id: true,
          name: true,
        },
      });
    }

    return null;
  }

  create(data: Prisma.StaffActivityLogCreateInput) {
    return this.prisma.staffActivityLog.create({ data });
  }

  async list(
    where: Prisma.StaffActivityLogWhereInput,
    query: ListStaffActivityLogsDto,
  ) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.staffActivityLog.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.staffActivityLog.count({ where }),
    ]);

    return { items, total };
  }
}
