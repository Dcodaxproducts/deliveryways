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
import { AddressesService } from '../addresses/addresses.service';
import { StorageService } from '../storage/storage.service';
import {
  CreateAddressDto,
  ListAddressesDto,
  UpdateAddressDto,
} from '../addresses/dto';
import {
  AssignDeliverymanOrderDto,
  CreateDeliverymanDto,
  DeliverymanSignupDto,
  ListDeliverymenDto,
  UpdateMyDeliverymanProfileDto,
  UpdateMyDeliverymanStatusDto,
  UpdateMyDeliverymanTwoFactorDto,
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
    private readonly addressesService: AddressesService,
    private readonly prisma: PrismaService,
    private readonly storageService?: StorageService,
  ) {}

  async create(user: AuthUserContext, dto: CreateDeliverymanDto) {
    const tenantId = this.requireTenantId(user);
    const restaurantId = await this.resolveRestaurantId(user, dto.restaurantId);
    const branch = await this.assertBranchAccess(
      user,
      restaurantId,
      dto.branchId,
    );
    const email = this.normalizeEmail(dto.email);
    const phone = dto.phone.trim();

    await this.assertUniqueFields(restaurantId, branch.id, email, phone);

    const deletedDeliveryman = await this.findDeletedDeliverymanForReuse(
      restaurantId,
      branch.id,
      email,
      phone,
    );
    const deliverymanPayload = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email,
      phone,
      vehicleType: dto.vehicleType,
      vehicleNumber: dto.vehicleNumber,
      password: await bcrypt.hash(dto.password ?? phone, 10),
      status: dto.status ?? DeliverymanStatus.OFFLINE,
      isActive: true,
      deletedAt: null,
      refreshTokenHash: null,
      branch: { connect: { id: branch.id } },
    };
    const data = deletedDeliveryman
      ? await this.deliverymenRepository.update(
          deletedDeliveryman.id,
          deliverymanPayload,
        )
      : await this.deliverymenRepository.create({
          tenant: { connect: { id: tenantId } },
          restaurant: { connect: { id: restaurantId } },
          ...deliverymanPayload,
        });

    return {
      data: this.withDeletionState(data),
      message: 'Deliveryman created successfully',
    };
  }

  async signup(dto: DeliverymanSignupDto) {
    const branch = await this.prisma.branch.findFirst({
      where: {
        id: dto.branchId,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        tenantId: true,
        restaurantId: true,
        restaurant: {
          select: {
            id: true,
            isActive: true,
            deletedAt: true,
          },
        },
      },
    });

    if (!branch || !branch.restaurant.isActive || branch.restaurant.deletedAt) {
      throw new BadRequestException('Branch not found or inactive');
    }

    if (dto.restaurantId && dto.restaurantId !== branch.restaurantId) {
      throw new BadRequestException('Branch does not belong to restaurant');
    }

    const email = this.normalizeEmail(dto.email);
    const phone = dto.phone.trim();

    await this.assertUniqueFields(branch.restaurantId, branch.id, email, phone);

    const deletedDeliveryman = await this.findDeletedDeliverymanForReuse(
      branch.restaurantId,
      branch.id,
      email,
      phone,
    );
    const deliverymanPayload = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email,
      phone,
      vehicleType: dto.vehicleType,
      vehicleNumber: dto.vehicleNumber,
      password: await bcrypt.hash(dto.password, 10),
      status: DeliverymanStatus.OFFLINE,
      isActive: true,
      deletedAt: null,
      refreshTokenHash: null,
      branch: { connect: { id: branch.id } },
    };
    const data = deletedDeliveryman
      ? await this.deliverymenRepository.update(
          deletedDeliveryman.id,
          deliverymanPayload,
        )
      : await this.deliverymenRepository.create({
          tenant: { connect: { id: branch.tenantId } },
          restaurant: { connect: { id: branch.restaurantId } },
          ...deliverymanPayload,
        });

    return {
      data: this.withDeletionState(data),
      message: 'Deliveryman signup completed successfully',
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

  async myProfile(user: AuthUserContext) {
    const deliveryman = await this.getActiveDeliverymanForSelf(user);

    return {
      data: await this.resolveMediaResponse(
        this.toDriverProfileResponse(deliveryman),
      ),
      message: 'Deliveryman profile fetched successfully',
    };
  }

  async updateMyProfile(
    user: AuthUserContext,
    dto: UpdateMyDeliverymanProfileDto,
  ) {
    const deliveryman = await this.getActiveDeliverymanForSelf(user);

    if (dto.phone && dto.phone !== deliveryman.phone) {
      await this.assertUniqueFields(
        deliveryman.restaurantId,
        deliveryman.branchId,
        undefined,
        dto.phone.trim(),
        deliveryman.id,
      );
    }

    const data = await this.deliverymenRepository.update(deliveryman.id, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone?.trim(),
      vehicleType: dto.vehicleType,
      vehicleNumber: dto.vehicleNumber,
      avatarUrl: dto.avatarUrl,
    });

    return {
      data: await this.resolveMediaResponse(this.toDriverProfileResponse(data)),
      message: 'Deliveryman profile updated successfully',
    };
  }

  async updateMyTwoFactor(
    user: AuthUserContext,
    dto: UpdateMyDeliverymanTwoFactorDto,
  ) {
    const deliveryman = await this.getActiveDeliverymanForSelf(user);
    const data = await this.deliverymenRepository.update(deliveryman.id, {
      twoFactorEnabled: dto.enabled,
      twoFactorOtp: null,
      twoFactorOtpExpiresAt: null,
      twoFactorOtpAttempts: 0,
    });

    return {
      data: {
        id: data.id,
        twoFactorEnabled: data.twoFactorEnabled,
      },
      message: data.twoFactorEnabled
        ? 'Deliveryman 2FA enabled successfully'
        : 'Deliveryman 2FA disabled successfully',
    };
  }

  async myEarnings(user: AuthUserContext) {
    const deliveryman = await this.getActiveDeliverymanForSelf(user);
    const now = new Date();
    const monthStart = this.startOfMonth(now);
    const weekStart = this.startOfWeek(now);
    const dayStart = this.startOfDay(now);
    const deliveredOrders =
      await this.deliverymenRepository.listDeliveredOrdersForEarnings(
        deliveryman.id,
        monthStart,
      );
    const currency = await this.resolveRestaurantCurrency(
      deliveryman.restaurantId,
    );
    const daily = this.buildEarningsPeriod(deliveredOrders, dayStart);
    const weekly = this.buildEarningsPeriod(deliveredOrders, weekStart);
    const monthly = this.buildEarningsPeriod(deliveredOrders, monthStart);

    return {
      data: {
        currency,
        earningsSource: 'deliveryFee',
        summary: {
          daily,
          weekly,
          monthly,
        },
        recentDeliveries: deliveredOrders.slice(0, 10).map((order) => ({
          id: order.id,
          status: order.status,
          paymentStatus: order.paymentStatus,
          deliveredAt: order.deliveredAt,
          orderTime: order.orderTime,
          totalAmount: Number(order.totalAmount),
          earningAmount: Number(order.deliveryFee),
          branch: order.branch,
          customer: {
            id: order.customer.id,
            email: order.customer.email,
            firstName: order.customer.profile?.firstName ?? null,
            lastName: order.customer.profile?.lastName ?? null,
            phone: order.customer.profile?.phone ?? null,
          },
          deliveryAddress: order.deliveryAddress
            ? {
                street: order.deliveryAddress.street,
                houseNumber: order.deliveryAddress.area,
                postalCode: order.deliveryAddress.postalCode,
                city: order.deliveryAddress.city,
              }
            : null,
        })),
      },
      message: 'Deliveryman earnings fetched successfully',
    };
  }

  async listMyAddresses(user: AuthUserContext, query: ListAddressesDto) {
    await this.getActiveDeliverymanForSelf(user);

    return this.addressesService.list(user, query);
  }

  async createMyAddress(user: AuthUserContext, dto: CreateAddressDto) {
    await this.getActiveDeliverymanForSelf(user);

    return this.addressesService.create(user, dto);
  }

  async updateMyAddress(
    user: AuthUserContext,
    id: string,
    dto: UpdateAddressDto,
  ) {
    await this.getActiveDeliverymanForSelf(user);

    return this.addressesService.update(user, id, dto);
  }

  async removeMyAddress(user: AuthUserContext, id: string) {
    await this.getActiveDeliverymanForSelf(user);

    return this.addressesService.remove(user, id);
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
      dto.email ? this.normalizeEmail(dto.email) : undefined,
      dto.phone?.trim(),
      deliveryman.id,
    );

    const data = await this.deliverymenRepository.update(id, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email ? this.normalizeEmail(dto.email) : undefined,
      phone: dto.phone?.trim(),
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

    this.assertNoActiveDeliveryOrder(deliveryman);

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

  async acceptOrder(user: AuthUserContext, dto: AssignDeliverymanOrderDto) {
    if (user.role !== 'DELIVERYMAN') {
      throw new ForbiddenException('Only deliverymen can accept orders');
    }

    const deliveryman = await this.deliverymenRepository.findById(user.uid);

    if (!deliveryman || deliveryman.deletedAt || !deliveryman.isActive) {
      throw new NotFoundException('Deliveryman not found');
    }

    if (
      deliveryman.status !== DeliverymanStatus.AVAILABLE &&
      deliveryman.status !== DeliverymanStatus.BUSY
    ) {
      throw new BadRequestException(
        'Deliveryman must be available or busy to accept an order',
      );
    }

    this.assertNoActiveDeliveryOrder(deliveryman);

    const orderAssignment = await this.ordersService.acceptDeliverymanOrder(
      user,
      dto.orderId,
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
      message: 'Order accepted by deliveryman successfully',
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

  private assertNoActiveDeliveryOrder(deliveryman: {
    orders?: Array<{ id: string }>;
  }) {
    if ((deliveryman.orders?.length ?? 0) > 0) {
      throw new BadRequestException(
        'Deliveryman already has an active delivery order',
      );
    }
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

  private async getActiveDeliverymanForSelf(user: AuthUserContext) {
    if (user.role !== 'DELIVERYMAN') {
      throw new ForbiddenException('Only deliverymen can access this resource');
    }

    const deliveryman = await this.deliverymenRepository.findById(user.uid);

    if (!deliveryman || deliveryman.deletedAt || !deliveryman.isActive) {
      throw new NotFoundException('Deliveryman not found');
    }

    return deliveryman;
  }

  private toDriverProfileResponse<
    T extends {
      id: string;
      tenantId: string;
      restaurantId: string;
      branchId: string;
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      vehicleType?: string | null;
      vehicleNumber?: string | null;
      avatarUrl?: string | null;
      twoFactorEnabled?: boolean;
      status: DeliverymanStatus;
      currentLat?: Prisma.Decimal | null;
      currentLng?: Prisma.Decimal | null;
      locationUpdatedAt?: Date | null;
      branch?: { id: string; name: string } | null;
      isActive: boolean;
      deletedAt?: Date | null;
    },
  >(deliveryman: T) {
    return this.withDeletionState({
      id: deliveryman.id,
      email: deliveryman.email,
      role: 'DELIVERYMAN',
      actorType: 'DELIVERYMAN',
      tenantId: deliveryman.tenantId,
      restaurantId: deliveryman.restaurantId,
      branchId: deliveryman.branchId,
      profile: {
        firstName: deliveryman.firstName,
        lastName: deliveryman.lastName,
        phone: deliveryman.phone,
        avatarUrl: deliveryman.avatarUrl ?? null,
        bio: null,
      },
      vehicle: {
        type: deliveryman.vehicleType ?? null,
        number: deliveryman.vehicleNumber ?? null,
      },
      twoFactorEnabled: deliveryman.twoFactorEnabled ?? false,
      status: deliveryman.status,
      currentLocation:
        deliveryman.currentLat !== null && deliveryman.currentLng !== null
          ? {
              lat: Number(deliveryman.currentLat),
              lng: Number(deliveryman.currentLng),
              updatedAt: deliveryman.locationUpdatedAt ?? null,
            }
          : null,
      branch: deliveryman.branch ?? null,
      isActive: deliveryman.isActive,
      deletedAt: deliveryman.deletedAt ?? null,
    });
  }

  private async resolveMediaResponse<T>(data: T): Promise<T> {
    return (await this.storageService?.resolveMediaUrlsDeep(data)) ?? data;
  }

  private buildEarningsPeriod<
    T extends { deliveredAt: Date | null; deliveryFee: Prisma.Decimal },
  >(orders: T[], since: Date) {
    const periodOrders = orders.filter(
      (order) => order.deliveredAt && order.deliveredAt >= since,
    );
    const total = periodOrders.reduce(
      (sum, order) => sum + Number(order.deliveryFee),
      0,
    );

    return {
      deliveriesCount: periodOrders.length,
      earningsAmount: Number(total.toFixed(2)),
      from: since,
    };
  }

  private startOfDay(date: Date) {
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      0,
      0,
      0,
      0,
    );
  }

  private startOfWeek(date: Date) {
    const start = this.startOfDay(date);
    const day = start.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diff);

    return start;
  }

  private startOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  }

  private async resolveRestaurantCurrency(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { settings: true },
    });

    return this.readStringValue(restaurant?.settings, [
      ['customerApp', 'currency'],
      ['checkout', 'currency'],
      ['payments', 'currency'],
      ['currency'],
      ['defaultCurrency'],
    ]);
  }

  private readStringValue(
    source: Prisma.JsonValue | null | undefined,
    paths: string[][],
  ) {
    for (const path of paths) {
      let current: unknown = source;

      for (const key of path) {
        if (!current || typeof current !== 'object' || Array.isArray(current)) {
          current = undefined;
          break;
        }

        current = (current as Record<string, unknown>)[key];
      }

      if (typeof current === 'string' && current.trim()) {
        return current.trim();
      }
    }

    return null;
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
          deletedAt: null,
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
          deletedAt: null,
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

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private async findDeletedDeliverymanForReuse(
    restaurantId: string,
    branchId: string,
    email: string,
    phone: string,
  ) {
    return this.prisma.deliveryman.findFirst({
      where: {
        deletedAt: { not: null },
        OR: [
          { restaurantId, email },
          { branchId, phone },
        ],
      },
      select: { id: true },
      orderBy: { updatedAt: 'desc' },
    });
  }
}
