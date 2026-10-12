import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { isIP } from 'node:net';
import type {
  IncomingHttpHeaders,
  IncomingMessage,
  ServerResponse,
} from 'node:http';
import { Server, ServerOptions } from 'socket.io';

const ATTEMPT_WINDOW_MS = 10_000;
const NETWORK_ATTEMPTS_PER_WINDOW = 30;
const GLOBAL_ATTEMPTS_PER_WINDOW = 300;
const MAX_ATTEMPT_KEYS = 2_048;
const MAX_ACTIVE_PER_NETWORK = 20;
const MAX_ENGINE_SESSIONS = 512;
const PENDING_RESERVATION_MS = 10_000;
const MAX_FORWARDED_HEADER_BYTES = 1_024;
const MAX_FORWARDED_HOPS = 16;

const SOCKET_OPTIONS: Partial<ServerOptions> = {
  transports: ['polling', 'websocket'],
  allowUpgrades: true,
  maxHttpBufferSize: 64 * 1024,
  pingInterval: 25_000,
  pingTimeout: 20_000,
  upgradeTimeout: 10_000,
  connectTimeout: 10_000,
  perMessageDeflate: false,
  httpCompression: false,
};

type AttemptWindow = { count: number; resetAt: number };
type PendingReservation = { networkKey: string; expiresAt: number };
export type AdmissionOptions = {
  attemptWindowMs: number;
  networkAttemptsPerWindow: number;
  globalAttemptsPerWindow: number;
  maxAttemptKeys: number;
  maxActivePerNetwork: number;
  maxEngineSessions: number;
  pendingReservationMs: number;
};

export type EngineHandshakeAdmissionResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export type EngineHandshakeAdmissionStats = {
  activeSessions: number;
  activeNetworkKeys: number;
  attemptKeys: number;
  pendingReservations: number;
  pendingNetworkKeys: number;
};

type AddressSource = {
  remoteAddress?: string;
  headers: IncomingHttpHeaders;
};

type PreparedEngineRequest = IncomingMessage & {
  _query?: Record<string, string>;
};

type EngineSession = {
  request: IncomingMessage;
  once(event: 'close', listener: () => void): void;
};

type EngineConnectionError = { req: IncomingMessage };

const DEFAULT_ADMISSION_OPTIONS: AdmissionOptions = {
  attemptWindowMs: ATTEMPT_WINDOW_MS,
  networkAttemptsPerWindow: NETWORK_ATTEMPTS_PER_WINDOW,
  globalAttemptsPerWindow: GLOBAL_ATTEMPTS_PER_WINDOW,
  maxAttemptKeys: MAX_ATTEMPT_KEYS,
  maxActivePerNetwork: MAX_ACTIVE_PER_NETWORK,
  maxEngineSessions: MAX_ENGINE_SESSIONS,
  pendingReservationMs: PENDING_RESERVATION_MS,
};

export class EngineHandshakeAdmission {
  private readonly attempts = new Map<string, AttemptWindow>();
  private readonly activeByNetwork = new Map<string, number>();
  private readonly pendingByNetwork = new Map<string, number>();
  private readonly pending = new Map<number, PendingReservation>();
  private readonly requestReservations = new WeakMap<IncomingMessage, number>();
  private globalAttempts: AttemptWindow = { count: 0, resetAt: 0 };
  private activeSessions = 0;
  private reservationSequence = 0;

  constructor(
    private readonly options: AdmissionOptions = DEFAULT_ADMISSION_OPTIONS,
  ) {}

