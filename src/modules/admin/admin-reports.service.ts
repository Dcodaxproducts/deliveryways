import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  GeneratedInvoiceEventType,
  GeneratedInvoiceKind,
  GeneratedInvoiceStatus,
  Prisma,
} from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import { MailerService } from '../mailer/mailer.service';
import { GlobalSettingsService } from '../global-settings/global-settings.service';
import { UserRoleEnum } from '../../common/enums';
import { InvoicePdfBuilder } from '../../common/pdf/invoice-pdf.builder';
import { InvoiceRecordsService } from '../invoices/invoice-records.service';
import { PackagePlansService } from '../package-plans/package-plans.service';
import {
  AdminReportsRepository,
  AdminReportsScope,
} from './admin-reports.repository';
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

type InvoiceOrder = NonNullable<
  Awaited<ReturnType<AdminReportsRepository['findInvoiceOrder']>>
>;

@Injectable()
export class AdminReportsService {
  constructor(
    private readonly adminReportsRepository: AdminReportsRepository,
    private readonly mailerService?: MailerService,
    private readonly globalSettingsService?: GlobalSettingsService,
    private readonly invoiceRecordsService?: InvoiceRecordsService,
    private readonly packagePlansService?: PackagePlansService,
  ) {}

  async exportMenuCsv(
    user: AuthUserContext,
    query: AdminExportMenuCsvQueryDto,
  ) {
    const scope = await this.resolveScope(
      user,
      query.restaurantId,
      query.branchId,
    );
    const items = await this.adminReportsRepository.exportMenu(scope, {
      ...query,
      restaurantId: scope.restaurantId,
      branchId: scope.branchId,
    });

    const rows = items.map((item) => ({
      itemId: item.id,
      restaurantId: scope.restaurantId ?? '',
      categoryId: item.category.id,
      categoryName: item.category.name,
      itemName: item.name,
      slug: item.slug,
      sku: item.sku ?? '',
      pricingMode: item.pricingMode,
      basePrice: Number(item.basePrice),
      deliveryPriceAdjustment: Number(item.deliveryPriceAdjustment),
      takeawayPriceAdjustment: Number(item.takeawayPriceAdjustment),
      depositAmount: Number(item.depositAmount ?? 0),
      prepTimeMinutes: item.prepTimeMinutes ?? '',
      menuNames: item.menuLinks
        .map((link) => link.restaurantMenu.name)
        .join(' | '),
      variationsCount: item.category.variations.length,
      modifierGroupsCount: item._count.modifierLinks,
      isActive: item.isActive,
      createdAt: item.createdAt.toISOString(),
    }));

    return {
      data: {
        fileName: this.buildFileName('menu-export', scope),
        mimeType: 'text/csv',
        rowCount: rows.length,
        content: this.toCsv(rows),
      },
      message: 'Menu export generated successfully',
    };
  }

  async exportOrdersCsv(
    user: AuthUserContext,
    query: AdminExportOrdersCsvQueryDto,
  ) {
    const scope = await this.resolveScope(
      user,
      query.restaurantId,
      query.branchId,
    );
    const orders = await this.adminReportsRepository.exportOrders(scope, {
      ...query,
      restaurantId: scope.restaurantId,
      branchId: scope.branchId,
    });

    const rows = orders.map((order) => ({
      orderId: order.id,
      restaurantId: order.restaurantId,
      branchId: order.branchId,
      branchName: order.branch.name,
      customerId: order.customer.id,
      customerName:
        `${order.customer.profile?.firstName ?? ''} ${order.customer.profile?.lastName ?? ''}`.trim(),
      customerEmail: order.customer.email,
      customerPhone: order.customer.profile?.phone ?? '',
      orderType: order.orderType,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      itemsCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      itemsSummary: order.items
        .map(
          (item) =>
            `${item.menuItemName}${item.variationName ? ` (${item.variationName})` : ''} x${item.quantity}`,
        )
        .join(' | '),
      subtotal: Number(order.subtotal),
      taxAmount: Number(order.taxAmount),
      deliveryFee: Number(order.deliveryFee),
      discountAmount: Number(order.discountAmount),
      totalAmount: Number(order.totalAmount),
      couponCode: order.coupon?.code ?? '',
      deliverymanName: order.deliveryman
        ? `${order.deliveryman.firstName} ${order.deliveryman.lastName}`.trim()
        : '',
      createdAt: order.createdAt.toISOString(),
      orderTime: order.orderTime?.toISOString() ?? '',
    }));

    return {
      data: {
        fileName: this.buildFileName('orders-export', scope),
        mimeType: 'text/csv',
        rowCount: rows.length,
        content: this.toCsv(rows),
      },
      message: 'Orders export generated successfully',
    };
  }

  async exportCustomersCsv(
    user: AuthUserContext,
    query: AdminExportCustomersCsvQueryDto,
  ) {
    const scope = await this.resolveScope(
      user,
      query.restaurantId,
      query.branchId,
    );
    const customers = await this.adminReportsRepository.exportCustomers(scope, {
      ...query,
      restaurantId: scope.restaurantId,
      branchId: scope.branchId,
    });

    const rows = customers.map((customer) => ({
      customerId: customer.id,
      restaurantId: customer.restaurant?.id ?? '',
      restaurantName: customer.restaurant?.name ?? '',
      branchId: customer.branch?.id ?? '',
      branchName: customer.branch?.name ?? '',
      firstName: customer.profile?.firstName ?? '',
      lastName: customer.profile?.lastName ?? '',
      email: customer.email,
      phone: customer.profile?.phone ?? '',
      isActive: customer.isActive,
      isVerified: customer.isVerified,
      totalOrders: customer._count.customerOrders,
      couponUsages: customer._count.couponUsages,
      createdAt: customer.createdAt.toISOString(),
    }));

    return {
      data: {
        fileName: this.buildFileName('customers-export', scope),
        mimeType: 'text/csv',
        rowCount: rows.length,
        content: this.toCsv(rows),
      },
      message: 'Customers export generated successfully',
    };
  }

