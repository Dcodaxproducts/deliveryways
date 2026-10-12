import {
  OUTBOX_DELIVERY_CONCURRENCY,
  OUTBOX_LEASE_STALE_MS,
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_MAX_FAILED_CYCLES,
  OUTBOX_RETRY_BASE_MS,
  OUTBOX_RETRY_MAX_MS,
  OutboxSession,
  RealtimeOutboxDispatcherService,
} from './realtime-outbox-dispatcher.service';

type Row = {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_name: string;
  payload: unknown;
  created_at: Date;
  attempts: number;
};

class FakeSession implements OutboxSession {
  acquire = true;
  ownLeaseHeld = true;
  foreignLeaseHeld = true;
  rows: Row[] = [];
  published: string[] = [];
  /** Ids of rows that got a persisted failed attempt (still retryable). */
  failedRecords: string[] = [];
  /** Ids of rows dead-lettered (failed_at set). */
  dead: string[] = [];
  exclusions: string[][] = [];
  markSql: string[] = [];
  /** Simulates the database going away (connection reset) for every query. */
  down = false;
  /** Simulates a crash/connection loss exactly when delivered rows are marked published. */
  failMarks = false;
  ended = false;
  /** Simulates the database failing exactly when a failed attempt is persisted. */
  failUpdates = false;
  updates: Array<{ id: string; attempts: number; error: string }> = [];
  private rowById(id: string): Row {
    const found = this.rows.find((candidate) => candidate.id === id);
    if (!found) throw new Error('unknown row ' + id);
    return found;
  }
  private listeners: Record<string, Array<() => void>> = {};
  connect = jest.fn(() => Promise.resolve());
  on(event: 'error' | 'end', listener: () => void): this {
    (this.listeners[event] ??= []).push(listener);
    return this;
  }
  end(): Promise<void> {
    this.ended = true;
    return Promise.resolve();
  }
  emit(event: 'error' | 'end'): void {
    this.listeners[event]?.forEach((listener) => listener());
  }
  query<R = Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
  ): Promise<{ rows: R[] }> {
    const reply = (rows: unknown[]): Promise<{ rows: R[] }> =>
      Promise.resolve({ rows: rows as R[] });
    if (this.down) return Promise.reject(new Error('connection terminated'));
    if (text.includes('pg_try_advisory_lock'))
      return reply([{ acquired: this.acquire }]);
    if (text.includes('pg_locks'))
      return reply([
        { held: values[2] ? this.ownLeaseHeld : this.foreignLeaseHeld },
      ]);
    if (text.startsWith('SELECT id::text')) {
      const excluded = values[1] as string[];
      this.exclusions.push(excluded);
      return reply(
        this.rows
          .filter(
            (candidate) =>
              !this.published.includes(candidate.id) &&
              !this.dead.includes(candidate.id) &&
              !excluded.includes(
                candidate.aggregate_type + ':' + candidate.aggregate_id,
              ),
          )
          .slice(0, values[0] as number),
      );
    }
    if (text.includes('count(*) FILTER'))
      return reply([
        {
          pending: this.rows.filter(
            (candidate) =>
              !this.published.includes(candidate.id) &&
              !this.dead.includes(candidate.id),
          ).length,
          dead: this.dead.length,
          oldest: new Date('2026-10-12T00:00:00Z'),
        },
      ]);
    if (text.includes('SET published_at = now(), attempts')) {
      if (this.failMarks)
        return Promise.reject(new Error('connection terminated'));
      this.markSql.push(text);
      this.published.push(...(values[0] as string[]));
    }
    if (text.includes('SET failed_at = now()')) {
      if (this.failUpdates)
        return Promise.reject(new Error('connection terminated'));
      this.dead.push(String(values[0]));
      this.updates.push({
        id: String(values[0]),
        attempts: values[1] as number,
        error: values[2] as string,
      });
      this.rowById(String(values[0])).attempts = values[1] as number;
    }
    if (text.includes('SET attempts = $2, last_error = $3')) {
      if (this.failUpdates)
        return Promise.reject(new Error('connection terminated'));
      this.failedRecords.push(String(values[0]));
      this.updates.push({
        id: String(values[0]),
        attempts: values[1] as number,
        error: values[2] as string,
      });
      this.rowById(String(values[0])).attempts = values[1] as number;
    }
    return reply([]);
  }
}

