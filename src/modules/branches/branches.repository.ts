import { Injectable } from '@nestjs/common';
import { AddressRefType, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../database';
import { QueryDto } from '../../common/dto';

@Injectable()
export class BranchesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createBranch(payload: {
    tenantId: string;
    restaurantId: string;
    name: string;
    isMain?: boolean;
    managerId?: string;
    street: string;
    city: string;
    state: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      if (payload.isMain) {
        await tx.branch.updateMany({
          where: {
            restaurantId: payload.restaurantId,
            isMain: true,
            deletedAt: null,
          },
          data: {
            isMain: false,
          },
        });
      }

      const branch = await tx.branch.create({
        data: {
          tenantId: payload.tenantId,
          restaurantId: payload.restaurantId,
          name: payload.name,
          isMain: payload.isMain ?? false,
          managerId: payload.managerId,
        },
      });

      await tx.address.create({
        data: {
          tenantId: payload.tenantId,
          referenceId: branch.id,
          refType: AddressRefType.BRANCH,
          street: payload.street,
          city: payload.city,
          state: payload.state,
        },
      });

      if (payload.managerId) {
        await tx.user.update({
          where: { id: payload.managerId },
          data: {
            branchId: branch.id,
            role: UserRole.BRANCH_ADMIN,
          },
        });
      }

      return branch;
    });
  }

  async listByRestaurant(
    tenantId: string,
    restaurantId: string,
    query: QueryDto,
    publicView = false,
    withDeleted = false,
  ) {
    const where: Prisma.BranchWhereInput = {
      tenantId,
      restaurantId,
      ...(withDeleted ? {} : { deletedAt: null }),
      ...(publicView ? { isActive: true, deletedAt: null } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { id: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.branch.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: {
          [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc',
        },
      }),
      this.prisma.branch.count({ where }),
    ]);

    return { items, total };
  }

  async listByBranchId(branchId: string) {
    return this.prisma.branch.findMany({
      where: {
        id: branchId,
        deletedAt: null,
      },
    });
  }

  async update(id: string, data: Prisma.BranchUpdateInput) {
    return this.prisma.branch.update({ where: { id }, data });
  }

  async softDelete(id: string) {
    return this.prisma.branch.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });
  }
}
