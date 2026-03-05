import { ForbiddenException, Injectable } from '@nestjs/common';
import { QueryDto } from '../../common/dto';
import { buildPaginationMeta } from '../../common/utils';
import { AuthUserContext } from '../../common/decorators';
import { BranchesRepository } from './branches.repository';
import { CreateBranchDto, UpdateBranchDto } from './dto';

@Injectable()
export class BranchesService {
  constructor(private readonly branchesRepository: BranchesRepository) {}

  async create(user: AuthUserContext, dto: CreateBranchDto) {
    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    const data = await this.branchesRepository.createBranch({
      tenantId: user.tid,
      ...dto,
    });

    return {
      data,
      message: 'Branch created successfully',
    };
  }

  async list(user: AuthUserContext, restaurantId: string, query: QueryDto) {
    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    const { items, total } = await this.branchesRepository.listByRestaurant(
      user.tid,
      restaurantId,
      query,
      false,
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

  async update(_user: AuthUserContext, id: string, dto: UpdateBranchDto) {
    const data = await this.branchesRepository.update(id, dto);

    return {
      data,
      message: 'Branch updated successfully',
    };
  }

  async remove(_user: AuthUserContext, id: string) {
    const data = await this.branchesRepository.softDelete(id);

    return {
      data,
      message: 'Branch soft deleted successfully',
    };
  }
}
