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
  BulkCreateMenuItemsDto,
  CreateProductLabelDto,
  CreateMenuItemDto,
  DuplicateMenuItemDto,
  ListMenuItemsDto,
  ReorderMenuItemsDto,
  UpdateAllergenAdditiveTemplatesDto,
  UpdateMenuItemDto,
} from './dto';
import { MenuItemService } from './item.service';

@ApiTags('Menu Items')
@Controller('menu/items')
export class MenuItemController {
  constructor(private readonly menuItemService: MenuItemService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUserContext, @Body() dto: CreateMenuItemDto) {
    return this.menuItemService.create(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Post('bulk')
  createBulk(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: BulkCreateMenuItemsDto,
  ) {
    return this.menuItemService.createBulk(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Patch('reorder')
  reorder(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: ReorderMenuItemsDto,
  ) {
    return this.menuItemService.reorder(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
  )
  @Get('labels')
  labels() {
    return this.menuItemService.getLabels();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN)
  @Post('labels')
  createLabel(@Body() dto: CreateProductLabelDto) {
    return this.menuItemService.createLabel(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
  )
  @Get('allergen-additive-templates')
  getAllergenAdditiveTemplates(
    @CurrentUser() user: AuthUserContext,
    @Query('restaurantId') restaurantId?: string,
  ) {
    return this.menuItemService.getAllergenAdditiveTemplates(
      user,
      restaurantId,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Patch('allergen-additive-templates')
  updateAllergenAdditiveTemplates(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: UpdateAllergenAdditiveTemplatesDto,
  ) {
    return this.menuItemService.updateAllergenAdditiveTemplates(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Post(':id/duplicate')
  duplicate(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: DuplicateMenuItemDto,
  ) {
    return this.menuItemService.duplicate(user, id, dto);
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
  list(@CurrentUser() user: AuthUserContext, @Query() query: ListMenuItemsDto) {
    return this.menuItemService.list(user, query);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateMenuItemDto,
  ) {
    return this.menuItemService.update(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.menuItemService.remove(user, id);
  }
}
