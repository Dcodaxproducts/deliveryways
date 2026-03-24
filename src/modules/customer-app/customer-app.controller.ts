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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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
  @Get('privacy-policy')
  getPrivacyPolicy(@Query() query: PublicRestaurantQueryDto) {
    return this.customerAppService.getPrivacyPolicy(query);
  }

  @Public()
  @Get('help-support')
  getHelpSupport(@Query() query: PublicRestaurantQueryDto) {
    return this.customerAppService.getHelpSupport(query);
  }

  @Public()
  @Get('faqs')
  getFaqs(@Query() query: PublicRestaurantQueryDto) {
    return this.customerAppService.getFaqs(query);
  }

  @Public()
  @Get('cuisines')
  listCuisines(@Query() query: ListCuisinesQueryDto) {
    return this.customerAppService.listCuisines(query);
  }

  @Public()
  @Get('home')
  getHomeScreen(@Query() query: HomeScreenQueryDto) {
    return this.customerAppService.getHomeScreen(query);
  }
}
