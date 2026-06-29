import {
  Body,
  Controller,
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
  TenantAccessGuard,
} from '../../common/guards';
import {
  AdminLoyaltyProgramQueryDto,
  AdminCustomerWalletHistoryQueryDto,
  AdjustCustomerLoyaltyPointsDto,
  AdjustCustomerWalletDto,
  UpdateLoyaltyProgramDto,
} from './dto';
import { LoyaltyWalletService } from './loyalty-wallet.service';

@ApiTags('Admin Loyalty')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Controller('admin/loyalty')
export class LoyaltyWalletController {
  constructor(private readonly loyaltyWalletService: LoyaltyWalletService) {}

  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @Get('customers/:customerId')
  @ApiOperation({ summary: 'Fetch loyalty summary and history for a customer' })
  getCustomerLoyalty(
    @CurrentUser() user: AuthUserContext,
    @Param('customerId') customerId: string,
  ) {
    return this.loyaltyWalletService.getAdminCustomerLoyalty(user, customerId);
  }

  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @Post('customers/:customerId/adjust')
  @ApiOperation({
    summary: 'Manually add or deduct loyalty points for a customer',
  })
  adjustCustomerLoyalty(
    @CurrentUser() user: AuthUserContext,
    @Param('customerId') customerId: string,
    @Body() dto: AdjustCustomerLoyaltyPointsDto,
  ) {
    return this.loyaltyWalletService.adjustCustomerLoyalty(
      user,
      customerId,
      dto,
    );
  }

  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @Get('wallet/customers/:customerId')
  @ApiOperation({
    summary: 'Fetch wallet summary and recent history for a customer',
  })
  getCustomerWallet(
    @CurrentUser() user: AuthUserContext,
    @Param('customerId') customerId: string,
  ) {
    return this.loyaltyWalletService.getAdminCustomerWallet(user, customerId);
  }

  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @Get('wallet/customers/:customerId/history')
  @ApiOperation({ summary: 'List customer wallet transaction history' })
  listCustomerWalletHistory(
    @CurrentUser() user: AuthUserContext,
    @Param('customerId') customerId: string,
    @Query() query: AdminCustomerWalletHistoryQueryDto,
  ) {
    return this.loyaltyWalletService.listAdminCustomerWalletHistory(
      user,
      customerId,
      query,
    );
  }

  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Post('wallet/customers/:customerId/adjust')
  @ApiOperation({ summary: 'Manually credit or debit customer wallet balance' })
  adjustCustomerWallet(
    @CurrentUser() user: AuthUserContext,
    @Param('customerId') customerId: string,
    @Body() dto: AdjustCustomerWalletDto,
  ) {
    return this.loyaltyWalletService.adjustCustomerWallet(
      user,
      customerId,
      dto,
    );
  }

  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @Get('program')
  @ApiOperation({ summary: 'Fetch loyalty program settings for a restaurant' })
  getProgram(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AdminLoyaltyProgramQueryDto,
  ) {
    return this.loyaltyWalletService.getLoyaltyProgramSettings(
      user,
      query.restaurantId,
    );
  }

  @Roles(RolesEnum.SUPER_ADMIN, RolesEnum.BUSINESS_ADMIN)
  @Patch('program')
  @ApiOperation({ summary: 'Update loyalty program settings for a restaurant' })
  updateProgram(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: UpdateLoyaltyProgramDto,
  ) {
    return this.loyaltyWalletService.updateLoyaltyProgramSettings(user, dto);
  }
}
