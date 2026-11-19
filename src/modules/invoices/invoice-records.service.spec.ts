import {
  GeneratedInvoiceEventType,
  GeneratedInvoiceStatus,
} from '@prisma/client';
import { InvoiceRecordsService } from './invoice-records.service';

describe('InvoiceRecordsService', () => {
  it('records a resend and updates the generated invoice delivery state', async () => {
    type UpdateInput = {
      where: { id: string };
      data: {
        status: GeneratedInvoiceStatus;
        sentCount: { increment: number };
        lastSentAt: Date;
        lastSentTo: string;
      };
    };
    type EventInput = {
      data: {
        generatedInvoiceId: string;
        eventType: GeneratedInvoiceEventType;
        actorId?: string | null;
        recipientEmail: string;
        metadata: unknown;
      };
    };
    let capturedUpdate: UpdateInput | undefined;
    let capturedEvent: EventInput | undefined;
    const update = jest.fn((input: UpdateInput) => {
      capturedUpdate = input;
      return Promise.resolve({
        id: 'invoice-1',
        sourceKey: 'subscription-1:period-1',
        invoiceNumber: 'SUB-INV-1',
      });
    });
    const create = jest.fn((input: EventInput) => {
      capturedEvent = input;
      return Promise.resolve({ id: 'event-1' });
    });
    const transactionClient = {
      generatedInvoice: { update },
      generatedInvoiceEvent: { create },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (tx: typeof transactionClient) => Promise<unknown>) =>
          callback(transactionClient),
      ),
    };
    const service = new InvoiceRecordsService(prisma as never);

    await service.recordEmail('invoice-1', 'billing@restaurant.de', 'super-1');

    expect(capturedUpdate?.where).toEqual({ id: 'invoice-1' });
    expect(capturedUpdate?.data).toMatchObject({
      status: GeneratedInvoiceStatus.SENT,
      sentCount: { increment: 1 },
      lastSentTo: 'billing@restaurant.de',
    });
    expect(capturedUpdate?.data.lastSentAt).toBeInstanceOf(Date);
    expect(capturedEvent?.data).toMatchObject({
      generatedInvoiceId: 'invoice-1',
      eventType: GeneratedInvoiceEventType.EMAILED,
      actorId: 'super-1',
      recipientEmail: 'billing@restaurant.de',
    });
  });

  it('does not downgrade a sent invoice or replace its finalized snapshot on a read', async () => {
    let capturedUpdate: Record<string, unknown> = {};
    const upsert = jest.fn((args: { update: Record<string, unknown> }) => {
      capturedUpdate = args.update;
      return Promise.resolve({ id: 'invoice-1' });
    });
    const create = jest.fn().mockResolvedValue({ id: 'event-1' });
    const service = new InvoiceRecordsService({
      generatedInvoice: { upsert },
      generatedInvoiceEvent: { create },
    } as never);

    await service.persist({
      invoiceNumber: 'PAYOUT-1',
      kind: 'WEEKLY_PAYOUT' as never,
      sourceKey: 'restaurant-1:week-1',
      currency: 'EUR',
      totalAmount: 100,
      snapshot: { read: true },
    });

    expect(capturedUpdate.status).toBeUndefined();
    expect(capturedUpdate.snapshot).toBeUndefined();
    expect(capturedUpdate.totalAmount).toBeUndefined();
  });
});
