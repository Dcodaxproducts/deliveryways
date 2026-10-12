import {
  createServer,
  request as httpRequest,
  IncomingMessage,
  Server as HttpServer,
} from 'node:http';
import { AddressInfo } from 'node:net';
import { io as createClient, Socket as ClientSocket } from 'socket.io-client';
import {
  AdmissionOptions,
  BoundedSocketIoAdapter,
  EngineRequestAdmission,
  trustedNetworkKey,
} from './bounded-socket-io.adapter';

const generousOptions: AdmissionOptions = {
  requestWindowMs: 10_000,
  networkRequestsPerWindow: 20_000,
  sessionRequestsPerWindow: 20_000,
  globalRequestsPerWindow: 20_000,
  maxNetworkRequestKeys: 2_048,
  maxInflightRequests: 20_000,
  maxInflightPerNetwork: 20_000,
  maxInflightPerSession: 3,
  maxActivePerNetwork: 20_000,
  maxEngineSessions: 20_000,
  pendingReservationMs: 10_000,
  requestLeaseMs: 50_000,
};

const engineRequest = (
  address: string,
  options: {
    sid?: string;
    forwardedFor?: string;
    transport?: 'polling' | 'websocket';
    method?: 'GET' | 'POST';
  } = {},
): IncomingMessage & { _query: Record<string, string> } => {
  const transport = options.transport ?? 'polling';
  const query: Record<string, string> = { EIO: '4', transport };
  if (options.sid) query.sid = options.sid;
  return {
    headers: options.forwardedFor
      ? { 'x-forwarded-for': options.forwardedFor }
      : {},
    method: options.method ?? 'GET',
    socket: { remoteAddress: address },
    url: '/socket.io/?' + new URLSearchParams(query).toString(),
    _query: query,
  } as unknown as IncomingMessage & { _query: Record<string, string> };
};

