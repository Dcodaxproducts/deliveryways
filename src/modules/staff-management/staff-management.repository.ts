import { Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../database';
import { ListStaffDto } from './dto';

@Injectable()
export class StaffManagementRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({
      data,
      include: this.includeConfig,
    });
  }

  async findById(id: string) {
    return this.prisma.user.findFirst({
      where: { id, role: UserRole.STAFF },
      include: this.includeConfig,
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: this.includeConfig,
    });
  }

  async list(where: Prisma.UserWhereInput, query: ListStaffDto) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: this.includeConfig,
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

  async update(id: string, data: Prisma.UserUpdateInput) {
    return this.prisma.user.update({
      where: { id },
      data,
      include: this.includeConfig,
    });
  }

  async softDelete(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
      include: this.includeConfig,
    });
  }

  private readonly includeConfig = {
    profile: true,
    staffRole: {
      include: {
        permissions: {
          orderBy: [{ access: 'asc' }],
        },
      },
    },
  } satisfies Prisma.UserInclude;
}
