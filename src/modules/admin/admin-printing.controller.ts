import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUserContext, CurrentUser, Roles } from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import {
  JwtAuthGuard,
  RolesGuard,
  TenantAccessGuard,
} from '../../common/guards';
import {
  AdminPrintingLogsQueryDto,
  AdminPrintingScopedQueryDto,
  AdminPrintingStatusQueryDto,
  UpdateAdminPrintingSettingsDto,
} from './dto';
import { AdminPrintingService } from './admin-printing.service';

@ApiTags('Admin Printing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Controller('admin/printing')
export class AdminPrintingController {
  constructor(private readonly adminPrintingService: AdminPrintingService) {}

  @Get('settings')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Get admin auto-printing settings' })
  getSettings(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AdminPrintingScopedQueryDto,
  ) {
    return this.adminPrintingService.getSettings(user, query);
  }

  @Patch('settings')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Update admin auto-printing settings' })
  updateSettings(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AdminPrintingScopedQueryDto,
    @Body() dto: UpdateAdminPrintingSettingsDto,
  ) {
    return this.adminPrintingService.updateSettings(user, query, dto);
  }

  @Get('status')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({
    summary: 'Get admin printer status and recent health summary',
  })
  getStatus(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AdminPrintingStatusQueryDto,
  ) {
    return this.adminPrintingService.getStatus(user, query);
  }

  @Get('logs')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Get admin printer logs' })
  getLogs(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AdminPrintingLogsQueryDto,
  ) {
    return this.adminPrintingService.getLogs(user, query);
  }
}
