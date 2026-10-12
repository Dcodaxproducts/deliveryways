import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';
import {
  RealtimeEventEnvelope,
  RealtimeEventName,
} from '../common/realtime/realtime-events';

export const REALTIME_OUTBOX_SESSION_FACTORY = Symbol(
  'REALTIME_OUTBOX_SESSION_FACTORY',
);

/** Fences the dispatcher: only the holder of this session-level lock drains the outbox. */
export const OUTBOX_ADVISORY_LOCK_KEY = 74193211;
export const OUTBOX_BATCH_SIZE = 50;
/** Aggregates (orders/threads) delivered concurrently; events of one aggregate stay serial. */
export const OUTBOX_DELIVERY_CONCURRENCY = 8;
/** Consecutive dispatch cycles with a systemic delivery/database failure before readiness fails. */
export const OUTBOX_MAX_FAILED_CYCLES = 10;
/** Exponential retry backoff per failing aggregate: 1s, 2s, 4s ... capped indefinitely. */
export const OUTBOX_RETRY_BASE_MS = 1_000;
export const OUTBOX_RETRY_MAX_MS = 60_000;
/** A pending row this old makes readiness fail even when no retry is currently in memory. */
export const OUTBOX_BACKLOG_MAX_AGE_MS = 5 * 60_000;
/** Distinct aggregates failing in one cycle with no delivery at all marks the cycle systemic. */
export const OUTBOX_SYSTEMIC_AGGREGATES = 2;
/** A lease observation older than this no longer counts as verified. */
export const OUTBOX_LEASE_STALE_MS = 10_000;
const LEASE_VERIFY_MS = 2_000;
const MAX_EVENT_BYTES = 64 * 1024;
const POLL_INTERVAL_MS = 250;
const RETRY_INTERVAL_MS = 1_000;
const RETENTION_MS = 7 * 86_400_000;
const RETENTION_SWEEP_MS = 60_000;
const RETENTION_SWEEP_LIMIT = 1_000;
const STATS_INTERVAL_MS = 5_000;

/** Minimal dedicated-session surface (satisfied by `pg.Client`). */
export interface OutboxSession {
  connect(): Promise<unknown>;
  query<R = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: R[] }>;
  on(event: 'error' | 'end', listener: () => void): unknown;
  end(): Promise<void>;
}
export type OutboxSessionFactory = () => OutboxSession;

type OutboxRow = {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_name: RealtimeEventName;
  payload: unknown;
  created_at: Date;
  attempts: number;
};
type CycleResult = {
  /** A delivery failed and remains pending for retry in this cycle. */
  failed: boolean;
  /** At least two aggregates failed and nothing was delivered: not a single poison row. */
  systemic: boolean;
  progressed: boolean;
  /** Nothing pending and nothing waiting out a retry backoff. */
  idle: boolean;
};
type Handler = (event: RealtimeEventEnvelope) => Promise<void> | void;
export type OutboxLeaseState = 'leader' | 'follower' | 'none';
export interface OutboxHealth {
  /** True only when the lease is verified and deliveries are not repeatedly failing. */
  ready: boolean;
  subscriberReady: boolean;
  sessionReady: boolean;
  leader: boolean;
  lease: { state: OutboxLeaseState; verifiedAt: string | null; fresh: boolean };
  delivery: {
    consecutiveFailedCycles: number;
    healthy: boolean;
    lastError: string | null;
  };
  /** Aggregates currently waiting out a retry backoff (their later events stay parked). */
  retrying: number;
  backlog: {
    pending: number;
    oldestPendingAt: string | null;
    refreshedAt: string;
    healthy: boolean;
    oldestAgeMs: number | null;
  } | null;
  published: number;
  dropped: number;
  failures: number;
}

@Injectable()
export class RealtimeOutboxDispatcherService implements OnApplicationShutdown {
  private readonly logger = new Logger(RealtimeOutboxDispatcherService.name);
  private readonly createSession: OutboxSessionFactory;
  private session: OutboxSession | null = null;
  private leader = false;
  private handler: Handler | null = null;
  private timer: NodeJS.Timeout | null = null;
  private inflight: Promise<void> = Promise.resolve();
  private stopped = false;
  private lastSweepAt = 0;
  private published = 0;
  private dropped = 0;
  private failures = 0;
  private consecutiveFailedCycles = 0;
  private systemicFailure = false;
  /** Aggregates waiting out a retry backoff; attempts remain persisted as telemetry. */
  private readonly retrying = new Map<string, number>();
  private backlog: OutboxHealth['backlog'] = null;
  private lastStatsAt = 0;
  private lastError: string | null = null;
  private leaseVerifiedAt = 0;
  private holderObserved = false;

