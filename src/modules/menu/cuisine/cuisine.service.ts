import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUserContext } from '../../../common/decorators';
import { UserRoleEnum } from '../../../common/enums';
import { buildPaginationMeta } from '../../../common/utils';
import { PrismaService } from '../../../database';
import { StorageService } from '../../storage/storage.service';
import {
  BulkCreateCuisinesDto,
  CreateCuisineDto,
  ListCuisinesAdminDto,
  ReorderCuisinesDto,
  UpdateCuisineDto,
} from './dto';
import { CuisineRepository } from './cuisine.repository';

@Injectable()
export class CuisineService {
  constructor(
    private readonly cuisineRepository: CuisineRepository,
    private readonly prisma: PrismaService,
    private readonly storageService?: StorageService,
  ) {}

  async create(user: AuthUserContext, dto: CreateCuisineDto) {
    const restaurantId = await this.resolveRestaurantId(user, dto.restaurantId);
    const slug = this.normalizeRequiredString(dto.slug, 'slug');
    await this.assertUniqueSlug(restaurantId, slug);

    const data = await this.cuisineRepository.create({
      restaurant: { connect: { id: restaurantId } },
      name: dto.name,
      slug,
      description: dto.description,
      imageUrl: dto.imageUrl,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });

    return {
      data: await this.resolveMediaResponse(data),
      message: 'Cuisine created successfully',
    };
  }

  async createBulk(user: AuthUserContext, dto: BulkCreateCuisinesDto) {
    const restaurantId = await this.resolveRestaurantId(user, dto.restaurantId);

    if (!dto.items.length) {
      throw new BadRequestException('At least one item is required');
    }

    const seenSlugs = new Set<string>();
    const payload: Prisma.CuisineCreateManyInput[] = [];

    for (const item of dto.items) {
      const slug = this.normalizeRequiredString(item.slug, 'slug');
      if (seenSlugs.has(slug)) {
        throw new BadRequestException('Cuisine slugs must be unique');
      }
      seenSlugs.add(slug);
      await this.assertUniqueSlug(restaurantId, slug);
      payload.push({
        restaurantId,
        name: item.name,
        slug,
        description: item.description,
        imageUrl: item.imageUrl,
        sortOrder: item.sortOrder ?? 0,
        isActive: item.isActive ?? true,
      });
    }

    const result = await this.cuisineRepository.createMany(payload);

    return {
      data: { count: result.count },
      message: 'Cuisines created successfully',
    };
  }

