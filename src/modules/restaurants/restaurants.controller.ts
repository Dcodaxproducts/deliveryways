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
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AdminListQueryDto, QueryDto } from '../../common/dto';
import { CurrentUser, Public, Roles } from '../../common/decorators';
import { AuthUserContext } from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import {
  JwtAuthGuard,
  RolesGuard,
  TenantAccessGuard,
} from '../../common/guards';
import { RestaurantsService } from './restaurants.service';
import {
  CreateRestaurantCustomerAppFaqDto,
  CreateRestaurantDto,
  UpdateRestaurantCustomerAppFaqDto,
  UpdateRestaurantCustomerAppContentDto,
  UpdateRestaurantDto,
  UpdateRestaurantImagesDto,
  UpdateRestaurantLegalProfileDto,
  UpdateRestaurantTransactionFeeDto,
} from './dto';

@ApiTags('Restaurants')
@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.SUPER_ADMIN)
  @Post()
  create(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: CreateRestaurantDto,
  ) {
    return this.restaurantsService.createFromUser(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.SUPER_ADMIN)
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({ name: 'search', required: false, example: 'kfc' })
  @ApiQuery({ name: 'sortBy', required: false, example: 'createdAt' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['ASC', 'DESC'] })
  @ApiQuery({
    name: 'withDeleted',
    required: false,
    example: false,
    description: 'Super admin only',
  })
  @ApiQuery({
    name: 'includeInactive',
    required: false,
    example: false,
    description: 'Admin only',
  })
  @Get()
  list(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AdminListQueryDto,
  ) {
    return this.restaurantsService.list(user, query);
  }

  @Public()
  @Get('public')
  listPublic(@Query('tenantId') tenantId: string, @Query() query: QueryDto) {
    return this.restaurantsService.listPublic(tenantId, query);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.CUSTOMER)
  @Get('customer-app-content')
  customerAppContentFromContext(@CurrentUser() user: AuthUserContext) {
    return this.restaurantsService.customerAppContentFromContext(user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.SUPER_ADMIN)
  @Get(':id')
  details(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.restaurantsService.details(user, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.SUPER_ADMIN)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateRestaurantDto,
  ) {
    return this.restaurantsService.update(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.SUPER_ADMIN)
  @Patch(':id/transaction-fee')
  updateTransactionFee(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateRestaurantTransactionFeeDto,
  ) {
    return this.restaurantsService.updateTransactionFee(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.SUPER_ADMIN)
  @Patch(':id/suspend')
  suspend(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.restaurantsService.suspend(user, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.SUPER_ADMIN)
  @Patch(':id/activate')
  activate(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.restaurantsService.activate(user, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.SUPER_ADMIN,
  )
  @Get(':id/customer-app-content')
  customerAppContent(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
  ) {
    return this.restaurantsService.customerAppContent(user, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.SUPER_ADMIN)
  @Patch(':id/customer-app-content')
  updateCustomerAppContent(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateRestaurantCustomerAppContentDto,
  ) {
    return this.restaurantsService.updateCustomerAppContent(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
    RolesEnum.SUPER_ADMIN,
  )
  @Get(':id/legal-profile')
  legalProfile(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.restaurantsService.legalProfile(user, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.SUPER_ADMIN)
  @Patch(':id/legal-profile')
  updateLegalProfile(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateRestaurantLegalProfileDto,
  ) {
    return this.restaurantsService.updateLegalProfile(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.SUPER_ADMIN)
  @Get(':id/customer-app-faqs')
  customerAppFaqs(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
  ) {
    return this.restaurantsService.customerAppFaqs(user, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.SUPER_ADMIN)
  @Post(':id/customer-app-faqs')
  createCustomerAppFaq(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: CreateRestaurantCustomerAppFaqDto,
  ) {
    return this.restaurantsService.createCustomerAppFaq(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.SUPER_ADMIN)
  @Patch(':id/customer-app-faqs/:faqId')
  updateCustomerAppFaq(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Param('faqId') faqId: string,
    @Body() dto: UpdateRestaurantCustomerAppFaqDto,
  ) {
    return this.restaurantsService.updateCustomerAppFaq(user, id, faqId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.SUPER_ADMIN)
  @Delete(':id/customer-app-faqs/:faqId')
  removeCustomerAppFaq(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Param('faqId') faqId: string,
  ) {
    return this.restaurantsService.removeCustomerAppFaq(user, id, faqId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.SUPER_ADMIN)
  @Patch(':id/images')
  updateImages(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateRestaurantImagesDto,
  ) {
    return this.restaurantsService.updateImages(user, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.SUPER_ADMIN)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.restaurantsService.remove(user, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.SUPER_ADMIN)
  @Delete(':id/force')
  forceDelete(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.restaurantsService.forceDelete(user, id);
  }
}
