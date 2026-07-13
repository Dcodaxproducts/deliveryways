import { AdminReportsService } from './admin-reports.service';

describe('AdminReportsService', () => {
  it('exports menu csv for business admin token restaurant scope', async () => {
    const repository = {
      exportMenu: jest.fn().mockResolvedValue([
        {
          id: 'item-1',
          name: 'Burger',
          slug: 'burger',
          sku: 'BRG-1',
          pricingMode: 'SINGLE',
          basePrice: 450,
          deliveryPriceAdjustment: 0,
          takeawayPriceAdjustment: 0,
          depositAmount: null,
          prepTimeMinutes: 15,
          isActive: true,
          createdAt: new Date('2026-04-22T00:00:00.000Z'),
          category: {
            id: 'category-1',
            name: 'Burgers',
            slug: 'burgers',
            variations: [{ id: 'var-1' }],
          },
          menuLinks: [{ restaurantMenu: { id: 'menu-1', name: 'Main Menu' } }],
          _count: { modifierLinks: 2 },
        },
      ]),
    };

    const service = new AdminReportsService(repository as never);

    const result = await service.exportMenuCsv(
      {
        uid: 'business-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: 'BUSINESS_ADMIN',
      } as never,
      {},
    );

    expect(repository.exportMenu).toHaveBeenCalledWith(
      {
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
      },
      expect.objectContaining({ restaurantId: 'restaurant-1' }),
    );
    expect(result.data.fileName).toContain('menu-export-restaurant-1');
    expect(result.data.content).toContain('Burger');
  });

  it('returns orders report with branch scope for branch admin', async () => {
    const repository = {
      getOrdersReport: jest.fn().mockResolvedValue({
        totalOrders: 12,
        totalRevenue: 18000,
        averageOrderValue: 1500,
        totalDeliveryFee: 500,
        totalDiscount: 300,
        statusBreakdown: [{ key: 'DELIVERED', count: 8 }],
        orderTypeBreakdown: [{ key: 'DELIVERY', count: 9 }],
        paymentStatusBreakdown: [{ key: 'PAID', count: 10 }],
        topItems: [
          {
            menuItemId: 'item-1',
            menuItemName: 'Burger',
            quantity: 7,
            revenue: 3150,
          },
        ],
      }),
    };

    const service = new AdminReportsService(repository as never);

    const result = await service.getOrdersReport(
      {
        uid: 'branch-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
        role: 'BRANCH_ADMIN',
      } as never,
      {},
    );

    expect(repository.getOrdersReport).toHaveBeenCalledWith(
      {
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
      },
      expect.objectContaining({
        branchId: 'branch-1',
        restaurantId: 'restaurant-1',
      }),
    );
    expect(result.data.totalOrders).toBe(12);
    expect(result.message).toBe('Orders report fetched successfully');
  });

  it('lists generated invoices for business admin scope', async () => {
    const repository = {
      listInvoices: jest.fn().mockResolvedValue([
        {
          id: 'order-12345678',
          restaurantId: 'restaurant-1',
          branchId: 'branch-1',
          orderType: 'DELIVERY',
          status: 'DELIVERED',
          paymentStatus: 'PAID',
          paymentMethod: 'CARD',
          subtotal: 1000,
          taxAmount: 50,
          deliveryFee: 100,
          discountAmount: 25,
          walletAppliedAmount: 0,
          loyaltyDiscountAmount: 0,
          totalAmount: 1125,
          paidAt: new Date('2026-05-12T10:00:00.000Z'),
          createdAt: new Date('2026-05-12T09:55:00.000Z'),
          orderTime: new Date('2026-05-12T09:55:00.000Z'),
          restaurant: {
            id: 'restaurant-1',
            name: 'Restaurant',
            slug: 'restaurant',
          },
          branch: { id: 'branch-1', name: 'Main' },
          customer: {
            id: 'customer-1',
            email: 'customer@test.com',
            profile: { firstName: 'Ali', lastName: 'Khan', phone: '123' },
          },
          transactions: [
            {
              id: 'txn-1',
              type: 'CHARGE',
              status: 'PAID',
              amount: 1125,
              currency: 'PKR',
              paymentMethod: 'CARD',
              providerRef: 'ref-1',
              processedAt: new Date('2026-05-12T10:00:00.000Z'),
              createdAt: new Date('2026-05-12T10:00:00.000Z'),
            },
          ],
          _count: { items: 2 },
        },
      ]),
    };

    const service = new AdminReportsService(repository as never);

    const result = await service.listInvoices(
      {
        uid: 'business-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: 'BUSINESS_ADMIN',
      } as never,
      {},
    );

    expect(repository.listInvoices).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', restaurantId: 'restaurant-1' },
      expect.objectContaining({ restaurantId: 'restaurant-1' }),
    );
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        invoiceNumber: 'INV-12345678',
        totalAmount: 1125,
        itemsCount: 2,
      }),
    );
  });

  it('lists persisted generated invoice history for business admin scope', async () => {
    const repository = {
      listGeneratedInvoices: jest.fn().mockResolvedValue([
        {
          id: 'generated-1',
          invoiceNumber: 'SUB-INV-12345678-20260701',
          kind: 'SUBSCRIPTION',
          status: 'SENT',
          tenantId: 'tenant-1',
          restaurantId: 'restaurant-1',
          branchId: null,
          customerId: null,
          orderId: null,
          subscriptionId: 'subscription-1',
          periodFrom: new Date('2026-06-01T00:00:00.000Z'),
          periodTo: new Date('2026-07-01T00:00:00.000Z'),
          currency: 'PKR',
          totalAmount: 1250,
          sentCount: 1,
          downloadedCount: 0,
          lastSentAt: new Date('2026-07-01T01:00:00.000Z'),
          lastSentTo: 'billing@restaurant.test',
          createdAt: new Date('2026-07-01T00:30:00.000Z'),
          updatedAt: new Date('2026-07-01T01:00:00.000Z'),
          snapshot: {
            documentType: 'INVOICE',
            tenant: { name: 'Tenant One' },
            restaurant: { name: 'Pizza House' },
          },
        },
      ]),
    };

    const service = new AdminReportsService(repository as never);

    const result = await service.listGeneratedInvoices(
      {
        uid: 'business-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: 'BUSINESS_ADMIN',
      } as never,
      { kind: 'SUBSCRIPTION' } as never,
    );

    expect(repository.listGeneratedInvoices).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', restaurantId: 'restaurant-1' },
      expect.objectContaining({
        restaurantId: 'restaurant-1',
        kind: 'SUBSCRIPTION',
      }),
    );
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        invoiceNumber: 'SUB-INV-12345678-20260701',
        kind: 'SUBSCRIPTION',
        totalAmount: 1250,
        documentType: 'INVOICE',
        restaurant: { id: 'restaurant-1', name: 'Pizza House' },
        tenant: { id: 'tenant-1', name: 'Tenant One' },
      }),
    );
  });

  it('returns generated invoice details for branch admin scope', async () => {
    const repository = {
      findInvoiceOrder: jest.fn().mockResolvedValue({
        id: 'order-12345678',
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
        orderType: 'TAKEAWAY',
        status: 'DELIVERED',
        paymentStatus: 'PAID',
        paymentMethod: 'CASH',
        subtotal: 500,
        taxAmount: 0,
        deliveryFee: 0,
        discountAmount: 0,
        walletAppliedAmount: 0,
        loyaltyDiscountAmount: 0,
        totalAmount: 500,
        paidAt: new Date('2026-05-12T10:00:00.000Z'),
        createdAt: new Date('2026-05-12T09:55:00.000Z'),
        orderTime: new Date('2026-05-12T09:55:00.000Z'),
        restaurant: {
          id: 'restaurant-1',
          name: 'Restaurant',
          slug: 'restaurant',
          supportContact: { email: 'billing@restaurant.test', phone: '555' },
          settings: {
            invoice: {
              businessName: 'Restaurant GmbH',
              taxNumber: 'VAT-123',
              billingAddress: {
                street: 'Main Street 1',
                city: 'Berlin',
                country: 'Germany',
              },
              bankDetails: {
                accountHolder: 'Restaurant GmbH',
                bankName: 'Demo Bank',
                iban: 'DE123',
              },
            },
          },
        },
        branch: { id: 'branch-1', name: 'Main', settings: null },
        customer: {
          id: 'customer-1',
          email: 'customer@test.com',
          profile: null,
        },
        coupon: null,
        deliveryAddress: {
          id: 'address-1',
          street: 'Customer Street 2',
          area: null,
          city: 'Berlin',
          state: 'BE',
          country: 'Germany',
        },
        items: [
          {
            id: 'order-item-1',
            menuItemId: 'item-1',
            menuItemName: 'Burger',
            variationId: null,
            variationName: null,
            unitPrice: 500,
            quantity: 1,
            lineTotal: 500,
            note: null,
            snapshotModifiers: null,
            createdAt: new Date('2026-05-12T09:55:00.000Z'),
          },
        ],
        transactions: [],
      }),
    };

    const service = new AdminReportsService(repository as never);

    const result = await service.getInvoice(
      {
        uid: 'branch-admin-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        bid: 'branch-1',
        role: 'BRANCH_ADMIN',
      } as never,
      'order-12345678',
      {},
    );

    expect(repository.findInvoiceOrder).toHaveBeenCalledWith(
      {
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
      },
      'order-12345678',
      { restaurantId: 'restaurant-1', branchId: 'branch-1' },
    );
    expect(result.data.items[0]).toEqual(
      expect.objectContaining({ menuItemName: 'Burger', lineTotal: 500 }),
    );
    expect(result.data.business).toEqual(
      expect.objectContaining({
        name: 'Restaurant GmbH',
        taxNumber: 'VAT-123',
      }),
    );
    expect(result.data.business.billingAddress.formatted).toBe(
      'Main Street 1, Berlin, Germany',
    );
    expect(result.data.business.bankDetails.iban).toBe('DE123');
    expect(result.data.customerBillingAddress.formatted).toBe(
      'Customer Street 2, Berlin, BE, Germany',
    );
    expect(result.data.taxBreakdown).toEqual({
      label: 'VAT/Tax (inclusive)',
      taxableAmount: 500,
      taxAmount: 0,
      ratePercentage: 0,
    });
    expect(result.data.payment).toEqual(
      expect.objectContaining({ currency: 'PKR', providerReference: null }),
    );
    expect(result.message).toBe('Invoice fetched successfully');
  });

  it('returns generated invoice PDF content for download', async () => {
    const repository = {
      findInvoiceOrder: jest.fn().mockResolvedValue({
        id: 'order-12345678',
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
        orderType: 'DELIVERY',
        status: 'DELIVERED',
        paymentStatus: 'PAID',
        paymentMethod: 'CARD',
        subtotal: 1000,
        taxAmount: 50,
        deliveryFee: 100,
        discountAmount: 25,
        walletAppliedAmount: 0,
        loyaltyDiscountAmount: 0,
        totalAmount: 1125,
        paidAt: new Date('2026-05-12T10:00:00.000Z'),
        deliveredAt: new Date('2026-05-12T10:20:00.000Z'),
        createdAt: new Date('2026-05-12T09:55:00.000Z'),
        orderTime: new Date('2026-05-12T09:55:00.000Z'),
        restaurant: {
          id: 'restaurant-1',
          name: 'Restaurant',
          slug: 'restaurant',
          supportContact: null,
          settings: {
            invoice: {
              businessName: 'Restaurant GmbH',
              taxNumber: 'VAT-123',
              bankDetails: { bankName: 'Demo Bank', iban: 'DE123' },
            },
          },
        },
        branch: { id: 'branch-1', name: 'Main', settings: null },
        customer: {
          id: 'customer-1',
          email: 'customer@test.com',
          profile: { firstName: 'Ali', lastName: 'Khan', phone: '123' },
        },
        coupon: null,
        deliveryAddress: null,
        items: [
          {
            id: 'order-item-1',
            menuItemId: 'item-1',
            menuItemName: 'Burger',
            variationId: null,
            variationName: null,
            unitPrice: 1000,
            quantity: 1,
            lineTotal: 1000,
            note: null,
            snapshotModifiers: null,
            createdAt: new Date('2026-05-12T09:55:00.000Z'),
          },
        ],
        transactions: [],
      }),
    };
    const invoiceRecordsService = {
      persist: jest.fn().mockResolvedValue({ id: 'invoice-record-1' }),
    };
    const service = new AdminReportsService(
      repository as never,
      undefined,
      undefined,
      invoiceRecordsService as never,
    );

    const result = await service.downloadInvoicePdf(
      {
        uid: 'business-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: 'BUSINESS_ADMIN',
      } as never,
      'order-12345678',
      {},
    );

    expect(result.fileName).toBe('INV-12345678.pdf');
    expect(result.mimeType).toBe('application/pdf');
    expect(result.content.toString('utf8')).toContain('%PDF-1.4');
    expect(invoiceRecordsService.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceNumber: 'INV-12345678',
        orderId: 'order-12345678',
        eventType: 'DOWNLOADED',
      }),
    );
  });

  it('generates report export CSV and sends it to email', async () => {
    const repository = {
      exportOrders: jest.fn().mockResolvedValue([
        {
          id: 'order-1',
          restaurantId: 'restaurant-1',
          branchId: 'branch-1',
          orderType: 'DELIVERY',
          status: 'DELIVERED',
          paymentStatus: 'PAID',
          paymentMethod: 'CARD',
          subtotal: 1000,
          taxAmount: 50,
          deliveryFee: 100,
          discountAmount: 25,
          totalAmount: 1125,
          createdAt: new Date('2026-05-12T09:55:00.000Z'),
          orderTime: new Date('2026-05-12T09:55:00.000Z'),
          branch: { id: 'branch-1', name: 'Main' },
          customer: {
            id: 'customer-1',
            email: 'customer@test.com',
            profile: { firstName: 'Ali', lastName: 'Khan', phone: '123' },
          },
          items: [
            {
              menuItemName: 'Burger',
              variationName: null,
              quantity: 1,
            },
          ],
          coupon: null,
          deliveryman: null,
        },
      ]),
    };
    const sendEmail = jest.fn<
      Promise<void>,
      [string, string, string, unknown]
    >();
    sendEmail.mockResolvedValue(undefined);
    const mailerService = { sendEmail };
    const service = new AdminReportsService(
      repository as never,
      mailerService as never,
    );

    const result = await service.sendExportEmail(
      {
        uid: 'business-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: 'BUSINESS_ADMIN',
      } as never,
      {
        type: 'orders',
        email: 'manager@test.com',
      } as never,
    );

    expect(repository.exportOrders).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', restaurantId: 'restaurant-1' },
      expect.objectContaining({ restaurantId: 'restaurant-1' }),
    );
    const expectedFileName = `orders-export-restaurant-1-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    expect(mailerService.sendEmail).toHaveBeenCalledWith(
      'manager@test.com',
      'DeliveryWays orders export',
      'Hi,\n\nYour orders export is attached.\nRows: 1\nFile: ' +
        expectedFileName +
        '\n\nDeliveryWays',
      {
        attachments: [
          {
            filename: expectedFileName,
            content: Buffer.from(
              'orderId,restaurantId,branchId,branchName,customerId,customerName,customerEmail,customerPhone,orderType,status,paymentStatus,paymentMethod,itemsCount,itemsSummary,subtotal,taxAmount,deliveryFee,discountAmount,totalAmount,couponCode,deliverymanName,createdAt,orderTime\norder-1,restaurant-1,branch-1,Main,customer-1,Ali Khan,customer@test.com,123,DELIVERY,DELIVERED,PAID,CARD,1,Burger x1,1000,50,100,25,1125,,,2026-05-12T09:55:00.000Z,2026-05-12T09:55:00.000Z',
              'utf8',
            ),
            contentType: 'text/csv',
          },
        ],
      },
    );
    expect(result.data.type).toBe('orders');
    expect(result.data.sentTo).toBe('manager@test.com');
    expect(result.data.mimeType).toBe('text/csv');
    expect(result.data.rowCount).toBe(1);
    expect(result.message).toBe(
      'Report export generated and sent successfully',
    );
  });

  it('generates invoice PDF and sends it to customer email', async () => {
    const repository = {
      findInvoiceOrder: jest.fn().mockResolvedValue({
        id: 'order-12345678',
        tenantId: 'tenant-1',
        restaurantId: 'restaurant-1',
        branchId: 'branch-1',
        orderType: 'DELIVERY',
        status: 'DELIVERED',
        paymentStatus: 'PAID',
        paymentMethod: 'CARD',
        subtotal: 1000,
        taxAmount: 50,
        deliveryFee: 100,
        discountAmount: 25,
        walletAppliedAmount: 0,
        loyaltyDiscountAmount: 0,
        totalAmount: 1125,
        paidAt: new Date('2026-05-12T10:00:00.000Z'),
        createdAt: new Date('2026-05-12T09:55:00.000Z'),
        orderTime: new Date('2026-05-12T09:55:00.000Z'),
        restaurant: {
          id: 'restaurant-1',
          name: 'Restaurant',
          slug: 'restaurant',
        },
        branch: { id: 'branch-1', name: 'Main' },
        customer: {
          id: 'customer-1',
          email: 'customer@test.com',
          profile: { firstName: 'Ali', lastName: 'Khan', phone: '123' },
        },
        coupon: null,
        items: [
          {
            id: 'order-item-1',
            menuItemId: 'item-1',
            menuItemName: 'Burger',
            variationId: null,
            variationName: null,
            unitPrice: 1000,
            quantity: 1,
            lineTotal: 1000,
            note: null,
            snapshotModifiers: null,
            createdAt: new Date('2026-05-12T09:55:00.000Z'),
          },
        ],
        transactions: [
          {
            id: 'txn-1',
            type: 'CHARGE',
            status: 'PAID',
            amount: 1125,
            currency: 'PKR',
            paymentMethod: 'CARD',
            providerRef: 'ref-1',
            processedAt: new Date('2026-05-12T10:00:00.000Z'),
            createdAt: new Date('2026-05-12T10:00:00.000Z'),
          },
        ],
      }),
    };
    const mailerService = { sendEmail: jest.fn().mockResolvedValue(undefined) };
    const service = new AdminReportsService(
      repository as never,
      mailerService as never,
    );

    const result = await service.sendInvoiceEmail(
      {
        uid: 'business-1',
        tid: 'tenant-1',
        rid: 'restaurant-1',
        role: 'BUSINESS_ADMIN',
      } as never,
      'order-12345678',
      {},
    );

    expect(repository.findInvoiceOrder).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', restaurantId: 'restaurant-1' },
      'order-12345678',
      { restaurantId: 'restaurant-1', branchId: undefined },
    );
    expect(mailerService.sendEmail).toHaveBeenCalledWith(
      'customer@test.com',
      'Invoice INV-12345678 for order order-12345678',
      expect.stringContaining('Please find attached invoice INV-12345678'),
      {
        attachments: [
          expect.objectContaining({
            filename: 'INV-12345678.pdf',
            contentType: 'application/pdf',
          }),
        ],
      },
    );
    expect(result).toEqual({
      data: {
        invoiceNumber: 'INV-12345678',
        orderId: 'order-12345678',
        sentTo: 'customer@test.com',
        fileName: 'INV-12345678.pdf',
        mimeType: 'application/pdf',
      },
      message: 'Invoice generated and sent successfully',
    });
  });
});
