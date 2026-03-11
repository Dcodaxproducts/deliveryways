import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../database';
import { PrismaTx } from '../../../common/types';
import { ListInventoryMovementsDto } from './dto';

@Injectable()
export class InventoryMovementRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: PrismaTx): PrismaTx | PrismaClient {
    return tx ?? this.prisma;
  }

  async create(data: Prisma.InventoryMovementUncheckedCreateInput, tx?: PrismaTx) {
    return this.client(tx).inventoryMovement.create({ data });
  }

  async list(query: ListInventoryMovementsDto) {
    const where: Prisma.InventoryMovementWhereInput = {
      inventoryItemId: query.inventoryItemId,
      ...(query.branchId ? { branchId: query.branchId } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.inventoryMovement.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          branch: { select: { id: true, name: true } },
          createdBy: { select: { id: true, email: true } },
        },
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);

    return { items, total };
  }
}