  constructor(
    config: ConfigService,
    @Optional()
    @Inject(REALTIME_OUTBOX_SESSION_FACTORY)
    factory?: OutboxSessionFactory,
  ) {
    this.createSession =
      factory ??
      ((): OutboxSession =>
        new Client({
          connectionString: config.getOrThrow<string>('DATABASE_URL'),
          application_name: 'realtime-outbox-dispatcher',
        }) as unknown as OutboxSession);
  }

  subscribe(handler: Handler): Promise<void> {
    this.handler = handler;
    this.stopped = false;
    this.schedule(0);
    return Promise.resolve();
  }

  /** Runs one dispatch cycle; exposed so tests can drive the loop deterministically. */
  async tick(): Promise<boolean> {
    if (!this.handler || this.stopped) return false;
    try {
      if (!(await this.ensureLeadership())) return false;
      const cycle = await this.dispatchBatch(this.handler);
      if (cycle.progressed || cycle.idle) {
        this.systemicFailure = false;
        this.consecutiveFailedCycles = 0;
      } else if (cycle.systemic || this.systemicFailure) {
        // Cycles spent waiting out backoff during a systemic failure still count, so
        // retry backoff cannot hide an outage; an isolated poison row never gets here.
        this.systemicFailure = true;
        this.consecutiveFailedCycles += 1;
      }
      return !cycle.failed && !this.systemicFailure;
    } catch (error) {
      this.dropSession();
      this.consecutiveFailedCycles += 1;
      this.lastError = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn('Realtime outbox dispatch deferred: ' + this.lastError);
      return false;
    }
  }

