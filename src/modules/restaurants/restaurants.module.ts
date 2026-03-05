import { Module } from '@nestjs/common';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantsService } from './restaurants.service';
import { RestaurantsRepository } from './restaurants.repository';

@Module({
  controllers: [RestaurantsController],
  providers: [RestaurantsService, RestaurantsRepository],
  exports: [RestaurantsService],
})
export class RestaurantsModule {}
