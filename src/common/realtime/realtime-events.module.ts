import { Global, Module } from '@nestjs/common';
import { RealtimeEventBusService } from './realtime-event-bus.service';

@Global()
@Module({
  providers: [RealtimeEventBusService],
  exports: [RealtimeEventBusService],
})
export class RealtimeEventsModule {}
