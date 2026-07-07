import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database';
import { ListStaffDto } from './dto';

@Injectable()
export class StaffManagementRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.StaffUserCreateInput) {
    return this.prisma.staffUser.create({
      data,
      include: this.includeConfig,
    });
  }

  async findById(id: string) {
    return this.prisma.staffUser.findUnique({
      where: { id },
      include: this.includeConfig,
    });
  }

  async findByEmail(email: string) {
    return this.prisma.staffUser.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
      },
      include: this.includeConfig,
    });
  }

  async countRestaurants(ids: string[]) {
    return this.prisma.restaurant.count({
      where: { id: { in: ids }, deletedAt: null },
    });
  }

  async findBranches(ids: string[]) {
    return this.prisma.branch.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, restaurantId: true },
    });
  }

  async list(where: Prisma.StaffUserWhereInput, query: ListStaffDto) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.staffUser.findMany({
        where,
        include: this.includeConfig,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: {
          [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc',
        },
      }),
      this.prisma.staffUser.count({ where }),
    ]);

    return { items, total };
  }

  async update(id: string, data: Prisma.StaffUserUpdateInput) {
    return this.prisma.staffUser.update({
      where: { id },
      data,
      include: this.includeConfig,
    });
  }

  async softDelete(id: string) {
    return this.prisma.staffUser.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
        refreshTokenHash: null,
      },
      include: this.includeConfig,
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
    staffRole: {
      select: {
        id: true,
        ownerUserId: true,
        panelType: true,
        tenantId: true,
        restaurantId: true,
        branchId: true,
        name: true,
        description: true,
        permissions: true,
        restaurantAccess: true,
        isActive: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    },
  } satisfies Prisma.StaffUserInclude;
}