  async exportDeliverymenCsv(
    user: AuthUserContext,
    query: AdminExportDeliverymenCsvQueryDto,
  ) {
    const scope = await this.resolveScope(
      user,
      query.restaurantId,
      query.branchId,
    );
    const deliverymen = await this.adminReportsRepository.exportDeliverymen(
      scope,
      {
        ...query,
        restaurantId: scope.restaurantId,
        branchId: scope.branchId,
      },
    );

    const rows = deliverymen.map((deliveryman) => ({
      deliverymanId: deliveryman.id,
      restaurantId: deliveryman.restaurantId,
      restaurantName: deliveryman.restaurant.name,
      branchId: deliveryman.branchId,
      branchName: deliveryman.branch.name,
      firstName: deliveryman.firstName,
      lastName: deliveryman.lastName,
      email: deliveryman.email,
      phone: deliveryman.phone,
      vehicleType: deliveryman.vehicleType ?? '',
      vehicleNumber: deliveryman.vehicleNumber ?? '',
      status: deliveryman.status,
      isActive: deliveryman.isActive,
      totalOrders: deliveryman._count.orders,
      createdAt: deliveryman.createdAt.toISOString(),
    }));

    return {
      data: {
        fileName: this.buildFileName('deliverymen-export', scope),
        mimeType: 'text/csv',
        rowCount: rows.length,
        content: this.toCsv(rows),
      },
      message: 'Deliverymen export generated successfully',
    };
  }

  async exportCampaignsCsv(
    user: AuthUserContext,
    query: AdminExportCampaignsCsvQueryDto,
    type: 'coupons' | 'promotions' | 'happy-hours',
  ) {
    const scope = await this.resolveScope(
      user,
      query.restaurantId,
      query.branchId,
    );
    const campaigns = await this.adminReportsRepository.exportCampaigns(
      scope,
      {
        ...query,
        restaurantId: scope.restaurantId,
        branchId: scope.branchId,
      },
      type,
    );

    const rows = campaigns.map((campaign) => ({
      campaignId: campaign.id,
      restaurantId: campaign.restaurantId,
      restaurantName: campaign.restaurant.name,
      branchId: campaign.branchId ?? '',
      branchName: campaign.branch?.name ?? '',
      code: campaign.code ?? '',
      title: campaign.title,
      description: campaign.description ?? '',
      kind: campaign.kind,
      status: campaign.status,
      applyMode: campaign.applyMode,
      autoApply: campaign.autoApply,
      discountType: campaign.discountType,
      discountValue: Number(campaign.discountValue),
      maxDiscountAmount:
        campaign.maxDiscountAmount !== null
          ? Number(campaign.maxDiscountAmount)
          : '',
      minOrderAmount:
        campaign.minOrderAmount !== null ? Number(campaign.minOrderAmount) : '',
      maxUses: campaign.maxUses ?? '',
      maxUsesPerCustomer: campaign.maxUsesPerCustomer ?? '',
      usedCount: campaign.usedCount,
      startsAt: campaign.startsAt?.toISOString() ?? '',
      expiresAt: campaign.expiresAt?.toISOString() ?? '',
      activeDays:
        campaign.activeDays !== null ? JSON.stringify(campaign.activeDays) : '',
      dailyStartTime: campaign.dailyStartTime ?? '',
      dailyEndTime: campaign.dailyEndTime ?? '',
      scopeMenuItemId: campaign.scopeMenuItem?.id ?? '',
      scopeMenuItemName: campaign.scopeMenuItem?.name ?? '',
      scopeCategoryId: campaign.scopeCategory?.id ?? '',
      scopeCategoryName: campaign.scopeCategory?.name ?? '',
      scopeMenuItemIds: campaign.scopeMenuItems
        .map((scopeItem) => scopeItem.menuItem.id)
        .join('|'),
      scopeMenuItemNames: campaign.scopeMenuItems
        .map((scopeItem) => scopeItem.menuItem.name)
        .join('|'),
      scopeCategoryIds: campaign.scopeCategories
        .map((scopeCategory) => scopeCategory.menuCategory.id)
        .join('|'),
      scopeCategoryNames: campaign.scopeCategories
        .map((scopeCategory) => scopeCategory.menuCategory.name)
        .join('|'),
      isActive: campaign.isActive,
      createdAt: campaign.createdAt.toISOString(),
    }));

    return {
      data: {
        fileName: this.buildFileName(`${type}-export`, scope),
        mimeType: 'text/csv',
        rowCount: rows.length,
        content: this.toCsv(rows),
      },
      message: `${this.getCampaignExportLabel(type)} export generated successfully`,
    };
  }

  async sendExportEmail(user: AuthUserContext, dto: AdminEmailReportExportDto) {
    const exportResult = await this.generateReportExport(user, dto);
    const { fileName, mimeType, rowCount, content } = exportResult.data;

    if (!this.mailerService) {
      throw new InternalServerErrorException(
        'Mailer service is not configured',
      );
    }

    await this.mailerService.sendEmail(
      dto.email,
      `DeliveryWays ${this.getReportExportLabel(dto.type)} export`,
      [
        `Hi,`,
        '',
        `Your ${this.getReportExportLabel(dto.type)} export is attached.`,
        `Rows: ${rowCount}`,
        `File: ${fileName}`,
        '',
        'DeliveryWays',
      ].join('\n'),
      {
        attachments: [
          {
            filename: fileName,
            content: Buffer.from(content, 'utf8'),
            contentType: mimeType,
          },
        ],
      },
    );

    return {
      data: {
        type: dto.type,
        sentTo: dto.email,
        fileName,
        mimeType,
        rowCount,
      },
      message: 'Report export generated and sent successfully',
    };
  }

  async listGeneratedInvoices(
    user: AuthUserContext,
    query: AdminGeneratedInvoicesQueryDto,
  ) {
    const scope = await this.resolveScope(
      user,
      query.restaurantId,
      query.branchId,
    );
    const invoices = await this.adminReportsRepository.listGeneratedInvoices(
      scope,
      {
        ...query,
        restaurantId: scope.restaurantId,
        branchId: scope.branchId,
      },
    );

    return {
      data: invoices.map((invoice) => this.toGeneratedInvoiceSummary(invoice)),
      message: 'Generated invoices fetched successfully',
    };
  }

