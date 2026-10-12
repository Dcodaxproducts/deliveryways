import { Global, Module } from '@nestjs/common';
import { RealtimeEventBusService } from './realtime-event-bus.service';
import { DatabaseModule } from '../../database/database.module';

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [RealtimeEventBusService],
  exports: [RealtimeEventBusService],
})
export class RealtimeEventsModule {}
