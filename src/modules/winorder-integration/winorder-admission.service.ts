import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { trustedNetworkKey } from '../../common/realtime/bounded-socket-io.adapter';

type RateWindow = { count: number; resetAt: number };
type InFlightPoll = { promise: Promise<unknown>; followers: number };

type HttpRequestIdentity = {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
};

export type WinOrderAdmissionResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

const PRE_AUTH_WINDOW_MS = 60_000;
const PRE_AUTH_NETWORK_LIMIT = 120;
const PRE_AUTH_CREDENTIAL_LIMIT = 60;
const POLL_WINDOW_MS = 60_000;
const POLL_LIMIT = 30;
const MAX_RATE_KEYS = 2_048;
const MAX_IN_FLIGHT_POLLS = 256;
const MAX_POLL_FOLLOWERS = 3;

export class WinOrderRateLimitException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super('Too many WinOrder requests', HttpStatus.TOO_MANY_REQUESTS);
  }
}

@Injectable()
export class WinOrderAdmissionService {
  private readonly networkRates = new Map<string, RateWindow>();
  private readonly credentialRates = new Map<string, RateWindow>();
  private readonly pollRates = new Map<string, RateWindow>();
  private readonly inFlightPolls = new Map<string, InFlightPoll>();

  admitPreAuthentication(
    request: HttpRequestIdentity,
    credentialHeader: string,
  ): WinOrderAdmissionResult {
    const now = Date.now();
    const network = this.consume(
      this.networkRates,
      this.networkKey(request),
      PRE_AUTH_NETWORK_LIMIT,
      PRE_AUTH_WINDOW_MS,
      now,
    );
    if (!network.allowed) return network;

    return this.consume(
      this.credentialRates,
      this.digest(credentialHeader),
      PRE_AUTH_CREDENTIAL_LIMIT,
      PRE_AUTH_WINDOW_MS,
      now,
    );
  }

  async executePoll<T>(
    connectionId: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const rate = this.consume(
      this.pollRates,
      connectionId,
      POLL_LIMIT,
      POLL_WINDOW_MS,
      Date.now(),
    );
    if (!rate.allowed) {
      throw new WinOrderRateLimitException(rate.retryAfterSeconds);
    }

    const existing = this.inFlightPolls.get(connectionId);
    if (existing) {
      if (existing.followers >= MAX_POLL_FOLLOWERS) {
        throw new WinOrderRateLimitException(1);
      }
      existing.followers += 1;
      try {
        return (await existing.promise) as T;
      } finally {
        existing.followers -= 1;
      }
    }

    if (this.inFlightPolls.size >= MAX_IN_FLIGHT_POLLS) {
      throw new WinOrderRateLimitException(1);
    }

    const promise = Promise.resolve().then(work);
    const entry: InFlightPoll = { promise, followers: 0 };
    this.inFlightPolls.set(connectionId, entry);
    try {
      return await promise;
    } finally {
      if (this.inFlightPolls.get(connectionId) === entry) {
        this.inFlightPolls.delete(connectionId);
      }
    }
  }

  getStats(): {
    networkRateKeys: number;
    credentialRateKeys: number;
    pollRateKeys: number;
    inFlightPolls: number;
  } {
    return {
      networkRateKeys: this.networkRates.size,
      credentialRateKeys: this.credentialRates.size,
      pollRateKeys: this.pollRates.size,
      inFlightPolls: this.inFlightPolls.size,
    };
  }

  private consume(
    windows: Map<string, RateWindow>,
    key: string,
    limit: number,
    windowMs: number,
    now: number,
  ): WinOrderAdmissionResult {
    let window = windows.get(key);
    if (!window || window.resetAt <= now) {
      if (!window && windows.size >= MAX_RATE_KEYS) this.prune(windows, now);
      if (!window && windows.size >= MAX_RATE_KEYS) {
        return { allowed: false, retryAfterSeconds: 1 };
      }
      window = { count: 0, resetAt: now + windowMs };
      windows.set(key, window);
    }

    if (window.count >= limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((window.resetAt - now) / 1000),
        ),
      };
    }
    window.count += 1;
    return { allowed: true };
  }

  private prune(windows: Map<string, RateWindow>, now: number): void {
    for (const [key, window] of windows) {
      if (window.resetAt <= now) windows.delete(key);
    }
  }

  private networkKey(request: HttpRequestIdentity): string {
    return trustedNetworkKey({
      remoteAddress: request.socket?.remoteAddress ?? request.ip,
      headers: request.headers,
    });
  }

  private digest(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
