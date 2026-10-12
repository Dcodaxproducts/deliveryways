import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { RealtimeEventBusService } from '../common/realtime/realtime-event-bus.service';

@Controller()
export class RealtimeHealthController {
  constructor(private readonly eventBus: RealtimeEventBusService) {}

  @Get('health')
  health(): { status: 'ok'; process: 'realtime' } {
    return { status: 'ok', process: 'realtime' };
  }

  @Get('ready')
  ready(): {
    status: 'ready';
    redis: ReturnType<RealtimeEventBusService['getHealth']>;
  } {
    const redis = this.eventBus.getHealth();
    if (!redis.publisherReady || !redis.subscriberReady) {
      throw new ServiceUnavailableException('Realtime Redis is not ready');
    }
    return { status: 'ready', redis };
  }
}
