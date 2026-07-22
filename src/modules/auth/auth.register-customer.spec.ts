import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

describe('AuthService registerCustomer', () => {
  let service: AuthService;
  let prisma: {
    restaurant: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let usersService: Partial<Record<keyof UsersService, jest.Mock>>;
  let jwtService: { signAsync: jest.Mock };
  let mailerService: { sendVerificationEmail: jest.Mock };

  beforeEach(() => {
    prisma = {
      restaurant: { findFirst: jest.fn() },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        Promise.resolve(callback({})),
      ),
    };

    usersService = {
      findByEmail: jest.fn(),
      create: jest.fn(),
      setRefreshTokenHash: jest.fn(),
    };

    jwtService = {
      signAsync: jest
        .fn()
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token'),
    };

    mailerService = { sendVerificationEmail: jest.fn() };

    service = new AuthService(
      prisma as never,
      jwtService as never,
      {} as never,
      {} as never,
      {} as never,
      usersService as unknown as UsersService,
      mailerService as never,
      {} as never,
    );

    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password' as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('checks existing customers within the same restaurant scope', async () => {
    prisma.restaurant.findFirst.mockResolvedValue({ tenantId: 'tenant-1' });
    usersService.findByEmail!.mockResolvedValue(null);
    usersService.create!.mockResolvedValue({
      id: 'customer-2',
      email: 'customer@example.com',
      role: 'CUSTOMER',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-2',
      branchId: null,
      isVerified: true,
      isApproved: true,
      isGuest: false,
    });

    const result = await service.registerCustomer({
      email: 'customer@example.com',
      password: 'Password@123',
      restaurantId: 'restaurant-2',
      firstName: 'Test',
      lastName: 'User',
      phone: '03001234567',
    });

    expect(usersService.findByEmail).toHaveBeenCalledWith(
      'customer@example.com',
      'restaurant-2',
    );
    expect(usersService.create).toHaveBeenCalled();
    expect(result.data.accessToken).toBe('access-token');
  });

  it('rejects duplicate customer email within the same restaurant', async () => {
    prisma.restaurant.findFirst.mockResolvedValue({ tenantId: 'tenant-1' });
    usersService.findByEmail!.mockResolvedValue({
      id: 'customer-1',
      email: 'customer@example.com',
      restaurantId: 'restaurant-1',
    });

    await expect(
      service.registerCustomer({
        email: 'customer@example.com',
        password: 'Password@123',
        restaurantId: 'restaurant-1',
        firstName: 'Test',
        lastName: 'User',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(usersService.findByEmail).toHaveBeenCalledWith(
      'customer@example.com',
      'restaurant-1',
    );
    expect(usersService.create).not.toHaveBeenCalled();
  });

  it('does not fail customer registration when verification email delivery fails', async () => {
    const originalEmailEnabled = process.env.EMAIL_ENABLED;
    process.env.EMAIL_ENABLED = 'true';
    prisma.restaurant.findFirst.mockResolvedValue({ tenantId: 'tenant-1' });
    usersService.findByEmail!.mockResolvedValue(null);
    usersService.create!.mockResolvedValue({
      id: 'customer-3',
      email: 'customer@example.com',
      role: 'CUSTOMER',
      tenantId: 'tenant-1',
      restaurantId: 'restaurant-3',
      branchId: null,
      isVerified: false,
      isApproved: true,
      isGuest: false,
    });
    mailerService.sendVerificationEmail.mockRejectedValue(
      new Error('SMTP unavailable'),
    );

    const result = await service.registerCustomer({
      email: 'customer@example.com',
      password: 'Password@123',
      restaurantId: 'restaurant-3',
      firstName: 'Test',
      lastName: 'User',
      phone: '03001234567',
    });

    expect(result.data.accessToken).toBe('access-token');
    expect(result.data.verificationEmailSent).toBe(false);
    expect(result.message).toBe(
      'Customer registration completed. Verification email could not be sent; please resend OTP.',
    );
    expect(usersService.create).toHaveBeenCalled();

    if (originalEmailEnabled === undefined) {
      delete process.env.EMAIL_ENABLED;
    } else {
      process.env.EMAIL_ENABLED = originalEmailEnabled;
    }
  });
});
