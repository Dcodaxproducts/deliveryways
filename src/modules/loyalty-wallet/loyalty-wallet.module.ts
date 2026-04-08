import { Module } from '@nestjs/common';
import { LoyaltyWalletRepository } from './loyalty-wallet.repository';
import { LoyaltyWalletService } from './loyalty-wallet.service';

@Module({
  providers: [LoyaltyWalletRepository, LoyaltyWalletService],
  exports: [LoyaltyWalletService],
})
export class LoyaltyWalletModule {}
