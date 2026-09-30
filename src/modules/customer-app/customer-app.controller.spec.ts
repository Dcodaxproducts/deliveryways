import 'reflect-metadata';
import {
  THROTTLER_LIMIT,
  THROTTLER_TTL,
} from '@nestjs/throttler/dist/throttler.constants';
import { CustomerAppController } from './customer-app.controller';

describe('CustomerAppController menu item throttling', () => {
  const listItems = Object.getOwnPropertyDescriptor(
    CustomerAppController.prototype,
    'listItems',
  )?.value as (...args: unknown[]) => unknown;

  it('allows progressive public menu browsing above the global limit', () => {
    expect(Reflect.getMetadata(THROTTLER_TTL + 'default', listItems)).toBe(
      60_000,
    );
    expect(Reflect.getMetadata(THROTTLER_LIMIT + 'default', listItems)).toBe(
      300,
    );
  });
});

describe('CustomerAppController reservation query contract', () => {
  it('passes the validated customer scope from the pagination query', async () => {
    const listTableReservations = jest.fn();
    const controller = new CustomerAppController({
      listTableReservations,
    } as never);
    const user = { uid: 'admin-1' } as never;
    const query = {
      page: 2,
      limit: 20,
      customerId: 'customer-1',
      status: 'CONFIRMED',
    } as never;

    await controller.listTableReservations(user, query);

    expect(listTableReservations).toHaveBeenCalledWith(
      user,
      query,
      'customer-1',
    );
  });
});
