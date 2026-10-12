import { createServer, request as httpRequest, Agent } from 'node:http';
import { AddressInfo } from 'node:net';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { io as createClient, Socket as ClientSocket } from 'socket.io-client';
import { WebSocket } from 'ws';
import {
  BoundedSocketIoAdapter,
  EngineRequestAdmissionStats,
} from '../src/common/realtime/bounded-socket-io.adapter';

const REQUEST_COUNT = Number(process.env.STRESS_REQUESTS ?? 50_000);
const RECONNECT_COUNT = Number(process.env.STRESS_RECONNECTS ?? 500);
const CONCURRENCY = Number(process.env.STRESS_CONCURRENCY ?? 128);
const MAX_HEAP_GROWTH = 32 * 1024 * 1024;
const MAX_RSS_GROWTH = 192 * 1024 * 1024;
const MAX_SECOND_WAVE_HEAP_GROWTH = 16 * 1024 * 1024;
const MAX_SECOND_WAVE_RSS_GROWTH = 64 * 1024 * 1024;
const MAX_EVENT_LOOP_P99_MS = 750;

if (!global.gc) {
  throw new Error('Run with node --expose-gc');
}

async function main(): Promise<void> {
  const httpServer = createServer();
  const adapter = new BoundedSocketIoAdapter(httpServer as never);
  const ioServer = adapter.createIOServer(0);
  ioServer.of('/authorized').use((socket, next) => {
    if (socket.handshake.auth.token === 'stress-token') next();
    else next(new Error('Unauthorized'));
  });
  ioServer.of('/authorized').on('connection', (socket) => {
    socket.on(
      'probe',
      (value: string, acknowledge: (reply: string) => void) => {
        acknowledge(value);
      },
    );
  });

  await new Promise<void>((resolve) =>
    httpServer.listen(0, '127.0.0.1', resolve),
  );
  const port = (httpServer.address() as AddressInfo).port;
  const origin = 'http://127.0.0.1:' + port;
  const agent = new Agent({ keepAlive: true, maxSockets: CONCURRENCY });
  const validClients: ClientSocket[] = [];
  const delay = monitorEventLoopDelay({ resolution: 20 });
  let maxStats = adapter.getAdmissionStats();
  const sampler = setInterval(() => {
    maxStats = maximumStats(maxStats, adapter.getAdmissionStats());
  }, 5);
  sampler.unref();

  try {
    for (let index = 0; index < 4; index += 1) {
      const client = createClient(origin + '/authorized', {
        auth: { token: 'stress-token' },
        transports: ['polling', 'websocket'],
        upgrade: true,
        reconnection: false,
        timeout: 3_000,
        extraHeaders: { 'x-forwarded-for': '198.51.100.' + (10 + index) },
      });
      await connected(client);
      await upgraded(client);
      validClients.push(client);
    }
    await assertValidClients(validClients);
    await exerciseDuplicatePoll(origin, agent);

    const reconnectResults = await runReconnectAttempts(
      origin,
      RECONNECT_COUNT,
    );
    if (reconnectResults.completed !== RECONNECT_COUNT) {
      throw new Error('Reconnect harness did not complete every attempt');
    }
    await sleep(10_100);
    await assertValidClients(validClients);

    forceGarbageCollection();
    await sleep(200);
    forceGarbageCollection();
    const before = process.memoryUsage();
    delay.enable();

    const packetStatsBefore = adapter.getPacketAdmissionStats();
    await runPacketAttack(origin);
    await assertValidClients(validClients);
    await waitFor(
      () => adapter.getPacketAdmissionStats().activeSessions === 4,
      5_000,
    );
    const packetStatsAfter = adapter.getPacketAdmissionStats();
    if (
      packetStatsAfter.rejectedSessions - packetStatsBefore.rejectedSessions !==
      16
    ) {
      throw new Error(
        'Packet admission did not close every abusive session: ' +
          JSON.stringify({ packetStatsBefore, packetStatsAfter }),
      );
    }

    const statuses = new Map<number, number>();
    const beforeAttackStats = adapter.getAdmissionStats();
    const attackStartedAt = Date.now();
    const firstWaveCount = Math.floor(REQUEST_COUNT / 2);
    await runRequestWave(origin, 0, firstWaveCount, statuses);
    await assertValidClients(validClients);
    await settleMemory();
    const afterFirstWave = process.memoryUsage();

    await runRequestWave(
      origin,
      firstWaveCount,
      REQUEST_COUNT - firstWaveCount,
      statuses,
    );
    await assertValidClients(validClients);
    await settleMemory();
    const after = process.memoryUsage();
    delay.disable();

    validClients.forEach((client) => client.disconnect());
    await waitFor(
      () => adapter.getAdmissionStats().activeSessions === 0,
      5_000,
    );
    const settled = adapter.getAdmissionStats();
    maxStats = maximumStats(maxStats, settled);
    const p99Ms = delay.percentile(99) / 1_000_000;
    const heapGrowth = after.heapUsed - before.heapUsed;
    const rssGrowth = after.rss - before.rss;
    const secondWaveHeapGrowth = after.heapUsed - afterFirstWave.heapUsed;
    const secondWaveRssGrowth = after.rss - afterFirstWave.rss;

    assertBounded(maxStats, settled);
    if (heapGrowth > MAX_HEAP_GROWTH) {
      throw new Error('Heap did not settle: +' + heapGrowth + ' bytes');
    }
    if (rssGrowth > MAX_RSS_GROWTH) {
      throw new Error('RSS exceeded bounded plateau: +' + rssGrowth + ' bytes');
    }
    if (secondWaveHeapGrowth > MAX_SECOND_WAVE_HEAP_GROWTH) {
      throw new Error(
        'Heap kept growing in second wave: +' + secondWaveHeapGrowth + ' bytes',
      );
    }
    if (secondWaveRssGrowth > MAX_SECOND_WAVE_RSS_GROWTH) {
      throw new Error(
        'RSS kept growing in second wave: +' + secondWaveRssGrowth + ' bytes',
      );
    }
    if (p99Ms > MAX_EVENT_LOOP_P99_MS) {
      throw new Error('Event-loop p99 exceeded bound: ' + p99Ms + ' ms');
    }
    if (
      (statuses.get(101) ?? 0) +
        (statuses.get(400) ?? 0) +
        (statuses.get(403) ?? 0) !==
      REQUEST_COUNT
    ) {
      throw new Error(
        'Direct WebSocket attempts did not complete cleanly: ' +
          JSON.stringify(Object.fromEntries(statuses)),
      );
    }
    const attackMiddlewareRequests =
      settled.middlewareRequests - beforeAttackStats.middlewareRequests;
    const attackEngineConnections =
      settled.engineConnections - beforeAttackStats.engineConnections;
    const attackAccepted =
      settled.freshHandshakeAccepted - beforeAttackStats.freshHandshakeAccepted;
    const attackElapsedMs = Date.now() - attackStartedAt;
    const attackAdmissionCap =
      Math.max(1, Math.ceil(attackElapsedMs / 10_000)) * 48;
    if (
      attackMiddlewareRequests !== 0 ||
      attackEngineConnections > attackAdmissionCap ||
      attackAccepted > attackAdmissionCap
    ) {
      throw new Error(
        'Fresh handshake work escaped pre-upgrade cap: ' +
          JSON.stringify({
            attackMiddlewareRequests,
            attackEngineConnections,
            attackAccepted,
            attackElapsedMs,
            attackAdmissionCap,
          }),
      );
    }
    await sleep(10_100);
    const cleaned = adapter.getAdmissionStats();
    if (
      cleaned.freshHandshakeKeys !== 0 ||
      cleaned.pendingReservations !== 0 ||
      cleaned.pendingNetworkKeys !== 0
    ) {
      throw new Error('Fresh handshake maps did not clean up');
    }

    process.stdout.write(
      JSON.stringify(
        {
          requests: REQUEST_COUNT,
          reconnectAttempts: reconnectResults.completed,
          reconnectAccepted: reconnectResults.accepted,
          statusCounts: Object.fromEntries(statuses),
          heapBefore: before.heapUsed,
          heapAfterFirstWave: afterFirstWave.heapUsed,
          heapAfter: after.heapUsed,
          heapGrowth,
          secondWaveHeapGrowth,
          rssBefore: before.rss,
          rssAfterFirstWave: afterFirstWave.rss,
          rssAfter: after.rss,
          rssGrowth,
          secondWaveRssGrowth,
          eventLoopP99Ms: Number(p99Ms.toFixed(2)),
          maxStats,
          attackMiddlewareRequests,
          attackEngineConnections,
          attackAccepted,
          attackElapsedMs,
          attackAdmissionCap,
          packetStatsBefore,
          packetStatsAfter,
          settledStats: cleaned,
          validClients: 4,
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    clearInterval(sampler);
    delay.disable();
    validClients.forEach((client) => client.disconnect());
    agent.destroy();
    await ioServer.close();
    if (httpServer.listening) {
      await new Promise<void>((resolve, reject) =>
        httpServer.close((error) => (error ? reject(error) : resolve())),
      );
    }
  }
}

async function runPacketAttack(origin: string): Promise<void> {
  const clients = Array.from({ length: 16 }, (_, index) =>
    createClient(origin + '/authorized', {
      auth: { token: 'stress-token' },
      transports: ['websocket'],
      reconnection: false,
      timeout: 3_000,
      extraHeaders: {
        'x-forwarded-for': '198.' + (30 + index) + '.1.2',
      },
    }),
  );
  try {
    await Promise.all(clients.map(connected));
    const disconnected = clients.map(
      (client) =>
        new Promise<void>((resolve) =>
          client.once('disconnect', () => resolve()),
        ),
    );
    for (const client of clients) {
      for (let packet = 0; packet < 512; packet += 1) {
        client.emit('amplify', packet);
      }
    }
    await Promise.all(disconnected);
  } finally {
    clients.forEach((client) => client.disconnect());
  }
}

async function runRequestWave(
  origin: string,
  start: number,
  count: number,
  statuses: Map<number, number>,
): Promise<void> {
  let cursor = start;
  const end = start + count;
  const workers = Array.from(
    { length: CONCURRENCY },
    async (): Promise<void> => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= end) return;
        const third = index % 256;
        const second = Math.floor(index / 256) % 200;
        const result = await directWebSocketAttempt(
          origin.replace('http://', 'ws://') +
            '/socket.io/?EIO=4&transport=websocket',
          { 'x-forwarded-for': '100.' + second + '.' + third + '.1' },
        );
        statuses.set(result, (statuses.get(result) ?? 0) + 1);
      }
    },
  );
  await Promise.all(workers);
}