  admit(
    request: IncomingMessage,
    now = Date.now(),
  ): EngineHandshakeAdmissionResult {
    const globalAttempt = this.consumeGlobalAttempt(now);
    if (!globalAttempt.allowed) return globalAttempt;
    this.prune(now);

    const networkKey = trustedNetworkKey({
      remoteAddress: request.socket.remoteAddress,
      headers: request.headers,
    });
    const networkAttempt = this.consumeNetworkAttempt(networkKey, now);
    if (!networkAttempt.allowed) return networkAttempt;

    const pendingForNetwork = this.pendingByNetwork.get(networkKey) ?? 0;
    const activeForNetwork = this.activeByNetwork.get(networkKey) ?? 0;
    if (
      this.activeSessions + this.pending.size >=
        this.options.maxEngineSessions ||
      activeForNetwork + pendingForNetwork >= this.options.maxActivePerNetwork
    ) {
      return { allowed: false, retryAfterSeconds: 1 };
    }

    const reservationId = this.nextReservationId();
    this.pending.set(reservationId, {
      networkKey,
      expiresAt: now + this.options.pendingReservationMs,
    });
    this.requestReservations.set(request, reservationId);
    this.increment(this.pendingByNetwork, networkKey);
    return { allowed: true };
  }

  connected(request: IncomingMessage): (() => void) | null {
    const reservation = this.takeReservation(request);
    if (!reservation) return null;
    this.activeSessions += 1;
    this.increment(this.activeByNetwork, reservation.networkKey);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.activeSessions = Math.max(0, this.activeSessions - 1);
      this.decrement(this.activeByNetwork, reservation.networkKey);
    };
  }

  failed(request: IncomingMessage): void {
    this.takeReservation(request);
  }

  getStats(now = Date.now()): EngineHandshakeAdmissionStats {
    this.prune(now);
    return {
      activeSessions: this.activeSessions,
      activeNetworkKeys: this.activeByNetwork.size,
      attemptKeys: this.attempts.size,
      pendingReservations: this.pending.size,
      pendingNetworkKeys: this.pendingByNetwork.size,
    };
  }

  private consumeGlobalAttempt(now: number): EngineHandshakeAdmissionResult {
    if (this.globalAttempts.resetAt <= now) {
      this.globalAttempts = {
        count: 0,
        resetAt: now + this.options.attemptWindowMs,
      };
    }
    if (this.globalAttempts.count >= this.options.globalAttemptsPerWindow) {
      return this.retry(this.globalAttempts.resetAt, now);
    }
    this.globalAttempts.count += 1;
    return { allowed: true };
  }

  private consumeNetworkAttempt(
    networkKey: string,
    now: number,
  ): EngineHandshakeAdmissionResult {
    let attempt = this.attempts.get(networkKey);
    if (!attempt || attempt.resetAt <= now) {
      if (!attempt && this.attempts.size >= this.options.maxAttemptKeys) {
        return { allowed: false, retryAfterSeconds: 1 };
      }
      attempt = { count: 0, resetAt: now + this.options.attemptWindowMs };
      this.attempts.set(networkKey, attempt);
    }
    if (attempt.count >= this.options.networkAttemptsPerWindow) {
      return this.retry(attempt.resetAt, now);
    }
    attempt.count += 1;
    return { allowed: true };
  }

  private retry(resetAt: number, now: number): EngineHandshakeAdmissionResult {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1_000)),
    };
  }

  private prune(now: number): void {
    for (const [key, attempt] of this.attempts) {
      if (attempt.resetAt <= now) this.attempts.delete(key);
    }
    for (const [reservationId, reservation] of this.pending) {
      if (reservation.expiresAt > now) continue;
      this.pending.delete(reservationId);
      this.decrement(this.pendingByNetwork, reservation.networkKey);
    }
  }

  private takeReservation(
    request: IncomingMessage,
  ): PendingReservation | undefined {
    const reservationId = this.requestReservations.get(request);
    if (reservationId === undefined) return undefined;
    this.requestReservations.delete(request);
    const reservation = this.pending.get(reservationId);
    if (!reservation) return undefined;
    this.pending.delete(reservationId);
    this.decrement(this.pendingByNetwork, reservation.networkKey);
    return reservation;
  }

  private nextReservationId(): number {
    this.reservationSequence =
      (this.reservationSequence + 1) % Number.MAX_SAFE_INTEGER;
    return this.reservationSequence;
  }

  private increment(map: Map<string, number>, key: string): void {
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  private decrement(map: Map<string, number>, key: string): void {
    const next = (map.get(key) ?? 1) - 1;
    if (next <= 0) map.delete(key);
    else map.set(key, next);
  }
}

