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
  CreateTableReservationDto,
  CustomerAppCustomerScopeDto,
  HomeScreenQueryDto,
  ListCuisineItemsQueryDto,
  ListCuisinesQueryDto,
  ListCustomerFavoritesQueryDto,
  ListPromotionalItemsQueryDto,
  ListTableReservationsQueryDto,
  PublicMenuItemBySlugQueryDto,
  PublicRestaurantQueryDto,
  RedeemLoyaltyPointsDto,
  ToggleFavoriteDto,
} from './dto';
import { CustomerAppService } from './customer-app.service';

@ApiTags('Customer App')
@Controller('customer-app')
export class CustomerAppController {
  constructor(private readonly customerAppService: CustomerAppService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
  )
  @Get('favorites')
  @ApiOperation({ summary: 'List customer favorite menu items' })
  listFavorites(
    @CurrentUser() user: AuthUserContext,
    @Query() query: ListCustomerFavoritesQueryDto,
    @Query() scope: CustomerAppCustomerScopeDto,
  ) {
    return this.customerAppService.listFavorites(user, query, scope.customerId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
  )
  @Post('favorites')
  @ApiOperation({ summary: 'Add a menu item to favorites' })
  addFavorite(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: ToggleFavoriteDto,
    @Query() scope: CustomerAppCustomerScopeDto,
  ) {
    return this.customerAppService.addFavorite(user, dto, scope.customerId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
  )
  @Delete('favorites/:menuItemId')
  @ApiOperation({ summary: 'Remove a menu item from favorites' })
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
  @Get('privacy-policy')
  @ApiOperation({ summary: 'Fetch public privacy policy content' })
  getPrivacyPolicy(@Query() query: PublicRestaurantQueryDto) {
    return this.customerAppService.getPrivacyPolicy(query);
  }

  @Public()
  @Get('help-support')
  @ApiOperation({ summary: 'Fetch public help and support content' })
  getHelpSupport(@Query() query: PublicRestaurantQueryDto) {
    return this.customerAppService.getHelpSupport(query);
  }

  @Public()
  @Get('faqs')
  @ApiOperation({ summary: 'Fetch public FAQ content' })
  getFaqs(@Query() query: PublicRestaurantQueryDto) {
    return this.customerAppService.getFaqs(query);
  }

  @Public()
  @Get('cuisines')
  @ApiOperation({ summary: 'List public cuisines/categories' })
  listCuisines(@Query() query: ListCuisinesQueryDto) {
    return this.customerAppService.listCuisines(query);
  }

  @Public()
  @Get('cuisines/:cuisineId/items')
  @ApiOperation({ summary: 'List public menu items for a cuisine/category' })
  listCuisineItems(
    @Param('cuisineId') cuisineId: string,
    @Query() query: ListCuisineItemsQueryDto,
  ) {
    return this.customerAppService.listCuisineItems(cuisineId, query);
  }

  @Public()
  @Get('promotional-items')
  @ApiOperation({ summary: 'List home-screen promotional menu items' })
  listPromotionalItems(@Query() query: ListPromotionalItemsQueryDto) {
    return this.customerAppService.listPromotionalItems(query);
  }

  @Public()
  @Get('items/:slug')
  @ApiOperation({ summary: 'Fetch single public menu item by slug' })
  getItemBySlug(
    @Param('slug') slug: string,
    @Query() query: PublicMenuItemBySlugQueryDto,
  ) {
    return this.customerAppService.getItemBySlug(slug, query);
  }

  @Public()
  @Get('home')
  @ApiOperation({ summary: 'Fetch home-screen data bundle for customer app' })
  getHomeScreen(@Query() query: HomeScreenQueryDto) {
    return this.customerAppService.getHomeScreen(query);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
  )
  @Get('loyalty-points')
  @ApiOperation({ summary: 'Fetch customer loyalty points balance' })
  getLoyaltyPoints(
    @CurrentUser() user: AuthUserContext,
    @Query() scope: CustomerAppCustomerScopeDto,
  ) {
    return this.customerAppService.getLoyaltyPoints(user, scope.customerId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
  )
  @Post('loyalty-points/redeem')
  @ApiOperation({ summary: 'Redeem customer loyalty points' })
  redeemLoyaltyPoints(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: RedeemLoyaltyPointsDto,
    @Query() scope: CustomerAppCustomerScopeDto,
  ) {
    return this.customerAppService.redeemLoyaltyPoints(
      user,
      dto,
      scope.customerId,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
  )
  @Get('wallet')
  @ApiOperation({ summary: 'Fetch customer wallet balance' })
  getWallet(
    @CurrentUser() user: AuthUserContext,
    @Query() scope: CustomerAppCustomerScopeDto,
  ) {
    return this.customerAppService.getWallet(user, scope.customerId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
  )
  @Get('table-reservations')
  @ApiOperation({ summary: 'List customer table reservations' })
  listTableReservations(
    @CurrentUser() user: AuthUserContext,
    @Query() query: ListTableReservationsQueryDto,
    @Query() scope: CustomerAppCustomerScopeDto,
  ) {
    return this.customerAppService.listTableReservations(
      user,
      query,
      scope.customerId,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.CUSTOMER,
  )
  @Post('table-reservations')
  @ApiOperation({ summary: 'Create customer table reservation request' })
  createTableReservation(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: CreateTableReservationDto,
    @Query() scope: CustomerAppCustomerScopeDto,
  ) {
    return this.customerAppService.createTableReservation(
      user,
      dto,
      scope.customerId,
    );
  }
}
