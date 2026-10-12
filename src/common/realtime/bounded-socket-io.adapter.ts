import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { isIP } from 'node:net';
import type {
  IncomingHttpHeaders,
  IncomingMessage,
  ServerResponse,
} from 'node:http';
import { Server, ServerOptions } from 'socket.io';

const REQUEST_WINDOW_MS = 10_000;
const NETWORK_REQUESTS_PER_WINDOW = 160;
const SESSION_REQUESTS_PER_WINDOW = 40;
const GLOBAL_REQUESTS_PER_WINDOW = 1_200;
const MAX_NETWORK_REQUEST_KEYS = 512;
const MAX_INFLIGHT_REQUESTS = 192;
const MAX_INFLIGHT_PER_NETWORK = 24;
const MAX_INFLIGHT_PER_SESSION = 3;
const MAX_ACTIVE_PER_NETWORK = 8;
const MAX_ENGINE_SESSIONS = 96;
const PENDING_RESERVATION_MS = 10_000;
const REQUEST_LEASE_MS = 50_000;
const MAX_FORWARDED_HEADER_BYTES = 1_024;
const MAX_FORWARDED_HOPS = 16;
const MAX_SID_BYTES = 128;

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

type RequestWindow = { count: number; resetAt: number };
type PendingReservation = { networkKey: string; expiresAt: number };
type SessionState = {
  networkKey: string;
  requests: RequestWindow;
  inflight: number;
  pollingGetActive: boolean;
  upgradeActive: boolean;
  leases: Set<() => void>;
};
type RequestKind = 'handshake' | 'polling-get' | 'polling-post' | 'upgrade';

export type AdmissionOptions = {
  requestWindowMs: number;
  networkRequestsPerWindow: number;
  sessionRequestsPerWindow: number;
  globalRequestsPerWindow: number;
  maxNetworkRequestKeys: number;
  maxInflightRequests: number;
  maxInflightPerNetwork: number;
  maxInflightPerSession: number;
  maxActivePerNetwork: number;
  maxEngineSessions: number;
  pendingReservationMs: number;
  requestLeaseMs: number;
};

export type EngineRequestAdmissionResult =
  | { allowed: true; release: () => void }
  | {
      allowed: false;
      statusCode: 400 | 429;
      code: 'INVALID_SESSION' | 'RATE_LIMITED';
      retryAfterSeconds?: number;
    };

export type EngineRequestAdmissionStats = {
  activeSessions: number;
  activeNetworkKeys: number;
  networkRequestKeys: number;
  sessionRequestKeys: number;
  pendingReservations: number;
  pendingNetworkKeys: number;
  inflightRequests: number;
  inflightNetworkKeys: number;
  pollingGets: number;
  upgrades: number;
};

type AddressSource = {
  remoteAddress?: string;
  headers: IncomingHttpHeaders;
};

type PreparedEngineRequest = IncomingMessage & {
  _query?: Record<string, string>;
};

type EngineSession = {
  id: string;
  request: IncomingMessage;
  once(event: 'close' | 'error', listener: () => void): void;
  close(discard?: boolean): void;
};

type EngineConnectionError = { req: IncomingMessage };
type EngineWithClients = {
  clients: Record<string, unknown>;
};

const DEFAULT_ADMISSION_OPTIONS: AdmissionOptions = {
  requestWindowMs: REQUEST_WINDOW_MS,
  networkRequestsPerWindow: NETWORK_REQUESTS_PER_WINDOW,
  sessionRequestsPerWindow: SESSION_REQUESTS_PER_WINDOW,
  globalRequestsPerWindow: GLOBAL_REQUESTS_PER_WINDOW,
  maxNetworkRequestKeys: MAX_NETWORK_REQUEST_KEYS,
  maxInflightRequests: MAX_INFLIGHT_REQUESTS,
  maxInflightPerNetwork: MAX_INFLIGHT_PER_NETWORK,
  maxInflightPerSession: MAX_INFLIGHT_PER_SESSION,
  maxActivePerNetwork: MAX_ACTIVE_PER_NETWORK,
  maxEngineSessions: MAX_ENGINE_SESSIONS,
  pendingReservationMs: PENDING_RESERVATION_MS,
  requestLeaseMs: REQUEST_LEASE_MS,
};

