import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { VerifiedUserGuard } from './verified-user.guard';

describe('VerifiedUserGuard', () => {
  it('allows guest customers without verified email', async () => {
    const guard = new VerifiedUserGuard(
      {
        getAllAndOverride: jest.fn().mockReturnValue(false),
      } as unknown as Reflector,
      {
        findById: jest.fn().mockResolvedValue({
          id: 'guest-1',
          role: 'CUSTOMER',
          isVerified: false,
          isGuest: true,
        }),
      } as never,
    );

    const result = await guard.canActivate({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user: { uid: 'guest-1' } }),
      }),
    } as never);

    expect(result).toBe(true);
  });

  it('still blocks non-guest unverified users', async () => {
    const guard = new VerifiedUserGuard(
      {
        getAllAndOverride: jest.fn().mockReturnValue(false),
      } as unknown as Reflector,
      {
        findById: jest.fn().mockResolvedValue({
          id: 'user-1',
          role: 'CUSTOMER',
          isVerified: false,
          isGuest: false,
        }),
      } as never,
    );

    await expect(
      guard.canActivate({
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: () => ({
          getRequest: () => ({ user: { uid: 'user-1' } }),
        }),
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
