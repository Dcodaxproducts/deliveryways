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
import {
  buildPaginationMeta,
  isRestaurantMenuAvailableAt,
} from '../../common/utils';
import { NotificationsService } from '../notifications/notifications.service';
import { OrdersService } from '../orders/orders.service';
import { StorageService } from '../storage/storage.service';
import {
  AddGroupOrderItemDto,
  CheckoutGroupOrderDto,
  GroupOrderItemModifierDto,
  GroupOrderItemSectionDto,
  CreateGroupOrderSessionDto,
  JoinGroupOrderDto,
  ListGroupOrdersDto,
  UpdateGroupOrderItemDto,
  UpdateGroupOrderParticipantStatusDto,
  UpdateGroupOrderSessionDto,
  UpdateGroupOrderStatusDto,
} from './dto';
import { GroupOrdersRepository } from './group-orders.repository';

@Injectable()
export class GroupOrdersService {
  constructor(
    private readonly groupOrdersRepository: GroupOrdersRepository,
    private readonly ordersService: OrdersService,
    private readonly storageService?: StorageService,
    private readonly notificationsService?: NotificationsService,
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
    this.assertSupportedOrderType(branch.settings, dto.orderType);
    await this.assertDeliveryAddress(
      user,
      branch.tenantId,
      orderType,
      dto.deliveryAddressId,
    );
    const restaurantMenuId = this.resolveOptionalString(dto.restaurantMenuId);
    const restaurantMenu = restaurantMenuId
      ? await this.requireRestaurantMenu(
          restaurantMenuId,
          branch.restaurantId,
          dto.orderTime ? new Date(dto.orderTime) : undefined,
        )
      : null;
    const inviteCode = this.generateInviteCode();
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

    const session = await this.groupOrdersRepository.createSession({
      tenant: { connect: { id: branch.tenantId } },
      restaurant: { connect: { id: branch.restaurantId } },
      branch: { connect: { id: branch.id } },
      hostUser: { connect: { id: user.uid } },
      restaurantMenu: restaurantMenu
        ? { connect: { id: restaurantMenu.id } }
        : undefined,
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
      data: await this.resolveMediaResponse(
        await this.buildSessionResponseOrThrow(user, session.id),
      ),
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
      data: await this.resolveMediaResponse(
        await this.buildSessionResponseOrThrow(user, session.id),
      ),
      message: 'Joined group order successfully',
    };
  }

  async list(user: AuthUserContext, query: ListGroupOrdersDto) {
    const { items, total } = this.isCustomerUser(user)
      ? await this.groupOrdersRepository.listForUser(user.uid, query)
      : await this.groupOrdersRepository.listForAdmin(
          await this.resolveAdminListScope(user, query.restaurantId),
          query,
        );

    return {
      data: await this.resolveMediaResponse(
        await Promise.all(
          items.map(async (item) => {
            const session = await this.pruneInvalidActiveItems(user, item);
            return this.buildSessionResponse(user, session);
          }),
        ),
      ),
      message: 'Group orders fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async details(user: AuthUserContext, id: string) {
    const session = await this.pruneInvalidActiveItems(
      user,
      await this.getSessionForReadOrThrow(user, id),
    );

    return {
      data: await this.resolveMediaResponse(
        await this.buildSessionResponse(user, session),
      ),
      message: 'Group order fetched successfully',
    };
  }

  private async resolveMediaResponse<T>(data: T) {
    return (await this.storageService?.resolveMediaUrlsDeep(data)) ?? data;
  }

  async updateSettings(
    user: AuthUserContext,
    id: string,
    dto: UpdateGroupOrderSessionDto,
  ) {
    const session = await this.getSessionForHostOrThrow(user, id);
    this.assertSessionMutable(session.status, session.expiresAt);
    const effectiveDeliveryAddressId =
      dto.deliveryAddressId !== undefined
        ? dto.deliveryAddressId
        : session.deliveryAddressId;

    await this.assertDeliveryAddress(
      user,
      session.tenantId,
      session.orderType,
      effectiveDeliveryAddressId,
    );

    const couponCode =
      dto.couponCode !== undefined
        ? this.resolveOptionalString(dto.couponCode)
        : undefined;
    const requestedRestaurantMenuId =
      dto.restaurantMenuId !== undefined
        ? this.resolveOptionalString(dto.restaurantMenuId)
        : undefined;

    if (
      requestedRestaurantMenuId !== undefined &&
      requestedRestaurantMenuId !== session.restaurantMenuId &&
      session.items.length
    ) {
      throw new BadRequestException(
        'Clear group order items before changing selected menu',
      );
    }

    const restaurantMenu = requestedRestaurantMenuId
      ? await this.requireRestaurantMenu(
          requestedRestaurantMenuId,
          session.restaurantId,
          dto.orderTime
            ? new Date(dto.orderTime)
            : (session.orderTime ?? undefined),
        )
      : requestedRestaurantMenuId === null
        ? null
        : undefined;

    if (couponCode) {
      await this.validateSessionCouponCode(user, session, couponCode);
    }

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
      restaurantMenu:
        requestedRestaurantMenuId !== undefined
          ? restaurantMenu
            ? { connect: { id: restaurantMenu.id } }
            : { disconnect: true }
          : undefined,
      couponCode,
    });

    return {
      data: await this.buildSessionResponseOrThrow(user, id),
      message: 'Group order updated successfully',
    };
  }

