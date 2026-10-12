import { Injectable } from '@nestjs/common';
import { RealtimeEventName } from './realtime-events';

/**
 * Publisher-side facade shared by the API and realtime processes. Database
 * triggers write the transactional outbox, so publishing from application code
 * is a compatibility no-op. Draining the outbox is owned exclusively by the
 * isolated realtime process (see RealtimeOutboxDispatcherService).
 */
@Injectable()
export class RealtimeEventBusService {
  publish(event: RealtimeEventName, payload: unknown): void {
    void event;
    void payload;
  }
}
