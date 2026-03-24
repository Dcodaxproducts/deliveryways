import {
  Controller,
  Delete,
  Get,
  Post,
  Query,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthUserContext,
  CurrentUser,
  Public,
  Roles,
} from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import {
  JwtAuthGuard,
  RolesGuard,
  TenantAccessGuard,
} from '../../common/guards';
import {
  CustomerAppCustomerScopeDto,
  HomeScreenQueryDto,
  ListCuisinesQueryDto,
  ListCustomerFavoritesQueryDto,
  PublicRestaurantQueryDto,
  ToggleFavoriteDto,
} from './dto';
import { CustomerAppService } from './customer-app.service';

@ApiTags('Customer App')
@Controller('customer-app')
export class CustomerAppController {
  constructor(private readonly customerAppService: CustomerAppService) {}

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List customer favorite menu items',
    description:
      'Returns the authenticated customer favorites. Admin/staff roles must pass customerId in query to act on behalf of a scoped customer.',
  })
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
  )
  @Get('favorites')
  listFavorites(
    @CurrentUser() user: AuthUserContext,
    @Query() query: ListCustomerFavoritesQueryDto,
    @Query() scope: CustomerAppCustomerScopeDto,
  ) {
    return this.customerAppService.listFavorites(user, query, scope.customerId);
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Add a menu item to customer favorites',
    description:
      'Stores the menu item id in customer profile metadata. Admin/staff roles must pass customerId in query to act on behalf of a scoped customer.',
  })
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
  )
  @Post('favorites')
  addFavorite(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: ToggleFavoriteDto,
    @Query() scope: CustomerAppCustomerScopeDto,
  ) {
    return this.customerAppService.addFavorite(user, dto, scope.customerId);
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Remove a menu item from customer favorites',
    description:
      'Removes the menu item id from customer profile metadata. Admin/staff roles must pass customerId in query to act on behalf of a scoped customer.',
  })
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
  )
  @Delete('favorites/:menuItemId')
  removeFavorite(
    @CurrentUser() user: AuthUserContext,
    @Param('menuItemId') menuItemId: string,
    @Query() scope: CustomerAppCustomerScopeDto,
  ) {
    return this.customerAppService.removeFavorite(
      user,
      menuItemId,
      scope.customerId,
    );
  }

  @Public()
  @ApiOperation({
    summary: 'Get restaurant privacy policy content',
    description:
      'Phase 1 minimal endpoint. Reads privacy policy text from existing restaurant settings/public content fields instead of dedicated CMS models.',
  })
  @Get('privacy-policy')
  getPrivacyPolicy(@Query() query: PublicRestaurantQueryDto) {
    return this.customerAppService.getPrivacyPolicy(query);
  }

  @Public()
  @ApiOperation({
    summary: 'Get help and support content',
    description:
      'Phase 1 minimal endpoint. Reads help/support copy and contact details from existing branch/restaurant settings instead of dedicated CMS models.',
  })
  @Get('help-support')
  getHelpSupport(@Query() query: PublicRestaurantQueryDto) {
    return this.customerAppService.getHelpSupport(query);
  }

  @Public()
  @ApiOperation({
    summary: 'Get public restaurant FAQs',
    description:
      'Phase 1 minimal endpoint. Reads FAQ items from existing branch/restaurant settings instead of a dedicated CMS-managed FAQ module.',
  })
  @Get('faqs')
  getFaqs(@Query() query: PublicRestaurantQueryDto) {
    return this.customerAppService.getFaqs(query);
  }

  @Public()
  @ApiOperation({
    summary: 'List public cuisine categories for customer app',
  })
  @Get('cuisines')
  listCuisines(@Query() query: ListCuisinesQueryDto) {
    return this.customerAppService.listCuisines(query);
  }

  @Public()
  @ApiOperation({
    summary: 'Get customer app home screen payload',
    description:
      'Phase 1 minimal home payload built from existing restaurant/branch settings, cuisine categories, menu items, and FAQs. Curated promotional items and admin-managed home sections should move to dedicated models/admin APIs in Phase 2.',
  })
  @Get('home')
  getHomeScreen(@Query() query: HomeScreenQueryDto) {
    return this.customerAppService.getHomeScreen(query);
  }
}
