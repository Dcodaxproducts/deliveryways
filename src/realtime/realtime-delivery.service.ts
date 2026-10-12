import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { AuthUserContext } from '../common/decorators';
import { RealtimeEventBusService } from '../common/realtime/realtime-event-bus.service';
import { RealtimeEventEnvelope } from '../common/realtime/realtime-events';
import { ChatGateway } from './gateways/chat.gateway';
import { OrderTrackingGateway } from './gateways/order-tracking.gateway';
import { RealtimeDeliveryAuthorizationService } from './realtime-delivery-authorization.service';

type EntityPayload = {
  id?: unknown;
  threadId?: unknown;
  thread?: { id?: unknown };
};
type SocketLike = {
  data: { user?: AuthUserContext };
  emit: (event: string, payload: unknown) => void;
  disconnect: (close?: boolean) => void;
};

@Injectable()
export class RealtimeDeliveryService implements OnApplicationBootstrap {
  constructor(
    private readonly eventBus: RealtimeEventBusService,
    private readonly orderGateway: OrderTrackingGateway,
    private readonly chatGateway: ChatGateway,
    private readonly authorization: RealtimeDeliveryAuthorizationService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.eventBus.subscribe((event) => this.deliver(event));
  }

  private async deliver(envelope: RealtimeEventEnvelope): Promise<void> {
    const isChat = envelope.event.startsWith('chat.');
    const id = this.entityId(envelope.payload, isChat);
    if (!id) return;
    const server = isChat ? this.chatGateway.server : this.orderGateway.server;
    const sockets = (await server.fetchSockets()) as unknown as SocketLike[];
    const users = sockets
      .map((socket) => socket.data.user)
      .filter((user): user is AuthUserContext => Boolean(user));
    const allowed = await this.authorization.authorize(users, {
      kind: isChat ? 'chat' : 'order',
      id,
    });
    for (const socket of sockets) {
      const user = socket.data.user;
      if (user && allowed.has(user.uid))
        socket.emit(envelope.event, envelope.payload);
      else if (user) socket.disconnect(true);
    }
  }

  private entityId(payload: unknown, isChat: boolean): string | null {
    if (!payload || typeof payload !== 'object') return null;
    const value = payload as EntityPayload;
    const candidate = isChat
      ? (value.threadId ?? value.thread?.id ?? value.id)
      : value.id;
    return typeof candidate === 'string' && candidate.length > 0
      ? candidate
      : null;
  }
}
