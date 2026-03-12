import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BranchesModule } from '../branches/branches.module';
import { InventoryModule } from '../inventory/inventory.module';
import { MenuModule } from '../menu/menu.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { DevTestingController } from './dev-testing.controller';
import { DevTestingService } from './dev-testing.service';

@Module({
  imports: [
    AuthModule,
    RestaurantsModule,
    BranchesModule,
    MenuModule,
    InventoryModule,
  ],
  controllers: [DevTestingController],
  providers: [DevTestingService],
})
export class DevTestingModule {}