  private schedule(delay: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.inflight = this.tick().then((ok) => {
        this.schedule(ok ? POLL_INTERVAL_MS : RETRY_INTERVAL_MS);
      });
    }, delay);
    this.timer.unref();
  }

  /**
   * The lock lives on one dedicated connection for as long as this process
   * leads. If the connection drops PostgreSQL releases the lock, so a stale
   * leader can no longer write (its session is gone) while another replica
   * takes over.
   */
  private async ensureLeadership(): Promise<boolean> {
    if (!this.session) {
      const session = this.createSession();
      const lost = (): void => {
        if (this.session === session) this.dropSession();
      };
      session.on('error', lost);
      session.on('end', lost);
      try {
        await session.connect();
      } catch (error) {
        await session.end().catch(() => undefined);
        throw error;
      }
      this.session = session;
      this.leader = false;
    }
    if (this.leader) return this.verifyLease(this.session);
    const result = await this.session.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock($1::bigint) AS acquired',
      [OUTBOX_ADVISORY_LOCK_KEY],
    );
    this.leader = result.rows[0]?.acquired === true;
    if (this.leader) {
      this.logger.log('Realtime outbox dispatcher is leader');
      this.leaseVerifiedAt = Date.now();
      this.holderObserved = true;
      return true;
    }
    // Follower: the lease is healthy only while some other session visibly holds it.
    this.holderObserved = await this.leaseHeld(this.session, false);
    if (this.holderObserved) this.leaseVerifiedAt = Date.now();
    return false;
  }

  /** Confirms in pg_locks that this very session still holds the lease before it keeps dispatching. */
  private async verifyLease(session: OutboxSession): Promise<boolean> {
    if (Date.now() - this.leaseVerifiedAt < LEASE_VERIFY_MS) return true;
    if (await this.leaseHeld(session, true)) {
      this.leaseVerifiedAt = Date.now();
      return true;
    }
    this.logger.warn('Realtime outbox lease lost; releasing session');
    this.holderObserved = false;
    this.dropSession();
    return false;
  }

  private async leaseHeld(
    session: OutboxSession,
    ownSession: boolean,
  ): Promise<boolean> {
    const result = await session.query<{ held: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND granted AND classid = $1::oid AND objid = $2::oid AND objsubid = 1 AND (pid = pg_backend_pid()) = $3::boolean) AS held",
      [
        Math.floor(OUTBOX_ADVISORY_LOCK_KEY / 2 ** 32),
        OUTBOX_ADVISORY_LOCK_KEY % 2 ** 32,
        ownSession,
      ],
    );
    return result.rows[0]?.held === true;
  }

  private async dispatchBatch(handler: Handler): Promise<CycleResult> {
    const session = this.session;
    if (!session)
      return { failed: true, systemic: false, progressed: false, idle: false };
    const now = Date.now();
    for (const [key, until] of this.retrying)
      if (until <= now) this.retrying.delete(key);
    // Aggregates in backoff are excluded as a whole so a later event never overtakes a
    // parked earlier one, and parked aggregates cannot fill the batch and starve the rest.
    const { rows } = await session.query<OutboxRow>(
      "SELECT id::text, aggregate_type, aggregate_id, event_name, payload, created_at, attempts FROM realtime_outbox_events WHERE published_at IS NULL AND (aggregate_type || ':' || aggregate_id) <> ALL($2::text[]) ORDER BY id LIMIT $1",
      [OUTBOX_BATCH_SIZE, [...this.retrying.keys()]],
    );
    // Rows of one aggregate form a serial queue (a failure parks its later events so
    // per-aggregate order survives replay); distinct aggregates run with bounded concurrency.
    const queues = new Map<string, OutboxRow[]>();
    for (const row of rows) {
      const aggregateKey = row.aggregate_type + ':' + row.aggregate_id;
      const queue = queues.get(aggregateKey);
      if (queue) queue.push(row);
      else queues.set(aggregateKey, [row]);
    }
    const pending = [...queues.entries()];
    const delivered: string[] = [];
    const failedAggregates = new Set<string>();
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (cursor < pending.length) {
        const [aggregateKey, queue] = pending[cursor++];
        for (const row of queue) {
          const outcome = await this.deliverRow(
            session,
            handler,
            aggregateKey,
            row,
          );
          if (outcome === 'delivered') delivered.push(row.id);
          else if (outcome === 'failed') {
            failedAggregates.add(aggregateKey);
            break;
          }
        }
      }
    };
    try {
      await Promise.all(
        Array.from(
          { length: Math.min(OUTBOX_DELIVERY_CONCURRENCY, pending.length) },
          worker,
        ),
      );
    } finally {
      // Only successfully delivered rows are marked; a crash before this point leaves them pending for replay.
      if (delivered.length > 0) {
        await session.query(
          'UPDATE realtime_outbox_events SET published_at = now(), attempts = attempts + 1, last_error = NULL WHERE id = ANY($1::bigint[]) AND published_at IS NULL',
          [delivered],
        );
        this.published += delivered.length;
      }
    }
    await this.refreshBacklog(session);
    await this.sweepRetention(session);
    return {
      failed: failedAggregates.size > 0,
      systemic:
        failedAggregates.size >= OUTBOX_SYSTEMIC_AGGREGATES &&
        delivered.length === 0,
      progressed: delivered.length > 0,
      idle: rows.length === 0 && this.retrying.size === 0,
    };
  }

  private async deliverRow(
    session: OutboxSession,
    handler: Handler,
    aggregateKey: string,
    row: OutboxRow,
  ): Promise<'delivered' | 'failed'> {
    const envelope: RealtimeEventEnvelope = {
      version: 2,
      eventId: row.id,
      aggregateKey,
      event: row.event_name,
      payload: row.payload,
      publishedAt: row.created_at.toISOString(),
    };
    if (Buffer.byteLength(JSON.stringify(envelope)) > MAX_EVENT_BYTES) {
      await this.recordFailure(
        session,
        row,
        aggregateKey,
        'payload exceeds 64KiB hard limit',
      );
      this.dropped += 1;
      return 'failed';
    }
    try {
      await handler(envelope);
      this.retrying.delete(aggregateKey);
      return 'delivered';
    } catch (error) {
      this.failures += 1;
      const message = (
        error instanceof Error ? error.message : 'delivery failed'
      ).slice(0, 1000);
      this.lastError = message;
      return this.recordFailure(session, row, aggregateKey, message);
    }
  }

  /**
   * Persists telemetry before retrying. Delivery failures never remove a row from
   * automatic dispatch; capped backoff continues until delivery or explicit obsolete resolution.
   */
  private async recordFailure(
    session: OutboxSession,
    row: OutboxRow,
    aggregateKey: string,
    message: string,
  ): Promise<'failed'> {
    const attempts = Math.min(row.attempts + 1, 2_147_483_647);
    this.logger.warn(
      'Realtime delivery failed for outbox ' +
        row.id +
        ' (attempt ' +
        attempts +
        '): ' +
        message,
    );
    await session.query(
      'UPDATE realtime_outbox_events SET attempts = $2, last_error = $3 WHERE id = $1::bigint AND published_at IS NULL',
      [row.id, attempts, message],
    );
    this.retrying.set(
      aggregateKey,
      Date.now() +
        Math.min(
          OUTBOX_RETRY_BASE_MS * 2 ** (attempts - 1),
          OUTBOX_RETRY_MAX_MS,
        ),
    );
    return 'failed';
  }

  /** Cheap periodic snapshot for health; it must never fail a dispatch cycle. */
  private async refreshBacklog(session: OutboxSession): Promise<void> {
    const now = Date.now();
    if (now - this.lastStatsAt < STATS_INTERVAL_MS) return;
    this.lastStatsAt = now;
    try {
      const { rows } = await session.query<{
        pending: string | number;
        oldest: Date | null;
      }>(
        'SELECT count(*) AS pending, min(created_at) AS oldest FROM realtime_outbox_events WHERE published_at IS NULL',
      );
      const stats = rows[0];
      if (!stats) return;
      const oldestAgeMs = stats.oldest
        ? Math.max(0, now - stats.oldest.getTime())
        : null;
      this.backlog = {
        pending: Number(stats.pending),
        oldestPendingAt: stats.oldest ? stats.oldest.toISOString() : null,
        refreshedAt: new Date(now).toISOString(),
        healthy:
          this.retrying.size === 0 &&
          (oldestAgeMs === null || oldestAgeMs <= OUTBOX_BACKLOG_MAX_AGE_MS),
        oldestAgeMs,
      };
    } catch (error) {
      this.logger.warn(
        'Realtime outbox stats refresh failed: ' +
          (error instanceof Error ? error.message : 'unknown error'),
      );
    }
  }

  private async sweepRetention(session: OutboxSession): Promise<void> {
    const now = Date.now();
    if (now - this.lastSweepAt < RETENTION_SWEEP_MS) return;
    this.lastSweepAt = now;
    await session
      .query(
        'DELETE FROM realtime_outbox_events WHERE id IN (SELECT id FROM realtime_outbox_events WHERE published_at < $1 ORDER BY published_at LIMIT $2)',
        [new Date(now - RETENTION_MS), RETENTION_SWEEP_LIMIT],
      )
      .catch((error: Error) =>
        this.logger.warn(
          'Realtime outbox retention sweep failed: ' + error.message,
        ),
      );
  }

  private dropSession(): void {
    const session = this.session;
    this.session = null;
    this.leader = false;
    this.holderObserved = false;
    // A new leader starts clean; persisted attempts remain useful telemetry.
    this.retrying.clear();
    this.systemicFailure = false;
    if (session) void session.end().catch(() => undefined);
  }

  getHealth(): OutboxHealth {
    const subscriberReady = this.handler !== null && !this.stopped;
    const sessionReady = this.session !== null;
    const fresh =
      this.leaseVerifiedAt > 0 &&
      Date.now() - this.leaseVerifiedAt <= OUTBOX_LEASE_STALE_MS;
    const state: OutboxLeaseState = !sessionReady
      ? 'none'
      : this.leader
        ? 'leader'
        : this.holderObserved
          ? 'follower'
          : 'none';
    const deliveryHealthy =
      this.consecutiveFailedCycles < OUTBOX_MAX_FAILED_CYCLES;
    const backlogHealthy = this.backlog?.healthy !== false;
    return {
      ready:
        subscriberReady &&
        sessionReady &&
        fresh &&
        state !== 'none' &&
        deliveryHealthy &&
        backlogHealthy,
      subscriberReady,
      sessionReady,
      leader: this.leader,
      lease: {
        state,
        verifiedAt:
          this.leaseVerifiedAt > 0
            ? new Date(this.leaseVerifiedAt).toISOString()
            : null,
        fresh,
      },
      delivery: {
        consecutiveFailedCycles: this.consecutiveFailedCycles,
        healthy: deliveryHealthy,
        lastError: this.lastError,
      },
      retrying: [...this.retrying.values()].filter(
        (until) => until > Date.now(),
      ).length,
      backlog: this.backlog,
      published: this.published,
      dropped: this.dropped,
      failures: this.failures,
    };
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.inflight;
    const session = this.session;
    this.session = null;
    this.leader = false;
    // Closing the dedicated session releases the advisory lock for the next leader.
    if (session) await session.end().catch(() => undefined);
  }
}