  async cancelGeneratedInvoice(user: AuthUserContext, invoiceId: string) {
    this.ensureSuperAdmin(user);
    const invoice =
      await this.adminReportsRepository.findGeneratedInvoiceByIdUnscoped(
        invoiceId,
      );
    if (!invoice) {
      throw new NotFoundException('Generated invoice not found');
    }
    if (invoice.status === GeneratedInvoiceStatus.CANCELLED) {
      throw new BadRequestException('Generated invoice is already cancelled');
    }

    const cancelled = await this.adminReportsRepository.cancelGeneratedInvoice(
      invoiceId,
      user.uid,
    );
    if (!cancelled) {
      throw new BadRequestException('Generated invoice cannot be cancelled');
    }

    return {
      data: this.toGeneratedInvoiceSummary(cancelled),
      message: 'Generated invoice cancelled successfully',
    };
  }

  async recreateGeneratedInvoice(user: AuthUserContext, invoiceId: string) {
    this.ensureSuperAdmin(user);
    const cancelled =
      await this.adminReportsRepository.findGeneratedInvoiceByIdUnscoped(
        invoiceId,
      );
    if (!cancelled) {
      throw new NotFoundException('Generated invoice not found');
    }
    if (cancelled.status !== GeneratedInvoiceStatus.CANCELLED) {
      throw new BadRequestException(
        'Only a cancelled generated invoice can be recreated',
      );
    }

    const version = randomUUID().slice(0, 8).toUpperCase();
    const invoice = await this.adminReportsRepository.recreateGeneratedInvoice({
      cancelledInvoiceId: cancelled.id,
      invoiceNumber: `${cancelled.invoiceNumber.slice(0, 89)}-R-${version}`,
      sourceKey: `${cancelled.sourceKey.slice(0, 244)}:R:${version}`,
      actorId: user.uid,
    });

    return {
      data: this.toGeneratedInvoiceSummary(invoice),
      message: 'Generated invoice recreated successfully',
    };
  }

  async downloadGeneratedInvoicePdf(
    user: AuthUserContext,
    invoiceId: string,
    query: AdminGeneratedInvoicePdfQueryDto,
  ) {
    const scope = await this.resolveScope(
      user,
      query.restaurantId,
      query.branchId,
    );
    const invoice = await this.adminReportsRepository.findGeneratedInvoiceById(
      scope,
      invoiceId,
    );

    if (!invoice) {
      throw new NotFoundException('Generated invoice not found');
    }
    if (query.kind && invoice.kind !== query.kind) {
      throw new NotFoundException('Generated invoice not found');
    }

    if (invoice.kind === GeneratedInvoiceKind.ORDER && invoice.orderId) {
      return this.downloadInvoicePdf(user, invoice.orderId, query);
    }

    if (
      this.packagePlansService &&
      (invoice.kind === GeneratedInvoiceKind.SUBSCRIPTION ||
        invoice.kind === GeneratedInvoiceKind.WEEKLY_PAYOUT)
    ) {
      const content = this.packagePlansService.generateStoredInvoicePdf(
        invoice.kind,
        invoice.snapshot,
      );
      await this.invoiceRecordsService?.recordDownload(invoice.id, user.uid);

      return {
        fileName: `${invoice.invoiceNumber}.pdf`,
        mimeType: 'application/pdf',
        content,
      };
    }

    const snapshot = this.asObject(invoice.snapshot);
    const restaurant = this.asObject(snapshot.restaurant);
    const tenant = this.asObject(snapshot.tenant);
    const totals = this.asObject(snapshot.totals);
    const content = this.buildSimplePdf([
      'DeliveryWay Generated Invoice',
      '',
      `Invoice: ${invoice.invoiceNumber}`,
      `Type: ${invoice.kind.replaceAll('_', ' ')}`,
      `Status: ${invoice.status}`,
      `Issued: ${invoice.createdAt.toISOString()}`,
      `Tenant: ${typeof tenant.name === 'string' ? tenant.name : (invoice.tenantId ?? 'N/A')}`,
      `Restaurant: ${typeof restaurant.name === 'string' ? restaurant.name : (invoice.restaurantId ?? 'N/A')}`,
      `Period From: ${this.formatDate(invoice.periodFrom)}`,
      `Period To: ${this.formatDate(invoice.periodTo)}`,
      `Currency: ${invoice.currency}`,
      `Total: ${this.formatMoney(Number(invoice.totalAmount))}`,
      ...Object.entries(totals)
        .filter(
          ([, value]) => typeof value === 'number' || typeof value === 'string',
        )
        .map(([key, value]) => `${key}: ${String(value)}`),
    ]);

    await this.invoiceRecordsService?.recordDownload(invoice.id, user.uid);

    return {
      fileName: `${invoice.invoiceNumber}.pdf`,
      mimeType: 'application/pdf',
      content,
    };
  }

  async listInvoices(user: AuthUserContext, query: AdminInvoicesQueryDto) {
    const scope = await this.resolveScope(
      user,
      query.restaurantId,
      query.branchId,
    );
    const invoices = await this.adminReportsRepository.listInvoices(scope, {
      ...query,
      restaurantId: scope.restaurantId,
      branchId: scope.branchId,
    });

    return {
      data: invoices.map((invoice) => this.toInvoiceSummary(invoice)),
      message: 'Invoices fetched successfully',
    };
  }

  async getInvoice(
    user: AuthUserContext,
    orderId: string,
    query: AdminReportsScopedQueryDto,
  ) {
    const scope = await this.resolveScope(
      user,
      query.restaurantId,
      query.branchId,
    );
    const invoice = await this.adminReportsRepository.findInvoiceOrder(
      scope,
      orderId,
      {
        restaurantId: scope.restaurantId,
        branchId: scope.branchId,
      },
    );

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const details = await this.toInvoiceDetails(invoice);
    await this.persistOrderInvoice(user, invoice, details);

    return {
      data: details,
      message: 'Invoice fetched successfully',
    };
  }

