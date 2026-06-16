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
import { CouponCampaignKind, CouponDiscountType } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUserContext, CurrentUser, Roles } from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import {
  JwtAuthGuard,
  RolesGuard,
  TenantAccessGuard,
} from '../../common/guards';
import {
  AdminListPromotionsQueryDto,
  AdminPromotionStatsQueryDto,
  AdminPromotionsOverviewQueryDto,
  CreateAdminGiftCardDto,
  CreateAdminHappyHourDto,
  CreateAdminPromotionDto,
  UpdateAdminGiftCardDto,
  UpdateAdminHappyHourDto,
  UpdateAdminPromotionDto,
} from './dto';
import { AdminPromotionsService } from './admin-promotions.service';

@ApiTags('Admin Promotions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Controller('admin/promotions')
export class AdminPromotionsController {
  constructor(
    private readonly adminPromotionsService: AdminPromotionsService,
  ) {}

  @Get('overview')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Get promotions overview for admin dashboard' })
  getOverview(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AdminPromotionsOverviewQueryDto,
  ) {
    return this.adminPromotionsService.getOverview(user, query);
  }

  @Get('campaigns')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'List promotion campaigns' })
  listPromotions(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AdminListPromotionsQueryDto,
  ) {
    return this.adminPromotionsService.list(
      user,
      query,
      CouponCampaignKind.PROMOTION,
      {
        autoApply: true,
        excludeDiscountType: CouponDiscountType.FIXED_PRICE,
      },
    );
  }

  @Post('campaigns')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Create promotion campaign' })
  createPromotion(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: CreateAdminPromotionDto,
  ) {
    return this.adminPromotionsService.createPromotion(user, dto);
  }

  @Get('campaigns/:id')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Get promotion campaign detail' })
  getPromotion(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Query() query: AdminPromotionStatsQueryDto,
  ) {
    return this.adminPromotionsService.getById(
      user,
      id,
      query,
      CouponCampaignKind.PROMOTION,
    );
  }

  @Patch('campaigns/:id')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Update promotion campaign' })
  updatePromotion(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateAdminPromotionDto,
  ) {
    return this.adminPromotionsService.updatePromotion(user, id, dto);
  }

  @Delete('campaigns/:id')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Delete promotion campaign' })
  removePromotion(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Query() query: AdminPromotionStatsQueryDto,
  ) {
    return this.adminPromotionsService.removePromotion(user, id, query);
  }

  @Get('happy-hours')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'List happy hours' })
  listHappyHours(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AdminListPromotionsQueryDto,
  ) {
    return this.adminPromotionsService.list(
      user,
      query,
      CouponCampaignKind.HAPPY_HOUR,
    );
  }

  @Post('happy-hours')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Create happy hour' })
  createHappyHour(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: CreateAdminHappyHourDto,
  ) {
    return this.adminPromotionsService.createHappyHour(user, dto);
  }

  @Get('happy-hours/:id')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Get happy hour detail' })
  getHappyHour(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Query() query: AdminPromotionStatsQueryDto,
  ) {
    return this.adminPromotionsService.getById(
      user,
      id,
      query,
      CouponCampaignKind.HAPPY_HOUR,
    );
  }

  @Patch('happy-hours/:id')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Update happy hour' })
  updateHappyHour(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateAdminHappyHourDto,
  ) {
    return this.adminPromotionsService.updateHappyHour(user, id, dto);
  }

  @Delete('happy-hours/:id')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Delete happy hour' })
  removeHappyHour(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Query() query: AdminPromotionStatsQueryDto,
  ) {
    return this.adminPromotionsService.removePromotion(user, id, query);
  }

  @Get('gift-cards')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'List gift cards' })
  listGiftCards(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AdminListPromotionsQueryDto,
  ) {
    return this.adminPromotionsService.list(
      user,
      query,
      CouponCampaignKind.GIFT_CARD,
    );
  }

  @Post('gift-cards')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Create gift card' })
  createGiftCard(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: CreateAdminGiftCardDto,
  ) {
    return this.adminPromotionsService.createGiftCard(user, dto);
  }

  @Get('gift-cards/:id')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Get gift card detail' })
  getGiftCard(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Query() query: AdminPromotionStatsQueryDto,
  ) {
    return this.adminPromotionsService.getById(
      user,
      id,
      query,
      CouponCampaignKind.GIFT_CARD,
    );
  }

  @Patch('gift-cards/:id')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Update gift card' })
  updateGiftCard(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateAdminGiftCardDto,
  ) {
    return this.adminPromotionsService.updateGiftCard(user, id, dto);
  }

  @Delete('gift-cards/:id')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Delete gift card' })
  removeGiftCard(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Query() query: AdminPromotionStatsQueryDto,
  ) {
    return this.adminPromotionsService.removeGiftCard(user, id, query);
  }

  @Get(':id/stats')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Get promotion performance stats' })
  getStats(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Query() query: AdminPromotionStatsQueryDto,
  ) {
    return this.adminPromotionsService.getStats(user, id, query);
  }
}
