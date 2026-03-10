import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BranchesModule } from '../branches/branches.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { DevTestingController } from './dev-testing.controller';

@Module({
  imports: [AuthModule, RestaurantsModule, BranchesModule],
  controllers: [DevTestingController],
})
export class DevTestingModule {}
