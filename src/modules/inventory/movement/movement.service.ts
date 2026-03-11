import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import { AuthUserContext } from '../../../common/decorators';
import { UserRoleEnum } from '../../../common/enums';
import { buildPaginationMeta } from '../../../common/utils';
import { PrismaService } from '../../../database';
import { InventoryItemRepository } from '../item/item.repository';
import {
  CreateInventoryMovementDto,
  ListInventoryMovementsDto,
  StockMovementTypeDto,
} from './dto';
import { InventoryMovementRepository } from './movement.repository';

@Injectable()
export class InventoryMovementService {
  constructor(
    private readonly movementRepository: InventoryMovementRepository,
    private readonly itemRepository: InventoryItemRepository,
    private readonly prisma: PrismaService,
  ) {}

  async create(user: AuthUserContext, dto: CreateInventoryMovementDto) {
    const item = await this.itemRepository.findById(dto.inventoryItemId);
    if (!item || item.deletedAt) {
      throw new NotFoundException('Inventory item not found');
    }

    this.ensureWriteAccess(user, item.restaurantId);

    if (dto.quantity <= 0) {
      throw new BadRequestException('Quantity must be positive');
    }

    const qtyDelta = this.calcDelta(dto.movementType, dto.quantity);

    const result = await this.prisma.$transaction(async (tx) => {
      const movement = await this.movementRepository.create(
        {
          inventoryItemId: dto.inventoryItemId,
          branchId: dto.branchId ?? null,
          movementType: dto.movementType as unknown as StockMovementType,
          quantity: new Prisma.Decimal(dto.quantity),
          note: dto.note,
          referenceType: dto.referenceType,
          referenceId: dto.referenceId,
          createdByUserId: user.uid,
        },
        tx,
      );

      await this.itemRepository.adjustQty(
        dto.inventoryItemId,
        qtyDelta,
        tx,
      );

      return movement;
    });

    return { data: result, message: 'Inventory movement recorded successfully' };
  }

  async list(user: AuthUserContext, query: ListInventoryMovementsDto) {
    const item = await this.itemRepository.findById(query.inventoryItemId);
    if (!item || item.deletedAt) {
      throw new NotFoundException('Inventory item not found');
    }

    this.ensureReadAccess(user, item.restaurantId);

    const { items, total } = await this.movementRepository.list(query);

    return {
      data: items,
      message: 'Inventory movements fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  private calcDelta(type: StockMovementTypeDto, qty: number): Prisma.Decimal {
    switch (type) {
      case StockMovementTypeDto.IN:
        return new Prisma.Decimal(qty);
      case StockMovementTypeDto.OUT:
        return new Prisma.Decimal(-qty);
      case StockMovementTypeDto.ADJUST:
        return new Prisma.Decimal(qty);
      default:
        throw new BadRequestException('Invalid movement type');
    }
  }

  private ensureWriteAccess(user: AuthUserContext, restaurantId: string) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return;
    }

    if (
      (user.role !== UserRoleEnum.BUSINESS_ADMIN &&
        user.role !== UserRoleEnum.BRANCH_ADMIN) ||
      user.rid !== restaurantId
    ) {
      throw new ForbiddenException('Insufficient permissions for inventory movement');
    }
  }

  private ensureReadAccess(user: AuthUserContext, restaurantId: string) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return;
    }

    if (user.rid !== restaurantId) {
      throw new ForbiddenException('Cross-restaurant access denied');
    }
  }
}
