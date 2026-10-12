import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createClient, type RedisClientType } from 'redis';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database';
import { RealtimeEventEnvelope, RealtimeEventName } from './realtime-events';

const MAX_EVENT_BYTES = 64 * 1024;
const STREAM_MAX_LENGTH = 100_000;
const MAX_DELIVERY_ATTEMPTS = 5;
type OutboxRow = {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_name: RealtimeEventName;
  payload: Prisma.JsonValue;
  created_at: Date;
};
type StreamEntry = { id: string; message: Record<string, string> };

@Injectable()
export class RealtimeEventBusService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(RealtimeEventBusService.name);
  private readonly redis: RedisClientType;
  private readonly stream: string;
  private readonly group: string;
  private readonly consumer = randomUUID();
  private dispatchTimer: NodeJS.Timeout | null = null;
  private consumeTimer: NodeJS.Timeout | null = null;
  private handler:
    | ((event: RealtimeEventEnvelope) => Promise<void> | void)
    | null = null;
  private dispatching = false;
  private consuming = false;
  private published = 0;
  private dropped = 0;
  private subscriberReady = false;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const url = config.get<string>('REDIS_URL', 'redis://redis:6379');
    this.stream = config.get<string>(
      'REALTIME_REDIS_STREAM',
      'deliveryways:realtime:v2',
    );
    this.group = config.get<string>(
      'REALTIME_REDIS_GROUP',
      'deliveryways-gateway-v2',
    );
    this.redis = createClient({
      url,
      socket: {
        reconnectStrategy: (retries) => Math.min(100 + retries * 250, 5_000),
      },
    });
    this.redis.on('error', (error: Error) =>
      this.logger.warn('Realtime Redis unavailable: ' + error.message),
    );
  }

  onModuleInit(): void {
    void this.redis
      .connect()
      .then(() => this.ensureGroup())
      .catch((error: Error) =>
        this.logger.warn(
          'Realtime transport will replay after Redis recovery: ' +
            error.message,
        ),
      );
    this.dispatchTimer = setInterval(() => void this.dispatchBatch(), 250);
    this.dispatchTimer.unref();
  }

  publish(event: RealtimeEventName, payload: unknown): void {
    // Compatibility no-op: database triggers are the sole, transactional publisher.
    void event;
    void payload;
  }

  async subscribe(
    handler: (event: RealtimeEventEnvelope) => Promise<void> | void,
  ): Promise<void> {
    this.handler = handler;
    await this.ensureGroup();
    this.subscriberReady = true;
    this.consumeTimer = setInterval(() => void this.consumeBatch(), 100);
    this.consumeTimer.unref();
    await this.consumeBatch();
  }

  private async ensureGroup(): Promise<void> {
    if (!this.redis.isReady) return;
    try {
      await this.redis.sendCommand([
        'XGROUP',
        'CREATE',
        this.stream,
        this.group,
        '0',
        'MKSTREAM',
      ]);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('BUSYGROUP'))
        throw error;
    }
  }

  private async dispatchBatch(): Promise<void> {
    if (this.dispatching || !this.redis.isReady) return;
    this.dispatching = true;
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const lock = await tx.$queryRawUnsafe<Array<{ acquired: boolean }>>(
            'SELECT pg_try_advisory_xact_lock(74193211) AS acquired',
          );
          if (!lock[0]?.acquired) return;
          const rows = await tx.$queryRawUnsafe<OutboxRow[]>(
            'SELECT id::text, aggregate_type, aggregate_id, event_name, payload, created_at FROM realtime_outbox_events WHERE published_at IS NULL AND failed_at IS NULL AND available_at <= now() ORDER BY created_at, id LIMIT 50 FOR UPDATE SKIP LOCKED',
          );
          for (const row of rows) {
            const envelope: RealtimeEventEnvelope = {
              version: 2,
              eventId: row.id,
              aggregateKey: row.aggregate_type + ':' + row.aggregate_id,
              event: row.event_name,
              payload: row.payload,
              publishedAt: row.created_at.toISOString(),
            };
            const serialized = JSON.stringify(envelope);
            if (Buffer.byteLength(serialized) > MAX_EVENT_BYTES) {
              await tx.realtimeOutboxEvent.update({
                where: { id: row.id },
                data: {
                  failedAt: new Date(),
                  lastError: 'payload exceeds 64KiB hard limit',
                },
              });
              this.dropped += 1;
              continue;
            }
            await this.redis.sendCommand([
              'XADD',
              this.stream,
              'MAXLEN',
              '~',
              String(STREAM_MAX_LENGTH),
              '*',
              'envelope',
              serialized,
            ]);
            await tx.realtimeOutboxEvent.update({
              where: { id: row.id },
              data: {
                publishedAt: new Date(),
                attempts: { increment: 1 },
                lastError: null,
              },
            });
            this.published += 1;
          }
        },
        { timeout: 5_000 },
      );
      await this.prisma.realtimeOutboxEvent.deleteMany({
        where: { publishedAt: { lt: new Date(Date.now() - 7 * 86_400_000) } },
      });
    } catch (error) {
      this.logger.warn(
        'Realtime outbox dispatch deferred: ' +
          (error instanceof Error ? error.message : 'unknown error'),
      );
    } finally {
      this.dispatching = false;
    }
  }

  private async consumeBatch(): Promise<void> {
    if (this.consuming || !this.redis.isReady || !this.handler) return;
    this.consuming = true;
    try {
      await this.ensureGroup();
      const claimedRaw = await this.redis.sendCommand([
        'XAUTOCLAIM',
        this.stream,
        this.group,
        this.consumer,
        '30000',
        '0-0',
        'COUNT',
        '100',
      ]);
      const raw = await this.redis.sendCommand([
        'XREADGROUP',
        'GROUP',
        this.group,
        this.consumer,
        'COUNT',
        '100',
        'STREAMS',
        this.stream,
        '>',
      ]);
      const entries = [
        ...this.parseClaimedEntries(claimedRaw),
        ...this.parseEntries(raw),
      ];
      const groups = new Map<string, StreamEntry[]>();
      for (const entry of entries) {
        const envelope = this.parseEnvelope(entry.message.envelope);
        if (!envelope) {
          await this.deadLetter(entry, 'malformed envelope');
          continue;
        }
        const list = groups.get(envelope.aggregateKey) ?? [];
        list.push(entry);
        groups.set(envelope.aggregateKey, list);
      }
      const queues = [...groups.values()];
      for (let offset = 0; offset < queues.length; offset += 16)
        await Promise.all(
          queues.slice(offset, offset + 16).map(async (queue) => {
            for (const entry of queue) await this.deliverEntry(entry);
          }),
        );
    } catch (error) {
      this.subscriberReady = false;
      this.logger.warn(
        'Realtime stream consume deferred: ' +
          (error instanceof Error ? error.message : 'unknown error'),
      );
    } finally {
      this.consuming = false;
      if (this.redis.isReady) this.subscriberReady = true;
    }
  }

  private async deliverEntry(entry: StreamEntry): Promise<void> {
    const envelope = this.parseEnvelope(entry.message.envelope);
    if (!envelope || !this.handler) return;
    const dedupeKey = this.stream + ':delivered:' + envelope.eventId;
    const fresh = await this.redis.set(dedupeKey, '1', {
      NX: true,
      EX: 86_400,
    });
    if (!fresh) {
      await this.ack(entry.id);
      return;
    }
    try {
      await this.handler(envelope);
      await this.ack(entry.id);
    } catch (error) {
      await this.redis.del(dedupeKey);
      const pending = await this.redis.sendCommand([
        'XPENDING',
        this.stream,
        this.group,
        entry.id,
        entry.id,
        '1',
      ]);
      if (this.readAttempts(pending) >= MAX_DELIVERY_ATTEMPTS)
        await this.deadLetter(
          entry,
          error instanceof Error ? error.message : 'delivery failed',
        );
      else
        await this.redis.sendCommand([
          'XCLAIM',
          this.stream,
          this.group,
          this.consumer,
          '100',
          entry.id,
        ]);
    }
  }

  private parseEnvelope(raw?: string): RealtimeEventEnvelope | null {
    if (!raw || Buffer.byteLength(raw) > MAX_EVENT_BYTES) return null;
    try {
      const value = JSON.parse(raw) as RealtimeEventEnvelope;
      return value.version === 2 &&
        typeof value.eventId === 'string' &&
        typeof value.aggregateKey === 'string' &&
        typeof value.event === 'string'
        ? value
        : null;
    } catch {
      return null;
    }
  }

  private parseClaimedEntries(raw: unknown): StreamEntry[] {
    if (!Array.isArray(raw) || !Array.isArray(raw[1])) return [];
    return this.parseRecords(raw[1]);
  }

  private parseEntries(raw: unknown): StreamEntry[] {
    if (!Array.isArray(raw)) return [];
    const result: StreamEntry[] = [];
    for (const stream of raw as unknown[][]) {
      const records = stream[1];
      if (!Array.isArray(records)) continue;
      result.push(...this.parseRecords(records));
    }
    return result;
  }

  private parseRecords(records: unknown[]): StreamEntry[] {
    const result: StreamEntry[] = [];
    for (const record of records as unknown[][]) {
      const fields = record[1];
      if (typeof record[0] !== 'string' || !Array.isArray(fields)) continue;
      const message: Record<string, string> = {};
      for (let i = 0; i < fields.length; i += 2) {
        if (
          typeof fields[i] === 'string' &&
          typeof fields[i + 1] === 'string'
        ) {
          message[fields[i] as string] = fields[i + 1] as string;
        }
      }
      result.push({ id: record[0], message });
    }
    return result;
  }
  private readAttempts(raw: unknown): number {
    return Array.isArray(raw) &&
      Array.isArray(raw[0]) &&
      typeof raw[0][3] === 'number'
      ? raw[0][3]
      : 1;
  }
  private async ack(id: string): Promise<void> {
    await this.redis.sendCommand(['XACK', this.stream, this.group, id]);
  }
  private async deadLetter(entry: StreamEntry, reason: string): Promise<void> {
    await this.redis.sendCommand([
      'XADD',
      this.stream + ':dead',
      'MAXLEN',
      '~',
      '1000',
      '*',
      'streamId',
      entry.id,
      'reason',
      reason.slice(0, 1000),
      'envelope',
      entry.message.envelope ?? '',
    ]);
    await this.ack(entry.id);
    this.dropped += 1;
  }
  getHealth(): {
    publisherReady: boolean;
    subscriberReady: boolean;
    published: number;
    dropped: number;
  } {
    return {
      publisherReady: this.redis.isReady,
      subscriberReady: this.subscriberReady,
      published: this.published,
      dropped: this.dropped,
    };
  }
  async onApplicationShutdown(): Promise<void> {
    if (this.dispatchTimer) clearInterval(this.dispatchTimer);
    if (this.consumeTimer) clearInterval(this.consumeTimer);
    if (this.redis.isOpen) await this.redis.quit();
  }
}
