import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUserContext } from '../../../common/decorators';
import { UserRoleEnum } from '../../../common/enums';
import { PrismaService } from '../../../database';
import {
  UpsertBranchCategoryOverrideDto,
  UpsertBranchMenuItemOverrideDto,
} from './dto';
import { BranchOverrideRepository } from './branch-override.repository';

@Injectable()
export class BranchOverrideService {
  constructor(
    private readonly branchOverrideRepository: BranchOverrideRepository,
    private readonly prisma: PrismaService,
  ) {}

  async upsertItemOverride(
    user: AuthUserContext,
    dto: UpsertBranchMenuItemOverrideDto,
  ) {
    const item = await this.prisma.menuItem.findUnique({
      where: { id: dto.menuItemId },
    });
    if (!item || item.deletedAt) {
      throw new NotFoundException('Menu item not found');
    }

    const branchId = await this.resolveBranchId(
      user,
      dto.branchId,
      item.restaurantId,
    );

    const data = await this.branchOverrideRepository.upsertItemOverride(
      branchId,
      dto.menuItemId,
      {
        isAvailable: dto.isAvailable ?? true,
        priceOverride:
          dto.priceOverride !== undefined
            ? new Prisma.Decimal(dto.priceOverride)
            : undefined,
      },
    );

    return { data, message: 'Branch menu item override saved successfully' };
  }

  async upsertCategoryOverride(
    user: AuthUserContext,
    dto: UpsertBranchCategoryOverrideDto,
  ) {
    const category = await this.prisma.menuCategory.findUnique({
      where: { id: dto.menuCategoryId },
    });

    if (!category || category.deletedAt) {
      throw new NotFoundException('Menu category not found');
    }

    const branchId = await this.resolveBranchId(
      user,
      dto.branchId,
      category.restaurantId,
    );

    const data = await this.branchOverrideRepository.upsertCategoryOverride(
      branchId,
      dto.menuCategoryId,
      dto.isVisible ?? true,
    );

    return { data, message: 'Branch category override saved successfully' };
  }

  private async resolveBranchId(
    user: AuthUserContext,
    requestedBranchId: string | undefined,
    restaurantId: string,
  ) {
    if (user.role === UserRoleEnum.BRANCH_ADMIN) {
      if (!user.bid) {
        throw new ForbiddenException('Branch context is required');
      }

      const branch = await this.prisma.branch.findUnique({
        where: { id: user.bid },
      });
      if (!branch || branch.deletedAt) {
        throw new NotFoundException('Branch not found');
      }

      if (branch.restaurantId !== restaurantId) {
        throw new BadRequestException(
          'Item/category does not belong to branch restaurant',
        );
      }

      return user.bid;
    }

    if (
      user.role === UserRoleEnum.BUSINESS_ADMIN ||
      user.role === UserRoleEnum.SUPER_ADMIN
    ) {
      if (!requestedBranchId) {
        throw new BadRequestException('branchId is required');
      }

      const branch = await this.prisma.branch.findUnique({
        where: { id: requestedBranchId },
      });
      if (!branch || branch.deletedAt) {
        throw new NotFoundException('Branch not found');
      }

      if (branch.restaurantId !== restaurantId) {
        throw new BadRequestException(
          'Branch does not belong to item/category restaurant',
        );
      }

      if (
        user.role === UserRoleEnum.BUSINESS_ADMIN &&
        user.rid !== branch.restaurantId
      ) {
        throw new ForbiddenException(
          'You cannot access resources outside your restaurant',
        );
      }

      return requestedBranchId;
    }

    throw new ForbiddenException(
      'Insufficient permissions for branch override',
    );
  }
}