async function settleMemory(): Promise<void> {
  await sleep(1_000);
  forceGarbageCollection();
  await sleep(500);
  forceGarbageCollection();
}

async function exerciseDuplicatePoll(
  origin: string,
  agent: Agent,
): Promise<void> {
  const headers = { 'x-forwarded-for': '203.0.113.25' };
  const handshake = await engineCallWithBody(
    origin + '/socket.io/?EIO=4&transport=polling',
    agent,
    headers,
  );
  if (handshake.statusCode !== 200) throw new Error('Polling handshake failed');
  const sid = parseSid(handshake.body);
  const endpoint =
    origin +
    '/socket.io/?EIO=4&transport=polling&sid=' +
    encodeURIComponent(sid);
  const first = engineCallWithBody(endpoint, agent, headers);
  await sleep(20);
  const duplicate = await engineCallWithBody(endpoint, agent, headers);
  if (duplicate.statusCode !== 429) {
    throw new Error('Duplicate polling GET was not rejected');
  }
  await engineCallWithBody(endpoint, agent, headers, 'POST', '1');
  await first;
}

async function runReconnectAttempts(
  origin: string,
  count: number,
): Promise<{ completed: number; accepted: number }> {
  let completed = 0;
  let accepted = 0;
  for (let offset = 0; offset < count; offset += 25) {
    const batch = Array.from(
      { length: Math.min(25, count - offset) },
      (_, index) =>
        new Promise<void>((resolve) => {
          const attempt = offset + index;
          const client = createClient(origin + '/authorized', {
            auth: { token: 'stress-token' },
            transports: ['websocket'],
            reconnection: false,
            timeout: 1_000,
            extraHeaders: {
              'x-forwarded-for':
                '198.' + (20 + (attempt % 180)) + '.' + (attempt % 250) + '.2',
            },
          });
          let settled = false;
          const finish = (didConnect: boolean): void => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (didConnect) accepted += 1;
            completed += 1;
            client.disconnect();
            resolve();
          };
          const timer = setTimeout(() => finish(false), 1_500);
          client.once('connect', () => finish(true));
          client.once('connect_error', () => finish(false));
        }),
    );
    await Promise.all(batch);
  }
  return { completed, accepted };
}

