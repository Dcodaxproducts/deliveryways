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

  async update(id: string, data: Prisma.AddressUpdateInput, tx?: PrismaTx) {
    return this.client(tx).address.update({ where: { id }, data });
  }

  async listByReference(
    tenantId: string,
    referenceId: string,
    query: QueryDto,
    withDeleted = false,
    includeInactive = false,
  ) {
    const where: Prisma.AddressWhereInput = {
      tenantId,
      referenceId,
      ...(withDeleted ? {} : { deletedAt: null }),
      ...(includeInactive ? {} : { isActive: true }),
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
