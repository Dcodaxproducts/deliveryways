import { Injectable, Logger } from '@nestjs/common';
import { ChatThreadStatus, StaffPanelType } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { ChatRepository } from './chat.repository';
import { ListChatThreadsDto } from './dto';

type ThreadPayload = {
  id: string;
  tenantId: string;
  restaurantId: string;
  branchId: string | null;
  customerId: string;
  orderId: string | null;
  deliverymanId: string | null;
  source: string;
  subject: string | null;
  status: string;
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
  customer: Record<string, unknown>;
  branch: Record<string, unknown> | null;
  order: Record<string, unknown> | null;
  assignedStaff: Record<string, unknown> | null;
  deliveryman: Record<string, unknown> | null;
  latestMessage?: Record<string, unknown> | null;
  messages?: Record<string, unknown>[];
};

type SummaryScope =
  | { type: 'customer'; room: string; customerId: string; restaurantId: string }
  | {
      type: 'deliveryman';
      room: string;
      deliverymanId: string;
      restaurantId: string;
      branchId: string | null;
    }
  | { type: 'tenant'; room: string; tenantId: string }
  | { type: 'branch'; room: string; restaurantId: string; branchId: string }
  | { type: 'global'; room: string };

@Injectable()
export class ChatRealtimeService {
  private readonly logger = new Logger(ChatRealtimeService.name);
  private server: Server | null = null;

  constructor(private readonly chatRepository: ChatRepository) {}

  registerServer(server: Server) {
    this.server = server;
  }

  getInboxRoomsForUser(user: AuthUserContext): string[] {
    if (user.role === UserRoleEnum.CUSTOMER) {
      return [this.getUserRoom(user.uid)];
    }

    if (user.role === 'DELIVERYMAN') {
      return [this.getDeliverymanRoom(user.uid)];
    }

    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return [this.getGlobalRoom()];
    }

    if (user.role === UserRoleEnum.BRANCH_ADMIN) {
      return user.bid ? [this.getBranchRoom(user.bid)] : [];
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      return user.tid ? [this.getTenantRoom(user.tid)] : [];
    }

    if (user.panelType === StaffPanelType.BRANCH_ADMIN) {
      return user.bid ? [this.getBranchRoom(user.bid)] : [];
    }

    if (user.panelType === StaffPanelType.BUSINESS_ADMIN) {
      return user.tid ? [this.getTenantRoom(user.tid)] : [];
    }

