import { Injectable } from '@nestjs/common';
import { AddressRefType, Prisma, PrismaClient, UserRole } from '@prisma/client';
import { PrismaService } from '../../database';
import { QueryDto } from '../../common/dto';
import { PrismaTx } from '../../common/types';

@Injectable()
export class BranchesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaClient | PrismaTx {
    return tx ?? this.prisma;
  }

  async create(
    payload: {
      tenantId: string;
      restaurantId: string;
      name: string;
      isMain?: boolean;
      street: string;
      area?: string;
      city: string;
      state: string;
      country: string;
      lat: string;
      lng: string;
      coverImage?: string;
      description?: string;
      settings?: Prisma.InputJsonValue;
    },
    tx?: PrismaTx,
  ) {
    const client = this.client(tx);

    if (payload.isMain) {
      await client.branch.updateMany({
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

    const branch = await client.branch.create({
      data: {
        tenantId: payload.tenantId,
        restaurantId: payload.restaurantId,
        name: payload.name,
        isMain: payload.isMain ?? false,
        coverImage: payload.coverImage,
        description: payload.description,
        settings: payload.settings,
      },
    });

    await client.address.create({
      data: {
        tenantId: payload.tenantId,
        referenceId: branch.id,
        refType: AddressRefType.BRANCH,
        street: payload.street,
        area: payload.area,
        city: payload.city,
        state: payload.state,
        country: payload.country,
        lat: new Prisma.Decimal(payload.lat),
        lng: new Prisma.Decimal(payload.lng),
      },
    });

    return branch;
  }

  async listByRestaurant(
    tenantId: string | undefined,
    restaurantId: string | undefined,
    query: QueryDto,
    publicView = false,
    withDeleted = false,
    includeInactive = false,
  ) {
    const where: Prisma.BranchWhereInput = {
      ...(tenantId ? { tenantId } : {}),
      ...(restaurantId ? { restaurantId } : {}),
      ...(withDeleted ? {} : { deletedAt: null }),
      ...(publicView ? { isActive: true, deletedAt: null } : {}),
      ...(!publicView && !includeInactive ? { isActive: true } : {}),
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
        include: this.listIncludeConfig,
      }),
      this.prisma.branch.count({ where }),
    ]);

    return { items, total };
  }

  async listAllByRestaurant(
    tenantId: string | undefined,
    restaurantId: string | undefined,
    query: QueryDto,
    publicView = false,
    withDeleted = false,
    includeInactive = false,
  ) {
    const where: Prisma.BranchWhereInput = {
      ...(tenantId ? { tenantId } : {}),
      ...(restaurantId ? { restaurantId } : {}),
      ...(withDeleted ? {} : { deletedAt: null }),
      ...(publicView ? { isActive: true, deletedAt: null } : {}),
      ...(!publicView && !includeInactive ? { isActive: true } : {}),
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
        orderBy: {
          [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc',
        },
        include: this.listIncludeConfig,
      }),
      this.prisma.branch.count({ where }),
    ]);

    return { items, total };
  }

  private readonly listIncludeConfig = {
    restaurant: {
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        coverImage: true,
      },
    },
    manager: {
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
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
    _count: {
      select: {
        users: true,
        orders: true,
        deliverymen: true,
      },
    },
  } satisfies Prisma.BranchInclude;

  async listByBranchId(branchId: string) {
    return this.prisma.branch.findMany({
      where: {
        id: branchId,
        deletedAt: null,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.branch.findUnique({
      where: { id },
      include: {
        manager: {
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
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
        restaurant: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
            coverImage: true,
          },
        },
      },
    });
  }

  async findTenantIdByRestaurant(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { tenantId: true },
    });

    return restaurant?.tenantId;
  }

  async listBranchAddresses(branchIds: string[]) {
    if (!branchIds.length) {
      return [];
    }

    return this.prisma.address.findMany({
      where: {
        refType: AddressRefType.BRANCH,
        referenceId: { in: branchIds },
        deletedAt: null,
        isActive: true,
      },
      select: {
        referenceId: true,
        lat: true,
        lng: true,
        street: true,
        area: true,
        city: true,
        state: true,
        country: true,
      },
    });
  }

  async findActiveCustomer(
    customerId: string,
    tenantId: string,
    restaurantId?: string,
  ) {
    return this.prisma.user.findFirst({
      where: {
        id: customerId,
        tenantId,
        ...(restaurantId ? { restaurantId } : {}),
        role: UserRole.CUSTOMER,
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        tenantId: true,
        restaurantId: true,
      },
    });
  }

  async findActiveCustomerById(customerId: string) {
    return this.prisma.user.findFirst({
      where: {
        id: customerId,
        role: UserRole.CUSTOMER,
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        tenantId: true,
        restaurantId: true,
      },
    });
  }

  async findOwnedCustomerAddress(
    addressId: string,
    tenantId: string,
    customerId: string,
  ) {
    return this.prisma.address.findFirst({
      where: {
        id: addressId,
        tenantId,
        referenceId: customerId,
        refType: AddressRefType.USER,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        lat: true,
        lng: true,
      },
    });
  }

  async update(id: string, data: Prisma.BranchUpdateInput, tx?: PrismaTx) {
    return this.client(tx).branch.update({ where: { id }, data });
  }

  async setActive(id: string, isActive: boolean, tx?: PrismaTx) {
    return this.client(tx).branch.update({
      where: { id },
      data: { isActive },
    });
  }

  async softDelete(id: string, tx?: PrismaTx) {
    return this.client(tx).branch.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });
  }

  async getDeleteSummary(branchId: string) {
    const [
      users,
      menuItemOverrides,
      categoryOverrides,
      inventoryMovements,
      coupons,
      orders,
      transactions,
    ] = await this.prisma.$transaction([
      this.prisma.user.count({ where: { branchId } }),
      this.prisma.branchMenuItemOverride.count({ where: { branchId } }),
      this.prisma.branchCategoryOverride.count({ where: { branchId } }),
      this.prisma.inventoryMovement.count({ where: { branchId } }),
      this.prisma.coupon.count({ where: { branchId } }),
      this.prisma.order.count({ where: { branchId } }),
      this.prisma.paymentTransaction.count({ where: { branchId } }),
    ]);

    return {
      users,
      menuItemOverrides,
      categoryOverrides,
      inventoryMovements,
      coupons,
      orders,
      transactions,
    };
  }

  async forceDelete(id: string, tx?: PrismaTx) {
    const client = this.client(tx);

    await client.address.deleteMany({
      where: {
        refType: AddressRefType.BRANCH,
        referenceId: id,
      },
    });

    return client.branch.delete({
      where: { id },
    });
  }
}