  async downloadInvoicePdf(
    user: AuthUserContext,
    orderId: string,
    query: AdminReportsScopedQueryDto,
  ) {
    const invoice = await this.getInvoiceOrder(user, orderId, query);
    const details = await this.toInvoiceDetails(invoice);
    const invoiceNumber = details.invoiceNumber;

    const content = await this.generateInvoicePdf(invoice);
    await this.persistOrderInvoice(user, invoice, details, {
      eventType: GeneratedInvoiceEventType.DOWNLOADED,
    });

    return {
      fileName: `${invoiceNumber}.pdf`,
      mimeType: 'application/pdf',
      content,
    };
  }

  async sendInvoiceEmail(
    user: AuthUserContext,
    orderId: string,
    query: AdminReportsScopedQueryDto,
  ) {
    const invoice = await this.getInvoiceOrder(user, orderId, query);

    const details = await this.toInvoiceDetails(invoice);
    const invoiceNumber = details.invoiceNumber;
    const fileName = `${invoiceNumber}.pdf`;
    const pdf = await this.generateInvoicePdf(invoice);
    const recipientEmail = invoice.customer.email;

    if (!this.mailerService) {
      throw new InternalServerErrorException(
        'Mailer service is not configured',
      );
    }

    await this.mailerService.sendEmail(
      recipientEmail,
      `Invoice ${invoiceNumber} for order ${invoice.id}`,
      this.buildInvoiceEmailBody(
        invoice,
        invoiceNumber,
        details.payment.currency,
      ),
      {
        attachments: [
          {
            filename: fileName,
            content: pdf,
            contentType: 'application/pdf',
          },
        ],
      },
    );

    return {
      data: {
        invoiceNumber,
        orderId: invoice.id,
        sentTo: recipientEmail,
        fileName,
        mimeType: 'application/pdf',
      },
      message: 'Invoice generated and sent successfully',
    };
  }

  private async getInvoiceOrder(
    user: AuthUserContext,
    orderId: string,
    query: AdminReportsScopedQueryDto,
  ) {
    const scope = await this.resolveScope(
      user,
      query.restaurantId,
      query.branchId,
    );
    const invoice = await this.adminReportsRepository.findInvoiceOrder(
      scope,
      orderId,
      {
        restaurantId: scope.restaurantId,
        branchId: scope.branchId,
      },
    );

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return invoice;
  }

  async getOrdersReport(
    user: AuthUserContext,
    query: AdminOrdersReportQueryDto,
  ) {
    const scope = await this.resolveScope(
      user,
      query.restaurantId,
      query.branchId,
    );
    const data = await this.adminReportsRepository.getOrdersReport(scope, {
      ...query,
      restaurantId: scope.restaurantId,
      branchId: scope.branchId,
    });
    const currency =
      (await this.globalSettingsService?.getDefaultCurrencyCode()) ?? 'EUR';

    return {
      data: {
        ...data,
        currency,
        filters: {
          restaurantId: scope.restaurantId ?? null,
          branchId: scope.branchId ?? null,
          fromDate: query.fromDate ?? null,
          toDate: query.toDate ?? null,
          status: query.status ?? null,
          orderType: query.orderType ?? null,
          paymentStatus: query.paymentStatus ?? null,
          kind: query.kind ?? null,
        },
      },
      message: 'Orders report fetched successfully',
    };
  }

  async getFinancialReport(
    user: AuthUserContext,
    query: AdminFinancialReportQueryDto,
  ) {
    const scope = await this.resolveScope(
      user,
      query.restaurantId,
      query.branchId,
    );
    const [data, payoutSummary] = await Promise.all([
      this.adminReportsRepository.getFinancialReport(scope, {
        ...query,
        restaurantId: scope.restaurantId,
        branchId: scope.branchId,
      }),
      scope.restaurantId && !scope.branchId
        ? (this.packagePlansService?.getRestaurantPayoutBalanceSummary(
            scope.restaurantId,
          ) ?? Promise.resolve(null))
        : Promise.resolve(null),
    ]);
    const currency =
      (await this.globalSettingsService?.getDefaultCurrencyCode()) ?? 'EUR';

    return {
      data: {
        ...data,
        payoutSummary,
        availablePayoutAmount: payoutSummary?.restaurantPayoutAmount ?? null,
        currency,
        filters: {
          restaurantId: scope.restaurantId ?? null,
          branchId: scope.branchId ?? null,
          fromDate: query.fromDate ?? null,
          toDate: query.toDate ?? null,
        },
      },
      message: 'Financial report fetched successfully',
    };
  }

  private generateReportExport(
    user: AuthUserContext,
    dto: AdminEmailReportExportDto,
  ) {
    if (dto.type === 'menu') {
      return this.exportMenuCsv(user, dto);
    }

    if (dto.type === 'orders') {
      return this.exportOrdersCsv(user, dto);
    }

    if (dto.type === 'deliverymen') {
      return this.exportDeliverymenCsv(user, {
        restaurantId: dto.restaurantId,
        branchId: dto.branchId,
        search: dto.search,
        isActive: dto.isActive,
      });
    }

    if (
      dto.type === 'coupons' ||
      dto.type === 'promotions' ||
      dto.type === 'happy-hours'
    ) {
      return this.exportCampaignsCsv(
        user,
        {
          restaurantId: dto.restaurantId,
          branchId: dto.branchId,
          search: dto.search,
          isActive: dto.isActive,
        },
        dto.type,
      );
    }

    return this.exportCustomersCsv(user, dto);
  }

  private getReportExportLabel(type: AdminEmailReportExportDto['type']) {
    if (type === 'menu') {
      return 'menu';
    }

    if (type === 'orders') {
      return 'orders';
    }

    if (type === 'deliverymen') {
      return 'deliverymen';
    }

    if (type === 'coupons' || type === 'promotions' || type === 'happy-hours') {
      return this.getCampaignExportLabel(type);
    }

    return 'customers';
  }

  private getCampaignExportLabel(
    type: 'coupons' | 'promotions' | 'happy-hours',
  ) {
    if (type === 'happy-hours') {
      return 'Happy hours';
    }

    return type === 'coupons' ? 'Coupons' : 'Promotions';
  }

