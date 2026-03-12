import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUserContext } from '../../../common/decorators';
import { UserRoleEnum } from '../../../common/enums';
import { buildPaginationMeta } from '../../../common/utils';
import { PrismaService } from '../../../database';
import { CreateRecipeDto, ListRecipesDto } from './dto';
import { RecipeRepository } from './recipe.repository';

@Injectable()
export class RecipeService {
  constructor(
    private readonly recipeRepository: RecipeRepository,
    private readonly prisma: PrismaService,
  ) {}

  async create(user: AuthUserContext, dto: CreateRecipeDto) {
    const menuItem = await this.prisma.menuItem.findUnique({
      where: { id: dto.menuItemId },
    });

    if (!menuItem || menuItem.deletedAt) {
      throw new NotFoundException('Menu item not found');
    }

    const invItem = await this.prisma.inventoryItem.findUnique({
      where: { id: dto.inventoryItemId },
    });

    if (!invItem || invItem.deletedAt) {
      throw new NotFoundException('Inventory item not found');
    }

    if (menuItem.restaurantId !== invItem.restaurantId) {
      throw new BadRequestException(
        'Menu item and inventory item must belong to the same restaurant',
      );
    }

    this.ensureWriteAccess(user, menuItem.restaurantId);

    if (dto.quantity <= 0) {
      throw new BadRequestException('Quantity must be positive');
    }

    const data = await this.recipeRepository.upsert(
      dto.menuItemId,
      dto.inventoryItemId,
      new Prisma.Decimal(dto.quantity),
    );

    return { data, message: 'Recipe mapping saved successfully' };
  }

  async list(user: AuthUserContext, query: ListRecipesDto) {
    if (!query.menuItemId && !query.inventoryItemId) {
      throw new BadRequestException(
        'At least one of menuItemId or inventoryItemId is required',
      );
    }

    if (query.menuItemId) {
      const item = await this.prisma.menuItem.findUnique({
        where: { id: query.menuItemId },
      });

      if (!item || item.deletedAt) {
        throw new NotFoundException('Menu item not found');
      }

      this.ensureReadAccess(user, item.restaurantId);
    }

    if (query.inventoryItemId) {
      const invItem = await this.prisma.inventoryItem.findUnique({
        where: { id: query.inventoryItemId },
      });

      if (!invItem || invItem.deletedAt) {
        throw new NotFoundException('Inventory item not found');
      }

      this.ensureReadAccess(user, invItem.restaurantId);
    }

    const { items, total } = await this.recipeRepository.list(query);

    return {
      data: items,
      message: 'Recipe mappings fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async remove(user: AuthUserContext, id: string) {
    const recipe = await this.recipeRepository.findById(id);
    if (!recipe) {
      throw new NotFoundException('Recipe mapping not found');
    }

    const menuItem = await this.prisma.menuItem.findUnique({
      where: { id: recipe.menuItemId },
    });

    if (menuItem) {
      this.ensureWriteAccess(user, menuItem.restaurantId);
    }

    await this.recipeRepository.remove(id);
    return { data: null, message: 'Recipe mapping deleted successfully' };
  }

  private ensureWriteAccess(user: AuthUserContext, restaurantId: string) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return;
    }

    if (
      user.role !== UserRoleEnum.BUSINESS_ADMIN ||
      user.rid !== restaurantId
    ) {
      throw new ForbiddenException('Insufficient permissions for recipe write');
    }
  }

  private ensureReadAccess(user: AuthUserContext, restaurantId: string) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return;
    }

    if (user.rid !== restaurantId) {
      throw new ForbiddenException('Cross-restaurant access denied');
    }
  }
}
