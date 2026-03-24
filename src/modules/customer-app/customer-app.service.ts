import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUserContext } from '../../common/decorators';
import { UserRoleEnum } from '../../common/enums';
import { buildPaginationMeta } from '../../common/utils';
import {
  HomeScreenQueryDto,
  ListCuisinesQueryDto,
  ListCustomerFavoritesQueryDto,
  PublicRestaurantQueryDto,
  ToggleFavoriteDto,
} from './dto';
import { CustomerAppRepository } from './customer-app.repository';

interface FavoriteMetadataShape {
  customerApp?: {
    favoriteMenuItemIds?: string[];
  };
}

export interface FaqItem {
  question: string;
  answer: string;
}

@Injectable()
export class CustomerAppService {
  constructor(private readonly customerAppRepository: CustomerAppRepository) {}

  async listFavorites(
    user: AuthUserContext,
    query: ListCustomerFavoritesQueryDto,
    requestedCustomerId?: string,
  ) {
    const customer = await this.resolveCustomer(user, requestedCustomerId);
    const favoriteMenuItemIds = this.readFavoriteMenuItemIds(
      customer.profile?.metadata,
    );

    if (!favoriteMenuItemIds.length || !customer.restaurantId) {
      return {
        data: [],
        message: 'Favorite items fetched successfully',
        meta: buildPaginationMeta(query, 0),
      };
    }

    const { items, total } =
      await this.customerAppRepository.findFavoriteMenuItems(
        customer.restaurantId,
        customer.branchId ?? undefined,
        favoriteMenuItemIds,
        query,
      );

    return {
      data: items.map((item) => this.mapMenuItem(item)),
      message: 'Favorite items fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async addFavorite(
    user: AuthUserContext,
    dto: ToggleFavoriteDto,
    requestedCustomerId?: string,
  ) {
    const customer = await this.resolveCustomer(user, requestedCustomerId);
    const favoriteMenuItemIds = this.readFavoriteMenuItemIds(
      customer.profile?.metadata,
    );

    if (favoriteMenuItemIds.includes(dto.menuItemId)) {
      return {
        data: { favoriteMenuItemIds },
        message: 'Item already added to favorites',
      };
    }

    const updatedIds = [...favoriteMenuItemIds, dto.menuItemId];
    await this.customerAppRepository.upsertCustomerProfile(
      customer.id,
      this.writeFavoriteMenuItemIds(customer.profile?.metadata, updatedIds),
    );

    return {
      data: { favoriteMenuItemIds: updatedIds },
      message: 'Item added to favorites successfully',
    };
  }

  async removeFavorite(
    user: AuthUserContext,
    menuItemId: string,
    requestedCustomerId?: string,
  ) {
    const customer = await this.resolveCustomer(user, requestedCustomerId);
    const favoriteMenuItemIds = this.readFavoriteMenuItemIds(
      customer.profile?.metadata,
    );
    const updatedIds = favoriteMenuItemIds.filter((id) => id !== menuItemId);

    await this.customerAppRepository.upsertCustomerProfile(
      customer.id,
      this.writeFavoriteMenuItemIds(customer.profile?.metadata, updatedIds),
    );

    return {
      data: { favoriteMenuItemIds: updatedIds },
      message: 'Item removed from favorites successfully',
    };
  }

  async getPrivacyPolicy(query: PublicRestaurantQueryDto) {
    const { restaurant } = await this.getPublicContent(query);
    const privacyPolicy = this.readStringValue(restaurant.settings, [
      ['customerApp', 'privacyPolicy'],
      ['publicContent', 'privacyPolicy'],
      ['privacyPolicy'],
      ['privacy_policy'],
    ]);

    return {
      data: {
        restaurantId: restaurant.id,
        title: 'Privacy Policy',
        content: privacyPolicy,
      },
      message: 'Privacy policy fetched successfully',
    };
  }

  async getHelpSupport(query: PublicRestaurantQueryDto) {
    const { restaurant, branch } = await this.getPublicContent(query);
    const branchSettings = branch?.settings;

    return {
      data: {
        restaurantId: restaurant.id,
        branchId: branch?.id ?? null,
        title: 'Help & Support',
        content:
          this.readStringValue(branchSettings, [
            ['customerApp', 'helpSupport'],
            ['publicContent', 'helpSupport'],
            ['helpSupport'],
            ['help_support'],
          ]) ??
          this.readStringValue(restaurant.settings, [
            ['customerApp', 'helpSupport'],
            ['publicContent', 'helpSupport'],
            ['helpSupport'],
            ['help_support'],
          ]),
        contacts: {
          phone:
            this.readStringValue(branchSettings, [['contact', 'phone']]) ??
            this.readStringValue(restaurant.supportContact, [['phone']]),
          whatsapp:
            this.readStringValue(branchSettings, [['contact', 'whatsapp']]) ??
            this.readStringValue(restaurant.supportContact, [['whatsapp']]),
          email: this.readStringValue(restaurant.supportContact, [['email']]),
        },
      },
      message: 'Help and support fetched successfully',
    };
  }

  async getFaqs(query: PublicRestaurantQueryDto) {
    const { restaurant, branch } = await this.getPublicContent(query);
    const faqs =
      this.readFaqs(branch?.settings, [
        ['customerApp', 'faqs'],
        ['publicContent', 'faqs'],
        ['faqs'],
      ]) ??
      this.readFaqs(restaurant.settings, [
        ['customerApp', 'faqs'],
        ['publicContent', 'faqs'],
        ['faqs'],
      ]) ??
      [];

    return {
      data: {
        restaurantId: restaurant.id,
        branchId: branch?.id ?? null,
        items: faqs,
      },
      message: 'FAQs fetched successfully',
    };
  }

  async listCuisines(query: ListCuisinesQueryDto) {
    await this.getPublicContent(query);
    const { items, total } =
      await this.customerAppRepository.listCuisineCategories(query);

    return {
      data: items.map((item) => ({
        id: item.id,
        name: item.name,
        slug: item.slug,
        description: item.description,
        imageUrl: item.imageUrl,
        sortOrder: item.sortOrder,
        itemCount: item._count.items,
      })),
      message: 'Cuisines fetched successfully',
      meta: buildPaginationMeta(query, total),
    };
  }

  async getHomeScreen(query: HomeScreenQueryDto) {
    const { restaurant, branch } = await this.getPublicContent(query);
    const [cuisines, promotionalItems, faqs] = await Promise.all([
      this.customerAppRepository.listCuisineCategories({
        ...query,
        page: 1,
        limit: query.cuisineLimit,
        sortBy: 'sortOrder',
        sortOrder: 'ASC',
      }),
      this.customerAppRepository.listPromotionalItems(query),
      this.getFaqs(query),
    ]);

    return {
      data: {
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
          logoUrl: restaurant.logoUrl,
          tagline: restaurant.tagline,
          bio: restaurant.bio,
        },
        branch: branch
          ? {
              id: branch.id,
              name: branch.name,
              coverImage: branch.coverImage,
              description: branch.description,
            }
          : null,
        cuisines: cuisines.items.map((item) => ({
          id: item.id,
          name: item.name,
          slug: item.slug,
          imageUrl: item.imageUrl,
          itemCount: item._count.items,
        })),
        promotionalItems: promotionalItems.map((item) =>
          this.mapMenuItem(item),
        ),
        faqs: faqs.data.items,
      },
      message: 'Home screen fetched successfully',
    };
  }

