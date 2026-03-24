import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../database';
import { PrismaTx } from '../../common/types';

@Injectable()
export class ProfilesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaClient | PrismaTx {
    return tx ?? this.prisma;
  }

  async create(data: Prisma.ProfileCreateInput, tx?: PrismaTx) {
    return this.client(tx).profile.create({ data });
  }

  async update(id: string, data: Prisma.ProfileUpdateInput, tx?: PrismaTx) {
    return this.client(tx).profile.update({ where: { id }, data });
  }

  async findByUserId(userId: string) {
    return this.prisma.profile.findUnique({
      where: { userId },
    });
  }

  async upsertMetadata(userId: string, metadata: Prisma.InputJsonValue) {
    const existing = await this.findByUserId(userId);

    if (existing) {
      return this.prisma.profile.update({
        where: { id: existing.id },
        data: { metadata },
      });
    }

    return this.prisma.profile.create({
      data: {
        user: { connect: { id: userId } },
        firstName: 'Customer',
        lastName: 'Profile',
        metadata,
      },
    });
  }
}
