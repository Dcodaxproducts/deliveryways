import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DeliverymanStatus, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { buildPaginationMeta } from '../../common/utils';
import { PrismaService } from '../../database';
import { OrdersService } from '../orders/orders.service';
import {
  AssignDeliverymanOrderDto,
  CreateDeliverymanDto,
  ListDeliverymenDto,
  UpdateMyDeliverymanStatusDto,
  UpdateDeliverymanDto,
  UpdateDeliverymanLocationDto,
  UpdateDeliverymanStatusDto,
} from './dto';
import { DeliverymenRepository } from './deliverymen.repository';

@Injectable()
export class DeliverymenService {
  constructor(
    private readonly deliverymenRepository: DeliverymenRepository,
    private readonly ordersService: OrdersService,
    private readonly prisma: PrismaService,
  ) {}

  async create(user: AuthUserContext, dto: CreateDeliverymanDto) {
    const tenantId = this.requireTenantId(user);
    const restaurantId = await this.resolveRestaurantId(user, dto.restaurantId);
    const branch = await this.assertBranchAccess(
      user,
      restaurantId,
      dto.branchId,
    );

    await this.assertUniqueFields(
      restaurantId,
      branch.id,
      dto.email,
      dto.phone,
    );

    const data = await this.deliverymenRepository.create({
      tenant: { connect: { id: tenantId } },
      restaurant: { connect: { id: restaurantId } },
      branch: { connect: { id: branch.id } },
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      vehicleType: dto.vehicleType,
      vehicleNumber: dto.vehicleNumber,
      password: await bcrypt.hash(dto.password ?? dto.phone, 10),
      status: dto.status ?? DeliverymanStatus.OFFLINE,
      isActive: true,
    });

    return {
      data: this.withDeletionState(data),
      message: 'Deliveryman created successfully',
    };
  }

  async list(user: AuthUserContext, query: ListDeliverymenDto) {
    const restaurantId = await this.resolveRestaurantId(
      user,
      query.restaurantId,
    );

    if (user.role === UserRoleEnum.BRANCH_ADMIN && user.bid) {
      query.branchId = user.bid;
    }

    if (query.branchId) {
      await this.assertBranchAccess(user, restaurantId, query.branchId);
    }

    const { items, total } = await this.deliverymenRepository.list(
      restaurantId,
      query,
    );

    return {
      data: items.map((item) => this.withDeletionState(item)),
      message: 'Deliverymen fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async details(user: AuthUserContext, id: string) {
    const deliveryman = await this.getAccessibleDeliveryman(user, id);

    return {
      data: this.withDeletionState(deliveryman),
      message: 'Deliveryman fetched successfully',
    };
  }

  async update(user: AuthUserContext, id: string, dto: UpdateDeliverymanDto) {
    const deliveryman = await this.getAccessibleDeliveryman(user, id);

    let targetBranchId = deliveryman.branchId;

    if (dto.branchId) {
      const branch = await this.assertBranchAccess(
        user,
        deliveryman.restaurantId,
        dto.branchId,
      );
      targetBranchId = branch.id;
    }

    await this.assertUniqueFields(
      deliveryman.restaurantId,
      targetBranchId,
      dto.email,
      dto.phone,
      deliveryman.id,
    );

    const data = await this.deliverymenRepository.update(id, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      vehicleType: dto.vehicleType,
      vehicleNumber: dto.vehicleNumber,
      password: dto.password ? await bcrypt.hash(dto.password, 10) : undefined,
      isActive: dto.isActive,
      branch: dto.branchId ? { connect: { id: dto.branchId } } : undefined,
    });

    return {
      data: this.withDeletionState(data),
      message: 'Deliveryman updated successfully',
    };
  }

