import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUserContext, CurrentUser, Roles } from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import {
  JwtAuthGuard,
  RolesGuard,
  TenantAccessGuard,
} from '../../common/guards';
import {
  AdminExportCustomersCsvQueryDto,
  AdminExportMenuCsvQueryDto,
  AdminExportOrdersCsvQueryDto,
  AdminFinancialReportQueryDto,
  AdminOrdersReportQueryDto,
} from './dto';
import { AdminReportsService } from './admin-reports.service';

@ApiTags('Admin Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Controller('admin/reports')
export class AdminReportsController {
  constructor(private readonly adminReportsService: AdminReportsService) {}

  @Get('menu/export')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Export menu items to CSV for admin reporting' })
  exportMenuCsv(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AdminExportMenuCsvQueryDto,
  ) {
    return this.adminReportsService.exportMenuCsv(user, query);
  }

  @Get('orders/export')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Export orders to CSV for admin reporting' })
  exportOrdersCsv(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AdminExportOrdersCsvQueryDto,
  ) {
    return this.adminReportsService.exportOrdersCsv(user, query);
  }

  @Get('customers/export')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Export customers to CSV for admin reporting' })
  exportCustomersCsv(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AdminExportCustomersCsvQueryDto,
  ) {
    return this.adminReportsService.exportCustomersCsv(user, query);
  }

  @Get('orders')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Get restaurant order report summary' })
  getOrdersReport(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AdminOrdersReportQueryDto,
  ) {
    return this.adminReportsService.getOrdersReport(user, query);
  }

  @Get('financial')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Get restaurant financial report summary' })
  getFinancialReport(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AdminFinancialReportQueryDto,
  ) {
    return this.adminReportsService.getFinancialReport(user, query);
  }
}
