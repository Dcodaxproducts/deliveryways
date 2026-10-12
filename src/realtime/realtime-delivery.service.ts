import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { Server } from 'socket.io';
import { AuthUserContext } from '../common/decorators';
import {
  RealtimeEventEnvelope,
  RealtimeEventName,
  RealtimeRooms,
} from '../common/realtime/realtime-events';
import { ChatRealtimeEventName, ChatService } from '../modules/chat/public-api';
import {
  OrderRealtimeEventName,
  OrdersService,
} from '../modules/orders/public-api';
import { ChatGateway } from './gateways/chat.gateway';
import { OrderTrackingGateway } from './gateways/order-tracking.gateway';
import {
  RealtimeDeliveryAuthorizationService,
  RealtimeEntity,
  RealtimeSubject,
  realtimeSubjectKey,
} from './realtime-delivery-authorization.service';
import { RealtimeOutboxDispatcherService } from './realtime-outbox-dispatcher.service';

/** Sockets re-authorized per database round trip. */
export const DELIVERY_AUTH_CHUNK_SIZE = 250;
/** Authorization chunks in flight at once for one event. */
export const DELIVERY_AUTH_CONCURRENCY = 4;

type DeliverySocket = {
  id: string;
  rooms: ReadonlySet<string>;
  data: { user?: AuthUserContext };
  emit: (event: string, payload: unknown) => unknown;
  leave: (room: string) => unknown;
};

type Fanout = {
  server: Server;
  event: string;
  entity: RealtimeEntity;
  /** Rooms that exist only for this entity; stale membership is removed from them. */
  entityRooms: string[];
  /** Shared scope rooms; membership there is never touched by an entity event. */
  scopeRooms: string[];
  payloadFor: (socket: DeliverySocket) => unknown;
};

const ORDER_EVENTS: ReadonlySet<string> = new Set<OrderRealtimeEventName>([
  RealtimeEventName.ORDER_CREATED,
  RealtimeEventName.ORDER_STATUS_UPDATED,
  RealtimeEventName.ORDER_UPDATED,
  RealtimeEventName.ORDER_TRACKING_UPDATED,
]);
const CHAT_EVENTS: ReadonlySet<string> = new Set<ChatRealtimeEventName>([
  RealtimeEventName.CHAT_THREAD_CREATED,
  RealtimeEventName.CHAT_THREAD_UPDATED,
  RealtimeEventName.CHAT_MESSAGE_CREATED,
  RealtimeEventName.CHAT_THREAD_READ,
]);