  async updateStatus(
    user: AuthUserContext,
    id: string,
    dto: UpdateDeliverymanStatusDto,
  ) {
    if (user.role === 'DELIVERYMAN') {
      if (user.uid !== id) {
        throw new ForbiddenException(
          'Deliverymen can only update their own status',
        );
      }

      const availabilityStatus =
        dto.status === 'ONLINE'
          ? DeliverymanStatus.AVAILABLE
          : DeliverymanStatus.OFFLINE;

      const data = await this.deliverymenRepository.update(id, {
        status: availabilityStatus,
      });

      return {
        data: this.withDeletionState(data),
        message: 'Deliveryman availability updated successfully',
      };
    }

    await this.getAccessibleDeliveryman(user, id);

    const data = await this.deliverymenRepository.update(id, {
      status: dto.status as DeliverymanStatus,
      isActive: dto.status === DeliverymanStatus.INACTIVE ? false : undefined,
    });

    return {
      data: this.withDeletionState(data),
      message: 'Deliveryman status updated successfully',
    };
  }

  async assignOrder(
    user: AuthUserContext,
    id: string,
    dto: AssignDeliverymanOrderDto,
  ) {
    const deliveryman = await this.getAccessibleDeliveryman(user, id);

    if (!deliveryman.isActive || deliveryman.deletedAt) {
      throw new BadRequestException('Deliveryman is inactive');
    }

    if (
      deliveryman.status !== DeliverymanStatus.AVAILABLE &&
      deliveryman.status !== DeliverymanStatus.BUSY
    ) {
      throw new BadRequestException(
        'Deliveryman must be available or busy to receive an order',
      );
    }

    const orderAssignment = await this.ordersService.assignDeliveryman(
      user,
      dto.orderId,
      deliveryman.id,
      deliveryman.branchId,
      deliveryman.restaurantId,
    );

    if (deliveryman.status !== DeliverymanStatus.BUSY) {
      await this.deliverymenRepository.update(deliveryman.id, {
        status: DeliverymanStatus.BUSY,
      });
    }

    return {
      data: {
        deliveryman: {
          id: deliveryman.id,
          firstName: deliveryman.firstName,
          lastName: deliveryman.lastName,
          status: DeliverymanStatus.BUSY,
        },
        order: orderAssignment,
      },
      message: 'Order assigned to deliveryman successfully',
    };
  }

  async updateMyLocation(
    user: AuthUserContext,
    dto: UpdateDeliverymanLocationDto,
  ) {
    if (user.role !== 'DELIVERYMAN') {
      throw new ForbiddenException('Only deliverymen can update live location');
    }

    const deliveryman = await this.deliverymenRepository.findById(user.uid);

    if (!deliveryman || deliveryman.deletedAt || !deliveryman.isActive) {
      throw new NotFoundException('Deliveryman not found');
    }

    const data = await this.deliverymenRepository.update(deliveryman.id, {
      currentLat: new Prisma.Decimal(dto.lat),
      currentLng: new Prisma.Decimal(dto.lng),
      locationUpdatedAt: new Date(),
    });

    await this.ordersService.emitTrackingUpdatesForDeliveryman(deliveryman.id);

    return {
      data: this.withDeletionState(data),
      message: 'Deliveryman live location updated successfully',
    };
  }

  async updateMyStatus(
    user: AuthUserContext,
    dto: UpdateMyDeliverymanStatusDto,
  ) {
    if (user.role !== 'DELIVERYMAN') {
      throw new ForbiddenException('Only deliverymen can update own status');
    }

    const deliveryman = await this.deliverymenRepository.findById(user.uid);

    if (!deliveryman || deliveryman.deletedAt || !deliveryman.isActive) {
      throw new NotFoundException('Deliveryman not found');
    }

    const nextStatus =
      dto.status === 'ONLINE'
        ? DeliverymanStatus.AVAILABLE
        : DeliverymanStatus.OFFLINE;

    const data = await this.deliverymenRepository.update(deliveryman.id, {
      status: nextStatus,
    });

    return {
      data: this.withDeletionState(data),
      message: 'Deliveryman availability updated successfully',
    };
  }

  async remove(user: AuthUserContext, id: string) {
    await this.getAccessibleDeliveryman(user, id);

    const data = await this.deliverymenRepository.softDelete(id);

    return {
      data: this.withDeletionState(data),
      message: 'Deliveryman removed successfully',
    };
  }

