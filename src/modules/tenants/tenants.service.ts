import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AdminListQueryDto, QueryDto } from '../../common/dto';
import { buildPaginationMeta } from '../../common/utils';
import { AuthUserContext } from '../../common/decorators';
import { PrismaTx } from '../../common/types';
import { TenantsRepository } from './tenants.repository';
import { CreateTenantDto, UpdateTenantDto } from './dto';

@Injectable()
export class TenantsService {
  constructor(private readonly tenantsRepository: TenantsRepository) {}

  async create(dto: CreateTenantDto, tx?: PrismaTx) {
    return this.tenantsRepository.create(
      {
        name: dto.name,
        slug: dto.slug,
        bio: dto.bio,
        logoUrl: dto.logoUrl,
        socialLinks: dto.socialLinks as Prisma.InputJsonValue,
        brandingConfig: dto.brandingConfig as Prisma.InputJsonValue,
        settings: dto.settings as Prisma.InputJsonValue,
      },
      tx,
    );
  }

  async assignOwner(tenantId: string, ownerId: string, tx?: PrismaTx) {
    return this.tenantsRepository.update(
      tenantId,
      {
        owner: {
          connect: { id: ownerId },
        },
      },
      tx,
    );
  }

  async listTenants(user: AuthUserContext, query: AdminListQueryDto) {
    if (user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only super admin can list all tenants');
    }

    const { items, total } = await this.tenantsRepository.list(
      query,
      !!query.withDeleted,
      !!query.includeInactive,
    );

    return {
      data: items,
      message: 'Tenants fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async updateTenant(
    user: AuthUserContext,
    tenantId: string,
    dto: UpdateTenantDto,
    tx?: PrismaTx,
  ) {
    if (user.role !== 'SUPER_ADMIN' && user.tid !== tenantId) {
      throw new ForbiddenException('You can only manage your tenant');
    }

    const data = await this.tenantsRepository.update(
      tenantId,
      {
        name: dto.name,
        bio: dto.bio,
        logoUrl: dto.logoUrl,
        isActive: dto.isActive,
        socialLinks: dto.socialLinks as Prisma.InputJsonValue,
        brandingConfig: dto.brandingConfig as Prisma.InputJsonValue,
        settings: dto.settings as Prisma.InputJsonValue,
      },
      tx,
    );

    return {
      data,
      message: 'Tenant updated successfully',
    };
  }

  async tenantAnalytics(user: AuthUserContext, tenantId: string) {
    if (user.role !== 'SUPER_ADMIN' && user.tid !== tenantId) {
      throw new ForbiddenException('You can only view your tenant analytics');
    }

    const data = await this.tenantsRepository.analytics(tenantId);

    return {
      data,
      message: 'Tenant analytics fetched successfully',
    };
  }
}
