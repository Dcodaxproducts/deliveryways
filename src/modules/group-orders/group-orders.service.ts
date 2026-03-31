import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GroupOrderParticipantStatus,
  GroupOrderStatus,
  OrderType,
  Prisma,
} from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import { OrderTypeEnum, UserRoleEnum } from '../../common/enums';
import { buildPaginationMeta } from '../../common/utils';
import { OrdersService } from '../orders/orders.service';
import {
  AddGroupOrderItemDto,
  CheckoutGroupOrderDto,
  CreateGroupOrderSessionDto,
  JoinGroupOrderDto,
  ListGroupOrdersDto,
  UpdateGroupOrderItemDto,
  UpdateGroupOrderSessionDto,
  UpdateGroupOrderStatusDto,
} from './dto';
import { GroupOrdersRepository } from './group-orders.repository';

@Injectable()
export class GroupOrdersService {
  constructor(
    private readonly groupOrdersRepository: GroupOrdersRepository,
    private readonly ordersService: OrdersService,
  ) {}

  async create(user: AuthUserContext, dto: CreateGroupOrderSessionDto) {
    this.assertCustomerUser(user);

    const branch = await this.groupOrdersRepository.findActiveBranch(
      dto.branchId,
    );
    if (
      !branch ||
      branch.restaurantId !== user.rid ||
      branch.tenantId !== user.tid
    ) {
      throw new BadRequestException(
        'Branch not found for current customer scope',
      );
    }

    const existingActiveSession =
      await this.groupOrdersRepository.findActiveSessionByHost(user.uid);
    if (existingActiveSession) {
      throw new BadRequestException(
        'You already have an active group order session',
      );
    }

    const orderType = this.toOrderType(dto.orderType);
    await this.assertDeliveryAddress(
      user,
      branch.tenantId,
      orderType,
      dto.deliveryAddressId,
    );
    const inviteCode = this.generateInviteCode();
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

    const session = await this.groupOrdersRepository.createSession({
      tenant: { connect: { id: branch.tenantId } },
      restaurant: { connect: { id: branch.restaurantId } },
      branch: { connect: { id: branch.id } },
      hostUser: { connect: { id: user.uid } },
      orderType,
      deliveryAddress: dto.deliveryAddressId
        ? { connect: { id: dto.deliveryAddressId } }
        : undefined,
      orderTime: dto.orderTime ? new Date(dto.orderTime) : undefined,
      hostNote: this.resolveOptionalString(dto.hostNote),
      inviteCode,
      expiresAt,
      participants: {
        create: {
          user: { connect: { id: user.uid } },
          isHost: true,
          status: GroupOrderParticipantStatus.ACTIVE,
        },
      },
    });

    return {
      data: await this.buildSessionResponseOrThrow(session.id),
      message: 'Group order created successfully',
    };
  }

  async join(user: AuthUserContext, dto: JoinGroupOrderDto) {
    this.assertCustomerUser(user);

    const session = await this.groupOrdersRepository.findSessionByInviteCode(
      dto.inviteCode.trim(),
    );
    if (!session) {
      throw new NotFoundException('Group order not found');
    }

    this.assertSessionAvailable(session.status, session.expiresAt);
    if (session.restaurantId !== user.rid || session.tenantId !== user.tid) {
      throw new ForbiddenException(
        'You cannot join a group order outside your restaurant',
      );
    }

    if (session.hostUserId === user.uid) {
      throw new BadRequestException('Host is already part of this group order');
    }

    const existingParticipant =
      await this.groupOrdersRepository.findParticipant(session.id, user.uid);
    if (!existingParticipant) {
      await this.groupOrdersRepository.createParticipant({
        session: { connect: { id: session.id } },
        user: { connect: { id: user.uid } },
        status: GroupOrderParticipantStatus.ACTIVE,
      });
    } else if (
      existingParticipant.status === GroupOrderParticipantStatus.ACTIVE
    ) {
      throw new BadRequestException('You are already part of this group order');
    } else if (
      existingParticipant.status === GroupOrderParticipantStatus.REMOVED
    ) {
      throw new BadRequestException('You cannot rejoin this group order');
    } else {
      await this.groupOrdersRepository.updateParticipant(
        existingParticipant.id,
        {
          status: GroupOrderParticipantStatus.ACTIVE,
          leftAt: null,
        },
      );
    }

    return {
      data: await this.buildSessionResponseOrThrow(session.id),
      message: 'Joined group order successfully',
    };
  }

