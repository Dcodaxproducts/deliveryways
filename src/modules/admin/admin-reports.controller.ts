import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthUserContext, CurrentUser, Roles } from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import {
  JwtAuthGuard,
  RolesGuard,
  TenantAccessGuard as TenantGuard,
} from '../../common/guards';
import {
  AdminEmailReportExportDto,
  AdminExportCampaignsCsvQueryDto,
  AdminExportCustomersCsvQueryDto,
  AdminExportDeliverymenCsvQueryDto,
  AdminExportMenuCsvQueryDto,
  AdminExportOrdersCsvQueryDto,
  AdminFinancialReportQueryDto,
  AdminGeneratedInvoicePdfQueryDto,
  AdminGeneratedInvoicesQueryDto,
  AdminInvoicesQueryDto,
  AdminOrdersReportQueryDto,
  AdminReportsScopedQueryDto,
} from './dto';
import { AdminReportsService } from './admin-reports.service';

@ApiTags('Admin Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
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

  @Get('deliverymen/export')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Export deliverymen to CSV for admin reporting' })
  exportDeliverymenCsv(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AdminExportDeliverymenCsvQueryDto,
  ) {
    return this.adminReportsService.exportDeliverymenCsv(user, query);
  }

  @Get('coupons/export')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Export coupons to CSV for admin reporting' })
  exportCouponsCsv(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AdminExportCampaignsCsvQueryDto,
  ) {
    return this.adminReportsService.exportCampaignsCsv(user, query, 'coupons');
  }

  @Get('promotions/export')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Export promotions to CSV for admin reporting' })
  exportPromotionsCsv(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AdminExportCampaignsCsvQueryDto,
  ) {
    return this.adminReportsService.exportCampaignsCsv(
      user,
      query,
      'promotions',
    );
  }

  @Get('happy-hours/export')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Export happy hours to CSV for admin reporting' })
  exportHappyHoursCsv(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AdminExportCampaignsCsvQueryDto,
  ) {
    return this.adminReportsService.exportCampaignsCsv(
      user,
      query,
      'happy-hours',
    );
  }

  @Post('export/send-email')
  @HttpCode(200)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Generate report export CSV and send it by email' })
  sendExportEmail(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: AdminEmailReportExportDto,
  ) {
    return this.adminReportsService.sendExportEmail(user, dto);
  }

  @Get('generated-invoices')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'List generated invoice history for admin finance' })
  listGeneratedInvoices(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AdminGeneratedInvoicesQueryDto,
  ) {
    return this.adminReportsService.listGeneratedInvoices(user, query);
  }

  @Post('generated-invoices/:invoiceId/cancel')
  @HttpCode(200)
  @Roles(RolesEnum.SUPER_ADMIN)
  @ApiOperation({ summary: 'Cancel a generated invoice' })
  cancelGeneratedInvoice(
    @CurrentUser() user: AuthUserContext,
    @Param('invoiceId') invoiceId: string,
  ) {
    return this.adminReportsService.cancelGeneratedInvoice(user, invoiceId);
  }

  @Post('generated-invoices/:invoiceId/recreate')
  @HttpCode(200)
  @Roles(RolesEnum.SUPER_ADMIN)
  @ApiOperation({ summary: 'Recreate a cancelled generated invoice' })
  recreateGeneratedInvoice(
    @CurrentUser() user: AuthUserContext,
    @Param('invoiceId') invoiceId: string,
  ) {
    return this.adminReportsService.recreateGeneratedInvoice(user, invoiceId);
  }

  @Post('generated-invoices/:invoiceId/resend')
  @HttpCode(200)
  @Roles(RolesEnum.SUPER_ADMIN)
  @ApiOperation({ summary: 'Resend a generated invoice billing email' })
  resendGeneratedInvoice(
    @CurrentUser() user: AuthUserContext,
    @Param('invoiceId') invoiceId: string,
  ) {
    return this.adminReportsService.resendGeneratedInvoice(user, invoiceId);
  }

  @Get('generated-invoices/:invoiceId/pdf')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'View or download an authorized generated invoice' })
  async downloadGeneratedInvoicePdf(
    @CurrentUser() user: AuthUserContext,
    @Param('invoiceId') invoiceId: string,
    @Query() query: AdminGeneratedInvoicePdfQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.adminReportsService.downloadGeneratedInvoicePdf(
      user,
      invoiceId,
      query,
    );

    response.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `inline; filename="${file.fileName}"`,
    });

    return new StreamableFile(file.content);
  }

  @Get('invoices')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'List generated order invoices for admin finance' })
  listInvoices(
    @CurrentUser() user: AuthUserContext,
    @Query() query: AdminInvoicesQueryDto,
  ) {
    return this.adminReportsService.listInvoices(user, query);
  }

  @Get('invoices/:orderId')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Get generated invoice details for an order' })
  getInvoice(
    @CurrentUser() user: AuthUserContext,
    @Param('orderId') orderId: string,
    @Query() query: AdminReportsScopedQueryDto,
  ) {
    return this.adminReportsService.getInvoice(user, orderId, query);
  }

  @Get('invoices/:orderId/pdf')
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({ summary: 'Download generated invoice PDF for an order' })
  async downloadInvoicePdf(
    @CurrentUser() user: AuthUserContext,
    @Param('orderId') orderId: string,
    @Query() query: AdminReportsScopedQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.adminReportsService.downloadInvoicePdf(
      user,
      orderId,
      query,
    );

    response.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename="${file.fileName}"`,
    });

    return new StreamableFile(file.content);
  }

  @Post('invoices/:orderId/send-email')
  @HttpCode(200)
  @Roles(
    RolesEnum.SUPER_ADMIN,
    RolesEnum.BUSINESS_ADMIN,
    RolesEnum.BRANCH_ADMIN,
  )
  @ApiOperation({
    summary: 'Generate invoice PDF and send it to customer email',
  })
  sendInvoiceEmail(
    @CurrentUser() user: AuthUserContext,
    @Param('orderId') orderId: string,
    @Query() query: AdminReportsScopedQueryDto,
  ) {
    return this.adminReportsService.sendInvoiceEmail(user, orderId, query);
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
