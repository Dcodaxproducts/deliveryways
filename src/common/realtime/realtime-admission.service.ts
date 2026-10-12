import { Injectable } from '@nestjs/common';
import type { Socket } from 'socket.io';
import { trustedNetworkKey } from './bounded-socket-io.adapter';

type AttemptWindow = {
  count: number;
  resetAt: number;
};

export type RealtimeAdmissionResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

const ATTEMPT_WINDOW_MS = 10_000;
const ATTEMPTS_PER_WINDOW = 30;
const MAX_ACTIVE_PER_NETWORK = 20;
const MAX_ACTIVE_PER_USER = 6;
const MAX_ACTIVE_TOTAL = 2_000;
const MAX_ATTEMPT_KEYS = 2_048;

@Injectable()
export class RealtimeAdmissionService {
  private readonly attempts = new Map<string, AttemptWindow>();
  private readonly sockets = new Map<
    string,
    { networkKey: string; userKey?: string }
  >();
  private readonly networkActive = new Map<string, number>();
  private readonly userActive = new Map<string, number>();

  begin(socketKey: string, client: Socket): RealtimeAdmissionResult {
    this.release(socketKey);
    const now = Date.now();
    const networkKey = this.networkKey(client);
    const attempt = this.consumeAttempt(`network:${networkKey}`, now);
    if (!attempt.allowed) return attempt;

    if (
      this.sockets.size >= MAX_ACTIVE_TOTAL ||
      (this.networkActive.get(networkKey) ?? 0) >= MAX_ACTIVE_PER_NETWORK
    ) {
      return { allowed: false, retryAfterSeconds: 1 };
    }

    this.sockets.set(socketKey, { networkKey });
    this.increment(this.networkActive, networkKey);
    return { allowed: true };
  }

  bindUser(socketKey: string, userId: string): RealtimeAdmissionResult {
    const socket = this.sockets.get(socketKey);
    if (!socket) return { allowed: false, retryAfterSeconds: 1 };

    const userKey = userId.trim();
    if (!userKey) return { allowed: false, retryAfterSeconds: 1 };

    const attempt = this.consumeAttempt(`user:${userKey}`, Date.now());
    if (!attempt.allowed) return attempt;
    if ((this.userActive.get(userKey) ?? 0) >= MAX_ACTIVE_PER_USER) {
      return { allowed: false, retryAfterSeconds: 1 };
    }

    socket.userKey = userKey;
    this.increment(this.userActive, userKey);
    return { allowed: true };
  }

  release(socketKey: string): void {
    const socket = this.sockets.get(socketKey);
    if (!socket) return;

    this.sockets.delete(socketKey);
    this.decrement(this.networkActive, socket.networkKey);
    if (socket.userKey) this.decrement(this.userActive, socket.userKey);
  }

  getStats(): {
    activeSockets: number;
    networkKeys: number;
    userKeys: number;
    attemptKeys: number;
  } {
    return {
      activeSockets: this.sockets.size,
      networkKeys: this.networkActive.size,
      userKeys: this.userActive.size,
      attemptKeys: this.attempts.size,
    };
  }

  private consumeAttempt(
    networkKey: string,
    now: number,
  ): RealtimeAdmissionResult {
    let window = this.attempts.get(networkKey);
    if (!window || window.resetAt <= now) {
      if (!window && this.attempts.size >= MAX_ATTEMPT_KEYS) {
        this.pruneAttempts(now);
      }
      if (!window && this.attempts.size >= MAX_ATTEMPT_KEYS) {
        return { allowed: false, retryAfterSeconds: 1 };
      }
      window = { count: 0, resetAt: now + ATTEMPT_WINDOW_MS };
      this.attempts.set(networkKey, window);
    }

    if (window.count >= ATTEMPTS_PER_WINDOW) {
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

  private pruneAttempts(now: number): void {
    for (const [key, window] of this.attempts) {
      if (window.resetAt <= now) this.attempts.delete(key);
    }
  }

  private networkKey(client: Socket): string {
    return trustedNetworkKey({
      remoteAddress: client.handshake.address,
      headers: client.handshake.headers,
    });
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
