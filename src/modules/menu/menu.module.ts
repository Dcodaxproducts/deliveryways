import { Module } from '@nestjs/common';
import { MenuCategoryController } from './category/category.controller';
import { MenuCategoryService } from './category/category.service';
import { MenuCategoryRepository } from './category/category.repository';
import { MenuItemController } from './item/item.controller';
import { MenuItemService } from './item/item.service';
import { MenuItemRepository } from './item/item.repository';
import { MenuVariationController } from './variation/variation.controller';
import { MenuVariationService } from './variation/variation.service';
import { MenuVariationRepository } from './variation/variation.repository';
import { ModifierController } from './modifier/modifier.controller';
import { ModifierService } from './modifier/modifier.service';
import { ModifierRepository } from './modifier/modifier.repository';
import { BranchOverrideController } from './branch-override/branch-override.controller';
import { BranchOverrideService } from './branch-override/branch-override.service';
import { BranchOverrideRepository } from './branch-override/branch-override.repository';
import { RestaurantMenuController } from './restaurant-menu/restaurant-menu.controller';
import { RestaurantMenuService } from './restaurant-menu/restaurant-menu.service';
import { RestaurantMenuRepository } from './restaurant-menu/restaurant-menu.repository';

@Module({
  controllers: [
    MenuCategoryController,
    MenuItemController,
    MenuVariationController,
    ModifierController,
    BranchOverrideController,
    RestaurantMenuController,
  ],
  providers: [
    MenuCategoryService,
    MenuCategoryRepository,
    MenuItemService,
    MenuItemRepository,
    MenuVariationService,
    MenuVariationRepository,
    ModifierService,
    ModifierRepository,
    BranchOverrideService,
    BranchOverrideRepository,
    RestaurantMenuService,
    RestaurantMenuRepository,
  ],
  exports: [
    MenuCategoryService,
    MenuItemService,
    MenuVariationService,
    RestaurantMenuService,
  ],
})
export class MenuModule {}
