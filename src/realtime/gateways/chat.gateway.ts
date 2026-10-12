import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  Logger,
  UnauthorizedException,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';
import { AuthUserContext } from '../../common/decorators';
import {
  AssignChatThreadDto,
  CreateChatMessageDto,
  CreateChatThreadDto,
  UpdateChatThreadStatusDto,
  ChatRealtimeService,
  ChatService,
} from '../../modules/chat/public-api';
import { RealtimeAdmissionService } from '../../common/realtime/realtime-admission.service';
import { CurrentSessionValidator } from '../../common/auth';

type ChatSocket = Socket & {
  data: {
    user?: AuthUserContext;
  };
};

@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class ChatGateway
  implements OnGatewayConnection<ChatSocket>, OnGatewayDisconnect<ChatSocket>
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly currentSessionValidator: CurrentSessionValidator,
    private readonly chatService: ChatService,
    private readonly chatRealtimeService: ChatRealtimeService,
    private readonly admission: RealtimeAdmissionService,
  ) {}

  afterInit(server: Server) {
    this.chatRealtimeService.registerServer(server);
  }

  async handleConnection(client: ChatSocket) {
    const socketKey = this.socketKey(client);
    const networkAdmission = this.admission.begin(socketKey, client);
    if (!networkAdmission.allowed) {
      this.rejectConnection(client, networkAdmission.retryAfterSeconds);
      return;
    }

    try {
      const user = await this.authenticate(client);
      const userAdmission = this.admission.bindUser(socketKey, user.uid);
      if (!userAdmission.allowed) {
        this.rejectConnection(client, userAdmission.retryAfterSeconds);
        return;
      }
      this.setSocketUser(client, user);

      const rooms = this.chatRealtimeService.getInboxRoomsForUser(user);
      await Promise.all(rooms.map(async (room) => client.join(room)));
    } catch {
      this.admission.release(socketKey);
      client.emit('chat.error', {
        code: 'UNAUTHORIZED',
        message: 'Socket authentication failed',
      });
      client.disconnect(true);
      return;
    }

    // The summary is a convenience snapshot: a failure must not drop an authenticated socket.
    const user = this.getSocketUser(client);
    if (!user) return;
    try {
      await this.chatRealtimeService.emitInitialSummary(client, user);
    } catch (error) {
      this.logger.warn(
        `Initial chat inbox summary failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  handleDisconnect(client: ChatSocket) {
    this.admission.release(this.socketKey(client));
  }

  /** Isolated outbox hook: mutation event is emitted before these legacy summaries. */
  async deliverInboxSummaries(
    thread: Parameters<ChatRealtimeService['getInboxSummariesForThread']>[0],
  ): Promise<void> {
    const summaries =
      await this.chatRealtimeService.getInboxSummariesForThread(thread);
    for (const { room, summary } of summaries)
      this.server.local.to(room).emit('chat.inbox.summary', summary);
  }

  private socketKey(client: ChatSocket): string {
    return `chat:${client.id}`;
  }

  private rejectConnection(
    client: ChatSocket,
    retryAfterSeconds: number,
  ): void {
    this.admission.release(this.socketKey(client));
    client.emit('chat.error', {
      code: 'RATE_LIMITED',
      message: 'Too many realtime connections',
      retryAfterSeconds,
    });
    client.disconnect(true);
  }

  @SubscribeMessage('chat.inbox.subscribe')
  async subscribeInbox(@ConnectedSocket() client: ChatSocket) {
    return this.handleSocketRequest(client, async (user) => {
      await this.chatRealtimeService.emitInitialSummary(client, user);
      return {
        rooms: this.chatRealtimeService.getInboxRoomsForUser(user),
      };
    });
  }

  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @SubscribeMessage('chat.thread.create')
  async createThread(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() dto: CreateChatThreadDto,
  ) {
    return this.handleSocketRequest(client, async (user) => {
      const result = await this.chatService.createThread(user, dto);
      await client.join(this.chatRealtimeService.getThreadRoom(result.data.id));
      return result.data;
    });
  }

  @SubscribeMessage('chat.thread.join')
  async joinThread(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() body: { threadId?: string },
  ) {
    return this.handleSocketRequest(client, async (user) => {
      if (!body?.threadId) {
        throw new UnauthorizedException('threadId is required');
      }

      const result = await this.chatService.details(user, body.threadId);
      await client.join(this.chatRealtimeService.getThreadRoom(body.threadId));
      return result.data;
    });
  }

  @SubscribeMessage('chat.thread.leave')
  async leaveThread(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() body: { threadId?: string },
  ) {
    return this.handleSocketRequest(client, async () => {
      if (!body?.threadId) {
        throw new UnauthorizedException('threadId is required');
      }

      await client.leave(this.chatRealtimeService.getThreadRoom(body.threadId));
      return { threadId: body.threadId };
    });
  }

  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @SubscribeMessage('chat.message.send')
  async sendMessage(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() body: { threadId?: string; message?: string },
  ) {
    return this.handleSocketRequest(client, async (user) => {
      if (!body?.threadId) {
        throw new UnauthorizedException('threadId is required');
      }

      const result = await this.chatService.reply(user, body.threadId, {
        message: body.message ?? '',
      } as CreateChatMessageDto);
      await client.join(this.chatRealtimeService.getThreadRoom(body.threadId));
      return result.data;
    });
  }

  @SubscribeMessage('chat.thread.markRead')
  async markRead(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() body: { threadId?: string },
  ) {
    return this.handleSocketRequest(client, async (user) => {
      if (!body?.threadId) {
        throw new UnauthorizedException('threadId is required');
      }

      const result = await this.chatService.markRead(user, body.threadId);
      return result.data;
    });
  }

  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @SubscribeMessage('chat.thread.assign')
  async assignThread(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody()
    body: { threadId?: string; assignedStaffUserId?: string | null },
  ) {
    return this.handleSocketRequest(client, async (user) => {
      if (!body?.threadId) {
        throw new UnauthorizedException('threadId is required');
      }

      const result = await this.chatService.assign(user, body.threadId, {
        assignedStaffUserId: body.assignedStaffUserId,
      } as AssignChatThreadDto);
      return result.data;
    });
  }

  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @SubscribeMessage('chat.thread.status')
  async updateThreadStatus(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() body: { threadId?: string; status?: string },
  ) {
    return this.handleSocketRequest(client, async (user) => {
      if (!body?.threadId) {
        throw new UnauthorizedException('threadId is required');
      }

      const result = await this.chatService.updateStatus(user, body.threadId, {
        status: body.status,
      } as UpdateChatThreadStatusDto);
      return result.data;
    });
  }

  private async authenticate(client: ChatSocket): Promise<AuthUserContext> {
    const token = this.extractToken(client);

    if (!token) {
      throw new UnauthorizedException('Missing access token');
    }

    const user = await this.jwtService.verifyAsync<AuthUserContext>(token);
    await this.currentSessionValidator.assertCurrentSession(user);
    return user;
  }

  private extractToken(client: ChatSocket) {
    const auth = client.handshake.auth as Record<string, unknown>;
    const authToken = auth.token;
    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken.trim();
    }

    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice(7).trim();
    }

    return null;
  }

  private setSocketUser(client: ChatSocket, user: AuthUserContext) {
    (client.data as { user?: AuthUserContext }).user = user;
  }

  private getSocketUser(client: ChatSocket) {
    return (client.data as { user?: AuthUserContext }).user;
  }

  private async handleSocketRequest<T>(
    client: ChatSocket,
    handler: (user: AuthUserContext) => Promise<T> | T,
  ) {
    try {
      const user = this.getSocketUser(client);
      if (!user) {
        throw new UnauthorizedException('Socket is not authenticated');
      }

      try {
        await this.currentSessionValidator.assertCurrentSession(user);
      } catch (error) {
        client.emit('chat.error', {
          code: 'UNAUTHORIZED',
          message: 'Session is no longer valid',
        });
        client.disconnect(true);
        throw error;
      }

      const data = await handler(user);
      return { success: true, data };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Socket request failed';
      this.logger.warn(`Socket request failed: ${message}`);
      return {
        success: false,
        error: {
          code: 'CHAT_SOCKET_ERROR',
          message,
        },
      };
    }
  }
}
