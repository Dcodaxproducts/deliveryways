import { PrismaPg } from '@prisma/adapter-pg';
import * as pg from 'pg';
import { SafePrismaPg } from './safe-prisma-pg';

describe('SafePrismaPg', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('releases a transaction pool client at most once', async () => {
    jest.spyOn(pg.Client.prototype, 'connect').mockImplementation(((
      callback?: (error?: Error) => void,
    ) => {
      process.nextTick(() => callback?.());
    }) as never);
    jest
      .spyOn(pg.Client.prototype, 'end')
      .mockResolvedValue(undefined as never);
    jest
      .spyOn(pg.Client.prototype, 'query')
      .mockResolvedValue({ rowCount: 0, rows: [], fields: [] } as never);

    const pool = new pg.Pool({
      connectionString: 'postgresql://user:pass@localhost:5432/database',
      max: 1,
    });

    try {
      const adapter = await new SafePrismaPg(new PrismaPg(pool)).connect();
      const transaction = await adapter.startTransaction();

      await transaction.rollback();
      const nextOwner = await pool.connect();
      await transaction.commit();

      expect(() => nextOwner.release()).not.toThrow();
      expect(pool.idleCount).toBe(1);
      expect(pool.totalCount).toBe(1);
    } finally {
      await pool.end();
    }
  });

  it('serializes concurrent statements on a transaction client', async () => {
    jest.spyOn(pg.Client.prototype, 'connect').mockImplementation(((
      callback?: (error?: Error) => void,
    ) => {
      process.nextTick(() => callback?.());
    }) as never);
    jest
      .spyOn(pg.Client.prototype, 'end')
      .mockResolvedValue(undefined as never);

    const statements: string[] = [];
    let completeFirstQuery: (() => void) | undefined;
    const firstQuery = new Promise<{
      rowCount: number;
      rows: unknown[];
      fields: unknown[];
    }>((resolve) => {
      completeFirstQuery = () => resolve({ rowCount: 0, rows: [], fields: [] });
    });

    jest.spyOn(pg.Client.prototype, 'query').mockImplementation(((
      query: string | { text: string },
    ) => {
      const statement = typeof query === 'string' ? query : query.text;
      statements.push(statement);

      if (statement === 'SELECT first') {
        return firstQuery;
      }

      return Promise.resolve({ rowCount: 0, rows: [], fields: [] });
    }) as never);

    const pool = new pg.Pool({
      connectionString: 'postgresql://user:pass@localhost:5432/database',
      max: 1,
    });

    try {
      const adapter = await new SafePrismaPg(new PrismaPg(pool)).connect();
      const transaction = await adapter.startTransaction();
      const first = transaction.executeRaw({
        sql: 'SELECT first',
        args: [],
        argTypes: [],
      });
      const second = transaction.executeRaw({
        sql: 'SELECT second',
        args: [],
        argTypes: [],
      });

      await new Promise((resolve) => setImmediate(resolve));
      expect(statements).toEqual(['BEGIN', 'SELECT first']);

      completeFirstQuery?.();
      await Promise.all([first, second]);
      expect(statements).toEqual(['BEGIN', 'SELECT first', 'SELECT second']);

      await transaction.rollback();
    } finally {
      await pool.end();
    }
  });
});
