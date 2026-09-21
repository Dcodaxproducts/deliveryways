import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { StaffActivityInterceptor } from './staff-activity.interceptor';
import { StaffActivityLogsController } from './staff-activity-logs.controller';
import { StaffActivityLogsRepository } from './staff-activity-logs.repository';
import { StaffActivityLogsService } from './staff-activity-logs.service';

@Module({
  controllers: [StaffActivityLogsController],
  providers: [
    StaffActivityLogsRepository,
    StaffActivityLogsService,
    {
      provide: APP_INTERCEPTOR,
      useClass: StaffActivityInterceptor,
    },
  ],
  exports: [StaffActivityLogsService],
})
export class StaffActivityLogsModule {}
