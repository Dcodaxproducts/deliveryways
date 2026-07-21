import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AdminListQueryDto } from '../../common/dto';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { buildPaginationMeta } from '../../common/utils';
import { PrismaTx } from '../../common/types';
import { TenantsRepository } from './tenants.repository';
import { CreateTenantDto, UpdateTenantDto } from './dto';
import { StorageService } from '../storage/storage.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class TenantsService {
  constructor(
    private readonly tenantsRepository: TenantsRepository,
    private readonly storageService: StorageService,
    private readonly usersService: UsersService,
  ) {}

  async create(dto: CreateTenantDto, tx?: PrismaTx) {
    const slug = await this.ensureUniqueSlug(dto.name);

    return this.tenantsRepository.create(
      {
        name: dto.name,
        slug,
        bio: dto.bio,
        logoUrl: dto.logoUrl,
        socialLinks: dto.socialLinks as Prisma.InputJsonValue,
        brandingConfig: dto.brandingConfig as Prisma.InputJsonValue,
        settings: dto.settings as Prisma.InputJsonValue,
      },
      tx,
    );
  }

  private async ensureUniqueSlug(source: string): Promise<string> {
    const base =
      source
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'business';
    let candidate = base;
    let counter = 2;

    while (await this.tenantsRepository.findBySlug(candidate)) {
      candidate = `${base}-${counter}`;
      counter += 1;
    }

    return candidate;
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

  async findBySlug(slug: string) {
    return this.tenantsRepository.findBySlug(slug);
  }

  async findById(id: string) {
    return this.tenantsRepository.findById(id);
  }

  async tenantDetails(user: AuthUserContext, tenantId: string) {
    if (user.role !== UserRoleEnum.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admin can view tenant details');
    }

    const tenant = await this.tenantsRepository.findDetailsById(tenantId);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return {
      data: await this.storageService.resolveMediaUrlsDeep(
        this.withDeletionState(this.withVerificationState(tenant)),
      ),
      message: 'Tenant fetched successfully',
    };
  }

  async listTenants(user: AuthUserContext, query: AdminListQueryDto) {
    if (user.role !== UserRoleEnum.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admin can list all tenants');
    }

    const { items, total } = await this.tenantsRepository.list(
      query,
      !!query.withDeleted,
      !!query.includeInactive,
    );

    return {
      data: await this.storageService.resolveMediaUrlsDeep(
        items.map((item) =>
          this.withDeletionState(this.withVerificationState(item)),
        ),
      ),
      message: 'Tenants fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async resetOwnerPassword(
    user: AuthUserContext,
    tenantId: string,
    password: string,
  ) {
    if (user.role !== UserRoleEnum.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only super admin can reset business owner passwords',
      );
    }

    const owner = await this.tenantsRepository.findOwnerByTenantId(tenantId);
    if (!owner) {
      throw new NotFoundException('Business owner not found');
    }

    await this.usersService.updatePassword(owner.id, password);

    return {
      data: { ownerId: owner.id, email: owner.email },
      message: 'Business owner password updated successfully',
    };
  }

  async updateTenant(
    user: AuthUserContext,
    tenantId: string,
    dto: UpdateTenantDto,
    tx?: PrismaTx,
  ) {
    if (user.role !== UserRoleEnum.SUPER_ADMIN && user.tid !== tenantId) {
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
      data: await this.storageService.resolveMediaUrlsDeep(
        this.withDeletionState(data),
      ),
      message: 'Tenant updated successfully',
    };
  }

  async tenantAnalytics(user: AuthUserContext, tenantId: string) {
    if (user.role !== UserRoleEnum.SUPER_ADMIN && user.tid !== tenantId) {
      throw new ForbiddenException('You can only view your tenant analytics');
    }

    const data = await this.tenantsRepository.analytics(tenantId);

    return {
      data,
      message: 'Tenant analytics fetched successfully',
    };
  }

  async forceDeleteTenant(user: AuthUserContext, tenantId: string) {
    if (user.role !== UserRoleEnum.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admin can force delete tenants');
    }

    const tenant = await this.tenantsRepository.findById(tenantId);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const summary = await this.tenantsRepository.getDeleteSummary(tenantId);
    const data = await this.prismaTransaction((tx) =>
      this.tenantsRepository.forceDeleteWithRelations(tenantId, tx),
    );

    return {
      data: { ...data, deletionSummary: summary },
      message: 'Tenant force deleted successfully',
    };
  }

  private prismaTransaction<T>(callback: (tx: PrismaTx) => Promise<T>) {
    return this.tenantsRepository.transaction(callback);
  }

  private withDeletionState<
    T extends {
      deletedAt?: Date | null;
      isActive?: boolean;
    },
  >(entity: T) {
    return {
      ...entity,
      deletionState: {
        isDeleted: !!entity.deletedAt,
        deletionScheduled: false,
        deletedAt: entity.deletedAt ?? null,
        deleteAfter: null,
        isActive: entity.isActive ?? true,
      },
    };
  }

  private withVerificationState<
    T extends {
      owner?: { isApproved?: boolean; isVerified?: boolean } | null;
    },
  >(entity: T) {
    const { owner, ...tenant } = entity;

    return {
      ...tenant,
      owner,
      ownerId:
        owner && 'id' in owner && typeof owner.id === 'string'
          ? owner.id
          : null,
      isApproved: owner?.isApproved ?? false,
      isVerified: owner?.isVerified ?? false,
    };
  }
}
