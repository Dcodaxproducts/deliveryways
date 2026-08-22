import { Injectable } from '@nestjs/common';
import { PaymentMethod, WinOrderCatalogMappingType } from '@prisma/client';
import { PrismaService } from '../../database';
import { WinOrderConnectionScope } from './winorder-connection.repository';

@Injectable()
export class WinOrderMappingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(scope: WinOrderConnectionScope, connectionId: string) {
    const [catalogMappings, paymentMappings] = await Promise.all([
      this.prisma.winOrderCatalogMapping.findMany({
        where: { ...scope, connectionId },
        orderBy: [{ mappingType: 'asc' }, { localName: 'asc' }],
      }),
      this.prisma.winOrderPaymentMapping.findMany({
        where: { ...scope, connectionId },
        orderBy: [{ paymentMethod: 'asc' }],
      }),
    ]);
    return { catalogMappings, paymentMappings };
  }

  async replaceCatalog(
    scope: WinOrderConnectionScope,
    connectionId: string,
    mappings: Array<{
      mappingType: WinOrderCatalogMappingType;
      localKey: string;
      localName: string;
      externalArticleNo: string | null;
      externalArticleName: string | null;
    }>,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.winOrderCatalogMapping.deleteMany({
        where: { ...scope, connectionId },
      });
      if (mappings.length) {
        await tx.winOrderCatalogMapping.createMany({
          data: mappings.map((mapping) => ({
            ...scope,
            connectionId,
            ...mapping,
          })),
        });
      }
    });
  }

  async replacePayments(
    scope: WinOrderConnectionScope,
    connectionId: string,
    mappings: Array<{
      paymentMethod: PaymentMethod;
      externalLabel: string;
    }>,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.winOrderPaymentMapping.deleteMany({
        where: { ...scope, connectionId },
      });
      if (mappings.length) {
        await tx.winOrderPaymentMapping.createMany({
          data: mappings.map((mapping) => ({
            ...scope,
            connectionId,
            ...mapping,
          })),
        });
      }
    });
  }
}
