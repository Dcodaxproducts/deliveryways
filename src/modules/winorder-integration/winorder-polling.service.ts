import { Inject, Injectable } from '@nestjs/common';
import { PaymentMethod, WinOrderCatalogMappingType } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import {
  IntegrationOrder,
  ORDERS_INTEGRATION_PORT,
  OrdersIntegrationPort,
} from '../orders';
import { WinOrderConnectionRepository } from './winorder-connection.repository';
import { WinOrderExportRepository } from './winorder-export.repository';
import { WinOrderMachineContext } from './winorder-machine-context';
import { WinOrderMappingRepository } from './winorder-mapping.repository';

type CatalogMapping = {
  externalArticleNo: string | null;
  externalArticleName: string | null;
};

const WINORDER_CASH_PAYMENT_TYPE = 'Barzahlung';
const WINORDER_ONLINE_PAYMENT_TYPE = 'Über DeliveryWay online bezahlt';
const WINORDER_ONLINE_PAYMENT_METHODS: ReadonlySet<string> = new Set([
  PaymentMethod.STRIPE,
  PaymentMethod.PAYPAL,
  PaymentMethod.WALLET,
]);

@Injectable()
export class WinOrderPollingService {
  constructor(
    @Inject(ORDERS_INTEGRATION_PORT)
    private readonly orders: OrdersIntegrationPort,
    private readonly connections: WinOrderConnectionRepository,
    private readonly mappings: WinOrderMappingRepository,
    private readonly exports: WinOrderExportRepository,
  ) {}

  async getNewOrders(machine: WinOrderMachineContext) {
    const scope = {
      tenantId: machine.tenantId,
      restaurantId: machine.restaurantId,
      branchId: machine.branchId,
    };
    const [connection, candidates, mappingSet] = await Promise.all([
      this.connections.findByBranch(scope),
      this.orders.listExportCandidates(scope, 25),
      this.mappings.list(scope, machine.connectionId),
    ]);
    const leaseToken = randomBytes(16).toString('hex');
    const leasedIds = await this.exports.lease(
      machine,
      candidates.map((order) => order.id),
      leaseToken,
      new Date(Date.now() + 5 * 60 * 1000),
    );
    const catalogMappings = new Map(
      mappingSet.catalogMappings.map((mapping) => [
        `${mapping.mappingType}:${mapping.localKey}`,
        mapping,
      ]),
    );
    const paymentMappings = new Map(
      mappingSet.paymentMappings.map((mapping) => [
        mapping.paymentMethod,
        mapping.externalLabel,
      ]),
    );
    const exportedOrders: unknown[] = [];

    for (const order of candidates) {
      if (!leasedIds.has(order.id)) continue;
      try {
        exportedOrders.push(
          this.toPayload(
            order,
            connection?.storeId ?? null,
            connection?.storeName ?? null,
            catalogMappings,
            paymentMappings,
          ),
        );
      } catch (error) {
        await this.exports.markFailed(
          machine,
          order.id,
          error instanceof Error ? error.message : 'Payload mapping failed',
        );
      }
    }

    return {
      OrderList: {
        CreateDateTime: new Date().toISOString(),
        Order: exportedOrders,
      },
    };
  }

