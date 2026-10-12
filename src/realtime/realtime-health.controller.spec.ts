import { ServiceUnavailableException } from '@nestjs/common';
import { RealtimeAdapterReadinessService } from './realtime-adapter-readiness.service';
import { RealtimeHealthController } from './realtime-health.controller';
import { OutboxHealth } from './realtime-outbox-dispatcher.service';

const outboxHealth = (overrides: Partial<OutboxHealth> = {}): OutboxHealth => ({
  ready: true,
  subscriberReady: true,
  sessionReady: true,
  leader: true,
  lease: {
    state: 'leader',
    verifiedAt: new Date().toISOString(),
    fresh: true,
  },
  delivery: { consecutiveFailedCycles: 0, healthy: true, lastError: null },
  retrying: 0,
  deadLetter: { total: 0, sinceStart: 0, last: null, action: null },
  backlog: null,
  published: 0,
  dropped: 0,
  failures: 0,
  ...overrides,
});

const makeController = (
  outbox: OutboxHealth,
  probe?: { pubReady: boolean; subReady: boolean } | Error,
) => {
  const adapter = new RealtimeAdapterReadinessService();
  if (probe)
    adapter.register({
      getHealth: () => {
        if (probe instanceof Error) throw probe;
        return probe;
      },
    });
  return new RealtimeHealthController(
    { getHealth: () => outbox } as never,
    adapter,
  );
};

describe('RealtimeHealthController', () => {
  it('is ready only with a verified lease and both adapter clients ready', () => {
    const body = makeController(outboxHealth(), {
      pubReady: true,
      subReady: true,
    }).ready();
    expect(body.status).toBe('ready');
    expect(body.adapter).toMatchObject({ pubReady: true, subReady: true });
  });

  it.each([
    ['pub client down', { pubReady: false, subReady: true }],
    ['sub client down', { pubReady: true, subReady: false }],
    ['both clients down', { pubReady: false, subReady: false }],
  ])('is unavailable when the Redis adapter reports %s', (_name, probe) => {
    expect(() => makeController(outboxHealth(), probe).ready()).toThrow(
      ServiceUnavailableException,
    );
  });

  it('fails closed before the adapter is registered or when its probe throws', () => {
    expect(() => makeController(outboxHealth()).ready()).toThrow(
      ServiceUnavailableException,
    );
    expect(() =>
      makeController(outboxHealth(), new Error('redis exploded')).ready(),
    ).toThrow(ServiceUnavailableException);
  });

  it('is unavailable when the dispatcher is not ready (lease or repeated failures)', () => {
    const body = { pubReady: true, subReady: true };
    expect(() =>
      makeController(outboxHealth({ ready: false }), body).ready(),
    ).toThrow(ServiceUnavailableException);
  });

  it('exposes the lease, delivery and adapter detail in the 503 body', () => {
    try {
      makeController(
        outboxHealth({
          ready: false,
          delivery: {
            consecutiveFailedCycles: 12,
            healthy: false,
            lastError: 'boom',
          },
        }),
        { pubReady: true, subReady: false },
      ).ready();
      throw new Error('expected 503');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      const response = (error as ServiceUnavailableException).getResponse() as {
        outbox: OutboxHealth;
        adapter: { subReady: boolean };
      };
      expect(response.outbox.delivery.consecutiveFailedCycles).toBe(12);
      expect(response.adapter.subReady).toBe(false);
    }
  });

  it('keeps liveness independent of readiness', () => {
    expect(makeController(outboxHealth({ ready: false })).health()).toEqual({
      status: 'ok',
      process: 'realtime',
    });
  });
});