  private async getPublicContent(query: PublicRestaurantQueryDto) {
    const restaurant =
      await this.customerAppRepository.findRestaurantPublicContent(
        query.restaurantId,
      );

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    const branch = query.branchId
      ? await this.customerAppRepository.findBranchPublicContent(
          query.branchId,
          restaurant.id,
        )
      : null;

    if (query.branchId && !branch) {
      throw new NotFoundException('Branch not found');
    }

    return { restaurant, branch };
  }

  private async resolveCustomer(
    user: AuthUserContext,
    requestedCustomerId?: string,
  ) {
    if (user.role === UserRoleEnum.CUSTOMER) {
      if (requestedCustomerId && requestedCustomerId !== user.uid) {
        throw new BadRequestException(
          'Customers can only manage their own favorites',
        );
      }

      const customer = await this.customerAppRepository.findCustomerProfile(
        user.uid,
      );
      if (!customer || customer.deletedAt) {
        throw new NotFoundException('Customer not found');
      }

      return customer;
    }

    if (!requestedCustomerId) {
      throw new BadRequestException(
        'customerId is required when managing favorites on behalf of a customer',
      );
    }

    if (!user.tid) {
      throw new ForbiddenException('Tenant context is required');
    }

    if (!user.rid) {
      throw new ForbiddenException('Restaurant context is required');
    }

    const activeCustomer = await this.customerAppRepository.findActiveCustomer(
      requestedCustomerId,
      user.tid,
      user.rid,
    );

    if (!activeCustomer) {
      throw new BadRequestException('Customer not found for this restaurant');
    }

    const customer = await this.customerAppRepository.findCustomerProfile(
      activeCustomer.id,
    );

    if (!customer || customer.deletedAt) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  private readFavoriteMenuItemIds(
    metadata: Prisma.JsonValue | null | undefined,
  ) {
    const root = this.asObject(metadata);
    const customerApp = this.asObject(root.customerApp);
    const ids = customerApp.favoriteMenuItemIds;

    if (!Array.isArray(ids)) {
      return [] as string[];
    }

    return ids.filter((item): item is string => typeof item === 'string');
  }

  private writeFavoriteMenuItemIds(
    metadata: Prisma.JsonValue | null | undefined,
    favoriteMenuItemIds: string[],
  ): Prisma.JsonObject {
    const root: FavoriteMetadataShape = this.asObject(metadata);
    const customerApp = this.asObject(root.customerApp);

    return {
      ...root,
      customerApp: {
        ...customerApp,
        favoriteMenuItemIds,
      },
    } as Prisma.JsonObject;
  }

  private mapMenuItem(item: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    imageUrl: string | null;
    basePrice: Prisma.Decimal;
    category: { id: string; name: string; imageUrl?: string | null };
    variations: Array<{
      id: string;
      name: string;
      price: Prisma.Decimal;
      isDefault: boolean;
    }>;
    branchOverrides?: Array<{
      priceOverride: Prisma.Decimal | null;
      isAvailable: boolean;
    }>;
  }) {
    const branchOverride = item.branchOverrides?.[0];

    return {
      id: item.id,
      name: item.name,
      slug: item.slug,
      description: item.description,
      imageUrl: item.imageUrl,
      basePrice: branchOverride?.priceOverride ?? item.basePrice,
      category: item.category,
      variations: item.variations,
      isAvailable: branchOverride?.isAvailable ?? true,
    };
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

  private readFaqs(source: unknown, paths: string[][]): FaqItem[] | null {
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

          const faq = item as { question?: unknown; answer?: unknown };
          if (
            typeof faq.question !== 'string' ||
            typeof faq.answer !== 'string' ||
            !faq.question.trim() ||
            !faq.answer.trim()
          ) {
            return null;
          }

          return {
            question: faq.question.trim(),
            answer: faq.answer.trim(),
          } satisfies FaqItem;
        })
        .filter((item): item is FaqItem => item !== null);

      return items;
    }

    return null;
  }

  private readPath(source: unknown, path: string[]): unknown {
    let current: unknown = source;

    for (const key of path) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return undefined;
      }

      current = (current as Record<string, unknown>)[key];
    }

    return current;
  }

  private asObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }
}
