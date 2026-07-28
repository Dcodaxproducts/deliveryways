import { Injectable } from '@nestjs/common';
import {
  GeneratedInvoiceEventType,
  GeneratedInvoiceKind,
  GeneratedInvoiceStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export interface PersistInvoiceInput {
  invoiceNumber: string;
  kind: GeneratedInvoiceKind;
  sourceKey: string;
  tenantId?: string | null;
  restaurantId?: string | null;
  branchId?: string | null;
  customerId?: string | null;
  orderId?: string | null;
  subscriptionId?: string | null;
  periodFrom?: Date | null;
  periodTo?: Date | null;
  currency: string;
  totalAmount: number;
  snapshot: Prisma.InputJsonValue;
  actorId?: string | null;
  eventType?: GeneratedInvoiceEventType;
  recipientEmail?: string | null;
  status?: GeneratedInvoiceStatus;
}

@Injectable()
export class InvoiceRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async hasEmailed(kind: GeneratedInvoiceKind, sourceKey: string) {
    const invoice = await this.prisma.generatedInvoice.findFirst({
      where: {
        kind,
        sourceKey,
        sentCount: { gt: 0 },
      },
      select: { id: true },
    });

    return Boolean(invoice);
  }

  async hasRecord(kind: GeneratedInvoiceKind, sourceKey: string) {
    const invoice = await this.prisma.generatedInvoice.findFirst({
      where: { kind, sourceKey },
      select: { id: true },
    });

    return Boolean(invoice);
  }

  async persist(input: PersistInvoiceInput) {
    const status = input.status ?? GeneratedInvoiceStatus.ISSUED;
    const eventType = input.eventType ?? GeneratedInvoiceEventType.GENERATED;
    const invoice = await this.prisma.generatedInvoice.upsert({
      where: { invoiceNumber: input.invoiceNumber },
      create: {
        invoiceNumber: input.invoiceNumber,
        kind: input.kind,
        status,
        tenantId: input.tenantId,
        restaurantId: input.restaurantId,
        branchId: input.branchId,
        customerId: input.customerId,
        orderId: input.orderId,
        subscriptionId: input.subscriptionId,
        sourceKey: input.sourceKey,
        periodFrom: input.periodFrom,
        periodTo: input.periodTo,
        currency: input.currency,
        totalAmount: new Prisma.Decimal(input.totalAmount).toDecimalPlaces(2),
        snapshot: this.toJsonSnapshot(input.snapshot),
        generatedById: input.actorId,
        sentCount: eventType === GeneratedInvoiceEventType.EMAILED ? 1 : 0,
        downloadedCount:
          eventType === GeneratedInvoiceEventType.DOWNLOADED ? 1 : 0,
        lastSentAt:
          eventType === GeneratedInvoiceEventType.EMAILED ? new Date() : null,
        lastSentTo:
          eventType === GeneratedInvoiceEventType.EMAILED
            ? input.recipientEmail
            : null,
      },
      update: {
        status,
        snapshot: this.toJsonSnapshot(input.snapshot),
        currency: input.currency,
        totalAmount: new Prisma.Decimal(input.totalAmount).toDecimalPlaces(2),
        periodFrom: input.periodFrom,
        periodTo: input.periodTo,
        tenantId: input.tenantId,
        restaurantId: input.restaurantId,
        branchId: input.branchId,
        customerId: input.customerId,
        orderId: input.orderId,
        subscriptionId: input.subscriptionId,
        sentCount:
          eventType === GeneratedInvoiceEventType.EMAILED
            ? { increment: 1 }
            : undefined,
        downloadedCount:
          eventType === GeneratedInvoiceEventType.DOWNLOADED
            ? { increment: 1 }
            : undefined,
        lastSentAt:
          eventType === GeneratedInvoiceEventType.EMAILED
            ? new Date()
            : undefined,
        lastSentTo:
          eventType === GeneratedInvoiceEventType.EMAILED
            ? input.recipientEmail
            : undefined,
      },
    });

    await this.prisma.generatedInvoiceEvent.create({
      data: {
        generatedInvoiceId: invoice.id,
        eventType,
        actorId: input.actorId,
        recipientEmail: input.recipientEmail,
        metadata: {
          sourceKey: input.sourceKey,
          invoiceNumber: input.invoiceNumber,
        },
      },
    });

    return invoice;
  }

  async recordDownload(invoiceId: string, actorId?: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.generatedInvoice.update({
        where: { id: invoiceId },
        data: { downloadedCount: { increment: 1 } },
      });

      await tx.generatedInvoiceEvent.create({
        data: {
          generatedInvoiceId: invoice.id,
          eventType: GeneratedInvoiceEventType.DOWNLOADED,
          actorId,
          metadata: {
            sourceKey: invoice.sourceKey,
            invoiceNumber: invoice.invoiceNumber,
          },
        },
      });

      return invoice;
    });
  }

  private toJsonSnapshot(value: Prisma.InputJsonValue) {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
