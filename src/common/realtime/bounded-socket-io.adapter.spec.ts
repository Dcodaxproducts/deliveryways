import {
  createServer,
  get as httpGet,
  IncomingMessage,
  Server as HttpServer,
} from 'node:http';
import { AddressInfo } from 'node:net';
import { io as createClient, Socket as ClientSocket } from 'socket.io-client';
import {
  AdmissionOptions,
  BoundedSocketIoAdapter,
  EngineHandshakeAdmission,
  trustedNetworkKey,
} from './bounded-socket-io.adapter';

const generousOptions: AdmissionOptions = {
  attemptWindowMs: 10_000,
  networkAttemptsPerWindow: 20_000,
  globalAttemptsPerWindow: 20_000,
  maxAttemptKeys: 2_048,
  maxActivePerNetwork: 20_000,
  maxEngineSessions: 20_000,
  pendingReservationMs: 10_000,
};

const request = (
  address: string,
  forwardedFor?: string,
  transport: 'polling' | 'websocket' = 'polling',
): IncomingMessage =>
  ({
    headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
    socket: { remoteAddress: address },
    url: '/socket.io/?EIO=4&transport=' + transport,
  }) as unknown as IncomingMessage;

describe('EngineHandshakeAdmission', () => {
  it('bounds bookkeeping during 12,000 polling and websocket handshake attempts', () => {
    const admission = new EngineHandshakeAdmission(generousOptions);
    let accepted = 0;

    for (let index = 0; index < 12_000; index += 1) {
      const attempt = request(
        '198.' + (index % 200) + '.' + (index % 251) + '.' + (index % 253),
        undefined,
        index % 2 === 0 ? 'polling' : 'websocket',
      );
      if (admission.admit(attempt, 1_000).allowed) {
        accepted += 1;
        admission.failed(attempt);
      }
    }

    expect(accepted).toBeGreaterThan(0);
    expect(admission.getStats(1_000)).toEqual({
      activeSessions: 0,
      activeNetworkKeys: 0,
      attemptKeys: 2_048,
      pendingReservations: 0,
      pendingNetworkKeys: 0,
    });
  });

  it('uses the nearest untrusted hop behind nginx and ignores spoofed XFF prefixes', () => {
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
    expect(
      trustedNetworkKey({
        remoteAddress: '172.18.0.2',
        headers: { 'x-forwarded-for': '10.77.1.9, 192.168.2.25' },
      }),
    ).toBe('v4:192.168.2.0/24');
  });

  it('prunes attempt and pending maps while preserving hard caps', () => {
    const admission = new EngineHandshakeAdmission({
      ...generousOptions,
      attemptWindowMs: 100,
      maxAttemptKeys: 2,
      pendingReservationMs: 100,
    });
    const first = request('198.51.100.1');
    const second = request('198.51.101.1');
    const overflow = request('198.51.102.1');

    expect(admission.admit(first, 1_000)).toEqual({ allowed: true });
    expect(admission.admit(second, 1_000)).toEqual({ allowed: true });
    expect(admission.admit(overflow, 1_000)).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
    expect(admission.getStats(1_000).attemptKeys).toBe(2);
    expect(admission.getStats(1_101)).toMatchObject({
      attemptKeys: 0,
      pendingReservations: 0,
      pendingNetworkKeys: 0,
    });
    expect(admission.admit(overflow, 1_101)).toEqual({ allowed: true });
  });

  it('bounds active sessions by network and globally and releases on cleanup', () => {
    const admission = new EngineHandshakeAdmission({
      ...generousOptions,
      maxActivePerNetwork: 2,
      maxEngineSessions: 3,
    });
    const requests = [
      request('198.51.100.1'),
      request('198.51.100.2'),
      request('198.51.101.1'),
    ];
    const releases = requests.map((attempt) => {
      expect(admission.admit(attempt, 1_000)).toEqual({ allowed: true });
      return admission.connected(attempt);
    });

    expect(admission.admit(request('198.51.100.3'), 1_000)).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
    expect(admission.admit(request('198.51.102.1'), 1_000)).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
    expect(admission.getStats(1_000).activeSessions).toBe(3);
    releases.forEach((release) => release?.());
    releases.forEach((release) => release?.());
    expect(admission.getStats(1_000)).toMatchObject({
      activeSessions: 0,
      activeNetworkKeys: 0,
    });
  });

  it('enforces a global attempt budget before creating unbounded network keys', () => {
    const admission = new EngineHandshakeAdmission({
      ...generousOptions,
      globalAttemptsPerWindow: 3,
    });
    for (let index = 0; index < 3; index += 1) {
      const attempt = request('198.51.' + index + '.1');
      expect(admission.admit(attempt, 1_000)).toEqual({ allowed: true });
      admission.failed(attempt);
    }
    expect(admission.admit(request('203.0.113.1'), 1_000)).toEqual({
      allowed: false,
      retryAfterSeconds: 10,
    });
    expect(admission.getStats(1_000).attemptKeys).toBe(3);
  });
});

describe('BoundedSocketIoAdapter integration', () => {
  let httpServer: HttpServer;
  let adapter: BoundedSocketIoAdapter;
  let socketServer: ReturnType<BoundedSocketIoAdapter['createIOServer']>;
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
    url = 'http://127.0.0.1:' + address.port + '/authorized';
  });

  afterEach(async () => {
    await socketServer.close();
    if (httpServer.listening) {
      await new Promise<void>((resolve, reject) =>
        httpServer.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('permits authorized polling and then a websocket upgrade', async () => {
    const client = createClient(url, {
      auth: { token: 'test-token' },
      transports: ['polling', 'websocket'],
      upgrade: true,
      reconnection: false,
      timeout: 3_000,
    });
    await connected(client);
    expect(client.connected).toBe(true);
    await upgraded(client);
    expect(client.io.engine.transport.name).toBe('websocket');
    client.disconnect();
  });

  it('returns Retry-After on polling rejection before allocating another session', async () => {
    const endpoint = url.replace(
      '/authorized',
      '/socket.io/?EIO=4&transport=polling',
    );
    for (let index = 0; index < 20; index += 1) {
      await expect(poll(endpoint)).resolves.toMatchObject({ statusCode: 200 });
    }
    await expect(poll(endpoint)).resolves.toEqual({
      statusCode: 429,
      retryAfter: '1',
    });
  });

  it('rejects unauthorized namespace connections after bounded Engine.IO admission', async () => {
    const client = createClient(url, {
      auth: { token: 'invalid' },
      transports: ['polling'],
      reconnection: false,
      timeout: 3_000,
    });
    const message = await new Promise<string>((resolve) => {
      client.once('connect_error', (error) => resolve(error.message));
    });
    expect(message).toBe('Unauthorized');
    client.disconnect();
  });
});

function poll(
  endpoint: string,
): Promise<{ statusCode?: number; retryAfter?: string }> {
  return new Promise((resolve, reject) => {
    httpGet(endpoint, (response: IncomingMessage) => {
      response.resume();
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
        });
      });
    }).once('error', reject);
  });
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
