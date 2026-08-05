import { Inject, Injectable } from '@nestjs/common';
import { WinOrderCatalogMappingType } from '@prisma/client';
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
  externalArticleNo: string;
  externalArticleName: string | null;
};

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
    const paymentType = paymentMappings.get(order.paymentMethod);
    if (!paymentType) {
      throw new Error(`Missing payment mapping: ${order.paymentMethod}`);
    }
    const articles = order.items.map((item) => {
      const localKey = item.variationId
        ? `item:${item.menuItemId}:variation:${item.variationId}`
        : `item:${item.menuItemId}:base`;
      const mapping = this.requireMapping(
        catalogMappings,
        WinOrderCatalogMappingType.ITEM,
        localKey,
      );
      const subArticles = item.modifiers.map((modifier) => {
        const modifierMapping = this.requireMapping(
          catalogMappings,
          WinOrderCatalogMappingType.MODIFIER,
          `modifier:${modifier.modifierId}`,
        );
        return {
          ArticleNo: modifierMapping.externalArticleNo,
          ArticleName: modifierMapping.externalArticleName ?? modifier.name,
          Count: modifier.quantity,
          Price: modifier.unitPrice,
        };
      });
      return {
        ArticleNo: mapping.externalArticleNo,
        ArticleName: mapping.externalArticleName ?? item.menuItemName,
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
        ArticleNo: mapping.externalArticleNo,
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

  private deliveryType(orderType: IntegrationOrder['orderType']) {
    if (orderType === 'DELIVERY') return 'delivery';
    if (orderType === 'TAKEAWAY') return 'take-away';
    return 'dine-in';
  }
}
