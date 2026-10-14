import { ConflictException } from '@nestjs/common';
import {
  Prisma,
  WalletTransaction,
  WalletTransactionType,
} from '@prisma/client';
import { FinancialLedgerRepository } from './financial-ledger.repository';

describe('FinancialLedgerRepository', () => {
  const hash = FinancialLedgerRepository.createCanonicalRequestHash({
    amount: '10.00',
  });
  const existing = (
    overrides: Partial<WalletTransaction> = {},
  ): WalletTransaction => ({
    id: 'transaction-1',
    walletAccountId: 'wallet-1',
    tenantId: 'tenant-1',
    restaurantId: 'restaurant-1',
    branchId: null,
    customerId: 'customer-1',
    orderId: null,
    paymentTransactionId: null,
    type: WalletTransactionType.CREDIT,
    amount: new Prisma.Decimal(10),
    balanceAfter: new Prisma.Decimal(10),
    currency: 'PKR',
    note: null,
    metadata: { source: 'UNIT_TEST' },
    createdBy: null,
    updatedBy: null,
    idempotencyKey: FinancialLedgerRepository.createOperationKey('operation-1'),
    requestHash: hash,
    createdAt: new Date('2026-10-14T00:00:00Z'),
    updatedAt: new Date('2026-10-14T00:00:00Z'),
    ...overrides,
  });

  function repositoryWith(entry: WalletTransaction) {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      walletTransaction: { findUnique: jest.fn().mockResolvedValue(entry) },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
    };
    return new FinancialLedgerRepository(prisma as never);
  }

  const input = {
    tenantId: 'tenant-1',
    restaurantId: 'restaurant-1',
    customerId: 'customer-1',
    operationKey: 'operation-1',
    requestHash: hash,
    allowNegative: false,
    source: 'UNIT_TEST',
    delta: new Prisma.Decimal(10),
    currency: 'PKR',
    type: WalletTransactionType.CREDIT,
  };

  it('builds full fixed-length keys without truncating long operation identities', () => {
    const prefix = 'x'.repeat(2_000);
    const first = FinancialLedgerRepository.createOperationKey(prefix + 'a');
    const second = FinancialLedgerRepository.createOperationKey(prefix + 'b');
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toBe(second);
  });

  it('hashes canonical JSON independently of object key order', () => {
    expect(
      FinancialLedgerRepository.createCanonicalRequestHash({ b: 2, a: 1 }),
    ).toBe(
      FinancialLedgerRepository.createCanonicalRequestHash({ a: 1, b: 2 }),
    );
  });

  it('returns the persisted outcome for the same operation key and request hash', async () => {
    const transaction = existing();
    await expect(
      repositoryWith(transaction).applyCustomerWalletDelta(input),
    ).resolves.toEqual({
      transaction,
      replayed: true,
    });
  });

  it('rejects hash or scope changes for an existing operation key', async () => {
    await expect(
      repositoryWith(existing()).applyCustomerWalletDelta({
        ...input,
        requestHash: 'f'.repeat(64),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      repositoryWith(existing()).applyCustomerWalletDelta({
        ...input,
        customerId: 'customer-2',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('replays legacy null-hash rows only when immutable source fields match', async () => {
    const legacy = existing({ requestHash: null });
    await expect(
      repositoryWith(legacy).applyCustomerWalletDelta(input),
    ).resolves.toMatchObject({
      replayed: true,
    });
    await expect(
      repositoryWith(legacy).applyCustomerWalletDelta({
        ...input,
        source: 'OTHER_SOURCE',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
