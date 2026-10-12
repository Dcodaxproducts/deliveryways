import {
  WinOrderAdmissionService,
  WinOrderRateLimitException,
} from './winorder-admission.service';

describe('WinOrderAdmissionService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('single-flights a poll and caps concurrent response followers', async () => {
    const service = new WinOrderAdmissionService();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const work = jest.fn(async () => {
      await gate;
      return { OrderList: { Order: ['order-1'] } };
    });

    const requests = Array.from({ length: 100 }, () =>
      service.executePoll('connection-1', work),
    );
    await Promise.resolve();
    expect(work).toHaveBeenCalledTimes(1);
    expect(service.getStats().inFlightPolls).toBe(1);

    release?.();
    const results = await Promise.allSettled(requests);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(4);
    expect(
      results.filter(
        (result) =>
          result.status === 'rejected' &&
          result.reason instanceof WinOrderRateLimitException,
      ),
    ).toHaveLength(96);
    expect(service.getStats().inFlightPolls).toBe(0);
  });

  it('returns deterministic retry timing after the per-connection poll limit', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const service = new WinOrderAdmissionService();
    for (let index = 0; index < 30; index += 1) {
      await service.executePoll('connection-1', () => Promise.resolve(index));
    }

    await expect(
      service.executePoll('connection-1', () => Promise.resolve(31)),
    ).rejects.toMatchObject({ retryAfterSeconds: 60 });
  });

  it('bounds rate maps under randomized unauthenticated traffic', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const service = new WinOrderAdmissionService();
    for (let index = 0; index < 10_000; index += 1) {
      service.admitPreAuthentication(
        {
          headers: {},
          ip: `198.51.${Math.floor(index / 256)}.${index % 256}`,
        },
        `Basic randomized-${index}`,
      );
    }

    const stats = service.getStats();
    expect(stats.networkRateKeys).toBeLessThanOrEqual(2_048);
    expect(stats.credentialRateKeys).toBeLessThanOrEqual(2_048);
  });
});
