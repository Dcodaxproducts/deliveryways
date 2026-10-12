import { INestApplicationContext, Logger } from '@nestjs/common';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient, type RedisClientType } from 'redis';
import type { Server, ServerOptions } from 'socket.io';
import { BoundedSocketIoAdapter } from '../common/realtime/bounded-socket-io.adapter';

export interface SocketIoAdapterHealth {
  pubReady: boolean;
  subReady: boolean;
}

/** Readiness surface of the Socket.IO transport; implemented by the Redis adapter. */
export interface SocketIoAdapterProbe {
  getHealth(): SocketIoAdapterHealth;
}

export class RedisBoundedSocketIoAdapter
  extends BoundedSocketIoAdapter
  implements SocketIoAdapterProbe
{
  private readonly logger = new Logger(RedisBoundedSocketIoAdapter.name);
  private readonly pubClient: RedisClientType;
  private readonly subClient: RedisClientType;

  constructor(app: INestApplicationContext, redisUrl: string) {
    super(app);
    this.pubClient = createClient({ url: redisUrl });
    this.subClient = this.pubClient.duplicate();
    const onError = (error: Error): void => {
      this.logger.warn('Socket.IO Redis adapter unavailable: ' + error.message);
    };
    this.pubClient.on('error', onError);
    this.subClient.on('error', onError);
  }

  async connect(): Promise<void> {
    await Promise.all([this.pubClient.connect(), this.subClient.connect()]);
  }

  createIOServer(port: number, options?: Partial<ServerOptions>): Server {
    const server = super.createIOServer(port, options);
    server.adapter(createAdapter(this.pubClient, this.subClient));
    return server;
  }

  /** Each client reports `isReady` live, so a reconnect recovers readiness without extra state. */
  getHealth(): SocketIoAdapterHealth {
    return {
      pubReady: this.pubClient.isReady,
      subReady: this.subClient.isReady,
    };
  }

  isReady(): boolean {
    const health = this.getHealth();
    return health.pubReady && health.subReady;
  }

  async close(): Promise<void> {
    if (this.subClient.isOpen) await this.subClient.quit();
    if (this.pubClient.isOpen) await this.pubClient.quit();
  }
}
