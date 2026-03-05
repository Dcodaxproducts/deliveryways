import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { AuthRepository } from './auth.repository';
import { MailerService } from '../mailer/mailer.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  RegisterCustomerDto,
  RegisterTenantDto,
  ResendVerificationDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto';
import { AuthUserContext } from '../../common/decorators';

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly mailerService: MailerService,
  ) {}

  async registerTenant(dto: RegisterTenantDto) {
    const existing = await this.authRepository.findUserByEmail(dto.email);
    if (existing) {
      throw new BadRequestException('User already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const verificationToken = this.generateToken();

    const result = await this.authRepository.createTenantOnboarding({
      ...dto,
      password: hashedPassword,
      verificationToken,
    });

    await this.mailerService.sendVerificationEmail(dto.email, verificationToken);

    return {
      data: result,
      message: 'Tenant registration initiated. Please verify your email.',
    };
  }

  async registerCustomer(dto: RegisterCustomerDto) {
    const existing = await this.authRepository.findUserByEmail(
      dto.email,
      dto.restaurantId,
    );
    if (existing) {
      throw new BadRequestException('Customer already exists for this restaurant');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const verificationToken = this.generateToken();

    const restaurant = await this.authRepository.findRestaurantById(dto.restaurantId);
    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    await this.authRepository.createCustomer({
      ...dto,
      password: hashedPassword,
      verificationToken,
      tenantId: restaurant.tenantId,
    });

    await this.mailerService.sendVerificationEmail(dto.email, verificationToken);

    return {
      data: null,
      message: 'Customer registration started. Verify email with OTP.',
    };
  }

  async login(dto: LoginDto) {
    const user = await this.authRepository.findUserByEmail(dto.email, dto.restaurantId);
    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValidPassword = await bcrypt.compare(dto.password, user.password);
    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = await this.jwtService.signAsync({
      uid: user.id,
      role: user.role,
      tid: user.tenantId,
      rid: user.restaurantId,
      bid: user.branchId,
    });

    const refreshToken = await this.jwtService.signAsync(
      { uid: user.id, type: 'refresh' },
      { expiresIn: '30d' },
    );

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.authRepository.setRefreshTokenHash(user.id, refreshTokenHash);

    return {
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
          restaurantId: user.restaurantId,
          branchId: user.branchId,
          profile: user.profile,
        },
      },
      message: 'Login successful',
    };
  }

  async refreshTokens(user: AuthUserContext, dto: RefreshDto) {
    const dbUser = await this.authRepository.findUserById(user.uid);
    if (!dbUser || !dbUser.refreshTokenHash) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const isValid = await bcrypt.compare(dto.refreshToken, dbUser.refreshTokenHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const accessToken = await this.jwtService.signAsync({
      uid: dbUser.id,
      role: dbUser.role,
      tid: dbUser.tenantId,
      rid: dbUser.restaurantId,
      bid: dbUser.branchId,
    });

    const refreshToken = await this.jwtService.signAsync(
      { uid: dbUser.id, type: 'refresh' },
      { expiresIn: '30d' },
    );

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.authRepository.setRefreshTokenHash(dbUser.id, refreshTokenHash);

    return {
      data: { accessToken, refreshToken },
      message: 'Token refreshed',
    };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const result = await this.authRepository.verifyUserEmail(dto.email, dto.token);

    if (result.count === 0) {
      throw new BadRequestException('Invalid verification token');
    }

    return {
      data: null,
      message: 'Email verified successfully',
    };
  }

  async resendVerification(dto: ResendVerificationDto) {
    const token = this.generateToken();
    const result = await this.authRepository.setVerificationToken(dto.email, token);

    if (result.count === 0) {
      throw new NotFoundException('User not found');
    }

    await this.mailerService.sendVerificationEmail(dto.email, token);

    return {
      data: null,
      message: 'Verification token resent',
    };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const token = this.generateToken();
    const result = await this.authRepository.setVerificationToken(dto.email, token);

    if (result.count === 0) {
      return {
        data: null,
        message: 'If account exists, reset instructions are sent',
      };
    }

    await this.mailerService.sendPasswordResetEmail(dto.email, token);

    return {
      data: null,
      message: 'If account exists, reset instructions are sent',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.authRepository.findUserByEmail(dto.email);

    if (!user || user.verificationToken !== dto.token) {
      throw new BadRequestException('Invalid reset token');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.authRepository.setVerificationToken(dto.email, null);
    await this.authRepository.setRefreshTokenHash(user.id, null);
    await this.authRepository.updatePassword(user.id, hashedPassword);

    return {
      data: null,
      message: 'Password reset successful',
    };
  }

  async changePassword(user: AuthUserContext, dto: ChangePasswordDto) {
    const dbUser = await this.authRepository.findUserById(user.uid);
    if (!dbUser) {
      throw new NotFoundException('User not found');
    }

    const isValidPassword = await bcrypt.compare(
      dto.currentPassword,
      dbUser.password,
    );

    if (!isValidPassword) {
      throw new UnauthorizedException('Current password is invalid');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.authRepository.updatePassword(dbUser.id, hashedPassword);

    return {
      data: null,
      message: 'Password changed successfully',
    };
  }

  async me(user: AuthUserContext) {
    const dbUser = await this.authRepository.findUserById(user.uid);
    if (!dbUser) {
      throw new NotFoundException('User not found');
    }

    return {
      data: {
        id: dbUser.id,
        email: dbUser.email,
        role: dbUser.role,
        tenantId: dbUser.tenantId,
        restaurantId: dbUser.restaurantId,
        branchId: dbUser.branchId,
        profile: dbUser.profile,
      },
      message: 'Current user context fetched',
    };
  }

  async deleteAccount(user: AuthUserContext) {
    await this.authRepository.softDeleteUser(user.uid);
    return {
      data: null,
      message: 'Account scheduled for deletion in 30 days',
    };
  }

  async cancelDeletion(user: AuthUserContext) {
    await this.authRepository.cancelDeleteUser(user.uid);
    return {
      data: null,
      message: 'Account deletion canceled',
    };
  }

  private generateToken(): string {
    return randomBytes(16).toString('hex');
  }
}