  async list(user: AuthUserContext, query: ListCuisinesAdminDto) {
    const restaurantId = await this.resolveRestaurantIdForList(
      user,
      query.restaurantId,
    );
    const { items, total } = await this.cuisineRepository.list(
      restaurantId,
      query,
    );

    return {
      data: await this.resolveMediaResponse(items),
      message: 'Cuisines fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async getById(user: AuthUserContext, id: string) {
    const cuisine = await this.cuisineRepository.findDetailById(id);
    if (!cuisine || cuisine.deletedAt) {
      throw new NotFoundException('Cuisine not found');
    }

    await this.ensureCanAccessRestaurant(user, cuisine.restaurantId);

    return {
      data: await this.resolveMediaResponse(cuisine),
      message: 'Cuisine fetched successfully',
    };
  }

  async update(user: AuthUserContext, id: string, dto: UpdateCuisineDto) {
    const cuisine = await this.cuisineRepository.findById(id);
    if (!cuisine || cuisine.deletedAt) {
      throw new NotFoundException('Cuisine not found');
    }

    await this.ensureCanAccessRestaurant(user, cuisine.restaurantId);
    const slug =
      dto.slug !== undefined
        ? this.normalizeRequiredString(dto.slug, 'slug')
        : undefined;

    if (slug) {
      await this.assertUniqueSlug(cuisine.restaurantId, slug, id);
    }

    const data = await this.cuisineRepository.update(id, {
      name: dto.name,
      slug,
      description: dto.description,
      imageUrl: dto.imageUrl,
      sortOrder: dto.sortOrder,
      isActive: dto.isActive,
    });

    return {
      data: await this.resolveMediaResponse(data),
      message: 'Cuisine updated successfully',
    };
  }

  async reorder(user: AuthUserContext, dto: ReorderCuisinesDto) {
    if (!dto.items.length) {
      throw new BadRequestException('At least one cuisine is required');
    }

    const ids = dto.items.map((item) => item.id);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Cuisine reorder ids must be unique');
    }

    const cuisines = await this.prisma.cuisine.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, restaurantId: true },
    });

    if (cuisines.length !== ids.length) {
      throw new BadRequestException('One or more cuisines were not found');
    }

    const restaurantIds = new Set(
      cuisines.map((cuisine) => cuisine.restaurantId),
    );
    if (restaurantIds.size !== 1) {
      throw new BadRequestException(
        'All cuisines must belong to one restaurant',
      );
    }

    await this.ensureCanAccessRestaurant(user, [...restaurantIds][0]);

    const sortOrderById = new Map(
      dto.items.map((item) => [item.id, item.sortOrder]),
    );
    await this.prisma.$transaction(
      cuisines.map((cuisine) =>
        this.prisma.cuisine.update({
          where: { id: cuisine.id },
          data: { sortOrder: sortOrderById.get(cuisine.id) ?? 0 },
        }),
      ),
    );

    return {
      data: { count: dto.items.length },
      message: 'Cuisines reordered successfully',
    };
  }

  async remove(user: AuthUserContext, id: string) {
    const cuisine = await this.cuisineRepository.findById(id);
    if (!cuisine || cuisine.deletedAt) {
      throw new NotFoundException('Cuisine not found');
    }

    await this.ensureCanAccessRestaurant(user, cuisine.restaurantId);

    const itemsCount = await this.cuisineRepository.countItems(id);
    if (itemsCount > 0) {
      throw new BadRequestException(
        'Cuisine cannot be permanently deleted while menu items are assigned',
      );
    }

    const data = await this.prisma.$transaction(async (tx) => {
      await this.cuisineRepository.deleteItemLinks(id, tx);
      return this.cuisineRepository.hardDelete(id, tx);
    });

    return { data, message: 'Cuisine deleted successfully' };
  }

  private async resolveRestaurantId(
    user: AuthUserContext,
    requestedRestaurantId?: string,
  ): Promise<string> {
    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      if (!user.tid) {
        throw new ForbiddenException('Tenant context is required');
      }

      if (!requestedRestaurantId) {
        throw new BadRequestException('restaurantId is required');
      }

      await this.assertRestaurantInTenant(user.tid, requestedRestaurantId);
      return requestedRestaurantId;
    }

    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      if (!requestedRestaurantId) {
        throw new BadRequestException('restaurantId is required');
      }

      return requestedRestaurantId;
    }

    throw new ForbiddenException('Insufficient permissions for cuisine write');
  }

  private async resolveRestaurantIdForList(
    user: AuthUserContext,
    requestedRestaurantId?: string,
  ): Promise<string | undefined> {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return requestedRestaurantId;
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      if (!user.tid) {
        throw new ForbiddenException('Tenant context is required');
      }

      const restaurantId = requestedRestaurantId ?? user.rid;
      if (!restaurantId) {
        throw new BadRequestException('restaurantId is required');
      }

      await this.assertRestaurantInTenant(user.tid, restaurantId);
      return restaurantId;
    }

    if (
      user.role === UserRoleEnum.BRANCH_ADMIN ||
      user.role === UserRoleEnum.CUSTOMER
    ) {
      if (!user.rid) {
        throw new ForbiddenException('Restaurant context is required');
      }

      if (requestedRestaurantId && requestedRestaurantId !== user.rid) {
        throw new ForbiddenException(
          'You cannot access resources outside your restaurant',
        );
      }

      return user.rid;
    }

    throw new ForbiddenException('Insufficient permissions for cuisines');
  }

  private async ensureCanAccessRestaurant(
    user: AuthUserContext,
    restaurantId: string,
  ) {
    if (user.role === UserRoleEnum.SUPER_ADMIN) {
      return;
    }

    if (user.role === UserRoleEnum.BUSINESS_ADMIN) {
      if (!user.tid) {
        throw new ForbiddenException('Tenant context is required');
      }

      await this.assertRestaurantInTenant(user.tid, restaurantId);
      return;
    }

    if (user.rid !== restaurantId) {
      throw new ForbiddenException(
        'You cannot access resources outside your restaurant',
      );
    }
  }

  private async assertRestaurantInTenant(
    tenantId: string,
    restaurantId: string,
  ) {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { id: restaurantId, tenantId, deletedAt: null },
      select: { id: true },
    });

    if (!restaurant) {
      throw new ForbiddenException(
        'You cannot access resources outside your tenant restaurants',
      );
    }
  }

  private async assertUniqueSlug(
    restaurantId: string,
    slug: string,
    excludeId?: string,
  ) {
    const existing = await this.cuisineRepository.findByRestaurantAndSlug(
      restaurantId,
      slug,
      excludeId,
    );

    if (existing) {
      throw new BadRequestException(
        existing.deletedAt
          ? 'A cuisine with this slug already exists in this restaurant, including a deleted cuisine'
          : 'A cuisine with this slug already exists in this restaurant',
      );
    }
  }

  private normalizeRequiredString(value: string, field: string) {
    const normalized = value.trim();

    if (!normalized) {
      throw new BadRequestException(`${field} is required`);
    }

    return normalized;
  }

  private async resolveMediaResponse<T>(data: T) {
    return (await this.storageService?.resolveMediaUrlsDeep(data)) ?? data;
  }
}
