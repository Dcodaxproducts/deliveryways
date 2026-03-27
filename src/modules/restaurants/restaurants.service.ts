import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AdminListQueryDto, QueryDto } from '../../common/dto';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { buildPaginationMeta } from '../../common/utils';
import { PrismaTx } from '../../common/types';
import { RestaurantsRepository } from './restaurants.repository';
import { TenantsService } from '../tenants/tenants.service';
import {
  CreateRestaurantDto,
  UpdateRestaurantCustomerAppContentDto,
  UpdateRestaurantDto,
  UpdateRestaurantImagesDto,
} from './dto';

@Injectable()
export class RestaurantsService {
  constructor(
    private readonly restaurantsRepository: RestaurantsRepository,
    private readonly tenantsService: TenantsService,
  ) {}

  async create(tenantId: string, dto: CreateRestaurantDto, tx?: PrismaTx) {
    const slug = await this.ensureUniqueSlug(dto.slug ?? dto.name);

    return this.restaurantsRepository.create(
      {
        tenant: { connect: { id: tenantId } },
        name: dto.name,
        slug,
        logoUrl: dto.logoUrl,
        coverImage: dto.coverImage,
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
    const tenantId = await this.resolveCreateTenantId(user, dto.tenantId);
    const data = await this.create(tenantId, dto, tx);

    return {
      data,
      message: 'Restaurant created successfully',
    };
  }

  async list(user: AuthUserContext, query: AdminListQueryDto) {
    if (user.role !== UserRoleEnum.SUPER_ADMIN && !user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    const allowedWithDeleted =
      user.role === UserRoleEnum.SUPER_ADMIN && !!query.withDeleted;
    const includeInactive =
      (user.role === UserRoleEnum.SUPER_ADMIN ||
        user.role === UserRoleEnum.BUSINESS_ADMIN) &&
      !!query.includeInactive;

    const tenantId =
      user.role === UserRoleEnum.SUPER_ADMIN
        ? undefined
        : user.role === UserRoleEnum.CUSTOMER && user.rid
          ? await this.resolveTenantByRestaurant(user.rid)
          : user.tid;

    const { items, total } = await this.restaurantsRepository.listByTenant(
      tenantId,
      query,
      false,
      allowedWithDeleted,
      includeInactive,
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

  async details(user: AuthUserContext, id: string) {
    const restaurant = await this.restaurantsRepository.findById(id);

    if (!restaurant || restaurant.deletedAt) {
      throw new NotFoundException('Restaurant not found');
    }

    this.ensureRestaurantReadAccess(user, restaurant.id);

    return {
      data: restaurant,
      message: 'Restaurant fetched successfully',
    };
  }

  async update(
    user: AuthUserContext,
    id: string,
    dto: UpdateRestaurantDto,
    tx?: PrismaTx,
  ) {
    this.ensureRestaurantWriteAccess(user, id);

    const data = await this.restaurantsRepository.update(
      id,
      {
        name: dto.name,
        slug: dto.slug ? await this.ensureUniqueSlug(dto.slug, id) : undefined,
        logoUrl: dto.logoUrl,
        coverImage: dto.coverImage,
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

  async suspend(user: AuthUserContext, id: string, tx?: PrismaTx) {
    this.ensureRestaurantWriteAccess(user, id);

    const data = await this.restaurantsRepository.setActive(id, false, tx);
    await this.restaurantsRepository.setBranchesActiveByRestaurant(
      id,
      false,
      tx,
    );

    return {
      data,
      message: 'Restaurant suspended successfully',
    };
  }

  async activate(user: AuthUserContext, id: string, tx?: PrismaTx) {
    this.ensureRestaurantWriteAccess(user, id);

    const data = await this.restaurantsRepository.setActive(id, true, tx);

    return {
      data,
      message: 'Restaurant activated successfully',
    };
  }

  async customerAppContent(user: AuthUserContext, id: string) {
    const restaurant = await this.restaurantsRepository.findById(id);

    if (!restaurant || restaurant.deletedAt) {
      throw new NotFoundException('Restaurant not found');
    }

    this.ensureRestaurantReadAccess(user, id);

    return {
      data: this.extractCustomerAppContent(restaurant),
      message: 'Restaurant customer app content fetched successfully',
    };
  }

  async customerAppContentFromContext(user: AuthUserContext) {
    if (!user.rid) {
      throw new ForbiddenException('Restaurant context is required');
    }

    const restaurant = await this.restaurantsRepository.findById(user.rid);

    if (!restaurant || restaurant.deletedAt) {
      throw new NotFoundException('Restaurant not found');
    }

    return {
      data: this.extractCustomerAppContent(restaurant),
      message: 'Restaurant customer app content fetched successfully',
    };
  }

  async updateCustomerAppContent(
    user: AuthUserContext,
    id: string,
    dto: UpdateRestaurantCustomerAppContentDto,
    tx?: PrismaTx,
  ) {
    this.ensureRestaurantWriteAccess(user, id);

    const restaurant = await this.restaurantsRepository.findById(id);
    if (!restaurant || restaurant.deletedAt) {
      throw new NotFoundException('Restaurant not found');
    }

    const nextSettings = this.mergeCustomerAppContent(restaurant.settings, dto);
    const data = await this.restaurantsRepository.update(
      id,
      {
        settings: nextSettings as Prisma.InputJsonValue,
        supportContact:
          dto.supportContact !== undefined
            ? (dto.supportContact as Prisma.InputJsonValue)
            : undefined,
      },
      tx,
    );

    return {
      data: this.extractCustomerAppContent(data),
      message: 'Restaurant customer app content updated successfully',
    };
  }

  async updateImages(
    user: AuthUserContext,
    id: string,
    dto: UpdateRestaurantImagesDto,
    tx?: PrismaTx,
  ) {
    this.ensureRestaurantWriteAccess(user, id);

    const data = await this.restaurantsRepository.update(
      id,
      {
        logoUrl: dto.logoUrl,
        coverImage: dto.coverImage,
      },
      tx,
    );

    return {
      data,
      message: 'Restaurant images updated successfully',
    };
  }

  async remove(user: AuthUserContext, id: string, tx?: PrismaTx) {
    this.ensureRestaurantWriteAccess(user, id);

    const data = await this.restaurantsRepository.softDelete(id, tx);

    return {
      data,
      message: 'Restaurant and all related branches soft deleted',
    };
  }

  async forceDelete(user: AuthUserContext, id: string, tx?: PrismaTx) {
    if (
      user.role !== UserRoleEnum.SUPER_ADMIN &&
      user.role !== UserRoleEnum.BUSINESS_ADMIN
    ) {
      throw new ForbiddenException(
        'Only business admin or super admin can force delete restaurants',
      );
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN && user.rid !== id) {
      throw new ForbiddenException(
        'You cannot access resources outside your restaurant',
      );
    }

    const summary = await this.restaurantsRepository.getDeleteSummary(id);
    const blockers = Object.entries(summary)
      .filter(([, count]) => count > 0)
      .map(([key, count]) => ({ resource: key, count }));

    if (blockers.length > 0) {
      throw new BadRequestException({
        message:
          'Restaurant cannot be force deleted while related records still exist',
        blockers,
      });
    }

    const data = await this.restaurantsRepository.forceDelete(id, tx);

    return {
      data,
      message: 'Restaurant force deleted successfully',
    };
  }

  private extractCustomerAppContent(restaurant: {
    id: string;
    settings: Prisma.JsonValue | null;
    supportContact: Prisma.JsonValue | null;
  }) {
    return {
      restaurantId: restaurant.id,
      privacyPolicy: this.readStringValue(restaurant.settings, [
        ['customerApp', 'privacyPolicy'],
        ['publicContent', 'privacyPolicy'],
        ['privacyPolicy'],
      ]),
      helpSupport: this.readStringValue(restaurant.settings, [
        ['customerApp', 'helpSupport'],
        ['publicContent', 'helpSupport'],
        ['helpSupport'],
      ]),
      faqs: this.readFaqs(restaurant.settings, [
        ['customerApp', 'faqs'],
        ['publicContent', 'faqs'],
        ['faqs'],
      ]),
      supportContact: this.asObject(restaurant.supportContact),
    };
  }

  private mergeCustomerAppContent(
    currentSettings: Prisma.JsonValue | null,
    dto: UpdateRestaurantCustomerAppContentDto,
  ): Prisma.JsonObject {
    const root = this.asObject(currentSettings);
    const customerApp = this.asObject(root.customerApp);

    return {
      ...root,
      customerApp: {
        ...customerApp,
        ...(dto.privacyPolicy !== undefined
          ? { privacyPolicy: dto.privacyPolicy }
          : {}),
        ...(dto.helpSupport !== undefined
          ? { helpSupport: dto.helpSupport }
          : {}),
        ...(dto.faqs !== undefined
          ? {
              faqs: dto.faqs.map((item) => ({
                question: item.question ?? '',
                answer: item.answer ?? '',
              })),
            }
          : {}),
      },
    } as Prisma.JsonObject;
  }

  private readStringValue(source: unknown, paths: string[][]): string | null {
    for (const path of paths) {
      const value = this.readPath(source, path);
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    return null;
  }

  private readFaqs(
    source: unknown,
    paths: string[][],
  ): Array<{ question: string; answer: string }> {
    for (const path of paths) {
      const value = this.readPath(source, path);
      if (!Array.isArray(value)) {
        continue;
      }

      const items = value
        .map((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) {
            return null;
          }

          const faq = item as Record<string, unknown>;
          if (
            typeof faq.question !== 'string' ||
            typeof faq.answer !== 'string'
          ) {
            return null;
          }

          return {
            question: faq.question,
            answer: faq.answer,
          };
        })
        .filter(
          (item): item is { question: string; answer: string } => item !== null,
        );

      return items;
    }

    return [];
  }

  private readPath(source: unknown, path: string[]) {
    let current = source;

    for (const segment of path) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return undefined;
      }

      current = (current as Record<string, unknown>)[segment];
    }

    return current;
  }

  private asObject(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private async resolveTenantByRestaurant(
    restaurantId: string,
  ): Promise<string> {
    const tenantId =
      await this.restaurantsRepository.findTenantIdByRestaurant(restaurantId);

    if (!tenantId) {
      throw new ForbiddenException('Restaurant context is invalid');
    }

    return tenantId;
  }

  private async resolveCreateTenantId(
    user: AuthUserContext,
    requestedTenantId?: string,
  ): Promise<string> {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      if (!requestedTenantId) {
        throw new BadRequestException('tenantId is required for super admin');
      }

      const tenant = await this.tenantsService.findById(requestedTenantId);
      if (!tenant || tenant.deletedAt) {
        throw new NotFoundException('Tenant not found');
      }

      return requestedTenantId;
    }

    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    return user.tid;
  }

  private ensureRestaurantReadAccess(
    user: AuthUserContext,
    restaurantId: string,
  ) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return;
    }

    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    if (
      user.role !== UserRoleEnum.BUSINESS_ADMIN ||
      user.rid !== restaurantId
    ) {
      throw new ForbiddenException(
        'You cannot access resources outside your restaurant',
      );
    }
  }

  private ensureRestaurantWriteAccess(
    user: AuthUserContext,
    restaurantId: string,
  ) {
    this.ensureRestaurantReadAccess(user, restaurantId);
  }

  private async ensureUniqueSlug(
    base: string,
    ignoreId?: string,
  ): Promise<string> {
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