export class EngineRequestAdmission {
  private readonly networkRequests = new Map<string, RequestWindow>();
  private readonly activeByNetwork = new Map<string, number>();
  private readonly pendingByNetwork = new Map<string, number>();
  private readonly inflightByNetwork = new Map<string, number>();
  private readonly pending = new Map<number, PendingReservation>();
  private readonly requestReservations = new WeakMap<IncomingMessage, number>();
  private readonly sessions = new Map<string, SessionState>();
  private globalRequests: RequestWindow = { count: 0, resetAt: 0 };
  private inflightRequests = 0;
  private reservationSequence = 0;

  constructor(
    private readonly options: AdmissionOptions = DEFAULT_ADMISSION_OPTIONS,
  ) {}

  admit(
    request: PreparedEngineRequest,
    engineHasSession: (sid: string) => boolean,
    now = Date.now(),
  ): EngineRequestAdmissionResult {
    this.prune(now);
    const query = request._query ?? this.queryFromUrl(request.url);
    const rawSid = query.sid;
    const sid = this.validSid(rawSid);
    const networkKey = trustedNetworkKey({
      remoteAddress: request.socket.remoteAddress,
      headers: request.headers,
    });
    const commonLimit = this.consumeCommonRequestBudgets(networkKey, now);
    if (commonLimit) return commonLimit;
    const kind = this.requestKind(
      request,
      query.transport,
      rawSid !== undefined,
    );
    if (!kind || (rawSid && !sid)) return this.invalidSession();

    if (sid) {
      const session = this.sessions.get(sid);
      if (
        !session ||
        !engineHasSession(sid) ||
        session.networkKey !== networkKey
      ) {
        return this.invalidSession();
      }
      const sessionLimit = this.consumeSessionRequestBudget(session, now);
      if (sessionLimit) return sessionLimit;
      if (
        session.inflight >= this.options.maxInflightPerSession ||
        (kind === 'polling-get' && session.pollingGetActive) ||
        (kind === 'upgrade' && session.upgradeActive)
      ) {
        return this.rateLimited(1);
      }
      return this.reserveRequest(networkKey, session, kind);
    }

    if (kind !== 'handshake') return this.invalidSession();
    const activeForNetwork = this.activeByNetwork.get(networkKey) ?? 0;
    const pendingForNetwork = this.pendingByNetwork.get(networkKey) ?? 0;
    if (
      this.sessions.size + this.pending.size >=
        this.options.maxEngineSessions ||
      activeForNetwork + pendingForNetwork >= this.options.maxActivePerNetwork
    ) {
      return this.rateLimited(1);
    }

    const reservationId = this.nextReservationId();
    this.pending.set(reservationId, {
      networkKey,
      expiresAt: now + this.options.pendingReservationMs,
    });
    this.requestReservations.set(request, reservationId);
    this.increment(this.pendingByNetwork, networkKey);
    return this.reserveRequest(networkKey, undefined, kind);
  }

  connected(sessionId: string, request: IncomingMessage): boolean {
    const reservation = this.takeReservation(request);
    if (!reservation || !this.validSid(sessionId)) return false;
    if (this.sessions.size >= this.options.maxEngineSessions) return false;

    this.sessions.set(sessionId, {
      networkKey: reservation.networkKey,
      requests: { count: 0, resetAt: 0 },
      inflight: 0,
      pollingGetActive: false,
      upgradeActive: false,
      leases: new Set(),
    });
    this.increment(this.activeByNetwork, reservation.networkKey);
    return true;
  }

  releaseSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sessions.delete(sessionId);
    for (const release of [...session.leases]) release();
    this.decrement(this.activeByNetwork, session.networkKey);
  }

  failed(request: IncomingMessage): void {
    this.takeReservation(request);
  }

  getStats(now = Date.now()): EngineRequestAdmissionStats {
    this.prune(now);
    let pollingGets = 0;
    let upgrades = 0;
    for (const session of this.sessions.values()) {
      if (session.pollingGetActive) pollingGets += 1;
      if (session.upgradeActive) upgrades += 1;
    }
    return {
      activeSessions: this.sessions.size,
      activeNetworkKeys: this.activeByNetwork.size,
      networkRequestKeys: this.networkRequests.size,
      sessionRequestKeys: this.sessions.size,
      pendingReservations: this.pending.size,
      pendingNetworkKeys: this.pendingByNetwork.size,
      inflightRequests: this.inflightRequests,
      inflightNetworkKeys: this.inflightByNetwork.size,
      pollingGets,
      upgrades,
    };
  }

  private consumeCommonRequestBudgets(
    networkKey: string,
    now: number,
  ): EngineRequestAdmissionResult | null {
    const global = this.consumeWindow(
      this.globalRequests,
      this.options.globalRequestsPerWindow,
      now,
    );
    if (global) return global;

    let network = this.networkRequests.get(networkKey);
    if (!network || network.resetAt <= now) {
      if (
        !network &&
        this.networkRequests.size >= this.options.maxNetworkRequestKeys
      ) {
        return this.rateLimited(1);
      }
      network = { count: 0, resetAt: now + this.options.requestWindowMs };
      this.networkRequests.set(networkKey, network);
    }
    const networkLimit = this.consumeWindow(
      network,
      this.options.networkRequestsPerWindow,
      now,
    );
    if (networkLimit) return networkLimit;

    if (
      this.inflightRequests >= this.options.maxInflightRequests ||
      (this.inflightByNetwork.get(networkKey) ?? 0) >=
        this.options.maxInflightPerNetwork
    ) {
      return this.rateLimited(1);
    }
    return null;
  }

  private consumeSessionRequestBudget(
    session: SessionState,
    now: number,
  ): EngineRequestAdmissionResult | null {
    if (session.requests.resetAt <= now) {
      session.requests = {
        count: 0,
        resetAt: now + this.options.requestWindowMs,
      };
    }
    return this.consumeWindow(
      session.requests,
      this.options.sessionRequestsPerWindow,
      now,
    );
  }

  private consumeWindow(
    window: RequestWindow,
    limit: number,
    now: number,
  ): EngineRequestAdmissionResult | null {
    if (window.resetAt <= now) {
      window.count = 0;
      window.resetAt = now + this.options.requestWindowMs;
    }
    if (window.count >= limit) {
      return this.rateLimited(
        Math.max(1, Math.ceil((window.resetAt - now) / 1_000)),
      );
    }
    window.count += 1;
    return null;
  }

  private reserveRequest(
    networkKey: string,
    session: SessionState | undefined,
    kind: RequestKind,
  ): EngineRequestAdmissionResult {
    this.inflightRequests += 1;
    this.increment(this.inflightByNetwork, networkKey);
    if (session) {
      session.inflight += 1;
      if (kind === 'polling-get') session.pollingGetActive = true;
      if (kind === 'upgrade') session.upgradeActive = true;
    }

    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      this.inflightRequests = Math.max(0, this.inflightRequests - 1);
      this.decrement(this.inflightByNetwork, networkKey);
      if (!session) return;
      session.leases.delete(release);
      session.inflight = Math.max(0, session.inflight - 1);
      if (kind === 'polling-get') session.pollingGetActive = false;
      if (kind === 'upgrade') session.upgradeActive = false;
    };
    if (session) session.leases.add(release);
    return { allowed: true, release };
  }

  private requestKind(
    request: IncomingMessage,
    transport: string | undefined,
    hasSid: boolean,
  ): RequestKind | null {
    if (transport === 'websocket') return hasSid ? 'upgrade' : 'handshake';
    if (transport !== 'polling') return null;
    if (!hasSid) return 'handshake';
    if (request.method === 'GET') return 'polling-get';
    if (request.method === 'POST') return 'polling-post';
    return null;
  }

  private validSid(value: string | undefined): string | null {
    if (!value || Buffer.byteLength(value) > MAX_SID_BYTES) return null;
    return /^[A-Za-z0-9_-]+$/.test(value) ? value : null;
  }

  private queryFromUrl(url: string | undefined): Record<string, string> {
    if (!url) return {};
    try {
      return Object.fromEntries(
        new URL(url, 'http://engine.local').searchParams,
      );
    } catch {
      return {};
    }
  }

  private invalidSession(): EngineRequestAdmissionResult {
    return { allowed: false, statusCode: 400, code: 'INVALID_SESSION' };
  }

  private rateLimited(retryAfterSeconds: number): EngineRequestAdmissionResult {
    return {
      allowed: false,
      statusCode: 429,
      code: 'RATE_LIMITED',
      retryAfterSeconds,
    };
  }

  private prune(now: number): void {
    for (const [key, window] of this.networkRequests) {
      if (window.resetAt <= now) this.networkRequests.delete(key);
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

export class BoundedSocketIoAdapter extends IoAdapter {
  private readonly admission: EngineRequestAdmission;
  private readonly requestLeaseMs: number;

  constructor(
    app: INestApplicationContext,
    options: AdmissionOptions = DEFAULT_ADMISSION_OPTIONS,
  ) {
    super(app);
    this.admission = new EngineRequestAdmission(options);
    this.requestLeaseMs = options.requestLeaseMs;
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, {
      ...options,
      ...SOCKET_OPTIONS,
    }) as Server;
    const engine = server.engine as unknown as EngineWithClients;

    server.engine.use(
      (
        request: IncomingMessage,
        response: ServerResponse,
        next: (error?: Error) => void,
      ) => {
        const result = this.admission.admit(
          request as PreparedEngineRequest,
          (sid) => Object.prototype.hasOwnProperty.call(engine.clients, sid),
        );
        if (!result.allowed) {
          this.rejectRequest(response, result);
          return;
        }
        this.releaseOnCompletion(request, response, result.release);
        next();
      },
    );

    server.engine.on('connection', (session: EngineSession) => {
      if (!this.admission.connected(session.id, session.request)) {
        session.close(true);
        return;
      }
      const release = (): void => this.admission.releaseSession(session.id);
      session.once('close', release);
      session.once('error', release);
    });
    server.engine.on('connection_error', ({ req }: EngineConnectionError) => {
      this.admission.failed(req);
    });
    return server;
  }

  getAdmissionStats(): EngineRequestAdmissionStats {
    return this.admission.getStats();
  }

  private releaseOnCompletion(
    request: IncomingMessage,
    response: ServerResponse,
    release: () => void,
  ): void {
    const timer = setTimeout(release, this.requestLeaseMs);
    timer.unref();
    const complete = (): void => {
      clearTimeout(timer);
      release();
    };
    const lifecycleResponse = response as ServerResponse & {
      once?: (event: 'finish' | 'close', listener: () => void) => void;
    };
    if (typeof lifecycleResponse.once === 'function') {
      lifecycleResponse.once('finish', complete);
      lifecycleResponse.once('close', complete);
      request.once('aborted', complete);
      return;
    }
    setImmediate(complete);
  }

  private rejectRequest(
    response: ServerResponse,
    result: Exclude<EngineRequestAdmissionResult, { allowed: true }>,
  ): void {
    const body = JSON.stringify({
      code: result.code,
      message:
        result.code === 'RATE_LIMITED'
          ? 'Too many realtime requests'
          : 'Invalid realtime session',
      ...(result.retryAfterSeconds
        ? { retryAfterSeconds: result.retryAfterSeconds }
        : {}),
    });
    response.statusCode = result.statusCode;
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    if (result.retryAfterSeconds) {
      response.setHeader('Retry-After', String(result.retryAfterSeconds));
    }
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
