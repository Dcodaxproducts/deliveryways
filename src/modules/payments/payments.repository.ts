import { Injectable } from '@nestjs/common';
import {
  PaymentStatus,
  Prisma,
  PrismaClient,
  PaymentTransactionType,
} from '@prisma/client';
import { PrismaTx } from '../../common/types';
import { PrismaService } from '../../database';
import { ListPaymentsDto } from './dto';

@Injectable()
export class PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaClient | PrismaTx {
    return tx ?? this.prisma;
  }

  async create(data: Prisma.PaymentTransactionCreateInput, tx?: PrismaTx) {
    return this.client(tx).paymentTransaction.create({
      data,
      include: {
        order: {
          select: {
            id: true,
            customerId: true,
            restaurantId: true,
            branchId: true,
            totalAmount: true,
            paymentStatus: true,
            paymentMethod: true,
          },
        },
      },
    });
  }

  async findById(id: string) {
    return this.prisma.paymentTransaction.findUnique({
      where: { id },
      include: {
        order: {
          select: {
            id: true,
            customerId: true,
            restaurantId: true,
            branchId: true,
            totalAmount: true,
            paymentStatus: true,
            paymentMethod: true,
            status: true,
          },
        },
      },
    });
  }

  async list(
    restaurantId: string | undefined,
    query: ListPaymentsDto,
    customerId?: string,
  ) {
    const where: Prisma.PaymentTransactionWhereInput = {
      ...(restaurantId ? { restaurantId } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.orderId ? { orderId: query.orderId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(customerId ? { order: { customerId } } : {}),
      ...(query.search
        ? {
            OR: [
              { id: { contains: query.search, mode: 'insensitive' } },
              {
                providerRef: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                order: {
                  id: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.paymentTransaction.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: {
          [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc',
        },
        include: {
          order: {
            select: {
              id: true,
              customerId: true,
              restaurantId: true,
              branchId: true,
              totalAmount: true,
              paymentStatus: true,
              paymentMethod: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.paymentTransaction.count({ where }),
    ]);

    return { items, total };
  }

  async updateStatus(
    id: string,
    payload: {
      status: PaymentStatus;
      providerRef?: string;
      providerData?: Prisma.InputJsonValue;
      note?: string;
      processedAt?: Date | null;
    },
    tx?: PrismaTx,
  ) {
    return this.client(tx).paymentTransaction.update({
      where: { id },
      data: {
        status: payload.status,
        providerRef: payload.providerRef,
        providerData: payload.providerData,
        note: payload.note,
        processedAt: payload.processedAt,
      },
      include: {
        order: {
          select: {
            id: true,
            customerId: true,
            restaurantId: true,
            branchId: true,
            totalAmount: true,
            paymentStatus: true,
            paymentMethod: true,
            status: true,
          },
        },
      },
    });
  }

  async updateOrderPaymentStatus(
    orderId: string,
    status: PaymentStatus,
    tx?: PrismaTx,
  ) {
    return this.client(tx).order.update({
      where: { id: orderId },
      data: {
        paymentStatus: status,
        paidAt: status === PaymentStatus.PAID ? new Date() : null,
      },
    });
  }

  async sumSuccessfulRefunds(orderId: string) {
    const result = await this.prisma.paymentTransaction.aggregate({
      where: {
        orderId,
        type: PaymentTransactionType.REFUND,
        status: PaymentStatus.REFUNDED,
      },
      _sum: {
        amount: true,
      },
    });

    return result._sum.amount ?? new Prisma.Decimal(0);
  }
}
