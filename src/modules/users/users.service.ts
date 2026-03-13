import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AdminListQueryDto } from '../../common/dto';
import { PrismaTx } from '../../common/types';
import { CreateUserDto, UpdateUserDto } from './dto';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async create(dto: CreateUserDto, tx?: PrismaTx) {
    return this.usersRepository.create(
      {
        email: dto.email,
        password: dto.password,
        role: dto.role,
        verificationToken: dto.verificationToken,
        verificationOtp: dto.verificationOtp,
        verificationOtpExpiresAt: dto.verificationOtpExpiresAt
          ? new Date(dto.verificationOtpExpiresAt)
          : undefined,
        verificationOtpAttempts: dto.verificationOtpAttempts,
        isVerified: dto.isVerified,
        tenant: dto.tenantId ? { connect: { id: dto.tenantId } } : undefined,
        restaurant: dto.restaurantId
          ? { connect: { id: dto.restaurantId } }
          : undefined,
        branch: dto.branchId ? { connect: { id: dto.branchId } } : undefined,
        profile: dto.profile
          ? {
              create: {
                firstName: dto.profile.firstName,
                lastName: dto.profile.lastName,
                avatarUrl: dto.profile.avatarUrl,
                bio: dto.profile.bio,
                phone: dto.profile.phone,
              },
            }
          : undefined,
      },
      tx,
    );
  }

  async update(id: string, dto: UpdateUserDto, tx?: PrismaTx) {
    return this.usersRepository.update(
      id,
      {
        email: dto.email,
        password: dto.password,
        role: dto.role,
        verificationToken: dto.verificationToken,
        verificationOtp: dto.verificationOtp,
        verificationOtpExpiresAt: dto.verificationOtpExpiresAt
          ? new Date(dto.verificationOtpExpiresAt)
          : undefined,
        verificationOtpAttempts: dto.verificationOtpAttempts,
        isVerified: dto.isVerified,
        tenant: dto.tenantId ? { connect: { id: dto.tenantId } } : undefined,
        restaurant: dto.restaurantId
          ? { connect: { id: dto.restaurantId } }
          : undefined,
        branch: dto.branchId ? { connect: { id: dto.branchId } } : undefined,
        profile: dto.profile
          ? {
              upsert: {
                create: {
                  firstName: dto.profile.firstName,
                  lastName: dto.profile.lastName,
                  avatarUrl: dto.profile.avatarUrl,
                  bio: dto.profile.bio,
                  phone: dto.profile.phone,
                },
                update: {
                  firstName: dto.profile.firstName,
                  lastName: dto.profile.lastName,
                  avatarUrl: dto.profile.avatarUrl,
                  bio: dto.profile.bio,
                  phone: dto.profile.phone,
                },
              },
            }
          : undefined,
      },
      tx,
    );
  }

  async createBusinessAdmin(
    payload: {
      email: string;
      password: string;
      tenantId: string;
      restaurantId: string;
      branchId: string;
      verificationToken: string;
    },
    tx?: PrismaTx,
  ) {
    const hashedPassword = await bcrypt.hash(payload.password, 10);

    return this.usersRepository.createBusinessAdmin(
      {
        ...payload,
        password: hashedPassword,
      },
      tx,
    );
  }

  async findByEmail(email: string, restaurantId?: string) {
    return this.usersRepository.findByEmail(email, restaurantId);
  }

  async findById(id: string) {
    return this.usersRepository.findById(id);
  }

  async listCustomers(
    tenantId: string,
    query: AdminListQueryDto & {
      restaurantId?: string;
      isVerified?: boolean;
      isActive?: boolean;
    },
    withDeleted = false,
  ) {
    return this.usersRepository.listCustomers(tenantId, query, withDeleted);
  }

  async setVerificationToken(
    email: string,
    token: string | null,
    restaurantId?: string,
  ) {
    return this.usersRepository.updateByEmail(
      email,
      {
        verificationToken: token,
      },
      restaurantId,
    );
  }

  async setPasswordResetOtp(email: string, otp: string, expiresAt: Date) {
    return this.usersRepository.updateByEmail(email, {
      resetPasswordOtp: otp,
      resetPasswordOtpExpiresAt: expiresAt,
      resetPasswordOtpAttempts: 0,
    });
  }

  async incrementPasswordResetOtpAttempts(userId: string) {
    return this.usersRepository.update(userId, {
      resetPasswordOtpAttempts: { increment: 1 },
    });
  }

  async clearPasswordResetOtp(userId: string) {
    return this.usersRepository.update(userId, {
      resetPasswordOtp: null,
      resetPasswordOtpExpiresAt: null,
      resetPasswordOtpAttempts: 0,
    });
  }

  async setRefreshTokenHash(userId: string, tokenHash: string | null) {
    return this.usersRepository.update(userId, { refreshTokenHash: tokenHash });
  }

  async forceDeleteUsersByEmails(emails: string[]) {
    return this.usersRepository.forceDeleteUsersByEmails(emails);
  }

  async verifyEmailByOtp(userId: string, otp: string) {
    return this.usersRepository.verifyUserEmailByOtp(userId, otp, new Date());
  }

  async incrementVerificationOtpAttempts(userId: string) {
    return this.usersRepository.incrementVerificationOtpAttempts(userId);
  }

  async setVerificationOtp(
    userId: string,
    otp: string | null,
    expiresAt: Date | null,
  ) {
    return this.usersRepository.update(userId, {
      verificationOtp: otp,
      verificationOtpExpiresAt: expiresAt,
      verificationOtpAttempts: 0,
    });
  }

  async updatePassword(userId: string, plainPassword: string) {
    const hashed = await bcrypt.hash(plainPassword, 10);
    return this.usersRepository.update(userId, { password: hashed });
  }

  async softDeleteUser(userId: string) {
    return this.usersRepository.softDeleteUser(userId);
  }

  async cancelDeleteUser(userId: string) {
    return this.usersRepository.cancelDeleteUser(userId);
  }
}
