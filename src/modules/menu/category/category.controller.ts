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
  BulkCreateMenuCategoriesDto,
  CreateMenuCategoryDto,
  ListMenuCategoriesDto,
  ReorderMenuCategoriesDto,
  UpdateMenuCategoryDto,
} from './dto';
import { MenuCategoryService } from './category.service';

@ApiTags('Menu Categories')
@Controller('menu/categories')
export class MenuCategoryController {
  constructor(private readonly menuCategoryService: MenuCategoryService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN, RolesEnum.STAFF)
  @Post()
  create(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: CreateMenuCategoryDto,
  ) {
    return this.menuCategoryService.create(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN, RolesEnum.STAFF)
  @Post('bulk')
  createBulk(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: BulkCreateMenuCategoriesDto,
  ) {
    return this.menuCategoryService.createBulk(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN, RolesEnum.STAFF)
  @Patch('reorder')
  reorder(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: ReorderMenuCategoriesDto,
  ) {
    return this.menuCategoryService.reorder(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.STAFF,
    RolesEnum.CUSTOMER,
  )
  @Get()
  list(
    @CurrentUser() user: AuthUserContext,
    @Query() query: ListMenuCategoriesDto,
  ) {
    return this.menuCategoryService.list(user, query);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.STAFF,
    RolesEnum.CUSTOMER,
  )
  @Get(':id')
  getById(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.menuCategoryService.getById(user, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN, RolesEnum.STAFF)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateMenuCategoryDto,
  ) {
    return this.menuCategoryService.update(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN, RolesEnum.STAFF)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.menuCategoryService.remove(user, id);
  }
}