  async addItem(user: AuthUserContext, id: string, dto: AddGroupOrderItemDto) {
    const session = await this.pruneInvalidActiveItems(
      user,
      await this.getSessionForMemberOrThrow(user, id),
    );
    this.assertSessionOpenForContribution(session.status, session.expiresAt);
    const participant = this.getActiveParticipant(session, user.uid);
    if (!participant) {
      throw new ForbiddenException('Only active participants can add items');
    }

    const itemSelection = await this.assertValidOrderItemSelection(
      user,
      session,
      await this.resolveValidSessionItemSelection(
        session.restaurantId,
        session.branchId,
        dto,
      ),
    );

    await this.groupOrdersRepository.createItem({
      session: { connect: { id } },
      participant: { connect: { id: participant.id } },
      menuItemId: itemSelection.menuItemId,
      variationId: itemSelection.variationId,
      quantity: itemSelection.quantity,
      note: this.resolveOptionalString(itemSelection.note),
      modifiers: this.packGroupOrderSelections(
        itemSelection.modifiers,
        itemSelection.sections,
      ) as unknown as Prisma.InputJsonValue,
    });

    return {
      data: await this.buildSessionResponseOrThrow(user, id),
      message: 'Group order item added successfully',
    };
  }

  async updateItem(
    user: AuthUserContext,
    id: string,
    itemId: string,
    dto: UpdateGroupOrderItemDto,
  ) {
    const session = await this.pruneInvalidActiveItems(
      user,
      await this.getSessionForMemberOrThrow(user, id),
    );
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

    let nextItemSelection:
      | Awaited<
          ReturnType<GroupOrdersService['resolveValidSessionItemSelection']>
        >
      | undefined;

    if (
      dto.quantity !== undefined ||
      dto.variationId !== undefined ||
      dto.modifiers !== undefined ||
      dto.sections !== undefined
    ) {
      const nextItem = {
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
            ? this.readStoredModifiers(item.modifiers)
            : (dto.modifiers ?? undefined),
        sections:
          dto.sections === undefined
            ? this.readStoredSections(item.modifiers)
            : (dto.sections ?? undefined),
      };

      nextItemSelection = await this.assertValidOrderItemSelection(
        user,
        session,
        await this.resolveValidSessionItemSelection(
          session.restaurantId,
          session.branchId,
          nextItem,
        ),
      );
    }

    await this.groupOrdersRepository.updateItem(itemId, {
      variationId:
        dto.variationId === undefined
          ? undefined
          : (nextItemSelection?.variationId ?? null),
      quantity: dto.quantity,
      note:
        dto.note === undefined
          ? undefined
          : this.resolveOptionalString(dto.note),
      modifiers:
        dto.modifiers !== undefined || dto.sections !== undefined
          ? (this.packGroupOrderSelections(
              nextItemSelection?.modifiers,
              nextItemSelection?.sections,
            ) as Prisma.InputJsonValue | undefined)
          : undefined,
    });

    return {
      data: await this.buildSessionResponseOrThrow(user, id),
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
      data: await this.buildSessionResponseOrThrow(user, id),
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

    await this.groupOrdersRepository.markParticipantLeftAndDeleteItems(
      participant.id,
      new Date(),
    );

    return {
      data: await this.buildSessionResponseOrThrow(user, id),
      message: 'Left group order successfully',
    };
  }

  async updateMyParticipantStatus(
    user: AuthUserContext,
    id: string,
    dto: UpdateGroupOrderParticipantStatusDto,
  ) {
    const session = await this.getSessionForMemberOrThrow(user, id);
    this.assertSessionOpenForContribution(session.status, session.expiresAt);

    if (
      dto.status !== GroupOrderParticipantStatus.ACTIVE &&
      dto.status !== GroupOrderParticipantStatus.COMPLETED
    ) {
      throw new BadRequestException('Unsupported participant status');
    }

    const participant = this.getContributingParticipant(session, user.uid);
    if (!participant) {
      throw new ForbiddenException(
        'Only active participants can update status',
      );
    }

    if (participant.isHost) {
      throw new BadRequestException('Host does not need to mark completion');
    }

    if (participant.status === dto.status) {
      return {
        data: await this.buildSessionResponse(user, session),
        message: 'Group order participant status updated successfully',
      };
    }

    await this.groupOrdersRepository.updateParticipant(participant.id, {
      status: dto.status,
    });

    const updatedSession = await this.buildSessionResponseOrThrow(user, id);

    if (dto.status === GroupOrderParticipantStatus.COMPLETED) {
      await this.notifyHostParticipantCompleted(session, participant);
    }

    return {
      data: updatedSession,
      message: 'Group order participant status updated successfully',
    };
  }

  async updateStatus(
    user: AuthUserContext,
    id: string,
    dto: UpdateGroupOrderStatusDto,
  ) {
    const session = await this.getSessionForHostOrThrow(user, id);

    if (dto.status === GroupOrderStatus.CANCELLED) {
      this.assertSessionHostCancellable(session.status);
    } else {
      this.assertSessionMutable(session.status, session.expiresAt);
    }

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
      data: await this.buildSessionResponseOrThrow(user, id),
      message: 'Group order status updated successfully',
    };
  }

