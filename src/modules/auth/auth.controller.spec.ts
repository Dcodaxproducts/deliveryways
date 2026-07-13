import 'reflect-metadata';
import {
  THROTTLER_BLOCK_DURATION,
  THROTTLER_LIMIT,
  THROTTLER_TRACKER,
  THROTTLER_TTL,
} from '@nestjs/throttler/dist/throttler.constants';
import { AuthController } from './auth.controller';

describe('AuthController guest registration throttling', () => {
  const registerGuest = Object.getOwnPropertyDescriptor(
    AuthController.prototype,
    'registerGuest',
  )?.value as (...args: unknown[]) => unknown;

  it('applies a strict route-level throttle for guest registration', () => {
    expect(Reflect.getMetadata(THROTTLER_TTL + 'default', registerGuest)).toBe(
      10 * 60_000,
    );
    expect(
      Reflect.getMetadata(THROTTLER_LIMIT + 'default', registerGuest),
    ).toBe(5);
    expect(
      Reflect.getMetadata(THROTTLER_BLOCK_DURATION + 'default', registerGuest),
    ).toBe(30 * 60_000);
  });

  it('tracks guest registration by ip and restaurant id', () => {
    const tracker = Reflect.getMetadata(
      THROTTLER_TRACKER + 'default',
      registerGuest,
    ) as (req: { ip?: string; body?: { restaurantId?: string } }) => string;

    expect(
      tracker({
        ip: '203.0.113.10',
        body: { restaurantId: 'restaurant-1' },
      }),
    ).toBe('203.0.113.10:restaurant-1');
    expect(tracker({})).toBe('unknown-ip:unknown-restaurant');
  });
});

describe('AuthController checkEmailRole', () => {
  it('delegates email-role checks to the auth service', () => {
    const authService = {
      checkEmailRole: jest.fn().mockReturnValue({
        data: { exists: false },
        message: 'Email is available for this role',
      }),
    };
    const controller = new AuthController(authService as never);
    const dto = {
      email: 'customer@example.com',
      role: 'CUSTOMER',
      restaurantId: 'restaurant-1',
    } as never;

    const result = controller.checkEmailRole(dto);

    expect(authService.checkEmailRole).toHaveBeenCalledWith(dto);
    expect(result).toEqual({
      data: { exists: false },
      message: 'Email is available for this role',
    });
  });
});

describe('AuthController registerTenantBySuperAdmin', () => {
  it('delegates super-admin tenant registration to the auth service', () => {
    const authService = {
      registerTenantBySuperAdmin: jest.fn().mockReturnValue({
        data: { ownerId: 'owner-1' },
        message: 'Tenant account created by super admin.',
      }),
    };
    const controller = new AuthController(authService as never);
    const user = { uid: 'super-admin-1', role: 'SUPER_ADMIN' } as never;
    const dto = {
      packagePlanId: 'plan-1',
      user: { email: 'owner@example.com' },
    } as never;

    const result = controller.registerTenantBySuperAdmin(user, dto);

    expect(authService.registerTenantBySuperAdmin).toHaveBeenCalledWith(
      user,
      dto,
    );
    expect(result).toEqual({
      data: { ownerId: 'owner-1' },
      message: 'Tenant account created by super admin.',
    });
  });
});
