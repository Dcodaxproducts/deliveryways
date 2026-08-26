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