  private async generateInvoicePdf(invoice: InvoiceOrder) {
    const summary = await this.toInvoiceDetails(invoice);
    const business = summary.business;
    const customer = summary.customer;

    return InvoicePdfBuilder.build({
      title: `Order Invoice ${summary.invoiceNumber}`,
      subtitle: `${summary.restaurant.name} · ${summary.branch.name}`,
      invoiceNumber: summary.invoiceNumber,
      issuedAt: summary.issuedAt,
      brandName: business.name,
      meta: [
        { label: 'Order ID', value: summary.orderId },
        { label: 'Paid At', value: this.formatDate(summary.paidAt) },
        { label: 'Order Type', value: summary.orderType },
        { label: 'Payment Status', value: summary.paymentStatus },
        { label: 'Currency', value: summary.payment.currency },
      ],
      sections: [
        {
          title: 'Seller',
          rows: [
            business.name,
            `Address: ${business.billingAddress.formatted ?? 'N/A'}`,
            `Email: ${business.email ?? 'N/A'}`,
            `Phone: ${business.phone ?? 'N/A'}`,
            `Tax/VAT No: ${business.taxNumber ?? 'N/A'}`,
          ],
        },
        {
          title: 'Customer',
          rows: [
            customer.name,
            `Email: ${customer.email}`,
            `Phone: ${customer.phone ?? 'N/A'}`,
            `Address: ${summary.customerBillingAddress.formatted ?? 'N/A'}`,
          ],
        },
        {
          title: 'Items',
          rows: summary.items.map(
            (item) =>
              `${item.menuItemName}${item.variationName ? ` (${item.variationName})` : ''} x${item.quantity} @ ${this.formatMoney(item.unitPrice)}${item.depositAmount > 0 ? ` + Pfand ${this.formatMoney(item.depositAmount)}` : ''} = ${this.formatMoney(item.lineTotal)}`,
          ),
        },
        {
          title: 'Totals',
          rows: [
            `Subtotal: ${this.formatMoney(summary.subtotal)}`,
            `${summary.taxBreakdown.label}${
              summary.taxBreakdown.ratePercentage > 0
                ? ` (${summary.taxBreakdown.ratePercentage}%)`
                : ''
            }: ${this.formatMoney(summary.taxAmount)}`,
            `Delivery Fee: ${this.formatMoney(summary.deliveryFee)}`,
            `Discount: ${this.formatMoney(summary.discountAmount)}`,
            `Wallet Applied: ${this.formatMoney(summary.walletAppliedAmount)}`,
            `Loyalty Discount: ${this.formatMoney(summary.loyaltyDiscountAmount)}`,
            `Total: ${this.formatMoney(summary.totalAmount)} ${summary.payment.currency}`,
          ],
        },
        {
          title: 'Bank Details',
          rows: [
            `Account Holder: ${business.bankDetails.accountHolder ?? 'N/A'}`,
            `Bank Name: ${business.bankDetails.bankName ?? 'N/A'}`,
            `IBAN/Account: ${business.bankDetails.iban ?? business.bankDetails.accountNumber ?? 'N/A'}`,
          ],
        },
      ],
    });
  }

  private async persistOrderInvoice(
    user: AuthUserContext,
    invoice: InvoiceOrder,
    details: Awaited<ReturnType<AdminReportsService['toInvoiceDetails']>>,
    options: {
      eventType?: GeneratedInvoiceEventType;
      recipientEmail?: string;
      status?: GeneratedInvoiceStatus;
    } = {},
  ) {
    if (!this.invoiceRecordsService) return;

    await this.invoiceRecordsService.persist({
      invoiceNumber: details.invoiceNumber,
      kind: GeneratedInvoiceKind.ORDER,
      status: options.status,
      sourceKey: invoice.id,
      tenantId: invoice.tenantId,
      restaurantId: invoice.restaurantId,
      branchId: invoice.branchId,
      customerId: invoice.customer.id,
      orderId: invoice.id,
      periodFrom: details.servicePeriod.from,
      periodTo: details.servicePeriod.to,
      currency: details.payment.currency,
      totalAmount: details.totalAmount,
      snapshot: details as unknown as Prisma.InputJsonValue,
      actorId: user.uid,
      eventType: options.eventType,
      recipientEmail: options.recipientEmail,
    });
  }

  private buildInvoiceEmailBody(
    invoice: InvoiceOrder,
    invoiceNumber: string,
    currency: string,
  ) {
    const customerName = this.toInvoiceCustomer(invoice.customer).name;

    return [
      `Hi ${customerName},`,
      '',
      `Please find attached invoice ${invoiceNumber} for your order ${invoice.id}.`,
      '',
      `Restaurant: ${invoice.restaurant.name}`,
      `Branch: ${invoice.branch.name}`,
      `Total: ${this.formatMoney(Number(invoice.totalAmount))} ${currency}`,
      '',
      'Thank you for ordering with DeliveryWays.',
    ].join('\n');
  }

