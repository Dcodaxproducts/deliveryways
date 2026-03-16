import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DeliverymanStatus } from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { buildPaginationMeta } from '../../common/utils';
import { PrismaService } from '../../database';
import { OrdersService } from '../orders/orders.service';
import {
  AssignDeliverymanOrderDto,
  CreateDeliverymanDto,
  ListDeliverymenDto,
  UpdateDeliverymanDto,
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
    const restaurantId = this.resolveRestaurantId(user, dto.restaurantId);
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
      status: dto.status ?? DeliverymanStatus.OFFLINE,
      isActive: true,
    });

    return {
      data,
      message: 'Deliveryman created successfully',
    };
  }

  async list(user: AuthUserContext, query: ListDeliverymenDto) {
    const restaurantId = this.resolveRestaurantId(user, query.restaurantId);

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
      data: items,
      message: 'Deliverymen fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async details(user: AuthUserContext, id: string) {
    const deliveryman = await this.getAccessibleDeliveryman(user, id);

    return {
      data: deliveryman,
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
      isActive: dto.isActive,
      branch: dto.branchId ? { connect: { id: dto.branchId } } : undefined,
    });

    return {
      data,
      message: 'Deliveryman updated successfully',
    };
  }

  async updateStatus(
    user: AuthUserContext,
    id: string,
    dto: UpdateDeliverymanStatusDto,
  ) {
    await this.getAccessibleDeliveryman(user, id);

    const data = await this.deliverymenRepository.update(id, {
      status: dto.status,
      isActive: dto.status === DeliverymanStatus.INACTIVE ? false : undefined,
    });

    return {
      data,
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

  async remove(user: AuthUserContext, id: string) {
    await this.getAccessibleDeliveryman(user, id);

    const data = await this.deliverymenRepository.softDelete(id);

    return {
      data,
      message: 'Deliveryman removed successfully',
    };
  }

  private async getAccessibleDeliveryman(user: AuthUserContext, id: string) {
    const deliveryman = await this.deliverymenRepository.findById(id);

    if (!deliveryman || deliveryman.deletedAt) {
      throw new NotFoundException('Deliveryman not found');
    }

    this.assertRestaurantAccess(user, deliveryman.restaurantId);

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

  private resolveRestaurantId(
    user: AuthUserContext,
    requestedRestaurantId?: string,
  ): string {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      if (!requestedRestaurantId) {
        throw new BadRequestException('restaurantId is required');
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

  private assertRestaurantAccess(user: AuthUserContext, restaurantId: string) {
    this.resolveRestaurantId(user, restaurantId);
  }

  private async assertBranchAccess(
    user: AuthUserContext,
    restaurantId: string,
    branchId: string,
  ) {
    this.assertRestaurantAccess(user, restaurantId);

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
