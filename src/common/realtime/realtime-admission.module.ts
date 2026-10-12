import { Global, Module } from '@nestjs/common';
import { RealtimeAdmissionService } from './realtime-admission.service';

@Global()
@Module({
  providers: [RealtimeAdmissionService],
  exports: [RealtimeAdmissionService],
})
export class RealtimeAdmissionModule {}
