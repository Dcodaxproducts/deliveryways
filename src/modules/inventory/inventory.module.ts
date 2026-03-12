import { Module } from '@nestjs/common';
import { InventoryCategoryController } from './category/category.controller';
import { InventoryCategoryService } from './category/category.service';
import { InventoryCategoryRepository } from './category/category.repository';
import { InventoryItemController } from './item/item.controller';
import { InventoryItemService } from './item/item.service';
import { InventoryItemRepository } from './item/item.repository';
import { InventoryMovementController } from './movement/movement.controller';
import { InventoryMovementService } from './movement/movement.service';
import { InventoryMovementRepository } from './movement/movement.repository';
import { RecipeController } from './recipe/recipe.controller';
import { RecipeService } from './recipe/recipe.service';
import { RecipeRepository } from './recipe/recipe.repository';

@Module({
  controllers: [
    InventoryCategoryController,
    InventoryItemController,
    InventoryMovementController,
    RecipeController,
  ],
  providers: [
    InventoryCategoryService,
    InventoryCategoryRepository,
    InventoryItemService,
    InventoryItemRepository,
    InventoryMovementService,
    InventoryMovementRepository,
    RecipeService,
    RecipeRepository,
  ],
  exports: [InventoryCategoryService, InventoryItemService],
})
export class InventoryModule {}
