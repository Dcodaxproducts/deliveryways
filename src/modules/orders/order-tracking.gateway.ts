import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Server, Socket } from 'socket.io';
import { AuthUserContext } from '../../common/decorators';
import { OrdersService } from './orders.service';
import { OrderTrackingRealtimeService } from './order-tracking.realtime.service';

type OrderTrackingSocket = Socket & {
  data: {
    user?: AuthUserContext;
  };
};

@WebSocketGateway({
  namespace: '/orders-tracking',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class OrderTrackingGateway
  implements
    OnGatewayConnection<OrderTrackingSocket>,
    OnGatewayDisconnect<OrderTrackingSocket>
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(OrderTrackingGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly ordersService: OrdersService,
    private readonly orderTrackingRealtimeService: OrderTrackingRealtimeService,
  ) {}

  afterInit(server: Server) {
    this.orderTrackingRealtimeService.registerServer(server);
  }

  async handleConnection(client: OrderTrackingSocket) {
    try {
      const user = await this.authenticate(client);
      this.setSocketUser(client, user);
      this.logger.log(
        `Order tracking socket connected: ${client.id} (${user.uid})`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Socket authentication failed';
      this.logger.warn(`Order tracking socket rejected: ${message}`);
      client.emit('order.tracking.error', {
        code: 'UNAUTHORIZED',
        message,
      });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: OrderTrackingSocket) {
    this.logger.log(`Order tracking socket disconnected: ${client.id}`);
  }

  @SubscribeMessage('order.tracking.subscribe')
  async subscribeToOrder(
    @ConnectedSocket() client: OrderTrackingSocket,
    @MessageBody() body: { orderId?: string },
  ) {
    return this.handleSocketRequest(client, async (user) => {
      if (!body?.orderId) {
        throw new UnauthorizedException('orderId is required');
      }

      const snapshot = await this.ordersService.getTrackingSnapshot(
        user,
        body.orderId,
      );
      const room = this.orderTrackingRealtimeService.getOrderRoom(body.orderId);

      await client.join(room);
      client.emit('order.tracking.snapshot', snapshot);

      return {
        orderId: body.orderId,
        room,
      };
    });
  }

  @SubscribeMessage('order.tracking.unsubscribe')
  async unsubscribeFromOrder(
    @ConnectedSocket() client: OrderTrackingSocket,
    @MessageBody() body: { orderId?: string },
  ) {
    return this.handleSocketRequest(client, async () => {
      if (!body?.orderId) {
        throw new UnauthorizedException('orderId is required');
      }

      const room = this.orderTrackingRealtimeService.getOrderRoom(body.orderId);
      await client.leave(room);

      return {
        orderId: body.orderId,
        room,
      };
    });
  }

  private async authenticate(
    client: OrderTrackingSocket,
  ): Promise<AuthUserContext> {
    const token = this.extractToken(client);

    if (!token) {
      throw new UnauthorizedException('Missing access token');
    }

    return this.jwtService.verifyAsync<AuthUserContext>(token, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET', 'change-me'),
    });
  }

  private extractToken(client: OrderTrackingSocket) {
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

  private setSocketUser(client: OrderTrackingSocket, user: AuthUserContext) {
    (client.data as { user?: AuthUserContext }).user = user;
  }

  private getSocketUser(client: OrderTrackingSocket) {
    return (client.data as { user?: AuthUserContext }).user;
  }

  private async handleSocketRequest<T>(
    client: OrderTrackingSocket,
    handler: (user: AuthUserContext) => Promise<T>,
  ) {
    try {
      const user = this.getSocketUser(client);
      if (!user) {
        throw new UnauthorizedException('Socket is not authenticated');
      }

      const data = await handler(user);
      return { success: true, data };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Socket request failed';
      this.logger.warn(`Order tracking socket request failed: ${message}`);
      return {
        success: false,
        error: {
          code: 'ORDER_TRACKING_SOCKET_ERROR',
          message,
        },
      };
    }
  }
}
