import { Module } from '@nestjs/common';
import { MailerModule } from '../mailer/mailer.module';
import { GlobalSettingsModule } from '../global-settings/global-settings.module';
import {
  PackagePlansController,
  PublicPackagePlansController,
} from './package-plans.controller';
import { PackagePlansRepository } from './package-plans.repository';
import { PackagePlansService } from './package-plans.service';

@Module({
  imports: [MailerModule, GlobalSettingsModule],
  controllers: [PackagePlansController, PublicPackagePlansController],
  providers: [PackagePlansService, PackagePlansRepository],
  exports: [PackagePlansService],
})
export class PackagePlansModule {}
