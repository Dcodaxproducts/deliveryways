import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma, PrismaClient } from '@prisma/client';
import { PrismaTx } from '../../common/types';
import { PrismaService } from '../../database';
import { ListOrdersDto } from './dto';

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaClient | PrismaTx {
    return tx ?? this.prisma;
  }

  async create(data: Prisma.OrderCreateInput, tx: PrismaTx) {
    return tx.order.create({
      data,
      include: {
        items: true,
        coupon: true,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        coupon: true,
        branch: { select: { id: true, name: true } },
      },
    });
  }

  async list(
    restaurantId: string | undefined,
    query: ListOrdersDto,
    customerId?: string,
  ) {
    const where: Prisma.OrderWhereInput = {
      ...(restaurantId ? { restaurantId } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(customerId ? { customerId } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: {
          [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc',
        },
        include: {
          branch: { select: { id: true, name: true } },
          coupon: { select: { id: true, code: true, title: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return { items, total };
  }

  async updateStatus(id: string, status: OrderStatus, tx?: PrismaTx) {
    return this.client(tx).order.update({
      where: { id },
      data: { status },
    });
  }

  async cancel(id: string, cancelledByUserId: string, tx?: PrismaTx) {
    return this.client(tx).order.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledByUserId,
      },
    });
  }
}
