import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChatMessageSenderType,
  ChatThreadSource,
  ChatThreadStatus,
  Prisma,
  StaffPanelType,
  UserRole,
} from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { buildPaginationMeta } from '../../common/utils';
import { PrismaService } from '../../database';
import {
  AssignChatThreadDto,
  CreateChatMessageDto,
  CreateChatThreadDto,
  ListChatThreadsDto,
  UpdateChatThreadStatusDto,
} from './dto';
import { ChatRepository } from './chat.repository';

type StaffPermissionOperation = 'read' | 'reply' | 'assign' | 'resolve';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chatRepository: ChatRepository,
  ) {}

  async createThread(user: AuthUserContext, dto: CreateChatThreadDto) {
    if (user.role !== UserRoleEnum.CUSTOMER) {
      throw new ForbiddenException(
        'Only customers can start support conversations',
      );
    }

    if (!user.rid) {
      throw new ForbiddenException('Restaurant context is required');
    }

    const messageBody = this.normalizeMessage(dto.message);
    const subject = this.resolveOptionalString(dto.subject);

    const context = dto.orderId
      ? await this.resolveOrderThreadContext(user, dto.orderId)
      : await this.resolveSupportThreadContext(user, dto.branchId);

    if (dto.orderId) {
      const existing = await this.chatRepository.findOpenOrderThread(
        dto.orderId,
        user.uid,
      );

      if (existing) {
        throw new BadRequestException(
          'An open support conversation already exists for this order',
        );
      }
    }

    const now = new Date();
    const data = await this.prisma.$transaction(async (tx) => {
      const thread = await this.chatRepository.createThread(
        {
          tenant: { connect: { id: context.tenantId } },
          restaurant: { connect: { id: context.restaurantId } },
          branch: context.branchId
            ? { connect: { id: context.branchId } }
            : undefined,
          customer: { connect: { id: user.uid } },
          order: dto.orderId ? { connect: { id: dto.orderId } } : undefined,
          source: dto.orderId
            ? ChatThreadSource.ORDER
            : ChatThreadSource.SUPPORT,
          subject,
          status: ChatThreadStatus.OPEN,
          lastMessageAt: now,
          customerUnreadCount: 0,
          staffUnreadCount: 1,
          customerLastReadAt: now,
          lastMessagePreview: this.buildMessagePreview(messageBody),
        },
        tx,
      );

      await this.chatRepository.createMessage(
        {
          thread: { connect: { id: thread.id } },
          senderType: ChatMessageSenderType.CUSTOMER,
          senderUser: { connect: { id: user.uid } },
          body: messageBody,
        },
        tx,
      );

      return thread;
    });

    return {
      data: await this.getThreadPayloadOrThrow(data.id),
      message: 'Support conversation created successfully',
    };
  }

  async list(user: AuthUserContext, query: ListChatThreadsDto) {
    const scope = await this.resolveThreadScope(user, query, 'read');
    const where = this.chatRepository.buildWhere({
      query,
      tenantId: scope.tenantId,
      restaurantId: scope.restaurantId,
      branchId: scope.branchId,
      customerId: scope.customerId,
      allowAssignedStaffUserId: scope.allowAssignedStaffUserId,
      unreadOnlyFor: scope.unreadOnlyFor,
    });
    const { items, total } = await this.chatRepository.list(where, query);

    return {
      data: items.map((item) => this.toThreadListItem(item)),
      message: 'Support conversations fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async details(user: AuthUserContext, id: string) {
    const thread = await this.chatRepository.findThreadById(id);

    if (!thread) {
      throw new NotFoundException('Support conversation not found');
    }

    await this.assertThreadAccess(user, thread, 'read');

    return {
      data: this.toThreadDetails(thread),
      message: 'Support conversation fetched successfully',
    };
  }

  async reply(user: AuthUserContext, id: string, dto: CreateChatMessageDto) {
    const thread = await this.chatRepository.findThreadById(id);

    if (!thread) {
      throw new NotFoundException('Support conversation not found');
    }

    const action: StaffPermissionOperation | 'customer' =
      user.role === UserRoleEnum.CUSTOMER ? 'customer' : 'reply';

    await this.assertThreadAccess(user, thread, action);

    const body = this.normalizeMessage(dto.message);
    const now = new Date();
    const nextStatus =
      user.role === UserRoleEnum.CUSTOMER
        ? ChatThreadStatus.OPEN
        : ChatThreadStatus.IN_PROGRESS;

    await this.prisma.$transaction(async (tx) => {
      await this.chatRepository.createMessage(
        this.buildMessageCreateInput(user, id, body),
        tx,
      );
      await this.chatRepository.updateThread(
        id,
        {
          lastMessageAt: now,
          lastMessagePreview: this.buildMessagePreview(body),
          status: nextStatus,
          resolvedAt: null,
          customerUnreadCount:
            user.role === UserRoleEnum.CUSTOMER ? 0 : { increment: 1 },
          staffUnreadCount:
            user.role === UserRoleEnum.CUSTOMER ? { increment: 1 } : 0,
          customerLastReadAt:
            user.role === UserRoleEnum.CUSTOMER
              ? now
              : thread.customerLastReadAt,
          staffLastReadAt: user.role === UserRoleEnum.CUSTOMER ? null : now,
        },
        tx,
      );
    });

    return {
      data: await this.getThreadPayloadOrThrow(id),
      message: 'Support conversation updated successfully',
    };
  }

  async markRead(user: AuthUserContext, id: string) {
    const thread = await this.chatRepository.findThreadById(id);

    if (!thread) {
      throw new NotFoundException('Support conversation not found');
    }

    await this.assertThreadAccess(user, thread, 'read');

    const now = new Date();
    const data = await this.chatRepository.updateThread(id, {
      customerLastReadAt: user.role === UserRoleEnum.CUSTOMER ? now : undefined,
      staffLastReadAt: user.role === UserRoleEnum.CUSTOMER ? undefined : now,
      customerUnreadCount: user.role === UserRoleEnum.CUSTOMER ? 0 : undefined,
      staffUnreadCount: user.role === UserRoleEnum.CUSTOMER ? undefined : 0,
    });

    return {
      data: {
        id: data.id,
        customerLastReadAt: data.customerLastReadAt,
        staffLastReadAt: data.staffLastReadAt,
      },
      message: 'Support conversation marked as read successfully',
    };
  }

  async assign(user: AuthUserContext, id: string, dto: AssignChatThreadDto) {
    const thread = await this.chatRepository.findThreadById(id);

    if (!thread) {
      throw new NotFoundException('Support conversation not found');
    }

    await this.assertThreadAccess(user, thread, 'assign');

    const assignedStaffUserId = this.resolveOptionalString(
      dto.assignedStaffUserId ?? undefined,
    );

    if (assignedStaffUserId) {
      await this.assertAssignableStaff(user, thread, assignedStaffUserId);
    }

    await this.chatRepository.updateThread(id, {
      assignedStaff: assignedStaffUserId
        ? { connect: { id: assignedStaffUserId } }
        : { disconnect: true },
      status:
        thread.status === ChatThreadStatus.RESOLVED
          ? ChatThreadStatus.IN_PROGRESS
          : undefined,
      resolvedAt:
        thread.status === ChatThreadStatus.RESOLVED ? null : undefined,
    });

    return {
      data: await this.getThreadPayloadOrThrow(id),
      message: assignedStaffUserId
        ? 'Support conversation assigned successfully'
        : 'Support conversation unassigned successfully',
    };
  }

  async updateStatus(
    user: AuthUserContext,
    id: string,
    dto: UpdateChatThreadStatusDto,
  ) {
    const thread = await this.chatRepository.findThreadById(id);

    if (!thread) {
      throw new NotFoundException('Support conversation not found');
    }

    await this.assertThreadAccess(user, thread, 'resolve');

    const resolvedAt =
      dto.status === ChatThreadStatus.RESOLVED ? new Date() : null;

    await this.chatRepository.updateThread(id, {
      status: dto.status,
      resolvedAt,
      staffLastReadAt: new Date(),
      staffUnreadCount: 0,
    });

    return {
      data: await this.getThreadPayloadOrThrow(id),
      message: 'Support conversation status updated successfully',
    };
  }

  async summary(user: AuthUserContext, query: ListChatThreadsDto) {
    const scope = await this.resolveThreadScope(user, query, 'read');
    const baseWhere = this.chatRepository.buildWhere({
      query: { ...query, unreadOnly: undefined },
      tenantId: scope.tenantId,
      restaurantId: scope.restaurantId,
      branchId: scope.branchId,
      customerId: scope.customerId,
      allowAssignedStaffUserId: scope.allowAssignedStaffUserId,
    });

    const [total, open, inProgress, resolved, unread] = await Promise.all([
      this.chatRepository.count(baseWhere),
      this.chatRepository.count({
        ...baseWhere,
        status: ChatThreadStatus.OPEN,
      }),
      this.chatRepository.count({
        ...baseWhere,
        status: ChatThreadStatus.IN_PROGRESS,
      }),
      this.chatRepository.count({
        ...baseWhere,
        status: ChatThreadStatus.RESOLVED,
      }),
      this.chatRepository.count(
        this.chatRepository.buildWhere({
          query: { ...query, unreadOnly: true },
          tenantId: scope.tenantId,
          restaurantId: scope.restaurantId,
          branchId: scope.branchId,
          customerId: scope.customerId,
          allowAssignedStaffUserId: scope.allowAssignedStaffUserId,
          unreadOnlyFor: scope.unreadOnlyFor,
        }),
      ),
    ]);

    return {
      data: {
        total,
        open,
        inProgress,
        resolved,
        unread,
      },
      message: 'Support conversation summary fetched successfully',
    };
  }

  private async getThreadPayloadOrThrow(id: string) {
    const thread = await this.chatRepository.findThreadById(id);

    if (!thread) {
      throw new NotFoundException('Support conversation not found');
    }

    return this.toThreadDetails(thread);
  }

  private async resolveOrderThreadContext(
    user: AuthUserContext,
    orderId: string,
  ): Promise<{ tenantId: string; restaurantId: string; branchId: string }> {
    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        customerId: user.uid,
      },
      select: {
        id: true,
        tenantId: true,
        restaurantId: true,
        branchId: true,
      },
    });

    if (!order) {
      throw new BadRequestException('Order not found for this customer');
    }

    if (order.restaurantId !== user.rid) {
      throw new ForbiddenException(
        'You cannot create support conversations outside your restaurant',
      );
    }

    return {
      tenantId: order.tenantId,
      restaurantId: order.restaurantId,
      branchId: order.branchId,
    };
  }

  private async resolveSupportThreadContext(
    user: AuthUserContext,
    requestedBranchId?: string,
  ): Promise<{ tenantId: string; restaurantId: string; branchId?: string }> {
    if (!user.tid || !user.rid) {
      throw new ForbiddenException('Customer restaurant context is required');
    }

    if (!requestedBranchId) {
      return {
        tenantId: user.tid,
        restaurantId: user.rid,
      };
    }

    const branch = await this.prisma.branch.findFirst({
      where: {
        id: requestedBranchId,
        restaurantId: user.rid,
        tenantId: user.tid,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!branch) {
      throw new BadRequestException('Branch not found for this restaurant');
    }

    return {
      tenantId: user.tid,
      restaurantId: user.rid,
      branchId: branch.id,
    };
  }

  private async resolveThreadScope(
    user: AuthUserContext,
    query: ListChatThreadsDto,
    operation: StaffPermissionOperation,
  ) {
    if (user.role === UserRoleEnum.CUSTOMER) {
      return {
        tenantId: undefined,
        restaurantId: user.rid,
        branchId: query.branchId,
        customerId: user.uid,
        allowAssignedStaffUserId: false,
        unreadOnlyFor: 'customer' as const,
      };
    }

    if (user.role === UserRoleEnum.STAFF) {
      await this.assertStaffPermission(user, operation);
      return this.resolveStaffScope(user, query);
    }

    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return {
        tenantId: undefined,
        restaurantId: query.restaurantId,
        branchId: query.branchId,
        customerId: undefined,
        allowAssignedStaffUserId: true,
        unreadOnlyFor: 'staff' as const,
      };
    }

    if (user.role === UserRoleEnum.BRANCH_ADMIN) {
      if (!user.rid || !user.bid) {
        throw new ForbiddenException('Branch context is required');
      }

      return {
        tenantId: undefined,
        restaurantId: user.rid,
        branchId: user.bid,
        customerId: undefined,
        allowAssignedStaffUserId: true,
        unreadOnlyFor: 'staff' as const,
      };
    }

    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    if (query.restaurantId) {
      await this.assertRestaurantInTenant(user.tid, query.restaurantId);
    }

    return {
      tenantId: user.tid,
      restaurantId: query.restaurantId,
      branchId: query.branchId,
      customerId: undefined,
      allowAssignedStaffUserId: true,
      unreadOnlyFor: 'staff' as const,
    };
  }

  private async resolveStaffScope(
    user: AuthUserContext,
    query: ListChatThreadsDto,
  ) {
    if (user.panelType === StaffPanelType.BRANCH_ADMIN) {
      if (!user.rid || !user.bid) {
        throw new ForbiddenException('Branch context is required');
      }

      return {
        tenantId: undefined,
        restaurantId: user.rid,
        branchId: user.bid,
        customerId: undefined,
        allowAssignedStaffUserId: true,
        unreadOnlyFor: 'staff' as const,
      };
    }

    if (user.panelType === StaffPanelType.BUSINESS_ADMIN) {
      if (!user.tid) {
        throw new ForbiddenException('Tenant context is required');
      }

      if (query.restaurantId) {
        await this.assertRestaurantInTenant(user.tid, query.restaurantId);
      }

      return {
        tenantId: user.tid,
        restaurantId: query.restaurantId,
        branchId: query.branchId,
        customerId: undefined,
        allowAssignedStaffUserId: true,
        unreadOnlyFor: 'staff' as const,
      };
    }

    return {
      tenantId: undefined,
      restaurantId: query.restaurantId,
      branchId: query.branchId,
      customerId: undefined,
      allowAssignedStaffUserId: true,
      unreadOnlyFor: 'staff' as const,
    };
  }

  private async assertThreadAccess(
    user: AuthUserContext,
    thread: {
      id: string;
      tenantId: string;
      restaurantId: string;
      branchId: string | null;
      customerId: string;
    },
    operation: StaffPermissionOperation | 'customer',
  ) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return;
    }

    if (user.role === UserRoleEnum.CUSTOMER) {
      if (thread.customerId !== user.uid) {
        throw new ForbiddenException('Cross-customer access denied');
      }

      return;
    }

    if (user.role === UserRoleEnum.STAFF) {
      await this.assertStaffPermission(
        user,
        operation === 'customer' ? 'reply' : operation,
      );
      this.assertStaffThreadScope(user, thread);
      return;
    }

    if (user.role === UserRoleEnum.BRANCH_ADMIN) {
      if (user.rid && user.rid !== thread.restaurantId) {
        throw new ForbiddenException(
          'You cannot access support conversations outside your restaurant',
        );
      }

      if (user.bid && user.bid !== thread.branchId) {
        throw new ForbiddenException(
          'You cannot access support conversations outside your branch',
        );
      }

      return;
    }

    if (!user.tid || user.tid !== thread.tenantId) {
      throw new ForbiddenException(
        'You cannot access support conversations outside your tenant',
      );
    }
  }

  private async assertAssignableStaff(
    user: AuthUserContext,
    thread: { tenantId: string; restaurantId: string; branchId: string | null },
    assignedStaffUserId: string,
  ) {
    const staff = await this.prisma.staffUser.findFirst({
      where: {
        id: assignedStaffUserId,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        tenantId: true,
        restaurantId: true,
        branchId: true,
      },
    });

    if (!staff) {
      throw new BadRequestException('Staff account not found');
    }

    if (staff.tenantId && staff.tenantId !== thread.tenantId) {
      throw new BadRequestException(
        'Staff account is outside thread tenant scope',
      );
    }

    if (staff.restaurantId && staff.restaurantId !== thread.restaurantId) {
      throw new BadRequestException(
        'Staff account is outside thread restaurant scope',
      );
    }

    if (staff.branchId && staff.branchId !== thread.branchId) {
      throw new BadRequestException(
        'Staff account is outside thread branch scope',
      );
    }

    if (user.role === UserRoleEnum.STAFF) {
      this.assertStaffThreadScope(user, thread);
    }
  }

  private async assertStaffPermission(
    user: AuthUserContext,
    operation: StaffPermissionOperation,
  ) {
    const staff = await this.prisma.staffUser.findFirst({
      where: {
        id: user.uid,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        staffRole: {
          select: {
            id: true,
            isActive: true,
            deletedAt: true,
            permissions: true,
          },
        },
      },
    });

    if (
      !staff ||
      !staff.staffRole ||
      staff.staffRole.deletedAt ||
      !staff.staffRole.isActive
    ) {
      throw new ForbiddenException('Your assigned staff role is inactive');
    }

    const permissions = Array.isArray(staff.staffRole.permissions)
      ? (staff.staffRole.permissions as Array<{
          access?: unknown;
          operations?: unknown;
        }>)
      : [];

    const hasPermission = permissions.some((permission) => {
      if (
        permission.access !== 'chat' ||
        !Array.isArray(permission.operations)
      ) {
        return false;
      }

      return permission.operations.some(
        (item) => typeof item === 'string' && item.trim() === operation,
      );
    });

    if (!hasPermission) {
      throw new ForbiddenException(
        `Your staff role does not allow chat ${operation} access`,
      );
    }
  }

  private assertStaffThreadScope(
    user: AuthUserContext,
    thread: { tenantId: string; restaurantId: string; branchId: string | null },
  ) {
    if (user.panelType === StaffPanelType.BRANCH_ADMIN) {
      if (user.rid !== thread.restaurantId || user.bid !== thread.branchId) {
        throw new ForbiddenException(
          'You cannot access support conversations outside your branch scope',
        );
      }
      return;
    }

    if (user.panelType === StaffPanelType.BUSINESS_ADMIN) {
      if (!user.tid || user.tid !== thread.tenantId) {
        throw new ForbiddenException(
          'You cannot access support conversations outside your tenant scope',
        );
      }
      return;
    }
  }

  private async assertRestaurantInTenant(
    tenantId: string,
    restaurantId: string,
  ) {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: {
        id: restaurantId,
        tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!restaurant) {
      throw new ForbiddenException(
        'You cannot access support conversations outside your tenant restaurants',
      );
    }
  }

  private buildMessageCreateInput(
    user: AuthUserContext,
    threadId: string,
    body: string,
  ): Prisma.ChatMessageCreateInput {
    if (user.role === UserRoleEnum.CUSTOMER) {
      return {
        thread: { connect: { id: threadId } },
        senderType: ChatMessageSenderType.CUSTOMER,
        senderUser: { connect: { id: user.uid } },
        body,
      };
    }

    if (user.role === UserRoleEnum.STAFF) {
      return {
        thread: { connect: { id: threadId } },
        senderType: ChatMessageSenderType.STAFF,
        senderStaffUser: { connect: { id: user.uid } },
        body,
      };
    }

    return {
      thread: { connect: { id: threadId } },
      senderType: ChatMessageSenderType.ADMIN,
      senderUser: { connect: { id: user.uid } },
      body,
    };
  }

  private toThreadListItem(thread: {
    id: string;
    tenantId: string;
    restaurantId: string;
    branchId: string | null;
    customerId: string;
    orderId: string | null;
    source: ChatThreadSource;
    subject: string | null;
    status: ChatThreadStatus;
    assignedStaffUserId: string | null;
    lastMessagePreview: string | null;
    lastMessageAt: Date;
    customerUnreadCount: number;
    staffUnreadCount: number;
    customerLastReadAt: Date | null;
    staffLastReadAt: Date | null;
    resolvedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    customer: {
      id: string;
      email: string;
      isGuest: boolean;
      profile: {
        firstName: string;
        lastName: string;
        phone: string | null;
        avatarUrl: string | null;
      } | null;
    };
    branch: { id: string; name: string } | null;
    order: {
      id: string;
      status: string;
      orderType: string;
      paymentStatus: string;
      totalAmount: Prisma.Decimal;
      createdAt: Date;
    } | null;
    assignedStaff: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      panelType: StaffPanelType;
    } | null;
    messages: Array<{
      id: string;
      threadId: string;
      senderType: ChatMessageSenderType;
      body: string;
      createdAt: Date;
      senderUserId: string | null;
      senderStaffUserId: string | null;
      senderUser: {
        id: string;
        role: UserRole;
        email: string;
        isGuest: boolean;
        profile: {
          firstName: string;
          lastName: string;
          avatarUrl: string | null;
        } | null;
      } | null;
      senderStaffUser: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        avatarUrl: string | null;
        panelType: StaffPanelType;
      } | null;
    }>;
  }) {
    const latestMessage = thread.messages[0] ?? null;

    return {
      id: thread.id,
      tenantId: thread.tenantId,
      restaurantId: thread.restaurantId,
      branchId: thread.branchId,
      customerId: thread.customerId,
      orderId: thread.orderId,
      source: thread.source,
      subject: thread.subject,
      status: thread.status,
      assignedStaffUserId: thread.assignedStaffUserId,
      lastMessagePreview: thread.lastMessagePreview,
      lastMessageAt: thread.lastMessageAt,
      customerUnreadCount: thread.customerUnreadCount,
      staffUnreadCount: thread.staffUnreadCount,
      customerLastReadAt: thread.customerLastReadAt,
      staffLastReadAt: thread.staffLastReadAt,
      resolvedAt: thread.resolvedAt,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      customer: this.toCustomerSummary(thread.customer),
      branch: thread.branch,
      order: thread.order
        ? {
            ...thread.order,
            totalAmount: Number(thread.order.totalAmount),
          }
        : null,
      assignedStaff: thread.assignedStaff,
      latestMessage: latestMessage ? this.toMessageItem(latestMessage) : null,
      unreadForCustomer: this.isUnreadForCustomer(thread),
      unreadForStaff: this.isUnreadForStaff(thread),
    };
  }

  private toThreadDetails(thread: Parameters<typeof this.toThreadListItem>[0]) {
    return {
      ...this.toThreadListItem(thread),
      messages: thread.messages.map((message) => this.toMessageItem(message)),
    };
  }

  private toMessageItem(
    message: Parameters<typeof this.toThreadListItem>[0]['messages'][number],
  ) {
    return {
      id: message.id,
      threadId: message.threadId,
      senderType: message.senderType,
      body: message.body,
      createdAt: message.createdAt,
      senderUserId: message.senderUserId,
      senderStaffUserId: message.senderStaffUserId,
      sender:
        message.senderType === ChatMessageSenderType.STAFF
          ? message.senderStaffUser
            ? {
                id: message.senderStaffUser.id,
                email: message.senderStaffUser.email,
                firstName: message.senderStaffUser.firstName,
                lastName: message.senderStaffUser.lastName,
                avatarUrl: message.senderStaffUser.avatarUrl,
                panelType: message.senderStaffUser.panelType,
              }
            : null
          : message.senderUser
            ? {
                id: message.senderUser.id,
                email: message.senderUser.email,
                role: message.senderUser.role,
                isGuest: message.senderUser.isGuest,
                firstName: message.senderUser.profile?.firstName ?? null,
                lastName: message.senderUser.profile?.lastName ?? null,
                avatarUrl: message.senderUser.profile?.avatarUrl ?? null,
              }
            : null,
    };
  }

  private toCustomerSummary(
    customer: Parameters<typeof this.toThreadListItem>[0]['customer'],
  ) {
    return {
      id: customer.id,
      email: customer.email,
      isGuest: customer.isGuest,
      firstName: customer.profile?.firstName ?? null,
      lastName: customer.profile?.lastName ?? null,
      phone: customer.profile?.phone ?? null,
      avatarUrl: customer.profile?.avatarUrl ?? null,
    };
  }

  private isUnreadForCustomer(thread: { customerUnreadCount: number }) {
    return thread.customerUnreadCount > 0;
  }

  private isUnreadForStaff(thread: { staffUnreadCount: number }) {
    return thread.staffUnreadCount > 0;
  }

  private resolveOptionalString(value: string | undefined) {
    if (value === undefined) {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private normalizeMessage(value: string) {
    return value.trim();
  }

  private buildMessagePreview(message: string) {
    return message.length > 140 ? `${message.slice(0, 137)}...` : message;
  }
}