  private withDeletionState<
    T extends {
      deletedAt?: Date | null;
      isActive?: boolean;
    },
  >(entity: T) {
    return {
      ...entity,
      deletionState: {
        isDeleted: !!entity.deletedAt,
        deletionScheduled: false,
        deletedAt: entity.deletedAt ?? null,
        deleteAfter: null,
        isActive: entity.isActive ?? true,
      },
    };
  }

  private async getAccessibleDeliveryman(user: AuthUserContext, id: string) {
    const deliveryman = await this.deliverymenRepository.findById(id);

    if (!deliveryman || deliveryman.deletedAt) {
      throw new NotFoundException('Deliveryman not found');
    }

    await this.assertRestaurantAccess(user, deliveryman.restaurantId);

    if (
      user.role === UserRoleEnum.BRANCH_ADMIN &&
      user.bid !== deliveryman.branchId
    ) {
      throw new ForbiddenException(
        'You cannot access resources outside your branch',
      );
    }

    return deliveryman;
  }

  private requireTenantId(user: AuthUserContext): string {
    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    return user.tid;
  }

  private async resolveRestaurantId(
    user: AuthUserContext,
    requestedRestaurantId?: string,
  ): Promise<string> {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      if (!requestedRestaurantId) {
        throw new BadRequestException('restaurantId is required');
      }

      return requestedRestaurantId;
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      if (!user.tid) {
        throw new ForbiddenException('Tenant context is required');
      }

      if (!requestedRestaurantId) {
        throw new BadRequestException('restaurantId is required');
      }

      if (user.rid && user.rid === requestedRestaurantId) {
        return requestedRestaurantId;
      }

      const restaurant = await this.prisma.restaurant.findFirst({
        where: {
          id: requestedRestaurantId,
          tenantId: user.tid,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!restaurant) {
        throw new ForbiddenException(
          'You cannot access resources outside your tenant restaurants',
        );
      }

      return requestedRestaurantId;
    }

    if (!user.rid) {
      throw new ForbiddenException('Restaurant context is required');
    }

    if (requestedRestaurantId && requestedRestaurantId !== user.rid) {
      throw new ForbiddenException(
        'You cannot access resources outside your restaurant',
      );
    }

    return user.rid;
  }

  private async assertRestaurantAccess(
    user: AuthUserContext,
    restaurantId: string,
  ) {
    await this.resolveRestaurantId(user, restaurantId);
  }

  private async assertBranchAccess(
    user: AuthUserContext,
    restaurantId: string,
    branchId: string,
  ) {
    await this.assertRestaurantAccess(user, restaurantId);

    if (
      user.role === UserRoleEnum.BRANCH_ADMIN &&
      user.bid &&
      user.bid !== branchId
    ) {
      throw new ForbiddenException(
        'You cannot access resources outside your branch',
      );
    }

    const branch = await this.prisma.branch.findFirst({
      where: {
        id: branchId,
        restaurantId,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        restaurantId: true,
        tenantId: true,
      },
    });

    if (!branch) {
      throw new BadRequestException('Branch not found or inactive');
    }

    if (user.tid && branch.tenantId !== user.tid) {
      throw new ForbiddenException(
        'You cannot access resources outside your tenant',
      );
    }

    return branch;
  }

  private async assertUniqueFields(
    restaurantId: string,
    branchId: string,
    email?: string,
    phone?: string,
    excludeId?: string,
  ) {
    if (email) {
      const existingEmail = await this.prisma.deliveryman.findFirst({
        where: {
          restaurantId,
          email,
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        select: { id: true },
      });

      if (existingEmail) {
        throw new BadRequestException(
          'A deliveryman with this email already exists in this restaurant',
        );
      }
    }

    if (phone) {
      const existingPhone = await this.prisma.deliveryman.findFirst({
        where: {
          branchId,
          phone,
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        select: { id: true },
      });

      if (existingPhone) {
        throw new BadRequestException(
          'A deliveryman with this phone already exists in this branch',
        );
      }
    }
  }
}