  private buildSimplePdf(lines: string[]) {
    const escapedLines = lines
      .slice(0, 52)
      .map((line) => `0 -14 Td (${this.escapePdfText(line)}) Tj`)
      .join('\n');
    const stream = `BT\n/F1 10 Tf\n50 800 Td\n${escapedLines}\nET`;
    const objects = [
      '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
      '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
      '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
      '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n',
      `5 0 obj\n<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream\nendobj\n`,
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = [0];

    for (const object of objects) {
      offsets.push(Buffer.byteLength(pdf, 'utf8'));
      pdf += object;
    }

    const xrefOffset = Buffer.byteLength(pdf, 'utf8');
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (const offset of offsets.slice(1)) {
      pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

    return Buffer.from(pdf, 'utf8');
  }

  private wrapPdfLine(line: string) {
    const chunks: string[] = [];
    for (let index = 0; index < line.length; index += 78) {
      chunks.push(line.slice(index, index + 78));
    }

    return chunks.length > 0 ? chunks : [''];
  }

  private escapePdfText(text: string) {
    return text
      .replace(/[^\x20-\x7E]/g, '?')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }

  private formatDate(value: Date | null) {
    return value ? value.toISOString().slice(0, 10) : 'N/A';
  }

  private ensureSuperAdmin(user: AuthUserContext) {
    if (user.role !== UserRoleEnum.SUPER_ADMIN) {
      throw new ForbiddenException('Super admin access is required');
    }
  }

  private formatMoney(value: number) {
    return Number(value).toFixed(2);
  }

  private toGeneratedInvoiceSummary(
    invoice: Awaited<
      ReturnType<AdminReportsRepository['listGeneratedInvoices']>
    >[number],
  ) {
    const snapshot = this.asObject(invoice.snapshot);
    const restaurant = this.asObject(snapshot.restaurant);
    const tenant = this.asObject(snapshot.tenant);

    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      kind: invoice.kind,
      status: invoice.status,
      tenantId: invoice.tenantId,
      restaurantId: invoice.restaurantId,
      branchId: invoice.branchId,
      customerId: invoice.customerId,
      orderId: invoice.orderId,
      subscriptionId: invoice.subscriptionId,
      periodFrom: invoice.periodFrom,
      periodTo: invoice.periodTo,
      currency: invoice.currency,
      totalAmount: Number(invoice.totalAmount),
      sentCount: invoice.sentCount,
      downloadedCount: invoice.downloadedCount,
      lastSentAt: invoice.lastSentAt,
      lastSentTo: invoice.lastSentTo,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
      documentType:
        typeof snapshot.documentType === 'string'
          ? snapshot.documentType
          : null,
      restaurant:
        invoice.restaurantId && typeof restaurant.name === 'string'
          ? { id: invoice.restaurantId, name: restaurant.name }
          : null,
      tenant:
        invoice.tenantId && typeof tenant.name === 'string'
          ? { id: invoice.tenantId, name: tenant.name }
          : null,
    };
  }

  private toInvoiceSummary(
    invoice: Awaited<
      ReturnType<AdminReportsRepository['listInvoices']>
    >[number],
  ) {
    return {
      invoiceNumber: this.buildInvoiceNumber(invoice.id),
      orderId: invoice.id,
      restaurant: invoice.restaurant,
      branch: invoice.branch,
      customer: this.toInvoiceCustomer(invoice.customer),
      orderType: invoice.orderType,
      orderStatus: invoice.status,
      paymentStatus: invoice.paymentStatus,
      paymentMethod: invoice.paymentMethod,
      subtotal: Number(invoice.subtotal),
      taxAmount: Number(invoice.taxAmount),
      deliveryFee: Number(invoice.deliveryFee),
      discountAmount: Number(invoice.discountAmount),
      walletAppliedAmount: Number(invoice.walletAppliedAmount),
      loyaltyDiscountAmount: Number(invoice.loyaltyDiscountAmount),
      totalAmount: Number(invoice.totalAmount),
      paidAt: invoice.paidAt,
      issuedAt: invoice.createdAt,
      dueAt: invoice.paymentStatus === 'PAID' ? invoice.paidAt : null,
      orderTime: invoice.orderTime,
      itemsCount: invoice._count.items,
      transactions: invoice.transactions.map((transaction) => ({
        ...transaction,
        amount: Number(transaction.amount),
      })),
    };
  }

  private async toInvoiceDetails(
    invoice: NonNullable<
      Awaited<ReturnType<AdminReportsRepository['findInvoiceOrder']>>
    >,
  ) {
    const fallbackCurrency =
      (await this.globalSettingsService?.getDefaultCurrencyCode()) ?? 'PKR';
    const business = this.toInvoiceBusiness(invoice, fallbackCurrency);
    const customerBillingAddress = this.toInvoiceAddress(
      invoice.deliveryAddress,
    );
    const taxBreakdown = this.toInvoiceTaxBreakdown(invoice);

    return {
      ...this.toInvoiceSummary({
        ...invoice,
        _count: { items: invoice.items.length },
      }),
      tenantId: invoice.tenantId,
      couponCode: invoice.coupon?.code ?? null,
      business,
      customerBillingAddress,
      servicePeriod: {
        from: invoice.orderTime ?? invoice.createdAt,
        to: invoice.deliveredAt ?? invoice.paidAt ?? invoice.createdAt,
      },
      taxBreakdown,
      payment: {
        method: invoice.paymentMethod,
        status: invoice.paymentStatus,
        currency: business.currency,
        paidAt: invoice.paidAt,
        providerReference: invoice.transactions[0]?.providerRef ?? null,
      },
      items: invoice.items.map((item) => ({
        ...item,
        unitPrice: Number(item.unitPrice),
        depositAmount: Number(item.depositAmount),
        lineTotal: Number(item.lineTotal),
      })),
      totals: {
        subtotal: Number(invoice.subtotal),
        taxAmount: Number(invoice.taxAmount),
        deliveryFee: Number(invoice.deliveryFee),
        discountAmount: Number(invoice.discountAmount),
        walletAppliedAmount: Number(invoice.walletAppliedAmount),
        loyaltyDiscountAmount: Number(invoice.loyaltyDiscountAmount),
        totalAmount: Number(invoice.totalAmount),
      },
    };
  }

  private toInvoiceCustomer(customer: {
    id: string;
    email: string;
    profile: {
      firstName: string | null;
      lastName: string | null;
      phone: string | null;
    } | null;
  }) {
    return {
      id: customer.id,
      email: customer.email,
      firstName: customer.profile?.firstName ?? null,
      lastName: customer.profile?.lastName ?? null,
      phone: customer.profile?.phone ?? null,
      name:
        `${customer.profile?.firstName ?? ''} ${customer.profile?.lastName ?? ''}`.trim() ||
        customer.email,
    };
  }

  private toInvoiceBusiness(invoice: InvoiceOrder, fallbackCurrency: string) {
    const restaurantSettings = this.asObject(invoice.restaurant.settings);
    const branchSettings = this.asObject(invoice.branch.settings);
    const supportContact = this.asObject(invoice.restaurant.supportContact);
    const currency = fallbackCurrency;

    return {
      id: invoice.restaurant.id,
      name:
        this.readSettingsString(
          [branchSettings, restaurantSettings],
          [
            ['invoice', 'businessName'],
            ['billing', 'businessName'],
            ['legalName'],
          ],
        ) ?? invoice.restaurant.name,
      tradeName: invoice.restaurant.name,
      branchName: invoice.branch.name,
      email:
        this.readSettingsString(
          [branchSettings, restaurantSettings],
          [['invoice', 'email'], ['billing', 'email'], ['email']],
        ) ?? this.readStringValue(supportContact.email),
      phone:
        this.readSettingsString(
          [branchSettings, restaurantSettings],
          [
            ['invoice', 'phone'],
            ['billing', 'phone'],
            ['contact', 'phone'],
            ['phone'],
          ],
        ) ?? this.readStringValue(supportContact.phone),
      taxNumber: this.readSettingsString(
        [branchSettings, restaurantSettings],
        [
          ['invoice', 'taxNumber'],
          ['invoice', 'vatNumber'],
          ['billing', 'taxNumber'],
          ['billing', 'vatNumber'],
          ['taxNumber'],
          ['vatNumber'],
        ],
      ),
      registrationNumber: this.readSettingsString(
        [branchSettings, restaurantSettings],
        [
          ['invoice', 'registrationNumber'],
          ['billing', 'registrationNumber'],
          ['registrationNumber'],
        ],
      ),
      currency,
      billingAddress: this.readSettingsAddress([
        branchSettings,
        restaurantSettings,
      ]),
      bankDetails: this.readSettingsBankDetails([
        branchSettings,
        restaurantSettings,
      ]),
    };
  }

  private toInvoiceTaxBreakdown(invoice: InvoiceOrder) {
    const subtotal = Number(invoice.subtotal);
    const taxAmount = Number(invoice.taxAmount);

    return {
      label: 'VAT/Tax (inclusive)',
      taxableAmount: subtotal,
      taxAmount,
      ratePercentage:
        subtotal > 0 ? Number(((taxAmount / subtotal) * 100).toFixed(2)) : 0,
    };
  }

  private readSettingsAddress(settings: Record<string, unknown>[]) {
    for (const source of settings) {
      const address = this.asObject(
        this.readFirstPath(source, [
          ['invoice', 'billingAddress'],
          ['invoice', 'businessAddress'],
          ['billing', 'address'],
          ['billingAddress'],
          ['address'],
        ]),
      );
      const result = this.toInvoiceAddress({
        street: this.readStringValue(address.street),
        area: this.readStringValue(address.area),
        postalCode: this.readStringValue(address.postalCode),
        city: this.readStringValue(address.city),
        state: this.readStringValue(address.state),
        country: this.readStringValue(address.country),
      });

      if (result.formatted) {
        return result;
      }
    }

    return this.toInvoiceAddress(null);
  }

  private readSettingsBankDetails(settings: Record<string, unknown>[]) {
    const bank = this.asObject(
      settings
        .map((source) =>
          this.readFirstPath(source, [
            ['invoice', 'bankDetails'],
            ['billing', 'bankDetails'],
            ['bankDetails'],
          ]),
        )
        .find((value) => value && typeof value === 'object'),
    );

    return {
      accountHolder: this.readStringValue(bank.accountHolder),
      bankName: this.readStringValue(bank.bankName),
      accountNumber: this.readStringValue(bank.accountNumber),
      iban: this.readStringValue(bank.iban),
      bic: this.readStringValue(bank.bic),
      routingNumber: this.readStringValue(bank.routingNumber),
    };
  }

  private toInvoiceAddress(
    address:
      | {
          street?: string | null;
          area?: string | null;
          postalCode?: string | null;
          city?: string | null;
          state?: string | null;
          country?: string | null;
        }
      | null
      | undefined,
  ) {
    const normalizePart = (value?: string | null) => {
      const normalized = value?.trim().replace(/^[,\s]+|[,\s]+$/g, '');
      return normalized || null;
    };
    const street = normalizePart(address?.street);
    const area = normalizePart(address?.area);
    const postalCode = normalizePart(address?.postalCode);
    const city = normalizePart(address?.city);
    const state = normalizePart(address?.state);
    const country = normalizePart(address?.country);
    const locality = [postalCode, city].filter(Boolean).join(' ') || null;
    const seen = new Set<string>();
    const parts = [street, area, locality, state, country].filter(
      (part): part is string => {
        if (!part) return false;

        const key = part.toLocaleLowerCase();
        if (seen.has(key)) return false;

        seen.add(key);
        return true;
      },
    );

    return {
      street,
      area,
      postalCode,
      city,
      state,
      country,
      formatted: parts.length ? parts.join(', ') : null,
    };
  }

  private readSettingsString(
    settings: Record<string, unknown>[],
    paths: string[][],
  ) {
    for (const source of settings) {
      const value = this.readFirstPath(source, paths);
      const text = this.readStringValue(value);

      if (text) {
        return text;
      }
    }

    return null;
  }

  private readFirstPath(source: Record<string, unknown>, paths: string[][]) {
    for (const path of paths) {
      const value = this.readPath(source, path);

      if (value !== undefined && value !== null) {
        return value;
      }
    }

    return undefined;
  }

  private readPath(source: Record<string, unknown>, path: string[]) {
    let current: unknown = source;

    for (const segment of path) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return undefined;
      }

      current = (current as Record<string, unknown>)[segment];
    }

