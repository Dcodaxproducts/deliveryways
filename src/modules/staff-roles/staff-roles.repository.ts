import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database';
import { ListStaffRolesDto } from './dto';

@Injectable()
export class StaffRolesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.StaffRoleCreateInput) {
    return this.prisma.staffRole.create({
      data,
      include: this.includeConfig,
    });
  }

  async findById(id: string) {
    return this.prisma.staffRole.findUnique({
      where: { id },
      include: this.includeConfig,
    });
  }

  async findByNameWithinScope(input: {
    ownerUserId: string;
    panelType: 'SUPER_ADMIN' | 'BUSINESS_ADMIN' | 'BRANCH_ADMIN';
    name: string;
    tenantId?: string | null;
    restaurantId?: string | null;
    branchId?: string | null;
    excludeId?: string;
  }) {
    return this.prisma.staffRole.findFirst({
      where: {
        ownerUserId: input.ownerUserId,
        panelType: input.panelType,
        name: { equals: input.name, mode: 'insensitive' },
        tenantId: input.tenantId ?? null,
        restaurantId: input.restaurantId ?? null,
        branchId: input.branchId ?? null,
        deletedAt: null,
        ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
      },
      include: this.includeConfig,
    });
  }

  async list(where: Prisma.StaffRoleWhereInput, query: ListStaffRolesDto) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.staffRole.findMany({
        where,
        include: this.includeConfig,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: {
          [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc',
        },
      }),
      this.prisma.staffRole.count({ where }),
    ]);

    return { items, total };
  }

  async update(id: string, data: Prisma.StaffRoleUpdateInput) {
    return this.prisma.staffRole.update({
      where: { id },
      data,
      include: this.includeConfig,
    });
  }

  async softDelete(id: string) {
    return this.prisma.staffRole.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
      include: this.includeConfig,
    });
  }

  async countAssignedUsers(id: string) {
    return this.prisma.staffUser.count({
      where: {
        staffRoleId: id,
        deletedAt: null,
      },
    });
  }

  private readonly includeConfig = {
    ownerUser: {
      select: {
        id: true,
        email: true,
        role: true,
      },
    },
    tenant: { select: { id: true, name: true, slug: true } },
    restaurant: { select: { id: true, name: true, slug: true } },
    branch: { select: { id: true, name: true } },
  } satisfies Prisma.StaffRoleInclude;
}
