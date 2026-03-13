import { Injectable } from '@nestjs/common';
import { Coupon, Prisma, PrismaClient } from '@prisma/client';
import { PrismaTx } from '../../common/types';
import { PrismaService } from '../../database';
import { ListCouponsDto } from './dto';

@Injectable()
export class CouponsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaClient | PrismaTx {
    return tx ?? this.prisma;
  }

  async create(data: Prisma.CouponCreateInput, tx?: PrismaTx): Promise<Coupon> {
    return this.client(tx).coupon.create({ data });
  }

  async findById(id: string): Promise<Coupon | null> {
    return this.prisma.coupon.findUnique({ where: { id } });
  }

  async findByCode(restaurantId: string, code: string): Promise<Coupon | null> {
    return this.prisma.coupon.findFirst({
      where: {
        restaurantId,
        code,
        deletedAt: null,
      },
    });
  }

  async list(restaurantId: string | undefined, query: ListCouponsDto) {
    const where: Prisma.CouponWhereInput = {
      ...(restaurantId ? { restaurantId } : {}),
      deletedAt: null,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' } },
              { title: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.coupon.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: {
          [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc',
        },
      }),
      this.prisma.coupon.count({ where }),
    ]);

    return { items, total };
  }

  async update(id: string, data: Prisma.CouponUpdateInput, tx?: PrismaTx) {
    return this.client(tx).coupon.update({ where: { id }, data });
  }

  async countCustomerUsage(
    couponId: string,
    customerId: string,
  ): Promise<number> {
    return this.prisma.couponUsage.count({
      where: {
        couponId,
        customerId,
      },
    });
  }

  async incrementUsage(
    couponId: string,
    customerId: string,
    orderId: string,
    tx: PrismaTx,
  ) {
    await tx.couponUsage.create({
      data: {
        couponId,
        customerId,
        orderId,
      },
    });

    await tx.coupon.update({
      where: { id: couponId },
      data: { usedCount: { increment: 1 } },
    });
  }
}