    return [this.getGlobalRoom()];
  }

  getThreadRoom(threadId: string): string {
    return `chat:thread:${threadId}`;
  }

  getUserRoom(customerId: string): string {
    return `chat:user:${customerId}`;
  }

  getDeliverymanRoom(deliverymanId: string): string {
    return `chat:deliveryman:${deliverymanId}`;
  }

  getTenantRoom(tenantId: string): string {
    return `chat:tenant:${tenantId}`;
  }

  getBranchRoom(branchId: string): string {
    return `chat:branch:${branchId}`;
  }

  getGlobalRoom(): string {
    return 'chat:global';
  }

  async emitInitialSummary(socket: Socket, user: AuthUserContext) {
    const scopes = this.getSummaryScopesForUser(user);
    await Promise.all(
      scopes.map(async (scope) => {
        const summary = await this.buildSummary(scope);
        socket.emit('chat.inbox.summary', summary);
      }),
    );
  }

  async emitThreadCreated(thread: ThreadPayload) {
    this.emitToSupportAndCustomerRooms('chat.thread.created', thread);
    await this.emitSummariesForThread(thread);
  }

  async emitThreadUpdated(thread: ThreadPayload) {
    this.emitToSupportAndCustomerRooms('chat.thread.updated', thread);
    this.emitToRoom(
      this.getThreadRoom(thread.id),
      'chat.thread.updated',
      thread,
    );
    await this.emitSummariesForThread(thread);
  }

  async emitMessageCreated(thread: ThreadPayload) {
    const latestMessage =
      thread.messages?.at(-1) ?? thread.latestMessage ?? null;

    if (!latestMessage) {
      return;
    }

    const payload = {
      threadId: thread.id,
      message: latestMessage,
      thread,
    };

    this.emitToSupportAndCustomerRooms('chat.message.created', payload);
    this.emitToRoom(
      this.getThreadRoom(thread.id),
      'chat.message.created',
      payload,
    );
    await this.emitSummariesForThread(thread);
  }

  async emitThreadRead(thread: ThreadPayload) {
    const payload = {
      threadId: thread.id,
      customerUnreadCount: thread.customerUnreadCount,
      staffUnreadCount: thread.staffUnreadCount,
      customerLastReadAt: thread.customerLastReadAt,
      staffLastReadAt: thread.staffLastReadAt,
    };

    this.emitToSupportAndCustomerRooms('chat.thread.read', payload);
    this.emitToRoom(this.getThreadRoom(thread.id), 'chat.thread.read', payload);
    await this.emitSummariesForThread(thread);
  }

  private emitToSupportAndCustomerRooms(event: string, payload: unknown) {
    if (!this.server) {
      return;
    }

    const thread = payload as ThreadPayload | { thread?: ThreadPayload };
    const threadPayload =
      'thread' in thread && thread.thread
        ? thread.thread
        : (thread as ThreadPayload);

    const rooms = new Set<string>([
      this.getUserRoom(threadPayload.customerId),
      this.getTenantRoom(threadPayload.tenantId),
      this.getGlobalRoom(),
    ]);

    if (threadPayload.deliverymanId) {
      rooms.add(this.getDeliverymanRoom(threadPayload.deliverymanId));
    }

    if (threadPayload.branchId) {
      rooms.add(this.getBranchRoom(threadPayload.branchId));
    }

    rooms.forEach((room) => {
      this.server?.to(room).emit(event, payload);
    });
  }

  private emitToRoom(room: string, event: string, payload: unknown) {
    this.server?.to(room).emit(event, payload);
  }

  private getSummaryScopesForThread(thread: ThreadPayload): SummaryScope[] {
    const scopes: SummaryScope[] = [
      {
        type: 'customer',
        room: this.getUserRoom(thread.customerId),
        customerId: thread.customerId,
        restaurantId: thread.restaurantId,
      },
      ...(thread.deliverymanId
        ? [
            {
              type: 'deliveryman' as const,
              room: this.getDeliverymanRoom(thread.deliverymanId),
              deliverymanId: thread.deliverymanId,
              restaurantId: thread.restaurantId,
              branchId: thread.branchId,
            },
          ]
        : []),
      {
        type: 'tenant',
        room: this.getTenantRoom(thread.tenantId),
        tenantId: thread.tenantId,
      },
      {
        type: 'global',
        room: this.getGlobalRoom(),
      },
    ];

    if (thread.branchId) {
      scopes.push({
        type: 'branch',
        room: this.getBranchRoom(thread.branchId),
        restaurantId: thread.restaurantId,
        branchId: thread.branchId,
      });
    }

    return scopes;
  }

  private getSummaryScopesForUser(user: AuthUserContext): SummaryScope[] {
    if (user.role === UserRoleEnum.CUSTOMER && user.rid) {
      return [
        {
          type: 'customer',
          room: this.getUserRoom(user.uid),
          customerId: user.uid,
          restaurantId: user.rid,
        },
      ];
    }

    if (user.role === 'DELIVERYMAN' && user.rid) {
      return [
        {
          type: 'deliveryman',
          room: this.getDeliverymanRoom(user.uid),
          deliverymanId: user.uid,
          restaurantId: user.rid,
          branchId: user.bid ?? null,
        },
      ];
    }

    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return [{ type: 'global', room: this.getGlobalRoom() }];
    }

    if (user.role === UserRoleEnum.BRANCH_ADMIN && user.bid && user.rid) {
      return [
        {
          type: 'branch',
          room: this.getBranchRoom(user.bid),
          restaurantId: user.rid,
          branchId: user.bid,
        },
      ];
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN && user.tid) {
      return [
        {
          type: 'tenant',
          room: this.getTenantRoom(user.tid),
          tenantId: user.tid,
        },
      ];
    }

    if (
      user.role === UserRoleEnum.STAFF &&
      user.panelType === StaffPanelType.BRANCH_ADMIN &&
      user.bid &&
      user.rid
    ) {
      return [
        {
          type: 'branch',
          room: this.getBranchRoom(user.bid),
          restaurantId: user.rid,
          branchId: user.bid,
        },
      ];
    }

    if (
      user.role === UserRoleEnum.STAFF &&
      user.panelType === StaffPanelType.BUSINESS_ADMIN &&
      user.tid
    ) {
      return [
        {
          type: 'tenant',
          room: this.getTenantRoom(user.tid),
          tenantId: user.tid,
        },
      ];
    }

    return [{ type: 'global', room: this.getGlobalRoom() }];
  }

  private async emitSummariesForThread(thread: ThreadPayload) {
    if (!this.server) {
      return;
    }

    const scopes = this.getSummaryScopesForThread(thread);

    await Promise.all(
      scopes.map(async (scope) => {
        const summary = await this.buildSummary(scope);
        this.emitToRoom(scope.room, 'chat.inbox.summary', summary);
      }),
    );
  }

  private async buildSummary(scope: SummaryScope) {
    const query = new ListChatThreadsDto();

    const baseWhere =
      scope.type === 'customer'
        ? this.chatRepository.buildWhere({
            query,
            restaurantId: scope.restaurantId,
            customerId: scope.customerId,
          })
        : scope.type === 'deliveryman'
          ? this.chatRepository.buildWhere({
              query,
              restaurantId: scope.restaurantId,
              branchId: scope.branchId ?? undefined,
              deliverymanId: scope.deliverymanId,
            })
          : scope.type === 'tenant'
            ? this.chatRepository.buildWhere({
                query,
                tenantId: scope.tenantId,
              })
            : scope.type === 'branch'
              ? this.chatRepository.buildWhere({
                  query,
                  restaurantId: scope.restaurantId,
                  branchId: scope.branchId,
                })
              : this.chatRepository.buildWhere({ query });

    const unreadWhere =
      scope.type === 'customer'
        ? this.chatRepository.buildWhere({
            query: { ...query, unreadOnly: true },
            restaurantId: scope.restaurantId,
            customerId: scope.customerId,
            unreadOnlyFor: 'customer',
          })
        : scope.type === 'deliveryman'
          ? this.chatRepository.buildWhere({
              query: { ...query, unreadOnly: true },
              restaurantId: scope.restaurantId,
              branchId: scope.branchId ?? undefined,
              deliverymanId: scope.deliverymanId,
              unreadOnlyFor: 'staff',
            })
          : scope.type === 'tenant'
            ? this.chatRepository.buildWhere({
                query: { ...query, unreadOnly: true },
                tenantId: scope.tenantId,
                unreadOnlyFor: 'staff',
              })
            : scope.type === 'branch'
              ? this.chatRepository.buildWhere({
                  query: { ...query, unreadOnly: true },
                  restaurantId: scope.restaurantId,
                  branchId: scope.branchId,
                  unreadOnlyFor: 'staff',
                })
              : this.chatRepository.buildWhere({
                  query: { ...query, unreadOnly: true },
                  unreadOnlyFor: 'staff',
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
      this.chatRepository.count(unreadWhere),
    ]);

    return {
      scope: scope.type,
      total,
      open,
      inProgress,
      resolved,
      unread,
    };
  }
}
