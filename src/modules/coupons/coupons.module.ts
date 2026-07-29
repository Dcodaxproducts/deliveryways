import { Module } from '@nestjs/common';
import { CouponsController } from './coupons.controller';
import { CouponsService } from './coupons.service';
import { CouponsRepository } from './coupons.repository';
import { GlobalSettingsModule } from '../global-settings/global-settings.module';

@Module({
  imports: [GlobalSettingsModule],
  controllers: [CouponsController],
  providers: [CouponsService, CouponsRepository],
  exports: [CouponsService],
})
export class CouponsModule {}
