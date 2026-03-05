import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { QueryDto } from '../../common/dto';
import { buildPaginationMeta } from '../../common/utils';
import { AuthUserContext } from '../../common/decorators';
import { TenantsRepository } from './tenants.repository';
import { UpdateTenantDto } from './dto';

@Injectable()
export class TenantsService {
  constructor(private readonly tenantsRepository: TenantsRepository) {}

  async listTenants(user: AuthUserContext, query: QueryDto, withDeleted = false) {
    if (user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only super admin can list all tenants');
    }

    const { items, total } = await this.tenantsRepository.list(query, withDeleted);

    return {
      data: items,
      message: 'Tenants fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async updateTenant(user: AuthUserContext, tenantId: string, dto: UpdateTenantDto) {
    if (user.role !== 'SUPER_ADMIN' && user.tid !== tenantId) {
      throw new ForbiddenException('You can only manage your tenant');
    }

    const data = await this.tenantsRepository.update(tenantId, {
      name: dto.name,
      isActive: dto.isActive,
      brandingConfig: dto.brandingConfig as Prisma.InputJsonValue,
      settings: dto.settings as Prisma.InputJsonValue,
    });

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