const row = (id: number, aggregate: string, event = 'order.updated'): Row => ({
  id: String(id),
  aggregate_type: 'order',
  aggregate_id: aggregate,
  event_name: event,
  payload: { id: aggregate },
  created_at: new Date('2026-10-12T00:00:00Z'),
  attempts: 0,
});

type Delivered = { eventId: string; aggregateKey: string };
type AnyHandler = (event: Delivered) => Promise<void> | void;
const newHandler = () => jest.fn<Promise<void> | void, [Delivered]>();

const make = <H extends AnyHandler = ReturnType<typeof newHandler>>(
  session: FakeSession,
  handler: H = newHandler() as unknown as H,
) => {
  const service = new RealtimeOutboxDispatcherService(
    { getOrThrow: () => 'postgres://unused' } as never,
    () => session,
  );
  void service.subscribe(handler);
  return { service, handler };
};

/** Hands out the given sessions in order, like successive reconnects to PostgreSQL. */
const makeReconnecting = <H extends AnyHandler = ReturnType<typeof newHandler>>(
  sessions: FakeSession[],
  handler: H = newHandler() as unknown as H,
) => {
  const queue = [...sessions];
  const service = new RealtimeOutboxDispatcherService(
    { getOrThrow: () => 'postgres://unused' } as never,
    () => queue.shift() ?? sessions[sessions.length - 1],
  );
  void service.subscribe(handler);
  return { service, handler };
};

