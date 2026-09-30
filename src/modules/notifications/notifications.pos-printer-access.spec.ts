import 'reflect-metadata';
import { POS_PRINTER_ACCESS_KEY } from '../../common/decorators';
import { NotificationsController } from './notifications.controller';

describe('notification POS printer machine access contract', () => {
  const access = (method: string): boolean | undefined => {
    const handler = Object.getOwnPropertyDescriptor(
      NotificationsController.prototype,
      method,
    )?.value as object | undefined;
    if (!handler) throw new Error(`Unknown notification handler: ${method}`);
    return Reflect.getMetadata(POS_PRINTER_ACCESS_KEY, handler) as
      | boolean
      | undefined;
  };

  it.each([
    'registerPushToken',
    'unregisterPushToken',
    'claimPendingOrders',
    'markSeen',
  ])('allows exact machine endpoint %s', (method) => {
    expect(access(method)).toBe(true);
  });

  it.each(['summary', 'list', 'details', 'markAllSeen', 'retry'])(
    'denies non-machine notification endpoint %s',
    (method) => expect(access(method)).toBeUndefined(),
  );
});