  async list(user: AuthUserContext, query: ListGroupOrdersDto) {
    this.assertCustomerUser(user);
    const { items, total } = await this.groupOrdersRepository.listForUser(
      user.uid,
      query,
    );

    return {
      data: await Promise.all(
        items.map(async (item) => this.buildSessionResponse(item)),
      ),
      message: 'Group orders fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async details(user: AuthUserContext, id: string) {
    this.assertCustomerUser(user);
    const session = await this.getSessionForMemberOrThrow(user, id);

    return {
      data: await this.buildSessionResponse(session),
      message: 'Group order fetched successfully',
    };
  }

  async updateSettings(
    user: AuthUserContext,
    id: string,
    dto: UpdateGroupOrderSessionDto,
  ) {
    const session = await this.getSessionForHostOrThrow(user, id);
    this.assertSessionMutable(session.status, session.expiresAt);
    await this.assertDeliveryAddress(
      user,
      session.tenantId,
      session.orderType,
      dto.deliveryAddressId,
    );

    await this.groupOrdersRepository.updateSession(id, {
      deliveryAddress:
        dto.deliveryAddressId !== undefined
          ? dto.deliveryAddressId
            ? { connect: { id: dto.deliveryAddressId } }
            : { disconnect: true }
          : undefined,
      orderTime:
        dto.orderTime !== undefined
          ? dto.orderTime
            ? new Date(dto.orderTime)
            : null
          : undefined,
      hostNote:
        dto.hostNote !== undefined
          ? this.resolveOptionalString(dto.hostNote)
          : undefined,
      couponCode:
        dto.couponCode !== undefined
          ? this.resolveOptionalString(dto.couponCode)
          : undefined,
    });

    return {
      data: await this.buildSessionResponseOrThrow(id),
      message: 'Group order updated successfully',
    };
  }

  async addItem(user: AuthUserContext, id: string, dto: AddGroupOrderItemDto) {
    const session = await this.getSessionForMemberOrThrow(user, id);
    this.assertSessionOpenForContribution(session.status, session.expiresAt);
    const participant = this.getActiveParticipant(session, user.uid);
    if (!participant) {
      throw new ForbiddenException('Only active participants can add items');
    }

    await this.assertValidSessionItem(
      session.restaurantId,
      session.branchId,
      dto,
    );

    await this.groupOrdersRepository.createItem({
      session: { connect: { id } },
      participant: { connect: { id: participant.id } },
      menuItemId: dto.menuItemId,
      variationId: dto.variationId,
      quantity: dto.quantity,
      note: this.resolveOptionalString(dto.note),
      modifiers: dto.modifiers as unknown as Prisma.InputJsonValue,
    });

    return {
      data: await this.buildSessionResponseOrThrow(id),
      message: 'Group order item added successfully',
    };
  }

  async updateItem(
    user: AuthUserContext,
    id: string,
    itemId: string,
    dto: UpdateGroupOrderItemDto,
  ) {
    const session = await this.getSessionForMemberOrThrow(user, id);
    this.assertSessionOpenForContribution(session.status, session.expiresAt);
    const item = await this.groupOrdersRepository.findItemById(itemId);
    if (!item || item.sessionId !== session.id) {
      throw new NotFoundException('Group order item not found');
    }

    const participant = this.getActiveParticipant(session, user.uid);
    if (!participant || item.participantId !== participant.id) {
      throw new ForbiddenException(
        'You can only update your own group order items',
      );
    }

    if (dto.quantity !== undefined && dto.quantity < 1) {
      throw new BadRequestException('quantity must be at least 1');
    }

    if (dto.variationId !== undefined || dto.modifiers !== undefined) {
      await this.assertValidSessionItem(
        session.restaurantId,
        session.branchId,
        {
          menuItemId: item.menuItemId,
          variationId:
            dto.variationId === undefined
              ? (item.variationId ?? undefined)
              : (dto.variationId ?? undefined),
          quantity: dto.quantity ?? item.quantity,
          note:
            dto.note === undefined
              ? (item.note ?? undefined)
              : (dto.note ?? undefined),
          modifiers:
            dto.modifiers === undefined
              ? (item.modifiers as never)
              : (dto.modifiers ?? undefined),
        },
      );
    }

    await this.groupOrdersRepository.updateItem(itemId, {
      variationId: dto.variationId === undefined ? undefined : dto.variationId,
      quantity: dto.quantity,
      note:
        dto.note === undefined
          ? undefined
          : this.resolveOptionalString(dto.note),
      modifiers:
        dto.modifiers === undefined
          ? undefined
          : (dto.modifiers as unknown as Prisma.InputJsonValue),
    });

    return {
      data: await this.buildSessionResponseOrThrow(id),
      message: 'Group order item updated successfully',
    };
  }

  async removeItem(user: AuthUserContext, id: string, itemId: string) {
    const session = await this.getSessionForMemberOrThrow(user, id);
    this.assertSessionOpenForContribution(session.status, session.expiresAt);
    const item = await this.groupOrdersRepository.findItemById(itemId);
    if (!item || item.sessionId !== session.id) {
      throw new NotFoundException('Group order item not found');
    }

    const participant = this.getActiveParticipant(session, user.uid);
    if (!participant || item.participantId !== participant.id) {
      throw new ForbiddenException(
        'You can only remove your own group order items',
      );
    }

    await this.groupOrdersRepository.deleteItem(itemId);

    return {
      data: await this.buildSessionResponseOrThrow(id),
      message: 'Group order item removed successfully',
    };
  }

  async leave(user: AuthUserContext, id: string) {
    const session = await this.getSessionForMemberOrThrow(user, id);
    const participant = this.getActiveParticipant(session, user.uid);
    if (!participant) {
      throw new BadRequestException('Participant is already inactive');
    }
    if (participant.isHost) {
      throw new BadRequestException('Host cannot leave the group order');
    }
    this.assertSessionMutable(session.status, session.expiresAt);

    await this.groupOrdersRepository.updateParticipant(participant.id, {
      status: GroupOrderParticipantStatus.LEFT,
      leftAt: new Date(),
    });

    return {
      data: await this.buildSessionResponseOrThrow(id),
      message: 'Left group order successfully',
    };
  }

  async updateStatus(
    user: AuthUserContext,
    id: string,
    dto: UpdateGroupOrderStatusDto,
  ) {
    const session = await this.getSessionForHostOrThrow(user, id);
    this.assertSessionMutable(session.status, session.expiresAt);

    if (
      dto.status === GroupOrderStatus.CHECKED_OUT ||
      dto.status === GroupOrderStatus.EXPIRED
    ) {
      throw new BadRequestException('Invalid manual status update');
    }

    await this.groupOrdersRepository.updateSession(id, {
      status: dto.status,
      lockedAt: dto.status === GroupOrderStatus.LOCKED ? new Date() : null,
    });

    return {
      data: await this.buildSessionResponseOrThrow(id),
      message: 'Group order status updated successfully',
    };
  }

  async quote(user: AuthUserContext, id: string) {
    const session = await this.getSessionForMemberOrThrow(user, id);
    const quotePayload = this.toOrderQuotePayload(session);
    const quote = await this.ordersService.quote(user, quotePayload);

    return {
      data: {
        session: await this.buildSessionResponse(session),
        quote: quote.data,
      },
      message: 'Group order quote generated successfully',
    };
  }

  async checkout(
    user: AuthUserContext,
    id: string,
    dto: CheckoutGroupOrderDto,
  ) {
    const session = await this.getSessionForHostOrThrow(user, id);
    this.assertSessionCheckoutReady(session.status, session.expiresAt);
    if (!session.items.length) {
      throw new BadRequestException('Group order is empty');
    }

    const payload = this.toOrderCreatePayload(session, dto);
    const order = await this.ordersService.create(user, payload);

    await this.groupOrdersRepository.updateSession(id, {
      status: GroupOrderStatus.CHECKED_OUT,
      checkedOutAt: new Date(),
      finalOrder: { connect: { id: order.data.id } },
    });

    return {
      data: {
        order: order.data,
        session: await this.buildSessionResponseOrThrow(id),
      },
      message: 'Group order checked out successfully',
    };
  }

  private async getSessionForMemberOrThrow(user: AuthUserContext, id: string) {
    this.assertCustomerUser(user);
    const session = await this.groupOrdersRepository.findSessionById(id);
    if (!session) {
      throw new NotFoundException('Group order not found');
    }

    const participant = session.participants.find(
      (item) => item.userId === user.uid,
    );
    if (!participant) {
      throw new ForbiddenException(
        'You are not a participant of this group order',
      );
    }

    return session;
  }

  private async getSessionForHostOrThrow(user: AuthUserContext, id: string) {
    const session = await this.getSessionForMemberOrThrow(user, id);
    if (session.hostUserId !== user.uid) {
      throw new ForbiddenException('Only the host can perform this action');
    }
    return session;
  }

  private assertCustomerUser(user: AuthUserContext) {
    if (
      user.role !== UserRoleEnum.CUSTOMER ||
      !user.uid ||
      !user.tid ||
      !user.rid
    ) {
      throw new ForbiddenException(
        'Only authenticated customers can use group orders',
      );
    }
  }

  private async assertDeliveryAddress(
    user: AuthUserContext,
    tenantId: string,
    orderType: OrderType,
    deliveryAddressId?: string | null,
  ) {
    if (orderType === OrderType.DELIVERY && !deliveryAddressId) {
      throw new BadRequestException(
        'deliveryAddressId is required for delivery group orders',
      );
    }

    if (!deliveryAddressId) {
      return;
    }

    const address = await this.groupOrdersRepository.findOwnedAddress(
      deliveryAddressId,
      tenantId,
      user.uid,
    );
    if (!address) {
      throw new BadRequestException(
        'Delivery address not found for current host',
      );
    }
  }

  private assertSessionAvailable(status: GroupOrderStatus, expiresAt: Date) {
    if (expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Group order invite has expired');
    }

    if (
      status === GroupOrderStatus.CANCELLED ||
      status === GroupOrderStatus.CHECKED_OUT ||
      status === GroupOrderStatus.EXPIRED
    ) {
      throw new BadRequestException('Group order is no longer available');
    }
  }

  private assertSessionMutable(status: GroupOrderStatus, expiresAt: Date) {
    this.assertSessionAvailable(status, expiresAt);
  }

  private assertSessionOpenForContribution(
    status: GroupOrderStatus,
    expiresAt: Date,
  ) {
    this.assertSessionAvailable(status, expiresAt);
    if (status !== GroupOrderStatus.OPEN) {
      throw new BadRequestException('Group order is locked for new changes');
    }
  }

  private assertSessionCheckoutReady(
    status: GroupOrderStatus,
    expiresAt: Date,
  ) {
    this.assertSessionAvailable(status, expiresAt);
    if (
      status !== GroupOrderStatus.OPEN &&
      status !== GroupOrderStatus.LOCKED
    ) {
      throw new BadRequestException(
        'Group order cannot be checked out right now',
      );
    }
  }

  private getActiveParticipant(
    session: Awaited<ReturnType<GroupOrdersRepository['findSessionById']>>,
    userId: string,
  ) {
    return session?.participants.find(
      (participant) =>
        participant.userId === userId &&
        participant.status === GroupOrderParticipantStatus.ACTIVE,
    );
  }

  private async assertValidSessionItem(
    restaurantId: string,
    branchId: string,
    dto: {
      menuItemId: string;
      variationId?: string;
      quantity?: number;
      note?: string;
      modifiers?: unknown;
    },
  ) {
    const menuItem = await this.groupOrdersRepository.findMenuItemForSession(
      dto.menuItemId,
      restaurantId,
      branchId,
    );
    if (!menuItem) {
      throw new BadRequestException('Menu item not found for group order');
    }

    const branchOverride = menuItem.branchOverrides[0];
    if (branchOverride && branchOverride.isAvailable === false) {
      throw new BadRequestException(
        'Menu item is not available for selected branch',
      );
    }

    if (dto.variationId) {
      const variation = menuItem.variations.find(
        (item) => item.id === dto.variationId,
      );
      if (!variation) {
        throw new BadRequestException(
          'Variation not found for selected menu item',
        );
      }
    }
  }

  private async buildSessionResponseOrThrow(id: string) {
    const session = await this.groupOrdersRepository.findSessionById(id);
    if (!session) {
      throw new NotFoundException('Group order not found');
    }
    return this.buildSessionResponse(session);
  }

  private async buildSessionResponse(
    session: NonNullable<
      Awaited<ReturnType<GroupOrdersRepository['findSessionById']>>
    >,
  ) {
    const menuItems = await this.groupOrdersRepository.findMenuItemsForResponse(
      [...new Set(session.items.map((item) => item.menuItemId))],
      session.restaurantId,
      session.branchId,
    );
    const menuItemMap = new Map(menuItems.map((item) => [item.id, item]));
    const participantIds = new Set(
      session.participants
        .filter(
          (participant) =>
            participant.status === GroupOrderParticipantStatus.ACTIVE,
        )
        .map((participant) => participant.id),
    );

    return {
      id: session.id,
      tenantId: session.tenantId,
      restaurantId: session.restaurantId,
      branchId: session.branchId,
      hostUserId: session.hostUserId,
      orderType: session.orderType,
      deliveryAddressId: session.deliveryAddressId,
      couponCode: session.couponCode,
      orderTime: session.orderTime,
      hostNote: session.hostNote,
      inviteCode: session.inviteCode,
      status: session.status,
      expiresAt: session.expiresAt,
      lockedAt: session.lockedAt,
      checkedOutAt: session.checkedOutAt,
      finalOrderId: session.finalOrderId,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      host: this.toUserSummary(session.hostUser),
      restaurant: session.restaurant,
      branch: session.branch,
      deliveryAddress: session.deliveryAddress,
      finalOrder: session.finalOrder
        ? {
            ...session.finalOrder,
            totalAmount: Number(session.finalOrder.totalAmount),
          }
        : null,
      participants: session.participants.map((participant) => ({
        id: participant.id,
        userId: participant.userId,
        isHost: participant.isHost,
        status: participant.status,
        joinedAt: participant.joinedAt,
        leftAt: participant.leftAt,
        user: this.toUserSummary(participant.user),
        items: session.items
          .filter((item) => item.participantId === participant.id)
          .map((item) => ({
            id: item.id,
            menuItemId: item.menuItemId,
            variationId: item.variationId,
            quantity: item.quantity,
            note: item.note,
            modifiers: item.modifiers,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            menuItem: menuItemMap.get(item.menuItemId) ?? null,
          })),
      })),
      participantCount: participantIds.size,
      itemCount: session.items.length,
    };
  }

  private toUserSummary(user: {
    id: string;
    email: string;
    isGuest: boolean;
    profile: {
      firstName: string;
      lastName: string;
      phone: string | null;
      avatarUrl: string | null;
    } | null;
  }) {
    return {
      id: user.id,
      email: user.email,
      isGuest: user.isGuest,
      firstName: user.profile?.firstName ?? null,
      lastName: user.profile?.lastName ?? null,
      phone: user.profile?.phone ?? null,
      avatarUrl: user.profile?.avatarUrl ?? null,
    };
  }

  private toOrderQuotePayload(
    session: NonNullable<
      Awaited<ReturnType<GroupOrdersRepository['findSessionById']>>
    >,
  ) {
    if (!session.items.length) {
      throw new BadRequestException('Group order is empty');
    }

    return {
      branchId: session.branchId,
      orderType: this.toOrderTypeEnum(session.orderType),
      deliveryAddressId: session.deliveryAddressId ?? undefined,
      couponCode: session.couponCode ?? undefined,
      orderTime: (session.orderTime ?? new Date()).toISOString(),
      items: session.items.map((item) => ({
        menuItemId: item.menuItemId,
        variationId: item.variationId ?? undefined,
        quantity: item.quantity,
        note: item.note ?? undefined,
        modifiers:
          (item.modifiers as Array<{
            modifierId: string;
            quantity?: number;
          }> | null) ?? undefined,
      })),
    };
  }

  private toOrderCreatePayload(
    session: NonNullable<
      Awaited<ReturnType<GroupOrdersRepository['findSessionById']>>
    >,
    dto: CheckoutGroupOrderDto,
  ) {
    return {
      ...this.toOrderQuotePayload({
        ...session,
        couponCode: dto.couponCode ?? session.couponCode,
        orderTime: dto.orderTime ? new Date(dto.orderTime) : session.orderTime,
      }),
      paymentMethod: dto.paymentMethod,
      customerNote:
        this.resolveOptionalString(dto.customerNote) ??
        session.hostNote ??
        undefined,
    };
  }

  private resolveOptionalString(value: string | null | undefined) {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private toOrderType(value: OrderTypeEnum | OrderType) {
    return value as OrderType;
  }

  private toOrderTypeEnum(value: OrderType) {
    return value as OrderTypeEnum;
  }

  private generateInviteCode() {
    return Math.random().toString(36).slice(2, 10).toUpperCase();
  }
}
