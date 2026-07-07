import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
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
  TenantAccessGuard,
} from '../../common/guards';
import {
  AssignTenantSubscriptionDto,
  CreateSubscriptionDeductionDto,
  CreatePackagePlanDto,
  ListPackagePlansDto,
  ListSubscriptionDeductionsDto,
  ListTenantSubscriptionsDto,
  MonthlyInvoiceDatevExportQueryDto,
  SendTenantSubscriptionInvoiceDto,
  SendWeeklyRestaurantPayoutInvoiceDto,
  UpdatePackagePlanDto,
  UpdateSubscriptionDeductionDto,
  UpdateTenantSubscriptionDto,
  WeeklyRestaurantPayoutInvoiceQueryDto,
} from './dto';
import { PackagePlansService } from './package-plans.service';

@ApiTags('Package Plans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantAccessGuard)
@Roles(RolesEnum.SUPER_ADMIN)
@Controller('admin/package-plans')
export class PackagePlansController {
  constructor(private readonly packagePlansService: PackagePlansService) {}

  @Post()
  @ApiOperation({ summary: 'Create package plan' })
  createPlan(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: CreatePackagePlanDto,
  ) {
    return this.packagePlansService.createPlan(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List package plans' })
  listPlans(
    @CurrentUser() user: AuthUserContext,
    @Query() query: ListPackagePlansDto,
  ) {
    return this.packagePlansService.listPlans(user, query);
  }

  @Get('subscriptions')
  @ApiOperation({ summary: 'List tenant subscriptions' })
  listSubscriptions(
    @CurrentUser() user: AuthUserContext,
    @Query() query: ListTenantSubscriptionsDto,
  ) {
    return this.packagePlansService.listSubscriptions(user, query);
  }

  @Get('features/catalog')
  @ApiOperation({ summary: 'List available package plan feature modules' })
  getFeatureCatalog(@CurrentUser() user: AuthUserContext) {
    return this.packagePlansService.getFeatureCatalog(user);
  }

  @Post('subscriptions')
  @ApiOperation({ summary: 'Assign package plan to tenant or restaurant' })
  assignSubscription(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: AssignTenantSubscriptionDto,
  ) {
    return this.packagePlansService.assignSubscription(user, dto);
  }

  @Patch('subscriptions/:id')
  @ApiOperation({ summary: 'Update tenant subscription' })
  updateSubscription(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateTenantSubscriptionDto,
  ) {
    return this.packagePlansService.updateSubscription(user, id, dto);
  }

  @Get('subscriptions/:id/invoice')
  @ApiOperation({ summary: 'Get restaurant subscription invoice details' })
  getSubscriptionInvoice(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
  ) {
    return this.packagePlansService.getSubscriptionInvoice(user, id);
  }

  @Get('subscriptions/:id/invoice/pdf')
  @ApiOperation({ summary: 'Download restaurant subscription invoice PDF' })
  async downloadSubscriptionInvoicePdf(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.packagePlansService.downloadSubscriptionInvoicePdf(
      user,
      id,
    );

    response.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename="${file.fileName}"`,
    });

    return new StreamableFile(file.content);
  }

  @Post('subscriptions/:id/invoice/send-email')
  @ApiOperation({ summary: 'Send restaurant subscription invoice by email' })
  sendSubscriptionInvoiceEmail(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: SendTenantSubscriptionInvoiceDto,
  ) {
    return this.packagePlansService.sendSubscriptionInvoiceEmail(user, id, dto);
  }

  @Get('payouts/weekly-invoice')
  @ApiOperation({ summary: 'Get weekly restaurant payout invoice details' })
  getWeeklyPayoutInvoice(
    @CurrentUser() user: AuthUserContext,
    @Query() query: WeeklyRestaurantPayoutInvoiceQueryDto,
  ) {
    return this.packagePlansService.getWeeklyPayoutInvoice(user, query);
  }

  @Get('payouts/weekly-invoice/pdf')
  @ApiOperation({ summary: 'Download weekly restaurant payout invoice PDF' })
  async downloadWeeklyPayoutInvoicePdf(
    @CurrentUser() user: AuthUserContext,
    @Query() query: WeeklyRestaurantPayoutInvoiceQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.packagePlansService.downloadWeeklyPayoutInvoicePdf(
      user,
      query,
    );

    response.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename="${file.fileName}"`,
    });

    return new StreamableFile(file.content);
  }

  @Post('payouts/weekly-invoice/send-email')
  @ApiOperation({ summary: 'Send weekly restaurant payout invoice by email' })
  sendWeeklyPayoutInvoiceEmail(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: SendWeeklyRestaurantPayoutInvoiceDto,
  ) {
    return this.packagePlansService.sendWeeklyPayoutInvoiceEmail(user, dto);
  }

  @Get('deductions')
  @ApiOperation({ summary: 'List subscription deductible items' })
  listDeductions(
    @CurrentUser() user: AuthUserContext,
    @Query() query: ListSubscriptionDeductionsDto,
  ) {
    return this.packagePlansService.listDeductions(user, query);
  }

  @Post('deductions')
  @ApiOperation({ summary: 'Create subscription deductible item' })
  createDeduction(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: CreateSubscriptionDeductionDto,
  ) {
    return this.packagePlansService.createDeduction(user, dto);
  }

  @Patch('deductions/:id')
  @ApiOperation({ summary: 'Update subscription deductible item' })
  updateDeduction(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdateSubscriptionDeductionDto,
  ) {
    return this.packagePlansService.updateDeduction(user, id, dto);
  }

  @Get('invoices/datev-export')
  @ApiOperation({ summary: 'Export monthly invoice DATEV CSV' })
  async exportMonthlyInvoicesDatevCsv(
    @CurrentUser() user: AuthUserContext,
    @Query() query: MonthlyInvoiceDatevExportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.packagePlansService.exportMonthlyInvoicesDatevCsv(
      user,
      query,
    );

    response.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename="${file.fileName}"`,
    });

    return new StreamableFile(file.content);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get package plan detail' })
  planDetails(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.packagePlansService.planDetails(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update package plan' })
  updatePlan(
    @CurrentUser() user: AuthUserContext,
    @Param('id') id: string,
    @Body() dto: UpdatePackagePlanDto,
  ) {
    return this.packagePlansService.updatePlan(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete package plan' })
  removePlan(@CurrentUser() user: AuthUserContext, @Param('id') id: string) {
    return this.packagePlansService.removePlan(user, id);
  }
}

@ApiTags('Package Plans')
@Controller('package-plans')
export class PublicPackagePlansController {
  constructor(private readonly packagePlansService: PackagePlansService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List public package plans for landing pages' })
  listPublicPlans(@Query() query: ListPackagePlansDto) {
    return this.packagePlansService.listPublicPlans(query);
  }
}
