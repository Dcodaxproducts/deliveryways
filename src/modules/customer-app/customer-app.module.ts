import { Module } from '@nestjs/common';
import { LoyaltyWalletModule } from '../loyalty-wallet/loyalty-wallet.module';
import { CustomerAppController } from './customer-app.controller';
import { CustomerAppRepository } from './customer-app.repository';
import { CustomerAppService } from './customer-app.service';

@Module({
  imports: [LoyaltyWalletModule],
  controllers: [CustomerAppController],
  providers: [CustomerAppRepository, CustomerAppService],
})
export class CustomerAppModule {}
