import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../../../common/decorators';
import { AuthUserContext } from '../../../common/decorators';
import { RolesEnum } from '../../../common/enums';
import {
  JwtAuthGuard,
  RolesGuard,
  TenantAccessGuard,
} from '../../../common/guards';
import {
  AttachRestaurantMenuItemDto,
  CreateRestaurantMenuDto,
  ListRestaurantMenuItemsDto,
  ListRestaurantMenusDto,
  UpdateRestaurantMenuDto,
  UpdateRestaurantMenuItemDto,
} from './dto';
import { RestaurantMenuService } from './restaurant-menu.service';

@ApiTags('Restaurant Menus')
@Controller('menus')
export class RestaurantMenuController {
  constructor(private readonly restaurantMenuService: RestaurantMenuService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Post()
  create(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: CreateRestaurantMenuDto,
  ) {
    return this.restaurantMenuService.create(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
  )
  @Get()
  list(
    @CurrentUser() user: AuthUserContext,
    @Query() query: ListRestaurantMenusDto,
  ) {
    return this.restaurantMenuService.list(user, query);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
  )
  @Get(':id')
  getById(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.restaurantMenuService.getById(user, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateRestaurantMenuDto,
  ) {
    return this.restaurantMenuService.update(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.restaurantMenuService.remove(user, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Post(':id/items')
  attachItem(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: AttachRestaurantMenuItemDto,
  ) {
    return this.restaurantMenuService.attachItem(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
  )
  @Get(':id/items')
  listItems(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Query() query: ListRestaurantMenuItemsDto,
  ) {
    return this.restaurantMenuService.listItems(user, id, query);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Patch(':id/items/:linkId')
  updateItem(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Param('linkId') linkId: string,
    @Body() dto: UpdateRestaurantMenuItemDto,
  ) {
    return this.restaurantMenuService.updateItem(user, id, linkId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Delete(':id/items/:linkId')
  removeItem(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Param('linkId') linkId: string,
  ) {
    return this.restaurantMenuService.removeItem(user, id, linkId);
  }
}