describe('EngineRequestAdmission', () => {
  it('bounds all request bookkeeping across 12,000 mixed handshakes', () => {
    const admission = new EngineRequestAdmission({
      ...generousOptions,
      maxNetworkRequestKeys: 512,
    });
    let accepted = 0;

    for (let index = 0; index < 12_000; index += 1) {
      const attempt = engineRequest(
        '198.' + (index % 200) + '.' + (index % 251) + '.' + (index % 253),
        { transport: index % 2 === 0 ? 'polling' : 'websocket' },
      );
      const result = admission.admit(attempt, () => false, 1_000);
      if (result.allowed) {
        accepted += 1;
        result.release();
        admission.failed(attempt);
      }
    }

    expect(accepted).toBeGreaterThan(0);
    expect(admission.getStats(1_000)).toMatchObject({
      activeSessions: 0,
      networkRequestKeys: 512,
      sessionRequestKeys: 0,
      pendingReservations: 0,
      pendingNetworkKeys: 0,
      inflightRequests: 0,
    });
  });

  it('admits every existing-session request and blocks duplicate long-polls without blocking upgrade', () => {
    const admission = new EngineRequestAdmission(generousOptions);
    const handshake = engineRequest('198.51.100.1');
    const admitted = admission.admit(handshake, () => false, 1_000);
    expect(admitted.allowed).toBe(true);
    if (!admitted.allowed) return;
    admitted.release();
    expect(admission.connected('validSid_1', handshake)).toBe(true);

    const firstPoll = engineRequest('198.51.100.2', { sid: 'validSid_1' });
    const duplicatePoll = engineRequest('198.51.100.3', {
      sid: 'validSid_1',
    });
    const upgrade = engineRequest('198.51.100.4', {
      sid: 'validSid_1',
      transport: 'websocket',
    });
    const first = admission.admit(firstPoll, () => true, 1_001);
    expect(first.allowed).toBe(true);
    expect(admission.admit(duplicatePoll, () => true, 1_001)).toMatchObject({
      allowed: false,
      statusCode: 429,
    });
    const upgradeResult = admission.admit(upgrade, () => true, 1_001);
    expect(upgradeResult.allowed).toBe(true);
    expect(admission.getStats(1_001)).toMatchObject({
      activeSessions: 1,
      inflightRequests: 2,
      pollingGets: 1,
      upgrades: 1,
    });
    admission.releaseSession('validSid_1');
    if (first.allowed) first.release();
    if (upgradeResult.allowed) upgradeResult.release();
    expect(admission.getStats(1_001)).toMatchObject({
      activeSessions: 0,
      inflightRequests: 0,
      pollingGets: 0,
      upgrades: 0,
    });
  });

  it('rejects unknown, stale, malformed, and network-spoofed session ids', () => {
    const admission = new EngineRequestAdmission(generousOptions);
    const handshake = engineRequest('172.18.0.2', {
      forwardedFor: '198.51.100.10',
    });
    const admitted = admission.admit(handshake, () => false, 1_000);
    expect(admitted.allowed).toBe(true);
    if (!admitted.allowed) return;
    admitted.release();
    expect(admission.connected('knownSid', handshake)).toBe(true);

    expect(
      admission.admit(
        engineRequest('172.18.0.2', {
          sid: 'unknownSid',
          forwardedFor: '198.51.100.10',
        }),
        () => false,
        1_001,
      ),
    ).toMatchObject({ allowed: false, statusCode: 400 });
    expect(
      admission.admit(
        engineRequest('172.18.0.2', {
          sid: 'knownSid',
          forwardedFor: '203.0.113.10',
        }),
        () => true,
        1_001,
      ),
    ).toMatchObject({ allowed: false, statusCode: 400 });
    expect(
      admission.admit(
        engineRequest('172.18.0.2', {
          sid: '../knownSid',
          forwardedFor: '198.51.100.10',
        }),
        () => true,
        1_001,
      ),
    ).toMatchObject({ allowed: false, statusCode: 400 });
    admission.releaseSession('knownSid');
    expect(
      admission.admit(
        engineRequest('172.18.0.2', {
          sid: 'knownSid',
          forwardedFor: '198.51.100.10',
        }),
        () => false,
        1_002,
      ),
    ).toMatchObject({ allowed: false, statusCode: 400 });
  });

  it('enforces lower process/network session caps and releases them on close', () => {
    const admission = new EngineRequestAdmission({
      ...generousOptions,
      maxActivePerNetwork: 2,
      maxEngineSessions: 3,
    });
    for (const [index, address] of [
      '198.51.100.1',
      '198.51.100.2',
      '198.51.101.1',
    ].entries()) {
      const attempt = engineRequest(address);
      const result = admission.admit(attempt, () => false, 1_000);
      expect(result.allowed).toBe(true);
      if (result.allowed) result.release();
      expect(admission.connected('sid' + index, attempt)).toBe(true);
    }

    expect(
      admission.admit(engineRequest('198.51.100.3'), () => false, 1_000),
    ).toMatchObject({ allowed: false, statusCode: 429 });
    expect(
      admission.admit(engineRequest('198.51.102.1'), () => false, 1_000),
    ).toMatchObject({ allowed: false, statusCode: 429 });
    admission.releaseSession('sid0');
    admission.releaseSession('sid1');
    admission.releaseSession('sid2');
    expect(admission.getStats(1_000)).toMatchObject({
      activeSessions: 0,
      activeNetworkKeys: 0,
    });
  });

  it('uses the nearest untrusted hop and ignores spoofed XFF from public peers', () => {
    expect(
      trustedNetworkKey({
        remoteAddress: '172.18.0.2',
        headers: { 'x-forwarded-for': '10.77.1.9, 198.51.100.27' },
      }),
    ).toBe('v4:198.51.100.0/24');
    expect(
      trustedNetworkKey({
        remoteAddress: '203.0.113.44',
        headers: { 'x-forwarded-for': '198.51.100.27' },
      }),
    ).toBe('v4:203.0.113.0/24');
  });
});

