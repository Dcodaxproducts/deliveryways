import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUserContext, CurrentUser, Roles } from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import {
  JwtAuthGuard,
  RolesGuard,
  TenantAccessGuard,
} from '../../common/guards';
import { UpdateGlobalSettingsDto } from './dto';
import { GlobalSettingsService } from './global-settings.service';

@ApiTags('Global Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Roles(RolesEnum.SUPER_ADMIN)
@Controller('admin/global-settings')
export class GlobalSettingsController {
  constructor(private readonly globalSettingsService: GlobalSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get platform-wide global settings' })
  getSettings(): Promise<unknown> {
    return this.globalSettingsService.getSettings();
  }

  @Patch()
  @ApiOperation({ summary: 'Update platform-wide global settings' })
  updateSettings(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: UpdateGlobalSettingsDto,
  ): Promise<unknown> {
    return this.globalSettingsService.updateSettings(user, dto);
  }
}