describe('RealtimeOutboxDispatcherService', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-12T12:00:00Z') });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('is not ready before any lease is verified', () => {
    const { service } = make(new FakeSession());
    const health = service.getHealth();
    expect(health.ready).toBe(false);
    expect(health.lease.state).toBe('none');
  });

  it('is ready only after acquiring the PostgreSQL lease and reports leader', async () => {
    const session = new FakeSession();
    const { service } = make(session);
    await service.tick();
    const health = service.getHealth();
    expect(health.ready).toBe(true);
    expect(health.leader).toBe(true);
    expect(health.lease).toMatchObject({ state: 'leader', fresh: true });
  });

  it('re-verifies the lease in pg_locks and releases the session when it was lost', async () => {
    const session = new FakeSession();
    const { service } = make(session);
    await service.tick();
    jest.setSystemTime(Date.now() + 3_000);
    session.ownLeaseHeld = false;
    expect(await service.tick()).toBe(false);
    expect(session.ended).toBe(true);
    const health = service.getHealth();
    expect(health.leader).toBe(false);
    expect(health.ready).toBe(false);
  });

  it('does not dispatch as a follower but is ready while another session visibly holds the lease', async () => {
    const session = new FakeSession();
    session.acquire = false;
    const { service, handler } = make(session);
    session.rows = [row(1, 'a')];
    await service.tick();
    expect(handler).not.toHaveBeenCalled();
    const health = service.getHealth();
    expect(health.leader).toBe(false);
    expect(health.lease.state).toBe('follower');
    expect(health.ready).toBe(true);
  });

  it('is not ready as a follower when nobody holds the lease', async () => {
    const session = new FakeSession();
    session.acquire = false;
    session.foreignLeaseHeld = false;
    const { service } = make(session);
    await service.tick();
    expect(service.getHealth().ready).toBe(false);
  });

  it('is not ready when the lease observation goes stale', async () => {
    const session = new FakeSession();
    const { service } = make(session);
    await service.tick();
    jest.setSystemTime(Date.now() + OUTBOX_LEASE_STALE_MS + 1);
    const health = service.getHealth();
    expect(health.lease.fresh).toBe(false);
    expect(health.ready).toBe(false);
  });

  it('is not ready once the database session ends', async () => {
    const session = new FakeSession();
    const { service } = make(session);
    await service.tick();
    session.emit('end');
    expect(service.getHealth().ready).toBe(false);
  });

  it('fails readiness when several aggregates fail with no delivery at all, and recovers on progress', async () => {
    const session = new FakeSession();
    session.rows = [row(1, 'a'), row(2, 'b')];
    const handler = jest
      .fn()
      .mockRejectedValue(new Error('socket server down'));
    const { service } = make(session, handler);
    for (let i = 0; i < OUTBOX_MAX_FAILED_CYCLES - 1; i += 1) {
      await service.tick();
      jest.setSystemTime(Date.now() + 1_000);
    }
    expect(service.getHealth().ready).toBe(true);
    await service.tick();
    const failing = service.getHealth();
    expect(failing.ready).toBe(false);
    expect(failing.delivery).toMatchObject({
      healthy: false,
      consecutiveFailedCycles: OUTBOX_MAX_FAILED_CYCLES,
      lastError: 'socket server down',
    });
    expect(session.published).toEqual([]);

    handler.mockResolvedValue(undefined);
    jest.setSystemTime(Date.now() + OUTBOX_RETRY_MAX_MS);
    await service.tick();
    expect(service.getHealth().ready).toBe(true);
    expect(session.published.sort()).toEqual(['1', '2']);
  });

  it('counts cycles spent in backoff during a systemic failure so backoff cannot hide an outage', async () => {
    const session = new FakeSession();
    session.rows = [row(1, 'a'), row(2, 'b')];
    const handler = jest.fn().mockRejectedValue(new Error('redis down'));
    const { service } = make(session, handler);
    await service.tick();
    // No time passes: both aggregates are parked, nothing is attempted, cycles still count.
    for (let i = 0; i < OUTBOX_MAX_FAILED_CYCLES - 1; i += 1)
      expect(await service.tick()).toBe(false);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(service.getHealth().ready).toBe(false);
  });

  it('does not take the gateway out of rotation for a single poison aggregate', async () => {
    const session = new FakeSession();
    session.rows = [row(1, 'poison'), row(2, 'good')];
    const handler = jest.fn((event: { eventId: string }) =>
      event.eventId === '1'
        ? Promise.reject(new Error('cannot hydrate'))
        : Promise.resolve(),
    );
    const { service } = make(session, handler);
    await service.tick();
    expect(session.published).toEqual(['2']);
    for (let i = 0; i < OUTBOX_MAX_ATTEMPTS; i += 1) {
      jest.setSystemTime(Date.now() + OUTBOX_RETRY_MAX_MS);
      await service.tick();
      expect(service.getHealth().ready).toBe(true);
    }
  });

  it('keeps later events of a failed aggregate pending but delivers other aggregates', async () => {
    const session = new FakeSession();
    session.rows = [row(1, 'a'), row(2, 'a'), row(3, 'b')];
    const handler = jest.fn((event: { eventId: string }) =>
      event.eventId === '1'
        ? Promise.reject(new Error('boom'))
        : Promise.resolve(),
    );
    const { service } = make(session, handler);
    await service.tick();
    expect(handler.mock.calls.map((call) => call[0].eventId).sort()).toEqual([
      '1',
      '3',
    ]);
    expect(session.published).toEqual(['3']);
    // The failed aggregate is parked as a whole until its backoff elapses.
    handler.mockClear();
    await service.tick();
    expect(handler).not.toHaveBeenCalled();
    expect(session.exclusions.at(-1)).toEqual(['order:a']);
  });

  it('bounds concurrency across aggregates and keeps one aggregate serial', async () => {
    const session = new FakeSession();
    session.rows = [
      ...Array.from({ length: 40 }, (_, index) =>
        row(index + 1, 'agg-' + index),
      ),
      row(100, 'agg-0'),
      row(101, 'agg-0'),
    ];
    let inFlight = 0;
    let peak = 0;
    const sameAggregateInFlight = { agg0: 0, overlap: false };
    const handler = jest.fn(async (event: { aggregateKey: string }) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      if (event.aggregateKey === 'order:agg-0') {
        sameAggregateInFlight.agg0 += 1;
        if (sameAggregateInFlight.agg0 > 1)
          sameAggregateInFlight.overlap = true;
      }
      await new Promise<void>((resolve) => setImmediate(resolve));
      if (event.aggregateKey === 'order:agg-0') sameAggregateInFlight.agg0 -= 1;
      inFlight -= 1;
    });
    const { service } = make(session, handler);
    jest.useRealTimers();
    await service.tick();
    expect(handler).toHaveBeenCalledTimes(42);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(OUTBOX_DELIVERY_CONCURRENCY);
    expect(sameAggregateInFlight.overlap).toBe(false);
    expect(session.published).toHaveLength(42);
  });

  it('marks oversized payloads failed instead of delivering them', async () => {
    const session = new FakeSession();
    const big = row(1, 'a');
    big.payload = { blob: 'x'.repeat(70 * 1024) };
    session.rows = [big];
    const { service, handler } = make(session);
    await service.tick();
    expect(handler).not.toHaveBeenCalled();
    expect(service.getHealth().dropped).toBe(1);
    expect(session.dead).toEqual(['1']);
    expect(service.getHealth().deadLetter.last).toMatchObject({
      id: '1',
      error: 'payload exceeds 64KiB hard limit',
    });
  });

  describe('bounded retry and dead-letter', () => {
    const failing = (ids: string[]) =>
      jest.fn((event: { eventId: string }) =>
        ids.includes(event.eventId)
          ? Promise.reject(new Error('cannot hydrate order'))
          : Promise.resolve(),
      );

    it('backs off exponentially, capped, and persists every attempt', async () => {
      const session = new FakeSession();
      session.rows = [row(1, 'a')];
      const handler = failing(['1']);
      const { service } = make(session, handler);
      const delays: number[] = [];
      for (let attempt = 1; attempt < OUTBOX_MAX_ATTEMPTS; attempt += 1) {
        await service.tick();
        const delay = Math.min(
          OUTBOX_RETRY_BASE_MS * 2 ** (attempt - 1),
          OUTBOX_RETRY_MAX_MS,
        );
        delays.push(delay);
        expect(session.updates.at(-1)).toMatchObject({
          id: '1',
          attempts: attempt,
          error: 'cannot hydrate order',
        });
        // Just before the backoff elapses nothing is attempted...
        jest.setSystemTime(Date.now() + delay - 1);
        await service.tick();
        expect(handler).toHaveBeenCalledTimes(attempt);
        // ...and right at it the row is retried.
        jest.setSystemTime(Date.now() + 1);
      }
      expect(delays[0]).toBe(OUTBOX_RETRY_BASE_MS);
      expect(delays.at(-1)).toBe(OUTBOX_RETRY_MAX_MS);
      expect(delays.every((delay) => delay <= OUTBOX_RETRY_MAX_MS)).toBe(true);
    });

    it('dead-letters a poison row at the attempt limit, then stops retrying it', async () => {
      const session = new FakeSession();
      session.rows = [row(1, 'a')];
      const handler = failing(['1']);
      const { service } = make(session, handler);
      for (let attempt = 1; attempt <= OUTBOX_MAX_ATTEMPTS; attempt += 1) {
        await service.tick();
        jest.setSystemTime(Date.now() + OUTBOX_RETRY_MAX_MS);
      }
      expect(handler).toHaveBeenCalledTimes(OUTBOX_MAX_ATTEMPTS);
      expect(session.dead).toEqual(['1']);
      expect(session.updates.at(-1)).toMatchObject({
        attempts: OUTBOX_MAX_ATTEMPTS,
        error: 'cannot hydrate order',
      });
      expect(session.published).toEqual([]);

      await service.tick();
      expect(handler).toHaveBeenCalledTimes(OUTBOX_MAX_ATTEMPTS);
      const health = service.getHealth();
      expect(health.ready).toBe(true);
      expect(health.retrying).toBe(0);
      expect(health.deadLetter).toMatchObject({
        total: 1,
        sinceStart: 1,
        last: {
          id: '1',
          event: 'order.updated',
          aggregateKey: 'order:a',
          attempts: OUTBOX_MAX_ATTEMPTS,
          error: 'cannot hydrate order',
        },
      });
      expect(health.deadLetter.action).toContain('failed_at IS NOT NULL');
      expect(health.backlog).toMatchObject({ pending: 0 });
    });

    it('honours attempts persisted by a previous leader instead of restarting the budget', async () => {
      const session = new FakeSession();
      const used = row(1, 'a');
      used.attempts = OUTBOX_MAX_ATTEMPTS - 1;
      session.rows = [used];
      const { service, handler } = make(session, failing(['1']));
      await service.tick();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(session.dead).toEqual(['1']);
    });

    it('keeps per-aggregate order: later events wait for the earlier one and proceed once it is dead-lettered', async () => {
      const session = new FakeSession();
      session.rows = [row(1, 'a'), row(2, 'a'), row(3, 'b')];
      const handler = failing(['1']);
      const { service } = make(session, handler);
      const order: string[] = [];
      handler.mockImplementation((event: { eventId: string }) => {
        order.push(event.eventId);
        return event.eventId === '1'
          ? Promise.reject(new Error('cannot hydrate order'))
          : Promise.resolve();
      });
      for (let attempt = 1; attempt <= OUTBOX_MAX_ATTEMPTS; attempt += 1) {
        await service.tick();
        // While row 1 is retrying, row 2 of the same aggregate is never attempted.
        if (attempt < OUTBOX_MAX_ATTEMPTS)
          expect(session.published).toEqual(['3']);
        jest.setSystemTime(Date.now() + OUTBOX_RETRY_MAX_MS);
      }
      expect(order.filter((id) => id === '2')).toEqual(['2']);
      // Row 2 is only delivered after row 1 was attempted for the last time.
      expect(order.lastIndexOf('1')).toBeLessThan(order.indexOf('2'));
      expect(session.dead).toEqual(['1']);
      expect(session.published.sort()).toEqual(['2', '3']);
    });

    it('lets other aggregates progress while many poison aggregates are parked', async () => {
      const session = new FakeSession();
      const poison = Array.from({ length: 60 }, (_, index) =>
        row(index + 1, 'poison-' + index),
      );
      session.rows = [...poison, row(1000, 'healthy')];
      const handler = failing(poison.map((candidate) => candidate.id));
      const { service } = make(session, handler);
      // 60 poison aggregates exceed the 50-row batch, so the healthy one is only reached
      // once the parked aggregates are excluded from the next query.
      await service.tick();
      expect(session.published).toEqual([]);
      await service.tick();
      expect(session.published).toEqual(['1000']);
    });

    it('does not retry forever when the failed attempt cannot be persisted: the session is dropped', async () => {
      const session = new FakeSession();
      session.rows = [row(1, 'a')];
      session.failUpdates = true;
      const { service } = make(session, failing(['1']));
      expect(await service.tick()).toBe(false);
      expect(session.ended).toBe(true);
      expect(service.getHealth()).toMatchObject({
        ready: false,
        sessionReady: false,
      });
    });

    it('starts a new leader clean: backoff is in memory, the persisted attempts remain', async () => {
      const first = new FakeSession();
      first.rows = [row(1, 'a')];
      const second = new FakeSession();
      second.rows = first.rows;
      const handler = failing(['1']);
      const { service } = makeReconnecting([first, second], handler);
      await service.tick();
      expect(service.getHealth().retrying).toBe(1);
      first.emit('end');
      expect(service.getHealth().retrying).toBe(0);
      await service.tick();
      expect(handler).toHaveBeenCalledTimes(2);
      expect(second.rows[0].attempts).toBe(2);
    });
  });
  describe('crash replay and duplicate idempotency', () => {
    it('replays rows whose delivery was never marked, with the same stable event ids', async () => {
      const crashed = new FakeSession();
      crashed.rows = [row(1, 'a'), row(2, 'b')];
      crashed.failMarks = true;
      const recovered = new FakeSession();
      recovered.rows = [row(1, 'a'), row(2, 'b')];
      const { service, handler } = makeReconnecting([crashed, recovered]);

      expect(await service.tick()).toBe(false);
      expect(crashed.published).toEqual([]);
      expect(crashed.ended).toBe(true);
      expect(service.getHealth().ready).toBe(false);

      expect(await service.tick()).toBe(true);
      expect(recovered.published.sort()).toEqual(['1', '2']);
      const events = handler.mock.calls.map(
        (call) => call[0] as { eventId: string; aggregateKey: string },
      );
      const delivered = (eventId: string) =>
        events.filter((event) => event.eventId === eventId);
      // At-least-once: each row was delivered before the crash and again after it, as the very same envelope.
      for (const id of ['1', '2']) {
        expect(delivered(id)).toHaveLength(2);
        expect(delivered(id)[1]).toEqual(delivered(id)[0]);
      }
      expect(service.getHealth().ready).toBe(true);
    });

    it('only marks rows that are still unpublished, so a duplicate mark is a no-op', async () => {
      const session = new FakeSession();
      session.rows = [row(1, 'a')];
      const { service } = make(session);
      await service.tick();
      expect(session.markSql).toHaveLength(1);
      expect(session.markSql[0]).toContain('AND published_at IS NULL');
    });

    it('does not mark a row whose delivery failed, so it is retried rather than lost', async () => {
      const session = new FakeSession();
      session.rows = [row(1, 'a'), row(2, 'b')];
      const handler = newHandler()
        .mockRejectedValueOnce(new Error('socket server not ready'))
        .mockResolvedValue(undefined);
      const { service } = make(session, handler);
      expect(await service.tick()).toBe(false);
      expect(session.published).toEqual(['2']);
      expect(session.failedRecords).toEqual(['1']);
      // Retried only once its backoff has elapsed.
      jest.setSystemTime(Date.now() + OUTBOX_RETRY_BASE_MS);
      expect(await service.tick()).toBe(true);
      expect(
        handler.mock.calls.filter(([event]) => event.eventId === '1'),
      ).toHaveLength(2);
      expect(session.published).toEqual(['2', '1']);
    });
  });

  describe('PostgreSQL outage', () => {
    it('goes unready when the database disappears and recovers on a fresh session', async () => {
      const first = new FakeSession();
      const second = new FakeSession();
      const { service } = makeReconnecting([first, second]);
      await service.tick();
      expect(service.getHealth().ready).toBe(true);

      first.down = true;
      jest.setSystemTime(Date.now() + 3_000);
      expect(await service.tick()).toBe(false);
      const outage = service.getHealth();
      expect(outage.ready).toBe(false);
      expect(outage.sessionReady).toBe(false);
      expect(outage.leader).toBe(false);
      expect(outage.delivery.lastError).toBe('connection terminated');

      expect(await service.tick()).toBe(true);
      expect(service.getHealth()).toMatchObject({ ready: true, leader: true });
    });

    it('stays unready and does not throw while connecting keeps failing', async () => {
      const unreachable = new FakeSession();
      unreachable.connect.mockRejectedValue(new Error('ECONNREFUSED'));
      const { service, handler } = makeReconnecting([unreachable]);
      for (let attempt = 0; attempt < OUTBOX_MAX_FAILED_CYCLES; attempt += 1) {
        expect(await service.tick()).toBe(false);
      }
      expect(handler).not.toHaveBeenCalled();
      const health = service.getHealth();
      expect(health.ready).toBe(false);
      expect(health.delivery.healthy).toBe(false);
      expect(unreachable.ended).toBe(true);
    });
  });
});
