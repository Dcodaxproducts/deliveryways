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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUserContext, CurrentUser, Roles } from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import {
  JwtAuthGuard,
  RolesGuard,
  TenantAccessGuard as TenantGuard,
} from '../../common/guards';
import {
  AdminListPromotionsQueryDto,
  AdminPromotionStatsQueryDto,
  CreateAdminDealDto,
  ReorderAdminDealsDto,
  UpdateAdminDealDto,
} from './dto';
import { AdminPromotionsService } from './admin-promotions.service';

@ApiTags('Admin Deals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Controller('admin/deals')
export class AdminDealsController {
  constructor(
    private readonly adminPromotionsService: AdminPromotionsService,
  ) {}

  @Get()
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'List fixed-price item deals' })
  listDeals(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AdminListPromotionsQueryDto,
  ) {
    return this.adminPromotionsService.listDeals(user, query);
  }

  @Post()
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Create fixed-price deal for selected menu items' })
  createDeal(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: CreateAdminDealDto,
  ) {
    return this.adminPromotionsService.createDeal(user, dto);
  }

  @Patch('reorder')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Persist fixed-price deal display order' })
  reorderDeals(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: ReorderAdminDealsDto,
  ) {
    return this.adminPromotionsService.reorderDeals(user, dto);
  }

  @Get(':id')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Get fixed-price deal detail' })
  getDeal(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Query() query: AdminPromotionStatsQueryDto,
  ) {
    return this.adminPromotionsService.getDeal(user, id, query);
  }

  @Patch(':id')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Update fixed-price deal' })
  updateDeal(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateAdminDealDto,
  ) {
    return this.adminPromotionsService.updateDeal(user, id, dto);
  }

  @Delete(':id')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Delete fixed-price deal' })
  removeDeal(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Query() query: AdminPromotionStatsQueryDto,
  ) {
    return this.adminPromotionsService.removeDeal(user, id, query);
  }

  @Get(':id/stats')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Get fixed-price deal performance stats' })
  getDealStats(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Query() query: AdminPromotionStatsQueryDto,
  ) {
    return this.adminPromotionsService.getDealStats(user, id, query);
  }
}
