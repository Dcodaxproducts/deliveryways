import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../database';
import { QueryDto } from '../../common/dto';
import { PrismaTx } from '../../common/types';

@Injectable()
export class AddressesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaClient | PrismaTx {
    return tx ?? this.prisma;
  }

  async create(data: Prisma.AddressCreateInput, tx?: PrismaTx) {
    return this.client(tx).address.create({ data });
  }

  async findUserAddressById(id: string, tenantId: string, userId: string) {
    return this.prisma.address.findFirst({
      where: {
        id,
        tenantId,
        referenceId: userId,
        refType: 'USER',
        deletedAt: null,
      },
    });
  }

  async update(id: string, data: Prisma.AddressUpdateInput, tx?: PrismaTx) {
    return this.client(tx).address.update({ where: { id }, data });
  }

  async listForUser(tenantId: string, userId: string, query: QueryDto) {
    const where: Prisma.AddressWhereInput = {
      tenantId,
      referenceId: userId,
      refType: 'USER',
      deletedAt: null,
      isActive: true,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.address.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: {
          [query.sortBy]: query.sortOrder.toLowerCase() as 'asc' | 'desc',
        },
      }),
      this.prisma.address.count({ where }),
    ]);

    return { items, total };
  }

  async softDelete(id: string, tx?: PrismaTx) {
    return this.client(tx).address.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });
  }
}
