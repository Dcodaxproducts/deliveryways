import { PrismaPg } from '@prisma/adapter-pg';
import {
  ConnectionInfo,
  DriverAdapterError,
  IsolationLevel,
  SqlDriverAdapter,
  SqlMigrationAwareDriverAdapterFactory,
  SqlQuery,
  SqlResultSet,
  Transaction,
  TransactionOptions,
} from '@prisma/driver-adapter-utils';

class SafeTransaction implements Transaction {
  readonly provider: Transaction['provider'];
  readonly adapterName: string;
  readonly options: TransactionOptions;

  private queryTail: Promise<void> = Promise.resolve();
  private settlement?: Promise<void>;

  constructor(private readonly transaction: Transaction) {
    this.provider = transaction.provider;
    this.adapterName = transaction.adapterName;
    this.options = transaction.options;
  }

  queryRaw(query: SqlQuery): Promise<SqlResultSet> {
    return this.enqueue(() => this.transaction.queryRaw(query));
  }

  executeRaw(query: SqlQuery): Promise<number> {
    return this.enqueue(() => this.transaction.executeRaw(query));
  }

  commit(): Promise<void> {
    return this.settle(() => this.transaction.commit());
  }

  rollback(): Promise<void> {
    return this.settle(() => this.transaction.rollback());
  }

  private enqueue<Result>(operation: () => Promise<Result>): Promise<Result> {
    if (this.settlement) {
      return Promise.reject(
        new DriverAdapterError({
          kind: 'TransactionAlreadyClosed',
          cause: 'The transaction has already been committed or rolled back',
        }),
      );
    }

    const result = this.queryTail.then(operation);
    this.queryTail = result.then(
      () => undefined,
      () => undefined,
    );

    return result;
  }

  private settle(operation: () => Promise<void>): Promise<void> {
    // Prisma can race an abandoned COMMIT with its timeout ROLLBACK. Keep the
    // underlying adapter single-flight and settle its pg pool client once.
    if (!this.settlement) {
      this.settlement = this.queryTail.then(operation);
    }

    return this.settlement;
  }
}

class SafePrismaPgAdapter implements SqlDriverAdapter {
  readonly provider: SqlDriverAdapter['provider'];
  readonly adapterName: string;

  constructor(private readonly adapter: SqlDriverAdapter) {
    this.provider = adapter.provider;
    this.adapterName = adapter.adapterName;
  }

  queryRaw(query: SqlQuery): Promise<SqlResultSet> {
    return this.adapter.queryRaw(query);
  }

  executeRaw(query: SqlQuery): Promise<number> {
    return this.adapter.executeRaw(query);
  }

  async startTransaction(
    isolationLevel?: IsolationLevel,
  ): Promise<Transaction> {
    return new SafeTransaction(
      await this.adapter.startTransaction(isolationLevel),
    );
  }

  executeScript(script: string): Promise<void> {
    return this.adapter.executeScript(script);
  }

  getConnectionInfo(): ConnectionInfo {
    return (
      this.adapter.getConnectionInfo?.() ?? { supportsRelationJoins: false }
    );
  }

  dispose(): Promise<void> {
    return this.adapter.dispose();
  }
}

export class SafePrismaPg implements SqlMigrationAwareDriverAdapterFactory {
  readonly provider: SqlMigrationAwareDriverAdapterFactory['provider'];
  readonly adapterName: string;

  constructor(private readonly adapter: PrismaPg) {
    this.provider = adapter.provider;
    this.adapterName = adapter.adapterName;
  }

  async connect(): Promise<SqlDriverAdapter> {
    return new SafePrismaPgAdapter(await this.adapter.connect());
  }

  async connectToShadowDb(): Promise<SqlDriverAdapter> {
    return new SafePrismaPgAdapter(await this.adapter.connectToShadowDb());
  }
}