async function assertValidClients(clients: ClientSocket[]): Promise<void> {
  for (const client of clients) {
    if (!client.connected) throw new Error('Valid client disconnected');
    const reply = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Probe timed out')),
        2_000,
      );
      client.emit('probe', 'ok', (value: string) => {
        clearTimeout(timer);
        resolve(value);
      });
    });
    if (reply !== 'ok') throw new Error('Valid client probe failed');
  }
}

function assertBounded(
  maximum: EngineRequestAdmissionStats,
  settled: EngineRequestAdmissionStats,
): void {
  if (maximum.activeSessions > 32) throw new Error('Session cap exceeded');
  if (maximum.networkRequestKeys > 512)
    throw new Error('Network map cap exceeded');
  if (maximum.sessionRequestKeys > 32)
    throw new Error('Session map cap exceeded');
  if (maximum.pendingReservations > 32) throw new Error('Pending cap exceeded');
  if (maximum.inflightRequests > 192) throw new Error('Inflight cap exceeded');
  if (maximum.pollingGets > 32 || maximum.upgrades > 32) {
    throw new Error('Per-session operation maps exceeded session cap');
  }
  if (
    settled.activeSessions !== 0 ||
    settled.sessionRequestKeys !== 0 ||
    settled.pendingReservations !== 0 ||
    settled.inflightRequests !== 0 ||
    settled.pollingGets !== 0 ||
    settled.upgrades !== 0
  ) {
    throw new Error(
      'Admission state did not settle: ' + JSON.stringify(settled),
    );
  }
}

