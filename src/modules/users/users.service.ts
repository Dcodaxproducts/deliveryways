import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
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

  async createBusinessAdmin(payload: {
    email: string;
    password: string;
    tenantId: string;
    restaurantId: string;
    branchId: string;
    verificationToken: string;
  }, tx?: PrismaTx) {
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

  async setVerificationToken(email: string, token: string | null) {
    return this.usersRepository.updateByEmail(email, {
      verificationToken: token,
    });
  }

  async setRefreshTokenHash(userId: string, tokenHash: string | null) {
    return this.usersRepository.update(userId, { refreshTokenHash: tokenHash });
  }

  async verifyEmail(email: string, token: string) {
    return this.usersRepository.verifyUserEmail(email, token);
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
