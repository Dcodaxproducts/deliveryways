import { Module } from '@nestjs/common';
import { CustomerAppController } from './customer-app.controller';
import { CustomerAppRepository } from './customer-app.repository';
import { CustomerAppService } from './customer-app.service';

@Module({
  controllers: [CustomerAppController],
  providers: [CustomerAppRepository, CustomerAppService],
})
export class CustomerAppModule {}
