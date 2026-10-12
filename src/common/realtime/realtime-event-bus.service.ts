import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type RedisClientType } from 'redis';
import {
  REALTIME_REDIS_CHANNEL,
  RealtimeEventEnvelope,
  RealtimeEventName,
} from './realtime-events';

const MAX_EVENT_BYTES = 256 * 1024;

@Injectable()
export class RealtimeEventBusService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(RealtimeEventBusService.name);
  private readonly channel: string;
  private readonly publisher: RedisClientType;
  private subscriber: RedisClientType | null = null;
  private subscriberReady = false;
  private published = 0;
  private dropped = 0;

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL', 'redis://redis:6379');
    this.channel = config.get<string>(
      'REALTIME_REDIS_CHANNEL',
      REALTIME_REDIS_CHANNEL,
    );
    this.publisher = createClient({
      url,
      socket: {
        reconnectStrategy: (retries) => Math.min(100 + retries * 250, 5_000),
      },
    });
    this.publisher.on('error', (error: Error) => {
      this.logger.warn(
        'Realtime Redis publisher unavailable: ' + error.message,
      );
    });
  }

  onModuleInit(): void {
    void this.publisher.connect().catch((error: Error) => {
      this.logger.warn(
        'Realtime Redis publisher will retry in background: ' + error.message,
      );
    });
  }

  publish(event: RealtimeEventName, payload: unknown): void {
    const envelope: RealtimeEventEnvelope = {
      version: 1,
      event,
      payload,
      publishedAt: new Date().toISOString(),
    };
    let serialized: string;
    try {
      serialized = JSON.stringify(envelope);
    } catch (error) {
      this.dropped += 1;
      this.logger.warn(
        'Dropped unserializable realtime event ' +
          event +
          ': ' +
          (error instanceof Error ? error.message : 'unknown error'),
      );
      return;
    }
    if (Buffer.byteLength(serialized) > MAX_EVENT_BYTES) {
      this.dropped += 1;
      this.logger.warn('Dropped oversized realtime event ' + event);
      return;
    }
    if (!this.publisher.isReady) {
      this.dropped += 1;
      return;
    }
    void this.publisher
      .publish(this.channel, serialized)
      .then(() => {
        this.published += 1;
      })
      .catch((error: Error) => {
        this.dropped += 1;
        this.logger.warn(
          'Realtime publish failed without affecting transaction: ' +
            error.message,
        );
      });
  }

  async subscribe(
    handler: (event: RealtimeEventEnvelope) => Promise<void> | void,
  ): Promise<void> {
    if (this.subscriber) return;
    this.subscriber = this.publisher.duplicate();
    this.subscriber.on('error', (error: Error) => {
      this.subscriberReady = false;
      this.logger.warn(
        'Realtime Redis subscriber unavailable: ' + error.message,
      );
    });
    this.subscriber.on('ready', () => {
      this.subscriberReady = true;
    });
    await this.subscriber.connect();
    await this.subscriber.subscribe(this.channel, (raw) => {
      if (Buffer.byteLength(raw) > MAX_EVENT_BYTES) return;
      try {
        const event = JSON.parse(raw) as RealtimeEventEnvelope;
        if (event.version !== 1 || typeof event.event !== 'string') return;
        void Promise.resolve(handler(event)).catch((error: Error) => {
          this.logger.warn('Realtime event delivery failed: ' + error.message);
        });
      } catch {
        this.logger.warn('Ignored malformed realtime Redis event');
      }
    });
    this.subscriberReady = true;
  }

  getHealth(): {
    publisherReady: boolean;
    subscriberReady: boolean;
    published: number;
    dropped: number;
  } {
    return {
      publisherReady: this.publisher.isReady,
      subscriberReady: this.subscriberReady,
      published: this.published,
      dropped: this.dropped,
    };
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.subscriber?.isOpen) await this.subscriber.quit();
    if (this.publisher.isOpen) await this.publisher.quit();
  }
}
