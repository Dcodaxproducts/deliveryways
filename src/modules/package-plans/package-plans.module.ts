import { Module } from '@nestjs/common';
import { MailerModule } from '../mailer/mailer.module';
import { GlobalSettingsModule } from '../global-settings/global-settings.module';
import { InvoicesModule } from '../invoices/invoices.module';
import {
  PackagePlansController,
  PublicPackagePlansController,
} from './package-plans.controller';
import { PackagePlansInvoiceAutomationService } from './package-plans-invoice-automation.service';
import { PackagePlansRepository } from './package-plans.repository';
import { PackagePlansService } from './package-plans.service';

@Module({
  imports: [MailerModule, GlobalSettingsModule, InvoicesModule],
  controllers: [PackagePlansController, PublicPackagePlansController],
  providers: [
    PackagePlansService,
    PackagePlansInvoiceAutomationService,
    PackagePlansRepository,
  ],
  exports: [PackagePlansService],
})
export class PackagePlansModule {}
