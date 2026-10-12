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
import type { Server, Socket } from 'socket.io';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { OrdersService } from '../../modules/orders/public-api';
import { RealtimeRooms } from '../../common/realtime/realtime-events';
import { RealtimeAdmissionService } from '../../common/realtime/realtime-admission.service';
import { CurrentSessionValidator } from '../../common/auth';

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
    private readonly currentSessionValidator: CurrentSessionValidator,
    private readonly ordersService: OrdersService,
    private readonly admission: RealtimeAdmissionService,
  ) {}

  async handleConnection(client: OrderTrackingSocket) {
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
      const adminOrdersRoom = this.getAdminOrdersRoom(user);
      if (adminOrdersRoom) {
        await client.join(adminOrdersRoom);
      }
    } catch {
      this.admission.release(socketKey);
      client.emit('order.tracking.error', {
        code: 'UNAUTHORIZED',
        message: 'Socket authentication failed',
      });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: OrderTrackingSocket) {
    this.admission.release(this.socketKey(client));
  }

  private socketKey(client: OrderTrackingSocket): string {
    return `orders:${client.id}`;
  }

  private rejectConnection(
    client: OrderTrackingSocket,
    retryAfterSeconds: number,
  ): void {
    this.admission.release(this.socketKey(client));
    client.emit('order.tracking.error', {
      code: 'RATE_LIMITED',
      message: 'Too many realtime connections',
      retryAfterSeconds,
    });
    client.disconnect(true);
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
      const room = RealtimeRooms.orderTracking(body.orderId);

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

      const room = RealtimeRooms.orderTracking(body.orderId);
      await client.leave(room);

      return {
        orderId: body.orderId,
        room,
      };
    });
  }

  @SubscribeMessage('order.admin.subscribe')
  async subscribeToAdminOrders(
    @ConnectedSocket() client: OrderTrackingSocket,
    @MessageBody() body: { restaurantId?: string; branchId?: string },
  ) {
    return this.handleSocketRequest(client, async (user) => {
      const scope = await this.ordersService.resolveRealtimeAdminOrderScope(
        user,
        body?.restaurantId,
        body?.branchId,
      );
      if (!scope) {
        throw new UnauthorizedException(
          'Administrative order scope is required',
        );
      }

      const room = scope.branchId
        ? RealtimeRooms.branchOrders(scope.restaurantId, scope.branchId)
        : RealtimeRooms.restaurantOrders(scope.restaurantId);
      await client.join(room);

      return { ...scope, room };
    });
  }

  @SubscribeMessage('orders.restaurant.subscribe')
  async subscribeToRestaurantOrdersAlias(
    @ConnectedSocket() client: OrderTrackingSocket,
    @MessageBody() body: { restaurantId?: string; branchId?: string },
  ) {
    return this.subscribeToAdminOrders(client, body);
  }

  private async authenticate(
    client: OrderTrackingSocket,
  ): Promise<AuthUserContext> {
    const token = this.extractToken(client);

    if (!token) {
      throw new UnauthorizedException('Missing access token');
    }

    const user = await this.jwtService.verifyAsync<AuthUserContext>(token);
    await this.currentSessionValidator.assertCurrentSession(user);
    return user;
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

  private getAdminOrdersRoom(user: AuthUserContext) {
    if (user.role === UserRoleEnum.BUSINESS_ADMIN && user.tid) {
      return RealtimeRooms.tenantOrders(user.tid);
    }

    if (user.role === UserRoleEnum.BRANCH_ADMIN && user.rid && user.bid) {
      return RealtimeRooms.branchOrders(user.rid, user.bid);
    }

    return null;
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

      try {
        await this.currentSessionValidator.assertCurrentSession(user);
      } catch (error) {
        client.emit('order.tracking.error', {
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
