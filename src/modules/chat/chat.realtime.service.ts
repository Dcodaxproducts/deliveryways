import { Injectable, Logger } from '@nestjs/common';
import { ChatThreadStatus, StaffPanelType } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { ChatRepository } from './chat.repository';
import { ListChatThreadsDto } from './dto';
import { RealtimeEventBusService } from '../../common/realtime/realtime-event-bus.service';
import {
  RealtimeEventName,
  RealtimeRooms,
} from '../../common/realtime/realtime-events';

export type ChatRealtimeThreadPayload = {
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

export type ChatMessageCreatedPayload = {
  threadId: string;
  message: Record<string, unknown>;
  thread: ChatRealtimeThreadPayload;
};

export type ChatThreadReadPayload = {
  threadId: string;
  customerUnreadCount: number;
  staffUnreadCount: number;
  customerLastReadAt: Date | null;
  staffLastReadAt: Date | null;
  thread: ChatRealtimeThreadPayload;
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

  constructor(
    private readonly chatRepository: ChatRepository,
    private readonly eventBus: RealtimeEventBusService,
  ) {}

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

    return [];
  }

  getThreadRoom(threadId: string): string {
    return RealtimeRooms.chatThread(threadId);
  }

  getUserRoom(customerId: string): string {
    return RealtimeRooms.chatCustomer(customerId);
  }

  getDeliverymanRoom(deliverymanId: string): string {
    return RealtimeRooms.chatDeliveryman(deliverymanId);
  }

  getTenantRoom(tenantId: string): string {
    return RealtimeRooms.chatTenant(tenantId);
  }

  getBranchRoom(branchId: string): string {
    return RealtimeRooms.chatBranch(branchId);
  }

  getGlobalRoom(): string {
    return RealtimeRooms.chatGlobal();
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

  emitThreadCreated(thread: ChatRealtimeThreadPayload): Promise<void> {
    this.eventBus.publish(RealtimeEventName.CHAT_THREAD_CREATED, thread);
    return Promise.resolve();
  }

  emitThreadUpdated(thread: ChatRealtimeThreadPayload): Promise<void> {
    this.eventBus.publish(RealtimeEventName.CHAT_THREAD_UPDATED, thread);
    return Promise.resolve();
  }

  /**
   * `messageId` selects the exact message an outbox event refers to; without it
   * (or when it is no longer in the thread) the latest message is used.
   */
  buildMessageCreatedPayload(
    thread: ChatRealtimeThreadPayload,
    messageId?: string,
  ): ChatMessageCreatedPayload | null {
    const message =
      (messageId
        ? thread.messages?.find((candidate) => candidate.id === messageId)
        : undefined) ??
      thread.messages?.at(-1) ??
      thread.latestMessage ??
      null;

    return message ? { threadId: thread.id, message, thread } : null;
  }

  buildThreadReadPayload(
    thread: ChatRealtimeThreadPayload,
  ): ChatThreadReadPayload {
    return {
      threadId: thread.id,
      customerUnreadCount: thread.customerUnreadCount,
      staffUnreadCount: thread.staffUnreadCount,
      customerLastReadAt: thread.customerLastReadAt,
      staffLastReadAt: thread.staffLastReadAt,
      thread,
    };
  }

  emitMessageCreated(thread: ChatRealtimeThreadPayload): Promise<void> {
    const payload = this.buildMessageCreatedPayload(thread);
    if (payload) {
      this.eventBus.publish(RealtimeEventName.CHAT_MESSAGE_CREATED, payload);
    }
    return Promise.resolve();
  }

  emitThreadRead(thread: ChatRealtimeThreadPayload): Promise<void> {
    this.eventBus.publish(
      RealtimeEventName.CHAT_THREAD_READ,
      this.buildThreadReadPayload(thread),
    );
    return Promise.resolve();
  }

  async deliverEvent(event: string, payload: unknown): Promise<void> {
    if (!this.server || !payload || typeof payload !== 'object') return;
    if (
      event === RealtimeEventName.CHAT_THREAD_CREATED ||
      event === RealtimeEventName.CHAT_THREAD_UPDATED
    ) {
      const thread = payload as ChatRealtimeThreadPayload;
      this.emitToSupportAndCustomerRooms(event, thread);
      if (event === RealtimeEventName.CHAT_THREAD_UPDATED) {
        this.emitToRoom(this.getThreadRoom(thread.id), event, thread);
      }
      await this.emitSummariesForThread(thread);
      return;
    }
    if (
      event === RealtimeEventName.CHAT_MESSAGE_CREATED ||
      event === RealtimeEventName.CHAT_THREAD_READ
    ) {
      const wrapped = payload as { thread?: ChatRealtimeThreadPayload };
      if (!wrapped.thread) return;
      const clientPayload =
        event === RealtimeEventName.CHAT_THREAD_READ
          ? this.withoutThread(wrapped)
          : payload;
      this.emitToSupportAndCustomerRooms(event, payload);
      this.emitToRoom(
        this.getThreadRoom(wrapped.thread.id),
        event,
        clientPayload,
      );
      await this.emitSummariesForThread(wrapped.thread);
    }
  }

  private withoutThread(payload: {
    thread?: ChatRealtimeThreadPayload;
  }): unknown {
    const clientPayload = { ...payload };
    delete clientPayload.thread;
    return clientPayload;
  }

  private emitToSupportAndCustomerRooms(event: string, payload: unknown) {
    if (!this.server) {
      return;
    }

    const thread = payload as
      | ChatRealtimeThreadPayload
      | { thread?: ChatRealtimeThreadPayload };
    const threadPayload =
      'thread' in thread && thread.thread
        ? thread.thread
        : (thread as ChatRealtimeThreadPayload);

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
      this.server?.local.to(room).emit(event, payload);
    });
  }

  private emitToRoom(room: string, event: string, payload: unknown) {
    this.server?.local.to(room).emit(event, payload);
  }

  private getSummaryScopesForThread(
    thread: ChatRealtimeThreadPayload,
  ): SummaryScope[] {
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

    return [];
  }

  private async emitSummariesForThread(thread: ChatRealtimeThreadPayload) {
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
