import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import {
  AdminReportsRepository,
  AdminReportsScope,
} from './admin-reports.repository';
import {
  AdminExportCustomersCsvQueryDto,
  AdminExportMenuCsvQueryDto,
  AdminExportOrdersCsvQueryDto,
  AdminFinancialReportQueryDto,
  AdminInvoicesQueryDto,
  AdminOrdersReportQueryDto,
  AdminReportsScopedQueryDto,
} from './dto';

@Injectable()
export class AdminReportsService {
  constructor(
    private readonly adminReportsRepository: AdminReportsRepository,
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

    return {
      data: this.toInvoiceDetails(invoice),
      message: 'Invoice fetched successfully',
    };
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

    return {
      data: {
        ...data,
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
    const data = await this.adminReportsRepository.getFinancialReport(scope, {
      ...query,
      restaurantId: scope.restaurantId,
      branchId: scope.branchId,
    });

    return {
      data: {
        ...data,
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

  private toInvoiceDetails(
    invoice: NonNullable<
      Awaited<ReturnType<AdminReportsRepository['findInvoiceOrder']>>
    >,
  ) {
    return {
      ...this.toInvoiceSummary({
        ...invoice,
        _count: { items: invoice.items.length },
      }),
      tenantId: invoice.tenantId,
      couponCode: invoice.coupon?.code ?? null,
      items: invoice.items.map((item) => ({
        ...item,
        unitPrice: Number(item.unitPrice),
        lineTotal: Number(item.lineTotal),
      })),
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
