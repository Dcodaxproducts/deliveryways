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
        items: {
          include: {
            menuItem: {
              select: {
                id: true,
                slug: true,
                imageUrl: true,
                category: {
                  select: { id: true, name: true, imageUrl: true },
                },
              },
            },
          },
          orderBy: [{ createdAt: 'asc' }],
        },
        coupon: { select: { id: true, code: true, title: true } },
        branch: { select: { id: true, name: true, coverImage: true } },
        customer: {
          select: {
            id: true,
            email: true,
            profile: {
              select: {
                firstName: true,
                lastName: true,
                phone: true,
                avatarUrl: true,
              },
            },
          },
        },
        deliveryAddress: {
          select: {
            id: true,
            street: true,
            area: true,
            city: true,
            state: true,
            country: true,
            lat: true,
            lng: true,
          },
        },
        deliveryman: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            status: true,
            vehicleType: true,
            vehicleNumber: true,
          },
        },
        transactions: {
          orderBy: [{ createdAt: 'desc' }],
          select: {
            id: true,
            paymentMethod: true,
            type: true,
            status: true,
            amount: true,
            currency: true,
            providerRef: true,
            note: true,
            processedAt: true,
            createdAt: true,
          },
        },
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
          branch: { select: { id: true, name: true, coverImage: true } },
          coupon: { select: { id: true, code: true, title: true } },
          customer: {
            select: {
              id: true,
              email: true,
              profile: {
                select: {
                  firstName: true,
                  lastName: true,
                  phone: true,
                  avatarUrl: true,
                },
              },
            },
          },
          deliveryman: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              status: true,
            },
          },
          items: {
            select: {
              id: true,
              menuItemId: true,
              menuItemName: true,
              variationId: true,
              variationName: true,
              unitPrice: true,
              quantity: true,
              lineTotal: true,
              note: true,
              snapshotModifiers: true,
              menuItem: {
                select: {
                  imageUrl: true,
                },
              },
            },
            orderBy: [{ createdAt: 'asc' }],
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return { items, total };
  }

  async updateStatus(id: string, status: OrderStatus, tx?: PrismaTx) {
    return this.client(tx).order.update({
      where: { id },
      data: {
        status,
        deliveredAt: status === OrderStatus.DELIVERED ? new Date() : undefined,
      },
    });
  }

  async assignDeliveryman(id: string, deliverymanId: string, tx?: PrismaTx) {
    return this.client(tx).order.update({
      where: { id },
      data: {
        deliveryman: { connect: { id: deliverymanId } },
        assignedAt: new Date(),
        status: OrderStatus.OUT_FOR_DELIVERY,
      },
      include: {
        branch: { select: { id: true, name: true } },
        deliveryman: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            status: true,
          },
        },
      },
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
