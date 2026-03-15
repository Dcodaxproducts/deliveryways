import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { QueryDto } from '../../common/dto';
import { PrismaTx } from '../../common/types';
import { PrismaService } from '../../database';

@Injectable()
export class DeliverymenRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaClient | PrismaTx {
    return tx ?? this.prisma;
  }

  async create(data: Prisma.DeliverymanCreateInput, tx?: PrismaTx) {
    return this.client(tx).deliveryman.create({
      data,
      include: {
        branch: { select: { id: true, name: true } },
      },
    });
  }

  async findById(id: string) {
    return this.prisma.deliveryman.findUnique({
      where: { id },
      include: {
        branch: { select: { id: true, name: true } },
        orders: {
          where: { status: 'OUT_FOR_DELIVERY' },
          select: {
            id: true,
            status: true,
            totalAmount: true,
            assignedAt: true,
            customer: {
              select: {
                id: true,
                email: true,
                profile: {
                  select: {
                    firstName: true,
                    lastName: true,
                    phone: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async list(
    restaurantId: string | undefined,
    query: QueryDto & { branchId?: string; status?: string },
  ) {
    const where: Prisma.DeliverymanWhereInput = {
      ...(restaurantId ? { restaurantId } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.status ? { status: query.status as never } : {}),
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search, mode: 'insensitive' } },
              { id: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.deliveryman.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: {
          [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc',
        },
        include: {
          branch: { select: { id: true, name: true } },
          _count: {
            select: {
              orders: {
                where: {
                  status: 'OUT_FOR_DELIVERY',
                },
              },
            },
          },
        },
      }),
      this.prisma.deliveryman.count({ where }),
    ]);

    return { items, total };
  }

  async update(id: string, data: Prisma.DeliverymanUpdateInput, tx?: PrismaTx) {
    return this.client(tx).deliveryman.update({
      where: { id },
      data,
      include: {
        branch: { select: { id: true, name: true } },
      },
    });
  }

  async softDelete(id: string, tx?: PrismaTx) {
    return this.client(tx).deliveryman.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
        status: 'INACTIVE',
      },
    });
  }
}
