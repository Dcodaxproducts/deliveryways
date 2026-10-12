import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { RealtimeAdapterReadinessService } from './realtime-adapter-readiness.service';
import { RealtimeOutboxDispatcherService } from './realtime-outbox-dispatcher.service';

type ReadyBody = {
  status: 'ready' | 'not_ready';
  outbox: ReturnType<RealtimeOutboxDispatcherService['getHealth']>;
  adapter: ReturnType<RealtimeAdapterReadinessService['getHealth']>;
};

@Controller()
export class RealtimeHealthController {
  constructor(
    private readonly dispatcher: RealtimeOutboxDispatcherService,
    private readonly adapter: RealtimeAdapterReadinessService,
  ) {}

  @Get('health')
  health(): { status: 'ok'; process: 'realtime' } {
    return { status: 'ok', process: 'realtime' };
  }

  /**
   * Ready only when the PostgreSQL dispatcher lease is verified, deliveries are
   * not repeatedly failing, and both Socket.IO Redis adapter clients are ready.
   */
  @Get('ready')
  ready(): ReadyBody {
    const outbox = this.dispatcher.getHealth();
    const adapter = this.adapter.getHealth();
    if (!outbox.ready || !adapter.ready) {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        outbox,
        adapter,
      } satisfies ReadyBody);
    }
    return { status: 'ready', outbox, adapter };
  }
}
