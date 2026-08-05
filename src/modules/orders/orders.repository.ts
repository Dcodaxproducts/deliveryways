import { Injectable } from '@nestjs/common';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { PrismaTx } from '../../common/types';
import { PrismaService } from '../../database';
import { ListOrdersDto } from './dto';
import { IntegrationScope } from './orders-integration.port';

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaClient | PrismaTx {
    return tx ?? this.prisma;
  }

  private buildSearchFilter(search?: string): Prisma.OrderWhereInput {
    const trimmedSearch = search?.trim();

    if (!trimmedSearch) {
      return {};
    }

    const customerNameTerms = trimmedSearch
      .split(/\s+/)
      .filter((term) => term.length > 0);

    return {
      OR: [
        { id: { contains: trimmedSearch, mode: 'insensitive' } },
        {
          customer: {
            is: {
              email: { contains: trimmedSearch, mode: 'insensitive' },
            },
          },
        },
        {
          customer: {
            is: {
              profile: {
                is: {
                  AND: customerNameTerms.map((term) => ({
                    OR: [
                      { firstName: { contains: term, mode: 'insensitive' } },
                      { lastName: { contains: term, mode: 'insensitive' } },
                    ],
                  })),
                },
              },
            },
          },
        },
      ],
    };
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

  async findIntegrationExportCandidates(
    scope: IntegrationScope,
    limit: number,
  ) {
    return this.prisma.order.findMany({
      where: {
        tenantId: scope.tenantId,
        restaurantId: scope.restaurantId,
        branchId: scope.branchId,
        status: OrderStatus.PLACED,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
      include: {
        customer: {
          select: {
            email: true,
            profile: {
              select: { firstName: true, lastName: true, phone: true },
            },
          },
        },
        deliveryAddress: {
          select: {
            street: true,
            area: true,
            postalCode: true,
            city: true,
            state: true,
            country: true,
          },
        },
        items: {
          orderBy: [{ createdAt: 'asc' }],
          include: {
            menuItem: { select: { taxPercentage: true } },
          },
        },
        transactions: {
          where: { type: PaymentTransactionType.CHARGE },
          orderBy: [{ createdAt: 'desc' }],
          take: 1,
          select: { providerRef: true, currency: true },
        },
      },
    });
  }

  async findIntegrationOrder(id: string, scope: IntegrationScope) {
    return this.prisma.order.findFirst({
      where: {
        id,
        tenantId: scope.tenantId,
        restaurantId: scope.restaurantId,
        branchId: scope.branchId,
      },
      select: { id: true, orderType: true, status: true, orderTime: true },
    });
  }

  async updateIntegrationStatus(
    id: string,
    scope: IntegrationScope,
    status: OrderStatus,
    orderTime?: Date,
  ) {
    return this.prisma.order.updateMany({
      where: {
        id,
        tenantId: scope.tenantId,
        restaurantId: scope.restaurantId,
        branchId: scope.branchId,
      },
      data: {
        status,
        orderTime,
        isScheduled: orderTime ? orderTime.getTime() > Date.now() : undefined,
        deliveredAt:
          status === OrderStatus.DELIVERED ||
          status === OrderStatus.PICKED_UP ||
          status === OrderStatus.SERVED
            ? new Date()
            : undefined,
      },
    });
  }

  async updateIntegrationEstimate(
    id: string,
    scope: IntegrationScope,
    estimate: {
      estimatedPreparationMinutes?: number;
      estimatedCompletionAt?: Date;
    },
  ) {
    if (
      estimate.estimatedPreparationMinutes === undefined &&
      estimate.estimatedCompletionAt === undefined
    ) {
      return;
    }

    await this.prisma.order.updateMany({
      where: {
        id,
        tenantId: scope.tenantId,
        restaurantId: scope.restaurantId,
        branchId: scope.branchId,
      },
      data: estimate,
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
            logoUrl: true,
            coverImage: true,
            settings: true,
          },
        },
        customer: {
          select: {
            id: true,
            email: true,
            isGuest: true,
            profile: {
              select: {
                firstName: true,
                lastName: true,
                phone: true,
                avatarUrl: true,
                metadata: true,
              },
            },
          },
        },
        deliveryAddress: {
          select: {
            id: true,
            street: true,
            area: true,
            postalCode: true,
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
            currentLat: true,
            currentLng: true,
            locationUpdatedAt: true,
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
        sourceGroupOrder: {
          select: {
            id: true,
            inviteCode: true,
            hostUserId: true,
            status: true,
            participants: {
              orderBy: [{ joinedAt: 'asc' }],
              select: {
                id: true,
                userId: true,
                isHost: true,
                status: true,
                joinedAt: true,
                leftAt: true,
                user: {
                  select: {
                    id: true,
                    email: true,
                    isGuest: true,
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
              },
            },
            items: {
              orderBy: [{ createdAt: 'asc' }],
              select: {
                id: true,
                participantId: true,
                menuItemId: true,
                variationId: true,
                quantity: true,
                note: true,
                modifiers: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    });
  }

  async findReviewContextById(id: string) {
    return this.prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        restaurantId: true,
        branchId: true,
        customerId: true,
        orderType: true,
        status: true,
        review: {
          select: { id: true },
        },
      },
    });
  }

  async createReview(data: Prisma.OrderReviewCreateInput) {
    return this.prisma.orderReview.create({
      data,
      select: {
        id: true,
        orderId: true,
        rating: true,
        comment: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findTrackingById(id: string) {
    return this.prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        tenantId: true,
        restaurantId: true,
        branchId: true,
        customerId: true,
        deliveryAddressId: true,
        deliverymanId: true,
        orderType: true,
        paymentStatus: true,
        paymentMethod: true,
        orderTime: true,
        isScheduled: true,
        status: true,
        assignedAt: true,
        deliveredAt: true,
        paidAt: true,
        cancelledAt: true,
        customerNote: true,
        createdAt: true,
        updatedAt: true,
        branch: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            coverImage: true,
          },
        },
        deliveryAddress: {
          select: {
            id: true,
            street: true,
            area: true,
            postalCode: true,
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
            currentLat: true,
            currentLng: true,
            locationUpdatedAt: true,
          },
        },
      },
    });
  }

  async list(
    restaurantId: string | undefined,
    query: ListOrdersDto,
    customerId?: string,
    deliverymanId?: string,
    excludeUnpaidStripePending = false,
  ) {
    const where: Prisma.OrderWhereInput = {
      ...(restaurantId ? { restaurantId } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.orderType ? { orderType: query.orderType } : {}),
      ...(customerId ? { customerId } : {}),
      ...(deliverymanId ? { deliverymanId } : {}),
      ...(excludeUnpaidStripePending
        ? {
            NOT: {
              paymentMethod: PaymentMethod.STRIPE,
              status: OrderStatus.PAYMENT_PENDING,
              paymentStatus: PaymentStatus.PENDING,
            },
          }
        : {}),
      ...this.buildSearchFilter(query.search),
      ...(query.kind === 'group-orders'
        ? { sourceGroupOrder: { isNot: null } }
        : query.kind === 'order'
          ? { sourceGroupOrder: { is: null } }
          : {}),
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
            select: { id: true, name: true, logoUrl: true, coverImage: true },
          },
          coupon: { select: { id: true, code: true, title: true } },
          customer: {
            select: {
              id: true,
              email: true,
              isGuest: true,
              profile: {
                select: {
                  firstName: true,
                  lastName: true,
                  phone: true,
                  avatarUrl: true,
                  metadata: true,
                },
              },
            },
          },
          deliveryAddress: {
            select: {
              id: true,
              street: true,
              area: true,
              postalCode: true,
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
              depositAmount: true,
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
          sourceGroupOrder: {
            select: {
              id: true,
              inviteCode: true,
              hostUserId: true,
              status: true,
              participants: {
                orderBy: [{ joinedAt: 'asc' }],
                select: {
                  id: true,
                  userId: true,
                  isHost: true,
                  status: true,
                  joinedAt: true,
                  leftAt: true,
                  user: {
                    select: {
                      id: true,
                      email: true,
                      isGuest: true,
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
                },
              },
              items: {
                orderBy: [{ createdAt: 'asc' }],
                select: {
                  id: true,
                  participantId: true,
                  menuItemId: true,
                  variationId: true,
                  quantity: true,
                  note: true,
                  modifiers: true,
                  createdAt: true,
                  updatedAt: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return { items, total };
  }

  async updateStatus(
    id: string,
    status: OrderStatus,
    orderTime?: Date,
    tx?: PrismaTx,
  ) {
    return this.client(tx).order.update({
      where: { id },
      data: {
        status,
        orderTime,
        isScheduled: orderTime ? orderTime.getTime() > Date.now() : undefined,
        deliveredAt:
          status === OrderStatus.DELIVERED ||
          status === OrderStatus.PICKED_UP ||
          status === OrderStatus.SERVED
            ? new Date()
            : undefined,
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
