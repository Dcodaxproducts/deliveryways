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
    name: string;
    tenantId?: string | null;
    restaurantId?: string | null;
    branchId?: string | null;
    excludeId?: string;
  }) {
    return this.prisma.staffRole.findFirst({
      where: {
        name: { equals: input.name, mode: 'insensitive' },
        tenantId: input.tenantId ?? null,
        restaurantId: input.restaurantId ?? null,
        branchId: input.branchId ?? null,
        deletedAt: null,
        ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
      },
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
    return this.prisma.user.count({
      where: {
        staffRoleId: id,
        role: 'STAFF',
        deletedAt: null,
      },
    });
  }

  private readonly includeConfig = {
    tenant: { select: { id: true, name: true } },
    restaurant: { select: { id: true, name: true } },
    branch: { select: { id: true, name: true } },
    permissions: {
      orderBy: [{ access: 'asc' }],
    },
    _count: {
      select: {
        staffMembers: true,
      },
    },
  } satisfies Prisma.StaffRoleInclude;
}
