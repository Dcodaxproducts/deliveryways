import { Module } from '@nestjs/common';
import { LoyaltyWalletController } from './loyalty-wallet.controller';
import { LoyaltyWalletRepository } from './loyalty-wallet.repository';
import { LoyaltyWalletService } from './loyalty-wallet.service';

@Module({
  controllers: [LoyaltyWalletController],
  providers: [LoyaltyWalletRepository, LoyaltyWalletService],
  exports: [LoyaltyWalletService],
})
export class LoyaltyWalletModule {}
