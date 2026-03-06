import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AdminListQueryDto, QueryDto } from '../../common/dto';
import { buildPaginationMeta } from '../../common/utils';
import { AuthUserContext } from '../../common/decorators';
import { PrismaTx } from '../../common/types';
import { BranchesRepository } from './branches.repository';
import { CreateBranchDto, UpdateBranchDto } from './dto';

@Injectable()
export class BranchesService {
  constructor(private readonly branchesRepository: BranchesRepository) {}

  async create(
    tenantId: string,
    dto: CreateBranchDto,
    tx?: PrismaTx,
  ) {
    return this.branchesRepository.create(
      {
        tenantId,
        restaurantId: dto.restaurantId,
        name: dto.name,
        isMain: dto.isMain,
        managerId: dto.managerId,
        street: dto.street,
        area: dto.area,
        city: dto.city,
        state: dto.state,
        country: dto.country,
        coverImage: dto.coverImage,
        description: dto.description,
        settings: dto.settings as unknown as Prisma.InputJsonValue,
      },
      tx,
    );
  }

  async createFromUser(
    user: AuthUserContext,
    dto: CreateBranchDto,
    tx?: PrismaTx,
  ) {
    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    const data = await this.create(user.tid, dto, tx);

    return {
      data,
      message: 'Branch created successfully',
    };
  }

  async list(
    user: AuthUserContext,
    restaurantId: string,
    query: AdminListQueryDto,
  ) {
    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    if (user.role === 'BRANCH_ADMIN' && user.bid) {
      const items = await this.branchesRepository.listByBranchId(user.bid);
      return {
        data: items,
        message: 'Branch admin scope applied',
        meta: {
          page: 1,
          limit: items.length,
          total: items.length,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false,
        },
      };
    }

    const allowWithDeleted = user.role === 'SUPER_ADMIN' && !!query.withDeleted;
    const includeInactive =
      (user.role === 'SUPER_ADMIN' ||
        user.role === 'BUSINESS_ADMIN' ||
        user.role === 'BRANCH_ADMIN') &&
      !!query.includeInactive;

    const { items, total } = await this.branchesRepository.listByRestaurant(
      user.tid,
      restaurantId,
      query,
      false,
      allowWithDeleted,
      includeInactive,
    );

    return {
      data: items,
      message: 'Branches fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async listPublic(tenantId: string, restaurantId: string, query: QueryDto) {
    const { items, total } = await this.branchesRepository.listByRestaurant(
      tenantId,
      restaurantId,
      query,
      true,
    );

    return {
      data: items,
      message: 'Public branches fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async update(
    _user: AuthUserContext,
    id: string,
    dto: UpdateBranchDto,
    tx?: PrismaTx,
  ) {
    const data = await this.branchesRepository.update(
      id,
      {
        name: dto.name,
        isMain: dto.isMain,
        manager: dto.managerId
          ? {
              connect: { id: dto.managerId },
            }
          : undefined,
        coverImage: dto.coverImage,
        description: dto.description,
        settings: dto.settings as unknown as Prisma.InputJsonValue,
      },
      tx,
    );

    return {
      data,
      message: 'Branch updated successfully',
    };
  }

  async suspend(_user: AuthUserContext, id: string, tx?: PrismaTx) {
    const data = await this.branchesRepository.setActive(id, false, tx);

    return {
      data,
      message: 'Branch suspended successfully',
    };
  }

  async activate(_user: AuthUserContext, id: string, tx?: PrismaTx) {
    const data = await this.branchesRepository.setActive(id, true, tx);

    return {
      data,
      message: 'Branch activated successfully',
    };
  }

  async remove(_user: AuthUserContext, id: string, tx?: PrismaTx) {
    const data = await this.branchesRepository.softDelete(id, tx);

    return {
      data,
      message: 'Branch soft deleted successfully',
    };
  }
}