describe('BoundedSocketIoAdapter integration', () => {
  let httpServer: HttpServer;
  let adapter: BoundedSocketIoAdapter;
  let socketServer: ReturnType<BoundedSocketIoAdapter['createIOServer']>;
  let origin: string;
  let url: string;

  beforeEach(async () => {
    httpServer = createServer();
    adapter = new BoundedSocketIoAdapter(httpServer as never);
    socketServer = adapter.createIOServer(0);
    socketServer.of('/authorized').use((socket, next) => {
      if (socket.handshake.auth.token === 'test-token') next();
      else next(new Error('Unauthorized'));
    });
    await new Promise<void>((resolve) =>
      httpServer.listen(0, '127.0.0.1', resolve),
    );
    const address = httpServer.address() as AddressInfo;
    origin = 'http://127.0.0.1:' + address.port;
    url = origin + '/authorized';
  });

  afterEach(async () => {
    await socketServer.close();
    if (httpServer.listening) {
      await new Promise<void>((resolve, reject) =>
        httpServer.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('permits authorized polling and a concurrent websocket upgrade', async () => {
    const client = createClient(url, {
      auth: { token: 'test-token' },
      transports: ['polling', 'websocket'],
      upgrade: true,
      reconnection: false,
      timeout: 3_000,
    });
    await connected(client);
    await upgraded(client);
    expect(client.connected).toBe(true);
    expect(client.io.engine.transport.name).toBe('websocket');
    client.disconnect();
    await waitFor(() => adapter.getAdmissionStats().activeSessions === 0);
  });

  it('rejects duplicate concurrent polling GETs and then releases the session', async () => {
    const handshake = await engineCall(
      origin + '/socket.io/?EIO=4&transport=polling',
    );
    expect(handshake.statusCode).toBe(200);
    const sid = parseSid(handshake.body);
    const pollUrl =
      origin +
      '/socket.io/?EIO=4&transport=polling&sid=' +
      encodeURIComponent(sid);

    const longPoll = engineCall(pollUrl);
    await waitFor(() => adapter.getAdmissionStats().pollingGets === 1);
    await expect(engineCall(pollUrl)).resolves.toMatchObject({
      statusCode: 429,
      retryAfter: '1',
    });
    await engineCall(pollUrl, { method: 'POST', body: '1' });
    await longPoll;
    await waitFor(() => adapter.getAdmissionStats().activeSessions === 0);
    expect(adapter.getAdmissionStats()).toMatchObject({
      activeSessions: 0,
      pollingGets: 0,
      upgrades: 0,
      inflightRequests: 0,
    });
  });

  it('rejects unknown and spoofed sid requests before Engine.IO work', async () => {
    await expect(
      engineCall(origin + '/socket.io/?EIO=4&transport=polling&sid=unknownSid'),
    ).resolves.toMatchObject({ statusCode: 400 });

    const handshake = await engineCall(
      origin + '/socket.io/?EIO=4&transport=polling',
      { headers: { 'x-forwarded-for': '198.51.100.10' } },
    );
    const sid = parseSid(handshake.body);
    await expect(
      engineCall(
        origin +
          '/socket.io/?EIO=4&transport=polling&sid=' +
          encodeURIComponent(sid),
        { headers: { 'x-forwarded-for': '203.0.113.10' } },
      ),
    ).resolves.toMatchObject({ statusCode: 400 });
    await engineCall(
      origin +
        '/socket.io/?EIO=4&transport=polling&sid=' +
        encodeURIComponent(sid),
      {
        method: 'POST',
        body: '1',
        headers: { 'x-forwarded-for': '198.51.100.10' },
      },
    );
  });

  it('keeps authorized namespace behavior and rejects invalid auth', async () => {
    const authorized = createClient(url, {
      auth: { token: 'test-token' },
      transports: ['polling'],
      reconnection: false,
      timeout: 3_000,
    });
    await connected(authorized);
    expect(authorized.connected).toBe(true);
    authorized.disconnect();

    const invalid = createClient(url, {
      auth: { token: 'invalid' },
      transports: ['polling'],
      reconnection: false,
      timeout: 3_000,
    });
    const message = await new Promise<string>((resolve) => {
      invalid.once('connect_error', (error) => resolve(error.message));
    });
    expect(message).toBe('Unauthorized');
    invalid.disconnect();
  });
});

type EngineCallOptions = {
  method?: 'GET' | 'POST';
  body?: string;
  headers?: Record<string, string>;
};

function engineCall(
  endpoint: string,
  options: EngineCallOptions = {},
): Promise<{
  statusCode?: number;
  retryAfter?: string;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      endpoint,
      {
        method: options.method ?? 'GET',
        headers: {
          ...options.headers,
          ...(options.body
            ? {
                'content-type': 'text/plain;charset=UTF-8',
                'content-length': String(Buffer.byteLength(options.body)),
              }
            : {}),
        },
      },
      (response: IncomingMessage) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.once('end', () => {
          const retryAfterHeader: unknown = response.headers['retry-after'];
          resolve({
            statusCode: response.statusCode,
            retryAfter:
              typeof retryAfterHeader === 'string'
                ? retryAfterHeader
                : Array.isArray(retryAfterHeader) &&
                    typeof retryAfterHeader[0] === 'string'
                  ? retryAfterHeader[0]
                  : undefined,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    request.once('error', reject);
    if (options.body) request.write(options.body);
    request.end();
  });
}

function parseSid(body: string): string {
  const packet = body.startsWith('0') ? body.slice(1) : body;
  const parsed = JSON.parse(packet) as { sid?: unknown };
  if (typeof parsed.sid !== 'string') throw new Error('Missing Engine.IO sid');
  return parsed.sid;
}

function connected(client: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    client.once('connect', resolve);
    client.once('connect_error', reject);
  });
}

function upgraded(client: ClientSocket): Promise<void> {
  if (client.io.engine.transport.name === 'websocket') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Upgrade timed out')),
      3_000,
    );
    client.io.engine.once('upgrade', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Condition timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