@Injectable()
export class RealtimeDeliveryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RealtimeDeliveryService.name);

  constructor(
    private readonly dispatcher: RealtimeOutboxDispatcherService,
    private readonly orderGateway: OrderTrackingGateway,
    private readonly chatGateway: ChatGateway,
    private readonly authorization: RealtimeDeliveryAuthorizationService,
    private readonly ordersService: OrdersService,
    private readonly chatService: ChatService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.dispatcher.subscribe((event) => this.deliver(event));
  }

  private async deliver(envelope: RealtimeEventEnvelope): Promise<void> {
    if (ORDER_EVENTS.has(envelope.event))
      await this.deliverOrder(
        envelope.event,
        envelope.payload,
        envelope.eventId,
      );
    else if (CHAT_EVENTS.has(envelope.event))
      await this.deliverChat(
        envelope.event,
        envelope.payload,
        envelope.eventId,
      );
  }

  /**
   * Adds the stable outbox id to the client payload. It is the only new field: every
   * existing field is preserved. Delivery is at-least-once, so a crash replay re-emits the
   * same id; ids increase per aggregate (order/thread), so clients may drop an id they have
   * already seen for that aggregate.
   */
  private withEventId<T extends object>(
    payload: T,
    eventId: string,
  ): T & { eventId: string } {
    return { ...payload, eventId };
  }

  private async deliverOrder(
    event: RealtimeEventName,
    intent: unknown,
    eventId: string,
  ): Promise<void> {
    const orderId = this.readString(intent, 'id');
    if (!orderId) return;
    const payload = await this.ordersService.getRealtimeEventPayload(
      event as OrderRealtimeEventName,
      orderId,
    );
    if (!payload) return;
    const entity = await this.authorization.resolveEntity({
      kind: 'order',
      id: orderId,
    });
    if (!entity) return;
    const stamped = this.withEventId(payload, eventId);
    const tracking = event === RealtimeEventName.ORDER_TRACKING_UPDATED;
    await this.fanout({
      server: this.requireServer(this.orderGateway.server),
      event,
      entity,
      entityRooms: tracking ? [RealtimeRooms.orderTracking(orderId)] : [],
      scopeRooms: tracking
        ? []
        : [
            RealtimeRooms.tenantOrders(entity.tenantId),
            RealtimeRooms.restaurantOrders(entity.restaurantId),
            ...(entity.branchId
              ? [
                  RealtimeRooms.branchOrders(
                    entity.restaurantId,
                    entity.branchId,
                  ),
                ]
              : []),
          ],
      payloadFor: () => stamped,
    });
  }

  private async deliverChat(
    event: RealtimeEventName,
    intent: unknown,
    eventId: string,
  ): Promise<void> {
    const threadId =
      this.readString(intent, 'threadId') ?? this.readString(intent, 'id');
    if (!threadId) return;
    const message = (intent as { message?: unknown }).message;
    const payload = await this.chatService.getRealtimeEventPayload(
      event as ChatRealtimeEventName,
      threadId,
      this.readString(message, 'id') ?? undefined,
    );
    if (!payload) return;
    const entity = await this.authorization.resolveEntity({
      kind: 'chat',
      id: threadId,
    });
    if (!entity) return;
    const threadRoom = RealtimeRooms.chatThread(threadId);
    const stamped = this.withEventId(payload, eventId);
    const threadOnly =
      event === RealtimeEventName.CHAT_THREAD_READ
        ? Object.fromEntries(
            Object.entries(stamped).filter(([field]) => field !== 'thread'),
          )
        : null;
    const scopeRooms = [
      RealtimeRooms.chatCustomer(entity.customerId),
      RealtimeRooms.chatTenant(entity.tenantId),
      RealtimeRooms.chatGlobal(),
      ...(entity.deliverymanId
        ? [RealtimeRooms.chatDeliveryman(entity.deliverymanId)]
        : []),
      ...(entity.branchId ? [RealtimeRooms.chatBranch(entity.branchId)] : []),
    ];
    await this.fanout({
      server: this.requireServer(this.chatGateway.server),
      event,
      entity,
      entityRooms: [threadRoom],
      scopeRooms,
      payloadFor: (socket) =>
        // Existing contract: sockets that only joined the thread room never got the embedded thread on reads.
        threadOnly && !scopeRooms.some((room) => socket.rooms.has(room))
          ? threadOnly
          : stamped,
    });
  }

  /**
   * Fetches only sockets that are members of this entity's rooms, re-authorizes
   * them in bounded chunks against current database state, emits to the allowed,
   * and drops stale membership of the entity rooms for the rest. Sockets are
   * never disconnected, and sockets outside these rooms are never touched.
   */
  private async fanout(plan: Fanout): Promise<void> {
    const rooms = [...plan.entityRooms, ...plan.scopeRooms];
    if (rooms.length === 0) return;
    const sockets = (await plan.server
      .in(rooms)
      .fetchSockets()) as unknown as DeliverySocket[];
    const chunks: DeliverySocket[][] = [];
    for (
      let offset = 0;
      offset < sockets.length;
      offset += DELIVERY_AUTH_CHUNK_SIZE
    )
      chunks.push(sockets.slice(offset, offset + DELIVERY_AUTH_CHUNK_SIZE));
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (cursor < chunks.length)
        await this.deliverChunk(plan, chunks[cursor++]);
    };
    await Promise.all(
      Array.from(
        { length: Math.min(DELIVERY_AUTH_CONCURRENCY, chunks.length) },
        worker,
      ),
    );
  }

  private async deliverChunk(
    plan: Fanout,
    sockets: DeliverySocket[],
  ): Promise<void> {
    const subjects: Array<RealtimeSubject & { socket: DeliverySocket }> = [];
    for (const socket of sockets) {
      const user = socket.data?.user;
      if (user)
        subjects.push({
          key: realtimeSubjectKey(socket.id, user),
          user,
          socket,
        });
    }
    if (subjects.length === 0) return;
    const allowed = await this.authorization.authorize(subjects, plan.entity);
    for (const { key, socket } of subjects) {
      try {
        if (allowed.has(key)) {
          socket.emit(plan.event, plan.payloadFor(socket));
          continue;
        }
        for (const room of plan.entityRooms)
          if (socket.rooms.has(room)) await socket.leave(room);
      } catch (error) {
        this.logger.warn(
          'Realtime socket delivery failed: ' +
            (error instanceof Error ? error.message : 'unknown error'),
        );
      }
    }
  }

  private requireServer(server: Server | undefined): Server {
    if (!server) throw new Error('Realtime gateway server is not ready');
    return server;
  }

  private readString(value: unknown, field: string): string | null {
    if (!value || typeof value !== 'object') return null;
    const candidate = (value as Record<string, unknown>)[field];
    return typeof candidate === 'string' && candidate.length > 0
      ? candidate
      : null;
  }
}
