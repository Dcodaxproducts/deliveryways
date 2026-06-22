import { Module } from '@nestjs/common';
import { GlobalSettingsModule } from '../global-settings/global-settings.module';
import { LoyaltyWalletController } from './loyalty-wallet.controller';
import { LoyaltyWalletRepository } from './loyalty-wallet.repository';
import { LoyaltyWalletService } from './loyalty-wallet.service';

@Module({
  imports: [GlobalSettingsModule],
  controllers: [LoyaltyWalletController],
  providers: [LoyaltyWalletRepository, LoyaltyWalletService],
  exports: [LoyaltyWalletService],
})
export class LoyaltyWalletModule {}
