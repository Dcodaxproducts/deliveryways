import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
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
  TenantAccessGuard as TenantGuard,
} from '../../common/guards';
import {
  UpdateGlobalPaymentMethodsDto,
  UpdateGlobalSettingsDto,
  UpdateGlobalTaxTypesDto,
} from './dto';
import { GlobalSettingsService } from './global-settings.service';

@ApiTags('Global Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Controller('admin/global-settings')
export class GlobalSettingsController {
  constructor(private readonly globalSettingsService: GlobalSettingsService) {}

  @Public()
  @Get('public/landing-page')
  @ApiOperation({
    summary: 'Get public landing-page branding and footer settings',
  })
  getPublicLandingPageSettings(): Promise<unknown> {
    return this.globalSettingsService.getPublicLandingPageSettings();
  }

  @Get()
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Get platform-wide global settings' })
  getSettings(): Promise<unknown> {
    return this.globalSettingsService.getSettings();
  }

  @Get('payment-methods')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Get platform-defined payment methods' })
  getPaymentMethods(): Promise<unknown> {
    return this.globalSettingsService.getPaymentMethods();
  }

  @Get('tax-types')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Get platform-defined tax types' })
  getTaxTypes(): Promise<unknown> {
    return this.globalSettingsService.getTaxTypes();
  }

  @Patch()
  @Roles(RolesEnum.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update platform-wide global settings' })
  updateSettings(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: UpdateGlobalSettingsDto,
  ): Promise<unknown> {
    return this.globalSettingsService.updateSettings(user, dto);
  }

  @Patch('payment-methods')
  @Roles(RolesEnum.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update platform-defined payment methods' })
  updatePaymentMethods(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: UpdateGlobalPaymentMethodsDto,
  ): Promise<unknown> {
    return this.globalSettingsService.updatePaymentMethods(user, dto);
  }

  @Patch('tax-types')
  @Roles(RolesEnum.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update platform-defined tax types' })
  updateTaxTypes(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: UpdateGlobalTaxTypesDto,
  ): Promise<unknown> {
    return this.globalSettingsService.updateTaxTypes(user, dto);
  }
}