export function trustedNetworkKey(source: AddressSource): string {
  const peer = normalizeIp(source.remoteAddress) ?? 'unknown';
  let clientAddress = peer;
  const forwarded = forwardedAddresses(source.headers['x-forwarded-for']);

  if (isTrustedProxy(peer) && forwarded.length > 0) {
    const nearestForwarded = forwarded.at(-1) ?? peer;
    clientAddress = nearestForwarded;
    for (let index = forwarded.length - 1; index >= 0; index -= 1) {
      const candidate = forwarded[index];
      if (!isTrustedProxy(candidate)) {
        clientAddress = candidate;
        break;
      }
    }
  }
  return networkPrefix(clientAddress);
}

export class BoundedSocketIoAdapter extends IoAdapter {
  private readonly admission = new EngineHandshakeAdmission();

  constructor(app: INestApplicationContext) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, {
      ...options,
      ...SOCKET_OPTIONS,
    }) as Server;

    server.engine.use(
      (
        request: IncomingMessage,
        response: ServerResponse,
        next: (error?: Error) => void,
      ) => {
        const prepared = request as PreparedEngineRequest;
        if (prepared._query?.sid) {
          next();
          return;
        }
        const result = this.admission.admit(request);
        if (result.allowed) {
          next();
          return;
        }
        this.rejectHandshake(response, result.retryAfterSeconds);
      },
    );

    server.engine.on('connection', (session: EngineSession) => {
      const release = this.admission.connected(session.request);
      if (release) session.once('close', release);
    });
    server.engine.on('connection_error', ({ req }: EngineConnectionError) => {
      this.admission.failed(req);
    });
    return server;
  }

  private rejectHandshake(
    response: ServerResponse,
    retryAfterSeconds: number,
  ): void {
    const body = JSON.stringify({
      code: 'RATE_LIMITED',
      message: 'Too many realtime connection attempts',
      retryAfterSeconds,
    });
    response.statusCode = 429;
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Retry-After', String(retryAfterSeconds));
    response.end(body);
  }
}

function forwardedAddresses(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(',') : value;
  if (!raw || Buffer.byteLength(raw) > MAX_FORWARDED_HEADER_BYTES) return [];
  return raw
    .split(',')
    .slice(-MAX_FORWARDED_HOPS)
    .map((entry) => normalizeIp(entry.trim()))
    .filter((entry): entry is string => entry !== null);
}

function normalizeIp(value: string | undefined): string | null {
  if (!value) return null;
  const closingBracket = value.indexOf(']');
  const unwrapped =
    value.startsWith('[') && closingBracket > 0
      ? value.slice(1, closingBracket)
      : value;
  const zoneIndex = unwrapped.indexOf('%');
  const withoutZone =
    zoneIndex >= 0 ? unwrapped.slice(0, zoneIndex) : unwrapped;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(withoutZone);
  const normalized = mapped?.[1] ?? withoutZone.toLowerCase();
  return isIP(normalized) === 0 ? null : normalized;
}

function isTrustedProxy(address: string): boolean {
  if (isIP(address) === 4) {
    const octets = address.split('.').map(Number);
    return (
      octets[0] === 10 ||
      octets[0] === 127 ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168)
    );
  }
  return (
    address === '::1' ||
    address.startsWith('fc') ||
    address.startsWith('fd') ||
    /^fe[89ab]/.test(address)
  );
}

function networkPrefix(address: string): string {
  if (isIP(address) === 4) {
    const octets = address.split('.');
    return 'v4:' + octets[0] + '.' + octets[1] + '.' + octets[2] + '.0/24';
  }
  if (isIP(address) === 6) {
    return 'v6:' + expandIpv6(address).slice(0, 4).join(':') + '::/64';
  }
  return 'unknown';
}

function expandIpv6(address: string): string[] {
  const [left = '', right = ''] = address.split('::');
  const leftParts = left ? left.split(':') : [];
  const rightParts = right ? right.split(':') : [];
  const missing = Math.max(0, 8 - leftParts.length - rightParts.length);
  return [
    ...leftParts,
    ...Array.from({ length: missing }, () => '0'),
    ...rightParts,
  ].map((part) => part.padStart(4, '0'));
}
