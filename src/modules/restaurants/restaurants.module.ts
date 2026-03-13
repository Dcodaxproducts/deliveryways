import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantsService } from './restaurants.service';
import { RestaurantsRepository } from './restaurants.repository';

@Module({
  imports: [TenantsModule],
  controllers: [RestaurantsController],
  providers: [RestaurantsService, RestaurantsRepository],
  exports: [RestaurantsService],
})
export class RestaurantsModule {}
