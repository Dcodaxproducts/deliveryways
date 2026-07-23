import { Module } from '@nestjs/common';
import { MailerModule } from '../mailer/mailer.module';
import { GlobalSettingsModule } from '../global-settings/global-settings.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsRealtimeService } from './notifications-realtime.service';
import { NotificationsService } from './notifications.service';
import { PushNotificationsService } from './push-notifications.service';

@Module({
  imports: [MailerModule, GlobalSettingsModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsRepository,
    NotificationsRealtimeService,
    PushNotificationsService,
  ],
  exports: [NotificationsService, NotificationsRealtimeService],
})
export class NotificationsModule {}
