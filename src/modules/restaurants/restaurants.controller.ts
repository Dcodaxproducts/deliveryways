import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { QueryDto } from '../../common/dto';
import { CurrentUser, Public, Roles } from '../../common/decorators';
import { AuthUserContext } from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import { JwtAuthGuard, RolesGuard, TenantAccessGuard } from '../../common/guards';
import { RestaurantsService } from './restaurants.service';
import { CreateRestaurantDto, UpdateRestaurantDto } from './dto';

@ApiTags('Restaurants')
@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.SUPER_ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUserContext, @Body() dto: CreateRestaurantDto) {
    return this.restaurantsService.createFromUser(user, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
  @Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.SUPER_ADMIN)
  @Get()
  list(
    @CurrentUser() user: AuthUserContext,
    @Query() query: QueryDto,
    @Query('withDeleted') withDeleted?: string,
  ) {
    return this.restaurantsService.list(user, query, withDeleted === 'true');
  }

  @Public()
  @Get('public')
  listPublic(@Query('tenantId') tenantId: string, @Query() query: QueryDto) {
    return this.restaurantsService.listPublic(tenantId, query);
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
  @Roles(RolesEnum.BUSINESS_ADMIN, RolesEnum.SUPER_ADMIN)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.restaurantsService.remove(user, id);
  }
}
