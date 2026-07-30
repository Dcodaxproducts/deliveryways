import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
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
        isApproved: dto.isApproved,
        isGuest: dto.isGuest,
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
                metadata: dto.profile.locale
                  ? { locale: dto.profile.locale }
                  : undefined,
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
        isApproved: dto.isApproved,
        isActive: dto.isActive,
        isGuest: dto.isGuest,
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
                  metadata: dto.profile.locale
                    ? { locale: dto.profile.locale }
                    : undefined,
                },
                update: {
                  firstName: dto.profile.firstName,
                  lastName: dto.profile.lastName,
                  avatarUrl: dto.profile.avatarUrl,
                  bio: dto.profile.bio,
                  phone: dto.profile.phone,
                  metadata: dto.profile.locale
                    ? { locale: dto.profile.locale }
                    : undefined,
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

  async findByEmailIncludingDeleted(email: string, restaurantId?: string) {
    return this.usersRepository.findByEmailIncludingDeleted(
      email,
      restaurantId,
    );
  }

  async existsByEmailAndRole(options: {
    email: string;
    role: UserRole;
    restaurantId?: string;
  }) {
    return this.usersRepository.existsByEmailAndRole(options);
  }

  async findById(id: string) {
    return this.usersRepository.findById(id);
  }

  async findManyForDevResolution(options: {
    id?: string;
    email?: string;
    restaurantId?: string;
    role?: UserRole;
    includeDeleted?: boolean;
  }) {
    return this.usersRepository.findManyForDevResolution(options);
  }

  async listCustomers(
    tenantId: string | undefined,
    query: AdminListQueryDto & {
      restaurantId?: string;
      isVerified?: boolean;
      isActive?: boolean;
    },
    withDeleted = false,
  ) {
    return this.usersRepository.listCustomers(tenantId, query, withDeleted);
  }

  async findCustomerById(
    id: string,
    options?: {
      tenantId?: string;
      restaurantId?: string;
      withDeleted?: boolean;
    },
  ) {
    return this.usersRepository.findCustomerById(id, options);
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

  async setPasswordResetOtp(
    email: string,
    otp: string,
    expiresAt: Date,
    restaurantId?: string,
  ) {
    return this.usersRepository.updateByEmail(
      email,
      {
        resetPasswordOtp: otp,
        resetPasswordOtpExpiresAt: expiresAt,
        resetPasswordOtpAttempts: 0,
      },
      restaurantId,
    );
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

  async setApprovalStatus(userId: string, isApproved: boolean) {
    return this.usersRepository.update(userId, {
      isApproved,
      ...(isApproved ? { isVerified: true } : {}),
    });
  }

  async setActiveStatus(userId: string, isActive: boolean) {
    return this.usersRepository.update(userId, { isActive });
  }

  async forceDeleteUsersByEmails(emails: string[]) {
    return this.usersRepository.forceDeleteUsersByEmails(emails);
  }

  async deleteManyByIds(ids: string[]) {
    return this.usersRepository.deleteManyByIds(ids);
  }

  async verifyEmailByOtp(userId: string, otp: string) {
    return this.usersRepository.verifyUserEmailByOtp(userId, otp, new Date());
  }

  async incrementVerificationOtpAttempts(userId: string) {
    return this.usersRepository.incrementVerificationOtpAttempts(userId);
  }

  async setVerificationOtpByEmail(
    email: string,
    otp: string | null,
    expiresAt: Date | null,
    restaurantId?: string,
  ) {
    return this.usersRepository.updateByEmail(
      email,
      {
        verificationOtp: otp,
        verificationOtpExpiresAt: expiresAt,
        verificationOtpAttempts: 0,
      },
      restaurantId,
    );
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

  async updatePassword(userId: string, plainPassword: string, tx?: PrismaTx) {
    const hashed = await bcrypt.hash(plainPassword, 10);
    return this.usersRepository.update(userId, { password: hashed }, tx);
  }

  async softDeleteUser(userId: string) {
    return this.usersRepository.softDeleteUser(userId);
  }

  async cancelDeleteUser(userId: string) {
    return this.usersRepository.cancelDeleteUser(userId);
  }
}
