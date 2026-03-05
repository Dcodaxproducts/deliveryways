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
}
