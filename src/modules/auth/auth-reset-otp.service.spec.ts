import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService password reset OTP scoping', () => {
  const makeService = () => {
    const usersService = {
      setPasswordResetOtp: jest.fn(),
      findByEmail: jest.fn(),
      incrementPasswordResetOtpAttempts: jest.fn(),
      clearPasswordResetOtp: jest.fn(),
      setRefreshTokenHash: jest.fn(),
      updatePassword: jest.fn(),
    };

    const service = new AuthService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      usersService as never,
      {} as never,
    );

    return { service, usersService };
  };

  it('passes restaurantId when issuing resend/reset OTP', async () => {
    const { service, usersService } = makeService();
    usersService.setPasswordResetOtp.mockResolvedValue({ count: 1 });

    await service.resendOtp({
      email: 'customer@example.com',
      restaurantId: 'restaurant-1',
    });

    expect(usersService.setPasswordResetOtp).toHaveBeenCalledWith(
      'customer@example.com',
      expect.any(String),
      expect.any(Date),
      'restaurant-1',
    );
  });

  it('looks up reset-password OTP by restaurant scope', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue({
      id: 'user-1',
      resetPasswordOtp: '123456',
      resetPasswordOtpExpiresAt: new Date(Date.now() + 60_000),
      resetPasswordOtpAttempts: 0,
    });
    usersService.clearPasswordResetOtp.mockResolvedValue({ id: 'user-1' });
    usersService.setRefreshTokenHash.mockResolvedValue({ id: 'user-1' });
    usersService.updatePassword.mockResolvedValue({ id: 'user-1' });

    const result = await service.resetPassword({
      email: 'customer@example.com',
      restaurantId: 'restaurant-1',
      otp: '123456',
      newPassword: 'Password@123',
    });

    expect(usersService.findByEmail).toHaveBeenCalledWith(
      'customer@example.com',
      'restaurant-1',
    );
    expect(result.message).toBe('Password reset successful');
  });

  it('throws invalid or expired OTP when scoped account is not found', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue(null);

    await expect(
      service.resetPassword({
        email: 'customer@example.com',
        restaurantId: 'restaurant-missing',
        otp: '123456',
        newPassword: 'Password@123',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