function maximumStats(
  left: EngineRequestAdmissionStats,
  right: EngineRequestAdmissionStats,
): EngineRequestAdmissionStats {
  return Object.fromEntries(
    Object.keys(left).map((key) => {
      const typedKey = key as keyof EngineRequestAdmissionStats;
      return [typedKey, Math.max(left[typedKey], right[typedKey])];
    }),
  ) as EngineRequestAdmissionStats;
}

function directWebSocketAttempt(
  endpoint: string,
  headers: Record<string, string>,
): Promise<number> {
  return new Promise((resolve) => {
    const socket = new WebSocket(endpoint, {
      headers,
      handshakeTimeout: 3_000,
    });
    let completed = false;
    const finish = (statusCode: number): void => {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      if (socket.readyState === WebSocket.OPEN) socket.close();
      else if (socket.readyState === WebSocket.CONNECTING) socket.terminate();
      resolve(statusCode);
    };
    const timer = setTimeout(() => finish(0), 5_000);
    socket.once('open', () => finish(101));
    socket.once('unexpected-response', (_request, response) => {
      response.resume();
      finish(response.statusCode ?? 0);
    });
    socket.once('error', () => finish(0));
    socket.once('close', () => finish(0));
  });
}

function engineCallWithBody(
  endpoint: string,
  agent: Agent,
  headers: Record<string, string>,
  method: 'GET' | 'POST' = 'GET',
  body?: string,
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      endpoint,
      {
        agent,
        method,
        headers: {
          ...headers,
          ...(body
            ? {
                'content-type': 'text/plain;charset=UTF-8',
                'content-length': String(Buffer.byteLength(body)),
              }
            : {}),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.once('end', () =>
          resolve({
            statusCode: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    request.once('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

function parseSid(body: string): string {
  const parsed = JSON.parse(body.startsWith('0') ? body.slice(1) : body) as {
    sid?: unknown;
  };
  if (typeof parsed.sid !== 'string') throw new Error('Missing sid');
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
    const timer = setTimeout(() => reject(new Error('Upgrade timeout')), 3_000);
    client.io.engine.once('upgrade', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Condition timed out');
    await sleep(20);
  }
}

function forceGarbageCollection(): void {
  const collect = global.gc;
  if (!collect) throw new Error('Garbage collector unavailable');
  collect();
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(message + '\n');
  process.exitCode = 1;
});
