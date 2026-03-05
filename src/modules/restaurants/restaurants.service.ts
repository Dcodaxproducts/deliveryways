import { ForbiddenException, Injectable } from '@nestjs/common';
import { QueryDto } from '../../common/dto';
import { buildPaginationMeta } from '../../common/utils';
import { AuthUserContext } from '../../common/decorators';
import { RestaurantsRepository } from './restaurants.repository';
import { CreateRestaurantDto, UpdateRestaurantDto } from './dto';

@Injectable()
export class RestaurantsService {
  constructor(private readonly restaurantsRepository: RestaurantsRepository) {}

  async create(user: AuthUserContext, dto: CreateRestaurantDto) {
    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    const data = await this.restaurantsRepository.create({
      tenant: { connect: { id: user.tid } },
      name: dto.name,
      slug: dto.slug,
      logo: dto.logo,
      customDomain: dto.customDomain,
    });

    return {
      data,
      message: 'Restaurant created successfully',
    };
  }

  async list(user: AuthUserContext, query: QueryDto, withDeleted = false) {
    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    const allowedWithDeleted = user.role === 'SUPER_ADMIN' && withDeleted;

    const tenantId =
      user.role === 'CUSTOMER' && user.rid
        ? (await this.resolveTenantByRestaurant(user.rid))
        : user.tid;

    const { items, total } = await this.restaurantsRepository.listByTenant(
      tenantId,
      query,
      false,
      allowedWithDeleted,
    );

    return {
      data: items,
      message: 'Restaurants fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async listPublic(tenantId: string, query: QueryDto) {
    const { items, total } = await this.restaurantsRepository.listByTenant(
      tenantId,
      query,
      true,
    );

    return {
      data: items,
      message: 'Public restaurants fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async update(user: AuthUserContext, id: string, dto: UpdateRestaurantDto) {
    if (user.role !== 'SUPER_ADMIN' && !user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    const data = await this.restaurantsRepository.update(id, dto);

    return {
      data,
      message: 'Restaurant updated successfully',
    };
  }

  async remove(_user: AuthUserContext, id: string) {
    const data = await this.restaurantsRepository.softDelete(id);

    return {
      data,
      message: 'Restaurant and all related branches soft deleted',
    };
  }

  private async resolveTenantByRestaurant(restaurantId: string): Promise<string> {
    const tenantId =
      await this.restaurantsRepository.findTenantIdByRestaurant(restaurantId);

    if (!tenantId) {
      throw new ForbiddenException('Restaurant context is invalid');
    }

    return tenantId;
  }
}
