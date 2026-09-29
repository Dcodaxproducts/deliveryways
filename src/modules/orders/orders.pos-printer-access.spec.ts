import 'reflect-metadata';
import { POS_PRINTER_ACCESS_KEY } from '../../common/decorators/pos-printer-access.decorator';
import { CustomerAppController } from '../customer-app/customer-app.controller';
import { OrdersController } from './orders.controller';

describe('POS printer controller access contract', () => {
  const metadata = (target: object, method: string): boolean | undefined => {
    const handler = Object.getOwnPropertyDescriptor(target, method)?.value as
      | object
      | undefined;
    if (!handler) {
      throw new Error(`Unknown controller handler: ${method}`);
    }
    return Reflect.getMetadata(POS_PRINTER_ACCESS_KEY, handler) as
      | boolean
      | undefined;
  };

  it.each(['list', 'details', 'updateStatus'])(
    'allows actual admin order-management handler %s',
    (method) => {
      expect(metadata(OrdersController.prototype, method)).toBe(true);
    },
  );

  it.each([
    'quote',
    'create',
    'tracking',
    'cancel',
    'submitReview',
    'uncancel',
  ])('does not allow customer or unrelated order handler %s', (method) => {
    expect(metadata(OrdersController.prototype, method)).toBeUndefined();
  });

  it.each(['listAdminTableReservations', 'updateAdminTableReservationStatus'])(
    'keeps branch-scoped table reservation handler %s allowed',
    (method) => {
      expect(metadata(CustomerAppController.prototype, method)).toBe(true);
    },
  );
});
