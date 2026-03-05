import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { QueryDto } from '../../common/dto';
import { buildPaginationMeta } from '../../common/utils';
import { AuthUserContext } from '../../common/decorators';
import { PrismaTx } from '../../common/types';
import { RestaurantsRepository } from './restaurants.repository';
import { CreateRestaurantDto, UpdateRestaurantDto } from './dto';

@Injectable()
export class RestaurantsService {
  constructor(private readonly restaurantsRepository: RestaurantsRepository) {}

  async create(
    tenantId: string,
    dto: CreateRestaurantDto,
    tx?: PrismaTx,
  ) {
    const slug = await this.ensureUniqueSlug(dto.slug ?? dto.name);

    return this.restaurantsRepository.create(
      {
        tenant: { connect: { id: tenantId } },
        name: dto.name,
        slug,
        logoUrl: dto.logoUrl,
        customDomain: dto.customDomain,
        tagline: dto.tagline,
        bio: dto.bio,
        supportContact: dto.supportContact as Prisma.InputJsonValue,
        branding: dto.branding as Prisma.InputJsonValue,
        socialMedia: dto.socialMedia as Prisma.InputJsonValue,
        settings: dto.settings as Prisma.InputJsonValue,
      },
      tx,
    );
  }

  async createFromUser(
    user: AuthUserContext,
    dto: CreateRestaurantDto,
    tx?: PrismaTx,
  ) {
    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    const data = await this.create(user.tid, dto, tx);

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

  async update(
    user: AuthUserContext,
    id: string,
    dto: UpdateRestaurantDto,
    tx?: PrismaTx,
  ) {
    if (user.role !== 'SUPER_ADMIN' && !user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    const data = await this.restaurantsRepository.update(
      id,
      {
        name: dto.name,
        slug: dto.slug ? await this.ensureUniqueSlug(dto.slug, id) : undefined,
        logoUrl: dto.logoUrl,
        customDomain: dto.customDomain,
        tagline: dto.tagline,
        bio: dto.bio,
        supportContact: dto.supportContact as Prisma.InputJsonValue,
        branding: dto.branding as Prisma.InputJsonValue,
        socialMedia: dto.socialMedia as Prisma.InputJsonValue,
        settings: dto.settings as Prisma.InputJsonValue,
      },
      tx,
    );

    return {
      data,
      message: 'Restaurant updated successfully',
    };
  }

  async remove(_user: AuthUserContext, id: string, tx?: PrismaTx) {
    const data = await this.restaurantsRepository.softDelete(id, tx);

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

  private async ensureUniqueSlug(base: string, ignoreId?: string): Promise<string> {
    const normalizedBase = base
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');

    let candidate = normalizedBase;
    let counter = 1;

    while (true) {
      const existing = await this.restaurantsRepository.findBySlug(candidate);
      if (!existing || existing.id === ignoreId) {
        return candidate;
      }
      candidate = `${normalizedBase}-${counter}`;
      counter += 1;
    }
  }
}