  cancel(user: AuthUserContext, id: string) {
    return this.updateStatus(user, id, { status: GroupOrderStatus.CANCELLED });
  }

  async quote(user: AuthUserContext, id: string) {
    const session = await this.pruneInvalidActiveItems(
      user,
      await this.getSessionForMemberOrThrow(user, id),
    );
    const quotePayload = this.toOrderQuotePayload(session);
    const quote = await this.ordersService.quoteForCouponValidation(
      user,
      quotePayload,
    );

    return {
      data: {
        session: await this.buildSessionResponse(user, session),
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
    const session = await this.pruneInvalidActiveItems(
      user,
      await this.getSessionForHostOrThrow(user, id),
    );
    this.assertSessionCheckoutReady(session.status, session.expiresAt);
    if (!this.getActiveItems(session).length) {
      throw new BadRequestException('Group order is empty');
    }

    const couponCode = this.resolveOptionalString(dto.couponCode);
    if (couponCode) {
      await this.validateSessionCouponCode(user, session, couponCode);
    }

    const payload = this.toOrderCreatePayload(session, {
      ...dto,
      couponCode,
    });
    const order = await this.ordersService.create(user, payload);

    await this.groupOrdersRepository.updateSession(id, {
      status: GroupOrderStatus.CHECKED_OUT,
      checkedOutAt: new Date(),
      finalOrder: { connect: { id: order.data.id } },
    });

    return {
      data: {
        order: order.data,
        session: await this.buildSessionResponseOrThrow(user, id),
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

  private async getSessionForReadOrThrow(user: AuthUserContext, id: string) {
    if (this.isCustomerUser(user)) {
      return this.getSessionForMemberOrThrow(user, id);
    }

    const session = await this.groupOrdersRepository.findSessionById(id);
    if (!session) {
      throw new NotFoundException('Group order not found');
    }

    await this.assertAdminSessionReadAccess(user, session.restaurantId);

    return session;
  }

  private async getSessionForHostOrThrow(user: AuthUserContext, id: string) {
    const session = await this.getSessionForMemberOrThrow(user, id);
    if (session.hostUserId !== user.uid) {
      throw new ForbiddenException('Only the host can perform this action');
    }
    return session;
  }

  private assertSupportedOrderType(
    branchSettings: unknown,
    orderType: OrderType,
  ) {
    const allowedOrderTypes = this.readAllowedOrderTypes(branchSettings);

    if (!allowedOrderTypes.includes(orderType)) {
      throw new BadRequestException(
        'Order type is not supported by this branch',
      );
    }
  }

  private readAllowedOrderTypes(settings: unknown): OrderType[] {
    const fallback: OrderType[] = [OrderType.DELIVERY, OrderType.TAKEAWAY];

    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return fallback;
    }

    const rawAllowedOrderTypes = (settings as Record<string, unknown>)
      .allowedOrderTypes;

    if (!Array.isArray(rawAllowedOrderTypes)) {
      return fallback;
    }

    const allowedOrderTypes = rawAllowedOrderTypes.filter(
      (value): value is OrderType =>
        value === OrderType.DELIVERY ||
        value === OrderType.TAKEAWAY ||
        value === OrderType.DINE_IN,
    );

    return allowedOrderTypes.length ? allowedOrderTypes : fallback;
  }

  private isCustomerUser(user: AuthUserContext) {
    return (
      user.role === UserRoleEnum.CUSTOMER &&
      Boolean(user.uid) &&
      Boolean(user.tid) &&
      Boolean(user.rid)
    );
  }

  private assertCustomerUser(user: AuthUserContext) {
    if (!this.isCustomerUser(user)) {
      throw new ForbiddenException(
        'Only authenticated customers can use group orders',
      );
    }
  }

  private async resolveAdminListScope(
    user: AuthUserContext,
    requestedRestaurantId?: string,
  ) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return { restaurantId: requestedRestaurantId };
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      if (!user.tid) {
        throw new ForbiddenException('Tenant context is required');
      }

      if (requestedRestaurantId) {
        await this.assertRestaurantInTenant(user.tid, requestedRestaurantId);
      }

      return {
        tenantId: user.tid,
        restaurantId: requestedRestaurantId,
      };
    }

    throw new ForbiddenException(
      'Only admins can list group orders by restaurant',
    );
  }

  private async assertAdminSessionReadAccess(
    user: AuthUserContext,
    restaurantId: string,
  ) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return;
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      if (!user.tid) {
        throw new ForbiddenException('Tenant context is required');
      }

      await this.assertRestaurantInTenant(user.tid, restaurantId);
      return;
    }

    throw new ForbiddenException(
      'Only admins can access group orders outside participation',
    );
  }

