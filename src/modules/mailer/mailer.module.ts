import { Module } from '@nestjs/common';
import { GlobalSettingsModule } from '../global-settings/global-settings.module';
import { MailerService } from './mailer.service';

@Module({
  imports: [GlobalSettingsModule],
  providers: [MailerService],
  exports: [MailerService],
})
export class MailerModule {}
