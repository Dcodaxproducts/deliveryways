import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { TenantsModule } from '../tenants/tenants.module';
import { GlobalSettingsModule } from '../global-settings/global-settings.module';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantsService } from './restaurants.service';
import { RestaurantsRepository } from './restaurants.repository';
import { CustomDomainDnsService } from './custom-domain-dns.service';

@Module({
  imports: [TenantsModule, StorageModule, GlobalSettingsModule],
  controllers: [RestaurantsController],
  providers: [
    RestaurantsService,
    RestaurantsRepository,
    CustomDomainDnsService,
  ],
  exports: [RestaurantsService],
})
export class RestaurantsModule {}