  private async assertRestaurantInTenant(
    tenantId: string,
    restaurantId: string,
  ) {
    const restaurant = await this.groupOrdersRepository.findRestaurantInTenant(
      restaurantId,
      tenantId,
    );

    if (!restaurant) {
      throw new ForbiddenException(
        'You cannot access resources outside your tenant restaurants',
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

  private assertSessionHostCancellable(status: GroupOrderStatus) {
    if (status === GroupOrderStatus.CANCELLED) {
      throw new BadRequestException('Group order is already cancelled');
    }

    if (status === GroupOrderStatus.CHECKED_OUT) {
      throw new BadRequestException(
        'Checked out group order cannot be cancelled',
      );
    }
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

  private async notifyHostParticipantCompleted(
    session: NonNullable<
      Awaited<ReturnType<GroupOrdersRepository['findSessionById']>>
    >,
    participant: NonNullable<
      Awaited<ReturnType<GroupOrdersRepository['findSessionById']>>
    >['participants'][number],
  ) {
    if (!this.notificationsService) return;

    const activeNonHostParticipants = session.participants.filter(
      (item) =>
        !item.isHost && this.isContributingParticipantStatus(item.status),
    );
    const allParticipantsCompleted = activeNonHostParticipants.every((item) =>
      item.id === participant.id
        ? true
        : item.status === GroupOrderParticipantStatus.COMPLETED,
    );

    await this.notificationsService.notifyGroupOrderParticipantCompleted({
      tenantId: session.tenantId,
      restaurantId: session.restaurantId,
      branchId: session.branchId,
      sessionId: session.id,
      hostUserId: session.hostUserId,
      participantUserId: participant.userId,
      participantName: this.formatParticipantName(participant.user),
      allParticipantsCompleted:
        activeNonHostParticipants.length > 0 && allParticipantsCompleted,
    });
  }

  private formatParticipantName(
    user: NonNullable<
      Awaited<ReturnType<GroupOrdersRepository['findSessionById']>>
    >['participants'][number]['user'],
  ) {
    const fullName = [user.profile?.firstName, user.profile?.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    return fullName || user.email || 'A participant';
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

  private getContributingParticipant(
    session: Awaited<ReturnType<GroupOrdersRepository['findSessionById']>>,
    userId: string,
  ) {
    return session?.participants.find(
      (participant) =>
        participant.userId === userId &&
        this.isContributingParticipantStatus(participant.status),
    );
  }

  private isContributingParticipantStatus(status: GroupOrderParticipantStatus) {
    return (
      status === GroupOrderParticipantStatus.ACTIVE ||
      status === GroupOrderParticipantStatus.COMPLETED
    );
  }

  private async assertValidOrderItemSelection<
    T extends {
      menuItemId: string;
      variationId?: string;
      quantity?: number;
      note?: string | null;
      modifiers?: unknown;
      sections?: unknown;
    },
  >(
    user: AuthUserContext,
    session: NonNullable<
      Awaited<ReturnType<GroupOrdersRepository['findSessionById']>>
    >,
    dto: T,
  ): Promise<T> {
    try {
      await this.ordersService.quoteForCouponValidation(user, {
        branchId: session.branchId,
        restaurantMenuId: session.restaurantMenuId ?? undefined,
        orderType: this.toOrderTypeEnum(session.orderType),
        deliveryAddressId: session.deliveryAddressId ?? undefined,
        orderTime: (session.orderTime ?? new Date()).toISOString(),
        items: [
          {
            menuItemId: dto.menuItemId,
            variationId: dto.variationId ?? undefined,
            quantity: dto.quantity ?? 1,
            note: dto.note ?? undefined,
            modifiers:
              (dto.modifiers as Array<{
                modifierId: string;
                quantity?: number;
              }> | null) ?? undefined,
            sections:
              (dto.sections as Array<{
                slot: 'LEFT' | 'RIGHT';
                menuItemId: string;
              }> | null) ?? undefined,
          },
        ],
      });
      return dto;
    } catch (error) {
      if (
        dto.variationId &&
        error instanceof BadRequestException &&
        error.message.startsWith('Variation not found')
      ) {
        return this.assertValidOrderItemSelection(user, session, {
          ...dto,
          variationId: undefined,
        });
      }

      throw error;
    }
  }

  private async pruneInvalidActiveItems(
    user: AuthUserContext,
    session: NonNullable<
      Awaited<ReturnType<GroupOrdersRepository['findSessionById']>>
    >,
  ) {
    if (
      session.finalOrderId ||
      (session.status !== GroupOrderStatus.OPEN &&
        session.status !== GroupOrderStatus.LOCKED)
    ) {
      return session;
    }

    const invalidItemIds: string[] = [];

    for (const item of this.getActiveItems(session)) {
      try {
        await this.ordersService.quoteForCouponValidation(user, {
          branchId: session.branchId,
          restaurantMenuId: session.restaurantMenuId ?? undefined,
          orderType: this.toOrderTypeEnum(session.orderType),
          deliveryAddressId: session.deliveryAddressId ?? undefined,
          orderTime: (session.orderTime ?? new Date()).toISOString(),
          items: [
            {
              menuItemId: item.menuItemId,
              variationId: item.variationId ?? undefined,
              quantity: item.quantity,
              note: item.note ?? undefined,
              modifiers: this.readStoredModifiers(item.modifiers),
              sections: this.readStoredSections(item.modifiers),
            },
          ],
        });
      } catch (error) {
        if (this.isStaleSelectionError(error)) {
          invalidItemIds.push(item.id);
          continue;
        }

        if (error instanceof BadRequestException) {
          return session;
        }

        throw error;
      }
    }

    if (!invalidItemIds.length) {
      return session;
    }

    await this.groupOrdersRepository.deleteItems(invalidItemIds);

    const refreshedSession = await this.groupOrdersRepository.findSessionById(
      session.id,
    );

    return refreshedSession ?? session;
  }

  private isStaleSelectionError(error: unknown) {
    if (!(error instanceof BadRequestException)) {
      return false;
    }

    const message = error.message;

    return (
      message.startsWith('Variation not found') ||
      message.startsWith('Modifier not found') ||
      message.startsWith('Menu item not found') ||
      message.startsWith('Menu item unavailable') ||
      message.startsWith('Split section flavor not found') ||
      message.startsWith('Split section flavor unavailable')
    );
  }

  private async resolveValidSessionItemSelection(
    restaurantId: string,
    branchId: string,
    dto: {
      menuItemId: string;
      variationId?: string;
      quantity?: number;
      note?: string | null;
      modifiers?: GroupOrderItemModifierDto[] | null;
      sections?: GroupOrderItemSectionDto[] | null;
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

    const variationId =
      dto.variationId &&
      menuItem.variations.some((item) => item.id === dto.variationId)
        ? dto.variationId
        : undefined;

    return {
      menuItemId: dto.menuItemId,
      variationId,
      quantity: dto.quantity ?? 1,
      note: dto.note ?? undefined,
      modifiers: dto.modifiers ?? undefined,
      sections: dto.sections ?? undefined,
    };
  }

  private getActiveParticipantIds(
    session: NonNullable<
      Awaited<ReturnType<GroupOrdersRepository['findSessionById']>>
    >,
  ) {
    return new Set(
      session.participants
        .filter((participant) =>
          this.isContributingParticipantStatus(participant.status),
        )
        .map((participant) => participant.id),
    );
  }

  private getActiveItems(
    session: NonNullable<
      Awaited<ReturnType<GroupOrdersRepository['findSessionById']>>
    >,
    activeParticipantIds = this.getActiveParticipantIds(session),
  ) {
    return session.items.filter((item) =>
      activeParticipantIds.has(item.participantId),
    );
  }

  private async buildSessionResponseOrThrow(user: AuthUserContext, id: string) {
    const session = await this.groupOrdersRepository.findSessionById(id);
    if (!session) {
      throw new NotFoundException('Group order not found');
    }
    return this.buildSessionResponse(user, session);
  }

  private async buildSessionResponse(
    user: AuthUserContext,
    session: NonNullable<
      Awaited<ReturnType<GroupOrdersRepository['findSessionById']>>
    >,
  ) {
    const participantIds = this.getActiveParticipantIds(session);
    const activeItems = this.getActiveItems(session, participantIds);
    const menuItems = await this.groupOrdersRepository.findMenuItemsForResponse(
      [...new Set(activeItems.map((item) => item.menuItemId))],
      session.restaurantId,
      session.branchId,
    );
    const menuItemMap = new Map(menuItems.map((item) => [item.id, item]));
    const liveQuote = await this.buildLiveSessionQuote(user, {
      ...session,
      items: activeItems,
    });
    const itemPricingById = new Map(
      activeItems.map((item, index) => [
        item.id,
        this.toGroupOrderItemPricing(liveQuote?.items?.[index]),
      ]),
    );
    const summary = this.buildSessionSummary(session, activeItems, liveQuote);

    return {
      id: session.id,
      tenantId: session.tenantId,
      restaurantId: session.restaurantId,
      branchId: session.branchId,
      hostUserId: session.hostUserId,
      restaurantMenuId: session.restaurantMenuId,
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
      deliveryAddress: session.deliveryAddress
        ? this.toCustomerAddressResponse(session.deliveryAddress)
        : null,
      finalOrder: session.finalOrder
        ? {
            ...session.finalOrder,
            subtotal: Number(session.finalOrder.subtotal),
            taxAmount: Number(session.finalOrder.taxAmount),
            deliveryFee: Number(session.finalOrder.deliveryFee),
            discountAmount: Number(session.finalOrder.discountAmount),
            totalAmount: Number(session.finalOrder.totalAmount),
          }
        : null,
      summary,
      participants: session.participants.map((participant) => ({
        id: participant.id,
        userId: participant.userId,
        isHost: participant.isHost,
        status: participant.status,
        joinedAt: participant.joinedAt,
        leftAt: participant.leftAt,
        user: this.toUserSummary(participant.user),
        items: activeItems
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
            pricing: itemPricingById.get(item.id) ?? null,
            menuItem: menuItemMap.get(item.menuItemId) ?? null,
          })),
      })),
      participantCount: participantIds.size,
      itemCount: activeItems.length,
    };
  }

  private async buildLiveSessionQuote(
    user: AuthUserContext,
    session: NonNullable<
      Awaited<ReturnType<GroupOrdersRepository['findSessionById']>>
    >,
  ) {
    if (session.finalOrder || !session.items.length) {
      return null;
    }

    try {
      const quote = await this.ordersService.quoteForCouponValidation(
        user,
        this.toOrderQuotePayload(session),
      );

      return quote.data;
    } catch (error) {
      if (error instanceof BadRequestException) {
        return null;
      }

      throw error;
    }
  }

  private buildSessionSummary(
    session: NonNullable<
      Awaited<ReturnType<GroupOrdersRepository['findSessionById']>>
    >,
    activeItems: NonNullable<
      Awaited<ReturnType<GroupOrdersRepository['findSessionById']>>
    >['items'],
    liveQuote: Awaited<ReturnType<GroupOrdersService['buildLiveSessionQuote']>>,
  ) {
    if (session.finalOrder) {
      return {
        source: 'final_order' as const,
        branchId: session.branchId,
        restaurantId: session.restaurantId,
        customerId: session.hostUserId,
        orderType: this.toOrderTypeEnum(session.finalOrder.orderType),
        orderTime:
          (session.finalOrder.orderTime ?? session.orderTime)?.toISOString() ??
          null,
        isScheduled: Boolean(
          session.finalOrder.orderTime
            ? session.finalOrder.orderTime.getTime() > Date.now()
            : false,
        ),
        subtotal: Number(session.finalOrder.subtotal),
        taxAmount: Number(session.finalOrder.taxAmount),
        deliveryFee: Number(session.finalOrder.deliveryFee),
        discountAmount: Number(session.finalOrder.discountAmount),
        totalAmount: Number(session.finalOrder.totalAmount),
        couponCode: session.couponCode,
        itemCount: activeItems.length,
      };
    }

    if (!activeItems.length || !liveQuote) {
      return {
        source: 'session' as const,
        branchId: session.branchId,
        restaurantId: session.restaurantId,
        customerId: session.hostUserId,
        orderType: this.toOrderTypeEnum(session.orderType),
        orderTime: (session.orderTime ?? new Date()).toISOString(),
        isScheduled: Boolean(
          session.orderTime ? session.orderTime.getTime() > Date.now() : false,
        ),
        subtotal: 0,
        taxAmount: 0,
        deliveryFee: 0,
        discountAmount: 0,
        totalAmount: 0,
        couponCode: session.couponCode,
        itemCount: activeItems.length,
      };
    }

    const quoteSummary = { ...liveQuote };
    delete (quoteSummary as { items?: unknown }).items;

    return {
      source: 'quote' as const,
      ...quoteSummary,
      couponCode: liveQuote.couponCode ?? session.couponCode,
      itemCount: activeItems.length,
    };
  }

  private toGroupOrderItemPricing(
    quoteItem:
      | {
          unitPrice?: number;
          lineTotal?: number;
          depositAmount?: number;
          snapshotModifiers?: unknown;
          snapshotSections?: unknown;
        }
      | undefined,
  ) {
    if (!quoteItem) {
      return null;
    }

    return {
      unitPrice: quoteItem.unitPrice ?? 0,
      lineTotal: quoteItem.lineTotal ?? 0,
      depositAmount: quoteItem.depositAmount ?? 0,
      modifiers: Array.isArray(quoteItem.snapshotModifiers)
        ? quoteItem.snapshotModifiers
        : [],
      sections: Array.isArray(quoteItem.snapshotSections)
        ? quoteItem.snapshotSections
        : [],
    };
  }

  private readStoredModifiers(
    input: Prisma.JsonValue | null,
  ): GroupOrderItemModifierDto[] | undefined {
    if (Array.isArray(input)) {
      return input as unknown as GroupOrderItemModifierDto[];
    }

    if (!input || typeof input !== 'object') {
      return undefined;
    }

    const modifiers = (input as { modifiers?: unknown }).modifiers;

    return Array.isArray(modifiers)
      ? (modifiers as GroupOrderItemModifierDto[])
      : undefined;
  }

  private readStoredSections(
    input: Prisma.JsonValue | null,
  ): GroupOrderItemSectionDto[] | undefined {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return undefined;
    }

    const sections = (input as { sections?: unknown }).sections;

    return Array.isArray(sections)
      ? (sections as GroupOrderItemSectionDto[])
      : undefined;
  }

  private packGroupOrderSelections(
    modifiers?: GroupOrderItemModifierDto[],
    sections?: GroupOrderItemSectionDto[],
  ) {
    if (!sections?.length) {
      return modifiers?.length ? modifiers : undefined;
    }

    return {
      modifiers: modifiers?.length ? modifiers : [],
      sections: sections.map((section) => ({
        slot: section.slot,
        menuItemId: section.menuItemId,
      })),
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

  private async validateSessionCouponCode(
    user: AuthUserContext,
    session: NonNullable<
      Awaited<ReturnType<GroupOrdersRepository['findSessionById']>>
    >,
    couponCode: string,
  ) {
    if (!this.getActiveItems(session).length) {
      throw new BadRequestException('Add items before applying a coupon');
    }

    await this.ordersService.quoteForCouponValidation(user, {
      ...this.toOrderQuotePayload({
        ...session,
        couponCode,
      }),
      couponCode,
    });
  }

  private toOrderQuotePayload(
    session: NonNullable<
      Awaited<ReturnType<GroupOrdersRepository['findSessionById']>>
    >,
  ) {
    const activeItems = this.getActiveItems(session);
    if (!activeItems.length) {
      throw new BadRequestException('Group order is empty');
    }

    return {
      branchId: session.branchId,
      restaurantMenuId: session.restaurantMenuId ?? undefined,
      orderType: this.toOrderTypeEnum(session.orderType),
      deliveryAddressId: session.deliveryAddressId ?? undefined,
      couponCode: session.couponCode ?? undefined,
      orderTime: (session.orderTime ?? new Date()).toISOString(),
      items: activeItems.map((item) => ({
        menuItemId: item.menuItemId,
        variationId: item.variationId ?? undefined,
        quantity: item.quantity,
        note: item.note ?? undefined,
        modifiers: this.readStoredModifiers(item.modifiers),
        sections: this.readStoredSections(item.modifiers),
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

  private toCustomerAddressResponse<
    T extends {
      area?: string | null;
      lat?: Prisma.Decimal | number | null;
      lng?: Prisma.Decimal | number | null;
    },
  >(address: T) {
    return {
      ...address,
      houseNumber: address.area ?? null,
      lat:
        address.lat !== null && address.lat !== undefined
          ? Number(address.lat)
          : null,
      lng:
        address.lng !== null && address.lng !== undefined
          ? Number(address.lng)
          : null,
    };
  }

  private async requireRestaurantMenu(
    restaurantMenuId: string,
    restaurantId: string,
    orderTime?: Date,
  ) {
    const restaurantMenu =
      await this.groupOrdersRepository.findRestaurantMenuById(
        restaurantMenuId,
        restaurantId,
      );

    if (!restaurantMenu) {
      throw new BadRequestException('Selected menu not found or inactive');
    }

    if (
      restaurantMenu.isTimed &&
      !isRestaurantMenuAvailableAt(
        restaurantMenu.timingConfig,
        orderTime ?? new Date(),
      )
    ) {
      throw new BadRequestException(
        'Selected menu is not available at requested order time',
      );
    }

    return restaurantMenu;
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