  private toPayload(
    order: IntegrationOrder,
    storeId: number | null,
    storeName: string | null,
    catalogMappings: Map<string, CatalogMapping>,
    paymentMappings: Map<string, string>,
  ) {
    const paymentType = this.resolvePaymentType(order, paymentMappings);
    const articles = order.items.map((item) => {
      const localKey = item.variationId
        ? `item:${item.menuItemId}:variation:${item.variationId}`
        : `item:${item.menuItemId}:base`;
      const exactMapping = catalogMappings.get(
        `${WinOrderCatalogMappingType.ITEM}:${localKey}`,
      );
      const mapping =
        exactMapping ??
        (item.variationId
          ? catalogMappings.get(
              `${WinOrderCatalogMappingType.ITEM}:item:${item.menuItemId}:base`,
            )
          : undefined);
      const subArticles = item.modifiers.map((modifier) => {
        const modifierMapping = catalogMappings.get(
          `${WinOrderCatalogMappingType.MODIFIER}:modifier:${modifier.modifierId}`,
        );
        return {
          ArticleNo: modifierMapping?.externalArticleNo ?? undefined,
          ArticleName: modifierMapping?.externalArticleName || modifier.name,
          Count: modifier.quantity,
          Price: modifier.unitPrice,
        };
      });
      return {
        ArticleNo: mapping?.externalArticleNo ?? undefined,
        ArticleName: mapping?.externalArticleName || item.menuItemName,
        ArticleSize: item.variationName ?? undefined,
        Count: item.quantity,
        Price: item.unitPrice,
        Tax: item.taxPercentage ?? undefined,
        Deposit: item.depositAmount || undefined,
        Comment: item.note ?? undefined,
        SubArticleList: subArticles.length
          ? { SubArticle: subArticles }
          : undefined,
      };
    });
    if (order.serviceChargeAmount > 0) {
      const mapping = this.requireMapping(
        catalogMappings,
        WinOrderCatalogMappingType.SERVICE_CHARGE,
        'service_charge',
      );
      articles.push({
        ArticleNo: mapping.externalArticleNo ?? undefined,
        ArticleName: mapping.externalArticleName ?? 'Service charge',
        ArticleSize: undefined,
        Count: 1,
        Price: order.serviceChargeAmount,
        Tax: undefined,
        Deposit: undefined,
        Comment: undefined,
        SubArticleList: undefined,
      });
    }

    return {
      OrderID: order.id,
      AddInfo: {
        DateTimeOrder: order.orderTime?.toISOString(),
        DiscountValue: order.discountAmount || undefined,
        DiscountName: order.discountAmount ? 'Discount' : undefined,
        CurrencyStr: order.currency ?? undefined,
        DeliverLumpSum: order.deliveryFee || undefined,
        DeliveryType: this.deliveryType(order.orderType),
        Comment: order.customerNote ?? undefined,
        PaymentType: paymentType,
        PaymentFee: order.paymentFeeAmount || undefined,
        Tip: order.tipAmount || undefined,
        TransactionID: order.paymentReference ?? undefined,
        Total: order.totalAmount,
      },
      ArticleList: { Article: articles },
      StoreData: {
        StoreId: storeId ?? undefined,
        StoreName: storeName ?? undefined,
      },
      ServerData: {
        Agent: 'DeliveryWays',
        CreateDateTime: order.createdAt.toISOString(),
        Referer: 'DeliveryWays',
      },
      Customer: {
        DeliveryAddress: {
          FirstName: order.customer.firstName ?? undefined,
          LastName: order.customer.lastName ?? undefined,
          Street: order.deliveryAddress?.street,
          AddAddress: order.deliveryAddress?.area ?? undefined,
          Zip: order.deliveryAddress?.postalCode ?? undefined,
          City: order.deliveryAddress?.city,
          Country: order.deliveryAddress?.country,
          EMail: order.customer.email,
          PhoneNo: order.customer.phone ?? undefined,
        },
      },
    };
  }

  private requireMapping(
    mappings: Map<string, CatalogMapping>,
    type: WinOrderCatalogMappingType,
    key: string,
  ): CatalogMapping {
    const mapping = mappings.get(`${type}:${key}`);
    if (!mapping) throw new Error(`Missing catalog mapping: ${key}`);
    return mapping;
  }

  private resolvePaymentType(
    order: IntegrationOrder,
    paymentMappings: Map<string, string>,
  ): string {
    if (order.paymentMethod === PaymentMethod.COD) {
      return WINORDER_CASH_PAYMENT_TYPE;
    }

    const configured = paymentMappings.get(order.paymentMethod);
    if (configured) return configured;

    if (WINORDER_ONLINE_PAYMENT_METHODS.has(order.paymentMethod)) {
      return WINORDER_ONLINE_PAYMENT_TYPE;
    }

    throw new Error(`Missing payment mapping: ${order.paymentMethod}`);
  }

  private deliveryType(orderType: IntegrationOrder['orderType']) {
    if (orderType === 'DELIVERY') return 'delivery';
    if (orderType === 'TAKEAWAY') return 'take-away';
    return 'dine-in';
  }
}
