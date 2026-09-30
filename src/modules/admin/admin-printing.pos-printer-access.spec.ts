import 'reflect-metadata';
import { POS_PRINTER_ACCESS_KEY, ROLES_KEY } from '../../common/decorators';
import { RolesEnum } from '../../common/enums';
import { AdminPrintingController } from './admin-printing.controller';

describe('admin printing POS printer access contract', () => {
  const handler = (method: string): object => {
    const value = Object.getOwnPropertyDescriptor(
      AdminPrintingController.prototype,
      method,
    )?.value as object | undefined;
    if (!value) {
      throw new Error(`Unknown admin printing handler: ${method}`);
    }
    return value;
  };

  const allowsPosPrinter = (method: string): boolean | undefined =>
    Reflect.getMetadata(POS_PRINTER_ACCESS_KEY, handler(method)) as
      | boolean
      | undefined;

  const roles = (method: string): RolesEnum[] | undefined =>
    Reflect.getMetadata(ROLES_KEY, handler(method)) as RolesEnum[] | undefined;

  it('allows only printer settings read for native POS devices', () => {
    expect(allowsPosPrinter('getSettings')).toBe(true);
    expect(roles('getSettings')).toContain(RolesEnum.STAFF);
  });

  it.each(['getQzCertificate', 'signQzChallenge', 'reportEvent'])(
    'keeps browser/admin printing handler %s denied to POS devices',
    (method) => {
      expect(allowsPosPrinter(method)).toBeUndefined();
    },
  );

  it.each(['updateSettings', 'getStatus', 'getLogs'])(
    'keeps privileged printing handler %s denied',
    (method) => {
      expect(allowsPosPrinter(method)).toBeUndefined();
      expect(roles(method)).not.toContain(RolesEnum.STAFF);
    },
  );
});
