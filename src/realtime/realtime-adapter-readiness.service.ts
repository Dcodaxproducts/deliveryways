import { Injectable } from '@nestjs/common';
import type {
  SocketIoAdapterHealth,
  SocketIoAdapterProbe,
} from './redis-bounded-socket-io.adapter';

/**
 * The Socket.IO adapter is created after the Nest application (it needs the app
 * context), so the bootstrap registers it here. Until then readiness fails closed.
 */
@Injectable()
export class RealtimeAdapterReadinessService {
  private probe: SocketIoAdapterProbe | null = null;

  register(probe: SocketIoAdapterProbe): void {
    this.probe = probe;
  }

  getHealth(): SocketIoAdapterHealth & { registered: boolean; ready: boolean } {
    if (!this.probe) {
      return {
        registered: false,
        ready: false,
        pubReady: false,
        subReady: false,
      };
    }
    try {
      const health = this.probe.getHealth();
      return {
        registered: true,
        ready: health.pubReady && health.subReady,
        pubReady: health.pubReady,
        subReady: health.subReady,
      };
    } catch {
      return {
        registered: true,
        ready: false,
        pubReady: false,
        subReady: false,
      };
    }
  }
}