    return current;
  }

  private asObject(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private readStringValue(value: unknown) {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : null;
  }

  private buildInvoiceNumber(orderId: string) {
    return `INV-${orderId.slice(-8).toUpperCase()}`;
  }

  private async resolveScope(
    user: AuthUserContext,
    requestedRestaurantId?: string,
    requestedBranchId?: string,
  ): Promise<AdminReportsScope> {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      if (requestedBranchId) {
        const branch =
          await this.adminReportsRepository.findBranchScope(requestedBranchId);
        if (!branch) {
          throw new NotFoundException('Branch not found');
        }

        if (
          requestedRestaurantId &&
          requestedRestaurantId !== branch.restaurantId
        ) {
          throw new BadRequestException(
            'branchId does not belong to the provided restaurantId',
          );
        }

        return {
          tenantId: branch.tenantId,
          restaurantId: branch.restaurantId,
          branchId: branch.id,
        };
      }

      if (requestedRestaurantId) {
        const restaurant =
          await this.adminReportsRepository.findRestaurantScope(
            requestedRestaurantId,
          );
        if (!restaurant) {
          throw new NotFoundException('Restaurant not found');
        }

        return {
          tenantId: restaurant.tenantId,
          restaurantId: restaurant.id,
        };
      }

      return {};
    }

    if (this.isStaffActor(user)) {
      return this.resolveStaffScope(
        user,
        requestedRestaurantId,
        requestedBranchId,
      );
    }

    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    if (user.role === UserRoleEnum.BRANCH_ADMIN) {
      if (!user.rid || !user.bid) {
        throw new ForbiddenException('Branch context is required');
      }

      if (requestedRestaurantId && requestedRestaurantId !== user.rid) {
        throw new ForbiddenException(
          'You cannot access resources outside your restaurant',
        );
      }

      if (requestedBranchId && requestedBranchId !== user.bid) {
        throw new ForbiddenException(
          'You cannot access resources outside your branch',
        );
      }

      return {
        tenantId: user.tid,
        restaurantId: user.rid,
        branchId: user.bid,
      };
    }

    if (requestedBranchId) {
      const branch = await this.adminReportsRepository.findBranchScope(
        requestedBranchId,
        user.tid,
        user.rid,
      );
      if (!branch) {
        throw new ForbiddenException(
          'You cannot access resources outside your tenant restaurants',
        );
      }

      if (
        requestedRestaurantId &&
        requestedRestaurantId !== branch.restaurantId
      ) {
        throw new BadRequestException(
          'branchId does not belong to the provided restaurantId',
        );
      }

      return {
        tenantId: user.tid,
        restaurantId: branch.restaurantId,
        branchId: branch.id,
      };
    }

    if (user.rid) {
      if (requestedRestaurantId && requestedRestaurantId !== user.rid) {
        throw new ForbiddenException(
          'You cannot access resources outside your restaurant',
        );
      }

      return {
        tenantId: user.tid,
        restaurantId: user.rid,
      };
    }

    if (requestedRestaurantId) {
      const restaurant = await this.adminReportsRepository.findRestaurantScope(
        requestedRestaurantId,
        user.tid,
      );
      if (!restaurant) {
        throw new ForbiddenException(
          'You cannot access resources outside your tenant restaurants',
        );
      }

      return {
        tenantId: user.tid,
        restaurantId: restaurant.id,
      };
    }

    throw new BadRequestException('restaurantId is required');
  }

  private async resolveStaffScope(
    user: AuthUserContext,
    requestedRestaurantId?: string,
    requestedBranchId?: string,
  ): Promise<AdminReportsScope> {
    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    const allRestaurants =
      user.restaurantAccess?.allRestaurants === true ||
      user.restaurantAccess?.hasAllRestaurantsAccess === true;
    const allowedRestaurantIds = new Set([
      ...(user.restaurantAccess?.restaurantIds ?? []),
      ...(user.rid ? [user.rid] : []),
    ]);

    if (requestedBranchId) {
      const branch = await this.adminReportsRepository.findBranchScope(
        requestedBranchId,
        user.tid,
      );
      if (
        !branch ||
        (!allRestaurants && !allowedRestaurantIds.has(branch.restaurantId))
      ) {
        throw new ForbiddenException(
          'You cannot access resources outside your assigned restaurants',
        );
      }
      if (
        requestedRestaurantId &&
        requestedRestaurantId !== branch.restaurantId
      ) {
        throw new BadRequestException(
          'branchId does not belong to the provided restaurantId',
        );
      }

      return {
        tenantId: branch.tenantId,
        restaurantId: branch.restaurantId,
        branchId: branch.id,
      };
    }

    const restaurantId =
      requestedRestaurantId ??
      user.rid ??
      (allowedRestaurantIds.size === 1
        ? [...allowedRestaurantIds][0]
        : undefined);

    if (!restaurantId) {
      if (allRestaurants) {
        return { tenantId: user.tid };
      }

      throw new BadRequestException('restaurantId is required');
    }

    if (!allRestaurants && !allowedRestaurantIds.has(restaurantId)) {
      throw new ForbiddenException(
        'You cannot access resources outside your assigned restaurants',
      );
    }

    if (restaurantId === user.rid) {
      return {
        tenantId: user.tid,
        restaurantId,
      };
    }

    const restaurant = await this.adminReportsRepository.findRestaurantScope(
      restaurantId,
      user.tid,
    );
    if (!restaurant) {
      throw new ForbiddenException(
        'You cannot access resources outside your assigned restaurants',
      );
    }

    return {
      tenantId: restaurant.tenantId,
      restaurantId: restaurant.id,
    };
  }

  private isStaffActor(user: AuthUserContext): boolean {
    return user.actorType === 'STAFF' || user.role === UserRoleEnum.STAFF;
  }

  private buildFileName(prefix: string, scope: AdminReportsScope) {
    const parts = [prefix];
    if (scope.restaurantId) {
      parts.push(scope.restaurantId);
    }
    if (scope.branchId) {
      parts.push(scope.branchId);
    }
    parts.push(new Date().toISOString().slice(0, 10));
    return `${parts.join('-')}.csv`;
  }

  private toCsv(rows: Array<Record<string, unknown>>) {
    if (!rows.length) {
      return '';
    }

    const headers = Object.keys(rows[0]);
    const lines = [
      headers.join(','),
      ...rows.map((row) =>
        headers.map((header) => this.escapeCsvValue(row[header])).join(','),
      ),
    ];

    return lines.join('\n');
  }

  private escapeCsvValue(value: unknown) {
    if (value === null || value === undefined) {
      return '';
    }

    let rawValue: string;
    if (typeof value === 'object') {
      rawValue = JSON.stringify(value);
    } else if (typeof value === 'string') {
      rawValue = value;
    } else if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      rawValue = value.toString();
    } else {
      rawValue = '';
    }
    const normalized = rawValue.replace(/"/g, '""');
    return /[",\n]/.test(normalized) ? `"${normalized}"` : normalized;
  }
}
