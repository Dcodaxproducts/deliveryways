import { Module } from '@nestjs/common';
import { GlobalSettingsModule } from '../global-settings/global-settings.module';
import { FinancialLedgerModule } from '../financial-ledger';
import { LoyaltyWalletController } from './loyalty-wallet.controller';
import { LoyaltyWalletRepository } from './loyalty-wallet.repository';
import { LoyaltyWalletService } from './loyalty-wallet.service';

@Module({
  imports: [GlobalSettingsModule, FinancialLedgerModule],
  controllers: [LoyaltyWalletController],
  providers: [LoyaltyWalletRepository, LoyaltyWalletService],
  exports: [LoyaltyWalletService],
})
export class LoyaltyWalletModule {}
