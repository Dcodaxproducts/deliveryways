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
    this.assertSuperAdmin(user);
    const slug = this.normalizeRequiredString(dto.slug, 'slug');
    await this.assertUniqueSlug(slug);

    const data = await this.cuisineRepository.create({
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
    this.assertSuperAdmin(user);

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
      await this.assertUniqueSlug(slug);
      payload.push({
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
    this.assertAuthenticatedCuisineReader(user);
    const { items, total } = await this.cuisineRepository.list(query);

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

    this.assertAuthenticatedCuisineReader(user);

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

    this.assertSuperAdmin(user);
    const slug =
      dto.slug !== undefined
        ? this.normalizeRequiredString(dto.slug, 'slug')
        : undefined;

    if (slug) {
      await this.assertUniqueSlug(slug, id);
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

    this.assertSuperAdmin(user);
    const cuisines = await this.prisma.cuisine.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true },
    });

    if (cuisines.length !== ids.length) {
      throw new BadRequestException('One or more cuisines were not found');
    }

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

    this.assertSuperAdmin(user);

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

  private assertSuperAdmin(user: AuthUserContext) {
    if (user.role !== UserRoleEnum.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admin can manage cuisines');
    }
  }

  private assertAuthenticatedCuisineReader(user: AuthUserContext) {
    if (!user.role) {
      throw new ForbiddenException('Authenticated user is required');
    }
  }

  private async assertUniqueSlug(slug: string, excludeId?: string) {
    const existing = await this.cuisineRepository.findBySlug(slug, excludeId);

    if (existing) {
      throw new BadRequestException(
        existing.deletedAt
          ? 'A cuisine with this slug already exists, including a deleted cuisine'
          : 'A cuisine with this slug already exists',
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
