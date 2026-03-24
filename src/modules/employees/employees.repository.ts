import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient, UserRole } from '@prisma/client';
import { PrismaService } from '../../database';
import { PrismaTx } from '../../common/types';
import { ListEmployeesDto } from './dto';

@Injectable()
export class EmployeesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaClient | PrismaTx {
    return tx ?? this.prisma;
  }

  async create(data: Prisma.UserCreateInput, tx?: PrismaTx) {
    return this.client(tx).user.create({
      data,
      include: {
        profile: true,
        branch: { select: { id: true, name: true } },
      },
    });
  }

  async findById(id: string, withDeleted = false) {
    return this.prisma.user.findFirst({
      where: {
        id,
        role: UserRole.BRANCH_STAFF,
        ...(withDeleted ? {} : { deletedAt: null }),
      },
      include: {
        profile: true,
        branch: { select: { id: true, name: true } },
      },
    });
  }

  async findByEmail(email: string, restaurantId: string, excludeId?: string) {
    return this.prisma.user.findFirst({
      where: {
        email,
        restaurantId,
        role: UserRole.BRANCH_STAFF,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
  }

  async list(
    restaurantId: string | undefined,
    query: ListEmployeesDto,
    withDeleted = false,
  ) {
    const where: Prisma.UserWhereInput = {
      role: UserRole.BRANCH_STAFF,
      ...(restaurantId ? { restaurantId } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(withDeleted ? {} : { deletedAt: null }),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' } },
              {
                profile: {
                  OR: [
                    {
                      firstName: {
                        contains: query.search,
                        mode: 'insensitive',
                      },
                    },
                    {
                      lastName: {
                        contains: query.search,
                        mode: 'insensitive',
                      },
                    },
                    { phone: { contains: query.search, mode: 'insensitive' } },
                  ],
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: {
          profile: true,
          branch: { select: { id: true, name: true } },
        },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: {
          [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc',
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total };
  }

  async update(id: string, data: Prisma.UserUpdateInput, tx?: PrismaTx) {
    return this.client(tx).user.update({
      where: { id },
      data,
      include: {
        profile: true,
        branch: { select: { id: true, name: true } },
      },
    });
  }

  async softDelete(id: string, tx?: PrismaTx) {
    return this.client(tx).user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
        refreshTokenHash: null,
      },
      include: {
        profile: true,
        branch: { select: { id: true, name: true } },
      },
    });
  }
}
